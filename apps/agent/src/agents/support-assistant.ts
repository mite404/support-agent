import { defineAgent } from "@flue/runtime";
import type { AgentRouteHandler } from "@flue/runtime";

import { createSupportTools } from "../shared/support-tools";

/** Human-facing description collected into the deployment manifest at build time. */
export const description =
  "E-commerce customer support agent. Looks up order status and, on the WhatsApp lane, sends guarded replies.";

// The one model both doors share. Support is high-volume and latency-sensitive,
// and the load-bearing correctness lives in the validated tool boundary (not in
// model cleverness), so the small, fast model is the right default here.
const SUPPORT_MODEL = "anthropic/claude-haiku-4-5";

// The agent's whole personality and its guardrails. The anti-fabrication rule is
// the load-bearing line: `lookup_order_status` answers `found:false` for an order
// this customer does not own, and the model must relay that plainly rather than
// invent a status - the same trust boundary the guarded `send_reply` embodies.
const SUPPORT_INSTRUCTIONS = [
  "You are a customer support assistant for an online store.",
  "Help each customer understand and resolve questions about their orders.",
  "Use lookup_order_status to answer any question about where an order is; never state or guess an order's status without looking it up.",
  "When a lookup returns found:false, tell the customer plainly that you could not find that order on their account. Never invent an order number, a status, or a delivery date.",
  "Only send an outbound reply with send_reply when the conversation is on WhatsApp; it is unavailable elsewhere and refusing is correct.",
  "Be concise, warm, and specific. If a request is outside what your tools can do, say so instead of guessing.",
].join("\n");

// The `id` prefix that marks the web lane. The HTTP `route` door serves only this
// lane: a browser session's `id` is `web:<userId>`, authorized by the front end.
// The WhatsApp lane never arrives over this route - it is dispatched in from the
// Twilio channel - so an inbound HTTP request for a `whatsapp:` id is not a real
// caller and is refused.
const WEB_LANE_PREFIX = "web:";

/**
 * Whether an agent instance `id` may be reached over the public HTTP route.
 *
 * The HTTP door is the web lane only; the WhatsApp lane reaches the same agent
 * through the Twilio channel's `dispatch`, not this route. Pure decision, so the
 * boundary is unit-tested directly without standing up an HTTP context.
 *
 * @param id - the agent instance id from the request path, e.g. `web:user_42`.
 * @returns `true` when `id` is on the web lane and the request may proceed.
 */
export function isHttpLaneAuthorized(id: string | undefined): boolean {
  return id !== undefined && id.startsWith(WEB_LANE_PREFIX);
}

/**
 * Guards direct HTTP access to an agent instance at
 * `POST/GET /agents/support-assistant/:id`. Only the web lane is served here;
 * any other `id` is treated as not found so the route never confirms which ids
 * exist. Per-user ownership (that this `web:` id belongs to the authenticated
 * caller) is enforced by the web front end that mints the id.
 */
export const route: AgentRouteHandler = async (c, next) => {
  if (!isHttpLaneAuthorized(c.req.param("id"))) {
    return c.notFound();
  }
  await next();
};

export default defineAgent(({ id }) => ({
  description,
  model: SUPPORT_MODEL,
  instructions: SUPPORT_INSTRUCTIONS,
  tools: createSupportTools(id),
}));
