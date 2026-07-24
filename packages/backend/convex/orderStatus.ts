import { v } from "convex/values";

/**
 * The lifecycle an order moves through: packed -> shipped -> delivered, with
 * cancelled as a terminal off-ramp. Single source of truth for both the schema
 * validator and the customer-facing copy below.
 */
export const ORDER_STATUSES = [
  "packed",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Convex validator for an order's `status` field, derived from {@link ORDER_STATUSES}. */
export const orderStatusValidator = v.union(
  v.literal("packed"),
  v.literal("shipped"),
  v.literal("delivered"),
  v.literal("cancelled"),
);

// Customer-facing phrasing for each status. Kept as data so the mapping is a
// pure lookup, exhaustively keyed by OrderStatus (a missing key fails to compile).
const STATUS_MESSAGES: Record<OrderStatus, string> = {
  packed: "Your order is packed and getting ready to ship.",
  shipped: "Your order has shipped and is on its way.",
  delivered: "Your order has been delivered.",
  cancelled: "Your order has been cancelled.",
};

/**
 * Turn a raw order status into the sentence the agent reads back to a customer.
 * Pure calculation - no I/O - so it can be unit-tested without a Convex runtime.
 */
export function describeOrderStatus(status: OrderStatus): string {
  return STATUS_MESSAGES[status];
}
