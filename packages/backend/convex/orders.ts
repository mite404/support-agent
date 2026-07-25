import { v } from "convex/values";

import { query } from "./_generated/server";
import { describeOrderStatus, orderStatusValidator } from "./orderStatus";

// Shape returned to the caller: the raw status plus the customer-facing
// sentence, or null when the order does not exist or is not the caller's.
const orderStatusResult = v.union(
  v.null(),
  v.object({
    orderNumber: v.string(),
    status: orderStatusValidator,
    message: v.string(),
    updatedAt: v.number(),
  }),
);

/**
 * Look up one order by its number, scoped to the calling customer. Returns
 * `null` for an unknown order or one owned by a different customer - a clean
 * miss the agent can report without fabricating a status.
 *
 * The scope is enforced by the index rather than by filtering after the fact,
 * so two customers holding the same order number resolve to one row each
 * instead of colliding.
 *
 * `customerId` is the caller's scope, derived from the conversation `id` inside
 * the tool that invokes this query; it is a lookup filter, not the sole trust
 * boundary (the agent process holds that).
 */
export const getStatusFor = query({
  args: {
    customerId: v.string(),
    orderNumber: v.string(),
  },
  returns: orderStatusResult,
  handler: async (ctx, args) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_customerId_and_orderNumber", (q) =>
        q.eq("customerId", args.customerId).eq("orderNumber", args.orderNumber),
      )
      .unique();

    if (!order) {
      return null;
    }

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      message: describeOrderStatus(order.status),
      updatedAt: order.updatedAt,
    };
  },
});
