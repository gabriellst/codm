import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { GetPublishRunOutput, GetPublishRunOutputOutputSchema } from '../usecases/GetPublishRunOutput'

export const GetPublishRunOutputControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: z.object({ issueId: z.uuid(), timelineItemId: z.uuid() }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { issueId: '019e4d24-6524-7041-9e1c-8108180cddaf', timelineItemId: '019e4d24-6524-7041-9e1c-8108180cddb1' },
		},
	])
export const GetPublishRunOutputControllerOutputSchema = GetPublishRunOutputOutputSchema

/**
 * What one publish run printed (fase 4, item 6c) — the console's "output of this publish" on the `PUBLISH_RAN` item.
 *
 * NO `mcpScopes`, on purpose: a command's output may print a credential, so no model reads it through a tool (the
 * session that has to fix a failed run is told the tail by its own recado, never the orchestrator).
 */
@injectable()
export class GetPublishRunOutputController extends Controller<
	typeof GetPublishRunOutputControllerInputSchema,
	typeof GetPublishRunOutputControllerOutputSchema
> {
	readonly path = '/issues/:issueId/publish-runs/:timelineItemId/output'
	readonly method = 'get' as const
	readonly description = 'What one publish run of the issue printed (console only)'
	readonly inputSchema = GetPublishRunOutputControllerInputSchema
	readonly outputSchema = GetPublishRunOutputControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]

	constructor(private readonly query: GetPublishRunOutput) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({
			ownerId: request.ctx.ownerId,
			issueId: request.params.issueId,
			timelineItemId: request.params.timelineItemId,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
