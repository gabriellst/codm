import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetAttachThreadWizard, GetAttachThreadWizardOutputSchema } from '../usecases/GetAttachThreadWizard'

export const GetAttachThreadWizardControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		query: z.object({
			// Case-insensitive contact-name search over the gateway remote directory.
			search: z.string().optional(),
			// Opaque keyset cursor from a previous page's `contactsNextCursor`.
			cursor: z.string().optional(),
		}),
	})
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, query: { search: 'ada' } }])
export const GetAttachThreadWizardControllerOutputSchema = GetAttachThreadWizardOutputSchema

@injectable()
export class GetAttachThreadWizardController extends Controller<
	typeof GetAttachThreadWizardControllerInputSchema,
	typeof GetAttachThreadWizardControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system]
	readonly path = '/ui/attach-thread-wizard'
	readonly method = 'get' as const
	readonly description = 'Attach-thread wizard — contacts, workspaces, providers + attached/no-channel flags (T15)'
	readonly inputSchema = GetAttachThreadWizardControllerInputSchema
	readonly outputSchema = GetAttachThreadWizardControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private query: GetAttachThreadWizard) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({
			ownerId: request.ctx.ownerId,
			search: request.query.search,
			cursor: request.query.cursor,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
