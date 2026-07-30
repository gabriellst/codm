import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import {
	SetParticipantInvocation,
	SetParticipantInvocationInputSchema,
	SetParticipantInvocationOutputSchema,
} from '../usecases/ConfigureThreadSettings'

export const SetParticipantInvocationControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: SetParticipantInvocationInputSchema.pick({ threadId: true, participantId: true }),
		body: SetParticipantInvocationInputSchema.pick({ canInvoke: true }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', participantId: '5511999999999' },
			body: { canInvoke: true },
		},
	])
export const SetParticipantInvocationControllerOutputSchema = SetParticipantInvocationOutputSchema

// C13
@injectable()
export class SetParticipantInvocationController extends Controller<
	typeof SetParticipantInvocationControllerInputSchema,
	typeof SetParticipantInvocationControllerOutputSchema
> {
	readonly path = '/threads/:threadId/participants/:participantId'
	readonly method = 'put' as const
	readonly description = 'Toggle whether a participant may invoke agents (C13)'
	readonly inputSchema = SetParticipantInvocationControllerInputSchema
	readonly outputSchema = SetParticipantInvocationControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: SetParticipantInvocation) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			participantId: request.params.participantId,
			canInvoke: request.body.canInvoke,
		})
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
