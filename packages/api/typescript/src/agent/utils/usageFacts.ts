import type { AgentModelId, ProviderKind, UsageRole } from '@codm/contracts-typescript/wire/enums'
import { ProviderLimitStatus } from '../enums/ProviderLimitStatus'
import { AgentProviderLimitEvent } from '../events/AgentProviderLimitEvent'
import { AgentUsageEvent } from '../events/AgentUsageEvent'
import type { AgentTurnUsage } from '../types/AgentFrame'
import type { LimitWindowBoundary, ObservedProviderLimit } from '../types/AgentRuntimeEvent'

/**
 * Which provider verdicts are recorded as `agent.provider.limit_observed` (fase 4, item 2) — total over the enum. A
 * refusal and a warning are what the learned ceiling is cut from; an ALLOWED line only contributes its window's
 * boundary, which rides the usage fact instead.
 */
const RECORDS_LIMIT: Readonly<Record<ProviderLimitStatus, boolean>> = {
	[ProviderLimitStatus.REJECTED]: true,
	[ProviderLimitStatus.WARNING]: true,
	[ProviderLimitStatus.ALLOWED]: false,
}

/** What one finished run tells about its cost, stamped with WHOSE run it was. */
export interface RunSpend {
	/** The fact's entity: the issue for an issue turn, the conversation for the orchestrator and the triage. */
	entityId: string
	ownerId: string
	role: UsageRole
	provider: ProviderKind
	model: AgentModelId
	usage: AgentTurnUsage | undefined
	providerLimits: readonly ObservedProviderLimit[]
	limitWindows: readonly LimitWindowBoundary[]
}

/**
 * The facts a finished run leaves about its cost (fase 4, S1): `agent.turn.usage` with its role, provider, model and
 * window boundaries — when the provider reported usage — and one `agent.provider.limit_observed` per window the
 * provider refused or warned about. One builder for the three producers (issue turn, orchestrator turn, triage), so they cannot
 * stamp the same run two ways; each saves what it returns in its own transaction.
 */
export function usageFactsOf(spend: RunSpend): (AgentUsageEvent | AgentProviderLimitEvent)[] {
	const facts: (AgentUsageEvent | AgentProviderLimitEvent)[] = []
	const envelope = { entityId: spend.entityId, ownerId: spend.ownerId }
	if (spend.usage) {
		facts.push(
			new AgentUsageEvent({
				...envelope,
				payload: {
					...spend.usage,
					role: spend.role,
					provider: spend.provider,
					model: spend.model,
					...(spend.limitWindows.length > 0 && {
						windows: spend.limitWindows.map(boundary => ({ window: boundary.window, resetsAt: boundary.resetsAt.toISOString() })),
					}),
				},
			}),
		)
	}
	for (const limit of spend.providerLimits.filter(observed => RECORDS_LIMIT[observed.status])) {
		facts.push(
			new AgentProviderLimitEvent({
				...envelope,
				payload: {
					provider: spend.provider,
					model: spend.model,
					role: spend.role,
					window: limit.window,
					status: limit.status,
					...(limit.resetsAt && { resetsAt: limit.resetsAt.toISOString() }),
				},
			}),
		)
	}
	return facts
}
