import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { AskEffect, McpScope } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { IssueDoorCtxSchema, IssueDoorParamsSchema } from '../types/IssueDoor'
import { AskDecision, AskDecisionInputSchema, AskDecisionOutputSchema } from '../usecases/AskDecision'

export const AskDecisionControllerInputSchema = z
	.object({
		ctx: IssueDoorCtxSchema,
		params: IssueDoorParamsSchema,
		body: AskDecisionInputSchema.omit({ ownerId: true, threadId: true, issueId: true, actingIssueId: true }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' },
			body: {
				question: 'The preview is ready. Publish it?',
				options: [
					{ id: 'yes', label: 'Publish' },
					{ id: 'no', label: 'Not yet' },
				],
				effects: [AskEffect.PUBLISH],
			},
		},
	])
export const AskDecisionControllerOutputSchema = AskDecisionOutputSchema

/**
 * The issue asks the group to DECIDE (fase 3, item 1) — a stop `DECISION_REQUESTED` that holds the issue
 * until someone answers; with a declared effect only someone who may release can answer it.
 */
@injectable()
export class AskDecisionController extends Controller<typeof AskDecisionControllerInputSchema, typeof AskDecisionControllerOutputSchema> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.ISSUE_HANDLING]
	readonly path = '/threads/:threadId/issues/:issueId/decisions'
	readonly method = 'post' as const
	readonly description =
		'Ask the group for a decision you cannot go on without (2–6 options; declare every effect the answer authorizes). Holds the task until someone answers.'
	readonly inputSchema = AskDecisionControllerInputSchema
	readonly outputSchema = AskDecisionControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: AskDecision) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			issueId: request.params.issueId,
			actingIssueId: request.ctx.agentIdentity?.issueId,
			...request.body,
		})
		return { status: HttpStatusCode.CREATED, data }
	}
}
