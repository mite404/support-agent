import { describe, expect, it } from "vitest";

import { api } from "@support-agent/backend/convex/_generated/api";
import { makeTools, named, recordedCalls } from "./tool-stubs";

// A hit row exactly as `orders.getStatusFor` returns it.
const shippedOrder = {
  orderNumber: "1234",
  status: "shipped",
  message: "Your order has shipped and is on its way.",
  updatedAt: 1_700_000_000_000,
} as const;

// Build just the lookup tool wired to a stubbed Convex client.
function makeLookupTool(id: string, queryResult: unknown) {
  const { lookupOrderStatus, query } = makeTools(id, queryResult, null);
  return { lookupOrderStatus, query };
}

describe("createSupportTools / composition", () => {
  it("exposes the tools in a stable order", () => {
    const { lookupOrderStatus, sendReply, createTicket, messageAHuman } = makeTools(
      "web:user_42",
      null,
      null,
    );

    expect([lookupOrderStatus.name, sendReply.name, createTicket.name, messageAHuman.name]).toEqual(
      ["lookup_order_status", "send_reply", "create_ticket", "message_a_human"],
    );
  });
});

describe("createSupportTools / lookup_order_status", () => {
  it("scopes the query to the closure id, not to the model input", async () => {
    const { lookupOrderStatus, query } = makeLookupTool("web:user_42", shippedOrder);

    await lookupOrderStatus.run({ input: { orderNumber: "1234" } });

    expect(recordedCalls(query)).toEqual([
      [named(api.orders.getStatusFor), { customerId: "web:user_42", orderNumber: "1234" }],
    ]);
  });

  it("maps a found order to a found:true result", async () => {
    const { lookupOrderStatus } = makeLookupTool("web:user_42", shippedOrder);

    const result = await lookupOrderStatus.run({
      input: { orderNumber: "1234" },
    });

    expect(result).toEqual({ found: true, ...shippedOrder });
  });

  it("maps a null miss to found:false without fabricating a status", async () => {
    const { lookupOrderStatus } = makeLookupTool("whatsapp:+15550001111", null);

    const result = await lookupOrderStatus.run({
      input: { orderNumber: "9999" },
    });

    expect(result).toEqual({ found: false });
  });
});

describe("createSupportTools / send_reply", () => {
  it("refuses to send from a non-WhatsApp lane and never touches the outbox", async () => {
    const { sendReply, mutation } = makeTools("web:user_42", null, "msg_1");

    await expect(sendReply.run({ input: { body: "hello from the web" } })).rejects.toThrow(
      /whatsapp/iu,
    );
    expect(recordedCalls(mutation)).toEqual([]);
  });

  it("enqueues to the outbox scoped to the closure id and returns the message id", async () => {
    const { sendReply, mutation } = makeTools("whatsapp:+15550001111", null, "outbox_7");

    const result = await sendReply.run({
      input: { body: "Your order has shipped." },
    });

    expect(recordedCalls(mutation)).toEqual([
      [
        named(api.outbox.enqueue),
        {
          conversationKey: "whatsapp:+15550001111",
          to: "whatsapp:+15550001111",
          body: "Your order has shipped.",
        },
      ],
    ]);
    expect(result).toEqual({ enqueued: true, messageId: "outbox_7" });
  });
});
