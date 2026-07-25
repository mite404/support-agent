import { defineConfig } from "vitest/config";

// The agent's fast gate: pure calculations (the lane guard) and tool-contract
// tests against stub clients. No DOM and no backend, so the default node
// environment is right.
//
// `include` is pinned to `tests/` on purpose. Eval cases live at
// `src/evals/*.eval.ts` and need a running server plus a paid key; naming alone
// already keeps them out of the default glob, but stating the boundary here
// means `turbo run test` can never start billing for model calls because someone
// renamed a file.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
