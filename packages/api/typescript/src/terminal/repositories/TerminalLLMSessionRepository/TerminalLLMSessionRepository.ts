import { Repository } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { TerminalLLMSession } from '../../entities/TerminalLLMSession'

export abstract class TerminalLLMSessionRepository extends Repository<TerminalLLMSession> {
	abstract findById(id: string, tx?: Transaction): Promise<TerminalLLMSession | undefined>
	/** Fork B: session identity = issueId — the lookup the engine resume path uses. */
	abstract findByIssueId(issueId: string, tx?: Transaction): Promise<TerminalLLMSession | undefined>
}
