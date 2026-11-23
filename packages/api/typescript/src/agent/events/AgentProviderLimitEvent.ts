import { BaseDomainEvent, z } from '@codm/core-typescript'
import { AgentModelId, ProviderKind, ProviderLimitWindow, UsageRole } from '@codm/contracts-typescript/wire/enums'
import { ProviderLimitStatus } from '../enums/ProviderLimitStatus'

export const AgentProviderLimitEventSchema = z.domainEvent({
	provider: z.enum(ProviderKind),
	/** The model the refused (or warned) run asked for — kept to measure whether limits are per model. */
	model: z.enum(AgentModelId).optional(),
	/** Whose run it was — the same vocabulary as the usage fact. */
	role: z.enum(UsageRole),
	window: z.enum(ProviderLimitWindow),
	/** `REJECTED` or `WARNING` — an `ALLOWED` verdict is never recorded as this fact (its boundary rides the usage). */
	status: z.enum(ProviderLimitStatus),
	/** When the window resets, when the provider said. ISO instant. */
	resetsAt: z.iso.datetime().optional(),
})

/**
 * OBSERVED FACT: the provider REFUSED a run for its usage limit, or WARNED that a window is close (fase 4, item 2).
 *
 * The fact the learned ceiling is cut from (S2: a refusal cuts the window's ceiling to what was spent, a warning
 * by a declared factor), and what makes the hours paused by limits measurable from now on — before this, a refusal
 * lived only in the dispatcher's pause and a log line. Recorded by the turn that observed it (`RunIssueTurn`,
 * `RunOrchestratorTurn`), in the same transaction as its usage fact, from the structured `rate_limit_info` the
 * runner read — never from the error's prose.
 */
export class AgentProviderLimitEvent extends BaseDomainEvent<typeof AgentProviderLimitEventSchema> {
	static override readonly name = 'agent.provider.limit_observed' as const
	static readonly schema = AgentProviderLimitEventSchema
}
