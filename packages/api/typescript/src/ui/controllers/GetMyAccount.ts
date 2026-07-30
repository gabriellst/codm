import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetMyAccount, GetMyAccountOutputSchema } from '../usecases/GetMyAccount'

export const GetMyAccountControllerInputSchema = z
	.object({
		ctx: z.object({
			user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
			session: z.object({ ownerId: z.uuid().nullable() }),
		}),
	})
	.example([
		{
			ctx: {
				user: { id: 'operator', name: 'Operator', email: 'operator@codedm.local' },
				session: { ownerId: '00000000-0000-4000-8000-000000000001' },
			},
		},
	])

export const GetMyAccountControllerOutputSchema = GetMyAccountOutputSchema

@injectable()
export class GetMyAccountController extends Controller<
	typeof GetMyAccountControllerInputSchema,
	typeof GetMyAccountControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system]
	readonly path = '/ui/account'
	readonly method = 'get' as const
	readonly description = 'Account settings read'
	readonly inputSchema = GetMyAccountControllerInputSchema
	readonly outputSchema = GetMyAccountControllerOutputSchema

	// No RequireOwner — account settings are user-scoped, not owner-scoped.
	override middlewares = [OperatorMiddleware]

	constructor(private query: GetMyAccount) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ userId: request.ctx.user.id })
		return { status: HttpStatusCode.OK, data }
	}
}
