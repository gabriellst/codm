import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codedm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { PauseThread, PauseThreadOutputSchema } from '../usecases/PauseThread'
import { ThreadParam } from '../schemas'

export const PauseThreadControllerInputSchema = ThreadParam.example([
	{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' } },
])
export const PauseThreadControllerOutputSchema = PauseThreadOutputSchema

// C10
@injectable()
export class PauseThreadController extends Controller<typeof PauseThreadControllerInputSchema, typeof PauseThreadControllerOutputSchema> {
	readonly path = '/threads/:threadId/pause'
	readonly method = 'post' as const
	readonly description = 'Pause all agent activity on a thread (C10)'
	readonly inputSchema = PauseThreadControllerInputSchema
	readonly outputSchema = PauseThreadControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: PauseThread) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
