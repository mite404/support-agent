/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

// convex-test discovers function modules from this glob. It must live inside
// `convex/` so the map keys (`./orders.ts`) match the paths Convex uses to
// resolve `api.orders.getStatusFor`; a `../convex/**` glob from `tests/` would
// not match.
const modules = import.meta.glob("./**/*.ts");

// The conversation id doubles as the customer scope in this build, so two
// distinct ids stand in for two different customers.
const CUSTOMER_A = "web:user_a";
const CUSTOMER_B = "web:user_b";

// Seed one shipped order owned by `customerId`. The tests only need it present
// in the table, so nothing is returned.
async function seedShippedOrder(t: TestConvex<typeof schema>, customerId: string): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("orders", {
      customerId,
      orderNumber: "1234",
      status: "shipped",
      updatedAt: 1_700_000_000_000,
    });
  });
}

describe("orders.getStatusFor", () => {
  test("returns the described order for its own customer", async () => {
    const t = convexTest(schema, modules);
    await seedShippedOrder(t, CUSTOMER_A);

    const result = await t.query(api.orders.getStatusFor, {
      customerId: CUSTOMER_A,
      orderNumber: "1234",
    });

    expect(result).toEqual({
      orderNumber: "1234",
      status: "shipped",
      message: "Your order has shipped and is on its way.",
      updatedAt: 1_700_000_000_000,
    });
  });

  test("returns null for an order number this customer does not have", async () => {
    const t = convexTest(schema, modules);
    await seedShippedOrder(t, CUSTOMER_A);

    const result = await t.query(api.orders.getStatusFor, {
      customerId: CUSTOMER_A,
      orderNumber: "9999",
    });

    expect(result).toBeNull();
  });

  // The load-bearing assertion: the scoping guard in the handler, exercised
  // against a real row for the first time. If the guard regressed to returning
  // any matching order, this leaks customer A's order to customer B.
  test("refuses to leak another customer's order (the scoping boundary)", async () => {
    const t = convexTest(schema, modules);
    await seedShippedOrder(t, CUSTOMER_A);

    const result = await t.query(api.orders.getStatusFor, {
      customerId: CUSTOMER_B,
      orderNumber: "1234",
    });

    expect(result).toBeNull();
  });
});
