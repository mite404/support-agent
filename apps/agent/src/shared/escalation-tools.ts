import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { api } from "@support-agent/backend/convex/_generated/api";
import type { FunctionArgs, FunctionReturnType } from "convex/server";

// The ticket mutations these tools call, with their argument and result shapes
// derived from the function references so this file never restates - and so
// cannot drift from - the real ones.
type TicketCreateArgs = FunctionArgs<typeof api.tickets.create>;
type TicketCreateResult = FunctionReturnType<typeof api.tickets.create>;
type TicketSetStatusArgs = FunctionArgs<typeof api.tickets.setStatus>;
type TicketSetStatusResult = FunctionReturnType<typeof api.tickets.setStatus>;

// The ticket lifecycle values, taken from the mutation that accepts them rather
// than re-listed here, so a new status in the backend reaches this file as a
// type error instead of as a silently stale literal.
type TicketStatus = TicketSetStatusArgs["status"];

// The status a fresh ticket holds: `tickets.create` always inserts `open`.
const TICKET_OPEN = "open" as const satisfies TicketStatus;

// The status that pulls a person in. `satisfies` keeps the literal type (so the
// tool's output schema stays precise) while still checking the string against
// the backend's own union.
const TICKET_NEEDS_HUMAN = "needs_human" as const satisfies TicketStatus;

/**
 * The slice of `ConvexHttpClient` the escalation tools depend on: the two
 * `tickets` mutations they call. Each is its own overload rather than one
 * widened signature, so passing the wrong argument shape for a given function
 * reference is a type error at the call site. {@link SupportConvexClient}
 * intersects this with the order and outbox slices.
 */
export type EscalationConvexClient = {
  mutation(
    reference: typeof api.tickets.create,
    args: TicketCreateArgs,
  ): Promise<TicketCreateResult>;
  mutation(
    reference: typeof api.tickets.setStatus,
    args: TicketSetStatusArgs,
  ): Promise<TicketSetStatusResult>;
};

// What the model passes to open a ticket or to pull in a human: one line saying
// what the case is about. Deliberately no customer, conversation, or ticket id -
// all three come from the closure, so the model can describe a case but can
// never name whose case it is or reach a ticket it did not just create.
const ticketInput = v.object({
  subject: v.string(),
});

// What `create_ticket` hands back: the new row's id, so a later turn can refer
// to the case, plus the status it now holds. `status` is a literal rather than
// the whole picklist because each tool leaves the ticket in exactly one state,
// and telling the model which one is what stops it guessing.
const createTicketOutput = v.object({
  created: v.literal(true),
  ticketId: v.string(),
  status: v.literal(TICKET_OPEN),
});

/** The shape `create_ticket` resolves to once a case is logged. */
export type CreateTicketOutput = v.InferOutput<typeof createTicketOutput>;

// What `message_a_human` hands back. Same row, one state further on: reaching
// this shape means the ticket exists AND is flagged for a person.
const messageAHumanOutput = v.object({
  created: v.literal(true),
  ticketId: v.string(),
  status: v.literal(TICKET_NEEDS_HUMAN),
});

/** The shape `message_a_human` resolves to once a person has been pulled in. */
export type MessageAHumanOutput = v.InferOutput<typeof messageAHumanOutput>;

/**
 * Build the escalation tools bound to one conversation. As with every support
 * tool, `id` is both the conversation key and the authorization boundary: the
 * ticket is filed against it inside `run`, never against anything the model
 * wrote, and the model is given no way to name a ticket - so a session can only
 * ever touch the case it has just filed itself.
 *
 * Neither tool is lane-gated. A case is worth logging wherever the customer
 * raised it, unlike `send_reply`, which can only be correct on WhatsApp.
 *
 * @param id - the conversation key, e.g. `web:<userId>` or `whatsapp:+1...`.
 * @param client - Convex client the ticket mutations go through.
 * @returns the escalation tool definitions, positionally typed.
 */
export function createEscalationTools(id: string, client: EscalationConvexClient) {
  const createTicket = defineTool({
    name: "create_ticket",
    description:
      "Open a support ticket for this conversation when the customer's problem cannot be answered with your other tools. The support team works it asynchronously; tell the customer it is logged and give them the ticket id. Do not open a second ticket for a case you have already logged.",
    input: ticketInput,
    output: createTicketOutput,
    run: async ({ input }): Promise<CreateTicketOutput> => {
      // Both scope fields are the closure `id`: in this build the customer scope
      // IS the conversation key, exactly as `send_reply` treats it, so a ticket
      // can only ever be filed against the conversation that asked for it.
      const ticketId = await client.mutation(api.tickets.create, {
        conversationKey: id,
        customerId: id,
        subject: input.subject,
      });
      return { created: true, ticketId, status: TICKET_OPEN };
    },
  });

  const messageAHuman = defineTool({
    name: "message_a_human",
    description:
      "Escalate to a human teammate: opens a ticket for this conversation and flags it for a person to pick up. Use it when the customer asks for a human, when they are upset, or when the case needs a decision you are not able to make. Summarize the problem in the subject so the teammate does not have to reread the conversation.",
    input: ticketInput,
    output: messageAHumanOutput,
    run: async ({ input }): Promise<MessageAHumanOutput> => {
      // Escalation is create-then-transition rather than its own mutation:
      // `tickets.create` always opens a row as `open`, and `needs_human` is the
      // flag a person watches for. Ordered this way the failure mode is benign -
      // if the transition never lands the case still exists as an open ticket,
      // where the reverse order would have nothing to move.
      const ticketId = await client.mutation(api.tickets.create, {
        conversationKey: id,
        customerId: id,
        subject: input.subject,
      });
      await client.mutation(api.tickets.setStatus, {
        ticketId,
        status: TICKET_NEEDS_HUMAN,
      });
      return { created: true, ticketId, status: TICKET_NEEDS_HUMAN };
    },
  });

  // A tuple (not a widened array) so each position keeps its own tool type when
  // `createSupportTools` splices these into the conversation's tool list.
  const tools: [typeof createTicket, typeof messageAHuman] = [createTicket, messageAHuman];
  return tools;
}
