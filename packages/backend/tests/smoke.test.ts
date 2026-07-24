import { expect, test } from "vitest";

// Trivial smoke test that proves the vitest runner is wired up for the
// backend package. Real logic tests (order status mapping, etc.) land in
// later Ralph iterations alongside the code they cover.
test("test runner is wired up", () => {
  expect(1 + 1).toBe(2);
});
