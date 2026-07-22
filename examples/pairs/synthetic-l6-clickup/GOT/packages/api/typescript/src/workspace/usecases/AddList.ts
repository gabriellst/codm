import { injectable } from 'tsyringe-neo'
import { Handler, BaseError, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { SpaceRepository } from '../repositories/SpaceRepository/SpaceRepository'
import type { ApplicationErrors } from '../errors'

export const AddListInputSchema = z.object({
	spaceId: z.uuid(),
	name: z.string().min(1),
})

export const AddListOutputSchema = z.object({
	listId: z.uuid(),
})

@injectable()
export class AddList extends Handler<typeof AddListInputSchema, typeof AddListOutputSchema> {
	readonly name = 'add_list' as const
	readonly inputSchema = AddListInputSchema
	readonly outputSchema = AddListOutputSchema

	constructor(private spaceRepository: SpaceRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const space = await this.spaceRepository.findById(input.spaceId, tx)
			if (!space) throw new BaseError<ApplicationErrors>('SPACE_NOT_FOUND')

			const listId = space.addList(input.name)
			await this.spaceRepository.save(space, tx)
			for (const e of space.pullDomainEvents()) {
				await this.domainEventRepository.save(e, tx)
			}

			return { listId }
		})
	}
}
