import { defineConfig } from "vitest/config";

// Evals are a different kind of test from everything in `vitest.config.ts`: they
// need a running Flue server, a paid model key, and a minute of patience per
// case, so they get their own config and their own command. `bun run test` stays
// fast, offline, and safe to run on every save; `bun run evals` is deliberate.
//
// The reporter is what turns a pass/fail into a readable report - output, token
// usage, cost, and the tool trajectory the agent actually took.
export default defineConfig({
  test: {
    include: ["src/evals/**/*.eval.ts"],
    reporters: ["default", "vitest-evals/reporter"],
    testTimeout: 60_000,
  },
});
