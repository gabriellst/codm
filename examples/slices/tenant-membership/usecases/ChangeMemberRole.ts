// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { Role as OwnerRole } from '../enums/Role'
import { OwnerMembershipRepository } from '../repositories/OwnerMembershipRepository'
import { OwnerMemberRoleChangedEvent } from '../events'
import type { ApplicationErrors, DomainErrors } from '../errors'

export const ChangeMemberRoleInputSchema = z.object({
	ownerId: z.uuid(),
	// userIds of the members to re-role under `ownerId`. Bulk: `newRole` applied
	// to all of them, one OwnerMemberRoleChangedEvent emitted per actual change.
	ids: z.array(z.uuid()).min(1),
	newRole: z.enum(OwnerRole),
})

export const ChangeMemberRoleOutputSchema = z.void()

@injectable()
export class ChangeMemberRole extends Handler<typeof ChangeMemberRoleInputSchema, typeof ChangeMemberRoleOutputSchema> {
	readonly name = 'change_member_role' as const
	readonly inputSchema = ChangeMemberRoleInputSchema
	readonly outputSchema = ChangeMemberRoleOutputSchema

	constructor(private readonly memberships: OwnerMembershipRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			// LAST_OWNER guard across the whole batch: track the live OWNER count
			// and block any demotion that would leave the owner ownerless.
			let ownersRemaining = await this.memberships.countOwnersByOwnerId(input.ownerId, tx)

			for (const userId of input.ids) {
				const membership = await this.memberships.findByOwnerAndUser(input.ownerId, userId, tx)
				if (!membership) throw new BaseError<ApplicationErrors>('OWNER_MEMBERSHIP_NOT_FOUND')

				// No-op: same role → no save, no event.
				if (membership.role === input.newRole) continue

				if (membership.role === OwnerRole.RESPONSIBLE && input.newRole !== OwnerRole.RESPONSIBLE) {
					if (ownersRemaining <= 1) throw new BaseError<DomainErrors>('CANNOT_DEMOTE_LAST_OWNER')
					ownersRemaining -= 1
				}

				const oldRole = membership.role
				membership.changeRole(input.newRole)

				await this.memberships.save(membership, tx)
				await this.domainEventRepository.save(
					new OwnerMemberRoleChangedEvent({
						entityId: input.ownerId,
						ownerId: userId,
						payload: {
							ownerId: input.ownerId,
							ownerMembershipId: membership.id.value,
							userId,
							oldRole,
							newRole: input.newRole,
						},
					}),
					tx,
				)
			}
		})
	}
}
