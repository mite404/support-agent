import { defineTool } from "@flue/runtime";
import { ConvexHttpClient } from "convex/browser";
import * as v from "valibot";

import { api } from "@support-agent/backend/convex/_generated/api";
import { ORDER_STATUSES } from "@support-agent/backend/convex/orderStatus";
import type { FunctionArgs, FunctionReturnType } from "convex/server";

// The Convex functions the tools call, each with its argument and result shapes
// derived from the function reference so this file never restates - and so
// cannot drift from - the real argument and return shapes.
type OrderStatusQueryArgs = FunctionArgs<typeof api.orders.getStatusFor>;
type OrderStatusRow = NonNullable<
  FunctionReturnType<typeof api.orders.getStatusFor>
>;
type EnqueueMutationArgs = FunctionArgs<typeof api.outbox.enqueue>;
type EnqueueMutationResult = FunctionReturnType<typeof api.outbox.enqueue>;

/**
 * The slice of `ConvexHttpClient` the support tools depend on: the one `query`
 * (`orders.getStatusFor`) and the one `mutation` (`outbox.enqueue`) they call.
 * Narrowing the seam here (instead of taking the whole client) keeps it small
 * enough to satisfy with a plain object stub in a unit test, while the real
 * `ConvexHttpClient` - whose methods are generic - still assigns to it.
 */
export type SupportConvexClient = {
  query(
    reference: typeof api.orders.getStatusFor,
    args: OrderStatusQueryArgs,
  ): Promise<OrderStatusRow | null>;
  mutation(
    reference: typeof api.outbox.enqueue,
    args: EnqueueMutationArgs,
  ): Promise<EnqueueMutationResult>;
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

// The `id` prefix that marks the WhatsApp lane. `send_reply` sends outbound
// text and must fire only here: a `web:` session must never text a phone, so
// the tool gates on this prefix inside `run` before it touches the outbox.
const WHATSAPP_LANE_PREFIX = "whatsapp:";

// What the model passes to send a reply: just the message text. The recipient
// and conversation are the closure `id`, never model input - the model can only
// choose the words, not who they reach.
const sendReplyInput = v.object({
  body: v.string(),
});

// What `send_reply` hands back: the queued message's id, so a follow-up cancel
// can pull it within the undo window. Reaching this shape at all means the
// message was enqueued - the lane gate throws instead of returning on refusal.
const sendReplyOutput = v.object({
  enqueued: v.literal(true),
  messageId: v.string(),
});

/** The shape `send_reply` resolves to once a reply is queued for delivery. */
export type SendReplyOutput = v.InferOutput<typeof sendReplyOutput>;

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
 * `send_reply` is further lane-gated: it derives the WhatsApp recipient from
 * `id` and refuses (throws) unless `id` is on the `whatsapp:` lane, so a web
 * session can never text a phone.
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

  const sendReply = defineTool({
    name: "send_reply",
    description:
      "Send an outbound text reply to the customer on WhatsApp. Only available in a WhatsApp conversation; the message is delivered after a 5 second undo window.",
    input: sendReplyInput,
    output: sendReplyOutput,
    run: async ({ input }): Promise<SendReplyOutput> => {
      // Lane gate: authorization lives in `run`, not the schema. A browser
      // session (`web:...`) must never text a phone, so refuse before any I/O.
      if (!id.startsWith(WHATSAPP_LANE_PREFIX)) {
        throw new Error(
          `send_reply is only available on the WhatsApp lane; refusing to send from "${id}".`,
        );
      }
      // Enqueue rather than send: the message waits out a durable 5s undo
      // window in Convex (survives restarts) before delivery. The recipient and
      // conversation are the closure `id` - the WhatsApp lane's `id` is already
      // the Twilio `whatsapp:+1...` address.
      const messageId = await client.mutation(api.outbox.enqueue, {
        conversationKey: id,
        to: id,
        body: input.body,
      });
      return { enqueued: true, messageId };
    },
  });

  // A tuple (not a widened array) so each position keeps its own tool type -
  // callers and tests see `lookup_order_status`'s input shape distinctly from
  // `send_reply`'s, instead of a union that collapses both `run` signatures.
  const tools: [typeof lookupOrderStatus, typeof sendReply] = [
    lookupOrderStatus,
    sendReply,
  ];
  return tools;
}
