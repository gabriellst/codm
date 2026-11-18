import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { IssueDoorCtxSchema, IssueDoorParamsSchema } from '../types/IssueDoor'
import { ReportProgress, ReportProgressInputSchema, ReportProgressOutputSchema } from '../usecases/ReportProgress'

export const ReportProgressControllerInputSchema = z
	.object({
		ctx: IssueDoorCtxSchema,
		params: IssueDoorParamsSchema,
		body: ReportProgressInputSchema.omit({ ownerId: true, threadId: true, issueId: true, actingIssueId: true }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' },
			body: { text: 'Built the page and ran the checks; deploying the preview next.' },
		},
	])
export const ReportProgressControllerOutputSchema = ReportProgressOutputSchema

/**
 * The issue records what it did (fase 3, item 1) — a PROGRESS signal: the task's timeline and panel, and
 * the group only when it chose the EVERYTHING mode.
 */
@injectable()
export class ReportProgressController extends Controller<
	typeof ReportProgressControllerInputSchema,
	typeof ReportProgressControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.ISSUE_HANDLING]
	readonly path = '/threads/:threadId/issues/:issueId/progress'
	readonly method = 'post' as const
	readonly description = "Record what you did on this task — it goes to the task's timeline, not to the group."
	readonly inputSchema = ReportProgressControllerInputSchema
	readonly outputSchema = ReportProgressControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: ReportProgress) {
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
