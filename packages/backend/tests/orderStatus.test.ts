import { describe, expect, test } from "vitest";

import {
  describeOrderStatus,
  ORDER_STATUSES,
} from "../convex/orderStatus";

describe("describeOrderStatus", () => {
  test("maps each status to distinct, non-empty customer copy", () => {
    const messages = ORDER_STATUSES.map((status) => describeOrderStatus(status));

    for (const message of messages) {
      expect(message.length).toBeGreaterThan(0);
    }
    // Every status must read back differently, or the agent would give the
    // same answer for a shipped and a cancelled order.
    expect(new Set(messages).size).toBe(ORDER_STATUSES.length);
  });

  test("gives the expected phrasing per status", () => {
    expect(describeOrderStatus("packed")).toBe(
      "Your order is packed and getting ready to ship.",
    );
    expect(describeOrderStatus("shipped")).toBe(
      "Your order has shipped and is on its way.",
    );
    expect(describeOrderStatus("delivered")).toBe(
      "Your order has been delivered.",
    );
    expect(describeOrderStatus("cancelled")).toBe(
      "Your order has been cancelled.",
    );
  });
});
