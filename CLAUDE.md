# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Protocolo de sesión

Antes de tocar código, leer `bitacora/Instrucciones.md` — define el protocolo
de inicio/cierre de sesión (qué leer primero, cómo manejar procesos en
background, cómo cerrar) y los principios generales de trabajo en este repo.

## Commands

```bash
npm run dev          # Next.js dev server (port 3000 by default)
npm run build        # Production build
npm run start        # Serve production build
npm run lint         # next lint

npm run worker       # OSINT BullMQ worker (tsx, loads .env via dotenv/config)
npm run dev:all      # next dev + worker concurrently
```

There is no test script in `package.json` — no automated test suite is
configured for this repo. Verification is done via `tsc --noEmit` and, for
OSINT changes, by running isolated scripts against real APIs (see
`scripts/test-*.ts` for examples of the pattern: instantiate a provider
directly with a minimal `ProviderContext`, no mocking).

Type-check without emitting:
```bash
npx tsc --noEmit
```

Prisma:
```bash
npx prisma db push          # sync schema without generating a migration
npx prisma migrate dev       # generate + apply a migration (migration history is incomplete — see below)
npx tsx --require dotenv/config scripts/safe-seed.ts   # seed (the configured `prisma.seed` script)
```

**Package manager note:** `pnpm-workspace.yaml` is present but malformed
(missing the `packages` field) and blocks `pnpm install`. Use
`npm install --legacy-peer-deps` instead until that's fixed.

## Architecture

This is a Next.js 14 (App Router) real-estate CRM/sales platform ("CVA
Deal") with an OSINT lead-enrichment module bolted on. Two very different
parts of the codebase to know about:

### The app (CRM, properties, orders, etc.)

Standard Next.js App Router structure under `app/`: route folders pair a
page with a co-located `_components/` folder, and `app/api/**/route.ts`
holds the API handlers. Auth is NextAuth (`lib/auth.ts` / `authOptions`,
credentials-based, roles `admin`/`advisor`) — API routes that require auth
call `getServerSession(authOptions)` and check `session.user.role`.

Data layer is Prisma (`prisma/schema.prisma`) via a singleton client at
`lib/db.ts` (exports `prisma`, not `db` — a few files still import the
wrong name and are broken, see below). Key domains: `Property`/`Order`/
`CartItem` (sales), `CRMClient`/`CRMStage`/`CRMActivityLog`/`ClientNote`
(CRM), `OsintRun`/`OsintEntity`/`OsintRelation`/`OsintEvidence`/
`OsintSearchCache`/`OsintFeedback` (OSINT persistence, see below).
**Migration history is incomplete** (no base migration creating
`crm_clients` and other tables) — use `prisma db push` rather than
generating new migrations against this history.

Styling conventions (Tailwind + CSS variable design tokens, typography
scale, spacing rhythm) are documented in `STYLE_GUIDE.md` — read it before
touching shared layout (`app/layout.tsx`) or introducing new color/spacing
values.

### The OSINT module (`lib/osint/`)

This is the one actually wired into production (the "Enriquecer perfil"
button in the CRM). **`lib/enrichment/` and `lib/scraper.ts` are dead
code from an earlier implementation** — don't extend them; anything real
lives under `lib/osint/core/`. `lib/osint/osint.service.ts` is the
compatibility shim between the new pipeline and the CRM UI's expected
`EnrichmentResult` shape (`lib/enrichment/types.ts`).

It's a multi-agent pipeline orchestrated by an adaptive planner, not a
fixed script:

- **`core/agents/planner-agent.ts`** — the loop. Each cycle: assess
  knowledge state → generate candidate actions → score by Expected
  Information Gain (EIG) → execute the best action → merge results into
  the graph → check termination (`maxCycles`/`maxDurationMs`/`maxCostUsd`/
  confidence threshold). Budget enforcement only happens *between* cycles
  in the loop itself; a single slow action is raced against the remaining
  time budget via `executeActionWithTimeout` (the underlying provider call
  isn't cancelled, just no longer awaited).
- **`core/agents/*-agent.ts`** — one agent per entity type (identity,
  company, social, phone, email, news, website). Agents implement
  `BaseAgent.execute()` and call `this.searchProviders(query, capability,
  ctx)` rather than talking to a specific provider — provider selection is
  the registry's job.
- **`core/providers/provider.factory.ts`** + **`provider.registry.ts`** —
  provider plugin system. Adding a provider means creating a file
  implementing `OsintProvider` (`provider.interface.ts`) and registering it
  in the factory's `PROVIDER_CONFIGS` + `createAllProviders()`; nothing
  else needs to change. `executeWithFallback()` scores all providers for a
  requested capability (weighted: reliability 0.35, cost 0.20, latency
  0.15, successRate 0.20, priority 0.10 — see `provider.scoring.ts`) and
  walks the ranked list, only stopping on a provider that returns
  non-empty results (a 0-result "success" falls through to the next one).
- **`core/persistence/knowledge-graph.ts`** + **`graph-store.ts`** — the
  in-memory graph built during a run, persisted to the `Osint*` Prisma
  tables at the end. `upsertEntity()` keys on `{type, naturalKey}`;
  `KnowledgeGraph.persistToStore()` remaps in-run entity IDs to persisted
  IDs before saving relations/evidence, since a matched existing entity
  keeps its original DB id.
- **`core/confidence/confidence-engine.ts`** — recomputes
  `entity.confidence` from `entity.evidence` (a list of `EvidenceRef` with
  a `matchType: SignalType`) at `finalize()`. Setting `entity.confidence`
  directly in an agent is a no-op once this runs — confidence signals have
  to be pushed as evidence via `makeEvidenceRef()`.
- **`core/agents/ai-reasoner.ts`** (needs `OPENAI_API_KEY`) and
  **`core/agents/rule-based-reasoner.ts`** (keyword/heuristic fallback,
  what actually runs without a key) both produce the same `AIInsights`
  shape — `osint.service.ts` tries the AI one first and falls back to
  rules. News items get a `category` (expansion/investment/hiring/award/
  event/public_tender/...) from `news-agent.ts`'s `categorizeNews()`;
  `core/infrastructure/news-conclusions.ts` turns that into actionable
  sales-facing sentences rather than raw counts.
- **`lib/queue/osint.worker.ts`** — the BullMQ worker process (must be
  running separately from `next dev`; `npm run dev:all` starts both). It
  calls `osintService.enrich()` and writes the result back onto the
  `CRMClient` row (`insights`/`lastEnriched`/`socialLinks`/`profession`/
  `company`) — the CRM UI reads those columns directly, not the `Osint*`
  graph tables.

Known broken/incomplete pieces, so as not to rediscover them: `google_cse`
provider returns 403 (Custom Search JSON API not enabled on the configured
GCP project); `core/learning/weight-calibrator.ts` imports `{ db }` from
`@/lib/db` which doesn't exist (dead in practice); `core/learning/
strategy-optimizer.ts` returns hardcoded discovery probabilities and never
queries historical `OsintRun` data despite its docstring; `core/memory/
memory-store.ts`'s `invalidate()`/`invalidateByType()` have no callers.
