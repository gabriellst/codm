# Canonical Artifact Snippets — Phase C (Frontend Fragments) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Behavior-preserving refactor —
> golden-file equivalence on the component assembler output is the safety net.

**Goal:** Each frontend `block`'s output chunks (imports / hooks / JSX / declarations) live in a YAML fragment that the renderer interpolates, so block bodies stop being hard-coded TS strings — while the assembler's zone-routing + import-dedupe stay in TS.

**Architecture:** A small frontend loader (`scripts/cli/frontend/blocks/fragments.ts`) reads `.claude/skills/component/react/registry.yaml → blocks.<name>` and interpolates each chunk via the Phase-A `interpolate`. Each `BlockFn` keeps its conditional logic (when to emit, which bindings to compute) but sources its output strings from the fragment via `renderBlock(name, 'react', bindings)`. The assembler in `artifacts/component.ts` is unchanged. Recipes already list block-name refs; Phase C makes the host body an explicit fragment too.

**Tech Stack:** TypeScript, Bun, `yaml`, `bun:test`. Builds on Phase A (`scripts/cli/snippet/render.ts` exports `interpolate`).

**Spec:** .specs/2026-05-27-canonical-artifact-snippets-design.md
**Tasks:** 3
**Estimated minutes:** 200

> **Scope (spec Decision 7/8/9):** Plan C of three; depends on Plan A (built);
> independent of Plan B. Targets the **react** component blocks (the `component/react`
> variant). Expo blocks (`scripts/cli/expo/blocks/`) are a deferred follow-up — same
> fragment model, applied after react proves out (mirrors the Go/Rust deferral in A).
> No entities/controllers/migrations → no Contract Lock/SDK; D-checks N/A.

---

## Task T1: A react block sources its output from a YAML fragment

**Files to write:**
- Create: `scripts/cli/frontend/blocks/fragments.ts`
- Create: `scripts/cli/frontend/blocks/fragments.test.ts`
- Modify: `.claude/skills/component/react/registry.yaml` — add a `blocks:` map with the `element`, `skeleton`, `query` chunk fragments
- Modify: `scripts/cli/frontend/blocks/element.ts` — source output from the fragment
- Modify: `scripts/cli/frontend/blocks/skeleton.ts` — source output from the fragment
- Modify: `scripts/cli/frontend/blocks/query.ts` — source output from the fragment (keep the `ctx.sdk` guard + hookName computation)

**Files to read:**
- `scripts/cli/snippet/render.ts`
- `scripts/cli/frontend/blocks/types.ts`
- `scripts/cli/frontend/artifacts/component.ts`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /component
**Depends on:** (none)

Prove the fragment model on three representative blocks: `element` (static imports
only), `skeleton` (imports + `jsxBefore`), `query` (conditional imports + hookCalls
with a computed `{{hookName}}`). The block fns keep their TS logic; only the output
strings move to the registry.

### Step T1.1 — Write the failing test

Create `scripts/cli/frontend/blocks/fragments.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { renderBlock } from './fragments'
import { elementBlock } from './element'
import { skeletonBlock } from './skeleton'
import { queryBlock } from './query'

const ctx = (over: Partial<Parameters<typeof queryBlock>[0]> = {}) => ({
  pascal: 'Order', camel: 'order', kebab: 'order', routePath: '(app)/orders', ...over,
})

describe('renderBlock (fragment-sourced output)', () => {
  it('element: static React + cn imports from the fragment', () => {
    expect(renderBlock('element', 'react', {}).imports).toEqual([
      "import * as React from 'react'",
      "import { cn } from '@/lib/utils'",
    ])
  })

  it('skeleton: imports + a data===undefined jsxBefore guard', () => {
    const out = renderBlock('skeleton', 'react', {})
    expect(out.imports).toEqual(["import { Skeleton } from '@/components/ui/skeleton'"])
    expect(out.jsxBefore).toContain('if (data === undefined)')
    expect(out.jsxBefore).toContain('<Skeleton className="h-8 w-full" />')
  })

  it('query: interpolates the computed hookName', () => {
    const out = renderBlock('query', 'react', { hookName: 'useListOrders' })
    expect(out.imports).toEqual(["import { useListOrders } from '@template/client-typescript/typescript'"])
    expect(out.hookCalls).toEqual(['const { data, isLoading } = useListOrders()'])
  })
})

describe('block fns still produce identical output via the fragment', () => {
  it('elementBlock unchanged', () => {
    expect(elementBlock(ctx())).toEqual({
      imports: ["import * as React from 'react'", "import { cn } from '@/lib/utils'"],
    })
  })
  it('queryBlock returns {} without sdk, wires the hook with sdk', () => {
    expect(queryBlock(ctx())).toEqual({})
    const out = queryBlock(ctx({ sdk: 'Order' }))
    expect(out.hookCalls).toEqual(['const { data, isLoading } = useListOrders()'])
  })
  it('skeletonBlock unchanged', () => {
    expect(skeletonBlock(ctx()).jsxBefore).toContain('if (data === undefined)')
  })
})
```

### Step T1.2 — Run test to verify it fails

Run: `bun test scripts/cli/frontend/blocks/fragments.test.ts`
Expected: FAIL with `Cannot find module './fragments'`.

### Step T1.3 — Add the `blocks` fragments to the component registry

Modify `.claude/skills/component/react/registry.yaml` — under the top-level
`registry:` key, add a `blocks:` map. Bodies are the EXACT current block outputs
with `${...}` → `{{...}}` (only `query` has a placeholder, `{{hookName}}`):

```yaml
  blocks:
    element:
      imports:
        - "import * as React from 'react'"
        - "import { cn } from '@/lib/utils'"
    skeleton:
      imports:
        - "import { Skeleton } from '@/components/ui/skeleton'"
      jsxBefore: |
        	if (data === undefined) {
        		return (
        			<div className="flex flex-col gap-2">
        				<Skeleton className="h-8 w-full" />
        				<Skeleton className="h-32 w-full" />
        			</div>
        		)
        	}
    query:
      imports:
        - "import { {{hookName}} } from '@template/client-typescript/typescript'"
      hookCalls:
        - "const { data, isLoading } = {{hookName}}()"
```

> Tabs in `jsxBefore` are load-bearing (the block emits tab indentation). The `|`
> block scalar preserves them; the golden test (Step T1.6) is the guard.

### Step T1.4 — Write the fragment loader

Create `scripts/cli/frontend/blocks/fragments.ts`:

```typescript
// Loads a component block's output chunks from the registry and interpolates each
// via the Phase-A renderer. Block fns keep their conditional logic; only the output
// strings live in YAML. The assembler (artifacts/component.ts) is unchanged.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { interpolate } from '../../snippet/render'
import type { BlockOutput } from './types'

const ROOT = process.cwd()

type FragmentChunks = {
  imports?: string[]
  hookCalls?: string[]
  jsxBefore?: string
  jsxBody?: string
  declarations?: string[]
  exports?: string[]
  i18nSlots?: string[]
}

const cache = new Map<string, Record<string, FragmentChunks>>()

function loadBlocks(lang: string): Record<string, FragmentChunks> {
  const hit = cache.get(lang)
  if (hit) return hit
  const path = join(ROOT, '.claude/skills/component', lang, 'registry.yaml')
  const doc = parseYaml(readFileSync(path, 'utf8')) as Record<string, unknown>
  const root = (doc.registry && typeof doc.registry === 'object' ? doc.registry : doc) as Record<string, unknown>
  const blocks = (root.blocks ?? {}) as Record<string, FragmentChunks>
  cache.set(lang, blocks)
  return blocks
}

/** Render a block's BlockOutput from its registry fragment, interpolating bindings.
 *  Returns {} when the block has no fragment (caller decides fallback). */
export function renderBlock(blockName: string, lang: string, bindings: Record<string, string>): BlockOutput {
  const chunks = loadBlocks(lang)[blockName]
  if (!chunks) return {}
  const one = (s: string) => interpolate(s, bindings)
  const many = (xs?: string[]) => xs?.map(one)
  return {
    ...(chunks.imports ? { imports: many(chunks.imports) } : {}),
    ...(chunks.hookCalls ? { hookCalls: many(chunks.hookCalls) } : {}),
    ...(chunks.jsxBefore ? { jsxBefore: one(chunks.jsxBefore) } : {}),
    ...(chunks.jsxBody ? { jsxBody: one(chunks.jsxBody) } : {}),
    ...(chunks.declarations ? { declarations: many(chunks.declarations) } : {}),
    ...(chunks.exports ? { exports: many(chunks.exports) } : {}),
    ...(chunks.i18nSlots ? { i18nSlots: chunks.i18nSlots } : {}), // literal key tails — not interpolated
  }
}
```

### Step T1.5 — Point the three block fns at the fragment

Modify `scripts/cli/frontend/blocks/element.ts` — replace the inline return with:

```typescript
import type { BlockFn } from './types'
import { renderBlock } from './fragments'

// Map HTML tags to their TypeScript HTMLElement interfaces (used by the assembler).
export const ELEMENT_INTERFACES: Record<string, string> = {
	section: 'HTMLElement',
	div: 'HTMLDivElement',
	article: 'HTMLElement',
	aside: 'HTMLElement',
	button: 'HTMLButtonElement',
	a: 'HTMLAnchorElement',
}

export const elementBlock: BlockFn = () => renderBlock('element', 'react', {})
```

Modify `scripts/cli/frontend/blocks/skeleton.ts`:

```typescript
import type { BlockFn } from './types'
import { renderBlock } from './fragments'

export const skeletonBlock: BlockFn = () => renderBlock('skeleton', 'react', {})
```

Modify `scripts/cli/frontend/blocks/query.ts` — keep the guard + hookName logic, source the strings from the fragment:

```typescript
import type { BlockFn } from './types'
import { renderBlock } from './fragments'

export const queryBlock: BlockFn = ctx => {
	if (!ctx.sdk) return {}
	const plural = ctx.sdk.endsWith('s') ? ctx.sdk : `${ctx.sdk}s`
	return renderBlock('query', 'react', { hookName: `useList${plural}` })
}
```

### Step T1.6 — Golden equivalence: the assembled component is unchanged

Create the assembler golden test inline in `fragments.test.ts` (append):

```typescript
import { componentGenerator } from '../artifacts/component'

describe('assembler golden equivalence (pilot blocks)', () => {
  it('a query+skeleton section component is byte-identical to the captured baseline', async () => {
    const [file] = await componentGenerator(
      ['(app)/orders', 'OrderList'],
      { recipe: 'section', sdk: 'Order', state: 'query', skeleton: 'true', 'no-i18n-write': 'true', i18n: 'orders' },
    )
    // Captured from the pre-migration assembler (Step: run once, commit fixture).
    const { readFileSync } = await import('node:fs')
    const golden = readFileSync(new URL('./__fixtures__/order-list.tsx.txt', import.meta.url), 'utf8')
    expect(file!.content).toBe(golden)
  })
})
```

Capture the fixture from the CURRENT assembler BEFORE Step T1.5's edits land (run
once, commit):

```bash
mkdir -p scripts/cli/frontend/blocks/__fixtures__
bun -e "import {componentGenerator} from './scripts/cli/frontend/artifacts/component.ts'; const [f]=await componentGenerator(['(app)/orders','OrderList'],{recipe:'section',sdk:'Order',state:'query',skeleton:'true','no-i18n-write':'true',i18n:'orders'}); await Bun.write('scripts/cli/frontend/blocks/__fixtures__/order-list.tsx.txt', f.content)"
```

> Run this capture FIRST (against current code), confirm the golden test passes,
> THEN apply Steps T1.3–T1.5 and confirm it STILL passes. If a whitespace diff
> appears, fix the YAML block scalar — never relax the assertion.

### Step T1.7 — Run tests to verify they pass

Run: `bun test scripts/cli/frontend/blocks/fragments.test.ts`
Expected: PASS — renderBlock unit cases, block-fn parity, and assembler golden equivalence all green.

### Step T1.8 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T1.9 — Commit

```bash
git add scripts/cli/frontend/blocks/fragments.ts scripts/cli/frontend/blocks/fragments.test.ts \
        scripts/cli/frontend/blocks/__fixtures__/ \
        scripts/cli/frontend/blocks/element.ts scripts/cli/frontend/blocks/skeleton.ts scripts/cli/frontend/blocks/query.ts \
        .claude/skills/component/react/registry.yaml
git commit -m "feat(cli): react blocks source output from registry fragments — pilot (Task T1)"
```

---

## Task T2: The remaining react blocks source their output from fragments

**Files to write:**
- Modify: `.claude/skills/component/react/registry.yaml` — add `blocks` fragments for `sdk`, `variants`, `store`, `search`, `labels`, `consts`, `i18n`
- Modify: `scripts/cli/frontend/blocks/{sdk,variants,store,search,labels,consts,i18n}.ts` — source output from fragments (keep each block's conditional logic + computed bindings)
- Modify: `scripts/cli/frontend/blocks/fragments.test.ts` — add golden assembler cases covering the swept blocks (variants, store, search, labels, consts)

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /component
**Depends on:** T1

Apply the proven pattern to the remaining 7 react blocks. Each block keeps its TS
logic (guards, computed bindings); the output strings move to `blocks.<name>` in the
registry and render via `renderBlock(name, 'react', bindings)`.

### Step T2.1 — Capture golden fixtures for the swept-block combinations

For combinations exercising each remaining block, capture the current assembler
output to `__fixtures__/*.tsx.txt` (the `bun -e` pattern from T1.6) and add a golden
case per fixture to `fragments.test.ts`. Cover at least: `--variants`, `--state=store
--store=Foo`, `--state=search`, `--labels --sdk=X`, `--consts=...`. Confirm GREEN
against current code (baseline locked).

### Step T2.2 — Externalize each block + point its fn at the fragment

For each of `sdk`, `variants`, `store`, `search`, `labels`, `consts`, `i18n`: move
its output chunk strings into `blocks.<name>` (with `{{placeholders}}` for any
`${...}` interpolations — e.g. `{{pascal}}`, `{{camel}}`, `{{storeName}}`, `{{sdk}}`),
and rewrite the block fn to compute its bindings then `return renderBlock(name,
'react', bindings)` (preserving any `if (!flag) return {}` guard). Any literal JSX
double-brace must keep its spaces (`{{ x }}`) so the `{{word}}` interpolator does not
match it.

### Step T2.3 — Golden equivalence holds after the sweep

Run: `bun test scripts/cli/frontend/blocks/fragments.test.ts`
Expected: PASS — every captured combination byte-identical before and after.

### Step T2.4 — Confirm no block fn carries an inline body string

Run: `grep -nE "imports: \[\`|jsxBefore: \`|hookCalls: \[\`" scripts/cli/frontend/blocks/*.ts`
Expected: no matches (every block fn delegates to `renderBlock`; only `element.ts`'s `ELEMENT_INTERFACES` map remains as TS).

### Step T2.5 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T2.6 — Commit

```bash
git add scripts/cli/frontend/blocks/ .claude/skills/component/react/registry.yaml
git commit -m "refactor(cli): remaining react blocks source output from registry fragments (Task T2)"
```

---

## Task T3: A recipe is a list of fragment-refs + a host-body fragment

**Files to write:**
- Modify: `.claude/skills/component/react/registry.yaml` — add a `recipes:` map: each recipe = `{ blocks: [..fragment refs..], host: <body fragment> }`
- Modify: `scripts/cli/frontend/recipes/section.ts` — source `renderBody` from the recipe's host fragment
- Modify: `scripts/cli/frontend/recipes/index.ts` — load host bodies from the registry
- Modify: `scripts/cli/frontend/blocks/fragments.test.ts` — assert recipe fragment-refs + host body resolve

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /component
**Depends on:** T1

Recipes already list block-name refs (`blocks: string[]`). AC-C3 makes the recipe's
**host body** (the `renderBody` JSX) an explicit fragment too, so the recipe is fully
data: refs + host. Pilot on `section` (the recipe with a non-trivial `renderBody`);
the others (`plain`, `card`, `empty-state`) follow the same shape.

### Step T3.1 — Write the failing test

Append to `scripts/cli/frontend/blocks/fragments.test.ts`:

```typescript
import { loadRecipe } from '../recipes'

describe('recipe = fragment-refs + host body', () => {
  it('section lists its block refs and a host body fragment', () => {
    const r = loadRecipe('section', 'react')
    expect(r.blocks).toEqual(['element', 'skeleton'])
    expect(r.host).toContain("t('{{i18nPrefix}}.title')")
  })
})
```

### Step T3.2 — Add the `recipes` map to the registry

Modify `.claude/skills/component/react/registry.yaml` — under `registry:`, add:

```yaml
  recipes:
    section:
      blocks: [element, skeleton]
      defaultElement: section
      requiresI18n: false
      host: |
        			<header className="flex items-center justify-between">
        				<div>
        					<h2 className="text-xl font-semibold">{t('{{i18nPrefix}}.title')}</h2>
        					<p className="text-sm text-muted-foreground">{t('{{i18nPrefix}}.subtitle')}</p>
        				</div>
        			</header>
        			{/* Implement section */}
```

### Step T3.3 — Source the recipe host body from the registry

Modify `scripts/cli/frontend/recipes/index.ts` — add `loadRecipe(name, lang)` that
reads `blocks.recipes.<name>` (refs + host) from the registry. Modify
`scripts/cli/frontend/recipes/section.ts` so its `renderBody` interpolates the host
fragment via the Phase-A `interpolate` (filling `{{i18nPrefix}}`), preserving the
"no i18n prefix → just the `{/* Implement section */}` comment" branch.

### Step T3.4 — Golden equivalence: section component unchanged

Run: `bun test scripts/cli/frontend/blocks/fragments.test.ts`
Expected: PASS — the T1.6 section golden still matches (host body now sourced from the registry), plus the recipe-shape unit test.

### Step T3.5 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T3.6 — Commit

```bash
git add scripts/cli/frontend/recipes/ .claude/skills/component/react/registry.yaml scripts/cli/frontend/blocks/fragments.test.ts
git commit -m "feat(cli): express the section recipe as fragment-refs + host-body fragment (Task T3)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `bun test scripts/cli/frontend/blocks/fragments.test.ts` — loader + block-parity + assembler-golden + recipe tests pass
- [ ] `grep -nE "imports: \[\`|jsxBefore: \`" scripts/cli/frontend/blocks/*.ts` — no inline block body strings remain (element's interface map excepted)
- [ ] AC mapping:
  - AC-C1 (each react block externalizes body + imports to a fragment; block reads from it) → `fragments.test.ts:"renderBlock …"` + `"block fns still produce identical output"` (T1) and the sweep (T2)
  - AC-C2 (`bun cli component` output equivalent; assembler stays in TS) → `fragments.test.ts:"assembler golden equivalence"` (T1.6) + T2 golden cases
  - AC-C3 (recipe = fragment-refs + host-template ref) → `fragments.test.ts:"recipe = fragment-refs + host body"` (T3)

## Notes

- **`{{ }}` vs JSX:** the Phase-A `interpolate` matches only `{{word}}` (no spaces). Idiomatic JSX double-braces use spaces (`style={{ x }}`), so they don't collide. When externalizing a block whose JSX contains a tight `{{word}}`, add spaces (idiomatic anyway).
- **Expo deferred:** `scripts/cli/expo/blocks/` use the same model; externalize them under `.claude/skills/component/expo/registry.yaml` in a follow-up once react proves out (consistent with the Go/Rust deferral in Phase A).
- **Tabs are load-bearing** in `jsxBefore`/host bodies — `|` block scalars preserve them; the golden tests are the guard. Use `|-` strip-chomp if a body must not end with a trailing newline.
- **No new dependency** — `yaml` already in use; `interpolate` reused from Phase A.
