import { v } from "convex/values";

/**
 * A support case's lifecycle: `open` when created, `needs_human` once the agent
 * escalates, `resolved` when the case closes. Single source of truth for both
 * the schema validator and the mutation args.
 */
export const TICKET_STATUSES = ["open", "needs_human", "resolved"] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Convex validator for a ticket's `status` field, derived from {@link TICKET_STATUSES}. */
export const ticketStatusValidator = v.union(
  v.literal("open"),
  v.literal("needs_human"),
  v.literal("resolved"),
);
