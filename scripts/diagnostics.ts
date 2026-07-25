// Addresses the diagnostics probe, and the run/print/exit shape they share.
//
// The deployment URLs are literals. A diagnostic exists to answer "is the
// backend up, or is my code wrong?" in one command, and a script that must first
// load a `.env` can fail for a reason that has nothing to do with either. Every
// diagnostic prints the address it used, so its answer names what it applies to.

/**
 * The Convex dev deployment the demo rows, the manual browser pass, and the
 * agent evals all run against.
 */
export const CONVEX_DEPLOYMENT_URL = "https://hearty-albatross-308.convex.cloud";

/**
 * Where a `flue dev` server listens when nobody tells it otherwise. This is also
 * the eval harness's default, so an unconfigured server and an unconfigured
 * diagnostic meet without either side being configured. `FLUE_BASE_URL`
 * overrides it - the manual browser pass runs the agent on `:3000` instead, so
 * that the web app's own `NEXT_PUBLIC_FLUE_BASE_URL` default reaches it.
 */
export const FLUE_DEV_BASE_URL = "http://127.0.0.1:3583";

// One named probe's outcome: whether it answered as it should, and what it
// actually said. `detail` is printed for passes too - a check that names the
// value it saw is a diagnostic; one that only says PASS is a green light.
export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * Render a value the way a diagnostic should quote it: as the JSON that crossed
 * the wire, with `undefined` (which JSON has no spelling for) named rather than
 * silently becoming an empty string.
 */
export function describeValue(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

// Every result is one line of a report, so a message that carries its own line
// breaks - Convex quotes a server error as several lines, request id first - is
// folded back onto one before it is printed.
function oneLine(text: string): string {
  return text.replaceAll(/\s+/gu, " ").trim();
}

/**
 * Flatten a thrown value into one line. A failed `fetch` carries the part worth
 * reading (`ECONNREFUSED`, `bad port`) on its `cause` rather than its message,
 * so the cause is quoted whenever there is one.
 *
 * An empty message is named rather than printed, because the one failure this
 * whole directory exists to diagnose produces exactly that: a `ConvexHttpClient`
 * reports an HTTP failure by quoting the response body, and a URL that is not a
 * live deployment answers `400` with a zero-byte body (measured). Rendered
 * naively that reads `Error:` and buries the finding.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return `threw a non-Error: ${describeValue(error)}`;
  }
  const cause = error.cause instanceof Error ? ` (cause: ${oneLine(error.cause.message)})` : "";
  const message = oneLine(error.message);
  if (message === "") {
    return (
      `${error.name} with an empty message${cause} - for a Convex call that means the address ` +
      `answered a failure with an empty body, so it is probably not a live deployment`
    );
  }
  return `${error.name}: ${message}${cause}`;
}

/** Whether any check in a run came back red. */
export function hasFailure(results: readonly CheckResult[]): boolean {
  return results.some((result) => !result.ok);
}

// One result as two lines: the verdict and name, then the evidence indented
// under it. Fixed-width verdicts so a column of them scans vertically.
function formatCheck(result: CheckResult): string {
  return `${result.ok ? "PASS" : "FAIL"}  ${result.name}\n      ${result.detail}`;
}

function formatSummary(results: readonly CheckResult[]): string {
  const passed = results.filter((result) => result.ok).length;
  return `${passed}/${results.length} checks passed`;
}

/**
 * Run one probe, turning a throw into a failed {@link CheckResult} so a single
 * dead call never stops the rest of the run - the whole point of a diagnostic is
 * to report every symptom at once.
 *
 * @param probe - resolves to the detail line describing what came back.
 */
export async function runCheck(name: string, probe: () => Promise<string>): Promise<CheckResult> {
  try {
    return { name, ok: true, detail: await probe() };
  } catch (error) {
    return { name, ok: false, detail: describeError(error) };
  }
}

/**
 * Print a diagnostic's results and, when any of them failed, set a non-zero exit
 * code so a red check fails a script the way a red test fails a suite. Sets
 * `process.exitCode` rather than exiting, so anything the caller still has to
 * print is not cut off mid-run.
 */
export function report(title: string, results: readonly CheckResult[]): void {
  console.log(`\n${title}\n`);
  for (const result of results) {
    console.log(formatCheck(result));
  }
  console.log(`\n${formatSummary(results)}\n`);
  if (hasFailure(results)) {
    process.exitCode = 1;
  }
}
