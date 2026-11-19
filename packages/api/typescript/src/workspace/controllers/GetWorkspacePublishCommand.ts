import { injectable } from 'tsyringe-neo'
import { BaseError, Controller, z } from '@codm/core-typescript'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { PublishCommandSchema } from '@shared/objects'
import type { ApplicationErrors } from '../errors'

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
 *
 * DECLARED, NOT YET WIRED (slice S0b, CTRL-C05 mock mode): the route answers the declared example so the form
 * builds against a real shape; the read lands in S11.
 */
@injectable()
export class GetWorkspacePublishCommandController extends Controller<
	typeof GetWorkspacePublishCommandControllerInputSchema,
	typeof GetWorkspacePublishCommandControllerOutputSchema
> {
	override readonly mockController = true
	readonly path = '/workspaces/:workspaceId/publish-command'
	readonly method = 'get' as const
	readonly description = "The workspace's declared publish command, or null"
	readonly inputSchema = GetWorkspacePublishCommandControllerInputSchema
	readonly outputSchema = GetWorkspacePublishCommandControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	async handle(_request: this['input']): Promise<this['output']> {
		// Unreachable over HTTP while `mockController` is on; a direct `execute` must not invent a command.
		throw new BaseError<ApplicationErrors>('THROUGHPUT_NOT_READY', 'GetWorkspacePublishCommand lands in fase 4, slice S11')
	}
}
