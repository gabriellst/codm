# Reducing the product's surface — what belongs in core, and how `src/` should nest

**Status:** analysis, not approved. No code moved. Revised 2026-08-18 after founder correction.

**Target stated by the founder:** `src/` holds **`index.ts` and at most one other file**; every
top-level folder in `src/` is a context; the generated aggregates leave that layer; the data-dir lock
belongs to the startup itself, not to an import side-effect.

---

## 0. The invariant, verified — and the correction it forces

Measured: **10 of 10** top-level folders in `src/` contain a `context.ts`. The rule *"a top-level
folder in `src/` IS a context"* holds without exception. That is the DC2 spine.

**This kills the first version of this plan.** It proposed a `src/composition/` folder, which would
have been the first non-context folder in `src/` and would have broken the one invariant that makes
the tree readable. A category needs a home, but not at the cost of the rule.

The target then follows mechanically: anything that is **neither a context nor the entry point** must
leave `src/` — into **core** if it is mechanism, or into a **sibling directory outside `src/`** if it
is a product declaration.

## 1. The same category error exists one level down, in `shared/`

`shared/` holds seven files. Four are the shared *context's* own (`context.ts`, `jobs.ts`,
`lifecycle.ts`, `registry.ts`). **Three are not:**

| file | what it actually is |
|---|---|
| `deployment.ts` | composition-root machinery + the `PLACEMENT` table |
| `descriptor.ts` | what a context declares — derived from the kernel's `BoundedContextOptions` |
| `context-policy.ts` | cross-context boundary policy, explicitly "belongs to no context" |

`shared` became the place things land when they belong to no context. Its own docblocks admit the
mechanism: *"o `shared` era o primeiro a montar, então era um lugar conveniente… conveniência não é
propriedade."* Fixing `src/` root without fixing this only moves the pile one level down.

## 2. The move that dissolves the biggest file: `PLACEMENT` becomes a per-context declaration

`PLACEMENT` is keyed by context id, and every entry is a statement about **one** context:

```ts
auth:   [{ when: { deployment: 'cloud' }, infra: { db: 'pg' } }],
shared: [{ when: { deployment: 'cloud' }, infra: { db: 'pg' } },
         { when: { deployment: 'local' }, infra: { db: 'libsql' } }],
```

That is a **central list of per-context decisions** — precisely the shape DC2 already eliminated for
`consumes`, `reads` and `ambient`, which used to live in a central `context-map.ts` and now live in
each `<ctx>/context.ts`.

`ContextDecl` already carries `ambient`, `consumes`, `reads`, `givens`, `removable`, `requires`. A
`placement` field fits without inventing a concept, and the `givens` docblock already argues the case
in general terms — *"o fato 'quais givens são meus' é do contexto; ele mora com o contexto"* — along
with the failure it fixed, which applies here verbatim: **the `create-template` stamp could not prune
a pruned context's entries when they lived in a central list.** Prune a context today and its
`PLACEMENT` row is orphaned in exactly the same way.

Consequences, in order:

1. Each `<ctx>/context.ts` gains `placement: [...]`.
2. The generator aggregates it (it already emits four derivatives) — the table becomes derived, and
   `contexts:check` guards it like the rest.
3. `deployment.ts` loses its product half and is left as **pure machinery** → core.
4. The gate already exists (`contexts:check` fails on a hand-edited derivative), so this inherits
   enforcement instead of needing a new rail.

## 3. `openapi.ts` dissolves the same way

It registers enums from four contexts plus `shared/objects`, and its docblock defends living at the
root *because it aggregates every context*. But "which of my barrels are public vocabulary" is a
per-context fact. Give `ContextDecl` an `exposes?: { enums?: boolean; objects?: boolean }` and the
generator emits the aggregation — the file stops existing, and the security boundary it documents
(*"`shared/*` E SÓ" for objects*) becomes a **declared, checkable** property instead of a comment
guarding a hand-written call.

## 4. The data-dir lock — accepted, and it lands in core

Founder's call: it belongs to the startup. That is right *once the choreography itself moves to core*,
because then "startup" and "kernel boot" are the same place.

The ordering fact stands and constrains **where inside** startup: `server.ts` runs `bindContexts`
(:99) → `composeContexts` (:120, which resolves every controller) → `startAll` (:150). The lock must
be acquired **before :99**, or a locked dir surfaces as a cascade of "Failed to resolve controller"
instead of one legible `DATA_DIR_LOCKED`. A `lifecycle.start` hook (:150) is therefore the wrong seam;
the top of the boot sequence is the right one.

One consequence to decide explicitly, because it is a behaviour change: `start()` is also what the
integration harness and e2e call. Today only the process shell locks (`boot.ts` is imported solely by
`src/index.ts`, plus one frozen script). Moving the lock into the boot sequence makes **~79 integration
suites acquire a data-dir lock** over `HARNESS_DATA_DIR`. That is probably fine and arguably more
correct, but it must be measured — the harness has a documented history of stale-handle and contention
problems in exactly this area.

## 5. What goes to core

**Mechanism, no product knowledge — moves as-is or with a type parameter:**

| item | note |
|---|---|
| `watchdog.ts` + its test | already fully generic; nothing in it knows this product. Move first — it proves the path with zero parameterisation |
| `compose.ts` — the bind→compose loop | parameterised by manifest + criteria; the ADR 0007 shape is already generic |
| `server.ts` — the boot choreography, incl. the lock (§4) | becomes the kernel's `start()` |
| `deployment.ts` machinery | `Axis`, `ContextInfra`, `InfraModules`, `Placement`, `Criteria`, `Deployment`, `DatabaseFamily`, `placementFor`, `mountedContexts`, `keysOf` |
| `descriptor.ts` | already a derivation from `BoundedContextOptions`; only its two product types become parameters |

**Must NOT move:** `criteriaFromEnv` (reads `CODM_PROFILE` — product env, per the founder's own
`dbFileName` ruling) and `context.ts` (it exists to bind the kernel generic to this fork's unions;
moving it inverts the dependency the design rests on). After §2, nothing else — because `PLACEMENT`
will no longer be a file.

## 6. Where the generated aggregates go

They are neither contexts nor the entry, so they leave `src/`. Proposed
`packages/api/typescript/generated/`, mirroring the existing precedent at
`packages/contracts/generated/{ts,go,rust}`.

**Move these three together or the change is broken:** the emitter (`scripts/contexts/aggregate.ts`),
the `@contexts.generated` alias (consumed by `tests/architecture/wiring-completeness.test.ts`), and
`bun run contexts:check`. If they do not move in one commit the derived-file gate goes red — which is
correct behaviour, and the falsifier for the move itself.

Note `composition.generated.ts` imports context barrels at **runtime**, so from a sibling directory its
specifiers become `../src/<ctx>/…`. Mechanical, but it is the one import-shape change here.

## 7. The end state

```
packages/api/typescript/
  src/
    index.ts          ← entry: hand core the manifest and the criteria (~15 lines)
    context.ts        ← the product binding: ContextDecl<ContextId, Namespace>
    agent/ artifact/ auth/ external/ issue/ owner/ shared/ thread/ ui/ workspace/
  composition/
    policy.ts         ← was shared/context-policy.ts (cross-context decisions)
  generated/
    contexts.generated.ts
    composition.generated.ts
```

`src/` root: **two files and ten context folders.** `shared/` root: four files, all genuinely the
shared context's.

## 8. Order, and the one step that must not be bundled

1. **`watchdog` → core.** Zero parameterisation, zero product knowledge. Proves the path cheaply.
2. **`PLACEMENT` → per-context `placement`** (§2); regenerate, let `contexts:check` gate it.
   Independently valuable even if nothing else here happens.
3. **`deployment.ts` / `descriptor.ts` machinery → core**, now that step 2 emptied them of product data.
4. **generated → `generated/`** (§6) — emitter + alias + gate in one commit.
5. **`compose.ts` / `server.ts` → core**, and only here does the lock move (§4), with the ~79-suite
   measurement done first.
6. **`openapi.ts` → declared + generated** (§3).

**Do not bundle step 5 with anything.** It is the only step that changes runtime behaviour for the
test harness, and the only one whose failure mode is subtle rather than a red gate.

## 9. Why now, and the caution that outranks it

W2/F5 upstreams this kernel to `template-fullstack` and **has not run yet**. Everything settled here
ships as kernel; everything left behind ships as product code the template must re-derive.

But the upstream plan is explicit that `PLACEMENT` and the `deployment` axis **do not travel** — *"the
template has no second deployment; the table would be decoration, and a declaration that decides
nothing is worse than absence, because it reads as coverage."* §2 makes that easier rather than
harder: once placement is a per-context field, the template simply has contexts that do not declare
one, and there is no table to omit.

## 10. What this does not buy

It removes no runtime behaviour and makes nothing faster. The measured win is that a second product on
this kernel stops re-authoring roughly 260 of the 480 lines examined here, and that `src/` root stops
being where the next unclassified file lands by default.

---

## 11. `shared/` in detail — measured

`shared` is 40 files, mid-sized (thread 114, agent 107, ui 40, issue 39). It is **not** a dumping
ground by volume, and `deployment.ts` explicitly declares it *"o único contexto dual POR DESENHO: é a
raiz de infra dos dois deployments"*. So most of what is in it belongs there. Five things do not.

### A. The three loose files (§1) — composition-root concerns, not the context's

`deployment.ts`, `descriptor.ts`, `context-policy.ts`. Covered above.

### B. `services/PgDatabaseHealthCheck.ts` → core. The cleanest candidate in the repo.

Its own docblock calls it *"gêmeo do `DatabaseHealthCheck`"* — and **that twin already lives in core**
(`core/src/services/HealthService/DatabaseHealthCheck.ts`, beside `HealthCheck`,
`MigrationsHealthCheck`, `PollingHealthCheck`). It imports `drizzle-orm` and `@codm/core-typescript`
and nothing else; the single match for a product token is one word inside a comment.

A matched pair, one half in the kernel and one half in the product, for no reason anyone wrote down.
Moving it needs no parameterisation and no decision — it is strictly a correction of where the file
landed. **Do this one first, with `watchdog`.**

(`ChannelStatusHealthCheck` is genuinely product — it is about WhatsApp channel liveness. It stays.)

### C. `services/slug.ts` — a context leak wearing a utility's clothes

```ts
return slug || 'issue'
```

A general-purpose slugifier whose fallback is the name of **one specific context**. Consumers measured:
`agent/usecases/DeclareIssueOpen.ts` and `thread/schemas/MentionGate.ts` — two different contexts, so
it is genuinely shared and belongs at this level rather than inside `issue`.

But the fallback is not shared: it is `issue`'s. Make it a parameter (`slugify(text, fallback)`), and
the function becomes fully generic — at which point it is a core string utility, not product code.
Small, but it is the exact shape the repo already forbids elsewhere: a generic thing that silently
knows one caller.

### D. `testing/mock.ts` — the marker of unimplemented use cases, with no way to enumerate them

The file is deterministic faker helpers, and its docblock states the intent honestly: *"Swap a
usecase's body for a real query and delete the faker calls."* So **importing it is the structural
signature of an unimplemented use case.**

Measured, its importers are:

| use case | what it returns in production | how it declares itself |
|---|---|---|
| `ui/usecases/GetMyAccount.ts` | a fully faked account — `faker.person.fullName()`, `internet.email()`, `company.name()`, `image.avatar()`, seeded by `userId` | *"FAKER body, REAL contract."* |
| `auth/usecases/UploadAvatar.ts` | `{ pictureUrl: faker.image.avatar() }` — it uploads nothing | *"MOCK."* |

Both are honestly documented, and that is the problem: **in two different spellings.** Grepping `MOCK`
finds `UploadAvatar` and misses `GetMyAccount`. There is no list, no count, and nothing that fails when
a third appears. A caller gets a 200 and plausible data.

This is the session's recurring shape once more — a real convention, declared in prose, with no gate —
so it takes the same cure. **The import IS the marker** (exactly as `static readonly repeat` became the
marker for a job, after the filename convention rotted). A rail can then:

1. enumerate every importer of `@shared/testing/mock` — that list *is* the stub inventory;
2. require each to carry one declared marker (a single spelling, or better a `readonly stub = true`
   the type system can see);
3. fail when a new importer appears without it, so the debt list cannot grow silently.

That converts invisible scaffolding into a tracked, countable debt — and it is the honest prerequisite
for ever deleting `shared/testing/` altogether, which is the real end state.

### E. What is legitimately `shared`'s and stays

`config/ProductConfig.ts` (the product env seam, by design), `db/FileLibsqlDriver.ts` (binds core's
`LibSqlDriver` to product config + contracts schema — infra root, coherent with the dual-deployment
declaration), `services/{CloudSession,MailSender,OwnerDirectory,LoopbackSignIn,ChannelStatusHealthCheck}`,
plus `enums/`, `objects/`, `schemas/`, `middlewares/`, `controllers/`, `usecases/`, `i18n/`.

### The end state for `shared/`

After A–D, `shared/` is: four context files at its root (`context.ts`, `jobs.ts`, `lifecycle.ts`,
`registry.ts`) and the folders of a genuine bounded context. It stops being the place where
"belongs to no context" lands — which is the actual complaint, and it is one level deeper than the
`src/` root symptom that surfaced it.

### Revised order (supersedes §8 items 1 and 3)

0. **Split the rails by portability (§12)** — 21 of 37 move or lose a literal. Ordered first because
   it is the one step W2/F5 cannot proceed without, and it deletes no checks.
1. **`watchdog` + `PgDatabaseHealthCheck` → core.** Both need zero parameterisation. The health check
   is a pure relocation to sit beside its twin.
2. `PLACEMENT` → per-context `placement` (§2).
3. `slug.ts` fallback → parameter, then → core (§11C).
4. `deployment.ts` / `descriptor.ts` machinery → core; `context-policy.ts` → `composition/`.
5. generated → `generated/` (§6).
6. `compose.ts` / `server.ts` → core, with the lock (§4) and the ~79-suite measurement. **Alone.**
7. `openapi.ts` → declared + generated (§3).
8. The `shared/testing/mock.ts` rail (§11D) — independent of all the above, and worth doing early
   precisely because it is about knowing what is unfinished, not about moving files.

---

## 12. Step 0 — the rails split by portability (measured 2026-08-18)

The founder's criterion, and it is sharper than the "fact vs decision" axis in §11: **some rails
import things a stripped product will not have.** A rail that only makes sense when context X exists
cannot travel to a fork that pruned X.

Measured over all 37 files in `packages/api/typescript/tests/architecture/`:

| class | count | failure mode in a fork that prunes the context |
|---|---|---|
| **portable** | 23 | none — they read fs, contracts, the kernel, the manifest or the generated aggregate |
| **import-bound** | 14 | **does not compile** — `from '@shared/…'` / `'@agent/…'` / `'@auth/…'` has no target |
| **path-bound** | 7 | compiles, then fails or goes vacuous — a context name spelled as a STRING |

Import-bound (the context each one needs): `db-file-name` shared · `agent-input.type-test` agent ·
`job-cadence` shared+issue+thread · `context-map` shared · `cloud-identity` shared · `env-model`
shared · `mcp-exposure` agent · `single-run-entry` agent · `transport-stop-kind.typecheck` agent ·
`desktop-callback-parity` auth · `real-di-resolution` shared+agent · `deployment` shared ·
`trunk-parity` shared · `infra-channel` shared.

Path-bound: `wiring-completeness` owner · `allowlist-liveness` auth · `probe-discipline` agent+thread ·
`union-parity` ui · `error-coherence` shared · `enum-placement` shared+owner · `lifecycle` agent.

**The path-bound class is the subtler one.** `wiring-completeness.test.ts` builds its negative fixture
at `tmpRoot/owner/handlers/…` under a comment that says *"Uses a REAL context module name so MODULES
matches inside the fixture root."* Prune `owner` and `MODULES` no longer contains it, the scan returns
`[]`, and the fixture assertion fails — a rail going red for a reason that has nothing to do with the
code under test.

### The rule: a rail follows its subject

The same rule already applied to `givens` (moved into `ContextDecl`) and proposed for `PLACEMENT`
(§2). A rail that presupposes context X lives **with** X, so pruning X prunes its rail for free — no
stamp logic, no allowlist, nothing to remember.

1. **The 14 import-bound move into `src/<ctx>/`.** Most are unit tests of one artifact anyway
   (`cloud-identity` is a unit test of `CloudSessionMiddleware`; `real-di-resolution` resolves
   concrete classes), so colocation is the natural home rather than a new folder.
2. **The 7 path-bound keep their location and lose the literal** — take the fixture's context name
   from `CONTEXTS` at runtime instead of spelling `'owner'`.
3. **`tests/architecture/` then means exactly one thing: the 23 rails that travel.**

### Why this needs no rail of its own

The enforcement already exists at the only moment it matters. **If a product-bound rail is ported to
the template, the template's own `tsc` fails on the unresolvable import.** That is the same criterion
that retired CMPL-06 (it became a compile error via `satisfies Record<ContextModule, InstanceRegistry>`
and its runtime rail was dropped): *if the type system catches it, the runtime rail is redundant.*

Adding a rail-for-rails here would be the reflex this section exists to resist.

### What it buys, stated plainly

`tests/architecture/` drops from 37 to 23 files **without deleting a single check** — every one of the
21 moves keeps its assertions, it just files them where their subject lives. The W2/F5 port then
carries 23 rails that compile in a bare template, instead of 37 of which 21 break on arrival.
