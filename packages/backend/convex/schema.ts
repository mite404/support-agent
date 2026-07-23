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
  }).index("by_orderNumber", ["orderNumber"]),

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
