import { injectable } from 'tsyringe-neo'
import { Handler, BaseError, z } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { WorkspaceRepository } from '../repositories/WorkspaceRepository/WorkspaceRepository'
import { SpaceRepository } from '../repositories/SpaceRepository/SpaceRepository'
import { Space } from '../entities'
import type { ApplicationErrors } from '../errors'

export const CreateSpaceInputSchema = z.object({
	workspaceId: z.uuid(),
	name: z.string().min(1),
})

export const CreateSpaceOutputSchema = z.object({
	spaceId: z.uuid(),
})

@injectable()
export class CreateSpace extends Handler<
	typeof CreateSpaceInputSchema,
	typeof CreateSpaceOutputSchema
> {
	readonly name = 'create_space' as const
	readonly inputSchema = CreateSpaceInputSchema
	readonly outputSchema = CreateSpaceOutputSchema

	constructor(
		private workspaceRepository: WorkspaceRepository,
		private spaceRepository: SpaceRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const workspace = await this.workspaceRepository.findById(input.workspaceId, tx)
			if (!workspace) throw new BaseError<ApplicationErrors>('WORKSPACE_NOT_FOUND')

			const space = Space.create({ workspaceId: input.workspaceId, name: input.name })
			await this.spaceRepository.save(space, tx)
			for (const e of space.pullDomainEvents()) {
				await this.domainEventRepository.save(e, tx)
			}

			return { spaceId: space.id.value }
		})
	}
}
