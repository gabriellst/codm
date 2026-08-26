import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { WorkspaceRepository } from '../repositories/WorkspaceRepository'
import { WorkspaceUsageQuery } from '../services/WorkspaceUsageQuery'
import { WorkspaceRemovedEvent } from '../events/WorkspaceRemovedEvent'
import type { ApplicationErrors } from '../errors'

export const RemoveWorkspaceInputSchema = z.object({
	ownerId: z.uuid(),
	workspaceId: z.uuid(),
})

export const RemoveWorkspaceOutputSchema = z.void()

/**
 * C06 RemoveWorkspace — refuses (`WORKSPACE_IN_USE`) while any issue is WORKING on this workspace;
 * otherwise deletes it and raises `workspace.removed` (bridged to `integration.workspace.removed`).
 */
@injectable()
export class RemoveWorkspace extends Handler<typeof RemoveWorkspaceInputSchema, typeof RemoveWorkspaceOutputSchema> {
	readonly name = 'remove_workspace' as const
	readonly inputSchema = RemoveWorkspaceInputSchema
	readonly outputSchema = RemoveWorkspaceOutputSchema

	constructor(
		private readonly workspaces: WorkspaceRepository,
		private readonly usage: WorkspaceUsageQuery,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const workspace = await this.workspaces.findById(input.workspaceId)
		if (!workspace || workspace.ownerId !== input.ownerId) {
			throw new BaseError<ApplicationErrors>('WORKSPACE_NOT_FOUND', `no workspace ${input.workspaceId}`)
		}

		if (await this.usage.hasWorkingIssues(input.workspaceId)) {
			throw new BaseError<ApplicationErrors>('WORKSPACE_IN_USE', 'an issue is WORKING on this workspace')
		}

		await this.withTransaction(tx, async tx => {
			await this.workspaces.delete(input.workspaceId, tx)
			await this.domainEventRepository.save(
				new WorkspaceRemovedEvent({
					entityId: workspace.id.value,
					ownerId: input.ownerId,
					payload: { workspaceId: workspace.id.value, path: workspace.path },
				}),
				tx,
			)
		})
	}
}
