import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetUserInfo, GetUserInfoOutputSchema } from '../usecases/GetUserInfo'

export const GetUserInfoControllerInputSchema = z
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

export const GetUserInfoControllerOutputSchema = GetUserInfoOutputSchema

@injectable()
export class GetUserInfoController extends Controller<typeof GetUserInfoControllerInputSchema, typeof GetUserInfoControllerOutputSchema> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system]
	readonly path = '/ui/user-info'
	readonly method = 'get' as const
	readonly description = 'Header context — user identity, all member owners (role), active owner, and profile alerts'
	readonly inputSchema = GetUserInfoControllerInputSchema
	readonly outputSchema = GetUserInfoControllerOutputSchema

	// Header loads before an owner is selected → no RequireOwner.
	override middlewares = [OperatorMiddleware]

	constructor(private query: GetUserInfo) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({
			user: { id: request.ctx.user.id, name: request.ctx.user.name, email: request.ctx.user.email },
			ownerId: request.ctx.session.ownerId,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
