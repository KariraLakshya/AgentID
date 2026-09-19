# Custos hackathon demo frontend

## Context

This is a hackathon pitch, not the long-term product. Custos's own docs (Notion + `docs/build-plan.md`) explicitly cap the dashboard as "minimal, just enough to make the revocation moment visual" — that rule is for the real product's discipline, not for a demo that must win a room. The user has explicitly decided to override it for this purpose: build a frontend good enough to demo live and pitch to judges, on top of what's actually built.

What's actually built (verified by reading source, not docs): Phases 0–4 are real, tested Fastify services — `identity` (agent registration, DID + VC issuance), `vault` (credential dispossession, 60s scoped tokens, tool calls), `revocation` (tombstone broadcast, status list), `audit` (signed, hash-chained records). The CLI (`apps/cli`) already drives the full lifecycle. `apps/dashboard` today is one static HTML file with inline vanilla JS, served by a bare `node:http` server — it polls `/records` and `/revocations` and renders a live feed. No frontend framework exists anywhere in the repo yet.

The goal: turn `apps/dashboard` into a **Next.js** app that (a) opens with the pitch (the problem, the six questions, the TLS analogy — pulled from the project's own Notion docs) and (b) drives one real, live "single-agent trust handshake" end to end: register → grant → use a tool → revoke → watch it get cut off in under a second → see the signed audit trail. Real network calls to the real local services throughout — no mocked UI data — matching the project's own "depth reads as real" philosophy.

**Framework decision:** Next.js (App Router), chosen over a lighter Vite+React+hand-rolled-BFF split because Next's API routes (`app/api/*/route.ts`) serve as the BFF directly — no separate proxy server to write. One process, one framework, routing included, and a more recognizable name for judges. Trade-off accepted: it's a heavier dependency and introduces App Router/RSC conventions that don't exist elsewhere in this plain-TypeScript/NodeNext repo — scoped entirely to `apps/dashboard`, not imposed on the rest of the monorepo.

## Key facts driving the design

- **CORS is asymmetric today.** Only `GET /revocations` (revocation service) and `GET /records` (audit service) send `access-control-allow-origin: *`. Every write route needed for the demo — identity `POST /agents`, vault `POST /policies` / `POST /credentials` / `POST /tokens` / `POST /call`, revocation `POST /revocations` — sends no CORS header at all, so the browser cannot call them directly cross-origin. → **Next.js API routes proxy every call server-side**, sidestepping this without touching any production service's CORS posture.
- **Request shapes** (confirmed from `apps/cli` + each service's `server.ts`):
  - `POST {identity}/agents` — no body → `201 { id, did, didDocument, credential }`.
  - `POST {vault}/policies` — `{ agentId: <DID>, tool }` → `201`. (Field is named `agentId` but must carry the DID, not the identity UUID — a real inconsistency in the existing API, not something to silently "fix".)
  - `POST {vault}/tokens` — `{ tool, action, credential }` (the full credential object from registration) → `200 { token, expiresAt }` (60s TTL default).
  - `POST {vault}/call` — `{ token, action, input }` → `200 { result }`.
  - `POST {revocation}/revocations` — `{ agentId: <identity UUID>, reason? }` → `200 { agentId, agentDid, statusListIndex, revokedAt, alreadyRevoked, broadcast }`.
- **Tool connectors already wired at vault boot** (`services/vault/src/index.ts`): `stripe`, `mock-slack` (`post-message`), `mock-database` (`query`). Stripe needs real/test API keys — skip it for stage reliability. **Use `mock-slack` and `mock-database`** — both pure in-memory, zero external dependency.
- **`invokeTool` requires a stored vault credential even for mock connectors** (`services/vault/src/calls/invoke.ts:120-124`) — `POST /credentials` must be called once per tool before any call succeeds. This is plumbing, not part of the trust story — seed it lazily/idempotently from the API routes, don't expose it as a demo step.
- **No orchestration script exists** to run all services together — each only has a `start` script (`node dist/index.js`); root `pnpm dev` only brings up Postgres/Redis via Docker Compose. Demo-day reliability needs one command that starts everything.
- **Ports**: identity 4001, vault 4002, revocation 4003, audit 4004, dashboard 4005 (all via `PORT` env var, each service's `env.ts`).
- **`VAULT_MASTER_KEY`** has no code default — vault refuses to boot without a 64-hex-char env var. `.env.example` ships a placeholder; verify its length is actually 64 hex chars before the demo (generate a fresh one if not, via the one-liner already documented in `.env.example`).

## Architecture

### `apps/dashboard` becomes a Next.js app (App Router)

Replace the bare `node:http` server and static `index.html` with a Next.js app. It does two jobs:

1. **Renders the pitch + live demo UI** as React pages/components.
2. **API routes proxy every demo action server-side** (Node.js runtime, not Edge — needed so the in-memory demo state survives across requests):
   - `app/api/register/route.ts` → `POST` → identity `POST /agents`, stores the result as the current demo agent
   - `app/api/grant/route.ts` → `POST` body `{ tool }` → uses the current demo agent's DID → vault `POST /policies`
   - `app/api/use/route.ts` → `POST` body `{ tool, action, input }` → vault `POST /tokens` then `POST /call` (mirrors `apps/cli/src/use.ts`'s two-step logic), returns the combined result
   - `app/api/revoke/route.ts` → `POST` body `{ reason? }` → uses the current demo agent's identity UUID → revocation `POST /revocations`
   - `app/api/records/route.ts`, `app/api/revocations/route.ts` → `GET` → thin proxies to audit/revocation (keeps the frontend on one origin instead of relying on the two-endpoint CORS patchwork)

**Demo agent state**: held in a module-level in-memory store (`lib/demo-state.ts`, `{ id, did, credential } | null`), set by `/api/register`, read by the others. This is a single-presenter live demo, not multi-tenant, and runs via `next start` as one persistent Node process locally — matches the Notion MVP framing exactly ("the single-agent trust handshake... one agent's complete lifecycle"). Each route explicitly sets `export const runtime = "nodejs"` so this state is never silently broken by an Edge runtime default.

**Credential seeding**: `lib/proxy.ts` seeds dummy vault credentials for `mock-slack` and `mock-database` lazily on first use (idempotent, guarded by a module-level flag) rather than at a "boot" hook — Next.js has no clean equivalent of a standalone server's `index.ts` entrypoint, so lazy-seed-on-first-request is the robust pattern here.

New files under `apps/dashboard/`:

- `app/api/register/route.ts`, `app/api/grant/route.ts`, `app/api/use/route.ts`, `app/api/revoke/route.ts`, `app/api/records/route.ts`, `app/api/revocations/route.ts`
- `lib/demo-state.ts` — in-memory current-agent store
- `lib/proxy.ts` — fetch-based proxy functions to identity/vault/revocation (small, standalone — not imported from `apps/cli`, since apps don't import other apps per this repo's layering convention; the logic is a few lines each, cheap to duplicate rather than couple) + lazy credential seeding
- `lib/env.ts` — reuses the existing `@custos/config`-based pattern from the current `apps/dashboard/src/env.ts` for service URLs/ports

### Frontend pages/components (React, App Router)

- `app/page.tsx` — composes the sections below
- `components/Hero.tsx` — the pitch: one-liner, "MCP/A2A define _how_; Custos defines _whether to trust_", the six questions grid, the "Without Custos / With Custos" code comparison, a couple of external-validation stats — all content sourced from the project's own Notion pages (01 — Problem & origin, 02 — Product definition), not invented copy
- `components/TrustHandshake.tsx` — the centerpiece: a stepper (Identity → Grant → Use → Audit → Revoke) with buttons calling the `/api/*` routes, either step-by-step or via one "Run the handshake" auto-play button for stage reliability; shows the DID/credential/token/expiry as each step completes
- `components/LiveFeed.tsx`, `components/RevokedPanel.tsx` — ported faithfully from the current `index.html`'s proven polling/rendering logic (1.5s poll, decode-without-verify with the same "not a security check" disclosure copy, new-row flash animation, revocation-cut-off banner), rewritten as client components (`"use client"`) polling `/api/records` / `/api/revocations`
- `components/AuditTrail.tsx` — table view of records with a "signed & hash-chained" badge, footer note carried over: "run `custos audit-log` for an independently verified export"
- Styling: plain CSS (`app/globals.css`), extending the existing dashboard's dark theme (`:root` custom properties already designed in the current `index.html`) — no CSS framework, no time budget for one

**The "revocation moment"**: on revoke, start a client-side millisecond timer; the next denied-by-revocation banner (already detected today via `policy.rule === "revocation"`) stops it — this visually proves the sub-second claim live instead of asserting it in a slide.

### Config

- `apps/dashboard/tsconfig.json` — Next.js-generated shape (`moduleResolution: "bundler"`, `jsx: "preserve"`, `plugins: [{ "name": "next" }]`), layered with this repo's shared strictness (`strict`, `noUncheckedIndexedAccess`) from `@custos/tsconfig/base.json` where compatible — Next's own required compiler options take precedence where the two conflict, since the app won't build otherwise.
- `apps/dashboard/eslint.config.js` — `eslint-config-next` (brings React/JSX/hooks/a11y rules) layered with `@custos/eslint-config`'s shared `baseConfig`, scoped to this package only — no changes to the shared tooling package, since no other app needs React linting yet.
- `apps/dashboard/package.json` — becomes a Next.js app: `next`, `react`, `react-dom` as dependencies; `eslint-config-next` as devDependency; scripts: `dev` (`next dev -p 4005`), `build` (`next build`), `start` (`next start -p 4005`), `lint` (`next lint`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`, kept for any pure-logic unit tests in `lib/`).

### Demo orchestration

Add a root `demo` script (new `concurrently` devDependency, justified as: live-presentation reliability — starting 5 processes by hand across terminals is a real failure mode on stage) that builds everything and launches identity, vault, revocation, audit, and the dashboard (`next start`) together in one command, reading env vars from `.env`.

## What this does NOT touch

- No changes to `services/identity|vault|revocation|audit` route logic or their CORS posture — the API-route-proxy pattern exists specifically to avoid needing to.
- No `packages/sdk` or `packages/contracts` work — real Phase 5 gaps, but out of scope for a demo sprint; not pretending to close them.
- No Kubernetes/sidecar/deployment concerns.
- Stripe connector left unused for the demo (needs real credentials — not worth the stage risk).

## Verification

1. `pnpm --filter @custos/dashboard typecheck && pnpm --filter @custos/dashboard lint && pnpm --filter @custos/dashboard test`
2. `pnpm build && pnpm typecheck` repo-wide (turbo) — confirm the new Next.js app doesn't break other packages' builds
3. Manual live run: `pnpm dev` (Postgres/Redis) → new `pnpm demo` → open `http://localhost:4005` → click through Register → Grant → Use (mock-slack post-message, mock-database query) → Revoke → confirm the next Use attempt is denied within ~1s and the live feed/revoked panel/audit trail all update in real time.
