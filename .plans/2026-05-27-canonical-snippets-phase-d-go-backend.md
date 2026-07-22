# Canonical Artifact Snippets — Phase D (Go Backend Single-Source) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Behavior-preserving refactor —
> golden-file byte-equivalence on `bun cli --lang=go` output is the safety net.
> Mirrors Phase A (which did TypeScript); the renderer is already lang-agnostic.

**Goal:** Go backend artifacts render from their `<skill>/go/registry.yaml` `snippet` (single source of formatting), and `review-plan` reconstructs Go scaffold-then-mutate Tasks — bringing Go to parity with TypeScript.

**Architecture:** Reuse the committed renderer (`scripts/cli/snippet/render.ts` — `loadSnippet(skill, lang)` already reads `<skill>/<lang>/registry.yaml`). Add a `scripts/cli/backend/go/bindings.ts` (the logic half), move each Go template body into its `go` registry `snippet`, and dissolve `scripts/cli/backend/go/templates.ts` to `renderArtifact(skill, 'go', …)` delegations. Then teach `review-plan`'s `reconstructTaskFiles` to honor `--lang=go` so Go scaffolds reconstruct through `getGenerators('go', …)`.

**Tech Stack:** TypeScript, Bun, `bun:test`. Builds on Phase A/B (committed).

**Spec:** .specs/2026-05-27-canonical-artifact-snippets-design.md
**Tasks:** 3
**Estimated minutes:** 220

> Closes spec Decision 8's deferral (Go was out of Phase A scope). `go/templates.ts`
> is 1252 lines / 24 generators. The `module` generator (BC bootstrapper) stays in
> code — like TS's `context.ts`/`generateFullContext`, which Phase A did not
> externalize. No entities/migrations of our own — no Contract Lock; D-checks N/A.

---

## Task T1: A Go artifact renders from its registry snippet (pilot)

**Files to write:**
- Create: `scripts/cli/backend/go/bindings.ts`
- Create: `scripts/cli/backend/go/templates.golden.test.ts`
- Create: `scripts/cli/backend/go/__fixtures__/*.txt` (golden baselines for the pilot artifacts)
- Modify: `.claude/skills/{entity,value-object,enum,errors}/go/registry.yaml` — add `snippet:` blocks
- Modify: `scripts/cli/backend/go/templates.ts` — dissolve the `entity`/`valueObject`/`enum`/`errors` entries to `renderArtifact(…, 'go', …)`

**Files to read:**
- `scripts/cli/snippet/render.ts`
- `scripts/cli/backend/typescript/bindings.ts`
- `scripts/cli/backend/go/templates.ts`
- `scripts/cli/backend/go/index.ts`
- `.claude/skills/entity/go/registry.yaml`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /value-object, /enum, /errors, /test
**Depends on:** (none)

Prove the Go path on four representative generators: `entity` (ctx+name, single
skeleton), `valueObject` (ctx+name), `enum` (ctx+name), `errors` (ctx-only). The
externalization is mechanical — the body is the current `goTemplates.<artifact>`
string with `${expr}` → `{{placeholder}}`; the binding computes those placeholders
from the same helpers `go/index.ts` uses (`toPascalCase`, `toSnakeCase`, …). Golden
byte-equivalence is the contract.

### Step T1.1 — Capture golden fixtures from the CURRENT Go generators

For each pilot artifact, capture the current output to `__fixtures__/<artifact>.txt`
(every generated file — `errors` emits one; capture each `GeneratedFile.content`):

```bash
mkdir -p scripts/cli/backend/go/__fixtures__
bun -e "import {backendGeneratorsFor} from './scripts/cli/backend';const g=backendGeneratorsFor('go');for(const [a,args] of [['entity',[['sales','Coupon'],{}]],['value-object',[['sales','CouponCode'],{}]],['enum',[['sales','CouponStatus'],{}]],['errors',[['sales'],{}]]]){const fs=await g[a](...args);await Bun.write('scripts/cli/backend/go/__fixtures__/'+a+'.txt',fs[0].content)}"
```

### Step T1.2 — Write the golden test (GREEN against current code)

Create `scripts/cli/backend/go/templates.golden.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { backendGeneratorsFor } from '../index'

const go = backendGeneratorsFor('go')
const FIX = join(import.meta.dir, '__fixtures__')
const golden = (f: string) => readFileSync(join(FIX, f), 'utf8')
const content = async (a: string, pos: string[], flags = {}) => (await go[a]!(pos, flags))[0]!.content

describe('go generator golden equivalence (pilot)', () => {
  it('entity', async () => expect(await content('entity', ['sales', 'Coupon'])).toBe(golden('entity.txt')))
  it('value-object', async () => expect(await content('value-object', ['sales', 'CouponCode'])).toBe(golden('value-object.txt')))
  it('enum', async () => expect(await content('enum', ['sales', 'CouponStatus'])).toBe(golden('enum.txt')))
  it('errors', async () => expect(await content('errors', ['sales'])).toBe(golden('errors.txt')))
})
```

Run: `bun test scripts/cli/backend/go/templates.golden.test.ts` → PASS (baseline locked before bodies move).

### Step T1.3 — Add `snippet` blocks to the four Go registries

For each of `entity`, `value-object`, `enum`, `errors`: under the top-level
`registry:` key of `.claude/skills/<skill>/go/registry.yaml`, add a `snippet:` with
the artifact's CURRENT `goTemplates.<artifact>` body verbatim, replacing each
`${expr}` with a `{{placeholder}}` (e.g. `${pascal}` → `{{Pascal}}`, `${snake}` →
`{{snake}}`, `${ctx}` → `{{ctx}}`). Preserve Go's tab indentation exactly (use `|`
block scalars). Migrate any existing `canonical_snippet` → `snippet.exemplar`.

> The set of `{{placeholders}}` per artifact = exactly the `${…}` interpolations in
> that generator's template literal today. Nothing more.

### Step T1.4 — Create the Go bindings + delegate the four entries

Create `scripts/cli/backend/go/bindings.ts` — one entry per pilot artifact computing
its placeholder map from `(ctx, name, opts)`, reusing the helpers `go/index.ts`
already imports (`toPascalCase`, `toSnakeCase`, etc.):

```typescript
import { toPascalCase } from '../helpers'
import { toSnakeCase } from './index'
import type { Bindings } from '../../snippet/types'

export const goBackendBindings = {
  entity: (ctx: string, name: string): Bindings => ({ ctx, Pascal: toPascalCase(name), snake: toSnakeCase(name) }),
  valueObject: (ctx: string, name: string): Bindings => ({ ctx, Pascal: toPascalCase(name), snake: toSnakeCase(name) }),
  enum: (ctx: string, name: string): Bindings => ({ ctx, Pascal: toPascalCase(name), snake: toSnakeCase(name) }),
  errors: (ctx: string): Bindings => ({ ctx, Pascal: toPascalCase(ctx) }),
}
```

> Match each binding's keys to the `{{placeholders}}` you used in Step T1.3. If
> `toSnakeCase` isn't exported from `go/index.ts`, export it (it's already defined
> there) — a one-word `export` addition, the only change to `index.ts`.

Modify `scripts/cli/backend/go/templates.ts` — add the imports and dissolve the four
entries:

```typescript
import { renderArtifact } from '../../snippet/render'
import { goBackendBindings } from './bindings'
// entity:      (ctx, name) => renderArtifact('entity', 'go', goBackendBindings.entity(ctx, name)),
// valueObject: (ctx, name) => renderArtifact('value-object', 'go', goBackendBindings.valueObject(ctx, name)),
// enum:        (ctx, name) => renderArtifact('enum', 'go', goBackendBindings.enum(ctx, name)),
// errors:      (ctx)       => renderArtifact('errors', 'go', goBackendBindings.errors(ctx)),
```

(Replace each entry's inline template-literal body with the one-line delegation; keep
the other 20 entries untouched.)

### Step T1.5 — Golden test STILL passes after bodies moved

Run: `bun test scripts/cli/backend/go/templates.golden.test.ts`
Expected: PASS — all four byte-identical. Whitespace/tab diff → fix the YAML block
scalar (use `|-` strip-chomp where a body must not end with a trailing newline);
never relax the assertion.

### Step T1.6 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T1.7 — Commit

```bash
git add scripts/cli/backend/go/bindings.ts scripts/cli/backend/go/templates.ts \
        scripts/cli/backend/go/templates.golden.test.ts scripts/cli/backend/go/__fixtures__/ \
        scripts/cli/backend/go/index.ts \
        .claude/skills/entity/go/ .claude/skills/value-object/go/ .claude/skills/enum/go/ .claude/skills/errors/go/
git commit -m "feat(cli): Go entity/value-object/enum/errors render from registry snippets — pilot (Task T1)"
```

---

## Task T2: The remaining Go artifacts render from the registry

**Files to write:**
- Modify: `.claude/skills/{schema,usecase,query,controller,repository,service,event,handler,projection,projector,middleware,test}/go/registry.yaml` — add `snippet:` blocks
- Modify: `scripts/cli/backend/go/bindings.ts` — add the remaining bindings
- Modify: `scripts/cli/backend/go/templates.ts` — dissolve the remaining entries (all but `module`)
- Modify: `scripts/cli/backend/go/templates.golden.test.ts` — add a golden case per remaining generator
- Create: `scripts/cli/backend/go/__fixtures__/*.txt` — one per remaining generator output

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /schema, /usecase, /query, /controller, /repository, /service, /event, /handler, /projection, /projector, /middleware, /test
**Depends on:** T1

Apply the proven transform to the remaining generators. Multi-body skills use named
`skeletons` + a `_variant` binding (exactly like TS value-object/controller):

| Go generators | skill | skeleton / skeletons |
|---|---|---|
| `repositoryInterface` / `repositoryPg` / `repositoryMock` | `repository` | default = interface; `skeletons.pg`, `skeletons.mock` |
| `domainEvent` / `integrationEvent` | `event` | default = domain; `skeletons.integration` |
| `internalHandler` / `externalHandler` | `handler` | default = internal; `skeletons.external` |
| `projection` | `projection` | default skeleton |
| `projectionRepository` / `projectionRepositoryMock` / `projectionRepositoryPg` | `projection` | `skeletons.repository`, `skeletons.repositoryMock`, `skeletons.repositoryPg` |
| `projector` / `middleware` / `service` / `schema` / `usecase` / `query` / `controller` / `test` | own skill | default skeleton (controller may need verb variants — mirror its current branches) |

> `module` (the bounded-context bootstrapper) is NOT externalized — it stays in
> `go/templates.ts` as code, like TS's `context.ts`/`generateFullContext`.

### Step T2.1 — Capture golden fixtures for every remaining generator (baseline GREEN)

Mirror Step T1.1's `bun -e` capture for each remaining generator + variant (the ones
emitting multiple files — `repository`, `projection*` — capture each `GeneratedFile`).
Add a golden case per fixture to `templates.golden.test.ts`. Confirm GREEN against
current code.

### Step T2.2 — Externalize each body + add its binding

For each: move the `goTemplates.<artifact>` body into its `<skill>/go/registry.yaml`
`snippet` (`${expr}` → `{{placeholder}}`; named `skeletons.<variant>` per the table),
migrate any `canonical_snippet` → `snippet.exemplar`, and add the binding to
`goBackendBindings` (computing the placeholders + `_variant`).

### Step T2.3 — Dissolve each entry; `module` is the only body left

Replace every remaining `goTemplates.<artifact>` body with a `renderArtifact(skill,
'go', …)` delegation. After this, `go/templates.ts` contains only delegations + the
`module` generator.

### Step T2.4 — Golden STILL green + no-bodies guard

Run: `bun test scripts/cli/backend/go/templates.golden.test.ts` → PASS for all.
Run: `grep -nE 'return \`|=> \`' scripts/cli/backend/go/templates.ts` → only the
`module` generator's body matches (every other entry is a delegation).

### Step T2.5 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T2.6 — Commit

```bash
git add scripts/cli/backend/go/ .claude/skills/
git commit -m "refactor(cli): sweep remaining Go artifacts to registry snippets (Task T2)"
```

---

## Task T3: review-plan reconstructs Go scaffold-then-mutate Tasks

**Files to write:**
- Modify: `scripts/review-plan.ts` — resolve `--lang=go` invocations through `getGenerators('go', …)`
- Test: `scripts/review-plan.test.ts` — Go reconstruction case

**Files to read:**
- `scripts/cli/resolve.ts`
- `scripts/cli/backend/helpers.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none — internal tooling)
**Depends on:** T1

`reconstructTaskFiles` hardcodes `getGenerators('typescript', …)`, so a `bun cli
entity … --lang=go` scaffold reconstructs against the TS generator (wrong) or—after
Phase D—should use Go. Detect the `--lang` flag per invocation.

### Step T3.1 — Write the failing test

Add to `scripts/review-plan.test.ts` (uses the existing module-level `H`/`F` constants):

```typescript
describe('reconstructTaskFiles (go)', () => {
  const GO = [
    `${H} Task T1: Go coupon`,
    '',
    '**Files to write:**',
    '- Create: `packages/api/go/internal/sales/entities/coupon.go`',
    '',
    `${H}# Step T1.1 — Scaffold`,
    `${F}bash`,
    'bun cli entity sales Coupon --lang=go',
    F,
  ].join('\n')

  it('reconstructs a Go entity from its go registry snippet (no edits)', async () => {
    const files = await reconstructTaskFiles(GO)
    expect(files).toHaveLength(1)
    expect(files[0]!.filePath).toContain('go/internal/sales/entities')
    expect(files[0]!.content).toContain('package') // real Go source, rendered from the go snippet
  })
})
```

### Step T3.2 — Run test to verify it fails

Run: `bun test scripts/review-plan.test.ts`
Expected: FAIL — the Go entity reconstructs against the `typescript` generator (wrong path/content) or mismatches.

### Step T3.3 — Detect `--lang` in reconstruction

Modify `scripts/review-plan.ts` — in `reconstructTaskFiles`, derive the backend lang
per invocation from its `--lang` flag:

```diff
    for (const inv of invocations) {
+     const lang = inv.flags.lang === 'go' ? 'go' : 'typescript'
      const platform = resolvePlatform(inv.flags.platform)
-     const gen = getGenerators('typescript', platform, inv.verb)[inv.verb]
+     const gen = getGenerators(lang, platform, inv.verb)[inv.verb]
```

> `getGenerators` already merges `backendGeneratorsFor(lang)` — passing `'go'` routes
> backend verbs to the Go generators. Frontend verbs ignore `lang` (platform-routed).

### Step T3.4 — Run tests to verify they pass

Run: `bun test scripts/review-plan.test.ts`
Expected: PASS — the Go case plus all existing TS/frontend/grammar cases stay green.

### Step T3.5 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T3.6 — Commit

```bash
git add scripts/review-plan.ts scripts/review-plan.test.ts
git commit -m "feat(review-plan): reconstruct Go (--lang=go) scaffold-then-mutate tasks (Task T3)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `bun test scripts/cli/backend/go/templates.golden.test.ts scripts/review-plan.test.ts` — Go golden + Go reconstruction pass
- [ ] `grep -nE 'return \`|=> \`' scripts/cli/backend/go/templates.ts` — only `module` remains a body
- [ ] `bun cli entity sales Probe --lang=go --print` — Go scaffolder still emits (now via the registry snippet)
- [ ] AC mapping:
  - Go renders from registry snippets → `scripts/cli/backend/go/templates.golden.test.ts` (all generators byte-equivalent)
  - Go reconstruction in review-plan → `scripts/review-plan.test.ts:"reconstructTaskFiles (go) … reconstructs a Go entity from its go registry snippet"`

## Notes

- **Renderer reuse:** no new renderer — `scripts/cli/snippet/render.ts` is lang-agnostic (`loadSnippet(skill, lang)`); Phase D only adds Go bindings + Go registry snippets + delegations.
- **Whitespace:** Go uses tabs; `|` block scalars preserve them; `|-` strip-chomp where no trailing newline. Golden tests are the guard.
- **`module` stays code** — the BC bootstrapper isn't a single-artifact snippet (parity with TS's `context.ts`).
- **Reconstruction lang:** Go scaffolds must carry `--lang=go` in their `bun cli` line for `review-plan` to route them to the Go generators (the cli itself also infers lang from cwd, but plans can't rely on cwd).
