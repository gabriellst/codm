import { AgentModelId, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { UsageBucket } from '../enums/UsageBucket'
import type { AgentTurnUsage } from '../types/AgentFrame'

/** The price of one token of each bucket, in the budget's cost unit. */
export type BucketWeights = Readonly<Record<UsageBucket, number>>

/**
 * THE BUDGET'S COST UNIT (fase 4, item 2 — "Unidade de orçamento"): one input token of the frontier claude tier.
 *
 * The provider exposes no balance and no utilization (measured: `utilization` never appeared in the CLI's
 * `rate_limit_info`), so the budget prices the usage fact's buckets itself. The weights are a SUPPOSITION — the
 * proportion of each vendor's public per-token price list (input : cache write : cache read : output = 1 : 1.25 :
 * 0.1 : 5 inside a claude tier; reasoning output is billed as output), each tier scaled against the frontier
 * claude tier's input price. A SCALE error cancels out, because the ceiling is learned in this same unit; a MIX
 * error does not, and shows up as an unstable ceiling — which is why the acceptance replay also runs with
 * output-only weights (`OUTPUT_ONLY_WEIGHTS`).
 */
const claudeTier = (scale: number): BucketWeights => ({
	[UsageBucket.INPUT]: 1 * scale,
	[UsageBucket.CACHE_WRITE]: 1.25 * scale,
	[UsageBucket.CACHE_READ]: 0.1 * scale,
	[UsageBucket.OUTPUT]: 5 * scale,
	[UsageBucket.REASONING_OUTPUT]: 5 * scale,
})
/** codex tiers: no cache-write charge, cached input at a tenth of input, output at eight times input. */
const codexTier = (scale: number): BucketWeights => ({
	[UsageBucket.INPUT]: 1 * scale,
	[UsageBucket.CACHE_WRITE]: 1 * scale,
	[UsageBucket.CACHE_READ]: 0.1 * scale,
	[UsageBucket.OUTPUT]: 8 * scale,
	[UsageBucket.REASONING_OUTPUT]: 8 * scale,
})

/**
 * The weights of every model the contract names. `DEFAULT` ("let the CLI pick") has no price of its own: it is
 * priced as the tier each CLI picks by default (`DEFAULT_PRICED_AS`), so it never appears as a row here.
 */
export const USAGE_COST_WEIGHTS: Readonly<Record<Exclude<AgentModelId, AgentModelId.DEFAULT>, BucketWeights>> = {
	[AgentModelId.OPUS]: claudeTier(1),
	[AgentModelId.SONNET]: claudeTier(0.6),
	[AgentModelId.HAIKU]: claudeTier(0.2),
	[AgentModelId.TERRA]: codexTier(0.25),
	[AgentModelId.LUNA]: codexTier(0.05),
}

/**
 * Which tier a turn that asked for `DEFAULT` is priced as, per CLI — a declared relation, never a branch on the
 * provider. The claude CLI's default is its frontier tier on the plans the product runs on; opencode states no
 * default and is priced at the dearest tier (an over-count holds earlier, never later).
 */
export const DEFAULT_PRICED_AS: Readonly<Record<ProviderKind, Exclude<AgentModelId, AgentModelId.DEFAULT>>> = {
	[ProviderKind.CLAUDE_CODE]: AgentModelId.OPUS,
	[ProviderKind.CODEX]: AgentModelId.TERRA,
	[ProviderKind.OPENCODE]: AgentModelId.OPUS,
}

/** How each requested model resolves to a priced tier — `DEFAULT` through the CLI's default, the rest as themselves. */
const PRICED_TIER: Readonly<Record<AgentModelId, (provider: ProviderKind) => Exclude<AgentModelId, AgentModelId.DEFAULT>>> = {
	[AgentModelId.DEFAULT]: provider => DEFAULT_PRICED_AS[provider],
	[AgentModelId.OPUS]: () => AgentModelId.OPUS,
	[AgentModelId.SONNET]: () => AgentModelId.SONNET,
	[AgentModelId.HAIKU]: () => AgentModelId.HAIKU,
	[AgentModelId.TERRA]: () => AgentModelId.TERRA,
	[AgentModelId.LUNA]: () => AgentModelId.LUNA,
}

/** The weights a turn of `model` on `provider` is priced with. */
export function weightsFor(provider: ProviderKind, model: AgentModelId): BucketWeights {
	return USAGE_COST_WEIGHTS[PRICED_TIER[model](provider)]
}

/** Output tokens only — the second pricing the acceptance replay runs with, to expose a mix error in the table. */
export const OUTPUT_ONLY_WEIGHTS: BucketWeights = {
	[UsageBucket.INPUT]: 0,
	[UsageBucket.CACHE_WRITE]: 0,
	[UsageBucket.CACHE_READ]: 0,
	[UsageBucket.OUTPUT]: 1,
	[UsageBucket.REASONING_OUTPUT]: 1,
}

/** The tokens of each bucket in one turn's usage — reasoning output absent means the provider never reported it. */
function bucketsOf(usage: AgentTurnUsage): Readonly<Record<UsageBucket, number>> {
	return {
		[UsageBucket.INPUT]: usage.inputTokens,
		[UsageBucket.CACHE_WRITE]: usage.cacheCreationInputTokens,
		[UsageBucket.CACHE_READ]: usage.cacheReadInputTokens,
		[UsageBucket.OUTPUT]: usage.outputTokens,
		[UsageBucket.REASONING_OUTPUT]: usage.reasoningOutputTokens ?? 0,
	}
}

/** What one turn cost, in the budget's unit, under `weights`. */
export function costOf(usage: AgentTurnUsage, weights: BucketWeights): number {
	const buckets = bucketsOf(usage)
	return Object.values(UsageBucket).reduce((total, bucket) => total + buckets[bucket] * weights[bucket], 0)
}
