import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { orderStatusValidator } from "./orderStatus";

export default defineSchema({
  orders: defineTable({
    customerId: v.string(),
    orderNumber: v.string(),
    status: orderStatusValidator,
    updatedAt: v.number(),
  }).index("by_orderNumber", ["orderNumber"]),
});
