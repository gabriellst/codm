import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { IssueStatus, McpScope } from '@codedm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { DeclareIssueComplete, DeclareIssueCompleteInputSchema, DeclareIssueCompleteOutputSchema } from '../usecases/DeclareIssueComplete'

export const TransitionIssueStatusControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: DeclareIssueCompleteInputSchema.pick({ threadId: true, issueId: true }),
		body: DeclareIssueCompleteInputSchema.omit({ ownerId: true, threadId: true, issueId: true }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' },
			body: { status: IssueStatus.COMPLETED, summary: 'Fixed the webhook retry and added a regression test.', key: 'pix-payment-bug' },
		},
	])
export const TransitionIssueStatusControllerOutputSchema = DeclareIssueCompleteOutputSchema.example([
	{ issueId: '019e4d24-6524-7041-9e1c-8108180cddaf', status: IssueStatus.COMPLETED },
])

/**
 * Declare the lifecycle state of an issue. THIS is the operation the whole inversion turns on: after
 * it exists, "the issue is done" is something the agent SAYS, carried on a typed payload, instead of
 * something the daemon INFERS from a process having exited without error.
 *
 * Both identifiers sit in the PATH rather than the body. That is not cosmetic: the MCP router rejects
 * a tool call whose `issueId` / `threadId` / `ownerId` disagree with the run token's claims, and it
 * walks path, query AND body — but keeping identity in the path is what makes the disagreement
 * visible in the access log too, without parsing a JSON body to read it.
 */
@injectable()
export class TransitionIssueStatusController extends Controller<
	typeof TransitionIssueStatusControllerInputSchema,
	typeof TransitionIssueStatusControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.ISSUE_HANDLING]
	readonly path = '/threads/:threadId/issues/:issueId/status'
	readonly method = 'post' as const
	readonly description = 'Declare the lifecycle status of an issue (done / needs input)'
	readonly inputSchema = TransitionIssueStatusControllerInputSchema
	readonly outputSchema = TransitionIssueStatusControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: DeclareIssueComplete) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			issueId: request.params.issueId,
			...request.body,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
