// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT-ORIGIN · want→got corpus · examples/pairs/dashboard
// repo:    template-fullstack
// branch:  feat/template-polyglot
// source:  packages/app/react/src/routes/(app)/dashboard/-components/PixelFunnelSection/funnel.ts
// role:    Pure funnel math — curated 5-stage subset, log attenuation, buildStageRows
// Verbatim copy kept as corpus reference — NOT a live module. Do not import it.
// ─────────────────────────────────────────────────────────────────────────────
import type { GetPixelFunnelQueryResponse } from '@codedm/client-typescript/typescript'

/** All keys of the funnel response's `steps` map (the 8 PixelEventType names). */
type PixelStepKey = keyof GetPixelFunnelQueryResponse['steps']

/**
 * Curated, ordered subset of the funnel stages shown in the UI. Typed against the response's
 * `steps` keys — the SDK exposes no `pixelEventTypeEnum` value, so we use the wire key literals
 * (still type-checked via `satisfies`).
 */
export const FUNNEL_STAGES = [
	'PAGE_VIEWED',
	'PRODUCT_VIEWED',
	'PRODUCT_ADDED_TO_CART',
	'CHECKOUT_STARTED',
	'CHECKOUT_COMPLETED',
] as const satisfies readonly PixelStepKey[]

/** The 5 curated stage keys (a subset of the 8) — these are the only `pixelFunnel.steps.*` i18n keys. */
export type FunnelStageKey = (typeof FUNNEL_STAGES)[number]

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
 * near-flat. attenuate(0) = 0, attenuate(1) = 1, monotonic, clamps out-of-range input.
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
