import { injectable } from 'tsyringe-neo'
import { BaseError, Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { IssueStatus } from '@codedm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { IssueRepository } from '../repositories/IssueRepository'
import type { IssueApplicationErrors } from '../errors'

export const GetIssueStatusControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: z.object({ threadId: z.uuid(), issueId: z.uuid() }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' },
		},
	])

export const GetIssueStatusControllerOutputSchema = z
	.object({
		issueId: z.uuid(),
		key: z.string(),
		title: z.string(),
		status: z.enum(IssueStatus),
		archived: z.boolean(),
	})
	.example([
		{
			issueId: '019e4d24-6524-7041-9e1c-8108180cddaf',
			key: 'dark-mode-toggle',
			title: 'põe um toggle de dark mode',
			status: IssueStatus.WORKING,
			archived: false,
		},
	])

/**
 * `GetIssueStatus` — "how is that issue doing?", the read the orchestrator makes mid-conversation.
 *
 * ### Why a NEW door instead of the `system` scope's `GetIssueDetail`
 * `GetIssueDetail` sits at `/issues/:issueId` and takes NO threadId. Under an `orchestration` token
 * that is unconfined in the strongest sense: such a token deliberately carries no `issueId` claim
 * (§7.2.1), and `assertIdentityMatchesClaims` SKIPS any key whose claim is absent rather than
 * rejecting it — so the generic walker has nothing to compare and every issue in the database is
 * reachable by id. The model driving these runs reads messages written by strangers in a group.
 *
 * Putting `threadId` in the path restores half of it for free (the walker DOES confine `threadId`,
 * which the claims always carry), and the ownership check below closes the other half: a caller that
 * supplies its OWN threadId with SOMEBODY ELSE'S issueId passes the walker and must be stopped here.
 * That pairing — a claim-confined path segment plus an explicit ownership assertion — is the shape
 * §7.2.1 requires of every `orchestration` tool that accepts an `issueId`.
 *
 * It is also why this is a lean status read and not a drill-down: the console's `GetIssueDetail`
 * returns terminal logs and routed messages, which is a great deal of somebody's conversation to hand
 * to a model that only asked whether the work is done.
 */
@injectable()
export class GetIssueStatusController extends Controller<
	typeof GetIssueStatusControllerInputSchema,
	typeof GetIssueStatusControllerOutputSchema
> {
	readonly path = '/threads/:threadId/issues/:issueId/status'
	readonly method = 'get' as const
	readonly description = 'Status of one issue of this thread'
	readonly inputSchema = GetIssueStatusControllerInputSchema
	readonly outputSchema = GetIssueStatusControllerOutputSchema
	override middlewares = [OperatorMiddleware]

	constructor(private readonly issues: IssueRepository) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const issue = await this.issues.findById(request.params.issueId)

		// T2f — THREAD OWNERSHIP. The two failures are deliberately indistinguishable: a caller asking
		// about an issue of another thread learns exactly what a caller asking about a nonexistent one
		// learns, which is that it is not theirs. Answering "exists, but not yours" would turn this read
		// into an oracle for issue ids.
		if (!issue || issue.threadId !== request.params.threadId) {
			throw new BaseError<IssueApplicationErrors>('ISSUE_NOT_FOUND', 'no such issue on this thread')
		}

		return {
			status: HttpStatusCode.OK,
			data: {
				issueId: issue.id.value,
				key: issue.key,
				title: issue.title,
				status: issue.status,
				archived: issue.archived,
			},
		}
	}
}
