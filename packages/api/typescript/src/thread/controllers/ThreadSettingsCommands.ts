import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { BufferSize } from '@codedm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { ConfigureMentionGate } from '../usecases/ConfigureThreadSettings'
import { SetParticipantInvocation } from '../usecases/ConfigureThreadSettings'
import { ConfigureContextBuffer } from '../usecases/ConfigureThreadSettings'
import { MentionGateSchema } from '../entities/Thread'

const ThreadParam = z.object({ ctx: z.object({ ownerId: z.uuid() }), params: z.object({ threadId: z.uuid() }) })

// C12 ConfigureMentionGate
export const ConfigureMentionGateControllerInputSchema = ThreadParam.extend({ body: z.object({ mentionGate: MentionGateSchema }) })
export const ConfigureMentionGateControllerOutputSchema = z.void()

@injectable()
export class ConfigureMentionGateController extends Controller<
	typeof ConfigureMentionGateControllerInputSchema,
	typeof ConfigureMentionGateControllerOutputSchema
> {
	readonly path = '/threads/:threadId/mention-gate'
	readonly method = 'put' as const
	readonly description = 'Configure the mention gate (respond only when a @tag is written) (C12)'
	readonly inputSchema = ConfigureMentionGateControllerInputSchema
	readonly outputSchema = ConfigureMentionGateControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: ConfigureMentionGate) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId, mentionGate: request.body.mentionGate })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}

// C13 SetParticipantInvocation
export const SetParticipantInvocationControllerInputSchema = z.object({
	ctx: z.object({ ownerId: z.uuid() }),
	params: z.object({ threadId: z.uuid(), participantId: z.string().min(1) }),
	body: z.object({ canInvoke: z.boolean() }),
})
export const SetParticipantInvocationControllerOutputSchema = z.void()

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

// C14 ConfigureContextBuffer
export const ConfigureContextBufferControllerInputSchema = ThreadParam.extend({ body: z.object({ bufferSize: z.enum(BufferSize) }) })
export const ConfigureContextBufferControllerOutputSchema = z.void()

@injectable()
export class ConfigureContextBufferController extends Controller<
	typeof ConfigureContextBufferControllerInputSchema,
	typeof ConfigureContextBufferControllerOutputSchema
> {
	readonly path = '/threads/:threadId/buffer'
	readonly method = 'put' as const
	readonly description = 'Set the rolling context-buffer size {25,50,100,200} (C14)'
	readonly inputSchema = ConfigureContextBufferControllerInputSchema
	readonly outputSchema = ConfigureContextBufferControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: ConfigureContextBuffer) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId, bufferSize: request.body.bufferSize })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
