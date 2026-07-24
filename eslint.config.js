// ESLint has ONE job in this repo: layer Convex-specific rules onto the Convex
// functions. oxlint lints everything (these files included) for general TS
// hygiene; ESLint adds only the rules oxlint cannot know about - Convex runtime
// footguns like filtering in a query or a missing args validator.
//
// Because this config enables *only* Convex rules (no eslint core, no
// typescript-eslint rules), there is nothing for it to overlap or conflict with
// oxlint on. That is what keeps the two linters clean side by side.
import convex from "@convex-dev/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  // Global ignore (a config object with only `ignores` applies repo-wide):
  // never let ESLint touch Convex's generated code.
  { ignores: ["**/_generated/**"] },
  {
    files: ["packages/backend/convex/**/*.ts"],
    languageOptions: {
      // Convex functions are TypeScript; the default parser cannot read them.
      // These rules are syntactic (no type info), so no `project` is needed.
      parser: tsParser,
      parserOptions: { sourceType: "module", ecmaVersion: "latest" },
    },
    plugins: { "@convex-dev": convex },
    rules: {
      // Wrong old handler syntax `mutation(fn)` instead of `mutation({ handler })`.
      "@convex-dev/no-old-registered-function-syntax": "error",
      // Every public function must declare an args validator (untrusted input).
      "@convex-dev/require-args-validator": "error",
      // Use `v.id("table")`, not a bare string, for document ids.
      "@convex-dev/explicit-table-ids": "error",
      // `.filter()` in a query scans the whole table - prefer an index.
      "@convex-dev/no-filter-in-query": "warn",
      // `.collect()` on an unbounded query loads the whole table into memory.
      "@convex-dev/no-collect-in-query": "warn",
    },
  },
];
