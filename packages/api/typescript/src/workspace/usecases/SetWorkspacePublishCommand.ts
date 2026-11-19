import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { PublishCommandSchema } from '@shared/objects'
import { WorkspaceRepository } from '../repositories/WorkspaceRepository'
import type { ApplicationErrors } from '../errors'

export const SetWorkspacePublishCommandInputSchema = z.object({
	ownerId: z.uuid(),
	workspaceId: z.uuid(),
	/** The command as an argument list, or `null` to remove it. */
	command: PublishCommandSchema.nullable(),
})
export const SetWorkspacePublishCommandOutputSchema = z.void()

/**
 * Declare (or remove) the workspace's PUBLISH COMMAND (fase 4, item 6c). The console's door only: the command can
 * carry a credential in an argument, so no model writes or reads it, and no fact carries it (nothing is raised).
 */
@injectable()
export class SetWorkspacePublishCommand extends Handler<
	typeof SetWorkspacePublishCommandInputSchema,
	typeof SetWorkspacePublishCommandOutputSchema
> {
	readonly name = 'set_workspace_publish_command' as const
	readonly inputSchema = SetWorkspacePublishCommandInputSchema
	readonly outputSchema = SetWorkspacePublishCommandOutputSchema

	constructor(private readonly workspaces: WorkspaceRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		await this.withTransaction(tx, async tx => {
			const workspace = await this.workspaces.findById(input.workspaceId, tx)
			if (!workspace || workspace.ownerId !== input.ownerId) {
				throw new BaseError<ApplicationErrors>('WORKSPACE_NOT_FOUND', `no workspace ${input.workspaceId}`)
			}
			workspace.setPublishCommand(input.command)
			await this.workspaces.save(workspace, tx)
		})
	}
}
