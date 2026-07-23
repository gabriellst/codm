import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codedm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { SteerThread, SteerThreadInputSchema, SteerThreadOutputSchema } from '../usecases/SteerThread'
import { ThreadParam } from '../schemas'

export const SteerThreadControllerInputSchema = ThreadParam.extend({ body: SteerThreadInputSchema.pick({ text: true }) }).example([
	{
		ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
		params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' },
		body: { text: 'focus on the failing tests first' },
	},
])
export const SteerThreadControllerOutputSchema = SteerThreadOutputSchema.example([{ entryId: '019e4d24-6524-7041-9e1c-8108180cddb0' }])

// C19
@injectable()
export class SteerThreadController extends Controller<typeof SteerThreadControllerInputSchema, typeof SteerThreadControllerOutputSchema> {
	readonly path = '/threads/:threadId/steer'
	readonly method = 'post' as const
	readonly description = 'Whisper a steer into the thread (agents-only; never sent to the channel) (C19)'
	readonly inputSchema = SteerThreadControllerInputSchema
	readonly outputSchema = SteerThreadControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: SteerThread) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId, text: request.body.text })
		return { status: HttpStatusCode.CREATED, data }
	}
}
