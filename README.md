# support-agent

A multi-channel e-commerce customer support agent built on
[Flue](https://github.com/withastro/flue), the Astro team's agent framework.
One agent answers order-status questions over two doors: a **web chat** surface and a **WhatsApp**
lane (via Twilio).
The design's load-bearing idea is trust: the agent never invents an order status, and any outbound
message to a real customer passes a guarded, cancellable send.

## Architecture

Two doors, one agent, one durable session per conversation.

```
Web browser  ──POST/GET /agents/support-assistant/:id──►  route (web lane only)  ─┐
                                                                                  ├─►  defineAgent(id)  ──►  tools  ──►  Convex
WhatsApp  ──Twilio webhook──►  channel dispatch (id = whatsapp:+1…)  ─────────────┘        │                            (orders, tickets, outbox)
                                                                                    lookup_order_status
                                                                                    send_reply (WhatsApp lane only, +5s undo)
```

- **Two lanes, one agent.** A web visitor is `id = web:<userId>`; a WhatsApp sender is `id =
  whatsapp:+1…`.
  Each `id` is its own session; the two are correlated in Convex for context but never merged.
- **Authorization lives in `run`, not the schema.** Valibot validates a tool's shape; whether this
  caller may act is decided inside the tool from the closure `id`.
- **`send_reply` is guarded.** It only works on the WhatsApp lane, and it enqueues to an `outbox`
  with a 5-second cancellable delay (durable in Convex, not an in-process timer).

## Monorepo structure

```
support-agent/
├── apps/
│   ├── web/          # Next.js 16 frontend; the /support chat surface
│   └── agent/        # The Flue agent: defineAgent, tools, HTTP route
├── packages/
│   ├── backend/      # Convex backend: schema + functions
│   ├── ui/           # Shared shadcn/base-ui primitives
│   ├── env/          # Typed environment validation (t3-env + Zod)
│   └── config/       # Shared TS / tooling config
```

The agent's own code:

```
apps/agent/src/
├── agents/support-assistant.ts   # defineAgent + the web-lane HTTP route
└── shared/support-tools.ts       # createSupportTools(id): the tools + in-run authz
```

## Convex data model (`packages/backend/convex`)

| Table | Purpose |
|-------|---------|
| `orders` | What customers ask about; `getStatusFor` looks one up, scoped to the caller. |
| `customers` | Correlates the two channel lanes for context (never merges sessions). |
| `tickets` | One support case per conversation (`open` → `needs_human` → `resolved`). |
| `outbox` | Where the 5-second undo-send lives; a scheduler delivers or a cancel stops it. |

## Tech stack

- **Runtime / package manager:** Bun
- **Monorepo:** Turborepo (`turbo` orchestrates scripts across every package)
- **Agent framework:** Flue (`@flue/runtime`), tools typed with **Valibot**
- **Frontend:** Next.js 16, React 19, Tailwind CSS v4
- **Backend:** Convex (reactive), Better-Auth
- **Lint / format:** oxlint + oxfmt
- **Tests:** Vitest

## Getting started

Install dependencies (run this on your own machine even if a container already installed them -
native binaries differ per platform):

```bash
bun install
```

Set up Convex (creates/links a deployment and writes `CONVEX_DEPLOYMENT`):

```bash
bun run dev:setup
```

Then set the server-side secrets into the Convex deployment (not a local file - Convex functions run
in the cloud):

```bash
cd packages/backend
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
npx convex env set SITE_URL "http://localhost:3001"
```

Confirm `apps/web/.env` has your real Convex URLs (not the `example.convex.cloud` placeholders).

Run the web app + Convex together:

```bash
bun run dev
```

Open [http://localhost:3001/support](http://localhost:3001/support).

### Seed the demo data

The demo orders live in one place - `packages/backend/convex/seedData.ts` - and are staged two
ways from there: into the dev deployment by the mutation below, and into the in-memory test
database by `seed.integration.test.ts`. One source, so the demo and the tests cannot drift.

```bash
cd packages/backend
npx convex run seed:run
```

That stages orders `1234` (shipped), `2345` (packed), `3456` (delivered), and `4567` (cancelled)
under the default demo customer. Orders are scoped to a customer, and a signed-in browser session's
scope is `web:<userId>`, so to see them as *yourself* pass your own id:

```bash
npx convex run seed:run '{"customerId": "web:<your-user-id>"}'
```

Re-running is safe - each order is matched on `(customerId, orderNumber)` and updated in place
rather than duplicated.

## Scripts

| Command | Does |
|---------|------|
| `bun run dev` | Start every package's dev server (web on 3001, Convex dev) |
| `bun run dev:web` | Web app only |
| `bun run dev:server` | Convex backend only |
| `bun run build` | Build all packages |
| `bun run lint` | oxlint across the repo |
| `bun run check-types` | `tsc --noEmit` in every package |
| `bun run test` | Vitest across every package |

Never call `turbo` directly - it is a project dependency, not a global command.
`bun run <script>` invokes the local copy.

## Status

**Working now**
- Web lane: the `/support` page, the HTTP `route` (web-lane-only), the agent definition, and the
  tools.
- Convex data layer: `orders`, `tickets`, `outbox` with their functions, unit-tested.
- The guarded `send_reply` (lane gate + 5-second cancellable outbox), unit-tested.

**Next steps (not yet wired)**
- The inbound WhatsApp channel (`apps/agent/src/channels/twilio.ts`) that dispatches Twilio webhooks
  to `id = whatsapp:+1…`.
- A live-run script for the agent (`flue dev` / `flue run`); today the agent is defined and
  unit-tested, not run against a model here.
- Deployment: the Flue agent needs a long-lived host (Railway/Fly or Cloudflare Durable Objects),
  the web app goes to Vercel, and Convex is already cloud.
