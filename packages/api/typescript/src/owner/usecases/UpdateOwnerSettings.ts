import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { OwnerRepository } from '../repositories/OwnerRepository'
import { OwnerSettingsUpdatedEvent } from '../events'
import type { ApplicationErrors } from '../errors'

export const UpdateOwnerSettingsInputSchema = z.object({
	ownerId: z.uuid(),
	name: z.string().trim().min(1).max(120).optional(),
	pictureUrl: z.url().nullable().optional(),
	timezone: z.string().min(1).optional(),
})

export const UpdateOwnerSettingsOutputSchema = z.void()

@injectable()
export class UpdateOwnerSettings extends Handler<typeof UpdateOwnerSettingsInputSchema, typeof UpdateOwnerSettingsOutputSchema> {
	readonly name = 'update_owner_settings' as const
	readonly inputSchema = UpdateOwnerSettingsInputSchema
	readonly outputSchema = UpdateOwnerSettingsOutputSchema

	constructor(private readonly ownerRepo: OwnerRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const owner = await this.ownerRepo.findById(input.ownerId, tx)
			if (!owner) throw new BaseError<ApplicationErrors>('OWNER_NOT_FOUND')

			owner.updateSettings({
				name: input.name,
				pictureUrl: input.pictureUrl ?? undefined,
				timezone: input.timezone,
			})

			await this.ownerRepo.save(owner, tx)
			await this.domainEventRepository.save(
				new OwnerSettingsUpdatedEvent({
					entityId: input.ownerId,
					ownerId: input.ownerId,
					payload: {
						owner: owner.toJSON(),
					},
				}),
				tx,
			)
		})
	}
}
