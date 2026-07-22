// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codedm/core-typescript'
import { OwnerMemberInvitedEvent as OwnerMemberInvitedIntegrationEvent } from '@codedm/contracts-typescript/wire/events'
import { OwnerMemberInvitedEvent } from '../events'
import { OwnerInvitationRepository } from '../repositories/OwnerInvitationRepository'

/**
 * Bridges the in-process `owner.owner_member.invited` domain event to the
 * cross-service `integration.shared.owner.member_invited` integration event.
 * The Notifications BC consumes the integration event and sends the invite email.
 *
 * Looks up the OwnerInvitation to source `expiresAt` (not on the domain event
 * payload — kept lean to avoid leaking entity columns into the event schema).
 */
@injectable()
export class OwnerMemberInvitedHandler extends EventHandler<typeof OwnerMemberInvitedEvent> {
	readonly event = OwnerMemberInvitedEvent

	constructor(
		private readonly invitations: OwnerInvitationRepository,
		private readonly externalMediator: ExternalMediator,
	) {
		super()
	}

	async handle(event: this['input']): Promise<this['output']> {
		const invitation = await this.invitations.findById(event.payload.ownerInvitationId)
		// Graceful exit if the invitation row vanished between issuance and dispatch
		// (e.g., manual purge). Better to drop the email than crash the handler chain.
		if (!invitation) return

		// OwnerMemberInvitedEvent is always constructed with ownerId = inviter userId
		// by InviteMember use case — domain event's ownerId became optional in the
		// framework change (some events have no actor), but this one always has it.
		const inviterId = event.ownerId ?? ''

		await this.externalMediator.publish(
			new OwnerMemberInvitedIntegrationEvent({
				// Envelope ownerId carries the tenant the invite belongs to.
				ownerId: event.payload.ownerId,
				payload: {
					email: event.payload.email,
					role: event.payload.role,
					token: event.payload.invitationToken,
					expiresAt: invitation.expiresAt,
					invitedByUserId: inviterId,
				},
			}),
		)
	}
}
