// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { Role as OwnerRole } from '../enums/Role'
import { OwnerMembershipRepository } from '../repositories/OwnerMembershipRepository'
import { OwnerMemberRemovedEvent } from '../events'
import type { ApplicationErrors, DomainErrors } from '../errors'

export const RemoveMemberInputSchema = z.object({
	ownerId: z.uuid(),
	// userIds of the members to remove under `ownerId`. Bulk: all removed in one
	// call, one OwnerMemberRemovedEvent emitted per member.
	ids: z.array(z.uuid()).min(1),
})

export const RemoveMemberOutputSchema = z.object({
	removed: z.boolean(),
})

@injectable()
export class RemoveMember extends Handler<typeof RemoveMemberInputSchema, typeof RemoveMemberOutputSchema> {
	readonly name = 'remove_member' as const
	readonly inputSchema = RemoveMemberInputSchema
	readonly outputSchema = RemoveMemberOutputSchema

	constructor(private readonly memberships: OwnerMembershipRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			// LAST_OWNER guard across the whole batch: track the live OWNER count
			// and block any removal that would leave the owner ownerless.
			let ownersRemaining = await this.memberships.countOwnersByOwnerId(input.ownerId, tx)

			for (const userId of input.ids) {
				const membership = await this.memberships.findByOwnerAndUser(input.ownerId, userId, tx)
				if (!membership) throw new BaseError<ApplicationErrors>('OWNER_MEMBERSHIP_NOT_FOUND')

				if (membership.role === OwnerRole.RESPONSIBLE) {
					if (ownersRemaining <= 1) throw new BaseError<DomainErrors>('CANNOT_REMOVE_LAST_OWNER')
					ownersRemaining -= 1
				}

				await this.memberships.removeByOwnerAndUser(input.ownerId, userId, tx)
				await this.domainEventRepository.save(
					new OwnerMemberRemovedEvent({
						entityId: input.ownerId,
						ownerId: userId,
						payload: {
							ownerId: input.ownerId,
							ownerMembershipId: membership.id.value,
							userId,
						},
					}),
					tx,
				)
			}

			return { removed: true }
		})
	}
}
