import { BaseDomainEvent, z } from '@codedm/core-typescript'

/**
 * OBSERVED FACT: token accounting for one agent turn (GOAL-agent-abstraction §4.3).
 *
 * It exists as a persisted domain event — rather than a metric emitted and forgotten — because
 * cost-based quota needs a durable, queryable base: "how much did this owner's runs cost this month"
 * has to be a `SELECT` over `shared_events`, not a counter that resets when the daemon restarts.
 *
 * MINTED ONCE PER RUN, FROM THE TERMINAL `result` FRAME'S AGGREGATE — not per assistant message.
 * The Fase-2 smoke (`.specs/codedm/phase2-smoke/`, divergence D4) measured that there is no `usage`
 * frame on this transport at all: usage is a FIELD, appearing per-assistant at `message.usage` and
 * once, already aggregated over the whole turn, on the terminal `result` frame. Folding the
 * per-assistant copies would double-count; the run-level aggregate is the only non-lossy source.
 *
 * ALL FOUR BUCKETS ARE REQUIRED, and this is the correctness fix D4 forced. The wire splits input
 * across three counters, and on a real turn the plain one is the SMALLEST by four orders of
 * magnitude — measured, `phase2-smoke/raw/s1-text.jsonl`: `input_tokens: 2` alongside
 * `cache_creation_input_tokens: 9188` and `cache_read_input_tokens: 15273`. An event carrying only
 * `inputTokens` would persist 2 for ~24.5k actually consumed, and every quota built on it would be
 * wrong by ~1000x. Total input for a turn is
 * `inputTokens + cacheCreationInputTokens + cacheReadInputTokens`.
 *
 * A provider that does not cache contributes 0 to both cache buckets — that is arithmetically
 * CORRECT, not "unknown": with no cache, all input lands in `inputTokens` and the sum still holds.
 *
 * Still no `costUsd` and no currency, on purpose — and note D4 REINFORCES that choice rather than
 * contradicting it. Pricing is a policy that changes without the run changing, and the four buckets
 * price differently (a cache read is an order of magnitude cheaper than a fresh input token).
 * Persisting the buckets is exactly what lets the reader apply a rate card it can revise later;
 * persisting a single `costUsd` would freeze today's rate card into the durable record. The FACT is
 * the token count; the price is applied by whoever reads it.
 */
export const AgentUsageEventSchema = z.domainEvent({
	inputTokens: z.number().int().nonnegative(),
	outputTokens: z.number().int().nonnegative(),
	cacheCreationInputTokens: z.number().int().nonnegative(),
	cacheReadInputTokens: z.number().int().nonnegative(),
})

export class AgentUsageEvent extends BaseDomainEvent<typeof AgentUsageEventSchema> {
	static override readonly name = 'agent.turn.usage' as const
	static readonly schema = AgentUsageEventSchema
}
