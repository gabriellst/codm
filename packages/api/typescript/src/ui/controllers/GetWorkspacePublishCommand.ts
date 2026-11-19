import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { PublishCommandSchema } from '@shared/objects'
import { GetWorkspacePublishCommand } from '../usecases/GetWorkspacePublishCommand'

export const GetWorkspacePublishCommandControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: z.object({ workspaceId: z.uuid() }),
	})
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, params: { workspaceId: '019e4d24-6524-7041-9e1c-8108180cddae' } }])

/** The declared command, or `null` when the workspace has none. */
export const GetWorkspacePublishCommandControllerOutputSchema = z
	.object({ command: PublishCommandSchema.nullable() })
	.example([{ command: { argv: ['bun', 'run', 'deploy'] } }])

/**
 * Read the workspace's PUBLISH COMMAND (fase 4, item 6c) for the console's form.
 *
 * NO `mcpScopes`, on purpose (spec, revisão 2): the command can carry a credential in an argument, so no model
 * ever reads it — the dispatcher reads the column directly when it runs it (S11).
 */
@injectable()
export class GetWorkspacePublishCommandController extends Controller<
	typeof GetWorkspacePublishCommandControllerInputSchema,
	typeof GetWorkspacePublishCommandControllerOutputSchema
> {
	readonly path = '/workspaces/:workspaceId/publish-command'
	readonly method = 'get' as const
	readonly description = "The workspace's declared publish command, or null"
	readonly inputSchema = GetWorkspacePublishCommandControllerInputSchema
	readonly outputSchema = GetWorkspacePublishCommandControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]

	constructor(private readonly getPublishCommand: GetWorkspacePublishCommand) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.getPublishCommand.execute({ ownerId: request.ctx.ownerId, workspaceId: request.params.workspaceId })
		return { status: HttpStatusCode.OK, data }
	}
}
