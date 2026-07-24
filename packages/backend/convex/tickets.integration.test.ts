/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const CONVERSATION = "web:user_a";

describe("tickets.create", () => {
  test("opens a new ticket in the open state", async () => {
    const t = convexTest(schema, modules);

    const ticketId = await t.mutation(api.tickets.create, {
      conversationKey: CONVERSATION,
      subject: "Where is my order?",
    });

    const row = await t.run((ctx) => ctx.db.get("tickets", ticketId));
    expect(row?.status).toBe("open");
    expect(row?.subject).toBe("Where is my order?");
    expect(row?.conversationKey).toBe(CONVERSATION);
  });
});

describe("tickets.setStatus", () => {
  test("escalates an open ticket to needs_human", async () => {
    const t = convexTest(schema, modules);
    const ticketId = await t.mutation(api.tickets.create, {
      conversationKey: CONVERSATION,
      subject: "escalate me",
    });

    await t.mutation(api.tickets.setStatus, {
      ticketId,
      status: "needs_human",
    });

    const row = await t.run((ctx) => ctx.db.get("tickets", ticketId));
    expect(row?.status).toBe("needs_human");
  });

  test("resolves a ticket", async () => {
    const t = convexTest(schema, modules);
    const ticketId = await t.mutation(api.tickets.create, {
      conversationKey: CONVERSATION,
      subject: "resolve me",
    });

    await t.mutation(api.tickets.setStatus, { ticketId, status: "resolved" });

    const row = await t.run((ctx) => ctx.db.get("tickets", ticketId));
    expect(row?.status).toBe("resolved");
  });
});
