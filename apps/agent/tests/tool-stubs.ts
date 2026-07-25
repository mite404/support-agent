import { vi } from "vitest";
import type { Mock } from "vitest";

import { getFunctionName } from "convex/server";
import type { FunctionReference } from "convex/server";
import type { SupportConvexClient } from "../src/shared/support-tools";
import { createSupportTools } from "../src/shared/support-tools";

// Any Convex function the support tools reach for. Convex's own
// `AnyFunctionReference` is not re-exported from `convex/server`, so the union
// is spelled out from the exported `FunctionReference`.
type SupportFunctionReference = FunctionReference<"query" | "mutation">;

/**
 * The stable identity of a Convex function. The generated `api` object is a
 * proxy that mints a fresh reference object on every property access, so
 * `api.tickets.create === api.tickets.create` is false and only the name can
 * identify a function - in a stub's dispatch and in an assertion alike.
 */
export function named(reference: SupportFunctionReference): string {
  return getFunctionName(reference);
}

/**
 * Every call a stub recorded, as `[function name, arguments]` pairs. Asserting
 * this shape instead of `toHaveBeenCalledWith(api.x, ...)` buys two things: the
 * order of a multi-call tool is pinned, and a failure prints a real diff -
 * pretty-format throws `PrettyFormatPluginError: Cannot convert object to
 * primitive value` if it has to render a recorded call still holding a proxy.
 */
export function recordedCalls(stub: Mock): [string, unknown][] {
  return stub.mock.calls.map(([reference, args]) => [named(reference), args]);
}

/**
 * Build every support tool wired to a stubbed Convex query + mutation.
 * Destructuring the factory's tuple keeps each tool's `run` input shape
 * distinct, so calling `run` typechecks against that tool's own schema.
 */
export function makeTools(id: string, queryResult: unknown, mutationResult: unknown) {
  const query = vi.fn().mockResolvedValue(queryResult);
  const mutation = vi.fn().mockResolvedValue(mutationResult);
  const client: SupportConvexClient = { query, mutation };
  const [lookupOrderStatus, sendReply, createTicket, messageAHuman] = createSupportTools(
    id,
    client,
  );
  return {
    lookupOrderStatus,
    sendReply,
    createTicket,
    messageAHuman,
    query,
    mutation,
  };
}
