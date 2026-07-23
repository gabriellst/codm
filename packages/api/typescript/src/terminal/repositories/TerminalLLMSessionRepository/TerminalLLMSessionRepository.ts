import { Repository } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { TerminalLLMSession } from '../../entities/TerminalLLMSession'

export abstract class TerminalLLMSessionRepository extends Repository<TerminalLLMSession> {
	abstract findById(id: string, tx?: Transaction): Promise<TerminalLLMSession | undefined>
	/** Fork B: session identity = issueId — the lookup the engine resume path uses. */
	abstract findByIssueId(issueId: string, tx?: Transaction): Promise<TerminalLLMSession | undefined>
	/**
	 * Recency-ordered list used by the startup prewarm sweep to pick the top-N sessions to
	 * pre-warm. Order: `last_turn_at DESC`, `LIMIT ?`.
	 */
	abstract listRecentForPrewarm(limit: number, tx?: Transaction): Promise<TerminalLLMSession[]>
}
