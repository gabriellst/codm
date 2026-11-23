import type { AgentModelId, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import type { AgentRunResult } from '../../types/AgentRuntimeEvent'

/** One finished triage run, with whose it was. */
export interface TriageSpend {
	ownerId: string
	threadId: string
	provider: ProviderKind
	/** The small model the triage ran on. */
	model: AgentModelId
	result: AgentRunResult
}

/**
 * The agent's port for what a TRIAGE run spent (fase 4, S1) — called from inside `ModelInboundTriage`, never by
 * the `thread` context that asked for the verdict (it does not write the agent's facts). Its own unit of work: the
 * triage runs outside any transaction.
 */
export abstract class TriageUsageRecorder {
	abstract record(spend: TriageSpend): Promise<void>
}
