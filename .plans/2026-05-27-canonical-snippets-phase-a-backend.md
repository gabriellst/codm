# Canonical Artifact Snippets — Phase A (Backend Single-Source) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle. This is a **behavior-preserving
> refactor**: the safety net is golden-file equivalence — `bun cli`
> output must stay byte-identical before and after migration.

**Goal:** A maintainer edits an artifact's shape in one place (its skill `registry.yaml` `snippet` block) and the backend CLI renders from it; the generator, exemplar, and teaching doc stop being separate divergent copies.

**Architecture:** A shared renderer (`scripts/cli/snippet/`) loads `<skill>/<lang>/registry.yaml → snippet`, picks a whole-body skeleton (default or a named `skeletons.<variant>`), resolves any fragment-ref bindings against `snippet.fragments`, interpolates `{{placeholders}}`, and returns the file body. Per-artifact *logic* (pascal-case, HTTP method/path inference, variant selection) moves to `scripts/cli/backend/typescript/bindings.ts`; per-artifact *formatting* moves to YAML. `templates.ts` dissolves into a thin one-line-per-artifact adapter, leaving `index.ts` (placement) untouched. `review-query.ts` repoints to `snippet.exemplar` with a `canonical_snippet` fallback so `/plan` and `/review` keep receiving the rich form.

**Tech Stack:** TypeScript, Bun, `yaml` (already a dependency), `bun:test`.

**Spec:** .specs/2026-05-27-canonical-artifact-snippets-design.md
**Tasks:** 5
**Estimated minutes:** 230

> **Scope note (from spec Decision 9):** This is Plan A of three. It has no
> dependencies and unblocks Plan B (`/plan` scaffold-then-mutate) and Plan C
> (frontend fragments). This plan touches **only** the TypeScript backend CLI
> (Decision 8 defers Go/Rust). It creates no entities, controllers-as-endpoints,
> schemas, or migrations — so there is **no Contract Lock / SDK regen** and the
> determinism checks D-1…D-6 are N/A (D-7 AC→test mapping is in Final Validation).

---

## Task T1: The renderer turns a registry snippet + bindings into a file body

**Files to write:**
- Create: `scripts/cli/snippet/types.ts`
- Create: `scripts/cli/snippet/render.ts`
- Test: `scripts/cli/snippet/render.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none — internal tooling, no artifact skill applies)
**Depends on:** (none)

This Task settles the snippet format contract (spec Open Question) and the
renderer. It is pure logic with no filesystem coupling, unit-tested directly.

### Step T1.1 — Write the failing test

```typescript
import { describe, it, expect } from 'bun:test'
import { interpolate, renderSnippet } from './render'
import type { Snippet } from './types'

describe('interpolate', () => {
  it('replaces every {{key}} with its binding value', () => {
    expect(interpolate('class {{Name}} extends {{base}} {}', { Name: 'Order', base: 'AggregateRoot' }))
      .toBe('class Order extends AggregateRoot {}')
  })

  it('throws when a referenced placeholder has no binding', () => {
    expect(() => interpolate('hello {{missing}}', { Name: 'Order' }))
      .toThrow(/missing/)
  })

  it('throws when the template still has an unresolved {{placeholder}} after interpolation', () => {
    // a binding value that itself contains a placeholder must not silently leak
    expect(() => interpolate('{{a}}', { a: 'literal {{leaked}}' }))
      .toThrow(/leaked/)
  })
})

describe('renderSnippet', () => {
  const snippet: Snippet = {
    skeleton: 'default {{Name}}',
    skeletons: {
      primitive: 'primitive {{Name}} {{NAME_ERR}}',
    },
    fragments: {
      handle: 'handle({{destructuring}})',
      mock: 'mockController = true',
    },
  }

  it('uses the default skeleton when no _variant is given', () => {
    expect(renderSnippet(snippet, { Name: 'Email' })).toBe('default Email')
  })

  it('selects a named skeleton via _variant', () => {
    expect(renderSnippet(snippet, { _variant: 'primitive', Name: 'Email', NAME_ERR: 'INVALID_EMAIL' }))
      .toBe('primitive Email INVALID_EMAIL')
  })

  it('throws when _variant names a skeleton that does not exist', () => {
    expect(() => renderSnippet(snippet, { _variant: 'nope', Name: 'Email' }))
      .toThrow(/nope/)
  })

  it('resolves a fragment-ref binding (interpolating the fragment) before substituting', () => {
    const s: Snippet = { skeleton: 'body: {{classBody}}', fragments: { handle: 'handle({{destructuring}})' } }
    expect(renderSnippet(s, { classBody: { fragment: 'handle' }, destructuring: 'const { body } = request' }))
      .toBe('body: handle(const { body } = request)')
  })

  it('throws when a fragment-ref names a fragment that does not exist', () => {
    const s: Snippet = { skeleton: '{{x}}', fragments: {} }
    expect(() => renderSnippet(s, { x: { fragment: 'ghost' } })).toThrow(/ghost/)
  })
})
```

### Step T1.2 — Run test to verify it fails

Run: `bun test scripts/cli/snippet/render.test.ts`
Expected: FAIL with `Cannot find module './render'`

### Step T1.3 — Write the types

Create `scripts/cli/snippet/types.ts`:

```typescript
// The canonical snippet shape, parsed from a skill registry.yaml `snippet:` block.
// `skeleton` is the whole-file default body. `skeletons` are named whole-file
// variants selected by a binding's `_variant`. `fragments` are reusable sub-bodies
// a binding can reference via { fragment: '<key>' } (e.g. a controller's class body).
// `imports` is reserved for frontend fragment composition (Plan C) and unused by
// backend whole-file skeletons. `exemplar` is the rich teaching form read by
// /review + /plan (migrated from the legacy `canonical_snippet` field).
export interface Snippet {
  skeleton: string
  skeletons?: Record<string, string>
  fragments?: Record<string, string>
  imports?: string[]
  exemplar?: string
}

// A binding value is either a literal string substituted for {{key}}, or a
// reference to a `fragments` entry that the renderer resolves+interpolates first.
export type BindingValue = string | { fragment: string }

// `_variant` (optional) selects a named skeleton. All other keys are {{placeholders}}.
export type Bindings = Record<string, BindingValue> & { _variant?: string }
```

### Step T1.4 — Write the renderer

Create `scripts/cli/snippet/render.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { Bindings, Snippet } from './types'

const ROOT = process.cwd()

const PLACEHOLDER = /\{\{(\w+)\}\}/g

/** Substitute every {{key}} with bindings[key]; throw on a missing binding or a
 *  placeholder that survives substitution (a value must not smuggle in a {{leak}}). */
export function interpolate(template: string, vars: Record<string, string>): string {
  const out = template.replace(PLACEHOLDER, (_m, key: string) => {
    if (!(key in vars)) throw new Error(`[snippet] no binding for placeholder {{${key}}}`)
    return vars[key]
  })
  const leftover = out.match(PLACEHOLDER)
  if (leftover) throw new Error(`[snippet] unresolved placeholder(s) after interpolation: ${leftover.join(', ')}`)
  return out
}

/** Render a parsed Snippet against its Bindings: pick skeleton (default or
 *  _variant), resolve fragment-refs, then interpolate. */
export function renderSnippet(snippet: Snippet, bindings: Bindings): string {
  const { _variant, ...rest } = bindings

  let body = snippet.skeleton
  if (_variant !== undefined) {
    const named = snippet.skeletons?.[_variant]
    if (named === undefined) throw new Error(`[snippet] no skeleton variant "${_variant}"`)
    body = named
  }

  // Resolve fragment-refs into plain strings first.
  const flat: Record<string, string> = {}
  for (const [k, v] of Object.entries(rest)) {
    if (typeof v === 'string') {
      flat[k] = v
      continue
    }
    const frag = snippet.fragments?.[v.fragment]
    if (frag === undefined) throw new Error(`[snippet] no fragment "${v.fragment}"`)
    flat[k] = interpolate(frag, flat) // fragment may reference earlier-resolved vars
  }

  return interpolate(body, flat)
}

/** Load `<skill>/<lang>/registry.yaml` and return its `snippet` block.
 *  Mirrors the variant-then-flat resolution in scripts/graph/core/review-query.ts. */
export function loadSnippet(skill: string, lang: string): Snippet {
  const path = join(ROOT, '.claude/skills', skill, lang, 'registry.yaml')
  const doc = parseYaml(readFileSync(path, 'utf8')) as { snippet?: Snippet }
  if (!doc.snippet?.skeleton) throw new Error(`[snippet] ${skill}/${lang}/registry.yaml has no snippet.skeleton`)
  return doc.snippet
}

/** Convenience used by the backend templates adapter. */
export function renderArtifact(skill: string, lang: string, bindings: Bindings): string {
  return renderSnippet(loadSnippet(skill, lang), bindings)
}
```

> Note: `interpolate` resolves fragments against `flat` accumulated so far, so a
> fragment may reference a literal binding defined alongside it (e.g. `destructuring`).
> Order Object.entries by putting literal bindings before fragment-refs in the
> binding object; the controller bindings (Task 3) do this.

### Step T1.5 — Run test to verify it passes

Run: `bun test scripts/cli/snippet/render.test.ts`
Expected: PASS — all `interpolate` + `renderSnippet` cases green.

### Step T1.6 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T1.7 — Commit

```bash
git add scripts/cli/snippet/types.ts scripts/cli/snippet/render.ts scripts/cli/snippet/render.test.ts
git commit -m "feat(cli): canonical snippet renderer + format contract (Task 1)"
```

---

## Task T2: `bun cli entity` renders from the registry, byte-for-byte unchanged

**Files to write:**
- Create: `scripts/cli/backend/typescript/bindings.ts`
- Create: `scripts/cli/backend/typescript/__fixtures__/entity.txt`
- Create: `scripts/cli/backend/typescript/__fixtures__/entity.aggregate.txt`
- Create: `scripts/cli/backend/typescript/templates.golden.test.ts`
- Modify: `.claude/skills/entity/typescript/registry.yaml` — add `snippet:` block; rename `canonical_snippet` → `snippet.exemplar`
- Modify: `scripts/cli/backend/typescript/templates.ts` — `entity` entry dissolves to a render delegation
- Modify: `.claude/skills/entity/typescript/SKILL.md` — drop the competing full code block; point to the registry snippet

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none — tooling)
**Depends on:** T1

The outer behavior: `backendGenerators.entity(['sales','Order'], {...})` returns
the same `content` after the body lives in YAML as it did when it lived in
`templates.ts`. Golden fixtures captured from the current code are the RED→GREEN
guard — they must be written from `git stash`-clean HEAD before the body moves.

### Step T2.1 — Capture golden fixtures from the CURRENT generator, then write the failing golden test

Create `scripts/cli/backend/typescript/templates.golden.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { backendGenerators } from './index'

const FIX = join(import.meta.dir, '__fixtures__')
const golden = (f: string) => readFileSync(join(FIX, f), 'utf8')

describe('backend generator golden equivalence', () => {
  it('entity (BaseEntity) is unchanged', () => {
    const [file] = backendGenerators.entity(['sales', 'Order'], {})
    expect(file.content).toBe(golden('entity.txt'))
  })

  it('entity --aggregate is unchanged', () => {
    const [file] = backendGenerators.entity(['sales', 'Order'], { aggregate: 'true' })
    expect(file.content).toBe(golden('entity.aggregate.txt'))
  })
})
```

Capture the fixtures from the current (pre-migration) generator — run this one-off
and commit the output:

```bash
mkdir -p scripts/cli/backend/typescript/__fixtures__
bun -e "import {backendGenerators} from './scripts/cli/backend/typescript/index.ts'; await Bun.write('scripts/cli/backend/typescript/__fixtures__/entity.txt', backendGenerators.entity(['sales','Order'],{})[0].content)"
bun -e "import {backendGenerators} from './scripts/cli/backend/typescript/index.ts'; await Bun.write('scripts/cli/backend/typescript/__fixtures__/entity.aggregate.txt', backendGenerators.entity(['sales','Order'],{aggregate:'true'})[0].content)"
```

### Step T2.2 — Run the golden test — confirm it passes against CURRENT code

Run: `bun test scripts/cli/backend/typescript/templates.golden.test.ts`
Expected: PASS — fixtures were captured from the current generator, so they match. This locks the baseline before the body moves.

### Step T2.3 — Add the `snippet` block to the entity registry

Modify `.claude/skills/entity/typescript/registry.yaml`. Rename the existing
top-level `canonical_snippet: |` key to `snippet:` with the rich block under
`exemplar:`, and add the executable `skeleton`. The skeleton is the current
`backendTemplates.entity` body with `${pascal}` → `{{Name}}` and `${baseClass}`
→ `{{base}}`:

```yaml
snippet:
  skeleton: |
    import { {{base}}, z } from '@template/core-typescript'
    import Z from 'zod'
    import { DomainErrors } from '../errors'

    export const {{Name}}Schema = z.object({
    	// Define entity properties
    	name: z.string().min(1, { error: 'TODO_NAME_REQUIRED' as DomainErrors }),
    	// Use ids for entity relation:
    	// ownerId: z.instance(Id),
    })

    export type {{Name}}Props = Z.infer<typeof {{Name}}Schema>

    export class {{Name}} extends {{base}}<typeof {{Name}}Schema> {
    	static override schema = {{Name}}Schema

    	static create(data: { name: string }): {{Name}} {
    		return new {{Name}}({
    			name: data.name.trim(),
    		})
    	}

    	// Mutation methods:
    	// updateName(name: string): void {
    	// 	this.name = name; this.validate()
    	// }
    }

    // Declaration merging — interface BELOW class
    export interface {{Name}} extends {{Name}}Props {}
  exemplar: |
    <paste the exact content that was under the old `canonical_snippet:` key here, unchanged>
```

> The body inside `skeleton: |` uses **tabs** for indentation (the template emits
> tabs). Preserve them exactly — golden equivalence depends on it. The trailing
> newline after the final `}` is produced by the YAML block scalar `|` (single
> trailing newline), matching the template literal's closing newline.

### Step T2.4 — Add the entity binding

Create `scripts/cli/backend/typescript/bindings.ts`:

```typescript
// Per-artifact binding computation: the *logic* half of the former templates.ts.
// Each entry maps (contextName, name, opts) to the placeholder/variant map the
// renderer interpolates into that artifact's registry snippet.
import { toPascalCase } from '../helpers'
import type { Bindings } from '../../snippet/types'

export const backendBindings = {
  entity: (_ctx: string, name: string, opts: { aggregate?: boolean }): Bindings => ({
    Name: toPascalCase(name),
    base: opts.aggregate ? 'AggregateRoot' : 'BaseEntity',
  }),
}
```

### Step T2.5 — Dissolve the `entity` template into a render delegation

Modify `scripts/cli/backend/typescript/templates.ts`:

```diff
+ import { renderArtifact } from '../../snippet/render'
+ import { backendBindings } from './bindings'
```

Replace the entire `entity: (...) => { ... }` body (the inline template literal)
with a one-line delegation:

```typescript
	entity: (_contextName: string, name: string, opts: { aggregate?: boolean }) =>
		renderArtifact('entity', 'typescript', backendBindings.entity(_contextName, name, opts)),
```

`index.ts` is untouched — it still calls `backendTemplates.entity(ctx, name, { aggregate })`.

### Step T2.6 — Run the golden test — confirm it STILL passes after the body moved

Run: `bun test scripts/cli/backend/typescript/templates.golden.test.ts`
Expected: PASS — both entity cases still byte-match. (If a whitespace/newline diff appears, fix the YAML block scalar indentation/trailing newline until green.)

### Step T2.7 — Trim the entity SKILL.md to prose + pointer

Modify `.claude/skills/entity/typescript/SKILL.md`: remove the full
copy-of-the-file fenced code block(s) that duplicate the artifact body and
replace with a one-line pointer:

```markdown
> Canonical shape: see `snippet.skeleton` (and `snippet.exemplar`) in this skill's `registry.yaml` — the single source the CLI renders and `/review` checks against.
```

Keep all prose, bad-practice explanations, and partial illustrative snippets that
teach a *rule* (not the whole-file shape).

### Step T2.8 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T2.9 — Commit

```bash
git add scripts/cli/snippet/render.ts scripts/cli/backend/typescript/bindings.ts \
        scripts/cli/backend/typescript/templates.ts \
        scripts/cli/backend/typescript/templates.golden.test.ts \
        scripts/cli/backend/typescript/__fixtures__/entity.txt \
        scripts/cli/backend/typescript/__fixtures__/entity.aggregate.txt \
        .claude/skills/entity/typescript/registry.yaml \
        .claude/skills/entity/typescript/SKILL.md
git commit -m "refactor(cli): entity renders from registry snippet, golden-equivalent (Task 2)"
```

---

## Task T3: value-object, usecase, and controller render from the registry (pilot complete)

**Files to write:**
- Modify: `.claude/skills/value-object/typescript/registry.yaml` — add `snippet:` (two variant skeletons); migrate `canonical_snippet` → `snippet.exemplar`
- Modify: `.claude/skills/usecase/typescript/registry.yaml` — add `snippet:`; migrate exemplar
- Modify: `.claude/skills/controller/typescript/registry.yaml` — add `snippet:` (6 verb skeletons + classBody fragments); migrate exemplar
- Modify: `scripts/cli/backend/typescript/bindings.ts` — add `valueObject`, `usecase`, `controller` bindings
- Modify: `scripts/cli/backend/typescript/templates.ts` — dissolve those three entries to render delegations
- Modify: `.claude/skills/{value-object,usecase,controller}/typescript/SKILL.md` — trim to prose + pointer
- Modify: `scripts/cli/backend/typescript/templates.golden.test.ts` — add golden cases for the three (incl. controller verb + mock variants)
- Create: `scripts/cli/backend/typescript/__fixtures__/{value-object,value-object.primitive,usecase,controller.create,controller.list,controller.get,controller.update,controller.delete,controller.default,controller.create.mock}.txt`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none — tooling)
**Depends on:** T2

Same transformation as Task 2 (`${x}` → `{{x}}`, branch-per-string → named
skeleton / fragment), now over the three remaining pilot artifacts. The controller
proves the variant-heavy case end-to-end.

### Step T3.1 — Capture golden fixtures for all pilot variants, then extend the golden test (still against current code)

Add cases to `scripts/cli/backend/typescript/templates.golden.test.ts`:

```typescript
  it('value-object (object) is unchanged', () => {
    const [file] = backendGenerators['value-object'](['sales', 'Address'], {})
    expect(file.content).toBe(golden('value-object.txt'))
  })
  it('value-object --primitive is unchanged', () => {
    const [file] = backendGenerators['value-object'](['sales', 'Sku'], { primitive: 'true' })
    expect(file.content).toBe(golden('value-object.primitive.txt'))
  })
  it('usecase is unchanged', () => {
    const [file] = backendGenerators.usecase(['sales', 'CreateOrder'], {})
    expect(file.content).toBe(golden('usecase.txt'))
  })
  for (const [name, fixture] of [
    ['CreateOrder', 'controller.create.txt'],
    ['ListOrders', 'controller.list.txt'],
    ['GetOrder', 'controller.get.txt'],
    ['UpdateOrder', 'controller.update.txt'],
    ['DeleteOrder', 'controller.delete.txt'],
    ['ArchiveOrder', 'controller.default.txt'],
  ] as const) {
    it(`controller ${name} is unchanged`, () => {
      const [file] = backendGenerators.controller(['sales', name], {})
      expect(file.content).toBe(golden(fixture))
    })
  }
  it('controller --mock is unchanged', () => {
    const [file] = backendGenerators.controller(['sales', 'CreateOrder'], { mock: 'true' })
    expect(file.content).toBe(golden('controller.create.mock.txt'))
  })
```

Capture each fixture from current code (mirror the Task 2 one-off `bun -e` pattern,
writing each generator's `[0].content` to the matching `__fixtures__/*.txt`).

### Step T3.2 — Run the golden test — confirm green against current code

Run: `bun test scripts/cli/backend/typescript/templates.golden.test.ts`
Expected: PASS — baseline locked for all pilot variants.

### Step T3.3 — Add the value-object snippet (two whole-body variants)

Modify `.claude/skills/value-object/typescript/registry.yaml` — add `snippet:`
with a default `object` skeleton and a `primitive` variant, externalized from the
current `backendTemplates.valueObject` branches (`${pascal}` → `{{Name}}`; the
primitive error const → `{{NAME_ERR}}`):

```yaml
snippet:
  skeleton: |
    import { BaseValueObject, z } from '@template/core-typescript'
    import Z from 'zod'
    import { DomainErrors } from '../errors'

    export const {{Name}}Schema = z.object({
    	// Define value object properties
    })

    export class {{Name}} extends BaseValueObject<typeof {{Name}}Schema> {
    	static override schema = {{Name}}Schema

    	equals(other: {{Name}}): boolean {
    		return JSON.stringify(this.toJSON()) === JSON.stringify(other.toJSON())
    	}

    	override toString(): string {
    		return JSON.stringify(this.toJSON())
    	}
    }

    export interface {{Name}} extends Z.infer<typeof {{Name}}Schema> {}
    export type {{Name}}Props = Z.input<typeof {{Name}}Schema>
  skeletons:
    primitive: |
      import { BasePrimitiveValueObject, z } from '@template/core-typescript'
      import { DomainErrors } from '../errors'

      export const {{Name}}Schema = z
      	.string()
      	.min(1, { error: '{{NAME_ERR}}' as DomainErrors })
      	.transform(v => v.trim())

      export class {{Name}} extends BasePrimitiveValueObject<typeof {{Name}}Schema> {
      	static override schema = {{Name}}Schema

      	equals(other: {{Name}}): boolean {
      		return this.value === other.value
      	}

      	override toString(): string {
      		return this.value
      	}
      }
  exemplar: |
    <paste the exact content from the old `canonical_snippet:` key, unchanged>
```

### Step T3.4 — Add the usecase snippet

Modify `.claude/skills/usecase/typescript/registry.yaml` — add `snippet:` from the
current `backendTemplates.usecase` body (`${pascal}` → `{{Name}}`,
`${verbEntity}` → `{{verbEntity}}`):

```yaml
snippet:
  skeleton: |
    import { injectable } from 'tsyringe-neo'
    import { Handler, z } from '@template/core-typescript'
    import type { Transaction } from '@template/core-typescript'

    export const {{Name}}InputSchema = z.object({
    	// Define input schema
    })

    export const {{Name}}OutputSchema = z.object({
    	// Define output schema
    })

    @injectable()
    export class {{Name}} extends Handler<typeof {{Name}}InputSchema, typeof {{Name}}OutputSchema> {
    	readonly name = '{{verbEntity}}' as const
    	readonly inputSchema = {{Name}}InputSchema
    	readonly outputSchema = {{Name}}OutputSchema

    	// constructor(private repo: SomeRepository) {
    	// 	super()
    	// }

    	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
    		return this.withTransaction(tx, async (tx) => {
    			// Implement business logic
    			return {} as this['output']
    		})
    	}
    }
  exemplar: |
    <paste the exact content from the old `canonical_snippet:` key, unchanged>
```

### Step T3.5 — Add the controller snippet (6 verb skeletons + classBody fragments)

Modify `.claude/skills/controller/typescript/registry.yaml`. The current controller
template builds a single file from per-verb `inputSchema`/`outputSchema`/`destructuring`
strings plus a mock-or-handle class body. Externalize as: one whole-file skeleton
per verb (variant) carrying `{{Name}}`, `{{path}}`, `{{method}}`, and a `{{classBody}}`
placeholder; two shared `fragments` for the class body. Each skeleton's input/output
schema is the verb's exact current string.

```yaml
snippet:
  # default = the catch-all branch (no recognized verb prefix)
  skeleton: |
    import { injectable } from 'tsyringe-neo'
    import { Controller, HttpStatusCode, z } from '@template/core-typescript'

    export const {{Name}}InputSchema = z.object({
    	ctx: z.object({ user: z.object({ id: z.string() }) }),
    }).example([{}])

    export const {{Name}}OutputSchema = z.void()

    @injectable()
    export class {{Name}}Controller extends Controller<typeof {{Name}}InputSchema, typeof {{Name}}OutputSchema> {
    	readonly path = '{{path}}'
    	readonly method = '{{method}}'
    	readonly description = '{{Name}} operation'
    	readonly inputSchema = {{Name}}InputSchema
    	readonly outputSchema = {{Name}}OutputSchema

    {{classBody}}
    }
  skeletons:
    list: |
      <whole-file body as in `skeleton`, but InputSchema = the `isList` inputSchema string and OutputSchema = the `isList` outputSchema string from templates.ts, {{classBody}} preserved>
    get: |
      <same shell with the `isGet` input/output schema strings>
    create: |
      <same shell with the `isCreate` input/output schema strings>
    update: |
      <same shell with the `isUpdate` input/output schema strings (output = z.void())>
    delete: |
      <same shell with the `isDelete` input/output schema strings (output = z.void())>
  fragments:
    handle: |
      	async handle(request: this['input']): Promise<this['output']> {
      		{{destructuring}}

      		// TODO: Delegate to use case
      		return {
      			status: HttpStatusCode.OK,
      			data: {} as any,
      		}
      	}
    mock: |
      	override mockController = true
  exemplar: |
    <paste the exact content from the old `canonical_snippet:` key, unchanged>
```

> Fill each `<…>` placeholder by copying the verb's verbatim `inputSchema` /
> `outputSchema` strings from the current `backendTemplates.controller` (the
> `isList` / `isGet` / `isCreate` / `isUpdate` / `isDelete` branches) into the
> shell. The `default` branch is the top-level `skeleton`. Golden tests (Step 2)
> verify each is exact.

### Step T3.6 — Add the three bindings

Modify `scripts/cli/backend/typescript/bindings.ts` — add entries beside `entity`:

```typescript
import { inferHttpMethod, inferPath, toPascalCase, toVerbEntityFormat } from '../helpers'

// add to backendBindings:
  valueObject: (_ctx: string, name: string, opts: { primitive?: boolean }): Bindings =>
    opts.primitive
      ? { _variant: 'primitive', Name: toPascalCase(name), NAME_ERR: `INVALID_${name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}` }
      : { Name: toPascalCase(name) },

  usecase: (_ctx: string, name: string): Bindings => ({
    Name: toPascalCase(name),
    verbEntity: toVerbEntityFormat(name),
  }),

  controller: (ctx: string, name: string, opts: { isInternal?: boolean; method?: string; path?: string; mock?: boolean }): Bindings => {
    const lower = name.toLowerCase()
    const verb =
      lower.startsWith('list') || lower.startsWith('fetch') ? 'list'
      : lower.startsWith('get') ? 'get'
      : lower.startsWith('create') ? 'create'
      : lower.startsWith('update') ? 'update'
      : lower.startsWith('delete') || lower.startsWith('remove') ? 'delete'
      : undefined // default → top-level skeleton
    const destructuring =
      verb === 'list' ? 'const { query } = request'
      : verb === 'get' || verb === 'delete' ? 'const { params } = request'
      : verb === 'create' ? 'const { body } = request'
      : verb === 'update' ? 'const { params, body } = request'
      : 'const {} = request'
    // literal bindings BEFORE the fragment-ref so the fragment can read {{destructuring}}
    return {
      ...(verb ? { _variant: verb } : {}),
      Name: toPascalCase(name),
      path: opts.path || inferPath(name, ctx, opts.isInternal ?? false),
      method: opts.method || inferHttpMethod(name),
      destructuring,
      classBody: { fragment: opts.mock ? 'mock' : 'handle' },
    }
  },
```

> `toVerbEntityFormat` and the VO error-const regex are copied verbatim from the
> current template logic, so output is identical. `path`/`method` reuse the same
> `inferPath`/`inferHttpMethod` helpers the template used (the `validateHttpMethod`/
> `validatePath` of explicit flags already happened in `index.ts` before this).

### Step T3.7 — Dissolve the three template entries

Modify `scripts/cli/backend/typescript/templates.ts` — replace each inline body
with a delegation (signatures unchanged so `index.ts` keeps calling them):

```typescript
	valueObject: (_contextName: string, name: string, opts: { primitive?: boolean }) =>
		renderArtifact('value-object', 'typescript', backendBindings.valueObject(_contextName, name, opts)),

	usecase: (_contextName: string, name: string) =>
		renderArtifact('usecase', 'typescript', backendBindings.usecase(_contextName, name)),

	controller: (contextName: string, name: string, opts: { isInternal?: boolean; method?: string; path?: string; mock?: boolean }) =>
		renderArtifact('controller', 'typescript', backendBindings.controller(contextName, name, opts)),
```

### Step T3.8 — Run the golden test — confirm STILL green after bodies moved

Run: `bun test scripts/cli/backend/typescript/templates.golden.test.ts`
Expected: PASS — all entity + VO + usecase + 6 controller verb + mock cases byte-match.

### Step T3.9 — Trim the three SKILL.md files

Modify `.claude/skills/value-object/typescript/SKILL.md`,
`.claude/skills/usecase/typescript/SKILL.md`,
`.claude/skills/controller/typescript/SKILL.md` — same trim as Task 2 Step 7
(drop the whole-file code block, add the `registry.yaml` snippet pointer).

### Step T3.10 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T3.11 — Commit

```bash
git add scripts/cli/backend/typescript/bindings.ts scripts/cli/backend/typescript/templates.ts \
        scripts/cli/backend/typescript/templates.golden.test.ts \
        scripts/cli/backend/typescript/__fixtures__/ \
        .claude/skills/value-object/typescript/ .claude/skills/usecase/typescript/ .claude/skills/controller/typescript/
git commit -m "refactor(cli): value-object/usecase/controller render from registry snippets (Task 3)"
```

---

## Task T4: `/plan` and `/review` read the rich form from `snippet.exemplar`

**Files to write:**
- Modify: `scripts/graph/core/review-query.ts` — read `snippet.exemplar` with `canonical_snippet` fallback
- Test: `scripts/graph/tests/review-query.snippet.test.ts` (create)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** (none — tooling)
**Depends on:** (none — fallback keeps it safe before/after migration)

`review-query.ts:134` currently maps `root.canonical_snippet → canonicalSnippet`.
After migration the rich form lives at `snippet.exemplar`. Repoint with a fallback
so it works whether a skill is migrated or not.

### Step T4.1 — Write the failing test

Create `scripts/graph/tests/review-query.snippet.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { pickCanonicalSnippet } from '../core/review-query'

describe('pickCanonicalSnippet', () => {
  it('prefers snippet.exemplar when present', () => {
    expect(pickCanonicalSnippet({ snippet: { skeleton: 's', exemplar: 'RICH' }, canonical_snippet: 'OLD' }))
      .toBe('RICH')
  })
  it('falls back to legacy canonical_snippet when no snippet.exemplar', () => {
    expect(pickCanonicalSnippet({ canonical_snippet: 'OLD' })).toBe('OLD')
  })
  it('returns undefined when neither is present', () => {
    expect(pickCanonicalSnippet({ snippet: { skeleton: 's' } })).toBeUndefined()
  })
})
```

### Step T4.2 — Run test to verify it fails

Run: `bun test scripts/graph/tests/review-query.snippet.test.ts`
Expected: FAIL with `pickCanonicalSnippet is not a function` (not yet exported).

### Step T4.3 — Extract + repoint the snippet pick

Modify `scripts/graph/core/review-query.ts`. Add an exported helper and use it at
the line that currently reads `root.canonical_snippet`:

```typescript
export function pickCanonicalSnippet(root: Record<string, unknown>): string | undefined {
  const snippet = root.snippet as { exemplar?: unknown } | undefined
  if (snippet && typeof snippet.exemplar === 'string') return snippet.exemplar
  if (typeof root.canonical_snippet === 'string') return root.canonical_snippet
  return undefined
}
```

Replace the inline spread (currently `...(typeof root.canonical_snippet === 'string' ? { canonicalSnippet: root.canonical_snippet } : {})`) with:

```typescript
			...((s => (s !== undefined ? { canonicalSnippet: s } : {}))(pickCanonicalSnippet(root))),
```

### Step T4.4 — Run test to verify it passes

Run: `bun test scripts/graph/tests/review-query.snippet.test.ts`
Expected: PASS — all three cases green.

### Step T4.5 — Regression-check the graph review-query suite

Run: `bun test scripts/graph/tests/`
Expected: PASS — existing graph tests unaffected.

### Step T4.6 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T4.7 — Commit

```bash
git add scripts/graph/core/review-query.ts scripts/graph/tests/review-query.snippet.test.ts
git commit -m "feat(graph): review-query reads snippet.exemplar with canonical_snippet fallback (Task 4)"
```

---

## Task T5: The remaining backend artifacts render from the registry; templates.ts holds no bodies

**Files to write:**
- Modify: `.claude/skills/<each remaining skill>/typescript/registry.yaml` — add `snippet:`; migrate `canonical_snippet` → `snippet.exemplar` where present
- Modify: `scripts/cli/backend/typescript/bindings.ts` — add the remaining bindings
- Modify: `scripts/cli/backend/typescript/templates.ts` — dissolve the remaining entries; file now holds only delegations
- Modify: `.claude/skills/<each remaining skill>/typescript/SKILL.md` — trim to prose + pointer
- Modify: `scripts/cli/backend/typescript/templates.golden.test.ts` — add golden cases for each remaining generator
- Create: `scripts/cli/backend/typescript/__fixtures__/*.txt` — one per remaining generator output

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none — tooling)
**Depends on:** T3

The remaining `backendTemplates` entries (each a single template literal in
`templates.ts`): `internalHandler`, `externalHandler`, `service`, `domainEvent`,
`integrationEvent`, `middleware`, `enum`, `repositoryAbstract`, `repositoryDrizzle`,
`schema`, `errors`, `projection`, `projectionRepository`, `projector`, `query`.
The transformation is now proven and mechanical; apply it per artifact.

> Skill-name mapping (artifact → `.claude/skills/<skill>`): `internalHandler`/
> `externalHandler` → `handler`; `domainEvent`/`integrationEvent` → `event`;
> `repositoryAbstract`/`repositoryDrizzle` → `repository`; `projection`/
> `projectionRepository` → `projection`; `projector` → `projector`; otherwise the
> name maps to its own skill. When one skill backs two template entries (e.g.
> `handler`), use named `skeletons` (`internal`, `external`) selected by a binding
> `_variant`, exactly like value-object.

> **Type correction (repository + projection — NOT pure byte-equivalence).** While
> externalizing these two, apply the established repository convention to the
> *Drizzle implementations* (this is the one intentional content change in T5):
> - **Drizzle impls** (`Drizzle<X>Repository`, `Drizzle<X>ProjectionRepository`):
>   method `tx?: Transaction` → `tx?: DrizzleClient`. Because `tx` is then already
>   `DrizzleClient`, drop the internal `(tx ?? this.db) as DrizzleClient` cast —
>   just `const dbClient = tx ?? this.db`. Remove the now-unused
>   `import type { Transaction }` from the Drizzle repository file.
> - **`id` is always `string`** (not `Id | string`) in **both** the abstract
>   repository port and the Drizzle impl: `findById(id: string, …)`. Drop the
>   `const idValue = typeof id === 'string' ? id : id.value` branch (use `id`
>   directly) and the now-unused `import { Id }`.
> - **Unchanged:** the abstract ports and the Mock projection repository keep
>   `tx?: Transaction` (they are infra-agnostic, not "drizzle repositories").
>   `Transaction` is `unknown`, so the port(`Transaction`)/impl(`DrizzleClient`)
>   override compiles (method-param bivariance).
>
> Consequence: for `repository` and `projection`, capture the golden fixtures from
> the **corrected** renderer output (not the pre-migration template), and confirm
> the diff vs the old output is *only* the tx/id type changes above. All other 13
> artifacts remain pure byte-equivalence.

For each artifact, repeat the proven cycle:

### Step T5.1 — Capture golden fixture from current code + add a golden test case

For each generator, capture its current output to
`__fixtures__/<artifact>[.<variant>].txt` (the `bun -e` one-off pattern from
Task 2) and add an `expect(content).toBe(golden(...))` case to
`templates.golden.test.ts`. For generators that emit two files (`repository`,
`projection`), assert both `[0].content` and `[1].content`.

### Step T5.2 — Run golden test — green against current code (baseline locked)

Run: `bun test scripts/cli/backend/typescript/templates.golden.test.ts`
Expected: PASS.

### Step T5.3 — Externalize each body to its registry `snippet` + add bindings

For each artifact: move the template literal body into the skill's
`registry.yaml` `snippet.skeleton` (or a named `skeletons.<variant>`),
`${x}` → `{{x}}`; migrate any existing `canonical_snippet` → `snippet.exemplar`;
add the binding to `backendBindings` (the `${...}` interpolations in the current
body are exactly the bindings to compute, reusing `helpers`).

### Step T5.4 — Dissolve each `templates.ts` entry to a `renderArtifact(...)` delegation

After this step `templates.ts` contains only the import lines + one delegation
per artifact — **no template-literal bodies remain**.

### Step T5.5 — Run golden test — STILL green after bodies moved

Run: `bun test scripts/cli/backend/typescript/templates.golden.test.ts`
Expected: PASS — every backend generator byte-matches its captured baseline.

### Step T5.6 — Trim each remaining SKILL.md to prose + pointer

Same trim as Task 2 Step 7 across the remaining migrated skills.

### Step T5.7 — Confirm no template bodies survive

Run: `grep -nE 'return \`|=> \`' scripts/cli/backend/typescript/templates.ts`
Expected: no matches (every entry is a `renderArtifact(...)` delegation).

### Step T5.8 — Type check + lint + full affected test run

Run: `bun tsc && bun lint && bun test scripts/cli/`
Expected: 0 errors; all golden + renderer tests pass.

### Step T5.9 — Commit

```bash
git add scripts/cli/backend/typescript/ .claude/skills/
git commit -m "refactor(cli): sweep remaining backend artifacts to registry snippets; templates.ts holds no bodies (Task 5)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `bun test scripts/cli/ scripts/graph/tests/` — renderer + golden + review-query tests pass
- [ ] `grep -nE 'return \`|=> \`' scripts/cli/backend/typescript/templates.ts` — no template-literal bodies remain (Decision 5 honored)
- [ ] AC mapping (every Phase A spec AC → ≥1 test / verification):
  - AC-A1 (`snippet:` block with imports/skeleton/exemplar; `canonical_snippet` migrated) → presence verified by golden render in `templates.golden.test.ts` (a skeleton must exist to render) + Task 2/3/5 registry edits
  - AC-A2 (renderer interpolates placeholders, unit-tested) → `scripts/cli/snippet/render.test.ts:"interpolate"/"renderSnippet"`
  - AC-A3 (`bun cli entity` renders from registry, type-checks) → `templates.golden.test.ts:"entity … is unchanged"` + `bun tsc`
  - AC-A4 (pilot 4 migrated, golden-equivalent) → `templates.golden.test.ts` entity/value-object/usecase/controller cases
  - AC-A5 (remaining ~18 migrated; `templates.ts` carries no bodies) → `templates.golden.test.ts` remaining cases + the `grep` guard
  - AC-A6 (`review-query.ts` reads `snippet.exemplar` w/ fallback) → `scripts/graph/tests/review-query.snippet.test.ts`
  - AC-A7 (each migrated `SKILL.md` drops the competing code block) → Task 2/3/5 SKILL.md trims (manual reviewer check; no test asserts prose)

## Notes

- **No new runtime deps.** `yaml` is already imported in `scripts/graph/core/review-query.ts`; the renderer reuses it.
- **No SDK regen / Contract Lock / migration** — this plan changes scaffolding tooling only; it creates no controllers-as-endpoints, schemas, or DB columns.
- **Whitespace is load-bearing.** Backend templates emit **tab** indentation; YAML block scalars (`|`) must preserve tabs and the single trailing newline. The golden tests are the guard — if one fails on a whitespace diff, fix the block-scalar indentation, don't relax the assertion.
- **Binding order matters for fragments.** In `controller` bindings, literal keys (`destructuring`) precede the fragment-ref (`classBody`) so the fragment can interpolate `{{destructuring}}` against already-resolved values (see `renderSnippet`'s accumulation note in Task 1).
- **`pickCanonicalSnippet` fallback is intentionally permanent-ish** — it lets a not-yet-migrated skill (or Go/Rust later) keep working; remove it only once every registry uses `snippet.exemplar`.
- **AC-A7 has no automated assertion** — the SKILL.md trim is a prose change verified by the spec-compliance reviewer, not a test. Flagged here so `/build`'s AC-coverage check doesn't expect a green test for it.
