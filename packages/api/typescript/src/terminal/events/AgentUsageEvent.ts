import { BaseDomainEvent, z } from '@codedm/core-typescript'

/**
 * OBSERVED FACT: token accounting for one agent turn (GOAL-agent-abstraction §4.3).
 *
 * Folded from the `usage` frames of the stream-json transport. It exists as a persisted domain event
 * — rather than a metric emitted and forgotten — because cost-based quota needs a durable, queryable
 * base: "how much did this owner's runs cost this month" has to be a `SELECT` over `shared_events`,
 * not a counter that resets when the daemon restarts.
 *
 * No `costUsd` and no currency here on purpose: pricing is a policy that changes without the run
 * changing. The FACT is the token count; the price is applied by whoever reads it.
 */
export const AgentUsageEventSchema = z.domainEvent({
	inputTokens: z.number().int().nonnegative(),
	outputTokens: z.number().int().nonnegative(),
})

export class AgentUsageEvent extends BaseDomainEvent<typeof AgentUsageEventSchema> {
	static override readonly name = 'agent.turn.usage' as const
	static readonly schema = AgentUsageEventSchema
}
