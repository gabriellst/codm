import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { McpScope } from '@codedm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { DisableOwner, DisableOwnerInputSchema, DisableOwnerOutputSchema } from '../usecases/DisableOwner'

export const DisableOwnerControllerInputSchema = z
	.object({
		ctx: z.object({
			user: z.object({ id: z.string() }),
			session: z.object({ ownerId: z.uuid() }),
		}),
		// ownerId is supplied from ctx.session.ownerId, disabledByUserId from ctx.user.id — omitted from the HTTP surface.
		body: DisableOwnerInputSchema.omit({ ownerId: true, disabledByUserId: true }),
	})
	.example([
		{
			ctx: { user: { id: 'user-123' }, session: { ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' } },
			body: { reason: 'closing for maintenance' },
		},
	])

export const DisableOwnerControllerOutputSchema = DisableOwnerOutputSchema.example([
	{ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae', isDisabled: true },
])

@injectable()
export class DisableOwnerController extends Controller<
	typeof DisableOwnerControllerInputSchema,
	typeof DisableOwnerControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system]
	readonly path = '/owners/disable'
	readonly method = 'post' as const
	readonly description = 'Disable a owner (C19 DisableOwner; OWNER only)'
	readonly inputSchema = DisableOwnerControllerInputSchema
	readonly outputSchema = DisableOwnerControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private disableOwner: DisableOwner) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.disableOwner.execute({
			ownerId: request.ctx.session.ownerId,
			disabledByUserId: request.ctx.user.id,
			reason: request.body.reason,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
