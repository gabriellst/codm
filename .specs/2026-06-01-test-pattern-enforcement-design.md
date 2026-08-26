# Test Pattern Enforcement — Design Spec

> Status: draft for review · Date: 2026-06-01 · Scope: `packages/api/typescript` backend tests
> Source audit: 168 TS test files analysed by ~84 sonnet agents (workflow `wmmlz7fze`), 2026-06-01.

## Context

The `/test` skill (`.claude/skills/test/typescript/{SKILL.md,registry.yaml}`) documents 16 patterns (`TST-01..16`) and 16 bad practices (`bp-01..16`). Yet new backend tests — most authored by the agent harness — keep drifting away from those rules. A full-suite audit found **337 undocumented violations** plus heavy violation of already-documented rules.

The decisive observation (user): *"the agent harness gets a bad reference from somewhere, doesn't follow the guidelines properly."* The audit confirmed the mechanism: for the **hard cases** (error assertions, external-collaborator stubs, event-as-data seeding, test identifiers) there is **no canonical reference and no reusable primitive**, so each author independently picks a shape — and copies the nearest (bad) neighbour. The rot compounds.

## Problem

Three structural gaps cause the drift:

1. **The `given/` folder is incomplete.** It covers auth/tenancy/integration but has **no helpers for identity, billing, or analytics/sales**. Authors fill the vacuum with local `seed*`/`build*`/`make*` functions (79 occurrences; `seedAuthUser` copy-pasted verbatim across **8 identity files**). When an entity schema changes, every copy drifts independently.
2. **The hard-case idioms are undocumented and un-primitived.** No documented error-assertion idiom (64 files hand-roll `try/catch` + `(caught as BaseError).name`), no `Id` test-factory guidance (116 hardcoded UUID literals despite `Id.fromSeed` already used in sales tests), no typed fetch fake (7 integration-service files cast `as unknown as typeof fetch`), no event-as-data seeder (inline `seedCreated/seedPaid` saving via the repo), no clock guidance (6 `setTimeout` ordering hacks).
3. **The CLI scaffolds every artifact except its test.** `bun cli usecase|repository|handler|query` emits the artifact but **no `.test.ts`**, so a freshly-scaffolded artifact has zero test reference and the agent copies a neighbour.

Net effect — the same thing is done two contradictory ways across the suite (no canonical reference): error assertions, event-name assertions, test-id generation, fetch-stub typing, sort-order timing all have ≥2 competing forms in the tree.

### Evidence (audit + grep ground truth)

- 127 casts in test files: 55 `as any`, 20 `as never`, 52 `as unknown as`.
- 79 inline `seed/build/make` helpers; `seedAuthUser` × 8 identity files.
- 116 hardcoded UUID string literals (e.g. `'aaaaaaaa-0001-4000-8000-000000000001'`).
- 64 hand-rolled `try/catch` + cast error assertions; 0 use `tryCatchAsync`; 19 already use `toThrow`/`rejects`.
- 14+ integration files omit `ownerId` from `TestBed.create('integration', …)`.
- 7 integration-service files cast `as unknown as typeof fetch`; 6 files use `setTimeout` ordering hacks.
- Still-rampant documented violations: `bp-08` mock-mode misuse (11), `bp-12` register-infra (12), `bp-15` DrizzleClient hand-query (16).

## Goal

Every test idiom has **exactly one canonical form** that is (a) documented in the `/test` skill, (b) emitted by the CLI scaffold, and (c) backed by a reusable primitive — so the easy path and the correct path are identical, and **no bad neighbour is left to copy**. Then migrate all 168 existing files onto those canonical forms so the disease vectors are eliminated.

## Decisions

- **Enforcement layers (user-chosen):** CLI test scaffold + skill/registry codification + expanded given-helpers/fakes. **No hard CI lint gate** — review-check (`/review`, `bun review`) is the soft backstop. (A custom lint rule for bp-18/19/21 is recorded as optional future hardening, out of scope here.)
- **Remediation scope (user-chosen):** full sweep of all 168 TS test files.
- **Canonical error-assertion idiom** (grounded in passing code already in the tree):
  - sync (entity/VO): `expect(() => Store.create({…})).toThrow(BaseError)`
  - async + assert code: `await expect(uc.execute({…})).rejects.toMatchObject({ name: 'ERROR_CODE' })`
  - `tryCatchAsync` is a **production-code** convention; in tests use `expect().rejects`. The hand-rolled `try/catch` + cast is prohibited.
- **Canonical test identifier:** `Id.fromSeed('test', '<entity>', '<key>').value` (deterministic) or `Id.value()` (random/negative cases). No raw UUID literals.
- **Canonical given-API:** bare `givenX(testBed, overrides?)`, re-exported from `@test/support`. The `createGivenHelpers(testBed)` facade in `given/index.ts` is demoted (kept only if a consumer needs it; not the documented path).
- **Event-as-data seeding:** `givenDomainEvent(testBed, new XEvent({…}), { createdAt? })` — the sanctioned way to seed persisted domain events for query-over-events use cases (distinct from `bp-16` `givenEvent`, which remains forbidden for triggering in-process handlers).
- **bp- numbering continues the registry series:** new rules are `bp-17..bp-26` plus positive patterns `TST-17` (error idiom) and `TST-18` (one given-API).

## The Rule Set (to codify in `registry.yaml` + `SKILL.md`)

| ID | Rule | Count | Enforcement layer |
|---|---|---|---|
| bp-17 | Inline `seed/build/make` helpers must be promoted to `given/` (repo-direct, shipped with first consumer). Local fixtures allowed only inside a single `Drizzle*Repository.test.ts` with no cross-file reuse. | 79 | given-helper + review |
| bp-18 | Test identifiers via `Id.fromSeed(...).value` / `Id.value()`; no hardcoded UUID literals. | 116 | given (bakes it in) + scaffold + review |
| bp-19 | Errors via `expect(()=>…).toThrow(BaseError)` (sync) / `await expect(…).rejects.toMatchObject({ name })` (async); no try/catch+cast, no `tryCatchAsync` in tests. | 64 | skill + scaffold + review |
| bp-20 | Typed `fetchStub` (named fn matching `typeof fetch`) or shared `FakeFetch`; no `as unknown as typeof fetch`. | 7 files | fake + review |
| bp-21 | `TestBed.create('integration', …)` must pass `ownerId: 'integration-tenant'`. | 14+ | scaffold + review |
| bp-22 | No `setTimeout` timing hacks; order via explicit `createdAt` overrides / `flushOutbox()`. | 6 | givenDomainEvent + review |
| bp-23 | Assert event names via `EventClass.name`, never raw string literals. | — | skill + scaffold |
| bp-24 | No weak/dead assertions (`toBeDefined`/`toBeTruthy`/`length>0`) on known-present values. | 16 | review |
| bp-25 | Resolve shared collaborators in `beforeAll`, not inside each test body. | — | skill + scaffold |
| bp-26 | No private-field probing via `as any`; expose a typed query method instead. | 1+ | review |
| TST-17 | (positive) canonical error-assertion idiom (see Decisions). | — | skill + scaffold |
| TST-18 | (positive) one given-API: bare `givenX(testBed, …)`. | — | skill |

Already-documented but still-rampant rules (`bp-08`, `bp-12`, `bp-15`) are not new rules — the sweep removes them; review-check keeps them out.

## Workstream 1 — Primitives & fakes (`tests/support/`)

- `tests/support/ids.ts` → `testId(...segments: string[]): string` (deterministic `Id.fromSeed`) and re-export `Id.value()` usage guidance. Closes bp-18.
- `tests/support/given/events.ts` → `givenDomainEvent(testBed, event: BaseDomainEvent, opts?: { createdAt?: Date }): Promise<void>` (saves via `DomainEventRepository`). Closes the inline event-seed case + bp-22.
- `tests/support/fakes/FakeFetch.ts` → typed fetch fake: route→`Response` map + call capture, exported `FetchStub` type. Closes bp-20.
- **Grow `given/` to cover the missing contexts** (the highest-leverage action — also reduces bp-17/bp-18/bp-09):
  - `given/identity.ts` — `givenUserProfile`, `givenUserPreferences`, `givenFcmRegistrationToken` (replaces the 8× `seedAuthUser`).
  - `given/billing.ts` — `givenSubscription`, and `givenDomainEvent`-based subscription-event seeders.
  - `given/sales.ts` — `givenOrderOverride` (and order fixtures as needed).
  - `given/analytics.ts`, `given/catalog.ts`, `given/marketing.ts` — added as their first consumer is migrated.
  - All repo-direct, using `Id.fromSeed` internally, re-exported from `@test/support`.
- Resolve the dual given-API (TST-18): document bare `givenX`; demote the facade.

## Workstream 2 — Skill + registry codification

- `registry.yaml`: add `bp-17..bp-26`, `TST-17`, `TST-18` with `wrong`/`right` snippets; update `canonical_snippet` to show `givenDomainEvent`, `testId`, and the error idiom.
- `SKILL.md`: add a **"Hard cases"** section (error assertions, external-collaborator fakes, event-as-data seeding, identifiers, clock/ordering) and a **"Given helpers index"** listing the grown set. Add the explicit "in tests use `expect().rejects`, not `tryCatchAsync`" clarification.
- Update the project memory note `feedback_trycatch_over_raw` to scope it to production code (tests use `expect().rejects`).

## Workstream 3 — CLI test scaffold (`scripts/cli/` + registry `snippet`s)

- **Co-emission:** the `usecase`, `repository`, `handler`, `query` generators in `scripts/cli/backend/typescript/index.ts` emit a second colocated `X.test.ts` from new `registry.yaml` snippet blocks (`test:usecase`, `test:repository`, `test:handler`, `test:query`). Bindings added in `bindings.ts`, adapters in `templates.ts`. Each snippet bakes in: the 3-hook lifecycle, `ownerId:'integration-tenant'`, `testBed.resolve(...)`, given usage, the error idiom, `EventClass.name` assertions.
- **Dedicated verbs:** `bun cli test usecase|repository|handler|flow <ctx> <name>` (retrofit an existing artifact) and `bun cli given <ctx> <name>` (new given helper). Wired into the generator map + help text + `docs/CLI.md`.
- Update the `scaffold:` lines in the relevant skills to point at the new test verbs (per the "if you wrote it, the CLI should write it" house rule).

## Workstream 4 — Full sweep (all 168 files)

Runs **after** workstreams 1–3 (there must be a target to migrate toward and blessed exemplars). Workflow-driven: a `pipeline` over the file list, one agent per file, each rewrites onto the canonical primitives/idioms; per-wave gate is `bun tsc` + `bun run test` green, then commit.

- **Wave 0 — foundations + exemplars.** Ship WS1–WS3. Bless reference files (already idiomatic): `DrizzleOrderOverrideRepository.test.ts` (Id.fromSeed), tenancy/identity/auth use-case tests (`rejects.toThrow`), `BillingWebhookReceivedHandler.test.ts` (`EventClass.name`), `given/users.ts`+`given/stores.ts`.
- **Wave 1 — top bad-references (highest copy-risk).** `integration/services/*` cast cluster (HandshakeService ×12, OAuthCodeExchanger ×9, the Webhook/AdditionalPlatform tests), the 2 `tests/flows/*`, `ListSubscriptionEventHistory.test.ts`.
- **Wave 2 — identity & billing & analytics use-case/handler tests.** Replace `seedAuthUser`/`seed*` with new given helpers; apply error idiom + `Id`.
- **Wave 3 — repositories + entities/VOs across remaining contexts.** UUID literals, dead assertions, `ownerId`, collaborator resolution.

## Enforcement mapping (no lint gate)

| Vector | Born-correct (scaffold + primitives) | Documented (skill/registry) | Backstop (review) |
|---|---|---|---|
| New artifact | co-emitted canonical `.test.ts` | SKILL "Hard cases" + canonical_snippet | `/review`, `bun review` flag bp-17..26 |
| New given helper | `bun cli given` | TST-13/18 + given index | review flags inline seeds (bp-17) |
| Migration | exemplars + primitives | rule set | per-wave `tsc`+`test` gate |

## Acceptance criteria

1. `tests/support/ids.ts`, `given/events.ts`, `fakes/FakeFetch.ts` exist, are exported from `@test/support`, and have their own tests where behaviour warrants.
2. `given/` has helpers for identity, billing, and sales (others added with first consumer); `seedAuthUser` and its 7 siblings are deleted in favour of a shared helper.
3. `registry.yaml` contains `bp-17..bp-26` + `TST-17/18`; `SKILL.md` documents the hard-case idioms and the given index.
4. `bun cli usecase|repository|handler|query` co-emits a canonical `.test.ts`; `bun cli test …` and `bun cli given …` verbs work and are in `docs/CLI.md`.
5. All 168 files migrated: 0 `as never`, 0 `as unknown as typeof fetch`, 0 hardcoded UUID literals, 0 hand-rolled try/catch+cast, 0 `setTimeout` ordering hacks, 0 inline cross-file seed fns; every `TestBed.create('integration')` passes `ownerId`.
6. `bun tsc` + `bun run test` green at every wave boundary; `bun review` on the suite reports no bp-17..26 findings.

## Out of scope / future

- Go test suite (`packages/api/go`, 102 files) — different rubric + stale registries; separate follow-up.
- Optional hardening: a custom ESLint rule in `eslint.config.ts` to make bp-18/19/21 build-breaking (the audit recommended it; deferred per the no-lint-gate decision).
- Frontend test patterns.

## Open questions

- `testId` API shape: variadic segments (`testId('store','a')`) vs single string (`testId('store-a')`) — pick during WS1.
- Whether co-emitted tests should be `--print`-only (agent wires) or written-to-disk by default like other artifacts.
