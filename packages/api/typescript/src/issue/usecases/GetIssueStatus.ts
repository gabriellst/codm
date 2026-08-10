import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleDatabaseDriver, Handler, z, BaseError } from '@codm/core-typescript'
import { issues } from '@codm/contracts/db'
import { IssueStatus } from '@codm/contracts-typescript/wire/enums'
import type { ApplicationErrors } from '../errors'

export const GetIssueStatusInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid(), issueId: z.uuid() })
export const GetIssueStatusOutputSchema = z.object({
	issueId: z.uuid(),
	key: z.string(),
	title: z.string(),
	status: z.enum(IssueStatus),
	archived: z.boolean(),
})

/**
 * Read — IssueStatus (T2f). "How is that issue doing?" — the read the orchestrator makes mid-conversation.
 *
 * Moved from `GetIssueStatusController` (import-direction#R1 — controllers never touch repositories,
 * they validate and call a use case). Reads straight off `issues` via `DrizzleDatabaseDriver.db`, the same shape
 * as its sibling query use cases in this context (`GetIssueDetail`, `GetSessionIssues`): a lean status
 * read has no aggregate invariant to enforce, so there is nothing `IssueRepository.findById`'s full
 * entity rehydration buys here that a flat row read does not.
 *
 * ### THREAD OWNERSHIP
 * The two failures are deliberately indistinguishable: a caller asking about an issue of another
 * thread learns exactly what a caller asking about a nonexistent one learns, which is that it is not
 * theirs. Answering "exists, but not yours" would turn this read into an oracle for issue ids — see
 * `GetIssueStatus.test.ts` (AC-T2.3) for why an `orchestration` identity needs this check at all.
 */
@injectable()
export class GetIssueStatus extends Handler<typeof GetIssueStatusInputSchema, typeof GetIssueStatusOutputSchema> {
	readonly name = 'get_issue_status' as const
	readonly inputSchema = GetIssueStatusInputSchema
	readonly outputSchema = GetIssueStatusOutputSchema

	constructor(private readonly driver: DrizzleDatabaseDriver) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const [issue] = await this.driver.db.select().from(issues).where(eq(issues.id, input.issueId)).limit(1)

		if (!issue || issue.threadId !== input.threadId) {
			throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', 'no such issue on this thread')
		}

		return {
			issueId: issue.id,
			key: issue.key,
			title: issue.title,
			status: issue.status as IssueStatus,
			archived: issue.archived,
		}
	}
}
