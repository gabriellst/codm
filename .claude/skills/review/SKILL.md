---
name: review
description: Hands-on review workflow focused on listing concrete bad practices and required refactors. Use this skill for code review sessions, checking changes against the relevant skill's registry.yaml, and generating actionable findings with severity levels.
---

# Code Review

Use this skill to produce practical review output centered on bad practices that require refactoring.

## Mandatory Pre-Review Step: Graph Context

Before reading any files, run **once** for the entire review:

```bash
bun scripts/graph/cli/index.ts review --diff <base-ref> --json --depth=3 > /tmp/graph-review.json
# OR for unstaged changes:
bun scripts/graph/cli/index.ts review --json --depth=3 > /tmp/graph-review.json
# OR pass explicit files:
bun scripts/graph/cli/index.ts review --files <a.ts> <b.tsx> --json --depth=3 > /tmp/graph-review.json
```

This produces:

**Top-level fields:**
- `registries` — map keyed by skill name (e.g. `controller`, `entity`). Each value contains `dependsOn` / `dependedBy` / `patterns` / `badPractices`, pre-parsed once per batch (no re-parsing YAML). Each file's `skill` field references into this map.

**Per file, per node:**
- `node` — id, kind, context, location (deterministic — no guessing what kind of artifact this is)
- `skill` — the skill name (look up `batch.registries[skill]` for rules)
- `incoming` / `outgoing` — direct upstream/downstream edges with kind labels (e.g. `wraps-usecase`, `defines-schema`, `consumes-sdk-hook`)
- `incomingResolved` / `outgoingResolved` — for each edge, a slim `peer` projection: `{ id, kind, context, location }` — enough to navigate to the file
- `transitiveDownstream` — `{ count, nodes, edges, truncated, byKind? }`. `count` is always the real total. When `count > 50` (default), `truncated: true` and `nodes` holds a contract-first sample (SDK hooks, zod schemas, controllers, usecases, forms, repository/service interfaces, events come first); `byKind` gives the full kind histogram so you keep the structural picture even on the elided long tail. Override the cap with `--max-downstream=N`.
- `transitiveUpstream` — full `{ nodes, edges }` (typically small in practice; not capped)

**Do NOT re-classify dependencies manually** by reading imports or guessing skill mapping. The graph already did this deterministically. Use the JSON output as the source of truth for:
- Which skill registry to consult (look up `graph-review.registries[node.skill]`)
- What this artifact is and which layer it belongs to (`node.kind`, `node.context`)
- Direct + transitive impact (`outgoing`, `transitiveDownstream.count` / `byKind`)
- Coverage section in the output (every node id you visited)

When `transitiveDownstream.truncated` is true: the `nodes` sample is sufficient for contract-consistency checks (contract consumers come first); use `byKind` to reason about the long tail without inspecting every leaf. If you need the full list for a specific suspect node, re-run with `--max-downstream=500`.

If a file in the diff has `nodes: []`, it's either a non-source file (markdown, config, JSON) or an unclassified pattern — flag the latter as `Architecture Ambiguity` so the graph extractor can be improved.

## Source Order

1. **Graph review payload** (`/tmp/graph-review.json`) — node classifications, deps, blast radius
2. The relevant skill's `registry.yaml` (already loaded once at the top level as `batch.registries[skillName]`)
3. `docs/BACKEND.md` + `docs/FRONTEND.md` + `docs/COMPONENTS.md` — architectural references
4. `CLAUDE.md` — first-class citizens overview
5. Relevant implementation skills in `.claude/skills/*`

If rules conflict, report `Architecture Ambiguity` and recommend one direction.

## Scope

Review the changed code end-to-end for the feature scope:
1. Route/page and component integration.
2. Query/mutation usage and SDK/type/schema coupling.
3. Controller/use case/repository/entity/event chain.
4. Dependency direction and context boundaries.

## Internal Review Method

Perform internally (do not bloat output unless needed):
1. Read the graph review payload — classifications, deps, blast radius are already resolved.
2. For each `files[i].nodes[j]`:
   a. Read the changed file (and any peer flagged in `incomingResolved`/`outgoingResolved` whose code you must inspect to evaluate this finding — e.g. the use case wrapped by a controller). Each resolved entry has `peer: { id, kind, context, location }` — read `peer.location.file` to find the source.
   b. Resolve the registry once via `registry = batch.registries[node.skill]`. Match implementation against `registry.patterns` (`when: always` are mandatory).
   c. Match against `registry.badPractices` and the cross-cutting `Critical Rules` below.
3. For findings that touch a contract (controller schema, exported SDK type, public hook), confirm `transitiveDownstream` shows the change is consistent — otherwise raise `CHANGES_REQUESTED`. When `truncated: true`, the contract consumers are guaranteed to be in the `nodes` sample (sorted contract-first); use `byKind` to reason about the long tail of leaf consumers.
4. Determine smallest safe refactor for each finding.

The `Coverage` output section must list:
- every `node.id` whose `skill` mapped to a skill registry (proves the rules were checked)
- every `kind` represented in the diff (proves no layer was skipped)
- the maximum blast radius observed (`transitiveDownstream.count`) — flags risky changes

## Mandatory Output (Practical Mode)

Always return findings-first and severity-ordered.

### Required Sections

1. `Status: APPROVED | CHANGES_REQUESTED`
2. `Bad Practices Found`
3. `Refactor Actions Required`
4. `New Bad Practices Added`
5. `Architecture Ambiguities`
6. `Coverage`

### Finding Item Format (Required)

Each item must contain:
1. Severity: `Blocker | Major | Minor`
2. Location: `path/file.ts:line`
3. Violated practice: `bp-xx` or `Skill:<name>:<rule>`
4. Why this is bad: behavior/architecture/evolvability risk
5. Required refactor: explicit code-level action

## Verdict Rules

1. `CHANGES_REQUESTED` if any Blocker or Major exists.
2. `APPROVED` only if no refactor-required bad practice exists.

## New Bad Practice Rule

When a finding is not covered by the relevant skill's `registry.yaml`:
1. Add a new FP entry using the next sequential number.
2. Include wrong real code pattern from review context.
3. Include a correct alternative and severity.
4. Add checklist item if needed.
5. Report it under `New Bad Practices Added`.

If no new practice was needed, return `None` in that section.

> The `mechanical: true` + `detect:` entries in each skill's `registry.yaml` are the single source of truth for BOTH `bun review` / `/review` AND the post-edit `classify-edit.ts` hook (`.claude/hooks/classify-edit.ts`), which routes a changed file to its skill via `.claude/registry.yaml` and replays those regexes. Adding a machine-checkable bad-practice = add `mechanical: true` + `detect:` to the relevant registry; no separate hook code.

## Output Template

```markdown
## Status: APPROVED | CHANGES_REQUESTED

## Bad Practices Found
- [ ] [Severity] `path/file.ts:line`
  - Practice: bp-xx | Skill:<name>:<rule>
  - Why bad: <risk>
  - Required refactor: <smallest safe change>

## Refactor Actions Required
1. <action tied to finding 1>
2. <action tied to finding 2>

## New Bad Practices Added
- bp-xx - <title>
- or: None

## Architecture Ambiguities
- <conflict + recommended direction>
- or: None

## Coverage
- Files reviewed: [...]
- Layers traced: [route/ui/controller/usecase/repository/entity/event]
- Query paths traced: [...]
- Mutation paths traced: [...]
```

## Critical Rules

### Enum Over String in Schemas
- In controller/use case input and output Zod schemas, **always verify** if a `z.string()` field should be a domain enum (`z.enum(MyEnum)`) instead.
- If a field represents a fixed set of values (status, type, category, role, etc.), it **must** use the corresponding domain enum — never a plain string.
- This applies to both request (input) and response (output) schemas.
- Severity: **Blocker** — plain strings where enums exist break type safety and allow invalid values.

### Avoid Unnecessary Type Casting (`as`)
- **Avoid `as` type casting** unless there is a clear, documented reason why it is necessary.
- If the type system cannot infer the correct type, the root cause should be fixed (proper generics, narrowing, schema inference) rather than silenced with `as`.
- Acceptable uses: test fixtures, external library gaps, truly unavoidable narrowing with an explanatory comment.
- Severity: **Major** — unnecessary `as` hides type errors and defeats TypeScript's safety guarantees.

### Schema Reuse Verification (bp-10 in usecase, bp-17 in controller)
- When reviewing controllers or use cases, **do not assume** a matching schema doesn't exist based on naming alone.
- For every inline `z.object()` or `z.array(z.object())` in an InputSchema/OutputSchema, **search the codebase** for value objects and shared schemas with the same field structure — not the same name.
- Search locations: `@shared/objects`, `@shared/schemas`, `@[context]/objects`, `@[context]/schemas`.
- Only mark schema reuse checks as "pass" after confirming via search that no existing schema matches the structure.
- Severity: **Major** — false negatives on this check make the entire review unreliable.

## Practical Rules

1. Prefer concrete refactor instructions over abstract flow commentary.
2. Do not output concept catalogs unless explicitly requested.
3. Do not provide syntax-only review when architectural bad practices exist.
4. Every non-trivial finding must have file:line + required refactor.
