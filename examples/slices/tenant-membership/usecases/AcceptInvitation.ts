// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { Role as OwnerRole } from '../enums/Role'
import { OwnerMembership } from '../entities/OwnerMembership'
import { OwnerMembershipRepository } from '../repositories/OwnerMembershipRepository'
import { OwnerInvitationRepository } from '../repositories/OwnerInvitationRepository'
import { InvitationTokenService } from '../services/InvitationTokenService'
import { OwnerMemberAddedEvent } from '../events'
import type { ApplicationErrors } from '../errors'

export const AcceptInvitationInputSchema = z.object({
	// Fails closed when no session userId (controller layer enforces upstream;
	// use case still validates as non-empty).
	userId: z.uuid(),
	invitationToken: z.string().min(1),
})

export const AcceptInvitationOutputSchema = z.object({
	ownerId: z.uuid(),
	role: z.enum(OwnerRole),
})

@injectable()
export class AcceptInvitation extends Handler<typeof AcceptInvitationInputSchema, typeof AcceptInvitationOutputSchema> {
	readonly name = 'accept_invitation' as const
	readonly inputSchema = AcceptInvitationInputSchema
	readonly outputSchema = AcceptInvitationOutputSchema

	constructor(
		private readonly invitations: OwnerInvitationRepository,
		private readonly memberships: OwnerMembershipRepository,
		private readonly tokens: InvitationTokenService,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// Envelope decode — throws INVALID_INVITATION_TOKEN / INVITATION_EXPIRED.
		const payload = this.tokens.verify(input.invitationToken)

		const invitation = await this.invitations.findById(payload.sid, tx)
		// A non-existent sid is treated as INVALID — the envelope was signed
		// but no row matches (data drift / dev-env reset).
		if (!invitation) throw new BaseError<ApplicationErrors>('INVALID_INVITATION_TOKEN')

		// Entity-layer hash check + acceptedAt/expiresAt guards. Throws
		// INVALID_INVITATION_TOKEN / INVITATION_EXPIRED / INVITATION_ALREADY_USED.
		invitation.accept({ userId: input.userId, plainToken: payload.plainToken })

		return this.withTransaction(tx, async tx => {
			await this.invitations.save(invitation, tx)

			const membership = OwnerMembership.forInvitee({
				ownerId: invitation.ownerId.value,
				userId: input.userId,
				role: invitation.role as OwnerRole,
			})
			await this.memberships.save(membership, tx)

			await this.domainEventRepository.save(
				new OwnerMemberAddedEvent({
					entityId: invitation.ownerId.value,
					ownerId: input.userId,
					payload: {
						ownerId: invitation.ownerId.value,
						ownerMembershipId: membership.id.value,
						userId: input.userId,
						role: invitation.role as OwnerRole,
					},
				}),
				tx,
			)

			return { ownerId: invitation.ownerId.value, role: invitation.role as OwnerRole }
		})
	}
}
