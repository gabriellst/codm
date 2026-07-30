import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { ResumeThread, ResumeThreadOutputSchema } from '../usecases/ResumeThread'
import { ThreadParam } from '../schemas'

export const ResumeThreadControllerInputSchema = ThreadParam.example([
	{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' } },
])
export const ResumeThreadControllerOutputSchema = ResumeThreadOutputSchema

// C11
@injectable()
export class ResumeThreadController extends Controller<
	typeof ResumeThreadControllerInputSchema,
	typeof ResumeThreadControllerOutputSchema
> {
	readonly path = '/threads/:threadId/resume'
	readonly method = 'post' as const
	readonly description = 'Resume agent activity on a thread (C11)'
	readonly inputSchema = ResumeThreadControllerInputSchema
	readonly outputSchema = ResumeThreadControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: ResumeThread) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
