import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { OwnerRepository } from '../repositories/OwnerRepository'
import { OwnerEnabledEvent } from '../events/OwnerEnabledEvent'
import type { ApplicationErrors } from '../errors'

export const EnableOwnerInputSchema = z.object({
	ownerId: z.uuid(),
	enabledByUserId: z.uuid(),
})

export const EnableOwnerOutputSchema = z.object({
	ownerId: z.uuid(),
	isDisabled: z.boolean(),
})

@injectable()
export class EnableOwner extends Handler<typeof EnableOwnerInputSchema, typeof EnableOwnerOutputSchema> {
	readonly name = 'enable_owner' as const
	readonly inputSchema = EnableOwnerInputSchema
	readonly outputSchema = EnableOwnerOutputSchema

	constructor(private readonly owners: OwnerRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const owner = await this.owners.findById(input.ownerId, tx)
		if (!owner) throw new BaseError<ApplicationErrors>('OWNER_NOT_FOUND')

		// Entity throws OWNER_NOT_DISABLED.
		owner.enable()

		return this.withTransaction(tx, async tx => {
			await this.owners.save(owner, tx)
			await this.domainEventRepository.save(
				new OwnerEnabledEvent({
					entityId: owner.id.value,
					ownerId: input.enabledByUserId,
					payload: {
						ownerId: owner.id.value,
						enabledAt: new Date().toISOString(),
					},
				}),
				tx,
			)
			return { ownerId: owner.id.value, isDisabled: false }
		})
	}
}
