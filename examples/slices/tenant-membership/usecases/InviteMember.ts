// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { injectable } from 'tsyringe-neo'
import { randomBytes } from 'node:crypto'
import { BaseError, Handler, z } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { Role as OwnerRole } from '../enums/Role'
import { OwnerInvitation } from '../entities/OwnerInvitation'
import { OwnerMembershipRepository } from '../repositories/OwnerMembershipRepository'
import { OwnerInvitationRepository } from '../repositories/OwnerInvitationRepository'
import { InvitationTokenService } from '../services/InvitationTokenService'
import { OwnerMemberInvitedEvent } from '../events'
import type { ApplicationErrors } from '../errors'

export const InviteMemberInputSchema = z.object({
	ownerId: z.uuid(),
	invitedByUserId: z.uuid(),
	email: z.email(),
	role: z.enum(OwnerRole),
})

export const InviteMemberOutputSchema = z.object({
	ownerInvitationId: z.uuid(),
})

@injectable()
export class InviteMember extends Handler<typeof InviteMemberInputSchema, typeof InviteMemberOutputSchema> {
	readonly name = 'invite_member' as const
	readonly inputSchema = InviteMemberInputSchema
	readonly outputSchema = InviteMemberOutputSchema

	constructor(
		private readonly memberships: OwnerMembershipRepository,
		private readonly invitations: OwnerInvitationRepository,
		private readonly tokens: InvitationTokenService,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// ALREADY_A_MEMBER guard — email already maps to an existing membership.
		const existingMember = await this.memberships.findByOwnerAndEmail(input.ownerId, input.email)
		if (existingMember) throw new BaseError<ApplicationErrors>('ALREADY_A_MEMBER')

		// INVITATION_ALREADY_PENDING — unaccepted + unexpired invite for this email.
		const pending = await this.invitations.findPendingByOwnerAndEmail(input.ownerId, input.email)
		if (pending) throw new BaseError<ApplicationErrors>('INVITATION_ALREADY_PENDING')

		return this.withTransaction(tx, async tx => {
			// Plain token leaves the process exactly once — on the event payload —
			// the DB row owners only sha256(plainToken).
			const plainToken = randomBytes(32).toString('base64url')
			const invitation = OwnerInvitation.issue({
				ownerId: input.ownerId,
				email: input.email,
				role: input.role as OwnerRole,
				plainToken,
			})
			await this.invitations.save(invitation, tx)

			const invitationToken = this.tokens.generate({
				ownerInvitationId: invitation.id.value,
				email: input.email,
				plainToken,
			})

			await this.domainEventRepository.save(
				new OwnerMemberInvitedEvent({
					entityId: invitation.id.value,
					ownerId: input.invitedByUserId,
					payload: {
						ownerId: input.ownerId,
						ownerInvitationId: invitation.id.value,
						email: input.email,
						role: input.role as OwnerRole,
						invitationToken,
					},
				}),
				tx,
			)

			return { ownerInvitationId: invitation.id.value }
		})
	}
}
