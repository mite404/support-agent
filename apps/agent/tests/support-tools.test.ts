import { describe, expect, it, vi } from "vitest";

import { api } from "@support-agent/backend/convex/_generated/api";
import type { SupportConvexClient } from "../src/shared/support-tools";
import { createSupportTools } from "../src/shared/support-tools";

// A hit row exactly as `orders.getStatusFor` returns it.
const shippedOrder = {
  orderNumber: "1234",
  status: "shipped",
  message: "Your order has shipped and is on its way.",
  updatedAt: 1_700_000_000_000,
} as const;

// Build both tools wired to stubbed Convex query + mutation. Destructuring the
// factory's tuple keeps each tool's `run` input shape distinct, so calling
// `run` typechecks against that tool's own schema.
function makeTools(id: string, queryResult: unknown, mutationResult: unknown) {
  const query = vi.fn().mockResolvedValue(queryResult);
  const mutation = vi.fn().mockResolvedValue(mutationResult);
  const client: SupportConvexClient = { query, mutation };
  const [lookupOrderStatus, sendReply] = createSupportTools(id, client);
  return { lookupOrderStatus, sendReply, query, mutation };
}

/** Build just the lookup tool wired to a stubbed Convex client. */
function makeLookupTool(id: string, queryResult: unknown) {
  const { lookupOrderStatus, query } = makeTools(id, queryResult, null);
  return { lookupOrderStatus, query };
}

describe("createSupportTools / lookup_order_status", () => {
  it("scopes the query to the closure id, not to the model input", async () => {
    const { lookupOrderStatus, query } = makeLookupTool(
      "web:user_42",
      shippedOrder,
    );

    await lookupOrderStatus.run({ input: { orderNumber: "1234" } });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(api.orders.getStatusFor, {
      customerId: "web:user_42",
      orderNumber: "1234",
    });
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
  it("exposes the two tools in a stable order", () => {
    const { lookupOrderStatus, sendReply } = makeTools("web:user_42", null, null);

    expect(lookupOrderStatus.name).toBe("lookup_order_status");
    expect(sendReply.name).toBe("send_reply");
  });

  it("refuses to send from a non-WhatsApp lane and never touches the outbox", async () => {
    const { sendReply, mutation } = makeTools("web:user_42", null, "msg_1");

    await expect(
      sendReply.run({ input: { body: "hello from the web" } }),
    ).rejects.toThrow(/whatsapp/iu);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("enqueues to the outbox scoped to the closure id and returns the message id", async () => {
    const { sendReply, mutation } = makeTools(
      "whatsapp:+15550001111",
      null,
      "outbox_7",
    );

    const result = await sendReply.run({
      input: { body: "Your order has shipped." },
    });

    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation).toHaveBeenCalledWith(api.outbox.enqueue, {
      conversationKey: "whatsapp:+15550001111",
      to: "whatsapp:+15550001111",
      body: "Your order has shipped.",
    });
    expect(result).toEqual({ enqueued: true, messageId: "outbox_7" });
  });
});
