# Custos / AgentID — Session Handoff Report

Written for: continuing this work on a different machine, in a fresh Claude Code session. Read this fully before doing anything else — it replaces re-deriving context from Notion and the codebase from scratch.

Date of this report: 2026-09-19

---

## 1. What this project is

**Custos** (originally named **AgentID**, same project — see naming note below) is a trust layer for AI agents: cryptographic identity, credential dispossession (agents never hold raw API keys), call-time authorization, sub-second cross-tool revocation, and verifiable audit. Positioning: _"MCP and A2A define how agents communicate. Custos defines whether they should be trusted and what they're allowed to do — TLS for agentic services."_

Full background (origin story, product definition, architecture, tech stack, competitive landscape, business model, DID/VC learning notes, repo setup notes) lives in a **Notion workspace**: page titled **"🔐 Custos — Project Hub"**, with 10 numbered child pages. This was fully read in the session that produced this report — see section 6 for the condensed summary, or re-fetch via Notion MCP (`notion-search` for "Custos — Project Hub", then fetch the hub page and its 10 children) for the complete original text.

Owner: Lakshya Karira — CS student at DSCE Bengaluru, founding AI engineer at Capmob. Building solo.

**Naming note:** the project's Notion pages, PRD/BRD PDFs, and some diagrams predate a rename and call it "AgentID." The actual code and current docs call it "Custos." Same project — treat AgentID and Custos as interchangeable names for this one project, but **see section 3 on which GitHub repo to push to going forward.**

---

## 2. Repository layout on disk (as of this session)

```
E:\AgentID\                          ← outer folder, its own git repo
├── .git\                            ← initialized this session, remote = KariraLakshya/AgentID.git, no commits yet
├── report.md                        ← this file
└── CUSTOS\                          ← the actual project, ITS OWN NESTED git repo
    ├── .git\                        ← remote = KariraLakshya/Custos.git, branch main @ 16e5a3b, Phase 0-3 merged
    ├── CLAUDE.md                    ← engineering instructions + Section 0 "Project state" (the real technical handover doc — READ THIS, it's very detailed)
    ├── README.md
    ├── docs/
    │   ├── build-plan.md            ← phase order/DONE criteria, CURRENT line says "Phase 5"
    │   ├── progress.md              ← plain-language phase-by-phase log, newest entry on top
    │   ├── prd.pdf, brd.pdf         ← read-only reference (predate the Custos rename, say "AgentID")
    │   └── adr/0001..0006           ← architecture decision records
    ├── apps/
    │   ├── cli/                     ← `custos` CLI (register, verify, use, deprovision, grant, audit-log)
    │   └── dashboard/                ← minimal live dashboard (Phase 5, built, untracked in git — new work)
    ├── packages/                    ← core, contracts, sdk, connectors, observability, config, testing — RESTORED this session, see section 4
    ├── services/                    ← identity, vault, revocation, audit — RESTORED this session, see section 4
    ├── tooling/                     ← tsconfig, eslint-config, vitest-config — RESTORED this session, see section 4
    ├── infra/                       ← Docker Compose (Postgres + Redis), Drizzle migrations
    └── graphify-out/                ← a Graphify knowledge-graph run over this codebase, dated 2026-09-07 — PREDATES Phase 4/5, so it only reflects the codebase through ~Phase 3
```

**Two separate git repos are nested inside each other.** This has not been resolved yet — see section 3.

---

## 3. IMPORTANT: which repo to push to

The user explicitly instructed (2026-09-19): **from now on, push to the `AgentID` GitHub repo (`https://github.com/KariraLakshya/AgentID.git`), not the `Custos` repo (`https://github.com/KariraLakshya/Custos.git`).**

This has **not yet been executed** — the CUSTOS folder's nested git repo still has `origin` pointing at `Custos.git`, and it has real commit history there (Phase 0 through Phase 3, merged via PR #28, CI green). The outer `E:\AgentID` repo is empty with no commits.

**Before pushing anything for this project, resolve this first.** Options that were being considered, not yet decided:

- Repoint `CUSTOS/.git`'s `origin` remote to `AgentID.git` and push the existing history there directly (keeps all Phase 0-3 history and commit hashes).
- Flatten `CUSTOS/`'s contents up into the `E:\AgentID` root and use the outer repo as the real one (would need history import or a fresh start — ask the user which they want, this is a real decision with consequences for existing commit history and any open PRs/branches on `Custos.git`).

Do not assume; ask if unclear when this actually needs to happen.

---

## 4. The folder-recovery situation (resolved this session, mostly)

**What happened:** while transferring the CUSTOS project to this machine, the copy got stuck partway through, and `packages/`, `services/`, and `tooling/` — the entire shared-library and backend-service code, 141 files — never made it to disk. `git status` inside `CUSTOS/` showed all of them as deleted (`D`), even though `.git`'s history was intact.

**What was done:** ran `git checkout HEAD -- packages/ services/ tooling/` inside `E:\AgentID\CUSTOS`. This restored the Phase 0 → Phase 3 committed baseline (identity core, credential vault/dispossession, revocation engine) exactly as it existed at the last commit (`16e5a3b`, a CI fix on top of Phase 3 merge PR #28).

**What could NOT be recovered this way, and is still genuinely missing:** the **Phase 4 (Authorization & audit)** and part of **Phase 5** code that lived inside those same folders was finished, tested, and verified locally per `docs/progress.md` and `CLAUDE.md` Section 0 — **but was never committed to git**, so there's no blob to restore. Specifically still missing from disk:

- `packages/core/src/audit/record.ts` (`issueAuditRecord`/`verifyAuditRecord`)
- `packages/connectors`'s `dataCategories` static field additions to each connector
- `services/vault`'s `agent_policies` table + `policy/policy.ts` (`grantToolAccess`/`isToolAllowed`) + `audit/report.ts` (`AuditReporter`, fire-and-forget push)
- `services/audit`'s real implementation (it's currently back to its Phase 0 health-check-only shell after the restore) — including the read-time-signing fix for the "signing key regenerates on restart" bug described in `docs/progress.md`'s 2026-09-12 entry

**What survived on disk the whole time (never deleted, shown as modified/untracked in git, not lost):**

- `apps/cli/src/grant.ts`, `apps/cli/src/audit-log.ts` (+ their tests) — the CLI commands that call the (currently-missing) Phase 4 vault/audit logic
- `apps/cli/src/cli.ts` (modified, wires up the new commands)
- `apps/dashboard/` — the entire Phase 5 dashboard app (depends on `@custos/config` etc., won't build until those packages have the Phase 4/5 code they expect — e.g. `services/audit`'s `env.ts` PORT default 4005)
- `docs/adr/0006-authorization-and-audit-architecture.md`
- `infra/migrations/0004_cynical_kree.sql` + its Drizzle snapshot (adds `agent_policies` and `audit_records` tables)
- `docs/build-plan.md` (CURRENT line bumped to Phase 5), `docs/progress.md` (has the full Phase 4 narrative entry), `CLAUDE.md` (Section 0 has an extremely detailed, function-by-function description of exactly what the missing Phase 4 code did and why — **this is the spec to rebuild against**, not a from-scratch guess)

**Net state right now:** the repo builds and runs at the Phase 3 level (identity, vault, revocation all real and working). Phase 4's authorization/audit logic and the DB migration for it need to be **re-implemented inside `packages/core`, `services/vault`, and `services/audit`** to match what `CLAUDE.md` Section 0 (lines ~77-86 as of this session) describes, so that the surviving CLI commands (`grant`, `audit-log`) and the dashboard actually have something to call. This is well-specified reconstruction, not exploration — the ADR, the progress log, and CLAUDE.md's handover section together describe the exact intended behavior, file paths, and even the specific restart-signing bug that was found and fixed.

**Worth checking with the user before doing this by hand:** whether the _source_ machine/folder this was originally copied from still has an intact copy — a re-copy would be strictly faster and more faithful than reconstructing Phase 4 from the spec.

---

## 5. Hackathon context

The user is treating this as an **8-12 hour hackathon marathon** and wants to ship features + a frontend to present. This conversation was about to move into planning that (priorities, what's realistic in the time box, what makes the best live demo) when this report was requested for transfer to another laptop — **that planning discussion has not happened yet**. Pick it up from here.

Relevant existing material to plan from:

- Phase 5's DONE criterion (`docs/build-plan.md`): minimal SDK (`register()`/`connect(tool)`/`deprovision()`), clean CLI, a visual revocation moment, and a README that gets a stranger from zero to working — dashboard partially covers "visual moment" already (see section 4).
- Notion page 01 ("Problem & origin") describes a sharper, more visceral demo than plain revocation: an agent recovering a "deleted" file from git history, and Custos blocking that specific access path while letting the agent's real task succeed. Flagged in Notion as "a more visceral thirty seconds than revocation" and not yet built anywhere in the codebase — a candidate hackathon feature if there's time.
- Notion page 07 (Competitive landscape) is a hard, honest read — worth remembering when scoping the demo narrative: don't pitch generic "AI agent security," the differentiated wedge is credential dispossession + real-time revocation + verifiable audit, demonstrated end-to-end.

No decisions were made yet on what to build for the hackathon. Next step on the new machine: resume that planning conversation before writing code.

---

## 6. Condensed Notion Project Hub summary (for quick reference; re-fetch Notion for full text)

- **01 Problem & origin:** static API keys have no identity, slow manual revocation, no field-level data minimization, mutable logs. Sharpest example: an agent recovering a deleted financial file from git history.
- **02 Product definition:** six trust questions (identity/auth/authz/data-policy/revocation/audit). MVP = one agent's complete safe lifecycle, not a shallow slice of all six. Trust ladder: self-host / hosted metadata-only / edge verifier / hosted+TEE.
- **03 Decision log:** framing evolved AI firewall → AgentID → data trust layer → agent-to-agent trust layer → "TLS for agentic services." `did:web` first, sidecar over library, hot/cold path split, KMS from day one, no Rust/eBPF/TEE/OPA in MVP.
- **04 Architecture:** hot path (sidecar, <10ms, push-based cache) vs cold path (control plane). Invariants: no network call on hot path, fail closed with bounded staleness, `packages/core` stays pure.
- **05 Tech stack:** TypeScript/Node 22, pnpm+Turborepo, `@noble` crypto, `did:web`/W3C VC, Fastify, Postgres/Drizzle, Redis, AWS KMS (interface only for now), Vitest with 95%/80% coverage gates.
- **06 Build plan:** Phases 0-5 = MVP; Phase 6 = post-MVP cross-org federation. Realistic pacing note: Capmob (the user's job) stays first priority, this is a side project.
- **07 Competitive landscape (hard read):** identity layer now an open standard (DIF's KYA-OS); commercial consolidation happening (SailPoint/Entro, Cisco/Astrix, CrowdStrike/SGNL, Microsoft Entra Agent ID); data layer occupied (Bedrock Data, Strac); runtime layer free from Microsoft. Closest direct competitor: **Fencio** (funded, Rust sidecar, open source). Genuine open gap: attenuable cross-protocol delegation provenance. India/DPDP angle is the one real opening. Decision: build anyway, eyes open.
- **08 Business model & GTM:** buyer = platform/infra teams first. Pricing = open-core + tiered platform fee (self-host is unmeterable, rules out per-call pricing). Apache 2.0 likely for the open core.
- **09 Learning notes:** DID/VC mechanics, the `assertionMethod` vs `authentication` key-authorization pitfall (a naive verifier that checks "did any key in the DID doc sign this" rather than "was this specific key authorized to sign credentials" is insecure), `did:web` resolution gotchas, TEE/attestation.
- **10 Repo files & Claude Code setup:** `CLAUDE.md` = how, `docs/build-plan.md` = when/what's next (editable), `docs/prd.pdf` = what/why (read-only). Confirms the AgentID → Custos naming history.

---

## 7. Suggested next actions on the new machine

1. Re-open this report and `CLAUDE.md` Section 0 first.
2. Resolve the repo question (section 3) before any push.
3. Decide: reconstruct Phase 4 from spec, or pull a fresh copy from the original source if it still exists intact.
4. Have the hackathon planning conversation (section 5) and pick a concrete, demoable scope for the time box.
5. `pnpm install` inside `CUSTOS/` and confirm `pnpm dev && pnpm test` still pass at the Phase 3 baseline before building on top.
