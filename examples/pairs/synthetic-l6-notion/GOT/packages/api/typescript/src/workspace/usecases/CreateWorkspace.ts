import { injectable } from 'tsyringe-neo'
import { Handler, z, type Transaction } from '@codedm/core-typescript'

import { Workspace } from '../entities/Workspace'
import { WorkspaceRepository } from '../repositories/WorkspaceRepository'
import { WorkspaceCreatedEvent } from '../events/WorkspaceCreatedEvent'

export const CreateWorkspaceInputSchema = z.object({
	ownerId: z.uuid(),
	name: z.string().min(1),
})

export const CreateWorkspaceOutputSchema = z.object({
	workspaceId: z.uuid(),
})

@injectable()
export class CreateWorkspace extends Handler<typeof CreateWorkspaceInputSchema, typeof CreateWorkspaceOutputSchema> {
	readonly name = 'create_workspace' as const
	readonly inputSchema = CreateWorkspaceInputSchema
	readonly outputSchema = CreateWorkspaceOutputSchema

	constructor(private readonly workspaces: WorkspaceRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const ws = Workspace.create({ name: input.name, ownerId: input.ownerId })
			await this.workspaces.save(ws, tx)
			await this.domainEventRepository.save(
				new WorkspaceCreatedEvent({
					entityId: ws.id.value,
					ownerId: input.ownerId,
					payload: { workspace: ws.toJSON() },
				}),
				tx,
			)
			return { workspaceId: ws.id.value }
		})
	}
}
