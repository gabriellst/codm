import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { StopResolution } from '@codedm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { ResolveStop, ResolveStopInputSchema, ResolveStopOutputSchema } from '../usecases/ResolveStop'

export const ResolveStopControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: ResolveStopInputSchema.pick({ stopId: true }),
		body: ResolveStopInputSchema.pick({ resolution: true }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { stopId: '019e4d24-6524-7041-9e1c-8108180cddb1' },
			body: { resolution: StopResolution.RETRY },
		},
	])
export const ResolveStopControllerOutputSchema = ResolveStopOutputSchema

// C25
@injectable()
export class ResolveStopController extends Controller<typeof ResolveStopControllerInputSchema, typeof ResolveStopControllerOutputSchema> {
	readonly path = '/stops/:stopId/resolve'
	readonly method = 'post' as const
	readonly description = 'Resolve a stop — retry / review&send / take over / approve / deny (C25)'
	readonly inputSchema = ResolveStopControllerInputSchema
	readonly outputSchema = ResolveStopControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: ResolveStop) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, stopId: request.params.stopId, resolution: request.body.resolution })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
