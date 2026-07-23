import { describe, expect, it, vi } from "vitest";

import { api } from "@support-agent/backend/convex/_generated/api";
import type { SupportConvexClient } from "../src/shared/support-tools";
import { createSupportTools } from "../src/shared/support-tools";

// A hit row exactly as `orders.getStatusFor` returns it.
const shippedOrder = {
  orderNumber: "1234",
  status: "shipped",
  message: "Your order has shipped and is on its way.",
  updatedAt: 1_700_000_000_000,
} as const;

/** Build the single tool under test wired to a stubbed Convex client. */
function makeLookupTool(id: string, queryResult: unknown) {
  const query = vi.fn().mockResolvedValue(queryResult);
  const client: SupportConvexClient = { query };
  const lookupOrderStatus = createSupportTools(id, client)[0];
  if (lookupOrderStatus === undefined) {
    throw new Error("expected createSupportTools to expose lookup_order_status");
  }
  return { lookupOrderStatus, query };
}

describe("createSupportTools / lookup_order_status", () => {
  it("scopes the query to the closure id, not to the model input", async () => {
    const { lookupOrderStatus, query } = makeLookupTool(
      "web:user_42",
      shippedOrder,
    );

    await lookupOrderStatus.run({ input: { orderNumber: "1234" } });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(api.orders.getStatusFor, {
      customerId: "web:user_42",
      orderNumber: "1234",
    });
  });

  it("maps a found order to a found:true result", async () => {
    const { lookupOrderStatus } = makeLookupTool("web:user_42", shippedOrder);

    const result = await lookupOrderStatus.run({
      input: { orderNumber: "1234" },
    });

    expect(result).toEqual({ found: true, ...shippedOrder });
  });

  it("maps a null miss to found:false without fabricating a status", async () => {
    const { lookupOrderStatus } = makeLookupTool("whatsapp:+15550001111", null);

    const result = await lookupOrderStatus.run({
      input: { orderNumber: "9999" },
    });

    expect(result).toEqual({ found: false });
  });
});
