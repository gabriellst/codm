import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { IssueStatus, McpScope } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetIssueStatus, GetIssueStatusOutputSchema } from '../usecases/GetIssueStatus'

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

export const GetIssueStatusControllerOutputSchema = GetIssueStatusOutputSchema.example([
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
 * that is unconfined in the strongest sense: such an identity deliberately carries no `issueId`
 * (§7.2.1), and `compareIdentity` reads the keys the IDENTITY carries — so there is nothing to compare
 * `issueId` against and every issue in the database is reachable by id. The model driving these runs
 * reads messages written by strangers in a group.
 *
 * Putting `threadId` in the path restores half of it for free (the comparison DOES confine `threadId`,
 * which the identity always carries), and the ownership check inside `GetIssueStatus` (the use case)
 * closes the other half: a caller that supplies its OWN threadId with SOMEBODY ELSE'S issueId passes
 * the comparison and must be stopped there.
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
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.orchestration]
	readonly path = '/threads/:threadId/issues/:issueId/status'
	readonly method = 'get' as const
	readonly description = 'Status of one issue of this thread'
	readonly inputSchema = GetIssueStatusControllerInputSchema
	readonly outputSchema = GetIssueStatusControllerOutputSchema
	override middlewares = [OperatorMiddleware]

	constructor(private readonly query: GetIssueStatus) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			issueId: request.params.issueId,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
