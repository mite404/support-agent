// `bun run check:backend` - is the Convex dev deployment up, and is it holding
// the demo data? Read-only: both calls are Convex `query` functions, which cannot
// write by construction.
//
// This is the "backend down or code wrong?" triage. It answers in two beats:
// reachability (the deployment serves this repo's functions at all) and then
// data (the demo rows this project's demo, evals and manual pass all assume).
import { ConvexHttpClient } from "convex/browser";
import { getFunctionName } from "convex/server";

import { api } from "@support-agent/backend/convex/_generated/api";
import { DEMO_CUSTOMER_ID, DEMO_ORDERS } from "@support-agent/backend/convex/seedData";
import { CONVEX_DEPLOYMENT_URL, describeValue, report, runCheck } from "./diagnostics";

import type { FunctionReturnType } from "convex/server";
import type { CheckResult } from "./diagnostics";

// What `healthCheck.get` answers when the deployment is serving this checkout's
// functions. Worth asserting rather than merely printing: a deployment that
// answers anything else is running code this repo does not describe.
const HEALTHY_ANSWER = "OK";

// One demo order as the live deployment answered for it, beside the status the
// seed says it should have. `seedData` is the single source of truth for both the
// real deployment and the in-memory test database, so it is also the only thing
// worth comparing against - nothing here restates an order number or a status.
type OrderStatusRow = FunctionReturnType<typeof api.orders.getStatusFor>;

interface ObservedOrder {
  orderNumber: string;
  seededStatus: string;
  row: OrderStatusRow;
}

// How one order disagrees with the seed, or `undefined` when it agrees. A missing
// row and a wrong status are different diagnoses: the first means the deployment
// was never seeded (or seeded under another customer), the second means the seed
// moved on without the deployment.
function driftFor(observed: ObservedOrder): string | undefined {
  if (observed.row === null) {
    return `${observed.orderNumber} is missing`;
  }
  if (observed.row.status !== observed.seededStatus) {
    return `${observed.orderNumber} is ${observed.row.status}, seed says ${observed.seededStatus}`;
  }
  return undefined;
}

function describeObserved(observed: readonly ObservedOrder[]): string {
  return observed
    .map((entry) => `${entry.orderNumber}=${entry.row === null ? "missing" : entry.row.status}`)
    .join(" ");
}

function driftIn(observed: readonly ObservedOrder[]): string[] {
  return observed
    .map((entry) => driftFor(entry))
    .filter((drift): drift is string => drift !== undefined);
}

/**
 * Beat one: the deployment answers the smallest read it serves. A failure here is
 * about the deployment or the network, never about this repo's data.
 */
function checkReachable(client: ConvexHttpClient): Promise<CheckResult> {
  return runCheck(`${getFunctionName(api.healthCheck.get)} answers`, async () => {
    const answer = await client.query(api.healthCheck.get, {});
    if (answer !== HEALTHY_ANSWER) {
      throw new Error(`expected ${describeValue(HEALTHY_ANSWER)}, got ${describeValue(answer)}`);
    }
    return `returned ${describeValue(answer)}`;
  });
}

/**
 * Beat two: every demo order round-trips with the status the seed gives it. The
 * demo, the evals, and the manual browser pass all read these rows, so "the
 * deployment is up" is not the same question as "the deployment is usable".
 */
function checkSeeded(client: ConvexHttpClient): Promise<CheckResult> {
  return runCheck(
    `${getFunctionName(api.orders.getStatusFor)} round-trips the demo orders`,
    async () => {
      const observed: ObservedOrder[] = await Promise.all(
        DEMO_ORDERS.map(async (order) => ({
          orderNumber: order.orderNumber,
          seededStatus: order.status,
          row: await client.query(api.orders.getStatusFor, {
            customerId: DEMO_CUSTOMER_ID,
            orderNumber: order.orderNumber,
          }),
        })),
      );

      const drift = driftIn(observed);
      if (drift.length > 0) {
        throw new Error(
          `${drift.join("; ")} - re-stage the demo rows with ` +
            `\`npx convex run seed:run\` (or pass a customerId)`,
        );
      }
      return `${DEMO_CUSTOMER_ID} -> ${describeObserved(observed)}`;
    },
  );
}

const client = new ConvexHttpClient(CONVEX_DEPLOYMENT_URL);

report(`check:backend  ${CONVEX_DEPLOYMENT_URL}`, [
  await checkReachable(client),
  await checkSeeded(client),
]);
