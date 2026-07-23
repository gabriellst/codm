import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { IssueRepository } from '../repositories/IssueRepository'
import { TerminalLineRepository } from '../repositories/TerminalLineRepository'
import type { ApplicationErrors } from '../errors'

export const SteerIssueInputSchema = z.object({ ownerId: z.uuid(), issueId: z.uuid(), text: z.string().trim().min(1) })
export const SteerIssueOutputSchema = z.object({ entryId: z.uuid() })

/** C22 SteerIssue — appends the whisper to this issue's terminal log (`steer: …`); rejected on an
 *  archived issue (`ISSUE_ARCHIVED`). */
@injectable()
export class SteerIssue extends Handler<typeof SteerIssueInputSchema, typeof SteerIssueOutputSchema> {
	readonly name = 'steer_issue' as const
	readonly inputSchema = SteerIssueInputSchema
	readonly outputSchema = SteerIssueOutputSchema

	constructor(
		private readonly issues: IssueRepository,
		private readonly terminalLines: TerminalLineRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const issue = await this.issues.findById(input.issueId)
		if (!issue || issue.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)
		issue.assertNotArchived()

		return this.withTransaction(tx, async tx => {
			// The REAL appended row id — never a freshly minted phantom uuid.
			const row = await this.terminalLines.append(issue.id.value, issue.ownerId, `steer: ${input.text}`, tx)
			return { entryId: row.id }
		})
	}
}
