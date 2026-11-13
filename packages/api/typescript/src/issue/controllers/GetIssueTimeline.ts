import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codm/core-typescript'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { GetIssueTimeline, GetIssueTimelineOutputSchema } from '../usecases/GetIssueTimeline'
import { IssueParam } from '../schemas'

export const GetIssueTimelineControllerInputSchema = IssueParam.example([
	{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, params: { issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' } },
])
export const GetIssueTimelineControllerOutputSchema = GetIssueTimelineOutputSchema

/** An issue's timeline, oldest first (fase 1, item 1). Console-only for now — no MCP scope. */
@injectable()
export class GetIssueTimelineController extends Controller<
	typeof GetIssueTimelineControllerInputSchema,
	typeof GetIssueTimelineControllerOutputSchema
> {
	readonly path = '/issues/:issueId/timeline'
	readonly method = 'get' as const
	readonly description = "An issue's timeline: created, turns, messages, steers, artifacts, stops, completion"
	readonly inputSchema = GetIssueTimelineControllerInputSchema
	readonly outputSchema = GetIssueTimelineControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private query: GetIssueTimeline) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId, issueId: request.params.issueId })
		return { status: HttpStatusCode.OK, data }
	}
}
