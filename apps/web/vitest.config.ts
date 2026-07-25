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
  },
});
