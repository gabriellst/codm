# Pixel Funnel Section — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).
>
> **Rewritten 2026-06-04** to align with current `main`: scaffold the frontend artifacts via
> `bun cli` (scaffold-then-mutate, not whole-file), **modify** the already-existing dashboard route
> (its SDK-derived search schema + `productIds` already landed with the Additional Costs work — do not
> replace it), and render money through the shipped `useMoney()` hook over `Money` objects (the
> money/metric refactor made `carts.value` a `MoneyMetric`). The tenancy store already exists, so there
> is no store task; `formatCurrency`/`useGetUserInfo`-currency are gone (superseded by `useMoney`).

**Goal:** Render the dashboard pixel conversion funnel as one integrated card — 5 stage columns
(Page View → Purchase) with a log-attenuated drop-off shape, plus a conversion-rate + abandoned-carts
rail — fed by the existing `useGetPixelFunnel` query.

**Architecture:** Frontend-only (TanStack Start + React Query). Backend controller, query, SDK hook,
the global `useTenancyStore`, and `useMoney()` all already exist — no backend, migration, or SDK regen.
A single data-owning `PixelFunnelSection` (scaffolded via `bun cli component --recipe=section`) reads
`tenancyScope` from the store and the date range from the route's URL search, fires one
`useGetPixelFunnel`, and passes plain values to two `--recipe=card` leaves (`FunnelStageColumn`,
`FunnelSummaryStat`). Pure stage-derivation/attenuation logic is a colocated testable module; money
renders via `useMoney()`, percentages via `formatPercent`.

**Tech Stack:** TypeScript, Bun, TanStack Router/Query, Zustand, Zod, Tailwind, date-fns, Playwright

**Spec:** .specs/2026-06-03-pixel-funnel-section.md
**Tasks:** 5
**Estimated minutes:** 130

---

## Task T1: Format a ratio as a percent string

The funnel needs `formatPercent(ratio)` for stage percentages and the conversion rate. Money is
already handled by the shipped `useMoney()` / `formatMoney` (in `@/lib/format`) — this task only adds
the percent formatter alongside them. (The old plan's `formatCurrency` is dropped — superseded.)

**Files to write:**
- Modify: `packages/app/react/src/lib/format.ts` — append `formatPercent`
- Test: `packages/app/react/src/lib/format.test.ts` — add `formatPercent` cases (file exists from the money refactor)

**Files to read:**
- `packages/app/react/src/lib/format.ts`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none — `lib/` helper, no `bun cli` verb)
**Depends on:** (none)

### Step T1.1 — Add the failing test cases

Append a `describe('formatPercent', …)` block to `packages/app/react/src/lib/format.test.ts`:

```typescript
import { formatPercent } from './format'

describe('formatPercent', () => {
	it('formats a ratio with one decimal, pt-BR comma', () => {
		expect(formatPercent(1)).toBe('100,0%')
		expect(formatPercent(0.75)).toBe('75,0%')
		expect(formatPercent(0.1)).toBe('10,0%')
	})

	it('clamps non-finite to zero', () => {
		expect(formatPercent(0)).toBe('0,0%')
		expect(formatPercent(Number.NaN)).toBe('0,0%')
	})
})
```

(Keep the existing `formatMoney`/`sumMoney` describes; just add the import + this block.)

### Step T1.2 — Run test to verify it fails

Run: `cd packages/app/react && bun test src/lib/format.test.ts`
Expected: FAIL — `formatPercent` is not exported from `./format`.

### Step T1.3 — Add the implementation

Append to `packages/app/react/src/lib/format.ts`:

```typescript
/** Format a ratio (0..1) as a percent string, one decimal, pt-BR by default: 0.75 -> "75,0%". */
export function formatPercent(ratio: number, locale = 'pt-BR', fractionDigits = 1): string {
	const safe = Number.isFinite(ratio) ? ratio : 0
	return new Intl.NumberFormat(locale, {
		style: 'percent',
		minimumFractionDigits: fractionDigits,
		maximumFractionDigits: fractionDigits,
	}).format(safe)
}
```

### Step T1.4 — Run test to verify it passes

Run: `cd packages/app/react && bun test src/lib/format.test.ts`
Expected: PASS (existing money tests still green + the new percent block).

### Step T1.5 — Type check + lint

Run: `cd packages/app/react && bun x tsc --noEmit && bun lint`
Expected: 0 errors.

### Step T1.6 — Commit

```bash
git add packages/app/react/src/lib/format.ts packages/app/react/src/lib/format.test.ts
git commit -m "feat(app): formatPercent helper for the funnel (Task T1)"
```

---

## Task T2: Add the pixelFunnel translation namespace

All funnel copy comes from `t()` under a new `pixelFunnel` namespace (spec AC-8). i18n types derive
from `pt.json`, so adding keys there is what makes `t('pixelFunnel.…')` type-check. (Locale JSON is
data — not a `bun cli`-scaffoldable artifact — so this is a direct edit.)

**Files to write:**
- Modify: `packages/app/react/src/locales/pt.json` — add `pixelFunnel` block
- Modify: `packages/app/react/src/locales/en.json` — add the same keys (English)

**Files to read:**
- `packages/app/react/src/locales/pt.json`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** (none — locale data)
**Depends on:** (none)

### Step T2.1 — Add the namespace to pt.json

Add a top-level `pixelFunnel` key (insert after the existing `dashboard` block; keep valid JSON):

```json
"pixelFunnel": {
	"title": "Funil de conversão",
	"steps": {
		"PAGE_VIEWED": "Page View",
		"PRODUCT_VIEWED": "View Content",
		"PRODUCT_ADDED_TO_CART": "Add to Cart",
		"CHECKOUT_STARTED": "Initiate Checkout",
		"CHECKOUT_COMPLETED": "Purchase"
	},
	"ofBase": "{{value}} de {{base}}",
	"conversionRate": "Taxa de Conversão",
	"conversionRateHint": "Percentual de sessões que concluíram a compra no período.",
	"carts": "Carrinhos",
	"cartsHint": "Valor total dos carrinhos abandonados no período.",
	"empty": {
		"title": "Nenhum pixel conectado",
		"description": "Conecte seu pixel para acompanhar o funil de conversão da sua loja.",
		"cta": "Conectar pixel"
	}
}
```

### Step T2.2 — Add the same keys to en.json

```json
"pixelFunnel": {
	"title": "Conversion funnel",
	"steps": {
		"PAGE_VIEWED": "Page View",
		"PRODUCT_VIEWED": "View Content",
		"PRODUCT_ADDED_TO_CART": "Add to Cart",
		"CHECKOUT_STARTED": "Initiate Checkout",
		"CHECKOUT_COMPLETED": "Purchase"
	},
	"ofBase": "{{value}} of {{base}}",
	"conversionRate": "Conversion Rate",
	"conversionRateHint": "Share of sessions that completed a purchase in the period.",
	"carts": "Carts",
	"cartsHint": "Total value of abandoned carts in the period.",
	"empty": {
		"title": "No pixel connected",
		"description": "Connect your pixel to track your store's conversion funnel.",
		"cta": "Connect pixel"
	}
}
```

### Step T2.3 — Verify JSON + types

Run: `cd packages/app/react && bun x tsc --noEmit`
Expected: 0 errors (the `pixelFunnel` keys are now visible to `t()`'s resource types).

### Step T2.4 — Commit

```bash
git add packages/app/react/src/locales/pt.json packages/app/react/src/locales/en.json
git commit -m "feat(app): pixelFunnel i18n namespace (Task T2)"
```

---

## Task T3: Derive the ordered funnel stages with logarithmic attenuation

Pure, testable logic separated from JSX: the curated 5-stage ordered subset (spec D1), the
log-attenuation curve (D5), and the row builder pairing each stage with its neighbour for the
drop-off slope. This is a colocated `.ts` module (no `bun cli` verb) → whole-file is correct. It also
creates the `PixelFunnelSection/` folder that T4's section scaffold writes into.

**Files to write:**
- Create: `packages/app/react/src/routes/(app)/dashboard/-components/PixelFunnelSection/funnel.ts`
- Test: `packages/app/react/src/routes/(app)/dashboard/-components/PixelFunnelSection/funnel.test.ts`

**Files to read:**
- `packages/client/dist/typescript/src/typescript/types/GetPixelFunnel.ts` (response `steps` keyed by event name; `base`/`steps`/`conversionRate` are number metrics; `carts.value.value` is a `Money` object)

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none — pure colocated module)
**Depends on:** (none)

### Step T3.1 — Write the failing test

Create `.../PixelFunnelSection/funnel.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import type { GetPixelFunnelQueryResponse } from '@template/client-typescript/typescript'
import { FUNNEL_STAGES, attenuate, buildStageRows } from './funnel'

const numMetric = (value: number) => ({ value, deltaPct: null })

const response = (): GetPixelFunnelQueryResponse => ({
	hasPixel: true,
	base: numMetric(1000),
	steps: {
		PAGE_VIEWED: numMetric(1000),
		PRODUCT_VIEWED: numMetric(750),
		PRODUCT_ADDED_TO_CART: numMetric(200),
		PRODUCT_REMOVED_FROM_CART: numMetric(50),
		CART_VIEWED: numMetric(180),
		CHECKOUT_STARTED: numMetric(150),
		CHECKOUT_CONTACT_INFO_SUBMITTED: numMetric(120),
		CHECKOUT_COMPLETED: numMetric(100),
	},
	conversionRate: numMetric(0.1),
	carts: { count: numMetric(80), value: { value: { amountCents: 0, currency: 'BRL' }, deltaPct: null } },
})

describe('FUNNEL_STAGES', () => {
	it('is the 5-stage ordered subset', () => {
		expect(FUNNEL_STAGES).toEqual(['PAGE_VIEWED', 'PRODUCT_VIEWED', 'PRODUCT_ADDED_TO_CART', 'CHECKOUT_STARTED', 'CHECKOUT_COMPLETED'])
	})
})

describe('attenuate', () => {
	it('maps 0 -> 0 and 1 -> 1', () => {
		expect(attenuate(0)).toBeCloseTo(0)
		expect(attenuate(1)).toBeCloseTo(1)
	})
	it('lifts small ratios above the linear value', () => {
		expect(attenuate(0.1)).toBeGreaterThan(0.1)
		expect(attenuate(0.2)).toBeGreaterThan(0.2)
	})
	it('is monotonic and clamps out-of-range input', () => {
		expect(attenuate(0.5)).toBeGreaterThan(attenuate(0.2))
		expect(attenuate(-1)).toBe(0)
		expect(attenuate(2)).toBe(1)
	})
})

describe('buildStageRows', () => {
	it('returns one row per curated stage, in order, with the next stage value', () => {
		const rows = buildStageRows(response())
		expect(rows.map(r => r.key)).toEqual(FUNNEL_STAGES)
		expect(rows[0]).toMatchObject({ value: 1000, base: 1000, nextValue: 750 })
		expect(rows[2]).toMatchObject({ value: 200, base: 1000, nextValue: 150 })
	})
	it('uses 0 as nextValue for the last stage', () => {
		expect(buildStageRows(response()).at(-1)).toMatchObject({ key: 'CHECKOUT_COMPLETED', value: 100, nextValue: 0 })
	})
})
```

### Step T3.2 — Run test to verify it fails

Run: `cd packages/app/react && bun test "src/routes/(app)/dashboard/-components/PixelFunnelSection/funnel.test.ts"`
Expected: FAIL — `Cannot find module './funnel'`.

### Step T3.3 — Write the pure module

Create `.../PixelFunnelSection/funnel.ts`:

```typescript
import type { GetPixelFunnelQueryResponse } from '@template/client-typescript/typescript'

/** Keys of the funnel response's `steps` map (the 8 PixelEventType names). */
export type FunnelStageKey = keyof GetPixelFunnelQueryResponse['steps']

/**
 * Curated, ordered subset of the funnel stages shown in the UI (spec D1). Typed against the
 * response's `steps` keys — the SDK exposes no `pixelEventTypeEnum` value, so we use the wire
 * key literals (still type-checked via `satisfies`).
 */
export const FUNNEL_STAGES = [
	'PAGE_VIEWED',
	'PRODUCT_VIEWED',
	'PRODUCT_ADDED_TO_CART',
	'CHECKOUT_STARTED',
	'CHECKOUT_COMPLETED',
] as const satisfies readonly FunnelStageKey[]

export interface FunnelStageRow {
	key: FunnelStageKey
	value: number
	base: number
	/** Value of the next curated stage (0 for the last stage) — drives the drop-off slope. */
	nextValue: number
}

const ATTENUATION_K = 12

/**
 * Logarithmic attenuation of a ratio (0..1) so small funnel stages stay visibly tall instead of
 * near-flat (spec D5). attenuate(0)=0, attenuate(1)=1, monotonic.
 */
export function attenuate(ratio: number): number {
	const clamped = Math.min(1, Math.max(0, ratio))
	return Math.log1p(clamped * ATTENUATION_K) / Math.log1p(ATTENUATION_K)
}

/** Ordered rows for the curated stages, each paired with the next stage's value. */
export function buildStageRows(data: GetPixelFunnelQueryResponse): FunnelStageRow[] {
	const base = data.base.value
	return FUNNEL_STAGES.map((key, i) => ({
		key,
		value: data.steps[key].value,
		base,
		nextValue: i + 1 < FUNNEL_STAGES.length ? data.steps[FUNNEL_STAGES[i + 1]].value : 0,
	}))
}
```

### Step T3.4 — Run test to verify it passes

Run: `cd packages/app/react && bun test "src/routes/(app)/dashboard/-components/PixelFunnelSection/funnel.test.ts"`
Expected: PASS.

### Step T3.5 — Type check + lint

Run: `cd packages/app/react && bun x tsc --noEmit && bun lint`
Expected: 0 errors.

### Step T3.6 — Commit

```bash
git add "packages/app/react/src/routes/(app)/dashboard/-components/PixelFunnelSection/funnel.ts" \
        "packages/app/react/src/routes/(app)/dashboard/-components/PixelFunnelSection/funnel.test.ts"
git commit -m "feat(app): funnel stage derivation + log attenuation (Task T3)"
```

---

## Task T4: Render the pixel funnel section on the dashboard

The user-facing behavior: visiting `/dashboard` shows one integrated funnel card — 5 stage columns
with the log-attenuated shape (vertical dividers), a conversion-rate + carts rail (horizontal divider),
a faint background grid; handles loading + `hasPixel === false`. **Scaffold each artifact with
`bun cli component`, then mutate the body.** The dashboard route already exists with its search schema
(`startDate`/`endDate` ISO strings + `productIds`, defaulted, exported) — **modify** it to mount the
section; do NOT touch the schema. Composes T1 (`formatPercent`), T2 (i18n), T3 (logic), the existing
`useTenancyStore` + `useMoney()`.

**Files to write:**
- Scaffold→mutate: `.../PixelFunnelSection/index.tsx` (`bun cli component … --recipe=section`)
- Scaffold→mutate: `.../FunnelStageColumn/index.tsx` (+ generated story) (`--recipe=card`)
- Scaffold→mutate: `.../FunnelSummaryStat/index.tsx` (+ generated story) (`--recipe=card`)
- Modify: `packages/app/react/src/routes/(app)/dashboard/index.tsx` — mount `<PixelFunnelSection/>` in `RouteComponent` (schema unchanged)
- Regen: `packages/app/react/src/routeTree.gen.ts` (only if the route file's type surface changed; the schema is unchanged so this is usually a no-op)

**Files to read:**
- `packages/app/react/src/routes/(app)/dashboard/index.tsx` (existing route + `dashboardSearchSchema`)
- `packages/app/react/src/routes/(app)/dashboard/-components/AdditionalCostsSection/index.tsx` (sibling section: how it reads the store + route search + renders via `useMoney`)
- `packages/app/react/src/components/ui/{card,separator,gradient-icon-badge,info-hint,metric-delta,empty,skeleton,button}.tsx`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /component, /route
**Depends on:** T1, T2, T3

### Step T4.1 — Scaffold the three components via `bun cli`

```bash
cd /Users/work/Desktop/Projetos/pessoal/template-fullstack
export PATH="$HOME/.bun/bin:$PATH"
bun cli component "(app)/dashboard" PixelFunnelSection --recipe=section --sdk=GetPixelFunnel --store=useTenancyStore --i18n=pixelFunnel
bun cli component "(app)/dashboard" FunnelStageColumn --recipe=card --i18n=pixelFunnel
bun cli component "(app)/dashboard" FunnelSummaryStat --recipe=card --i18n=pixelFunnel
```

This creates `routes/(app)/dashboard/-components/{PixelFunnelSection,FunnelStageColumn,FunnelSummaryStat}/index.tsx`
(route-scoped, flat) plus each component's story. The CLI owns the folder/imports/export/story
boilerplate; the steps below replace only each component's **body**. `PixelFunnelSection/` already
contains `funnel.ts` from T3 — the section scaffold adds `index.tsx` alongside it.

### Step T4.2 — Mutate the leaf: FunnelStageColumn

Replace the scaffolded body of `.../FunnelStageColumn/index.tsx` with (keep the CLI's file/story):

```typescript
import { IconUsersGroup } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { formatPercent } from '@/lib/format'
import { attenuate, type FunnelStageRow } from '../PixelFunnelSection/funnel'

/**
 * FunnelStageColumn — one surfaceless funnel stage (Leaf, rendered N times). Label, percent,
 * "{value} de {base}" subtitle, sessions icon, and a log-attenuated drop-off area. The parent owns
 * the Card surface + separators; this is just a column.
 */
export function FunnelStageColumn({ row, className }: { row: FunnelStageRow; className?: string }) {
	const { t } = useTranslation()
	const ratio = row.base > 0 ? row.value / row.base : 0
	const nextRatio = row.base > 0 ? row.nextValue / row.base : 0
	const topLeft = (1 - attenuate(ratio)) * 100
	const topRight = (1 - attenuate(nextRatio)) * 100
	const label = t(`pixelFunnel.steps.${row.key}` as const)

	return (
		<div className={cn('flex min-w-0 flex-1 flex-col gap-2 px-4', className)} role="listitem" aria-label={`${label}: ${formatPercent(ratio)}`}>
			<span className="truncate text-sm text-muted-foreground">{label}</span>
			<span className="text-2xl font-bold text-foreground">{formatPercent(ratio)}</span>
			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<span>{t('pixelFunnel.ofBase', { value: row.value.toLocaleString('pt-BR'), base: row.base.toLocaleString('pt-BR') })}</span>
				<IconUsersGroup className="size-4" aria-hidden />
			</div>
			<svg className="mt-auto h-28 w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
				<polygon points={`0,${topLeft} 100,${topRight} 100,100 0,100`} className="fill-bkdash-purple/70" />
			</svg>
		</div>
	)
}
```

Point its generated story args at a `FunnelStageRow` (`{ key: 'PAGE_VIEWED', value: 1000, base: 1000, nextValue: 750 }` and a `CHECKOUT_COMPLETED` zero-tail variant).

### Step T4.3 — Mutate the leaf: FunnelSummaryStat

Replace the scaffolded body of `.../FunnelSummaryStat/index.tsx` with:

```typescript
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { GradientIconBadge } from '@/components/ui/gradient-icon-badge'
import { InfoHint } from '@/components/ui/info-hint'
import { MetricDelta } from '@/components/ui/metric-delta'
import type { IconComponent } from '@/components/ui/icons'

interface FunnelSummaryStatProps {
	icon: IconComponent
	label: string
	hint: ReactNode
	/** Pre-formatted display string, e.g. "0,0%" or "R$ 0,00". */
	value: string
	deltaPct?: number
	className?: string
}

/**
 * FunnelSummaryStat — surfaceless rail metric (Leaf): icon + label + info hint on one row,
 * value + delta on the row below. No Card (the parent owns the surface).
 */
export function FunnelSummaryStat({ icon, label, hint, value, deltaPct, className }: FunnelSummaryStatProps) {
	return (
		<div className={cn('flex flex-col gap-2', className)}>
			<div className="flex items-center gap-2">
				<GradientIconBadge icon={icon} />
				<span className="text-sm text-muted-foreground">{label}</span>
				<InfoHint label={label}>{hint}</InfoHint>
			</div>
			<div className="flex items-center gap-2">
				<span className="text-2xl font-bold text-foreground">{value}</span>
				{deltaPct !== undefined ? <MetricDelta pct={deltaPct} /> : null}
			</div>
		</div>
	)
}
```

### Step T4.4 — Mutate the section: PixelFunnelSection

Replace the scaffolded body of `.../PixelFunnelSection/index.tsx` with the version below. It reads the
store + route search (ISO-string dates → `yyyy-MM-dd`), fires the query, renders the grid + columns +
rail, and renders money via `useMoney()` (carts) + `formatPercent` (conversion). No currency lookup —
`carts.value.value` is a `Money` carrying its own currency.

```typescript
import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { IconPercentage, IconShoppingCart } from '@tabler/icons-react'
import { format } from 'date-fns'
import { useGetPixelFunnel } from '@template/client-typescript/typescript'
import { useTenancyStore } from '@/stores'
import { useMoney } from '@/hooks'
import { formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { FunnelStageColumn } from '../FunnelStageColumn'
import { FunnelSummaryStat } from '../FunnelSummaryStat'
import { buildStageRows } from './funnel'

const routeApi = getRouteApi('/(app)/dashboard/')
const asYmd = (iso: string) => format(new Date(iso), 'yyyy-MM-dd')

/** Faint grid behind the card content, at separator opacity (spec D6). */
function GridBackdrop() {
	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(to_right,transparent,transparent_calc(20%-1px),var(--border)_calc(20%-1px),var(--border)_20%),repeating-linear-gradient(to_bottom,transparent,transparent_31px,var(--border)_31px,var(--border)_32px)] opacity-40"
		/>
	)
}

function FunnelSkeleton() {
	return (
		<div className="relative z-10 flex flex-1 gap-3">
			{Array.from({ length: 5 }).map((_, i) => (
				<Skeleton key={i} className="h-44 flex-1" />
			))}
		</div>
	)
}

export function PixelFunnelSection({ className }: { className?: string }) {
	const { t } = useTranslation()
	const formatMoney = useMoney()
	const tenancyScope = useTenancyStore(s => s.tenancyScope)
	const { startDate, endDate } = routeApi.useSearch()

	const { data } = useGetPixelFunnel({ tenancyScope, startDate: asYmd(startDate), endDate: asYmd(endDate) })

	return (
		<section aria-label={t('pixelFunnel.title')}>
			<Card className={cn('relative flex flex-row gap-0 overflow-hidden rounded-[1.5rem] p-5', className)}>
				<GridBackdrop />
				{!data ? (
					<FunnelSkeleton />
				) : !data.hasPixel ? (
					<Empty className="relative z-10 border-none">
						<EmptyHeader>
							<EmptyTitle>{t('pixelFunnel.empty.title')}</EmptyTitle>
							<EmptyDescription>{t('pixelFunnel.empty.description')}</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button>{t('pixelFunnel.empty.cta')}</Button>
						</EmptyContent>
					</Empty>
				) : (
					<>
						<div className="relative z-10 flex flex-1 items-stretch" role="list" aria-label={t('pixelFunnel.title')}>
							{buildStageRows(data).map((row, i) => (
								<div key={row.key} className="flex flex-1 items-stretch">
									{i > 0 ? <Separator orientation="vertical" className="mx-1" /> : null}
									<FunnelStageColumn row={row} />
								</div>
							))}
						</div>
						<Separator orientation="vertical" className="mx-4" />
						<div className="relative z-10 flex w-56 shrink-0 flex-col justify-between">
							<FunnelSummaryStat
								icon={IconPercentage}
								label={t('pixelFunnel.conversionRate')}
								hint={t('pixelFunnel.conversionRateHint')}
								value={formatPercent(data.conversionRate.value)}
								deltaPct={data.conversionRate.deltaPct ?? undefined}
							/>
							<Separator className="my-4" />
							<FunnelSummaryStat
								icon={IconShoppingCart}
								label={t('pixelFunnel.carts')}
								hint={t('pixelFunnel.cartsHint')}
								value={formatMoney(data.carts.value.value)}
								deltaPct={data.carts.value.deltaPct ?? undefined}
							/>
						</div>
					</>
				)}
			</Card>
		</section>
	)
}
```

### Step T4.5 — Mount the section in the EXISTING route (modify, don't replace)

Modify `packages/app/react/src/routes/(app)/dashboard/index.tsx` — leave `dashboardSearchSchema` and
the `Route` definition untouched; replace only the mock-shell `RouteComponent` body:

```diff
-import { createFileRoute } from '@tanstack/react-router'
+import { createFileRoute } from '@tanstack/react-router'
+import { PixelFunnelSection } from './-components/PixelFunnelSection'
@@
-// Mock route shell — the real screen (incl. the Additional Costs card) is showcased in Storybook
-// and not yet wired into this route.
-function RouteComponent() {
-	return (
-		<div className="p-8 flex flex-col gap-2">
-			<h1 className="text-xl font-bold text-foreground">Dashboard</h1>
-			<p className="text-muted-foreground">Mock route — to be implemented.</p>
-		</div>
-	)
-}
+function RouteComponent() {
+	return (
+		<div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 md:p-8">
+			<PixelFunnelSection />
+		</div>
+	)
+}
```

> Do NOT change `dashboardSearchSchema` (it already carries `startDate`/`endDate` as defaulted ISO
> strings + `productIds`, derived from the SDK and exported for the story). The section consumes those.
> The date-range *picker* that writes the params (via `useRangeSearchParams`) is a separate
> dashboard-shell task (spec OQ-4) — out of scope here.

### Step T4.6 — Regenerate the route tree (if needed)

Run: `cd packages/app && bun tsr generate`
Expected: no-op or trivial (the route's search type is unchanged). Commit `routeTree.gen.ts` only if it changed.

### Step T4.7 — Type check + lint

Run: `cd packages/app/react && bun x tsc --noEmit && bun lint`
Expected: 0 errors. If `fill-bkdash-purple/70` is rejected by the Tailwind token setup, use
`style={{ fill: 'var(--bkdash-purple)', fillOpacity: 0.7 }}` on the `<polygon>` (keep the color, adapt
the mechanism).

### Step T4.8 — Commit

```bash
git add "packages/app/react/src/routes/(app)/dashboard/" packages/app/react/src/routeTree.gen.ts
git commit -m "feat(app): pixel funnel section on the dashboard (Task T4)"
```

---

## Task T5: Dashboard funnel renders for a signed-in user (E2E)

End-to-end behavior gate (spec US-1/US-2): a signed-in user visiting `/dashboard` sees the funnel
section landmark and the first stage label.

**Files to write:**
- Create: `packages/e2e/tests/07-dashboard-pixel-funnel.spec.ts`

**Files to read:**
- `packages/e2e/utils/given/user.ts`
- `packages/e2e/tests/01-signup-connect-webhook-dashboard.spec.ts`

**Agent:** qa-tester
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /e2e
**Depends on:** T4

### Step T5.1 — Write the E2E test

Create `packages/e2e/tests/07-dashboard-pixel-funnel.spec.ts`:

```typescript
import { expect, test } from '@playwright/test'
import { givenFreshUser } from '../utils/given'

test('dashboard pixel funnel renders for a signed-in user', async ({ page, context }) => {
	await givenFreshUser(context)

	await page.goto('/dashboard')

	const funnel = page.getByRole('region', { name: /funil de convers|conversion funnel/i })
	await expect(funnel).toBeVisible()

	// With pixel data present (faker hasPixel:true), the first curated stage label shows.
	await expect(funnel.getByText('Page View')).toBeVisible()
})
```

### Step T5.2 — Run the E2E test

Run: `bun e2e --grep "dashboard pixel funnel"`
Expected: PASS. Playwright boots `api-typescript:dev` + `app-react:dev` via `webServer`.

> If a fresh signed-up user has no store membership and the funnel query is gated by
> `RequireStoreMember`, the section may render the empty/skeleton state instead of stage labels. Keep
> the landmark assertion (deterministic) and relax the stage-label assertion to `await
> expect(funnel).toBeVisible()`, noting the store-fixture gap as a follow-up. Do NOT add a backdoor —
> extend the `given` fixture if a real store is needed.

### Step T5.3 — Commit

```bash
git add packages/e2e/tests/07-dashboard-pixel-funnel.spec.ts
git commit -m "test(e2e): dashboard pixel funnel renders for signed-in user (Task T5)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `bun test affected --base=dev` — affected tests pass (`format`, `funnel` modules)
- [ ] `bun e2e --grep "dashboard pixel funnel"` — E2E covers the feature
- [ ] AC mapping (every spec AC → ≥1 test / gate):
  - AC-1 (Section owns query, no data props) → `T4` `PixelFunnelSection` (review) + `T5` e2e
  - AC-2 (stages from typed constant + i18n) → `T3` `funnel.test.ts:"is the 5-stage ordered subset"`
  - AC-3 (one Card, vertical/horizontal separators, no nested cards) → `T4` (review) + `T5` e2e landmark
  - AC-4 (label, %, "value de base", sessions icon, log-attenuated shape) → `T3` `funnel.test.ts:"attenuate…"` + `T4` `FunnelStageColumn`
  - AC-5 (faint background grid) → `T4` `GridBackdrop` (review)
  - AC-6 (rail uses FunnelSummaryStat; carts via `useMoney`, conversion via `formatPercent`; delta only when non-null) → `T1` `format.test.ts` + `T4` `FunnelSummaryStat`
  - AC-7 (`!hasPixel` empty, skeleton, surface stays) → `T4` Section branches (review)
  - AC-8 (all copy from `pixelFunnel` i18n namespace) → `T2` `pt.json`/`en.json`
  - AC-9 (route declares startDate/endDate; section reads + feeds query) → existing `dashboardSearchSchema` + `T4` Section
- [ ] `git status` clean (all five Task commits landed)

## Notes

- **Scaffold-first.** Frontend components are scaffolded via `bun cli component … --recipe=section|card`
  then mutated (per `docs/CLI.md` + the `/component` skill `scaffold:` line). Only `funnel.ts` (pure
  module), `lib/format.ts` (helper), and the locale JSON are direct edits.
- **The dashboard route already exists** (landed with the Additional Costs work) — this plan **modifies**
  it (mounts the section) and consumes its existing `dashboardSearchSchema`. Do NOT recreate it or
  change the schema; `startDate`/`endDate` arrive as defaulted **ISO strings** (last 30 days) +
  `productIds`, so the Section converts ISO → `yyyy-MM-dd` for the SDK hook.
- **Money via `useMoney()`.** After the money/metric refactor, `carts` is a `Tally` whose `value` is a
  `MoneyMetric` → `carts.value.value` is a `Money { amountCents, currency }`. Render it with
  `useMoney()` (locale inferred). The old plan's `formatCurrency` + `useGetUserInfo` currency lookup are
  gone (spec D10 is superseded — the currency rides on the `Money`).
- **No store task** — `useTenancyStore` (`{ tenancyScope, setTenancyScope }`, default `SINGLE_STORE`)
  already exists in `@/stores`; the Section reads `s.tenancyScope`.
- **No backend / migration / SDK regen** — controller, query, `useGetPixelFunnel` hook all exist.
- **`base`/`steps`/`conversionRate` are number metrics**; `formatPercent` handles the percentages
  (spec OQ-2: `conversionRate.value` is assumed a ratio; OQ-3: attenuation constant `k=12`).
- Run tests/tsc/lint with `bun` on PATH (`export PATH="$HOME/.bun/bin:$PATH"`).
```
