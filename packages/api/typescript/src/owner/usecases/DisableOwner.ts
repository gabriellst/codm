import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { OwnerRepository } from '../repositories/OwnerRepository'
import { OwnerDisabledEvent } from '../events'
import type { ApplicationErrors } from '../errors'

export const DisableOwnerInputSchema = z.object({
	ownerId: z.uuid(),
	disabledByUserId: z.uuid(),
	reason: z.string().trim().min(1).max(500).optional(),
})

export const DisableOwnerOutputSchema = z.object({
	ownerId: z.uuid(),
	isDisabled: z.boolean(),
})

@injectable()
export class DisableOwner extends Handler<typeof DisableOwnerInputSchema, typeof DisableOwnerOutputSchema> {
	readonly name = 'disable_owner' as const
	readonly inputSchema = DisableOwnerInputSchema
	readonly outputSchema = DisableOwnerOutputSchema

	constructor(private readonly owners: OwnerRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const owner = await this.owners.findById(input.ownerId, tx)
		if (!owner) throw new BaseError<ApplicationErrors>('OWNER_NOT_FOUND')

		// Entity throws OWNER_ALREADY_DISABLED.
		owner.disable(input.reason)

		return this.withTransaction(tx, async tx => {
			await this.owners.save(owner, tx)
			await this.domainEventRepository.save(
				new OwnerDisabledEvent({
					entityId: owner.id.value,
					ownerId: input.disabledByUserId,
					payload: {
						ownerId: owner.id.value,
						disabledAt: new Date().toISOString(),
						disabledReason: input.reason,
					},
				}),
				tx,
			)
			return { ownerId: owner.id.value, isDisabled: true }
		})
	}
}
