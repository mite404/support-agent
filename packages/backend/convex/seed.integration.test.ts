/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import { DEMO_CUSTOMER_ID, DEMO_ORDERS } from "./seedData";

const modules = import.meta.glob("./**/*.ts");

describe("seed.run", () => {
  // The demo's whole script in one assertion: the same data that `npx convex
  // run seed:run` stages into the dev deployment, read back through the query
  // the agent's tool actually calls. If either half drifts, this fails before
  // anyone gets to the browser.
  test("stages the demo orders where getStatusFor can find them", async () => {
    const t = convexTest(schema, modules);

    const staged = await t.mutation(internal.seed.run, {});

    expect(staged).toBe(DEMO_ORDERS.length);
    const result = await t.query(api.orders.getStatusFor, {
      customerId: DEMO_CUSTOMER_ID,
      orderNumber: "1234",
    });
    expect(result?.status).toBe("shipped");
    expect(result?.message).toBe("Your order has shipped and is on its way.");
  });

  // Seeding twice is the normal case - you re-run it whenever the demo data
  // looks stale. Duplicate rows would make `getStatusFor` throw inside
  // `.unique()`, so the upsert is what keeps a second run from breaking the
  // demo it was meant to fix.
  test("is safe to re-run: it patches rather than duplicating", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.seed.run, {});
    await t.mutation(internal.seed.run, {});

    // Unbounded `.collect()` on purpose: counting *every* row is the assertion,
    // and the in-memory table holds only the handful of rows seeded above.
    const rows = await t.run((ctx) => ctx.db.query("orders").collect());
    expect(rows).toHaveLength(DEMO_ORDERS.length);

    const result = await t.query(api.orders.getStatusFor, {
      customerId: DEMO_CUSTOMER_ID,
      orderNumber: "1234",
    });
    expect(result?.status).toBe("shipped");
  });

  // The override the live demo depends on: a signed-in browser session's scope
  // is `web:<userId>` from Better Auth, which nothing can know at authoring
  // time, so the rows have to be stageable under an id supplied at run time.
  test("stages under a caller-supplied customer scope", async () => {
    const t = convexTest(schema, modules);
    const signedInScope = "web:user_from_better_auth";

    await t.mutation(internal.seed.run, { customerId: signedInScope });

    const forSignedIn = await t.query(api.orders.getStatusFor, {
      customerId: signedInScope,
      orderNumber: "1234",
    });
    const forDefault = await t.query(api.orders.getStatusFor, {
      customerId: DEMO_CUSTOMER_ID,
      orderNumber: "1234",
    });

    expect(forSignedIn?.status).toBe("shipped");
    expect(forDefault).toBeNull();
  });
});
