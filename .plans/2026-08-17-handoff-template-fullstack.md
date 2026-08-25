# Handoff — F4 / F5 / F6 in `template-fullstack`

> **SUPERSEDED 2026-08-18** by `.plans/2026-08-18-upstream-payload.md`. Thirty-two commits landed
> after this was written — the whole surface front (steps 0b/2/4/5/6/7/8) and the whole upstream-prep
> reconciliation (T1–T8) — so the tree it describes no longer exists. Its Step 0 (the template's
> measured starting state) and its gate warnings are still true and were carried forward; its payload
> inventory is not. Read the new file.

**Status:** ready to execute. Written 2026-08-17 from the `codm` worktree `declaracao-de-contexto`,
which closed F1–F3 and measured everything below.

**Why this file exists.** The parent plan (`.plans/2026-08-17-fechamento-e-upstream.md`, 977 lines)
carries this material across ~6 sections, several of them *corrected by later sections* as the codm
work measured things that changed the fronts. Reading it in order means reading superseded claims
first. This is the consolidated, current version — start here, and treat the parent as the archive of
how each conclusion was reached.

**Why it is a separate session.** F4/F5 write to `template-fullstack`, and a codm worktree can *read*
that repo but not write to it (harness isolation refuses paths outside the worktree). The parent
goal's condition (7) independently requires stopping and asking for a dedicated session.

---

## Step 0 — the starting state, measured 2026-08-17

Measured from outside (reads work across repos; only writes are blocked):

- **HEAD:** `95b713e50` — *"feat(lint): component-quality ganha as duas regras que o codm provou"*.
- **The tree is NOT clean.** Two untracked files:
  `.specs/2026-08-15-contexto-em-um-arquivo-design.md` and
  `.specs/2026-08-15-manifesto-de-contexto-design.md`.

**They belong to another session. Decide what to do with them BEFORE F4.1, not at commit time.** The
git-hygiene condition requires a clean `git status` when closing each front; someone who starts
without knowing these were already there will either adopt them or sweep them in.

Then confirm `tsc` + tests are green at HEAD — but read the next paragraph before trusting the word
"green".

### The Step-0 trap, and it is not hypothetical

`codm` had `src/**/*.test.ts` and `tests/**/*.test.ts` in the `exclude` of **two** workspaces'
tsconfigs. That hid **68 errors** in one and **13** in the other. The typecheck was green the whole
time because it was not looking.

The `exclude` pattern is inherited from the template, so **measure it there before porting anything.**
A port laid on top of un-typechecked tests carries the defect forward. Concretely: open each
workspace's tsconfig, confirm test files are inside the program, and re-run typecheck after removing
any test exclusion. If the count jumps, that is the same hole.

---

## F4 — W0-template (mechanical; no doctrine approval needed)

| step | content | gate |
|---|---|---|
| F4.1 | T0.6–T0.10 from the prior plan | template tests stay green |
| F4.2 | the 7 Tier 0/1 items from the dossier | same |
| F4.3 | `saveWithOptimisticLock` for the libsql family — **does not exist** in the template | a test exercising optimistic conflict over libsql |

**Internal order:** F4.3 last. The first two are isolated fixes; the third adds new surface the others
may touch.

---

## F5 — W2, the upstream of the reform

### What travels, and what changed in codm since the front was first written

| item | current state in `codm` | note for the port |
|---|---|---|
| `ContextDecl` | gained `givens` (T5) | the field travels; without it the template's stamp cannot prune givens |
| the generator | emits **4** derivatives, not 2 | `context-ids`, `contexts.generated`, `composition.generated`, `registries.generated` |
| `bindContexts` / `composeContexts` | ADR 0007, phase A separated | **mechanize from day 1** — see the falsifier below |
| `lifecycle.ts` | `setup` was **DELETED** | the driver pin died with phase A; do **not** port `setup` |

**Does NOT travel:** `PLACEMENT` and the `deployment` axis. The template has no second deployment, so
the table would be decoration — and a declaration that decides nothing is worse than its absence,
because it reads as coverage.

### Three findings the F5 inherits as WORK, not as information

1. **The template's `CONTEXT_REGISTRIES` is hand-written.** `codm` generated it (F2) and therefore
   retired the `slice-closure` registry-key check. **In the template that check STAYS** — the defect it
   guards (a swapped pairing like `auth: billingRegistry`, which `satisfies` cannot catch because it
   only checks coverage) can still exist where the map is authored by hand. If F5 generates the map
   there too, *then* it may be retired, and only with the same by-construction proof.
2. **The typecheck gap** — see Step 0 above. Measure before porting.
3. **`check:generated` is one-way.** The template uses the same generator with `clean: false`, so it
   has the same hole: stale output is never removed and no gate notices. The `codm` rail
   `mcp-tool-orphans.test.ts` ports directly.

### The falsifier condition (5) requires here — and it is already built

*"Resolving a token before phase A must fail LOUDLY, naming the controller."*

**The window exists in the template and is neutralized only by CONVENTION** — `routers.ts` imports
`shared` first. That is the same class of defect `codm` had: it works by accident of import order, and
the first reordering breaks it silently.

**You do not have to author the falsifier.** `codm` built it as a rail —
`packages/api/typescript/tests/architecture/phase-a-loud-failure.test.ts` (PH-A) — and it guards code
that lives in the **portable core** (`core/src/types/Router.ts`). When W2 lifts the `Router`, the rail
travels with it.

Two things about it that must survive the port:

- **It guards the SILENCE, not the cause.** Two-phase composition kills the cause (an unbound token
  mid-assembly); the thrown error kills the silence, which is what let the cause survive unseen. A
  swallowed failure means a controller simply *vanishes from the route* — boot goes green, the process
  starts, and it resurfaces as a 404 on a route the developer swears was registered, or a 500 on first
  call. Guarding only the first half is worthless if the throw ever reverts to `console.warn`.
- **The planted defect must be a TOKEN with no binding, not an abstract class.** `abstract` is erased
  at compile time, so tsyringe happily *instantiates* an abstract class and the defect only appears
  later when a method is missing — that is the *other* half-mechanism, not the one this rail
  exercises. Planting the abstract class makes the test pass while exercising nothing.

Verified in codm: reverting the `throw` to `console.warn` produces **1 fail / 1 pass**; restoring it,
**2 pass**. It carries a counter-proof (with the token bound, the same assembly passes), so it cannot
pass or fail for incidental reasons.

---

## F6 — W3, pruning (both repos, one pass, last)

### The pruning is far smaller than the front assumed — measured in codm

The front assumed "these rails went vacuous, retire them". Measured one by one, **four of five were
not vacuous**, and two were in a state nobody had reason to suspect: **green while matching zero
files.**

| candidate | measured verdict |
|---|---|
| `slice-closure` — registry key | ✅ **retired with proof** (codm F2). **Keep it in the template** — the map is hand-written there |
| **WIRE-01** | ❌ was **BLIND** → became a fix, and stays. Filtered `*Handler.ts`; files with that name: **0**. The 11 real handlers are named by intent |
| **WIRE-02** | ❌ **passed by absence of its subject** → reanchored, and stays. Required `*Job.ts` in `<ctx>/jobs/`: **0** files, **0** `index.ts` (deleted by DC2), **3** real `jobs.ts` unguarded |
| `slice-closure` — `import './errors'` | ❌ **not vacuous** — stays. The generator emits the MAP; each context writes its own `registry.ts` by hand |
| **WIRE-03** | ❌ stays (already the decision) — the controllers barrel is authored |

**1 retirement in 5.**

### Two operating rules for the template pass

1. **Before retiring any rail there, falsify it on the REAL tree** — not only in a tmpdir fixture. That
   is exactly where WIRE-01 fooled itself: the fixture passed while the whole repo went unseen. A rail
   that cannot go red on a planted defect is not vacuous, it is **blind**, and retiring it hides the
   hole instead of closing it.
2. **Anchor on the STRUCTURAL MARKER the runtime reads, never a filename convention.** Filename
   convention is what rotted in both cases. The new WIRE-02 matches `static readonly repeat` — the
   field `resolveJobCadence` actually consults — so it cannot desync from a folder rename.

### The structural artifact worth porting with them

The three WIRE rails now assert **their own non-vacuity**: each scan returns `{ violations, scanned }`
and each test requires `scanned > 0`. A rail that loses its subject now **fails saying so** instead of
passing saying nothing, and the message names the likely cause (an unpropagated rename) and prescribes
the fix. `job-cadence.test.ts` (JOB-01) already did this; the WIRE rails now do too.

Falsified by simulating the exact rename: **2 fail / 2 pass**, restored to 4 pass.

**Termination check:** all 33 codm architecture rails were swept for this blindness class — **32
measured, zero blind** (`wiring-completeness` excluded, already fixed). The class closes at six. Worth
running the same sweep in the template, where the rails have diverged.

---

## Gates for that repo

Run the template's own equivalents of the closed list, and treat these two as load-bearing because a
defect passed underneath them before: the SDK regen (`bun sdk`, then confirm **zero diff**) and the
e2e suite. Add `bun run check:generated`, `contexts:check` if present, and the Go build/test.

**Git hygiene:** everything local; stage by explicit path; never `git add -A`; clean `git status` at
each front close; never `git stash` through an SDK/contracts regen. **Do not push** — that is the
founder's call.

---

## Out of scope

The `workspace → project` rename (its own plan, deferred by the founder), the `new.target` "third
family" (argument recorded in the dossier §8), and changes to `CROSS_CONTEXT_POLICY`.

## Still blocked on the founder, independent of this session

- **T8(B)** — 8 residues, blocked on *where the brand enters a portable kernel*. Three routes recorded
  in the parent plan with the precedent for each; the recommendation is **env**, the only channel
  already proven to reach TS, Go and the core without a mirror or a new import. It changes the boot
  contract, so it is not execution's call.
- **T8(D)** — 5 residues that change storage/cookie keys, so they need a migration note for existing
  installs.
