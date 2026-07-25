import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { DEMO_CUSTOMER_ID, DEMO_ORDERS } from "./seedData";

/**
 * Stage the demo rows from {@link DEMO_ORDERS} under one customer scope.
 *
 * Internal so a public client can never seed a deployment; run it by hand with
 * `npx convex run seed:run`. Re-running is safe - each order is matched on
 * `(customerId, orderNumber)` and patched rather than duplicated, so a second
 * run cannot leave two rows behind for `orders.getStatusFor` to trip over.
 *
 * @param customerId - the scope to stage under, e.g. `web:<your-user-id>` so a
 * signed-in browser session sees the rows. Defaults to {@link DEMO_CUSTOMER_ID}.
 * @returns how many orders are now staged, so the CLI prints a confirmation.
 */
export const run = internalMutation({
  args: { customerId: v.optional(v.string()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const customerId = args.customerId ?? DEMO_CUSTOMER_ID;

    for (const order of DEMO_ORDERS) {
      const existing = await ctx.db
        .query("orders")
        .withIndex("by_customerId_and_orderNumber", (q) =>
          q.eq("customerId", customerId).eq("orderNumber", order.orderNumber),
        )
        .unique();

      if (existing) {
        await ctx.db.patch("orders", existing._id, order);
      } else {
        await ctx.db.insert("orders", { customerId, ...order });
      }
    }

    return DEMO_ORDERS.length;
  },
});
