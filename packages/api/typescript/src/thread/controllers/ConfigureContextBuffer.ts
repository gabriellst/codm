import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codm/core-typescript'
import { BufferSize, McpScope } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import {
	ConfigureContextBuffer,
	ConfigureContextBufferInputSchema,
	ConfigureContextBufferOutputSchema,
} from '../usecases/ConfigureThreadSettings'
import { ThreadParam } from '../schemas'

export const ConfigureContextBufferControllerInputSchema = ThreadParam.extend({
	body: ConfigureContextBufferInputSchema.pick({ bufferSize: true }),
}).example([
	{
		ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
		params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' },
		body: { bufferSize: BufferSize._50 },
	},
])
export const ConfigureContextBufferControllerOutputSchema = ConfigureContextBufferOutputSchema

// C14
@injectable()
export class ConfigureContextBufferController extends Controller<
	typeof ConfigureContextBufferControllerInputSchema,
	typeof ConfigureContextBufferControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system]
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
