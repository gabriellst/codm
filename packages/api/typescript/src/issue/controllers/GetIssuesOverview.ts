import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { McpScope } from '@codedm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetIssuesOverview, GetIssuesOverviewOutputSchema } from '../usecases/GetIssuesOverview'

export const GetIssuesOverviewControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		// z.stringToBoolean() (z.stringbool) — NEVER z.coerce.boolean(), which turns the query string
		// 'false' into true (any non-empty string is truthy), silently flipping an explicit opt-out.
		query: z.object({ includeArchived: z.stringToBoolean().default(false) }),
	})
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, query: { includeArchived: false } }])
export const GetIssuesOverviewControllerOutputSchema = GetIssuesOverviewOutputSchema

// T04
@injectable()
export class GetIssuesOverviewController extends Controller<
	typeof GetIssuesOverviewControllerInputSchema,
	typeof GetIssuesOverviewControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system]
	readonly path = '/issues'
	readonly method = 'get' as const
	readonly description = 'All issues across every thread, grouped by status (T04)'
	readonly inputSchema = GetIssuesOverviewControllerInputSchema
	readonly outputSchema = GetIssuesOverviewControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private query: GetIssuesOverview) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId, includeArchived: request.query.includeArchived })
		return { status: HttpStatusCode.OK, data }
	}
}
