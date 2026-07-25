import type { Doc } from "./_generated/dataModel";

// One demo order, minus the fields the stage step supplies: Convex's system
// fields and the `customerId` scope. Deriving from `Doc<"orders">` means a
// schema change breaks this file at compile time instead of at seed time.
type DemoOrder = Omit<Doc<"orders">, "_id" | "_creationTime" | "customerId">;

/**
 * The customer the demo rows belong to when no scope is given. In this build a
 * conversation `id` *is* the customer scope, so it carries the `web:` lane
 * prefix the front end tags browser sessions with.
 */
export const DEMO_CUSTOMER_ID = "web:demo_customer";

/**
 * The demo orders, one per status so every branch of the status-to-sentence
 * mapping has a row behind it. Order `1234` is the one the scripted demo and
 * the agent evals ask for, so its `shipped` status is load-bearing.
 */
export const DEMO_ORDERS: readonly DemoOrder[] = [
  { orderNumber: "1234", status: "shipped", updatedAt: 1_700_000_000_000 },
  { orderNumber: "2345", status: "packed", updatedAt: 1_700_000_100_000 },
  { orderNumber: "3456", status: "delivered", updatedAt: 1_700_000_200_000 },
  { orderNumber: "4567", status: "cancelled", updatedAt: 1_700_000_300_000 },
];
