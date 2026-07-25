// `bun run check:agent` - is the Flue agent process up and serving the support
// agent? Read-only: one GET of a conversation's history, which creates nothing.
//
// Run this before debugging the web UI. A chat surface that never answers looks
// identical whether the agent is down, listening on another port, or refusing the
// lane, and this script tells those three apart in one command.
//
// Flue serves no health route of its own - every one of its deploy guides tells
// you to write one in `app.ts`, and this project has none - so the reachable
// signal is the agent's own conversation path. A never-prompted instance answers
// `404 stream_not_found`, and that *is* the healthy answer here: the server is
// up, the agent name resolved, and `route` authorized this lane. Plain `fetch`
// rather than `@flue/sdk` on purpose: a diagnostic wants the status and body the
// server sent, not an exception the client threw about them.
import { DEMO_CUSTOMER_ID } from "@support-agent/backend/convex/seedData";
import { describeValue, FLUE_DEV_BASE_URL, hasFailure, report, runCheck } from "./diagnostics";

import type { CheckResult } from "./diagnostics";

// The agent as the running app registers it. Flue discovers agents by file, so
// there is no constant to import; the eval harness names it the same way, in
// `apps/agent/src/evals/support-assistant.eval.ts`.
const AGENT_NAME = "support-assistant";

// Flue's error bodies are `{ error: { type, message, details? } }`, and `type` is
// the part worth branching on. All three of these are HTTP 404 - measured against
// a running `flue dev`, not inferred - and only the type separates "healthy, no
// conversation yet" from the two ways this probe can be aimed at nothing:
//   stream_not_found - the instance has never been prompted. The healthy answer.
//   agent_not_found  - the server runs, but registers no agent by this name.
//   route_not_found  - the agent exists and its `route` refused this instance id.
const STREAM_NOT_FOUND = "stream_not_found";
const AGENT_NOT_FOUND = "agent_not_found";
const ROUTE_NOT_FOUND = "route_not_found";

// Enough of an unexpected body to recognize what answered, short enough that an
// HTML error page does not bury the verdict above it.
const BODY_SNIPPET_LIMIT = 200;

// Whether the server's answer means "up and serving this agent". Pure, so every
// branch below is a claim about a status and a body rather than about a network.
interface Verdict {
  healthy: boolean;
  detail: string;
}

function errorTypeIn(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("error" in body)) return undefined;
  const error: unknown = body.error;
  if (typeof error !== "object" || error === null || !("type" in error)) return undefined;
  return typeof error.type === "string" ? error.type : undefined;
}

function messageCountIn(body: unknown): number | undefined {
  if (typeof body !== "object" || body === null || !("messages" in body)) return undefined;
  return Array.isArray(body.messages) ? body.messages.length : undefined;
}

// An unrecognized answer is the case where the body itself is the diagnosis -
// another service on this port, or a Flue error this script has no branch for -
// so quote enough of it to recognize, and no more.
function snippet(body: unknown): string {
  const rendered = describeValue(body);
  return rendered.length > BODY_SNIPPET_LIMIT
    ? `${rendered.slice(0, BODY_SNIPPET_LIMIT)}...`
    : rendered;
}

function verdictFor(status: number, body: unknown): Verdict {
  if (status === 200) {
    const count = messageCountIn(body);
    return {
      healthy: true,
      detail: `HTTP 200, this instance's conversation holds ${count ?? "an unreported number of"} message(s)`,
    };
  }
  const errorType = errorTypeIn(body);
  if (status === 404 && errorType === STREAM_NOT_FOUND) {
    return {
      healthy: true,
      detail: `HTTP 404 ${STREAM_NOT_FOUND} - up, agent registered, lane authorized, no conversation yet`,
    };
  }
  if (status === 404 && errorType === AGENT_NOT_FOUND) {
    return {
      healthy: false,
      detail:
        `HTTP 404 ${AGENT_NOT_FOUND} - a Flue server is up but registers no "${AGENT_NAME}". ` +
        `It names the agents it does have: ${snippet(body)}`,
    };
  }
  if (status === 404 && errorType === ROUTE_NOT_FOUND) {
    return {
      healthy: false,
      detail:
        `HTTP 404 ${ROUTE_NOT_FOUND} - "${AGENT_NAME}" is registered, but its route refused ` +
        `"${DEMO_CUSTOMER_ID}". The HTTP door serves the web lane only, so this means the lane ` +
        `gate in apps/agent/src/agents/${AGENT_NAME}.ts changed`,
    };
  }
  return {
    healthy: false,
    detail: `HTTP ${status}, error type ${errorType ?? "absent"}, body ${snippet(body)}`,
  };
}

// A body that is not JSON at all (an HTML error page from some other server on
// this port) is a finding in itself, so it is returned rather than thrown.
async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { nonJsonBody: text.slice(0, 120) };
  }
}

/**
 * GET one agent instance's conversation history and read the answer. `fetch`
 * throws when nothing is listening at all, which {@link runCheck} reports as the
 * failure it is.
 */
function checkAgentServing(baseUrl: string): Promise<CheckResult> {
  const path = `/agents/${encodeURIComponent(AGENT_NAME)}/${encodeURIComponent(DEMO_CUSTOMER_ID)}`;
  return runCheck(`${AGENT_NAME} serves ${DEMO_CUSTOMER_ID}`, async () => {
    const response = await fetch(`${baseUrl}${path}?view=history`);
    const verdict = verdictFor(response.status, await readBody(response));
    if (!verdict.healthy) {
      throw new Error(verdict.detail);
    }
    return verdict.detail;
  });
}

const baseUrl = process.env.FLUE_BASE_URL ?? FLUE_DEV_BASE_URL;
const results = [await checkAgentServing(baseUrl)];

report(`check:agent  ${baseUrl}`, results);

if (hasFailure(results)) {
  console.log("Start the agent:  cd apps/agent && bunx flue dev --target node");
  console.log(`Point elsewhere:  FLUE_BASE_URL=http://localhost:3000 bun run check:agent`);
  console.log("(the manual browser pass runs it on :3000 so the web app's default reaches it)\n");
}
