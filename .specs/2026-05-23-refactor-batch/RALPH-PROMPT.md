You are continuing a multi-iteration refactor of the polyglot template at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack`. Each iteration is fed THIS SAME prompt and sees your previous work via git history + file state. You complete ONE spec per iteration.

## Goal

Execute every spec in `.specs/2026-05-23-refactor-batch/` until all are marked `Status: done`. When everything is done, signal completion.

## Resumption context (2026-05-24)

Waves 1, 2, 3 are fully done (14/25 specs). Branch tip should be `af8e436e` or later. Next pick is **SPEC-18** (wave 4, stream A — Handshake reads scopes from `PLATFORM_REGISTRY`). Read `handoffs/2026-05-24-refactor-batch.md` for the full state recap, gotchas, and pre-flight checks before starting iteration 1.

Remaining waves:
- **Wave 4** — Connect flow rework (5 specs: 18, 21, 23, 15, 22). Stream A (SPEC-18) is parallel-safe; Stream B is strictly sequential.
- **Wave 5** — Event / handler organization (3 specs: 14, 12, 24). SPEC-14 touches contracts + Go publishers.
- **Wave 6** — Product BC + feature gaps (3 specs: 10, 11, 17). SPEC-11 ports `ProductCostHandler` from the bk-dash backend at `/Users/gabrielaraujo/Desktop/Projetos/bk-company/bk-dash-backend/backend-old/src/modules/products/`.

## Per-iteration workflow

1. `cat .specs/2026-05-23-refactor-batch/README.md` — see what's pending in the status table.
2. Pick the next spec to do:
   - Lowest wave number with at least one `Status: todo` entry.
   - Within that wave, lowest spec number whose `Depends on:` clause is satisfied (i.e. all listed deps are `done`).
   - Respect parallelism streams when relevant — README documents them per wave.
3. `cat .specs/2026-05-23-refactor-batch/SPEC-NN-<slug>.md` — read front to back, including `Notes`.
4. Read every file listed under the spec's `Affected files`. Build mental model before editing.
5. Implement the change per `Scope`. Apply TS / Go / Contracts sub-sections in that order when they exist; regenerate contracts (`bun emit-openapi && bun sdk`) before consuming-side edits if the spec touches `packages/contracts/`.
6. Run `bun tsc`. Must pass with zero errors. If it fails, fix and re-run.
7. Run `bun run test` for the affected suites (or all under the changed BCs if uncertain). Must pass.
8. Edit the spec's header: change `Status: todo` → `Status: done`.
9. Edit `README.md`'s status table — change the matching row's status from `todo` to `done`.
10. Commit ALL changes (code + spec status + README status) in one commit. Format:
    ```
    refactor(<area>): SPEC-NN <short description> (wave-N)
    ```
    Examples:
    - `refactor(core): SPEC-20 Id.fromSeed unify deterministic ids (wave-3)`
    - `refactor(catalog): SPEC-10 product tags via ProductOverride (wave-6)`
11. Exit.

## Completion criteria

When every row in the README's status table shows `done`, output exactly:

<promise>REFACTOR BATCH COMPLETE</promise>

## Blocker handling

If a spec is wrong, ambiguous, or genuinely blocked (e.g. missing upstream dependency you can't resolve, contract conflict, test failure you can't diagnose):

1. Edit the spec's header: `Status: todo` → `Status: blocked`.
2. Add a `## Blocker` section to the spec explaining:
   - What's blocking (concrete description)
   - What you tried
   - What input is needed from the human
3. Commit just the spec update: `chore(refactor-batch): SPEC-NN blocked — <reason>`.
4. Output exactly:

<promise>REFACTOR BATCH BLOCKED</promise>

Then stop. The user will unblock manually before resuming.

## Hard rules

- **One spec per iteration.** Do not start a second spec.
- **Never skip the tsc / test gates** (step 6 / 7).
- **Never touch items listed in `Out of scope`** inside the spec.
- **Wave gating is strict.** Do not start a wave-N+1 spec until every wave-N spec is `done`.
- **Anti-invention.** Don't add features, abstractions, files, or commits beyond what the spec lists.
- **Within-spec sub-sections matter.** When a spec has `### TS side` / `### Go side` / `### Contracts side`, do all sides before checking off.
- **Cross-language changes regenerate first.** If `packages/contracts/wire/` or `packages/contracts/db/` changes, run `bun emit-openapi && bun sdk` (and `bun migrate:dev` for db changes) before any consuming-side edits.

## Self-recovery (between iterations)

If a previous iteration crashed mid-way and left uncommitted changes:
- `git status` to see what's modified.
- If changes look complete and were just missing the commit: finish the workflow from where it left off (run tsc/test, update statuses, commit).
- If changes look incomplete or wrong: `git checkout .` (template repo — no risk of losing work that wasn't yours) and restart the spec from scratch.

## Reference

- Project conventions: `CLAUDE.md`
- Skills (per-artifact playbooks): `.claude/skills/<name>/SKILL.md`
- Memory (durable rules): `~/.claude/projects/-Users-gabrielaraujo-Desktop-Projetos-pessoal-template-fullstack/memory/MEMORY.md`
- bk-dash source for SPEC-11: `/Users/gabrielaraujo/Desktop/Projetos/bk-company/bk-dash-backend/backend-old/src/modules/products/`

Begin.
