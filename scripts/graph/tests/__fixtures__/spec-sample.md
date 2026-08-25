# Sample Spec — Fixture for the spec parser

**Status:** Approved
**Bounded Context:** tooling
**Owner:** the graph harness
**Estimated minutes:** 0

> This file exists so `parseSpec` is exercised against a document THIS repo owns. The test used to
> read `.specs/2026-05-13-agentic-coding-system-design.md`, a spec that never existed here — it came
> along with `scripts/graph/` from the source repo, and because nothing ever ran the suite, the dead
> pointer sat there from 2026-07-21 to 2026-08-14. A parser test should assert on parsing, not on
> the contents of whatever document happened to be lying around.

## Decisions

1. **Sections are addressed by heading, never by position.** A spec that adds a preamble paragraph
   must not shift what `Decisions` means, so the parser indexes `##` headings and reads bodies out
   of that map.
2. **Numbered lines start a decision; indented continuations extend it.** This decision spans two
   lines on purpose, so the fixture exercises the continuation branch and not only the happy path.
3. **An unknown `Status` is an error, not a default.** Silently coercing to `Draft` would let a
   malformed spec look approved-adjacent.
4. **Components are bullets, so an empty section yields an empty array.** Absent is not zero-ish;
   it is zero.
5. **Acceptance criteria carry their checkbox state.** The parser keeps the raw marker so a caller
   can tell "planned" from "done" without re-reading the file.

## Components Affected

- `scripts/graph/cli/spec-parser.ts` — the parser under test
- `scripts/graph/cli/plan-parser.ts` — its sibling, same section-map approach
- `scripts/graph/tests/spec-parser.test.ts` — the test this fixture feeds
- `scripts/graph/tests/__fixtures__/spec-sample.md` — this file

## Acceptance Criteria

- [ ] AC-1 — `parseSpec` returns `status: 'Approved'` for the preamble above
- [ ] AC-2 — `boundedContext` contains `tooling`
- [ ] AC-3 — `decisions.length` is 5, one per numbered line, continuations folded in
- [x] AC-4 — `componentsAffected.length` is 4, and a checked box parses like an unchecked one
- [ ] AC-5 — `acceptanceCriteria.length` is 6, counting this list
- [ ] AC-6 — a spec with no `Decisions` section yields `[]` rather than throwing
