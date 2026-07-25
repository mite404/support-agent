import { defineConfig } from "vitest/config";

// The web tests split into two kinds and both run here: pure view-model tests
// (`message-view`) that need no DOM at all, and render tests that mount a React
// tree. jsdom is the cheaper of the two options - it gives `document`/`window`
// in-process, so a component that throws at mount fails loudly, while layout and
// paint stay out of reach. Anything visual belongs to the manual browser pass.
//
// Globals stay off to match `packages/ui` and the rest of the repo's explicit
// `import { test } from "vitest"` style; a test file that renders unmounts
// between cases itself.
export default defineConfig({
  test: {
    environment: "jsdom",
    // `Chat.tsx` builds its Flue client at module scope, so importing it runs
    // `@support-agent/env/web` validation before any test body does. Vitest does
    // not read `apps/web/.env` (measured: the vars are `undefined` without this),
    // and that file is gitignored anyway - so a render test that relied on it
    // would pass here and fail in CI. These are throwaway values that satisfy the
    // schema; nothing in a test may talk to a real deployment.
    env: {
      NEXT_PUBLIC_CONVEX_URL: "https://test.convex.cloud",
      NEXT_PUBLIC_CONVEX_SITE_URL: "https://test.convex.site",
      NEXT_PUBLIC_FLUE_BASE_URL: "http://localhost:3000",
    },
  },
});
