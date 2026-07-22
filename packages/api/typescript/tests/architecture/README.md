# Architecture rails

Mechanical guards that keep the test suite (and the code it exercises) honest. Each rail is a plain
`bun:test` file that scans the tree and fails the build when a convention is violated — a rung on the
ladder from "documented convention" up to "the CI can't be green while it's broken". A rail is always
paired with the doctrine it enforces (below), so a failure points at the rule, not just a line number.

| Rail | Enforces |
|---|---|
| `probe-discipline.test.ts` | Tests read persisted state through `testBed.probe()`, never a raw `resolve(DrizzleClient)` (see "Reading Persisted State" below). |
| `tx-discipline.test.ts` | Every awaited `this.*` call inside a `withTransaction` callback threads the callback's `tx` param — no phantom-atomic dual-writes (cc-bp-24; see "The rung ladder" + "Coupling" below). |
| `console-discipline.test.ts` | Production code under `src/` logs through the injected `LoggingService`, never a raw `console.*` (see "Coupling: derivable vs. legitimate" below). |
| `allowlist-liveness.test.ts` | Every allowlist/exemption entry still matches something real: `slice-closure.allow.yaml` events exist in the walked tree, the discipline rails' `EXEMPTIONS` name existing files that still contain the exempted pattern, `import-direction.ts` exception prefixes still match scanned files. A fossil permission is removed, never inherited. (context-map `POLICY_EXCEPTIONS` are liveness-gated inside `context-map.test.ts` itself.) |
| `env-model.test.ts` | The env registry (template.config.ts `REPO.env`) and reality can't drift: Zod schema keys ↔ registry keys, Go `config.go` reads ⊆ declared, committed `.env.example` == the generated render. |
| `context-map.test.ts` | Every cross-context import has a DECLARED edge in `CONTEXT_MAP`, respects `CROSS_CONTEXT_POLICY` surfaces (or carries a named, liveness-gated exception), 2-cycles are annotated partnerships, and `CONTEXTS.pgSchema` matches the contracts schema files. |
| `wiring-completeness.test.ts` | An artifact that exists is REGISTERED: every handler in its context barrel, every job referenced by its context index, every controller class exported from the controllers barrel — orphan files are dead wiring. |
| `enum-placement.test.ts` | Cross-boundary enums live in `packages/contracts` (guarded set DERIVED by importing the wire binding) — never mirrored in `@shared` or a context. |
| `event-placement.test.ts` | Integration events are authored in contracts (TypeSpec) and consumed from the wire binding; domain events stay context-local. |
| `event-name-discipline.test.ts` | No src event claims the reserved `integration.` name prefix — the outbox routes to the external mediator by that prefix, and only contracts codegen may mint it. |
| `error-coherence.test.ts` | Per context: string-literal members of the exported `*Errors` unions == the `registerErrorCodes({...})` keys in the same file (ghost code → unreachable blanket 500; zombie key → dead entry). |
| `i18n-coherence.test.ts` | `pt.json`/`en.json` key-set parity, and every literal `t('…')`/`i18nPrefix` key in the react app resolves in the catalogue (plural families + keyPrefix bindings modeled; unreferenced leaves warn-only). |
| `product-residue.test.ts` | No banned product-specific vocabulary survives in `src/`, `.claude/skills/` or `examples/` (provenance headers exempt) — the template stays product-free. |

Add a rail here when a convention is worth mechanizing repo-wide; keep its doctrine in this README so
the failure message can point at a rung, not fresh prose.

---

## The rung ladder — why a rail (not a doc, not a type)

Every correctness concern is owned at the **cheapest rung that can hold it**:

1. **Eliminate** — make the mistake unrepresentable (types, codegen, a schema-derived union). Best rung: a violation can't compile.
2. **Detect** — a mechanical walker / lint / CI check that scans source text (or an AST) and fails the build. This is where a *rail* lives.
3. **Document** — a written convention a human reads and applies (a `SKILL.md` pattern, a `CLAUDE.md` rule, a `registry.yaml` bad-practice).
4. **Measure** — eval probes / sampling that surface drift after the fact.

Prefer the lowest number the concern can sit at. **Escalation policy:** a documented canon (rung 3) that is *violated in practice* — a real diff slips a raw `console.*` past review, a write inside a tx forgets to thread `tx` — escalates to a **detector (rung 2)**, not a louder rewrite of the doc. That's the whole reason the files in this folder exist: each started as a rung-3 written convention (a skill pattern, a `.claude/registry.yaml` entry like cc-bp-24) that couldn't hold the line by prose alone.

A rail is deliberately *not* rung 1: `tx` being an optional parameter, and `console` being a global, are both representable by construction — the type system can't forbid them without breaking legitimate uses. Rung 2 is the cheapest rung that *can* hold these.

## Coupling: derivable vs. legitimate

Every rail has SOME coupling to the code it scans — the question is whether that coupling is *derivable* (it should come from a manifest/type, so a rename fails the build) or *legitimate* (a fact about a specific file that has no generic source of truth):

- **`tx-discipline.test.ts`** is repo-wide with ZERO context-name coupling — a pure syntax scan of every `.ts` under `src/` for one shape (an awaited `this.*` inside a `withTransaction` callback that never mentions the callback's `tx` param), independent of which bounded context the file belongs to. Its `EXEMPTIONS` array is empty today (the tree is clean); any future entry names a specific call with a `why` and a `// TODO`.

- **`console-discipline.test.ts`** is repo-wide too. Its `EXEMPTIONS` name specific FILES (not contexts) legitimately allowed a raw `console.*`: `index.ts` (the composition root / bootstrap + shutdown handlers, which run before and after the DI window and must survive a broken `LoggingService` binding) and a scaffold handler carrying a `// TODO` to migrate onto the injected `LoggingService`. That's the "legitimate" flavor of coupling: not a domain fact, but a per-file exception with its own `why`.

- **`probe-discipline.test.ts`** is the same per-file-`EXEMPTIONS` flavor: it names the specific files legitimately allowed to `resolve(DrizzleClient)` directly (a service's own DB-backed test, a write-only seed), each with a `why`.

**Rule of thumb:** if a rail's forbidden/allowed set could be computed from a type or manifest that already exists, derive it (and prove the derivation is behavior-preserving). If the coupling names a specific file with a real, non-derivable reason, name it explicitly in `EXEMPTIONS` with a `why` — **never weaken the detector's matching to make a false positive disappear silently.** A weakened regex is a hole every future file falls through; a named exemption is a hole exactly one file falls through, with a reason attached.

Run the whole folder: `bun test tests/architecture` (from `packages/api/typescript`). Each file also runs as part of the full suite.

---

## Reading Persisted State

There are exactly 4 ways a test is allowed to read state that a previous step persisted. Which one
applies is a taxonomy, not a preference — pick by what the read is actually about:

| # | Category | Read through | Example |
|---|----------|--------------|---------|
| 1 | Domain state | **Repository** (production vocabulary) | `userProfileRepository.findByUserId(...)` |
| 2 | Event/outbox facts | **Probe** (technical questions production never asks) | `testBed.probe().persistedEvents({ name })` |
| 3 | The DB itself is the subject | **Raw `DrizzleClient`**, with a named exemption in the detector | `Drizzle*Repository.test.ts`, schema-drift / DB-service tests |
| 4 | Infra seed (prerequisite state, not an assertion) | **Given-helper** | `testBed.given.session({ userId })` |

### 1. Domain state → repository

If a repository already has the read you need (e.g. `findByOwnerId`, `findByUserId`), use it. It
returns hydrated entities and is the already-sanctioned domain read path — the same one production
code uses.

```ts
// CORRECT — repository read, same vocabulary production uses
const profile = await userProfileRepository.findByUserId(userId)
```

### 2. Event/outbox facts → probe

Tests never resolve `DrizzleClient` or import schema tables directly to assert on persisted
events/outbox rows or cross-table invariants. That's infrastructure coupling — it leaks table/column
shape into every test file and makes a schema rename a many-file grep-and-replace instead of a
one-file change. These reads go through `testBed.probe()` (`PersistenceProbe`, in
`tests/support/PersistenceProbe.ts`, exported via `@test/support`):

```ts
// WRONG — resolving DrizzleClient + raw schema tables in a test
import { DrizzleClient } from '@codedm/core-typescript'
import { events } from '@codedm/contracts/db'
const rows = await testBed.resolve(DrizzleClient).select().from(events).where(eq(events.name, SomeEvent.name))

// CORRECT — via the probe
const rows = await testBed.probe().persistedEvents({ name: SomeEvent.name })
```

`PersistenceProbe` is context-agnostic — its table registry (`PROBE_TABLES` in
`tests/support/PersistenceProbe.ts`) is DERIVED from the `@codedm/contracts/db` schema barrel
(every `PgTable` export, filtered via `is(x, PgTable)`), so it covers every table in the codebase,
not a curated list. Keys are namespaced `<pgSchema>.<export>` — the Postgres schema each table lives
in, read off its Drizzle type at compile time and `getTableConfig(...).schema` at runtime
(`'shared.events'`, `'billing.billingSubscriptions'`, `'sales.orders'`...) so tables in different
schemas can never collide on export name. A new bounded context that adds tables (re-exported through
the barrel) grows the `ProbeTable` union automatically, no change to the probe. (The origin system
did this with one `import * as <module>` per schema file; here the schema lives in a separate
`composite`-project package, so the flat barrel is the one seam that resolves cleanly — the module
namespace is recovered from each table's own `pgSchema`.) Surface:
`persistedEvents({ name?, ownerId?, entityId? })`, `outboxRows({ name?, ownerId? })`,
`count(table, filter?)`, and the **typed** `snapshot(tables)`:

```ts
// snapshot() is TYPED — the return shape is derived from the literal tuple passed in.
// A typo'd key is a compile error, not a silently-undefined runtime lookup.
const before = await testBed.probe().snapshot(['shared.events', 'shared.outbox'] as const)
// before: { 'shared.events': number; 'shared.outbox': number }
// ...
expect(await testBed.probe().snapshot(['shared.events', 'shared.outbox'] as const)).toEqual(before)
```

There is no shared, curated multi-table convenience. Callers declare the tuple they need inline at
the call site, in the vocabulary the test cares about:

```ts
// a job that must prove it never touched `billing.billingSubscriptions` composes the tuple inline:
const snapshot = () =>
	testBed.probe().snapshot(['shared.events', 'shared.outbox', 'billing.billingSubscriptions'] as const)
```

### 3. The DB is the subject → raw, with a named exemption

Some tests are legitimately about the database itself, not about a business-data read:

- **Schema-drift / raw-shape tests** — assert on the presence/absence/shape of raw columns
  (`'status' in row`), which is the schema's own contract, not a business-data read.
- **`Drizzle*Repository.test.ts`** and siblings that test a DB-touching class's own behavior directly
  (e.g. the `BetterAuth.*.test.ts` files, which construct `BetterAuth` with a real client because
  better-auth needs a live DB adapter) — these test the repository/service/transaction boundary
  itself, so touching `DrizzleClient` is the point of the test.
- **Raw seeds** — a test that bulk-inserts fixture rows directly (`db.insert(events).values(...)`) to
  set up volume/shape state is seeding, not asserting; it stays out of probe scope. Prefer a `given`
  helper or a repository `save()` where one exists.

Every raw `resolve(DrizzleClient)` in a `.test.ts` file must be either migrated to one of the other 3
categories or added to `EXEMPTIONS` (with a one-line `why`) in
`tests/architecture/probe-discipline.test.ts` — the mechanical detector for this rule, scoped to
`src/**/*.test.ts` + `tests/**/*.test.ts`. Grep for `resolve(DrizzleClient)` to spot candidates; a
weakened regex is never an acceptable fix for a false positive — name the exemption instead.

### 4. Infra seed → given-helper

Prerequisite rows that aren't the read under test (a session row needed before calling a use case, an
onboarding record) are seeded via a `given` helper in `tests/support/given/`, never inline
`db.insert(...)` in the test file.

### Why this shape (the 3 reasons behind the split)

1. **Technical questions don't belong in the production repository.** "Exactly one row?", "is the
   outbox empty?" are questions a test asks, never a production code path. Adding them to a repository
   just to satisfy a test turns the repository into a test-backdoor.
2. **Proof of a negative needs an unfiltered view.** `snapshot()`'s whole job is proving a job wrote
   *nothing* — that requires reading the table without any domain filter. A repository method is
   domain-filtered by construction; it can't express "count everything."
3. **The probe is an INDEPENDENT WITNESS.** It does not share `toDomain`/`toPersistence` with the
   repository under test — it reads columns directly. A symmetric bug in a repository's mapper (write
   and read agree with each other but both are wrong) would NOT be caught by asserting through that
   same repository; the probe's independent read path catches it.

### Graduation rule

If a probe read gains a real production consumer (some use case or handler now needs the same read),
it migrates to a repository method, and the tests that used the probe for it follow the read to the
repository. The probe is for test-only technical questions — the moment production needs the same
answer, it graduates to category 1.
