import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { McpScope } from '@codedm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { SetActiveOwner, SetActiveOwnerOutputSchema } from '../usecases/SetActiveOwner'

export const SetActiveOwnerControllerInputSchema = z
	.object({
		params: z.object({
			ownerId: z.uuid(),
		}),
		ctx: z.object({
			user: z.object({ id: z.string() }),
			session: z.object({ id: z.string() }),
		}),
	})
	.example([
		{
			params: { ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' },
			ctx: {
				user: { id: 'user-001' },
				session: { id: 'sess-001' },
			},
		},
	])

export const SetActiveOwnerControllerOutputSchema = SetActiveOwnerOutputSchema.example([
	{ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' },
])

@injectable()
export class SetActiveOwnerController extends Controller<
	typeof SetActiveOwnerControllerInputSchema,
	typeof SetActiveOwnerControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system]
	readonly path = '/owners/:ownerId/activate'
	readonly method = 'post' as const
	readonly description = 'Switch the authenticated session to the given owner (SPEC-07 SetActiveOwner)'
	readonly inputSchema = SetActiveOwnerControllerInputSchema
	readonly outputSchema = SetActiveOwnerControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private readonly setActiveOwner: SetActiveOwner) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const { ownerId } = request.params
		const { id: sessionId } = request.ctx.session
		const { id: userId } = request.ctx.user

		const data = await this.setActiveOwner.execute({ ownerId, userId, sessionId })

		return { status: HttpStatusCode.OK, data }
	}
}
