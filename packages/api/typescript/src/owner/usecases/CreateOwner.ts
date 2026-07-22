import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { OwnerKind } from '@template/contracts-typescript/wire/enums'
import { Owner } from '../entities/Owner'
import { OwnerRepository } from '../repositories/OwnerRepository'
import { OwnerCreatedEvent } from '../events'

export const CreateOwnerInputSchema = z.object({
	userId: z.uuid(),
	name: z.string().trim().min(1).max(120),
	// Tenant discriminator — placeholder default; a product picks the real kind.
	kind: z.enum(OwnerKind).default(OwnerKind.ORGANIZATION),
	timezone: z.string().min(1).optional(),
	pictureUrl: z.url().optional(),
})

export const CreateOwnerOutputSchema = z.object({
	ownerId: z.uuid(),
})

@injectable()
export class CreateOwner extends Handler<typeof CreateOwnerInputSchema, typeof CreateOwnerOutputSchema> {
	readonly name = 'create_owner' as const
	readonly inputSchema = CreateOwnerInputSchema
	readonly outputSchema = CreateOwnerOutputSchema

	constructor(private readonly ownerRepo: OwnerRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			// Entity validates name/timezone at construction; INVALID_TIMEZONE
			// propagates as a DomainError from the schema refinement. The creating
			// user becomes the single responsible user for the thin tenant (D2 —
			// multi-user tenancy is the exemplar under examples/).
			const owner = Owner.create({
				name: input.name,
				kind: input.kind,
				responsibleUserId: input.userId,
				timezone: input.timezone,
				pictureUrl: input.pictureUrl,
			})
			await this.ownerRepo.save(owner, tx)

			await this.domainEventRepository.save(
				new OwnerCreatedEvent({
					entityId: owner.id.value,
					ownerId: input.userId,
					payload: {
						ownerId: owner.id.value,
						name: owner.name,
					},
				}),
				tx,
			)

			return { ownerId: owner.id.value }
		})
	}
}
