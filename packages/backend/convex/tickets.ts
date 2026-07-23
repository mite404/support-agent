import { v } from "convex/values";

import { mutation } from "./_generated/server";
import { ticketStatusValidator } from "./ticketStatus";

/**
 * Open a support ticket for one conversation. Starts in `open`; escalation to a
 * human and resolution both move it via {@link setStatus}.
 */
export const create = mutation({
  args: {
    conversationKey: v.string(),
    customerId: v.optional(v.string()),
    subject: v.string(),
  },
  returns: v.id("tickets"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("tickets", {
      conversationKey: args.conversationKey,
      customerId: args.customerId,
      subject: args.subject,
      status: "open",
      createdAt: Date.now(),
    });
  },
});

/**
 * Move a ticket to a new status - e.g. `needs_human` when the agent escalates,
 * or `resolved` when the case closes.
 */
export const setStatus = mutation({
  args: {
    ticketId: v.id("tickets"),
    status: ticketStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("tickets", args.ticketId, { status: args.status });
    return null;
  },
});
