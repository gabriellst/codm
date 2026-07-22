import { injectable } from 'tsyringe-neo'
import { Handler, BaseError, z } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { WorkspaceRepository } from '../repositories/WorkspaceRepository/WorkspaceRepository'
import { Workspace } from '../entities'
import type { ApplicationErrors } from '../errors'

export const CreateWorkspaceInputSchema = z.object({
	storeId: z.uuid(),
	name: z.string().min(1),
})

export const CreateWorkspaceOutputSchema = z.object({
	workspaceId: z.uuid(),
})

@injectable()
export class CreateWorkspace extends Handler<
	typeof CreateWorkspaceInputSchema,
	typeof CreateWorkspaceOutputSchema
> {
	readonly name = 'create_workspace' as const
	readonly inputSchema = CreateWorkspaceInputSchema
	readonly outputSchema = CreateWorkspaceOutputSchema

	constructor(private workspaceRepository: WorkspaceRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const existing = await this.workspaceRepository.findById(input.storeId, tx)
			if (existing) return { workspaceId: existing.id.value }

			const ws = Workspace.create({ id: input.storeId, name: input.name })
			await this.workspaceRepository.save(ws, tx)
			for (const e of ws.pullDomainEvents()) {
				await this.domainEventRepository.save(e, tx)
			}

			return { workspaceId: ws.id.value }
		})
	}
}
