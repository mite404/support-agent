import { defineTool } from "@flue/runtime";
import { ConvexHttpClient } from "convex/browser";
import * as v from "valibot";

import { api } from "@support-agent/backend/convex/_generated/api";
import { ORDER_STATUSES } from "@support-agent/backend/convex/orderStatus";
import type { FunctionArgs, FunctionReturnType } from "convex/server";

// The one order-lookup query the tools call, plus the row it returns. Both are
// derived from the Convex function reference so this file never restates - and
// so cannot drift from - the query's real argument and return shapes.
type OrderStatusQueryArgs = FunctionArgs<typeof api.orders.getStatusFor>;
type OrderStatusRow = NonNullable<
  FunctionReturnType<typeof api.orders.getStatusFor>
>;

/**
 * The slice of `ConvexHttpClient` the support tools depend on: a single `query`
 * specialized to `orders.getStatusFor`. Narrowing the seam here (instead of
 * taking the whole client) keeps it small enough to satisfy with a plain object
 * stub in a unit test, while the real `ConvexHttpClient` - whose `query` is
 * generic - still assigns to it.
 */
export type SupportConvexClient = {
  query(
    reference: typeof api.orders.getStatusFor,
    args: OrderStatusQueryArgs,
  ): Promise<OrderStatusRow | null>;
};

// What the model passes in: just the order number. Deliberately no customer
// field - the caller's identity comes from the closure, never the model.
const lookupOrderStatusInput = v.object({
  orderNumber: v.string(),
});

// What the tool hands back. `found: false` is the explicit "no such order for
// you" answer: the anti-fabrication signal that lets the model report a clean
// miss instead of inventing a status. A hit carries the customer-facing
// sentence alongside the raw fields.
const lookupOrderStatusOutput = v.union([
  v.object({ found: v.literal(false) }),
  v.object({
    found: v.literal(true),
    orderNumber: v.string(),
    status: v.picklist(ORDER_STATUSES),
    message: v.string(),
    updatedAt: v.number(),
  }),
]);

/** The shape `lookup_order_status` resolves to - a miss or a fully described order. */
export type LookupOrderStatusOutput = v.InferOutput<
  typeof lookupOrderStatusOutput
>;

// Process-wide Convex client the tools close over. Held lazily so importing this
// module (e.g. a unit test that injects its own stub) never needs a live URL.
let sharedConvexClient: ConvexHttpClient | undefined;

/**
 * The one Convex client every conversation's tools share. Constructed on first
 * use from the deployment URL in the environment.
 *
 * @returns the process-wide {@link ConvexHttpClient}.
 * @throws if neither `CONVEX_URL` nor `NEXT_PUBLIC_CONVEX_URL` is set.
 */
function moduleConvexClient(): ConvexHttpClient {
  if (sharedConvexClient === undefined) {
    const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
    if (url === undefined || url === "") {
      throw new Error(
        "CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL) must be set for the support agent to reach Convex.",
      );
    }
    sharedConvexClient = new ConvexHttpClient(url);
  }
  return sharedConvexClient;
}

// Fold the query result into the tool's output shape: `null` (unknown order, or
// one owned by another customer) becomes the explicit `found: false` miss. Pure
// calculation - no I/O - so the mapping is exercised by unit tests directly.
function toLookupOrderStatusOutput(
  row: OrderStatusRow | null,
): LookupOrderStatusOutput {
  if (row === null) {
    return { found: false };
  }
  return { found: true, ...row };
}

/**
 * Build the support tools bound to one conversation. `id` is the conversation
 * key AND the authorization boundary: each tool derives the customer scope from
 * it inside `run`, never from the model-supplied input, so a session can only
 * ever read its own customer's data. Tools reach Convex through the closed-over
 * `client` because Flue's `ToolContext` carries no data handle.
 *
 * In this build the customer scope IS the conversation `id` (e.g.
 * `web:<userId>` or `whatsapp:+1...`); the two channel lanes are never merged
 * into one scope. Resolving `id` to a shared customer record is a later,
 * context-only step and does not change this boundary.
 *
 * @param id - the conversation key, e.g. `web:<userId>` or `whatsapp:+1...`.
 * @param client - Convex client to query through; defaults to the process-wide one.
 * @returns the tool definitions this conversation exposes to the model.
 */
export function createSupportTools(
  id: string,
  client: SupportConvexClient = moduleConvexClient(),
) {
  const lookupOrderStatus = defineTool({
    name: "lookup_order_status",
    description:
      "Look up the status of one order by its order number, scoped to the current customer. Returns found:false when there is no such order for this customer - report that plainly and never invent a status.",
    input: lookupOrderStatusInput,
    output: lookupOrderStatusOutput,
    run: async ({ input }) => {
      const row = await client.query(api.orders.getStatusFor, {
        customerId: id,
        orderNumber: input.orderNumber,
      });
      return toLookupOrderStatusOutput(row);
    },
  });

  return [lookupOrderStatus];
}
