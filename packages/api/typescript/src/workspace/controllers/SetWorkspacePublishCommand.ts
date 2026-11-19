import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { PublishCommandSchema } from '@shared/objects'
import { SetWorkspacePublishCommand } from '../usecases/SetWorkspacePublishCommand'

export const SetWorkspacePublishCommandControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: z.object({ workspaceId: z.uuid() }),
		/** The command as an argument list, or `null` to remove it (a "pode publicar" then wakes the session). */
		body: z.object({ command: PublishCommandSchema.nullable() }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { workspaceId: '019e4d24-6524-7041-9e1c-8108180cddae' },
			body: { command: { argv: ['bun', 'run', 'deploy'] } },
		},
	])
export const SetWorkspacePublishCommandControllerOutputSchema = z.void()

/**
 * Declare (or remove) the workspace's PUBLISH COMMAND (fase 4, item 6c): what the codm runs, without waking
 * the task's session, when an answer authorizes publishing.
 *
 * NO `mcpScopes`, on purpose (spec, revisão 2): absent means not exposed. The command can carry a credential
 * in an argument, so it is the console's to write and read — never a tool a model calls, and never a field of
 * an MCP-exposed DTO (`ListWorkspaces` does not carry it).
 *
 * Removing it (`command: null`) puts the workspace back to the old behaviour: a "pode publicar" wakes the session.
 */
@injectable()
export class SetWorkspacePublishCommandController extends Controller<
	typeof SetWorkspacePublishCommandControllerInputSchema,
	typeof SetWorkspacePublishCommandControllerOutputSchema
> {
	readonly path = '/workspaces/:workspaceId/publish-command'
	readonly method = 'put' as const
	readonly description = "Declare or remove the workspace's publish command (an argument list, never a shell line)"
	readonly inputSchema = SetWorkspacePublishCommandControllerInputSchema
	readonly outputSchema = SetWorkspacePublishCommandControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]

	constructor(private readonly setPublishCommand: SetWorkspacePublishCommand) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		await this.setPublishCommand.execute({
			ownerId: request.ctx.ownerId,
			workspaceId: request.params.workspaceId,
			command: request.body.command,
		})
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
