import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codedm/core-typescript'
import { McpScope } from '@codedm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetThreadSettings, GetThreadSettingsOutputSchema } from '../usecases/GetThreadSettings'
import { ThreadParam } from '../schemas'

export const GetThreadSettingsControllerInputSchema = ThreadParam.example([
	{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' } },
])
export const GetThreadSettingsControllerOutputSchema = GetThreadSettingsOutputSchema

// T10
@injectable()
export class GetThreadSettingsController extends Controller<
	typeof GetThreadSettingsControllerInputSchema,
	typeof GetThreadSettingsControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system]
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
