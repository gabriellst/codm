import { Repository } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { AgentSession } from '../../entities/AgentSession'

export abstract class AgentSessionRepository extends Repository<AgentSession> {
	abstract findById(id: string, tx?: Transaction): Promise<AgentSession | undefined>
	/** Fork B: session identity = issueId — the lookup the engine resume path uses. */
	abstract findByIssueId(issueId: string, tx?: Transaction): Promise<AgentSession | undefined>

	/**
	 * The ORCHESTRATOR's session for a thread — the row where `issue_id IS NULL` (§6.1).
	 *
	 * A separate finder rather than an optional argument on `findByIssueId`, because the two lookups
	 * hit two different partial uniques and mean two different things. A single `findBy({issueId,
	 * threadId})` would also make "pass neither" representable, which matches no index at all.
	 */
	abstract findOrchestratorByThreadId(threadId: string, tx?: Transaction): Promise<AgentSession | undefined>
}
