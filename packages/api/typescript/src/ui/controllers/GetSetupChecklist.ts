import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetSetupChecklist, GetSetupChecklistOutputSchema } from '../usecases/GetSetupChecklist'

export const GetSetupChecklistControllerInputSchema = z
	.object({ ctx: z.object({ ownerId: z.uuid() }) })
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' } }])
export const GetSetupChecklistControllerOutputSchema = GetSetupChecklistOutputSchema

@injectable()
export class GetSetupChecklistController extends Controller<
	typeof GetSetupChecklistControllerInputSchema,
	typeof GetSetupChecklistControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system]
	readonly path = '/ui/setup-checklist'
	readonly method = 'get' as const
	readonly description = 'Onboarding checklist — channel/workspace/thread done flags (cross-context)'
	readonly inputSchema = GetSetupChecklistControllerInputSchema
	readonly outputSchema = GetSetupChecklistControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private query: GetSetupChecklist) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId })
		return { status: HttpStatusCode.OK, data }
	}
}
