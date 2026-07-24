import { v } from "convex/values";

/**
 * How long an outbound reply waits before it is delivered - the undo window.
 * The delay lives in Convex's scheduler (durable, survives restarts), not an
 * in-process timer, so a cancel inside this window reliably stops the send.
 */
export const UNDO_WINDOW_MS = 5000;

/**
 * Lifecycle of an outbound message: `pending` while it waits out the undo
 * window, then either `sent` when delivered or `cancelled` if pulled back in
 * time. Single source of truth for the schema validator.
 */
export const OUTBOX_STATUSES = ["pending", "sent", "cancelled"] as const;

export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

/** Convex validator for an outbox message's `status` field, derived from {@link OUTBOX_STATUSES}. */
export const outboxStatusValidator = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("cancelled"),
);

/**
 * When a message enqueued at `now` should be delivered: `now` plus the undo
 * window. Pure calculation - no I/O, `now` passed in - so the 5s contract is
 * unit-testable without a Convex runtime.
 */
export function scheduledDeliveryTime(now: number): number {
  return now + UNDO_WINDOW_MS;
}
