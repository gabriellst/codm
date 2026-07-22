import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetSessionChat, GetSessionChatOutputSchema } from '../usecases/GetSessionChat'
import { GetThreadSettings, GetThreadSettingsOutputSchema } from '../usecases/GetThreadSettings'

const ThreadParam = z.object({ ctx: z.object({ ownerId: z.uuid() }), params: z.object({ threadId: z.uuid() }) })

// T09 SessionChat
export const GetSessionChatControllerInputSchema = ThreadParam
export const GetSessionChatControllerOutputSchema = GetSessionChatOutputSchema

@injectable()
export class GetSessionChatController extends Controller<typeof GetSessionChatControllerInputSchema, typeof GetSessionChatControllerOutputSchema> {
	readonly path = '/threads/:threadId/chat'
	readonly method = 'get' as const
	readonly description = 'Full thread conversation + control-plane state + active stops (T09)'
	readonly inputSchema = GetSessionChatControllerInputSchema
	readonly outputSchema = GetSessionChatControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private query: GetSessionChat) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId })
		return { status: HttpStatusCode.OK, data }
	}
}

// T10 ThreadSettings
export const GetThreadSettingsControllerInputSchema = ThreadParam
export const GetThreadSettingsControllerOutputSchema = GetThreadSettingsOutputSchema

@injectable()
export class GetThreadSettingsController extends Controller<
	typeof GetThreadSettingsControllerInputSchema,
	typeof GetThreadSettingsControllerOutputSchema
> {
	readonly path = '/threads/:threadId/settings'
	readonly method = 'get' as const
	readonly description = 'Per-thread behavior: mention gate, participants + invocation, buffer size (T10)'
	readonly inputSchema = GetThreadSettingsControllerInputSchema
	readonly outputSchema = GetThreadSettingsControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private query: GetThreadSettings) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId })
		return { status: HttpStatusCode.OK, data }
	}
}
