import { BaseDomainEvent, z } from '@codm/core-typescript'
import { ProviderLimitWindow } from '@codm/contracts-typescript/wire/enums'

const QuotaHoldPayload = {
	/** The window that denied the admission (on a release, the one that had). */
	window: z.enum(ProviderLimitWindow),
	/** Spend in that window, its learned ceiling and the orchestrator's free floor — the budget's cost unit. */
	spent: z.number().nonnegative(),
	ceiling: z.number().nonnegative(),
	reserve: z.number().nonnegative(),
	/** `false` in observation mode: nothing was held — this is the "would have held". */
	enforced: z.boolean(),
}

export const AgentQuotaHeldEventSchema = z.domainEvent(QuotaHoldPayload)
export const AgentQuotaReleasedEventSchema = z.domainEvent(QuotaHoldPayload)

/**
 * OBSERVED FACT: the quota budget stopped admitting task turns (fase 4, item 2) — written on the TRANSITION
 * "admitted → not admitted", never per loop. With the budget enforced the task lane is held from here; in observation
 * (`enforced: false`) nothing is held and this is the measurable "would have held". Both count for the upward probe
 * (revisão 2): a ceiling that started low still rises during the observation week.
 */
export class AgentQuotaHeldEvent extends BaseDomainEvent<typeof AgentQuotaHeldEventSchema> {
	static override readonly name = 'agent.quota.held' as const
	static readonly schema = AgentQuotaHeldEventSchema
}

/** OBSERVED FACT: the budget admits task turns again — the end of the span `agent.quota.held` opened. */
export class AgentQuotaReleasedEvent extends BaseDomainEvent<typeof AgentQuotaReleasedEventSchema> {
	static override readonly name = 'agent.quota.released' as const
	static readonly schema = AgentQuotaReleasedEventSchema
}
