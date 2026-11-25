import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { IssueDoorCtxSchema, IssueDoorParamsSchema } from '../types/IssueDoor'
import { RequestFeedback, RequestFeedbackInputSchema, RequestFeedbackOutputSchema } from '../usecases/RequestFeedback'

export const RequestFeedbackControllerInputSchema = z
	.object({
		ctx: IssueDoorCtxSchema,
		params: IssueDoorParamsSchema,
		body: RequestFeedbackInputSchema.omit({ ownerId: true, threadId: true, issueId: true, actingIssueId: true }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' },
			body: {
				text: 'Preview of the new landing page',
				mainArtifactId: '019e4d24-6524-7041-9e1c-8108180cdda2',
				artifactIds: ['019e4d24-6524-7041-9e1c-8108180cdda2', '019e4d24-6524-7041-9e1c-8108180cdda3'],
			},
		},
	])
export const RequestFeedbackControllerOutputSchema = RequestFeedbackOutputSchema

/**
 * The issue shows the group a preview to look at (fase 3, item 1) — a FEEDBACK signal: the main artifact
 * reaches the group, the others the panel. NOT a stop: it does not hold the issue.
 */
@injectable()
export class RequestFeedbackController extends Controller<
	typeof RequestFeedbackControllerInputSchema,
	typeof RequestFeedbackControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.ISSUE_HANDLING]
	readonly path = '/threads/:threadId/issues/:issueId/feedback'
	readonly method = 'post' as const
	readonly description =
		'Show the group a preview to look at: one main artifact this task recorded goes with the text, and every other one you cite goes as its own print. Does not hold the task. The text: plain words, at most 3 short sentences.'
	readonly inputSchema = RequestFeedbackControllerInputSchema
	readonly outputSchema = RequestFeedbackControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: RequestFeedback) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			issueId: request.params.issueId,
			actingIssueId: request.ctx.agentIdentity?.issueId,
			...request.body,
		})
		return { status: HttpStatusCode.ACCEPTED }
	}
}
