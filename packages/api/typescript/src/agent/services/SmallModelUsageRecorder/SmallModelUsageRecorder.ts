import type { AgentModelId, ProviderKind, UsageRole } from '@codm/contracts-typescript/wire/enums'
import type { AgentRunResult } from '../../types/AgentRuntimeEvent'

/**
 * The roles whose runs are ONE stateless call to the provider's small model, recorded through this port — the triage
 * (fase 2) and the supervisor (fase 5). The issue and orchestrator turns record their own spend inside their turn.
 */
export type SmallModelRole = UsageRole.TRIAGE | UsageRole.SUPERVISOR

/** One finished small-model run, with whose it was and who ran it. */
export interface SmallModelSpend {
	ownerId: string
	/**
	 * What the run was about — the fact's `entity_id`: the conversation for a triage (the message's thread), the task
	 * for the supervisor (the suspect issue).
	 */
	entityId: string
	/** WHO spent it — the budget sums by role, never inferring it from the entity (`usage-role.test.ts`). */
	role: SmallModelRole
	provider: ProviderKind
	/** The small model the run ran on. */
	model: AgentModelId
	result: AgentRunResult
}

/**
 * The agent's port for what a small-model run spent (fase 4, S1 for the triage; fase 5 adds the supervisor) — called
 * from inside the service that ran it (`ModelInboundTriage`, `ModelIssueSupervisor`), never by a caller that only
 * asked for a verdict. Its own unit of work: those runs happen outside any transaction.
 */
export abstract class SmallModelUsageRecorder {
	abstract record(spend: SmallModelSpend): Promise<void>
}
