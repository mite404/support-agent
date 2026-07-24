/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import { UNDO_WINDOW_MS } from "./outboxStatus";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Outbound lives on the WhatsApp lane, so the conversation id is a phone address.
const CONVERSATION = "whatsapp:+15550001111";

describe("outbox.enqueue", () => {
  test("inserts a pending row scheduled one undo window out", async () => {
    const t = convexTest(schema, modules);

    const before = Date.now();
    const messageId = await t.mutation(api.outbox.enqueue, {
      conversationKey: CONVERSATION,
      to: CONVERSATION,
      body: "Your order has shipped.",
    });

    const row = await t.run((ctx) => ctx.db.get("outbox", messageId));
    expect(row?.status).toBe("pending");
    expect(row?.body).toBe("Your order has shipped.");
    // Delivery is scheduled for at least one undo window after enqueue, so a
    // cancel has that whole window to land first.
    expect(row?.scheduledFor).toBeGreaterThanOrEqual(before + UNDO_WINDOW_MS);

    // Assert the durable delivery was actually scheduled, not just recorded in
    // the row. `scheduledFor` is a stored column the handler sets; without this
    // check a change that dropped `ctx.scheduler.runAfter(..., deliver)` would
    // leave the row looking correct while no message ever delivers.
    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.name).toMatch(/deliver/u);
    expect(scheduled[0]?.args).toEqual([{ messageId }]);
  });
});

describe("outbox.cancel", () => {
  test("flips a pending message to cancelled inside the window", async () => {
    const t = convexTest(schema, modules);
    const messageId = await t.mutation(api.outbox.enqueue, {
      conversationKey: CONVERSATION,
      to: CONVERSATION,
      body: "cancel me",
    });

    await t.mutation(api.outbox.cancel, { messageId });

    const row = await t.run((ctx) => ctx.db.get("outbox", messageId));
    expect(row?.status).toBe("cancelled");
  });

  // The undo guarantee only holds if a cancel arriving after delivery is a
  // no-op: a late cancel must never rewrite a message that already went out.
  test("cannot un-send a message that already delivered", async () => {
    const t = convexTest(schema, modules);
    const messageId = await t.mutation(api.outbox.enqueue, {
      conversationKey: CONVERSATION,
      to: CONVERSATION,
      body: "already gone",
    });
    // Simulate delivery having fired before the cancel arrives.
    await t.run(async (ctx) => {
      await ctx.db.patch("outbox", messageId, { status: "sent" });
    });

    await t.mutation(api.outbox.cancel, { messageId });

    const row = await t.run((ctx) => ctx.db.get("outbox", messageId));
    expect(row?.status).toBe("sent");
  });
});
