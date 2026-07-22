# Canonical Artifact Snippets — Phase B (`/plan` Scaffold-then-Mutate) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle. This plan rewires the planning tooling so
> `/plan` stops hand-writing CLI-owned boilerplate.

**Goal:** `/plan` authors each scaffoldable artifact as a `bun cli` scaffold step + a delta-only edit step (never re-pasting boilerplate), and `review-plan.ts` reconstructs the final file (render skeleton + apply the delta) before running its checklist.

**Architecture:** Three changes. (1) `review-plan.ts` stops using its own drifted `## Task (\d+)` regex and parses the canonical grammar. (2) `review-plan.ts` gains scaffold-then-mutate reconstruction: it parses a Task's `bun cli <verb> <args>` invocation, calls the matching backend generator in-memory (the Phase-A renderer) to get the skeleton, applies the Task's `edit` (SEARCH/REPLACE) blocks, and reviews the reconstructed file. (3) `.claude/commands/plan.md` documents the scaffold-then-mutate Task shape + the `edit` block format.

**Tech Stack:** TypeScript, Bun, `bun:test`. Builds on Phase A (`scripts/cli/snippet/render.ts`, `scripts/cli/backend/typescript/{index,bindings,templates}.ts`, the migrated registry snippets) — all committed.

**Spec:** .specs/2026-05-27-canonical-artifact-snippets-design.md
**Tasks:** 3
**Estimated minutes:** 150

> **Scope (spec Decision 9):** Plan B of three. Depends on Plan A (built). No
> entities/controllers/migrations — **no Contract Lock / SDK regen**; D-1…D-6 N/A.
> Reconstruction targets **backend** artifacts (the generators Phase A externalized);
> frontend/expo scaffolded paths gracefully fall back to today's snippet extraction
> until Plan C externalizes them. `/build` needs no engine change (Decision 6).

---

## Task T1: review-plan parses the canonical plan grammar

**Files to write:**
- Modify: `scripts/review-plan.ts` — replace the private `## Task (\d+)` task regex with the canonical `## Task T<N>:` grammar; keep task ids `T`-prefixed end-to-end
- Test: `scripts/review-plan.test.ts`

**Files to read:**
- `scripts/graph/cli/plan-parser.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none — internal tooling)
**Depends on:** (none)

Today `review-plan.ts:73` uses `/^## Task (\d+[a-z]?):/` — it finds **0 tasks** on
canonical `## Task T1:` plans (the grammar `plan-parser.ts` and `plan.md` now use).
This unbreaks it. Keep the existing offset tokenizer (path decls + code fences);
only the task-splitting regex and id handling change.

### Step T1.1 — Write the failing test

Create `scripts/review-plan.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { parsePlan } from './review-plan'

// The fixture is an embedded plan. Build it via array-join, and produce `##` and
// the ``` fence through `H`/`F` constants — so the fixture's own headings/fences
// stay INDENTED in this test file's source and never collide with the outer
// markdown (parsers match line-start `## Task` regardless of code fences).
const H = '##'
const F = '\`'.repeat(3)
const PLAN = [
  '# Demo — Implementation Plan',
  '',
  '**Spec:** .specs/x.md',
  '',
  `${H} Task T1: First behavior`,
  '',
  '**Files to write:**',
  '- Create: `scripts/demo/a.ts`',
  '',
  `${H}# Step T1.1 — impl`,
  `${F}typescript`,
  'export const a = 1',
  F,
  '',
  `${H} Task T2: Second behavior`,
  '',
  '**Files to write:**',
  '- Create: `scripts/demo/b.ts`',
  '',
  `${H}# Step T2.1 — impl`,
  `${F}typescript`,
  'export const b = 2',
  F,
  '',
  `${H} Final Validation`,
  '- [ ] tsc',
].join('\n')

describe('parsePlan (canonical T-prefixed grammar)', () => {
  it('extracts both T-prefixed tasks (regression: was 0 with the old \\d+ regex)', async () => {
    const files = await parsePlan(PLAN)
    expect(files.map(f => f.taskId).sort()).toEqual(['T1', 'T2'])
  })

  it('attributes each code block to its Create path', async () => {
    const files = await parsePlan(PLAN)
    const a = files.find(f => f.destPath === 'scripts/demo/a.ts')
    expect(a?.code).toContain('export const a = 1')
  })

  it('does not bleed Final Validation into the last task', async () => {
    const files = await parsePlan(PLAN)
    expect(files.every(f => !f.code.includes('tsc'))).toBe(true)
  })
})
```

> Note: `parsePlan` is `async` after Task T2 (it awaits in-memory scaffolding). These
> tests `await` it from the start so T2 needs no test churn. In T1, `parsePlan` is
> still synchronous — `await` on a sync return is harmless, keeping the test stable
> across both tasks.

### Step T1.2 — Run test to verify it fails

Run: `bun test scripts/review-plan.test.ts`
Expected: FAIL — `parsePlan` is not exported (today it's a module-private function), and/or returns `[]` because the `\d+` regex doesn't match `T1`.

### Step T1.3 — Align the task regex + export parsePlan

Modify `scripts/review-plan.ts`. Change the task-splitting regex and id capture so it matches the canonical grammar, and `export` `parsePlan` for the test:

```diff
- function parsePlan(md: string): ExtractedFile[] {
- 	const taskRe = /^## Task (\d+[a-z]?):\s*(.+)$/gm
+ export function parsePlan(md: string): ExtractedFile[] {
+ 	// Canonical grammar (single source: scripts/graph/cli/plan-parser.ts TASK_HEADING).
+ 	const taskRe = /^## Task (T\d+[a-z]?):\s*(.+)$/gm
```

`match[1]` is now the full `T`-prefixed id (e.g. `T1`). Update the `--task` filter
to compare `T`-prefixed ids and stop stripping the `T`:

```diff
- 	if (values.task) {
- 		const taskId = String(values.task).replace(/^T/i, '')
- 		files = files.filter(f => f.taskId === taskId)
- 	}
+ 	if (values.task) {
+ 		const taskId = /^T/i.test(String(values.task)) ? String(values.task) : `T${values.task}`
+ 		files = files.filter(f => f.taskId === taskId)
+ 	}
```

And the display line (currently `T${f.taskId}`) now already carries the `T`:

```diff
- 		console.log(`  - T${f.taskId} [${f.mode}]: ${f.destPath} (${f.code.split('\n').length} lines)`)
+ 		console.log(`  - ${f.taskId} [${f.mode}]: ${f.destPath} (${f.code.split('\n').length} lines)`)
```

### Step T1.4 — Run test to verify it passes

Run: `bun test scripts/review-plan.test.ts`
Expected: PASS — 3 tests green.

### Step T1.5 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T1.6 — Commit

```bash
git add scripts/review-plan.ts scripts/review-plan.test.ts
git commit -m "fix(review-plan): parse canonical T-prefixed task grammar (Task T1)"
```

---

## Task T2: review-plan reconstructs scaffold-then-mutate Tasks

**Files to write:**
- Modify: `scripts/review-plan.ts` — add `bun cli` invocation parsing, `edit` block parsing, edit application, and skeleton reconstruction via the backend generators
- Test: `scripts/review-plan.test.ts` — reconstruction cases

**Files to read:**
- `scripts/cli/backend/index.ts`
- `scripts/cli/backend/typescript/index.ts`
- `scripts/cli/types.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none — internal tooling)
**Depends on:** T1

Under the new `/plan` contract a scaffoldable artifact's code is a `bun cli <verb>
<args>` step + `edit` (SEARCH/REPLACE) blocks — no whole-file paste. To review the
real file, reconstruct it: run the generator in-memory (returns `{filePath,
content}` without writing), apply the edits, review the result. Non-scaffolded
paths keep today's snippet extraction.

### Step T2.1 — Write the failing test

Add to `scripts/review-plan.test.ts`:

```typescript
import { parseEditBlocks, applyEdits, extractCliInvocations, reconstructTaskFiles } from './review-plan'

describe('edit blocks', () => {
  it('parses a SEARCH/REPLACE edit fence', () => {
    const md = ['```edit', '<<<<<<< SEARCH', 'old line', '=======', 'new line', '>>>>>>> REPLACE', '```'].join('\n')
    expect(parseEditBlocks(md)).toEqual([{ path: undefined, search: 'old line', replace: 'new line' }])
  })

  it('applies an edit by exact single match', () => {
    expect(applyEdits('a\nold line\nb', [{ search: 'old line', replace: 'new line' }])).toBe('a\nnew line\nb')
  })

  it('throws when the SEARCH text is absent', () => {
    expect(() => applyEdits('a\nb', [{ search: 'missing', replace: 'x' }])).toThrow(/not found/)
  })

  it('throws when the SEARCH text matches more than once', () => {
    expect(() => applyEdits('x\nx', [{ search: 'x', replace: 'y' }])).toThrow(/more than once/)
  })
})

describe('extractCliInvocations', () => {
  it('parses a bun cli line into verb + positional + flags', () => {
    const md = '```bash\nbun cli entity sales Order --aggregate\n```'
    expect(extractCliInvocations(md)).toEqual([
      { verb: 'entity', positional: ['sales', 'Order'], flags: { aggregate: 'true' } },
    ])
  })
})

describe('reconstructTaskFiles (scaffold-then-mutate)', () => {
  // Same H/F technique as the top-of-file fixture: keep `##`/``` out of column 0
  // and out of literal triple-backticks so the embedded task can't corrupt this plan.
  const TASK = [
    `${H} Task T1: Order ships`,
    '',
    '**Files to write:**',
    '- Create: `packages/api/typescript/src/sales/entities/Order.ts`',
    '',
    `${H}# Step T1.1 — Scaffold`,
    `${F}bash`,
    'bun cli entity sales Order --aggregate',
    F,
    '',
    `${H}# Step T1.2 — Mutate`,
    `${F}edit`,
    '<<<<<<< SEARCH',
    '\t// Mutation methods:',
    '=======',
    "\tship(): void { this.status = 'SHIPPED' }",
    '>>>>>>> REPLACE',
    F,
  ].join('\n')

  it('renders the registry skeleton and applies the delta', async () => {
    const files = await reconstructTaskFiles(TASK)
    expect(files).toHaveLength(1)
    expect(files[0]!.filePath).toContain('sales/entities/Order.ts')
    expect(files[0]!.content).toContain('extends AggregateRoot') // Phase-A skeleton preserved
    expect(files[0]!.content).toContain("ship(): void { this.status = 'SHIPPED' }") // delta applied
    expect(files[0]!.content).not.toContain('// Mutation methods:') // SEARCH replaced
  })
})
```

### Step T2.2 — Run test to verify it fails

Run: `bun test scripts/review-plan.test.ts`
Expected: FAIL — `parseEditBlocks`/`applyEdits`/`extractCliInvocations`/`reconstructTaskFiles` not exported.

### Step T2.3 — Implement edit parsing + application

Add to `scripts/review-plan.ts` (above `main`). Import the backend generators at the top:

```typescript
import { backendGeneratorsFor } from './cli/backend'
```

```typescript
export type EditBlock = { path?: string; search: string; replace: string }

const EDIT_FENCE = /```edit(?:\s+path=(\S+))?\n([\s\S]*?)```/g
const SEARCH_REPLACE = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/

export function parseEditBlocks(taskBody: string): EditBlock[] {
  const blocks: EditBlock[] = []
  for (const fence of taskBody.matchAll(EDIT_FENCE)) {
    const sr = SEARCH_REPLACE.exec(fence[2]!)
    if (!sr) continue
    blocks.push({ path: fence[1], search: sr[1]!, replace: sr[2]! })
  }
  return blocks
}

export function applyEdits(content: string, edits: EditBlock[]): string {
  let out = content
  for (const e of edits) {
    const first = out.indexOf(e.search)
    if (first === -1) throw new Error(`[review-plan] SEARCH block not found in scaffolded content:\n${e.search}`)
    if (out.indexOf(e.search, first + 1) !== -1) throw new Error(`[review-plan] SEARCH block matches more than once:\n${e.search}`)
    out = out.slice(0, first) + e.replace + out.slice(first + e.search.length)
  }
  return out
}
```

### Step T2.4 — Implement `bun cli` invocation parsing

```typescript
export type CliInvocation = { verb: string; positional: string[]; flags: Record<string, string> }

// Matches `bun cli <verb> <rest-of-line>` (in a bash fence or inline). Mirrors the
// flag parsing in scripts/cli.ts: --flag=value, --flag value, bare --flag (=true).
const CLI_LINE = /\bbun\s+cli\s+([^\n`]+)/g

export function extractCliInvocations(taskBody: string): CliInvocation[] {
  const out: CliInvocation[] = []
  for (const m of taskBody.matchAll(CLI_LINE)) {
    const tokens = m[1]!.trim().split(/\s+/)
    const verb = tokens.shift()
    if (!verb) continue
    const positional: string[] = []
    const flags: Record<string, string> = {}
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!
      if (t.startsWith('--')) {
        const body = t.slice(2)
        const eq = body.indexOf('=')
        if (eq !== -1) flags[body.slice(0, eq)] = body.slice(eq + 1)
        else if (tokens[i + 1] && !tokens[i + 1]!.startsWith('-')) flags[body] = tokens[++i]!
        else flags[body] = 'true'
      } else {
        positional.push(t)
      }
    }
    out.push({ verb, positional, flags })
  }
  return out
}
```

### Step T2.5 — Implement reconstruction

```typescript
// Reconstruct the final files for a scaffold-then-mutate Task: run each `bun cli`
// backend generator in-memory, apply the Task's edit blocks to the matching file.
// Returns [] when the Task has no backend-scaffold step (caller falls back to
// snippet extraction). Frontend/expo verbs are not yet reconstructable (Plan C).
export async function reconstructTaskFiles(taskBody: string): Promise<Array<{ filePath: string; content: string }>> {
  const invocations = extractCliInvocations(taskBody)
  if (invocations.length === 0) return []
  const edits = parseEditBlocks(taskBody)
  const backend = backendGeneratorsFor('typescript')
  const results: Array<{ filePath: string; content: string }> = []

  for (const inv of invocations) {
    const gen = backend[inv.verb]
    if (!gen) continue // non-backend verb (frontend/expo) — skip; fall back to snippet extraction
    const generated = await gen(inv.positional, inv.flags)
    for (const file of generated) {
      const fileEdits = edits.filter(e => !e.path || file.filePath.endsWith(e.path))
      results.push({ filePath: file.filePath, content: applyEdits(file.content, fileEdits) })
    }
  }
  return results
}
```

### Step T2.6 — Wire reconstruction into the parse/materialize flow

In `parsePlan`, before falling back to the token-attribution loop for a task, try
reconstruction; if it yields files, emit those as `ExtractedFile`s (mode `create`)
and skip token attribution for that task. Modify the per-task loop:

```diff
  for (const task of tasks) {
    const body = md.slice(task.start, task.end)
+   const reconstructed = await reconstructTaskFiles(body)
+   if (reconstructed.length > 0) {
+     for (const r of reconstructed) {
+       merged.set(`${task.id}::${r.filePath}`, {
+         taskId: task.id, taskName: task.name, destPath: r.filePath, code: r.content, mode: 'create',
+       })
+     }
+     continue
+   }
    const tokens = tokenizeTaskBody(body)
```

`parsePlan` becomes `async` (it now awaits reconstruction); update its signature and
the `await parsePlan(md)` call site in `main`. The T1 test calls `await parsePlan(...)`
— update those assertions to `await` as well.

### Step T2.7 — Run tests to verify they pass

Run: `bun test scripts/review-plan.test.ts`
Expected: PASS — edit-block, applyEdits (incl. both throw cases), extractCliInvocations, and reconstructTaskFiles (skeleton + delta) all green.

### Step T2.8 — Smoke-test against a real scaffold-then-mutate task

Run:
```bash
bun scripts/review-plan.ts .plans/2026-05-27-canonical-snippets-phase-b-plan-rewire.md --dry-run
```
Expected: lists virtual files without error (this plan has no `bun cli` scaffold tasks, so it exercises the fallback path cleanly).

### Step T2.9 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T2.10 — Commit

```bash
git add scripts/review-plan.ts scripts/review-plan.test.ts
git commit -m "feat(review-plan): reconstruct scaffold-then-mutate tasks (render skeleton + apply edits) (Task T2)"
```

---

## Task T3: `/plan` documents the scaffold-then-mutate Task shape

**Files to write:**
- Modify: `.claude/commands/plan.md` — replace whole-file "minimal implementation" guidance with scaffold-then-mutate for scaffoldable artifacts; define the `edit` block format

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none — command documentation)
**Depends on:** (none)

Teach `/plan` to author scaffoldable artifacts as scaffold + delta, matching the
`edit` (SEARCH/REPLACE) format `review-plan.ts` reconstructs (T2). Non-scaffoldable
files (e.g. `lib/` utilities with no `bun cli` verb) keep whole-file steps.

### Step T3.1 — Add the scaffold-then-mutate shape to the Task-Structure section

Modify `.claude/commands/plan.md`. After the existing `### Step T<N>.3 — Write
minimal implementation` example (whole-file), insert a new subsection documenting
the preferred shape for **scaffoldable** artifacts (anything `bun cli <verb>` can
generate — entity, value-object, usecase, controller, repository, schema, event,
handler, service, middleware, enum, projection, projector, query):

````markdown
#### Scaffoldable artifacts — scaffold-then-mutate (preferred)

If `bun cli` can generate the artifact, DO NOT paste the whole file. Emit a scaffold
step then a delta-only mutate step — the CLI owns the boilerplate, the plan ships
only the behavior:

### Step T<N>.3 — Scaffold

```bash
bun cli entity sales Order --aggregate
```

### Step T<N>.4 — Mutate (delta only)

Apply against the scaffolded file — each block's SEARCH must match the generated
skeleton exactly once:

```edit path=packages/api/typescript/src/sales/entities/Order.ts
<<<<<<< SEARCH
	// Mutation methods:
	// updateName(name: string): void {
	// 	this.name = name; this.validate()
	// }
=======
	ship(): void {
		if (this.status !== OrderStatus.PAID) throw new BaseError<DomainErrors>('ORDER_NOT_PAID')
		this.status = OrderStatus.SHIPPED
		this.validate()
	}
>>>>>>> REPLACE
```

`review-plan.ts` reconstructs the final file (renders the registry skeleton via
`bun cli`, applies these edits) and reviews it. Whole-file `typescript` blocks are
ONLY for non-scaffoldable files (e.g. a `lib/` helper with no `bun cli` verb).
````

### Step T3.2 — Document the `edit` block format

In the same section, add the format spec:

````markdown
**`edit` block format** (applied by `scripts/review-plan.ts`):
- Fence ` ```edit ` with optional `path=<relative/path>` (required only when the
  scaffold step emits MORE than one file, e.g. `repository` → abstract + Drizzle).
- Body: `<<<<<<< SEARCH` / `=======` / `>>>>>>> REPLACE` markers.
- The SEARCH text must appear EXACTLY ONCE in the scaffolded skeleton (review-plan
  errors on zero or multiple matches — keep SEARCH blocks small and unique, anchored
  on a comment marker or signature from the skeleton).
````

### Step T3.3 — Cross-reference from the Modify-Operations + Anti-Patterns sections

Modify `.claude/commands/plan.md`:
- In "Modify Operations — Diff Style", add a one-line note: *"For a NEW scaffoldable
  artifact, prefer the scaffold-then-mutate shape above (scaffold + `edit` blocks)
  over a whole-file `typescript` block."*
- In "Anti-Patterns (do NOT do)", add: *"❌ Pasting a whole-file `typescript` block
  for an artifact `bun cli` can scaffold. Scaffold it, then ship only the `edit`
  delta — the CLI owns the boilerplate (Phase B)."*

### Step T3.4 — Verify the doc is self-consistent

Run:
```bash
grep -n "scaffold-then-mutate\|```edit\|SEARCH/REPLACE\|<<<<<<< SEARCH" .claude/commands/plan.md
```
Expected: the new subsection, the `edit` format spec, and the anti-pattern line all present.

### Step T3.5 — Commit

```bash
git add .claude/commands/plan.md
git commit -m "docs(plan): scaffold-then-mutate Task shape + edit-block format (Task T3)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `bun test scripts/review-plan.test.ts` — grammar + edit + reconstruction tests pass
- [ ] `bun scripts/review-plan.ts .plans/2026-05-27-canonical-snippets-phase-b-plan-rewire.md --dry-run` — runs without error (exercises the fallback path)
- [ ] AC mapping (every Phase B spec AC → ≥1 test / verification):
  - AC-B1 (`plan.md` documents the scaffold-then-mutate shape + `edit` format) → Task T3 (`grep` check in Step T3.4; reviewer confirms prose). No automated unit test — it's a documentation change.
  - AC-B2 (plans under the new contract contain `bun cli` + delta steps, no boilerplate) → satisfied by the T3 template + the worked example; the `reconstructTaskFiles` test (`scripts/review-plan.test.ts`) proves such a Task is reviewable end-to-end.
  - AC-B3 (`review-plan.ts` reconstructs skeleton + applies delta, then reviews) → `scripts/review-plan.test.ts:"reconstructTaskFiles … renders the registry skeleton and applies the delta"` + the `parseEditBlocks`/`applyEdits`/`extractCliInvocations` unit tests.

## Notes

- **No new dependency** — search/replace application is a plain string operation; no diff/patch library added.
- **`parsePlan` becomes `async`** in T2 (it awaits in-memory generation). The T1 test asserts on `parsePlan` synchronously; T2 updates those call sites to `await`. Keep the two test additions consistent within the single `scripts/review-plan.test.ts`.
- **Backend-only reconstruction.** `reconstructTaskFiles` resolves verbs via `backendGeneratorsFor('typescript')`. Frontend/expo scaffold verbs return no generator → `[]` → the caller falls back to today's snippet extraction. Full frontend reconstruction lands with Plan C (when blocks externalize). This is graceful degradation, not a gap.
- **`process.exit` risk:** the CLI generators call `requireArg(...)` which `process.exit(1)` on malformed args. A malformed `bun cli` line in a plan will therefore abort `review-plan` — acceptable, since a malformed scaffold command is a plan defect worth surfacing loudly.
- **AC-B1/B2 have no strong automated test** — they are a documentation contract (T3) plus the reconstructability proof (T2's test). Flagged so `/build`'s AC-coverage check doesn't expect a green unit test for the prose itself.
