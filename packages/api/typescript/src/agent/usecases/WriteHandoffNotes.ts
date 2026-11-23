import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { AgentSessionRepository } from '../repositories/AgentSessionRepository'
import type { ApplicationErrors } from '../errors'

/** The longest handoff notes a session may write. */
export const HANDOFF_NOTES_MAX = 8000

export const WriteHandoffNotesInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	issueId: z.uuid(),
	notes: z.string().trim().min(1).max(HANDOFF_NOTES_MAX),
})
export const WriteHandoffNotesOutputSchema = z.void()

/**
 * The issue's session writes its HANDOFF NOTES (fase 4, item 6a) — asked to by the turn prompt once its context
 * passed `ISSUE_HANDOFF_ASK_AT` (`RunIssueTurn`). The notes land on the issue's session row; the first turn that
 * finds the session past `ISSUE_CONTEXT_BUDGET` opens a fresh CLI session seeded with them.
 *
 * `find → recordHandoff → save`: the notes REPLACE what the session wrote before (the latest is the freshest).
 * No session row ⇒ `NOT_FOUND` — the tool is only reachable from a running turn of the issue, and that turn's
 * session row exists from the turn before it (the ask only appears on a resumed session).
 */
@injectable()
export class WriteHandoffNotes extends Handler<typeof WriteHandoffNotesInputSchema, typeof WriteHandoffNotesOutputSchema> {
	readonly name = 'write_handoff_notes' as const
	readonly inputSchema = WriteHandoffNotesInputSchema
	readonly outputSchema = WriteHandoffNotesOutputSchema

	constructor(private readonly sessions: AgentSessionRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		await this.withTransaction(tx, async tx => {
			const session = await this.sessions.findByIssueId(input.issueId, tx)
			if (!session || session.ownerId !== input.ownerId || session.threadId !== input.threadId) {
				throw new BaseError<ApplicationErrors>('NOT_FOUND', `issue ${input.issueId} has no session to write handoff notes on`)
			}
			session.recordHandoff(input.notes)
			await this.sessions.save(session, tx)
		})
	}
}
