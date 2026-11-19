import { injectable } from 'tsyringe-neo'
import { BaseError, Controller, z } from '@codm/core-typescript'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { PublishCommandSchema } from '@shared/objects'
import type { ApplicationErrors } from '../errors'

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
 * DECLARED, NOT YET WIRED (slice S0b): the use case (`Workspace.setPublishCommand`) lands in S11. Until then it
 * refuses with `THROUGHPUT_NOT_READY` — never a 204 that would tell the console the command was saved.
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
	async handle(_request: this['input']): Promise<this['output']> {
		throw new BaseError<ApplicationErrors>('THROUGHPUT_NOT_READY', 'SetWorkspacePublishCommand lands in fase 4, slice S11')
	}
}
