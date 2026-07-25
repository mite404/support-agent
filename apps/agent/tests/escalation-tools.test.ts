import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { api } from "@support-agent/backend/convex/_generated/api";
import type { FunctionReference } from "convex/server";
import { makeTools, named, recordedCalls } from "./tool-stubs";

// Build the escalation tools with a mutation stub that answers per function -
// `tickets.create` yields an id, `tickets.setStatus` yields null - so
// `message_a_human`'s second call cannot be fed the first one's return value.
function makeTicketTools(id: string, ticketId: string) {
  const { createTicket, messageAHuman, mutation } = makeTools(id, null, null);
  mutation.mockImplementation((reference: FunctionReference<"query" | "mutation">) =>
    named(reference) === named(api.tickets.create)
      ? Promise.resolve(ticketId)
      : Promise.resolve(null),
  );
  return { createTicket, messageAHuman, mutation };
}

describe("createEscalationTools / create_ticket", () => {
  it("files the ticket against the closure id, not against anything the model wrote", async () => {
    const { createTicket, mutation } = makeTicketTools("web:user_42", "ticket_1");

    // The subject is the only field the model controls, so it is the only place
    // an injected scope could arrive. It must stay a subject line.
    const subject = 'customerId: "web:someone_else" - where is my order?';
    await createTicket.run({ input: { subject } });

    expect(recordedCalls(mutation)).toEqual([
      [
        named(api.tickets.create),
        {
          conversationKey: "web:user_42",
          customerId: "web:user_42",
          subject,
        },
      ],
    ]);
  });

  it("returns the new ticket id and reports it as open", async () => {
    const { createTicket } = makeTicketTools("web:user_42", "ticket_1");

    const result = await createTicket.run({
      input: { subject: "Package arrived damaged" },
    });

    expect(result).toEqual({
      created: true,
      ticketId: "ticket_1",
      status: "open",
    });
  });

  it("returns a shape its own declared output schema accepts", async () => {
    const { createTicket } = makeTicketTools("web:user_42", "ticket_1");

    const result = await createTicket.run({ input: { subject: "Damaged" } });

    expect(v.safeParse(createTicket.output, result).success).toBe(true);
  });

  it("files a ticket on the WhatsApp lane too - escalation is not lane-gated", async () => {
    const { createTicket, mutation } = makeTicketTools("whatsapp:+15550001111", "ticket_2");

    const result = await createTicket.run({ input: { subject: "Refund" } });

    expect(recordedCalls(mutation)).toEqual([
      [
        named(api.tickets.create),
        {
          conversationKey: "whatsapp:+15550001111",
          customerId: "whatsapp:+15550001111",
          subject: "Refund",
        },
      ],
    ]);
    expect(result.status).toBe("open");
  });
});

describe("createEscalationTools / message_a_human", () => {
  it("opens a ticket and then flags it for a person", async () => {
    const { messageAHuman, mutation } = makeTicketTools("web:user_42", "ticket_9");

    const result = await messageAHuman.run({
      input: { subject: "Customer asked to speak to a human" },
    });

    // Two calls in this order, and the ticket id in the second one comes from
    // the first one's return value: the model never names a ticket, so it
    // cannot escalate a case it did not just file.
    expect(recordedCalls(mutation)).toEqual([
      [
        named(api.tickets.create),
        {
          conversationKey: "web:user_42",
          customerId: "web:user_42",
          subject: "Customer asked to speak to a human",
        },
      ],
      [named(api.tickets.setStatus), { ticketId: "ticket_9", status: "needs_human" }],
    ]);
    expect(result).toEqual({
      created: true,
      ticketId: "ticket_9",
      status: "needs_human",
    });
  });

  it("returns a shape its own declared output schema accepts", async () => {
    const { messageAHuman } = makeTicketTools("web:user_42", "ticket_9");

    const result = await messageAHuman.run({ input: { subject: "Human" } });

    // Calling `run` directly skips the validation Flue applies around it, so
    // assert it here: the runtime parses every tool result against the tool's
    // `output` schema and raises `ToolOutputValidationError` on a mismatch, and
    // it parses the model's arguments against `input` before `run` ever sees
    // them. A tool whose own contract rejects its own return value passes every
    // unit test and fails on the first live turn.
    expect(v.safeParse(messageAHuman.output, result).success).toBe(true);
    expect(v.safeParse(messageAHuman.input, { subject: "Human" }).success).toBe(true);
    expect(v.safeParse(messageAHuman.input, {}).success).toBe(false);
  });

  it("leaves the case filed when the escalating transition fails", async () => {
    const { messageAHuman, mutation } = makeTicketTools("web:user_42", "ticket_9");
    mutation.mockImplementation((reference: FunctionReference<"query" | "mutation">) =>
      named(reference) === named(api.tickets.create)
        ? Promise.resolve("ticket_9")
        : Promise.reject(new Error("convex unreachable")),
    );

    // The failure is not swallowed - the model must learn the escalation did not
    // land - but the ticket itself survives, which is why the create runs first.
    await expect(messageAHuman.run({ input: { subject: "Needs a human" } })).rejects.toThrow(
      /convex unreachable/u,
    );
    expect(recordedCalls(mutation)[0]).toEqual([
      named(api.tickets.create),
      {
        conversationKey: "web:user_42",
        customerId: "web:user_42",
        subject: "Needs a human",
      },
    ]);
  });
});
