import { describe, expect, test } from "vitest";

import {
  OUTBOX_STATUSES,
  scheduledDeliveryTime,
  UNDO_WINDOW_MS,
} from "../convex/outboxStatus";

describe("scheduledDeliveryTime", () => {
  test("delivers exactly one undo window after enqueue", () => {
    const enqueuedAt = 1_700_000_000_000;

    expect(scheduledDeliveryTime(enqueuedAt)).toBe(enqueuedAt + UNDO_WINDOW_MS);
  });

  test("keeps the undo window at 5 seconds", () => {
    // The 5s window is the load-bearing contract behind undo-send: long enough
    // to cancel, short enough not to stall the reply.
    expect(UNDO_WINDOW_MS).toBe(5000);
  });

  test("is a pure offset - no wall-clock read of its own", () => {
    // Same input, same output: the calc never consults Date.now() internally,
    // which is what lets it be tested without a Convex runtime.
    expect(scheduledDeliveryTime(0)).toBe(UNDO_WINDOW_MS);
    expect(scheduledDeliveryTime(42)).toBe(42 + UNDO_WINDOW_MS);
  });
});

describe("OUTBOX_STATUSES", () => {
  test("a pending message can only resolve to sent or cancelled", () => {
    expect(OUTBOX_STATUSES).toEqual(["pending", "sent", "cancelled"]);
  });
});
