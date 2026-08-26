# The upstream payload — what codm now has that `template-fullstack` should inherit

**Status:** inventory, ready to plan against. Written 2026-08-18, superseding
`.plans/2026-08-17-handoff-template-fullstack.md`, which describes a tree that no longer exists
(**32 commits** landed after it: the whole surface front and the whole upstream-prep reconciliation).

---

## 0. The upstream is a MANUAL PORT, and that is by declaration

`scripts/sync/` exists and works (36 passing tests), but it is **pull-only**: parent → child. Its own
contract states the rule — *"reverse flow (child → parent) is always an explicit PR, never
automation"* — and the model behind it, *"o template não sabe dos filhos; os filhos declaram o pai"*
(founder, 2026-07-21).

So the sync tool is not the instrument for this. It is the instrument for the NEXT train, once the
template has the work and codm wants to keep inheriting from it. **This document is the instrument.**

Template state at time of writing: `95b713e50`, with two untracked `.specs/` files from another
session (decide about them before starting — see §5).

---

## 1. The payload, by portability class

Everything below is on `worktree-declaracao-de-contexto`. The classification is the one that matters
for a port: **does it name this product, or not?**

### A. Kernel — moves as-is, no product knowledge

| item | what it is |
|---|---|
| `core/src/utils/Watchdog.ts` (+test) | parent-pid dead-man switch. Also `core-go/pkg/watchdog/` — the SAME mechanism, and having both is the evidence it is not product-specific |
| `core/src/services/HealthService/PgDatabaseHealthCheck.ts` | was in the product beside a twin that was already in core |
| `core/src/types/Placement.ts` | the allocation algebra, generic over ctx/criteria/infra. The kernel never learns a `deployment` exists |
| `core/src/vocabulary.test.ts` (+ Go twin) | bans a bare brand token in core, three declared exemptions, negative fixture |
| `CODM_DATA_DIR` default | `PROJECT`-derived rather than a hardcoded brand path |
| core-go outbox lanes | `config.Service.OutboxSource` / `IntegrationOutboxSource` — the service declares, core claims |

### B. Contract — the declaration surface a fork fills in

`ContextDecl` gained four fields this cycle, each replacing a central list that the stamp could not
prune: `givens`, `constants`, `placement`, `exposes`. The generator aggregates each into
`generated/contexts.generated.ts`, and `contexts:check` gates all of it — **no new rail per field**.

**The template takes the FIELDS, not the values.** `placement` in particular: the template has no
second deployment, so its contexts declare none. That works because `placement` is optional on the
kernel type and required only on the product's alias (`src/context.ts`) — which is exactly why it was
built that way.

### C. Structure — the layout, portable as a shape

```
src/          index.ts + context.ts + polyfill.ts + the context folders   (was 11 loose files)
composition/  policy.ts, compose.ts, server.ts
generated/    contexts / composition / registries
tests/        architecture (23 portable rails), flows, kernel, spikes, support
```

Go mirrors it where it matters: `tests/flows/` now exists, so a flow test lives in the same place in
both languages.

### D. Rails — 23 travel, and that number was measured

`tests/architecture/` went 37 → 26 files, and the split criterion was *does this compile in a fork
that pruned the context it names*. Import-bound rails moved to their subjects; path-bound rails lost
their hardcoded context literal. **Zero checks were deleted.**

Rails worth porting on their own merit: `phase-a-loud-failure` (PH-A), `i18n-assertions`,
`test-env-pinning` (ENV-01), the WIRE non-vacuity guards, `mock.stubs` (STUB-01/02).

### E. Product-only — must NOT travel

`PLACEMENT` values, `criteriaFromEnv` (reads `CODM_PROFILE`), `src/context.ts` itself, the three
`CODM_*` product env keys, `shared/testing/mock.ts` and its two declared stubs.

---

## 2. What to do first, and why it is not the port

**The template's own gates must be measured before anything lands.** The `codm` side of this work
found six defects of one family — all of them invisible to a green gate — and three were in the
gating apparatus itself:

1. **Typecheck frestas.** `src/**/*.test.ts` and `tests/**/*.test.ts` were in the `exclude` of two
   workspaces here, hiding **68** and **13** real errors. The pattern came FROM the template.
   Measure it there before porting anything, or the port lands on top of un-typechecked tests.
2. **`test:tooling` compiles a different program than `bun tsc`.** Two alias errors this cycle were
   invisible to `tsc` and caught only by it. Whatever the template's equivalent is, run it.
3. **Only e2e boots the shipped bundle.** A change that broke `node dist/server.js` passed `tsc`,
   1485 tests, `test:tooling` and lint. If the template has no e2e, that class is undetectable there.

## 3. Suggested order

1. **Measure the template's gates** (§2). Nothing lands before this.
2. **Kernel items (A)** — self-contained, and `vocabulary.test.ts` first, because everything else in
   the kernel has to satisfy it.
3. **Contract fields (B)** — `ContextDecl` + the generator + `contexts:check`. The template declares
   no `placement`, which is the design working.
4. **Structure (C)** — the directories, then the rails that follow their subjects.
5. **Rails (D)** — each with its falsifier re-run in the template's tree, not assumed from here.
6. **Then, and only then, the first sync train** — `sync.yaml` in codm declaring the template as
   parent, so future template changes flow back down. That is the `scripts/sync/` tool's actual job,
   and it only makes sense once the two trees agree.

## 4. What this does not settle

- **T8-D** — 5 residues in the frontends' storage/cookie keys, untouched by every branch, needs a
  migration note for existing installs.
- **`AGENT_RUN_TOKEN_HEADER`** — residue #2. The vocabulary rail permits it via a "pinned MCP header"
  exemption, which is upstream-prep's own answer. Confirm that is deliberate before extending it.
- **The `internal/shared/db/` name** — product schema nested under the `shared` *context*, which is
  the category error this front spent its time removing. `internal/db/` reads better; it is a rename
  with the contents already correct.
- **`feat/upstream-prep`** — its CONTENT is absorbed (T1–T8 all resolved), but git still shows 11
  unmerged commits because the content was applied, not the commits. Do not delete the branch on the
  strength of "it's reconciled" without recording that here first.
- **The rescued `scripts/sync/` work** — 36 passing tests plus an unfinished merge-driver (3 failing).
  Landing the passing part is what makes step 6 above possible.

## 5. Housekeeping still open on the codm side

- `main` is 6 commits behind this branch (clean fast-forward).
- One worktree still stands: `agent-a99bd27f8ddaa0e9b`, held open by the uncommitted `scripts/sync/`
  work, preserved at `.claude/RESCUED-agent-a99bd27f8ddaa0e9b.patch`.
- Nothing is pushed. `main` is ~240 commits ahead of `origin/main` — the founder's call.
