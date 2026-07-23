import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, mutation } from "./_generated/server";
import { scheduledDeliveryTime, UNDO_WINDOW_MS } from "./outboxStatus";

/**
 * Queue an outbound message and schedule its delivery for after the undo
 * window. Inserts a `pending` row and hands the actual send to
 * {@link deliver} +5s later; {@link cancel} can flip the row before then.
 */
export const enqueue = mutation({
  args: {
    conversationKey: v.string(),
    to: v.string(),
    body: v.string(),
  },
  returns: v.id("outbox"),
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("outbox", {
      conversationKey: args.conversationKey,
      to: args.to,
      body: args.body,
      status: "pending",
      scheduledFor: scheduledDeliveryTime(Date.now()),
    });
    await ctx.scheduler.runAfter(UNDO_WINDOW_MS, internal.outbox.deliver, {
      messageId,
    });
    return messageId;
  },
});

/**
 * Pull back a queued message inside the undo window by flipping it to
 * `cancelled`. A no-op if the message is already `sent` or `cancelled`, so a
 * late cancel can never un-send a delivered message.
 */
export const cancel = mutation({
  args: { messageId: v.id("outbox") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get("outbox", args.messageId);
    if (message && message.status === "pending") {
      await ctx.db.patch("outbox", args.messageId, { status: "cancelled" });
    }
    return null;
  },
});

/**
 * Deliver a queued message. Stub for now - the real Twilio send lands here in a
 * later phase. It runs +5s after enqueue, once the undo window has closed, and
 * will re-check the row is still `pending` before sending so a cancelled
 * message is never delivered.
 */
export const deliver = internalAction({
  args: { messageId: v.id("outbox") },
  returns: v.null(),
  handler: async () => {
    return null;
  },
});
