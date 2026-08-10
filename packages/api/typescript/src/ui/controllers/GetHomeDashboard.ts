import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { OnboardingMiddleware } from '../middlewares'
import { GetHomeDashboard, GetHomeDashboardOutputSchema } from '../usecases/GetHomeDashboard'

export const GetHomeDashboardControllerInputSchema = z
	.object({ ctx: z.object({ ownerId: z.uuid() }) })
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' } }])
export const GetHomeDashboardControllerOutputSchema = GetHomeDashboardOutputSchema

@injectable()
export class GetHomeDashboardController extends Controller<
	typeof GetHomeDashboardControllerInputSchema,
	typeof GetHomeDashboardControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system]
	readonly path = '/ui/home'
	readonly method = 'get' as const
	readonly description = 'Home dashboard — agents running, needs-you, active sessions, today metrics, channels (T03)'
	readonly inputSchema = GetHomeDashboardControllerInputSchema
	readonly outputSchema = GetHomeDashboardControllerOutputSchema

	override middlewares = [OperatorMiddleware, OnboardingMiddleware]

	constructor(private query: GetHomeDashboard) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId })
		return { status: HttpStatusCode.OK, data }
	}
}
