// `bun run probe` - call every read-only Convex function with realistic arguments
// and print what the live deployment actually returns. Observed behaviour is the
// real contract; the checked-in source is only a description of it.
//
// Read-only is enforced by the type system, not by care: `toProbe` accepts a
// `FunctionReference<"query">`, and a Convex query cannot write. Handing it
// `api.tickets.create` or `api.outbox.enqueue` is a compile error rather than a
// mutation nobody meant to run.
//
// Unlike `check:backend` this script asserts nothing. It exits non-zero only when
// a call *fails*, because a surprising answer is a finding to read rather than a
// broken deployment.
import { ConvexHttpClient } from "convex/browser";
import { getFunctionName } from "convex/server";

import { api } from "@support-agent/backend/convex/_generated/api";
import { DEMO_CUSTOMER_ID, DEMO_ORDERS } from "@support-agent/backend/convex/seedData";
import { CONVEX_DEPLOYMENT_URL, describeError, describeValue } from "./diagnostics";

import type { FunctionArgs, FunctionReference } from "convex/server";

// Seeded for nobody, so it shows the honest miss the agent's anti-fabrication
// rule leans on: `null` for an order that does not exist.
const UNKNOWN_ORDER_NUMBER = "9999";

// A customer who owns none of the demo rows. Asking as them for somebody else's
// order is the scoping boundary, probed here against the live composite index
// rather than against an in-memory test database.
const FOREIGN_CUSTOMER_ID = "web:someone_else";

// Every order number the demo stages, taken from the seed so this file never
// names one itself.
const seededOrderNumbers = DEMO_ORDERS.map((order) => order.orderNumber);

// One read-only call to make: how to label it, the arguments to print beside it,
// and the thunk that performs it. A thunk keeps every call site individually
// type-checked against its own function reference, which a heterogeneous list of
// `[reference, args]` pairs could not be.
interface Probe {
  label: string;
  args: Record<string, unknown>;
  call: () => Promise<unknown>;
}

// What came back, or how the call died. Collected rather than printed as it
// happens, so one dead function never stops the rest of the run.
interface ProbeOutcome {
  probe: Probe;
  ok: boolean;
  answer: string;
}

function toProbe<Reference extends FunctionReference<"query">>(
  client: ConvexHttpClient,
  reference: Reference,
  args: FunctionArgs<Reference>,
): Probe {
  return {
    label: getFunctionName(reference),
    args,
    call: () => client.query(reference, args),
  };
}

// The probe list, in the order that tells a story: reachability, the seeded happy
// path, the two ways a lookup should miss, then the authenticated surface as an
// anonymous caller sees it.
function probesFor(client: ConvexHttpClient): Probe[] {
  return [
    toProbe(client, api.healthCheck.get, {}),
    ...seededOrderNumbers.map((orderNumber) =>
      toProbe(client, api.orders.getStatusFor, { customerId: DEMO_CUSTOMER_ID, orderNumber }),
    ),
    toProbe(client, api.orders.getStatusFor, {
      customerId: DEMO_CUSTOMER_ID,
      orderNumber: UNKNOWN_ORDER_NUMBER,
    }),
    ...seededOrderNumbers.map((orderNumber) =>
      toProbe(client, api.orders.getStatusFor, { customerId: FOREIGN_CUSTOMER_ID, orderNumber }),
    ),
    toProbe(client, api.privateData.get, {}),
    toProbe(client, api.auth.getCurrentUser, {}),
  ];
}

// Two lines per call: what was asked, then what came back. `!!` instead of `->`
// marks a call that threw, so a scan down the left edge finds the dead ones.
function formatOutcome(outcome: ProbeOutcome): string {
  const arrow = outcome.ok ? "->" : "!!";
  return `${outcome.probe.label}  ${describeValue(outcome.probe.args)}\n   ${arrow} ${outcome.answer}`;
}

/**
 * Perform one probe. A throw is captured rather than propagated, so the run
 * reports every function's behaviour in a single pass.
 */
async function probe(target: Probe): Promise<ProbeOutcome> {
  try {
    return { probe: target, ok: true, answer: describeValue(await target.call()) };
  } catch (error) {
    return { probe: target, ok: false, answer: describeError(error) };
  }
}

console.log(`\nprobe  ${CONVEX_DEPLOYMENT_URL}\n`);

const client = new ConvexHttpClient(CONVEX_DEPLOYMENT_URL);
const outcomes = await Promise.all(probesFor(client).map((target) => probe(target)));

for (const outcome of outcomes) {
  console.log(formatOutcome(outcome));
}

const answered = outcomes.filter((outcome) => outcome.ok).length;
console.log(`\n${answered}/${outcomes.length} calls answered\n`);
if (answered < outcomes.length) {
  process.exitCode = 1;
}
