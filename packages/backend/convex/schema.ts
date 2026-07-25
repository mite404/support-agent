import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { orderStatusValidator } from "./orderStatus";
import { outboxStatusValidator } from "./outboxStatus";
import { ticketStatusValidator } from "./ticketStatus";

export default defineSchema({
  orders: defineTable({
    customerId: v.string(),
    orderNumber: v.string(),
    status: orderStatusValidator,
    updatedAt: v.number(),
    // Scoping lives in the index, not in a post-lookup check: an order number
    // is only unique *within* a customer, so a lookup keyed on the pair can
    // never match two rows. Querying on `orderNumber` alone would throw the
    // moment two customers shared a number.
  }).index("by_customerId_and_orderNumber", ["customerId", "orderNumber"]),

  tickets: defineTable({
    conversationKey: v.string(),
    customerId: v.optional(v.string()),
    subject: v.string(),
    status: ticketStatusValidator,
    createdAt: v.number(),
  }).index("by_conversationKey", ["conversationKey"]),

  outbox: defineTable({
    conversationKey: v.string(),
    to: v.string(),
    body: v.string(),
    status: outboxStatusValidator,
    scheduledFor: v.number(),
  }).index("by_conversationKey", ["conversationKey"]),
});
