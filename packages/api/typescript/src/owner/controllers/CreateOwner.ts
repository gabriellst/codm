import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope, OwnerKind } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { CreateOwner, CreateOwnerInputSchema } from '../usecases/CreateOwner'

export const CreateOwnerControllerInputSchema = z
	.object({
		ctx: z.object({
			user: z.object({ id: z.string() }),
		}),
		// userId is supplied from ctx.user.id — omitted from the HTTP surface.
		body: CreateOwnerInputSchema.omit({ userId: true }),
	})
	.example([
		{
			ctx: { user: { id: 'user-123' } },
			body: {
				name: 'Acme Org',
				kind: OwnerKind.ORGANIZATION,
				timezone: 'America/Sao_Paulo',
				pictureUrl: 'https://cdn.example.com/logo.png',
			},
		},
	])

export const CreateOwnerControllerOutputSchema = z
	.object({
		ownerId: z.uuid(),
	})
	.example([{ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' }])

@injectable()
export class CreateOwnerController extends Controller<typeof CreateOwnerControllerInputSchema, typeof CreateOwnerControllerOutputSchema> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system]
	readonly path = '/owners'
	readonly method = 'post' as const
	readonly description = 'Create a new owner (tenant); the creator becomes the responsible user'
	readonly inputSchema = CreateOwnerControllerInputSchema
	readonly outputSchema = CreateOwnerControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private createOwner: CreateOwner) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.createOwner.execute({
			userId: request.ctx.user.id,
			name: request.body.name,
			kind: request.body.kind,
			timezone: request.body.timezone,
			pictureUrl: request.body.pictureUrl,
		})
		return { status: HttpStatusCode.CREATED, data }
	}
}
