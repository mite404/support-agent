import { defineConfig } from "vitest/config";

// Render tests need a DOM. jsdom supplies `document`/`window` in-process, which
// is enough to assert that a component mounts and what it puts in the tree -
// there is no layout or paint here, so this catches render-time crashes and
// accessibility wiring, never a visual regression.
//
// Globals stay off to match the rest of the repo's explicit `import { test }
// from "vitest"` style; the test file unmounts between cases itself.
export default defineConfig({
  test: {
    environment: "jsdom",
    // Fills in the one browser API jsdom leaves out that a component in this
    // package actually calls. See the file for why it is a shim and not a mock.
    setupFiles: ["./tests/setup.ts"],
  },
});
