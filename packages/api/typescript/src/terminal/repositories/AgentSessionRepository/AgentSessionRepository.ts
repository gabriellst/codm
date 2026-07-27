import { Repository } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { AgentSession } from '../../entities/AgentSession'

export abstract class AgentSessionRepository extends Repository<AgentSession> {
	abstract findById(id: string, tx?: Transaction): Promise<AgentSession | undefined>
	/** Fork B: session identity = issueId — the lookup the engine resume path uses. */
	abstract findByIssueId(issueId: string, tx?: Transaction): Promise<AgentSession | undefined>
}
