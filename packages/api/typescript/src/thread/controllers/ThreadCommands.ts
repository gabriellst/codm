import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { PauseThread } from '../usecases/PauseThread'
import { ResumeThread } from '../usecases/ResumeThread'
import { SteerThread } from '../usecases/SteerThread'
import { SendDirectMessage } from '../usecases/SendDirectMessage'

const ThreadParam = z.object({ ctx: z.object({ ownerId: z.uuid() }), params: z.object({ threadId: z.uuid() }) })

// C10 PauseThread
export const PauseThreadControllerInputSchema = ThreadParam
export const PauseThreadControllerOutputSchema = z.void()

@injectable()
export class PauseThreadController extends Controller<typeof PauseThreadControllerInputSchema, typeof PauseThreadControllerOutputSchema> {
	readonly path = '/threads/:threadId/pause'
	readonly method = 'post' as const
	readonly description = 'Pause all agent activity on a thread (C10)'
	readonly inputSchema = PauseThreadControllerInputSchema
	readonly outputSchema = PauseThreadControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private pauseThread: PauseThread) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.pauseThread.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}

// C11 ResumeThread
export const ResumeThreadControllerInputSchema = ThreadParam
export const ResumeThreadControllerOutputSchema = z.void()

@injectable()
export class ResumeThreadController extends Controller<typeof ResumeThreadControllerInputSchema, typeof ResumeThreadControllerOutputSchema> {
	readonly path = '/threads/:threadId/resume'
	readonly method = 'post' as const
	readonly description = 'Resume agent activity on a thread (C11)'
	readonly inputSchema = ResumeThreadControllerInputSchema
	readonly outputSchema = ResumeThreadControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private resumeThread: ResumeThread) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.resumeThread.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}

// C19 SteerThread (whisper)
export const SteerThreadControllerInputSchema = ThreadParam.extend({ body: z.object({ text: z.string().trim().min(1) }) })
export const SteerThreadControllerOutputSchema = z.object({ entryId: z.uuid() })

@injectable()
export class SteerThreadController extends Controller<typeof SteerThreadControllerInputSchema, typeof SteerThreadControllerOutputSchema> {
	readonly path = '/threads/:threadId/steer'
	readonly method = 'post' as const
	readonly description = 'Whisper a steer into the thread (agents-only; never sent to the channel) (C19)'
	readonly inputSchema = SteerThreadControllerInputSchema
	readonly outputSchema = SteerThreadControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private steerThread: SteerThread) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.steerThread.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId, text: request.body.text })
		return { status: HttpStatusCode.CREATED, data }
	}
}

// C20 SendDirectMessage
export const SendDirectMessageControllerInputSchema = ThreadParam.extend({ body: z.object({ text: z.string().trim().min(1) }) })
export const SendDirectMessageControllerOutputSchema = z.object({ entryId: z.uuid() })

@injectable()
export class SendDirectMessageController extends Controller<
	typeof SendDirectMessageControllerInputSchema,
	typeof SendDirectMessageControllerOutputSchema
> {
	readonly path = '/threads/:threadId/direct'
	readonly method = 'post' as const
	readonly description = 'Send a direct message as the operator (only while paused) (C20)'
	readonly inputSchema = SendDirectMessageControllerInputSchema
	readonly outputSchema = SendDirectMessageControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private sendDirect: SendDirectMessage) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.sendDirect.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId, text: request.body.text })
		return { status: HttpStatusCode.CREATED, data }
	}
}
