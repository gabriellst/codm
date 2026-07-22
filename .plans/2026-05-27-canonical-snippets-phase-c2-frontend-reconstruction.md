# Canonical Artifact Snippets — Phase C.2 (Frontend Reconstruction in review-plan) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Behavior-preserving for `cli.ts`
> (golden routing unchanged); additive for `review-plan.ts`.

**Goal:** `review-plan.ts` reconstructs frontend scaffold-then-mutate Tasks (`route` / `component` / `form` / `store`) the same way it does backend ones — so a `/app` screen Task is verified, not snippet-guessed.

**Architecture:** Extract `cli.ts`'s verb→generator routing (`getGenerators` / `resolvePlatform` / `CROSS_PLATFORM_VERBS`) into a shared `scripts/cli/resolve.ts` that both `cli.ts` and `review-plan.ts` import — a single routing source so the two can't drift. `review-plan`'s `reconstructTaskFiles` then resolves any verb (backend or frontend) through it, injecting `no-i18n-write` to suppress the frontend generators' disk side-effects.

**Tech Stack:** TypeScript, Bun, `bun:test`. Builds on Phase A/B/C (committed).

**Spec:** .specs/2026-05-27-canonical-artifact-snippets-design.md
**Tasks:** 2
**Estimated minutes:** 70

> Closes the asymmetry from Plan C: generation was already fragment-sourced for react
> blocks; this makes plan-time *verification* symmetric. No entities/controllers/
> migrations — no Contract Lock/SDK; D-checks N/A. Expo generation still uses
> hard-coded TS blocks (Phase C externalized react only); reconstruction here routes
> expo verbs too, but reconstructs whatever the expo generator emits.

---

## Task T1: cli routing lives in one shared module

**Files to write:**
- Create: `scripts/cli/resolve.ts`
- Modify: `scripts/cli.ts` — import the routing from `resolve.ts`; drop the inline copies
- Test: `scripts/cli/resolve.test.ts`

**Files to read:**
- `scripts/cli.ts`
- `scripts/cli/backend/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none — internal tooling)
**Depends on:** (none)

`cli.ts` defines `Platform` / `CROSS_PLATFORM_VERBS` / `resolvePlatform` / `getGenerators`
module-privately, and self-executes on import (so `review-plan` can't import it).
Move the routing to `resolve.ts` (pure, no execution); `cli.ts` keeps identical behavior.

### Step T1.1 — Write the failing test

Create `scripts/cli/resolve.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { getGenerators, resolvePlatform, CROSS_PLATFORM_VERBS } from './resolve'

describe('resolvePlatform', () => {
  it('honors an explicit platform flag', () => {
    expect(resolvePlatform('expo')).toBe('expo')
    expect(resolvePlatform('astro')).toBe('astro')
  })
  it('defaults to react', () => {
    expect(resolvePlatform(undefined)).toBe('react')
  })
})

describe('getGenerators', () => {
  it('routes a cross-platform verb to react frontend + backend by default', () => {
    const g = getGenerators('typescript', 'react', 'component')
    expect(typeof g.component).toBe('function') // react component generator
    expect(typeof g.entity).toBe('function') // backend still available
  })
  it('routes a cross-platform verb to expo when platform=expo', () => {
    const react = getGenerators('typescript', 'react', 'component').component
    const expo = getGenerators('typescript', 'expo', 'component').component
    expect(typeof expo).toBe('function')
    expect(expo).not.toBe(react) // distinct generator
  })
  it('exposes single-platform verbs (store, form) regardless', () => {
    const g = getGenerators('typescript', 'react', 'store')
    expect(typeof g.store).toBe('function')
  })
  it('CROSS_PLATFORM_VERBS contains the cross-platform set', () => {
    expect([...CROSS_PLATFORM_VERBS].sort()).toEqual(['component', 'form', 'primitive', 'route'])
  })
})
```

### Step T1.2 — Run test to verify it fails

Run: `bun test scripts/cli/resolve.test.ts`
Expected: FAIL — `Cannot find module './resolve'`.

### Step T1.3 — Create the shared routing module

Create `scripts/cli/resolve.ts` — the exact `Platform` / `CROSS_PLATFORM_VERBS` /
`resolvePlatform` / `getGenerators` currently inline in `cli.ts`, now exported:

```typescript
// Verb → generator routing, shared by the cli entry (scripts/cli.ts) and the plan
// reconstructor (scripts/review-plan.ts). One source so the two can't drift.
import { backendGeneratorsFor, type BackendLang } from './backend'
import { frontendGenerators } from './frontend'
import { expoGenerators } from './expo'
import type { Generator } from './types'

export type Platform = 'react' | 'expo' | 'astro'

// Cross-platform verbs route to react / expo / astro. Single-platform verbs
// (dialog, mask, i18n, onboarding-step, store on react; sheet on expo) stay in
// their owner registry and bypass the dispatch.
export const CROSS_PLATFORM_VERBS = new Set(['route', 'component', 'primitive', 'form'])

export function resolvePlatform(flag: string | undefined): Platform {
	if (flag === 'react' || flag === 'expo' || flag === 'astro') return flag
	const cwd = process.cwd()
	if (cwd.includes('packages/app/expo')) return 'expo'
	if (cwd.includes('packages/app/astro')) return 'astro'
	if (cwd.includes('packages/app/react')) return 'react'
	return 'react'
}

export function getGenerators(lang: BackendLang, platform: Platform, verb: string | undefined): Record<string, Generator> {
	if (verb && CROSS_PLATFORM_VERBS.has(verb)) {
		if (platform === 'expo') return { ...backendGeneratorsFor(lang), ...expoGenerators }
		if (platform === 'astro') {
			return {
				...backendGeneratorsFor(lang),
				[verb]: async () => {
					console.error(`bun cli ${verb} --platform=astro is not yet implemented.`)
					console.error(`Author the astro page/component manually and follow .claude/skills/${verb}/astro/SKILL.md.`)
					process.exit(2)
				},
			}
		}
		return { ...backendGeneratorsFor(lang), ...frontendGenerators }
	}
	return {
		...backendGeneratorsFor(lang),
		...frontendGenerators,
		...expoGenerators,
	}
}
```

### Step T1.4 — Point cli.ts at the shared module

Modify `scripts/cli.ts`:

```diff
- import {
- 	backendContextCommands,
- 	backendGeneratorsFor,
- 	contextExists,
- 	generateFullContext,
- 	resolveLang,
- 	type BackendLang,
- } from './cli/backend'
- import { frontendGenerators } from './cli/frontend'
- import { expoGenerators } from './cli/expo'
- import type { GeneratedFile, Generator } from './cli/types'
+ import {
+ 	backendContextCommands,
+ 	contextExists,
+ 	generateFullContext,
+ 	resolveLang,
+ 	type BackendLang,
+ } from './cli/backend'
+ import { CROSS_PLATFORM_VERBS, getGenerators, resolvePlatform, type Platform } from './cli/resolve'
+ import type { GeneratedFile, Generator } from './cli/types'
```

Then delete the now-duplicated definitions from `cli.ts`: the `type Platform` line,
the `CROSS_PLATFORM_VERBS` const, the `resolvePlatform` function, and the
`getGenerators` function (all now imported). Leave every other line untouched.

> If `cli.ts` no longer references `CROSS_PLATFORM_VERBS`, `Platform`, or
> `resolvePlatform` directly after deletion, drop them from the import to satisfy
> lint; keep only what `cli.ts` still uses (it calls `getGenerators` and
> `resolvePlatform`). `Generator` stays imported (used by `printFiles`/`output`).

### Step T1.5 — Run test + verify cli still works

Run: `bun test scripts/cli/resolve.test.ts`
Expected: PASS — 6 assertions.

Run: `bun cli entity sales Probe --print >/dev/null && echo OK` then `bun cli component '(app)/probe' Probe --recipe plain --print >/dev/null && echo OK`
Expected: both print `OK` — backend + frontend dispatch still resolve through the shared module (no file written with `--print`).

### Step T1.6 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T1.7 — Commit

```bash
git add scripts/cli/resolve.ts scripts/cli/resolve.test.ts scripts/cli.ts
git commit -m "refactor(cli): extract verb→generator routing into shared resolve.ts (Task T1)"
```

---

## Task T2: review-plan reconstructs frontend scaffold-then-mutate Tasks

**Files to write:**
- Modify: `scripts/review-plan.ts` — resolve any verb (backend + frontend) via `getGenerators`; suppress frontend side-effects
- Test: `scripts/review-plan.test.ts` — frontend reconstruction cases

**Files to read:**
- `scripts/cli/resolve.ts`
- `scripts/cli/frontend/artifacts/component.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none — internal tooling)
**Depends on:** T1

`reconstructTaskFiles` currently resolves only `backendGeneratorsFor('typescript')`,
so frontend verbs return `[]`. Route every verb through the shared `getGenerators`,
and inject `no-i18n-write: 'true'` so `componentGenerator`/`form` don't write locale
JSON to disk during reconstruction.

### Step T2.1 — Write the failing test

Add to `scripts/review-plan.test.ts`:

```typescript
describe('reconstructTaskFiles (frontend)', () => {
  const FRONT = [
    `${H} Task T1: Coupons screen`,
    '',
    '**Files to write:**',
    '- Create: `packages/app/react/src/routes/(app)/coupons/-components/CouponListSection/index.tsx`',
    '',
    `${H}# Step T1.1 — Scaffold`,
    `${F}bash`,
    'bun cli component (app)/coupons CouponListSection --recipe section --sdk Coupon --state query --skeleton --i18n coupons',
    F,
    '',
    `${H}# Step T1.2 — Mutate`,
    `${F}edit`,
    '<<<<<<< SEARCH',
    '{/* Implement section */}',
    '=======',
    '<CouponTable coupons={data} />',
    '>>>>>>> REPLACE',
    F,
  ].join('\n')

  it('renders the react component from its registry fragments and applies the delta', async () => {
    const files = await reconstructTaskFiles(FRONT)
    expect(files).toHaveLength(1)
    expect(files[0]!.filePath).toContain('CouponListSection/index.tsx')
    expect(files[0]!.content).toContain('useListCoupons') // fragment-sourced query hook
    expect(files[0]!.content).toContain('<CouponTable coupons={data} />') // delta applied
    expect(files[0]!.content).not.toContain('{/* Implement section */}') // SEARCH replaced
  })
})
```

### Step T2.2 — Run test to verify it fails

Run: `bun test scripts/review-plan.test.ts`
Expected: FAIL — `reconstructTaskFiles` returns `[]` for the `component` verb (backend-only today).

### Step T2.3 — Route every verb through the shared resolver

Modify `scripts/review-plan.ts`:

```diff
- import { backendGeneratorsFor } from './cli/backend'
+ import { getGenerators, resolvePlatform } from './cli/resolve'
```

In `reconstructTaskFiles`, replace the backend-only resolution:

```diff
-   const backend = backendGeneratorsFor('typescript')
    const results: Array<{ filePath: string; content: string }> = []

    for (const inv of invocations) {
-     const gen = backend[inv.verb]
-     if (!gen) continue // non-backend verb (frontend/expo) — skip; fall back to snippet extraction
-     const generated = await gen(inv.positional, inv.flags)
+     const platform = resolvePlatform(inv.flags.platform)
+     const gen = getGenerators('typescript', platform, inv.verb)[inv.verb]
+     if (!gen) continue // unknown verb — fall back to snippet extraction
+     // Suppress the frontend generators' locale-JSON write; we only want the in-memory file(s).
+     const generated = await gen(inv.positional, { ...inv.flags, 'no-i18n-write': 'true' })
      for (const file of generated) {
        const fileEdits = edits.filter(e => !e.path || file.filePath.endsWith(e.path))
        results.push({ filePath: file.filePath, content: applyEdits(file.content, fileEdits) })
      }
    }
    return results
```

### Step T2.4 — Run tests to verify they pass

Run: `bun test scripts/review-plan.test.ts`
Expected: PASS — the new frontend case plus all existing backend + grammar + edit cases stay green (regression).

### Step T2.5 — Verify the coupon plan's frontend Task now reconstructs

Run: `bun scripts/review-plan.ts .plans/2026-05-27-sales-coupon-crud.md --dry-run`
Expected: the file count rises beyond the 12 backend files — T6's `CouponListSection`
(and the other frontend scaffolds whose `bun cli` lines parse) now reconstruct, with
no "SEARCH block not found" error.

### Step T2.6 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T2.7 — Commit

```bash
git add scripts/review-plan.ts scripts/review-plan.test.ts
git commit -m "feat(review-plan): reconstruct frontend scaffold-then-mutate tasks via shared routing (Task T2)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `bun test scripts/cli/resolve.test.ts scripts/review-plan.test.ts` — routing + reconstruction (backend + frontend) pass
- [ ] `bun cli entity sales Probe --print` and `bun cli component '(app)/probe' Probe --recipe plain --print` both succeed (cli routing unchanged)
- [ ] `bun scripts/review-plan.ts .plans/2026-05-27-sales-coupon-crud.md --dry-run` reconstructs frontend + backend files with no SEARCH-miss
- [ ] AC mapping:
  - Routing extracted + shared (no drift) → `scripts/cli/resolve.test.ts:"getGenerators …"`
  - Frontend reconstruction in review-plan → `scripts/review-plan.test.ts:"reconstructTaskFiles (frontend) … renders the react component from its registry fragments and applies the delta"`

## Notes

- **Why a shared module, not a duplicated regex/route table:** `review-plan` having its own copy of the routing is exactly the drift class this whole project fights (it already bit us with the task-heading regex in Plan B). One `resolve.ts`, two importers.
- **Side-effect suppression:** `componentGenerator` (and `form`) call `writeI18n` unless `no-i18n-write`/`print` is set; reconstruction injects `no-i18n-write: 'true'` so a `review-plan --dry-run` never mutates locale files.
- **Expo:** routing handles `--platform=expo`, but expo block bodies are still hard-coded TS (Phase C externalized react only). Reconstruction reconstructs whatever the expo generator emits; full expo fragment-sourcing is a separate follow-up.
- **`astro` verbs** resolve to a stub generator that `process.exit(2)`s — if a plan scaffolds an astro artifact, reconstruction will exit; that's acceptable (astro scaffolding isn't implemented), and such plans hand-author astro per the skill.
