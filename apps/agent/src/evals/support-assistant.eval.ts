import { expect } from "vitest";
import { describeEval, toolCalls } from "vitest-evals";

import { ORDER_STATUSES } from "@support-agent/backend/convex/orderStatus";
import { createFlueAgentHarness } from "./harness";

import type { HarnessRun, ToolCall } from "vitest-evals";

// The agent instance both cases prompt. This one string does three jobs at
// once: `support-assistant`'s `route` serves the `web:` lane only,
// `createSupportTools` hands it to Convex as the `customerId`, and Flue keys the
// conversation by it. So it has to be exactly the id the demo rows are seeded
// under - any other `web:` id answers `found:false` for every order, which would
// turn the decline case green while proving nothing about scoping, and would
// fail the lookup case outright.
const DEMO_CUSTOMER_INSTANCE = "web:demo_customer";

// Seeded for that customer, `shipped`. See `packages/backend/convex/seed.ts`.
const SEEDED_ORDER = "1234";

// Seeded for nobody, so it exercises the honest miss: an order this customer
// does not have is the only way to see whether the agent invents a status.
const UNKNOWN_ORDER = "9999";

// The lookup calls one turn made, in the order the agent made them. The agent is
// allowed more than one attempt, so cases assert over the whole list rather than
// assuming a single call.
function orderLookups(result: HarnessRun): ToolCall[] {
  return toolCalls(result).filter((call) => call.name === "lookup_order_status");
}

// Every status word a reply states. `ORDER_STATUSES` is the complete vocabulary
// the system has, so scanning all four - not just the seeded `shipped` - is what
// makes "did not invent a status" a real claim rather than one lucky word.
function statusWordsIn(reply: string): string[] {
  const lowered = reply.toLowerCase();
  return ORDER_STATUSES.filter((status) => lowered.includes(status));
}

const harness = createFlueAgentHarness({
  agentName: "support-assistant",
  instanceId: DEMO_CUSTOMER_INSTANCE,
});

describeEval("support-assistant / order status", { harness }, (it) => {
  // The decline case runs first on purpose. Pinning the instance id above means
  // both cases share one conversation, so whichever runs second answers with the
  // first one's turn in its context. A turn that has already named a status is
  // exactly the context this case must not be graded under, while the reverse
  // (looking up 1234 after a clean decline) costs the other case nothing.
  it("declines an order this customer does not have", async ({ run }) => {
    const result = await run(`where is order #${UNKNOWN_ORDER}`);
    const lookups = orderLookups(result);

    expect(lookups).not.toHaveLength(0);
    for (const lookup of lookups) {
      expect(lookup).toMatchObject({ status: "ok", result: { found: false } });
    }
    // Assert on the reply only. `kimi-k2.6` reasons out loud, and its
    // deliberation legitimately contains status words while the reply correctly
    // declines - the transcript would fail an agent that behaved perfectly.
    expect(result.output).toContain(UNKNOWN_ORDER);
    expect(statusWordsIn(result.output)).toEqual([]);
  });

  it("reports the seeded status it looked up", async ({ run }) => {
    const result = await run(`where is order #${SEEDED_ORDER}`);

    expect(orderLookups(result)).toContainEqual(
      expect.objectContaining({
        status: "ok",
        arguments: { orderNumber: SEEDED_ORDER },
        result: expect.objectContaining({ found: true, status: "shipped" }),
      }),
    );
    expect(result.output.toLowerCase()).toContain("shipped");
    // A real model turn was billed, so neither assertion above passed against a
    // stubbed or replayed response.
    expect(result.usage.totalTokens ?? 0).toBeGreaterThan(0);
  });
});
