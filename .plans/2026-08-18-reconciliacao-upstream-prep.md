# Reconciling `feat/upstream-prep` with `worktree-declaracao-de-contexto`

**Status:** comparison, decisions pending. Written 2026-08-18.

**Why this exists.** Two branches independently implemented the same eight portability tasks. Neither
is in `main` (measured: main has **0** commits the other branches lack). `feat/upstream-prep` carries
**11** commits; the declaração branch carries **73**. They touch **17 files in common**, including
`template.config.ts`, `ProductConfig.ts`, `core/src/utils/Config.ts`, `tests/support/testing.ts` and
`tests/architecture/testing-dts.test.ts`.

Merging the declaração branch is a clean fast-forward. Merging upstream-prep **afterwards** is not:
where the two agree textually you get a duplicate, and where they disagree you get a mixture of two
designs with nobody having chosen.

**The template inherits whichever lands last. That is the reason to decide now.**

---

## The verdict table

| task | subject | verdict |
|---|---|---|
| **T1** | `CODM_AGENT_INACTIVITY_MS` out of the kernel | **identical — take either** |
| **T2** | Go outbox lane declared by the service | **upstream-prep only** |
| **T3** | test identity declared, not defaulted | **divergent — synthesise** |
| **T4** | Go product schema out of core | **CORRECTED — both did it, to different paths; this branch is cleaner** |
| **T5** | the givens catalog | **declaração supersedes, with one thing to take back** |
| **T6** | product spikes out of the portable dir | **upstream-prep only** |
| **T7** | `marca-legada` rail patterns | **upstream-prep only** |
| **T8** | the brand out of the mechanisms | **upstream-prep is the base — it closes what I escalated** |

---

## T1 — identical. No decision to make.

Both branches put the same entry in `ProductConfig`:

```ts
CODM_AGENT_INACTIVITY_MS: z.coerce.number().default(180_000),
```

Both remove it from the kernel `Config`, and both declare it in `template.config.ts` `REPO.env` with
the same `consumers: ['apiTs']` and `schema: 'product'`. **Only the comment language differs** — one
in Portuguese citing F3/T1, one in English citing "upstream-prep Decision 1".

Textual conflict on merge, trivial resolution: keep one comment. No design question.

## T4 — CORRECTED 2026-08-18. Both branches did it, and my first verdict was backwards.

I originally wrote *"upstream-prep only, and large — `internal/db` does not exist on this branch."*
That was true and misleading: **this branch did the same task to a different path**, which an `ls` of
one destination could not see. Measured against the merge base (`58a1af0d`), where only
`core/db/sqlite/gen` existed:

| | destination | files there | files LEFT in core |
|---|---|---|---|
| this branch | `internal/shared/db/sqlite/` | 18 | **4** |
| upstream-prep | `internal/db/` | 37 | **6** |

**The 2-file difference is the whole argument.** Both leave the same four genuinely generic kernel
files in core — `db.go`, `events.sql.go`, `models.go`, `outbox.sql.go`. upstream-prep **also leaves
`owner.sql.go` and `ui.sql.go`**, and `owner` and `ui` are bounded contexts of *this product*
(`src/owner`, `src/ui`). So upstream-prep's version leaves two product tables inside the portable
kernel — which is the exact defect T4 exists to remove.

This branch moved all seven product tables out (artifact, channel, issue, owner, thread, ui,
workspace) and left only the kernel's own.

**Verdict: keep this branch's T4.** From upstream-prep, check whether its extra 19 files carry
anything this branch's destination lacks (its `internal/db/` has 37 to our 18) — that gap is
unexplained and may be genuine coverage or may be duplication of what stayed in core.

**On the path name:** `internal/shared/db/sqlite/` vs `internal/db/`. The former nests product schema
under the `shared` *context*, which is arguably the same category error this front spent its time
removing — the schema is not `shared`'s, it is the product's. `internal/db/` reads better. That is a
rename, not a redesign, and it can be done after the merge with the contents already correct.

## T2, T6, T7 — upstream-prep only. Take them whole.

The declaração branch never attempted these.

**Caveat for T2:** both branches touch `packages/api/go/core/db/sqlite/store.go`. The declaração
branch's changes there (+31 lines) come from the `dbFileName` work (T8 territory), not from the outbox
lane or the schema move. Same file, different purposes — expect a textual conflict with a real
resolution, not a design choice.

## T5 — the declaração branch supersedes, and it is already adjudicated

**upstream-prep's form** — central, in `template.config.ts`:

```ts
contexts: {
  thread: { ownerWorkspace: 'apiTs', givens: ['givenThread', 'givenStop'], constants: ['GIVEN_MENTION_TAG'] },
  …
}
```
plus ~31 lines of pruning logic in `scripts/create-template/plan.ts` so the stamp can drop a removed
context's entry.

**The declaração form** — distributed, in `<ctx>/context.ts`:

```ts
givens: ['givenThread', 'GIVEN_MENTION_TAG', 'givenStop'],
```
aggregated by `bun contexts:sync` into `CONTEXT_GIVENS`, gated by `contexts:check`.

**This is not two peer designs.** `core/src/types/ContextDecl.ts:100` names upstream-prep's version
explicitly — *"A tarefa original mandava declarar isto em `template.config.ts`, como
`REPO.contexts.<ctx>.givens`"* — and argues against it on the ground that *"o fato 'quais givens são
meus' é do contexto; ele mora com o contexto"*, plus the failure it removes: **the stamp could not
prune a pruned context's givens**, which is exactly what upstream-prep's 31 lines of `plan.ts` exist
to work around. Distributing the fact deletes the need for that machinery instead of maintaining it.

It also carries a founder decision (gate 8b, this session).

**What to take back from upstream-prep:** it separates `constants` from `givens`
(`constants: ['GIVEN_MENTION_TAG']`); the declaração form mixes them into one array. A constant is not
a function, and any consumer that wants to call the catalog's members needs to know which is which.
That distinction is worth keeping.

**What to leave:** `ownerWorkspace`. In the distributed form the context's file *is* in its workspace,
so the fact is derivable from location — declaring it would be the redeclaration this whole front has
been removing.

**Proposed third form:** `givens: readonly string[]` and `constants?: readonly string[]` on
`ContextDecl`, aggregated separately, `ownerWorkspace` dropped.

## T3 — divergent, and the synthesis is the interesting one

**upstream-prep** adds `tests/support/harnessOwnerId.ts` (17 lines) and threads it through
`testing.ts` and the given helpers — a named helper that produces the harness owner id.

**The declaração branch** adds an `identity?: 'column' | 'double'` option to
`IntegrationBackendOptions` and makes `TestBed.ownerId` **throw** when undeclared instead of
defaulting to `'integration-tenant'`.

These solve adjacent halves of one problem. upstream-prep answers *"where does the harness owner id
come from"*; the declaração branch answers *"what happens when nobody said"* — and the audit
(`.specs/2026-08-18-test-harness-normative-map.md`, trap T1) showed the second is where the damage
lives: a declared `ownerId` is never compared against the stamped one, so **negative assertions stay
green forever** while seeding under one owner and reading under another.

**Take both.** They are not competing; one names the producer and the other closes the silent path.
Neither alone is sufficient.

## T8 — READ 2026-08-18. upstream-prep is the stronger foundation, and it CLOSES what I escalated.

This was the one cell I refused to call from the shapes. Having read both diffs, it is not a tie and
the surprise is on my side.

**upstream-prep already made the decision this session escalated as blocked.** My T8(B) analysis
recorded 8 residues stuck on *"where does the brand enter a portable kernel"*, named three routes, and
recommended **env** — the only channel proven to reach TS, Go and the core without a mirror. It then
stopped, on the grounds that this was design, not repair.

upstream-prep took exactly that route:

```ts
CODM_DATA_DIR: z.string().default(`~/.${process.env.PROJECT ?? 'app'}/data`),
```

That is residue #1 (`~/.codm/data` in `core/src/utils/Config.ts:31`) closed, by the mechanism I
recommended, with a docblock citing its own Decision 4 and the Go twin (`core/db/sqlite/store.go`'s
`projectName()`). **On this branch that line is still hardcoded.**

**And it did the thing that makes it durable — a rail.** `core/src/vocabulary.test.ts` (124 lines,
with a Go twin in `core/vocabulary_test.go`) forbids a bare `codm` token, any casing, anywhere in
core, with three declared exemptions: the `@codm/` package scope, `CODM_`-prefixed env keys, and one
pinned MCP header. It ships with a negative fixture. That is a general rail against the whole class,
where this branch has two specific ones (`brand-display`, `db-file-name`).

### The consequence for the merge, and it is a good one

This branch still carries both residues the rail is designed to catch — `~/.codm/data` at
`Config.ts:31`, and `AGENT_RUN_TOKEN_HEADER = 'x-codm-run-token'` at `AgentIdentity.ts:97`. So on the
merged tree **upstream-prep's vocabulary rail should go RED against this branch's core**, and that is
the correct outcome: it is the rail doing its job on a residue this session declared open rather than
fixed.

Do not resolve that by exempting the two lines. Residue #1 is already solved by the `PROJECT`
derivation; residue #2 is the same fix applied to a header, and the rail's own third exemption ("one
pinned MCP header") suggests upstream-prep hit the identical question and answered it by pinning
rather than deriving. **Read that exemption before choosing**, because it is the precedent for what to
do with a header whose value is a wire constant.

### What each side keeps

| keep from | what |
|---|---|
| **upstream-prep** | the `PROJECT` derivation, the vocabulary rail (TS + Go), and its exemption list — the general mechanism |
| **this branch** | `REPO.brandDisplay` + its rail (a fact the vocabulary rail cannot express: brand *casing* used in operator-facing chrome), `CODM_DB_FILE_NAME` + the cross-language byte-identity rail (TS ⇄ Go must open the SAME file — a parity fact, not a token fact), `CODM_MENTION_FALLBACK_TAG` |

They are complementary: upstream-prep bans the token, this branch pins the values that legitimately
survive as declared env. Note the two are compatible by construction — the vocabulary rail explicitly
exempts `CODM_`-prefixed env keys, which is exactly the shape of all three keys this branch added.

### T8-D is untouched by both

The 5 residues in the frontends' `src/` (storage/cookie keys) appear on neither branch. Still open,
still needs a migration note for existing installs.

---

## The merge is not a merge — measured 2026-08-18

Attempted `git merge feat/upstream-prep` on a scratch branch: **55 conflicted files**, and the bulk of
them are the generated Go schema in THREE simultaneous locations (`core/db/sqlite/gen`,
`internal/db/gen`, `internal/shared/db/sqlite/gen`) because both branches moved the same thing
somewhere different. Aborted; the tree is clean and the scratch branch is gone.

**A single merge is the wrong tool here.** Git resolves text; what these 55 files encode is eight
independent design decisions, six of which are already settled in this document. Grinding through the
conflicts would answer them by accident, in whatever order git presents the hunks.

**Do it task by task instead**, in the order below, each with the gates green before the next. Most
tasks are small (T1 is one line, T6/T7 are localized); the two big ones (T4, T8) are exactly the ones
where the verdict is now decided, so they can be applied as deliberate edits rather than conflict
resolutions.

## Suggested order

1. **Merge the declaração branch to main** (clean fast-forward, 73 commits, gates green).
2. **Take T2, T4, T6, T7 from upstream-prep** — unopposed, and T4 is the biggest portability win
   either branch produced.
3. **T1** — keep whichever comment reads better; no design decision.
4. **T5** — keep the distributed form; add `constants` back as a separate field.
5. **T3** — take both halves.
6. **T8** — read both diffs properly before merging either. It is unfinished on both branches and
   carries the two open founder decisions.

## What this does NOT settle

`feat/upstream-prep` has not been run against the current gates. Its 11 commits predate everything in
this session — the typecheck fresta fix, the rails split, the `placement`/`exposes` derivations, the
`generated/` move. Its T5 in particular assumes `REPO.contexts` in a `template.config.ts` that has
since changed shape. **Expect its tests to need work after any merge, and treat a green run on the
merged tree as the real acceptance gate, not the branch's own history.**
