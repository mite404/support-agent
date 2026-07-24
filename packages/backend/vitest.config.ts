import { defineConfig } from "vitest/config";

// convex-test runs Convex functions against an in-memory backend, which needs
// the edge runtime for the web globals (crypto, etc.) Convex relies on. The
// pure calc tests in `tests/` run fine under this environment too, so one
// config covers the whole package.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
