# Implementation Plan: Durable Test Harness + Web Wiring

Granular, commit-by-commit plan for job #1 (from `HANDOFF-2026-07-24.md`) plus the durability layers
we refined around it.
This is a testing-first slice of `flue-support-agent-plan.md`, not a rival to it.

## The one-line framing

Most of the plan's code already exists (Ralph built the schema, Convex functions, tools, agent, and
the whole web surface).
It has never been run or tested end to end, and there is no gate to keep it working.
So this plan is mostly "prove and gate what exists," with only two small net-new builds (seed data
and the tests themselves).

## Decisions locked (with Ethan)

| Decision | Choice |
|---|---|
| Scope of this plan | The 7 durability commits below. WhatsApp, skill, real Twilio send, and deploy get a one-line "Next" section and their own plan later. |
| Web agent runtime | Flue stays. No Vercel AI SDK. |
| Model / provider | `openrouter/moonshotai/kimi-k2.5` via Flue's built-in `openrouter` provider (was `anthropic/claude-haiku-4-5`). |
| Provider credential | `OPENROUTER_API_KEY` (was `ANTHROPIC_API_KEY`). Cheap enough that evals are no longer deferred. |
| Convex handler tests | `convex-test` (in-memory reimplementation, never touches the cloud deployment). |
| Everything else (UI render, transforms, tool closures) | vitest + `@testing-library/react` + jsdom. |
| Agent evals | Flue's `flue add tooling vitest-evals` blueprint (generated harness, not hand-written). |
| `customers` table | Deferred to the WhatsApp lane. For this slice the conversation `id` is the customer scope. |
| shadcn frontend rebuild | Separate later commit. This plan tests and wires the existing `packages/ui` primitives. |

## The durability model (6 layers)

Each layer catches a different class of failure.
Three are currently unplugged.
The discipline: lean on Flue where the agent loop lives, keep hand-built only where Flue's coverage
genuinely ends.

| Layer | Owner | Catches | Status |
|---|---|---|---|
| L1 pure calculations | ours (vitest) | status mapping, offsets, transforms, lane gates | have it |
| L2 Convex integration | ours (`convex-test`) | the DB-to-app seam: scoping, outbox lifecycle, ticket transitions | missing |
| L3 tool to Convex contract | ours (vitest stubs) + L2 | closure scoping, lane gate, drift from real handlers | half (stubs) |
| L4 component render | ours (testing-library + jsdom) | render-time crashes (the `<label>` class), accessible roles | missing |
| L5 agent eval | Flue (`vitest-evals`) | tool-trajectory, anti-fabrication | unlocked by cheap Kimi |
| L6 the gate | Flue (GitHub Actions blueprint) | everything above, on every push | missing |

Why L2 and L4 stay hand-built no matter how many batteries Flue ships: Convex is the data layer
(Flue has no opinion on it) and the browser DOM is the presentation layer (Flue's `@flue/react`
gives the data hook, not DOM assertions).
That boundary is the whole "green gates lie" fix.

## Test environments

The monorepo runs `turbo run test`, which calls `vitest run` per package.
Two packages need a non-default vitest environment.

- `packages/backend`: `convex-test` needs vitest's `edge-runtime` environment (edge globals such as
  `crypto`).
  The existing pure calc tests run fine there too, so one `packages/backend/vitest.config.ts` with
  `environment: 'edge-runtime'` and `server.deps.inline: ['convex-test']` covers the package.
  Test files that call `convexTest` must live inside `convex/` (guidelines requirement), each with
  `/// <reference types="vite/client" />` and `import.meta.glob('./**/*.ts')`, so the module-map
  keys match the paths Convex uses to resolve `api.*`.
  `vite` is a dev dep so that reference and `import.meta.glob` typecheck under
  `convex/tsconfig.json`.
- `packages/ui` and `apps/web`: render tests need `jsdom`. Add a `vitest.config.ts` with
  `environment: 'jsdom'` to each.
- `apps/agent` evals are a separate command (`pnpm run evals`), not part of `turbo run test`.
  Exclude the `*.eval.ts` files from the vitest `test` glob so the fast gate never tries to run them
  without a live server.

## Diagnostics scripts (dev-only, not a commit gate)

Port the fast backend-probe pattern from
`~/Programming/web/fractal/pm-interview-dashboard-main/scripts` so a stuck session can tell "is the
backend down?" from "is my code wrong?" in one command.
All read-only, all exit non-zero on failure (gate-safe), deployment URL kept literal so a diagnostic
has zero env-loading dependency.
- `scripts/check-backend.ts` (`bun run check:backend`) - reachability:
  `ConvexHttpClient(CONVEX_URL).query(api.healthCheck.get)` returns `"OK"`, and one seeded
  `orders.getStatusFor` round-trips. Confirms the dev deployment (`hearty-albatross-308`) is up and
  this repo can reach it.
- `scripts/probe-functions.ts` (`bun run probe`) - call each read-only Convex function with
  realistic args and print what the live deployment returns; isolate failures so one bad call does
  not stop the rest. Observed behavior is the real contract, not the checked-in source.
- `scripts/check-agent.ts` (`bun run check:agent`) - GET the Flue agent health route at
  `NEXT_PUBLIC_FLUE_BASE_URL` so Commit 5's manual pass confirms the agent process is up before
  debugging the web UI.

Reference: `pm-interview-dashboard-main/scripts/{check-backend.ts,probe-tools.ts}`.
Convex also exposes this live (its MCP `status`/`tables`/`functionSpec`/`run`, and `npx convex
function-spec` / `npx convex dashboard`); the scripts are the checked-in, zero-setup version.

---

## Commit 1 - Convex integration layer

Goal: run the real Convex query, mutation, and action handlers against an in-memory database for the
first time.
This closes the load-bearing gap the handoff named.

Files (as shipped):
- `packages/backend/package.json` - add dev deps `convex-test`, `@edge-runtime/vm`, `vite`.
- `packages/backend/vitest.config.ts` (new) - `environment: 'edge-runtime'`, `server.deps.inline:
  ['convex-test']`.
- `packages/backend/convex/orders.integration.test.ts` (new).
- `packages/backend/convex/outbox.integration.test.ts` (new).
- `packages/backend/convex/tickets.integration.test.ts` (new).

Each test builds `convexTest(schema, import.meta.glob('./**/*.ts'))` from inside `convex/` and seeds
rows via `t.run(ctx => ctx.db.insert(...))`.
Convex excludes `*.test.ts` from deployment, so colocating them is safe.

What is asserted:
- orders: correct `customerId` + `orderNumber` returns the described row; correct id + unknown
  number returns `null`; a different `customerId` asking for the first customer's order returns
  `null`. That last assertion is the scoping boundary, run against a real handler for the first
  time.
- outbox: `enqueue` inserts a `pending` row with `scheduledFor` set and schedules a delivery;
  `cancel` on a `pending` row flips it to `cancelled`; `cancel` on a row already `sent` (patched in
  via `t.run`) leaves it `sent`, proving a late cancel can never un-send.
- tickets: `create` opens a row as `open`; `setStatus` moves it to `needs_human` and `resolved`.

Done when: `bun run test -F @support-agent/backend` is green and the three new files run the real
handlers in-memory.

Caveat: `outbox.deliver` is still a stub that returns `null`, so the "deliver only sends a
still-pending row" assertion is out of scope here and lands with the Twilio commit later.

## Commit 2 - Seed source of truth

Goal: define the demo rows once, then stage them two ways - the real dev deployment (for the demo)
and the in-memory test DB (for L2) - so the two can never drift.

Files:
- `packages/backend/convex/seedData.ts` (new) - plain exported data: `DEMO_CUSTOMER_ID`,
  `DEMO_ORDERS` (including order `1234` as `shipped`), and any demo tickets. No I/O.
- `packages/backend/convex/seed.ts` (new) - an `internalMutation` named `run` that iterates
  `seedData` and inserts the rows. Internal so no one can seed production by accident.
- `packages/backend/convex/seed.integration.test.ts` (new, colocated like commit 1) - calls
  `t.mutation(internal.seed.run)` then asserts `orders.getStatusFor(DEMO_CUSTOMER_ID, '1234')`
  returns `shipped`. This proves seed and query together, so the demo can never silently break.

Decision to make here (surfaced by Commit 1's code review): order-number uniqueness.
`orders.getStatusFor` does `.withIndex("by_orderNumber").unique()`, and `.unique()` throws when more
than one row matches.
If two customers can share an `orderNumber`, the query 500s before the `customerId` guard runs, and
Commit 1's single-row scoping test never exercises that path.
Resolve it as part of defining the seed data, since the seed is where uniqueness is decided:
- Preferred: add a `by_customer_and_orderNumber` composite index in `schema.ts` and change
  `getStatusFor` to query on both fields, so scoping lives in the index and no collision can throw
  (the customer filter stops being a post-`.unique()` JS check).
- Alternative: guarantee and document globally-unique order numbers, and keep the current query.
- Either way, add an `orders` integration test that seeds order `1234` for two different customers,
  queries as one, and asserts the correct row (not a throw).

Done when: the seed test is green, the order-number uniqueness decision above is implemented with
its two-customer collision test, and `npx convex run seed:run` is documented as the way to populate
the real dev deployment for the demo.

## Commit 3 - Component render layer

Goal: make a render-time crash fail a test instead of production. Direct antidote to the `<label>`
bug.

Files:
- `packages/ui/package.json` - add `"test": "vitest run"` and dev deps `vitest`,
  `@testing-library/react`, `jsdom`.
- `packages/ui/vitest.config.ts` (new) - `environment: 'jsdom'`.
- `packages/ui/tests/chat-primitives.test.tsx` (new) - render `<Bubble>`/`<BubbleContent>`,
  `<Message>`/`<MessageContent>`, and `<Label>`; assert each mounts without throwing, exposes its
  text content, and that `<Label>` associates with its control.

Done when: `bun run test -F @support-agent/ui` is green, and `turbo run test` now includes the ui
package (it had no test script before).

Self-check: temporarily break one primitive's render and confirm the test fails, then revert.

## Commit 4 - Model swap to Kimi via OpenRouter

Goal: switch the agent to the cheap, OpenAI-compatible Kimi model, which also unlocks the eval
layer.

Files:
- `apps/agent/src/agents/support-assistant.ts` - `SUPPORT_MODEL =
  'openrouter/moonshotai/kimi-k2.5'`.
- `apps/agent/tests/support-assistant.test.ts` - update the `config.model` assertion to the new
  string. This test breaking on the swap is the proof it was load-bearing.
- `apps/agent/.env` (gitignored) - add `OPENROUTER_API_KEY`. Update any `.env.example`.

Done when: the agent test is green with the new model string, and a manual `flue run` reaches Kimi.

Caveat: confirm the exact OpenRouter model slug (`kimi-k2.5` vs `kimi-k2.6`) against OpenRouter's
live model list at implementation time; Flue's own doc example uses `kimi-k2.6`.

## Commit 5 - Verify and render-test the web wiring

Goal: the web surface is already built (`page.tsx`, `Chat.tsx`, `message-view.ts`). Prove it reaches
a running agent and guard the composition with a render test.

Files:
- `@support-agent/env/web` - confirm `NEXT_PUBLIC_FLUE_BASE_URL` is defined and points at the
  running Flue agent process; add it if missing.
- `apps/web/vitest.config.ts` (new) - `environment: 'jsdom'`; add dev deps `@testing-library/react`,
  `jsdom`.
- `apps/web/tests/chat.test.tsx` (new) - render `<Chat userId="u1">` with `useFlueAgent` mocked (via
  `vi.mock('@flue/react')`) returning two messages; assert the user bubble aligns `end`, the
  assistant `start`, the text renders, and the id passed to the hook is `web:u1`.

Done when: the chat render test is green, and a documented manual pass succeeds: run `flue dev` and
`bun run dev`, sign in, ask "where is order #1234" and get "shipped"; ask for an unknown order and
watch it decline rather than invent (anti-fabrication).

This manual pass needs the live agent process and the model key, so it is a documented step, not a
CI gate. The eval layer (commit 6) is the automatable proxy for it.

## Commit 6 - Agent evals

Goal: a small, repeatable regression suite over the real agent behavior, using Flue's sanctioned
harness.

Steps and files:
- Run `flue add tooling vitest-evals` in `apps/agent`. The blueprint installs deps, an eval config,
  the `createFlueAgentHarness(...)` harness (which drives the agent over its HTTP `route` via
  `@flue/sdk`), the `evals` and `evals:json` scripts, and a starter case.
- `apps/agent/src/evals/support-assistant.eval.ts` (new) - two cases against
  `createFlueAgentHarness({ agentName: 'support-assistant' })`:
  - "where is order #1234" - `toolCalls` includes `lookup_order_status` and the output contains
    `shipped`.
  - "where is order #9999" - the agent declines and does not fabricate a status.

Done when: `pnpm run evals` is green locally against a running `flue dev`, the seeded demo data, and
`OPENROUTER_API_KEY`.

Caveats baked in:
- The harness mints agent instance ids; our `route` rejects anything not on the `web:` lane.
  Configure the harness to use a `web:`-prefixed id, or relax the route for the eval path.
- Evals need the running server plus the key, so they are a separate command and a separate,
  secret-gated CI job (commit 7), never part of the fast `turbo run test` gate.

## Commit 7 - CI gate and the durability doc

Goal: make "green" mean something, and write down the model so future features come with tests by
default.

Files:
- `.github/workflows/ci.yml` (new), based on Flue's `ecosystem/deploy/github-actions.md` blueprint:
  - Job `verify`: `bun install` then `turbo run check-types lint test build`. This is L1 through L4,
    needs no secrets, runs on every push and PR.
  - Job `evals` (gated): only when `secrets.OPENROUTER_API_KEY` is present. Start the agent, wait
    for health, run `pnpm run evals`, and publish the report with the `getsentry/vitest-evals`
    action. Skips cleanly on forks and PRs without the secret, so they stay green.
- `docs/FOR_ETHAN.md` - add the durability section per the AGENTS.md living-doc structure: the 6
  layers, the battery-vs-ours boundary, the seed source-of-truth rule, the derived-type discipline
  (tool types deriving from the Convex API via `FunctionArgs`/`FunctionReturnType`), and the rule
  "green means all six ran." The `<label>` crash is the natural "Bloopers" entry.

Done when: the workflow file is valid and the gate is described. It activates once the repo has a
GitHub remote.

Optional (defense in depth, not required): a `pre-push` husky hook running `turbo run check-types
test` locally. The durable gate is CI; the hook is a nicety.

---

## Next (out of this plan, own plan later)

- WhatsApp lane: `@flue/twilio` or Flue's first-party `whatsapp` channel (pick then), `customers`
  table, cross-channel correlation.
- Real `outbox.deliver` send via the Twilio SDK, plus its "won't deliver a cancelled row" test.
- Escalation tools: `create_ticket`, `message_a_human` (the `tickets` mutations already exist and
  are tested).
- A skill: `src/skills/refund-policy/SKILL.md`.
- shadcn frontend rebuild: `bunx --bun shadcn@latest apply --preset b2aBcY9IDw` (bubble, message,
  message-scroller, skeleton, toast, sidebar), then rip composition from `ai-chatbot-new` and
  `pm-interview-dashboard-main`; the render tests written here guard it when it lands. See the Web
  UI section of `flue-support-agent-plan.md`.
- Deploy: `flue add database ...` for the durable session store, `flue add deploy ...` for hosting;
  agent and web on one platform per the handoff.
