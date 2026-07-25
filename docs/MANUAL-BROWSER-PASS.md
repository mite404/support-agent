# Manual browser pass - the web lane, end to end

The one check no test in this repo performs: a human, in a real browser, signed in, typing into
`/support` and watching the agent answer from real Convex rows.

Think of it as the screening. Everything else is dailies: the unit tests check that each shot
parses, the integration tests check that the reels splice together, the render tests check that
the picture comes up on the screen at all. None of them watch the film with an audience. This
does.

It stays manual on purpose. CI has no browser, and the sign-in path needs `BETTER_AUTH_SECRET`
set inside the Convex deployment, which is a deployment-side secret no workflow should carry.
The agent evals in Commit 6 are the automatable proxy for the model half of this pass; they
cannot cover the browser half.

Everything below was verified against this repo on 2026-07-25 unless a line says otherwise.

---

## What you need before you start

| Requirement | How to check | If it is missing |
| --- | --- | --- |
| Dependencies installed for **your** platform | `bun install` | Run it. Never reuse a container's `node_modules`. |
| A Convex dev deployment linked | `packages/backend/.env.local` has `CONVEX_DEPLOYMENT` | `bun run dev:setup` |
| Deployment-side auth env | `cd packages/backend && npx convex env list` shows `BETTER_AUTH_SECRET` and `SITE_URL` | `npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"` and `npx convex env set SITE_URL "http://localhost:3001"` |
| `apps/web/.env` with real URLs | `NEXT_PUBLIC_CONVEX_URL` / `NEXT_PUBLIC_CONVEX_SITE_URL` are not the `example.convex.*` placeholders | Copy the real values from `npx convex dashboard`. The env schema rejects the placeholders by design. |
| `apps/agent/.env` with `OPENROUTER_API_KEY` **and** `CONVEX_URL` | `cat apps/agent/.env` | Add both. `CONVEX_URL` is the same `https://<deployment>.convex.cloud` the web app uses; without it the agent throws the moment a tool builds. |

`SITE_URL` inside the Convex deployment must be `http://localhost:3001`, not `:3000`. It is the
Better-Auth `baseURL` and `trustedOrigins` value (`packages/backend/convex/auth.ts`), so it points
at the **Next app**, not at the agent.

---

## The three processes

| Process | Command | Port | Why it is separate |
| --- | --- | --- | --- |
| Convex dev | `bun run dev:server` | cloud | Pushes functions and serves the reactive queries plus auth. |
| Next web app | `bun run dev:web` | 3001 | The chat surface at `/support`. |
| Flue agent | `bunx flue dev --target node --port 3000` (from `apps/agent`) | 3000 | A separate long-lived Node server. The browser talks to it directly. |

`bun run dev` starts the first two together (`apps/agent` has no `dev` script, so the agent is
never part of it). Use two terminals: one for `bun run dev`, one for the agent.

**Two flags that are not optional, both measured:**

- `--target node`. Without it the CLI refuses to start, because this project has no
  `flue.config.ts` to supply a target:

  ```
  $ bunx flue dev
  Error: [flue] Missing required `target`. Set it via `--target <node|cloudflare>` or in
  `flue.config.ts` as `target: "node"` (or `"cloudflare"`).
  ```

- `--port 3000`. Flue's own default port is **3583**, but `NEXT_PUBLIC_FLUE_BASE_URL` defaults to
  `http://localhost:3000` (`packages/env/src/web.ts`). Left alone, the browser posts to a port
  nothing is listening on. Pin the agent to 3000 with the flag, or point the web app at 3583 by
  setting `NEXT_PUBLIC_FLUE_BASE_URL=http://localhost:3583` in `apps/web/.env`. The flag is the
  smaller change and is what the rest of this document assumes.

---

## Step 1 - start the backend and the web app

```bash
bun run dev
```

Wait for Convex to finish its first push and for Next to print `Ready`. Open
<http://localhost:3001> and confirm the **API Status** dot on the home page is green
("Connected"). That dot is `api.healthCheck.get` answering; if it is red or stuck on orange, the
browser is not reaching Convex and nothing downstream will work.

## Step 2 - start the agent

```bash
cd apps/agent
bunx flue dev --target node --port 3000
```

Real output:

```
  flue v1.0.0-beta.9 ready in 194 ms
  └─ http://localhost:3000

  Agents:      support-assistant

05:47:21 watching for file changes...
```

The `Agents: support-assistant` line is the one that matters: the agent was discovered at
`src/agents/support-assistant.ts`. There is also a Node warning about
`packages/backend/convex/_generated/api.js` being "typeless"; it is harmless and unrelated to
this pass.

The agent terminal is **quiet during a conversation**. It logs no per-request line, and
`DEBUG=flue:*` only adds startup lines (`flue:dev starting`, `flue:dev:server node server ready`),
not request tracing. Do not wait for a log that will never arrive - use the browser's Network tab
instead.

## Step 3 - health check before you open a browser

Two `curl` calls prove the agent is up *and* that its lane gate is mounted. Both return HTTP 404;
the **error type in the body** is the signal, not the status code.

```bash
# Web lane: authorized, no conversation started yet.
curl -s http://localhost:3000/agents/support-assistant/web:demo_customer
```

```json
{"error":{"type":"stream_not_found","message":"Event stream \"agents/support-assistant/web:demo_customer\" was not found.","details":"Streams are created when their agent instance receives its first prompt or their workflow run starts."}}
```

```bash
# WhatsApp lane over HTTP: refused by `route` before the agent is ever reached.
curl -s http://localhost:3000/agents/support-assistant/whatsapp:+15550000
```

```json
{"error":{"type":"route_not_found","message":"No route matches GET /agents/support-assistant/whatsapp:+15550000.","details":"Verify the request method and path are correct."}}
```

`stream_not_found` means "your id was allowed through, there is just no transcript yet".
`route_not_found` means "the lane gate said no". Seeing both is the whole web-lane authorization
story in two commands. URL-encoding the colon (`web%3Ademo_customer`) changes nothing; the router
decodes before the gate runs, which is worth knowing because the browser encodes it.

CORS is already handled by the Flue server, so the cross-origin call from `:3001` to `:3000`
needs no configuration. Verified:

```bash
curl -s -i -X OPTIONS http://localhost:3000/agents/support-assistant/web:demo_customer \
  -H "Origin: http://localhost:3001" -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
```

```
HTTP/1.1 204 No Content
access-control-allow-origin: http://localhost:3001
access-control-allow-credentials: true
access-control-allow-methods: GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS
```

## Step 4 - seed the demo rows

```bash
cd packages/backend
npx convex run seed:run
```

That stages four orders under the default demo customer `web:demo_customer`
(`packages/backend/convex/seedData.ts` is the single source of truth for them, shared with the
tests, so the demo and the test suite cannot drift):

| Order | Status | What the customer is told |
| --- | --- | --- |
| `1234` | `shipped` | "Your order has shipped and is on its way." |
| `2345` | `packed` | "Your order is packed and getting ready to ship." |
| `3456` | `delivered` | "Your order has been delivered." |
| `4567` | `cancelled` | "Your order has been cancelled." |

Re-running is safe: each row is matched on `(customerId, orderNumber)` and patched in place.

## Step 5 - the catch: your signed-in id is **not** the demo customer

This is the part that silently ruins the demo, so read it before you type into the chat.

In this build the conversation id **is** the customer scope. `Chat.tsx` mints
`` id = `web:${userId}` `` from the signed-in Better-Auth user, `createSupportTools(id)` passes
that same string straight through as `customerId`, and `orders.getStatusFor` looks the row up on
the composite `(customerId, orderNumber)` index. So a signed-in human is `web:<yourUserId>`, and
the seeded rows belong to `web:demo_customer`. Different scope, no rows. Measured against the
live deployment:

```
"web:demo_customer"        → {"status":"shipped","orderNumber":"1234", ...}
"web:kx7abc123signedinuser" → null
"demo_customer"            → null
```

A signed-in user asking "where is order #1234" against an unseeded id gets a *correct* decline -
which looks exactly like a broken demo. Two ways to handle it, and the first is better:

**Recommended: let the miss happen once, then seed your id.** It costs one extra prompt and it
proves the anti-fabrication path with a real order number before you prove the happy path.

1. Sign up at <http://localhost:3001/support> (name, email, password of 8+ characters). Sign-up
   redirects to `/dashboard`, and the header has no link to `/support`, so navigate back to
   <http://localhost:3001/support> by hand.
2. Ask "where is order #1234". Expect a decline. This is Step 6's case 2 arriving early.
3. Open DevTools → Network, find the request to `localhost:3000`, and read the path:

   ```
   POST /agents/support-assistant/web%3A<yourUserId>
   ```

   `%3A` is the encoded colon. Everything after it is your user id. This is the exact string the
   tool uses as `customerId` - it comes from the same code path, so it cannot be stale or
   mistyped.
4. Re-seed under that id:

   ```bash
   cd packages/backend
   npx convex run seed:run '{"customerId": "web:<yourUserId>"}'
   ```

5. Ask again. Now it resolves.

**Alternative: seed first.** If you already know your user id from a previous session, run the
scoped seed before you open the chat and skip straight to Step 6.

## Step 6 - the pass itself

Two prompts. The second one matters more than the first.

**Case 1 - the lookup.** Type:

```
where is order #1234
```

Pass looks like: a reply that names the order and says it has **shipped**. The wording is the
model's, so do not require an exact sentence; require the status word and the order number. In
the Network tab you should see the POST to the agent and a streaming response, not an error.

**Case 2 - the decline (anti-fabrication).** Type:

```
where is order #9999
```

`9999` is not in the seed data under any scope; the query returns `null`, the tool converts that
to `found: false`, and the instructions in `support-assistant.ts` require the model to say so
plainly. Pass looks like: "I could not find that order on your account" or equivalent.

Fail looks like **any** invented status - "shipped", "packed", "delivered", "cancelled", a
tracking number, or a delivery date. This is the assertion the whole trust argument rests on, so
read the reply carefully rather than skimming it for tone.

A blank or empty-looking reply is a **different** failure and does not mean the agent fabricated
or refused: `moonshotai/kimi-k2.6` is a reasoning model, and a low output-token budget can be
consumed entirely by its reasoning, leaving `content: null` with no error anywhere. If a reply
comes back empty, suspect the token budget before you suspect the agent.

## Step 7 - look at the screen, not just the transcript

While you are here, be picky about the picture:

- Your own messages sit on the **trailing** edge in the filled bubble variant; the assistant's
  sit on the **leading** edge in the muted variant. (`apps/web/tests/chat.test.tsx` guards this,
  but the test cannot see a broken layout.)
- The transcript scrolls, and the jump-to-latest button appears when you scroll up.
- **Send** is disabled while the input is empty and while a reply is in flight.
- The textarea does not resize-jitter as you type.
- Long replies wrap inside the bubble rather than overflowing it.
- Light and dark both look right (the header's mode toggle).

Known cosmetic gaps as of 2026-07-25, not bugs to chase during the pass: the header links only to
`/` and `/dashboard`, so `/support` is unreachable by clicking; and sign-up drops you on
`/dashboard` rather than back where you started.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Error: [flue] Missing required target` | No `flue.config.ts` in `apps/agent` | Add `--target node` |
| Chat sends but nothing happens; Network shows a failed request to `:3000` | Agent running on its default 3583 | Restart it with `--port 3000`, or set `NEXT_PUBLIC_FLUE_BASE_URL=http://localhost:3583` |
| `route_not_found` for an id you expect to work | The id does not start with `web:` | Only the web lane is served over HTTP. `whatsapp:` ids arrive through the Twilio channel, which is not built yet. |
| Agent replies "I could not find that order" for a **seeded** order | The signed-in scope is `web:<userId>`, not `web:demo_customer` | Re-seed with your id (Step 5) |
| Reply is blank | Reasoning model consumed the output budget; `content` came back `null` | Raise the output token budget; 400+ is comfortable |
| Next fails at startup mentioning `example.convex.cloud` | Placeholder still in `apps/web/.env` | Put the real deployment URLs in |
| Agent throws `CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL) must be set` | `apps/agent/.env` is missing `CONVEX_URL` | Add it. `flue dev` loads `apps/agent/.env`; a built server does not. |
| Sign-in fails or the session never resolves | `BETTER_AUTH_SECRET` / `SITE_URL` unset **in the Convex deployment** | `npx convex env set ...` from `packages/backend`. These are deployment env vars, not local file vars. |
| Home-page status dot red | Convex dev not running, or functions not pushed | Restart `bun run dev:server` |

---

## What this pass does not prove

Say so out loud when you report it green, because the gap is where the next bug lives:

- **The WhatsApp lane.** `send_reply`, the outbox undo window, and the Twilio channel are all
  untouched here - a `web:` session refuses `send_reply` by design.
- **Anything deployed.** This is three local processes against a cloud Convex dev deployment.
- **Repeatability.** One human, one session, two prompts. The Commit 6 evals are what turn this
  into something a machine can re-run.
