// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { AggregateRoot, BaseError, Id, z } from '@template/core-typescript'
import Z from 'zod'
import { createHash } from 'node:crypto'
import { Role as OwnerRole } from '../enums/Role'
import type { ApplicationErrors, DomainErrors } from '../errors'

const OwnerInvitationSchema = z.object({
	ownerId: z.instance(Id),
	email: z.string().email({ error: 'INVALID_EMAIL' as DomainErrors }),
	role: z.enum(OwnerRole),
	// sha256 hex of the plain token; we never owner the plain value — it
	// travels only in the signed envelope delivered to the invitee's inbox.
	token: z.string().min(64),
	expiresAt: z.date(),
	acceptedAt: z.date().optional(),
	acceptedByUserId: z.instance(Id).optional(),
})

export type OwnerInvitationProps = Z.infer<typeof OwnerInvitationSchema>

// 7 days. Matches the Drizzle schema's "~7 days" comment on `expiresAt`.
const DEFAULT_TTL_HOURS = 168

export class OwnerInvitation extends AggregateRoot<typeof OwnerInvitationSchema> {
	static override schema = OwnerInvitationSchema

	static issue(data: { ownerId: string; email: string; role: OwnerRole; plainToken: string; ttlHours?: number }): OwnerInvitation {
		const ttl = data.ttlHours ?? DEFAULT_TTL_HOURS
		return new OwnerInvitation({
			ownerId: data.ownerId,
			email: data.email,
			role: data.role,
			token: createHash('sha256').update(data.plainToken).digest('hex'),
			expiresAt: new Date(Date.now() + ttl * 3600 * 1000),
		})
	}

	accept(input: { userId: string; plainToken: string }): void {
		if (this.acceptedAt) throw new BaseError<ApplicationErrors>('INVITATION_ALREADY_USED')
		if (this.expiresAt.getTime() < Date.now()) {
			throw new BaseError<ApplicationErrors>('INVITATION_EXPIRED')
		}
		const hash = createHash('sha256').update(input.plainToken).digest('hex')
		if (hash !== this.token) throw new BaseError<ApplicationErrors>('INVALID_INVITATION_TOKEN')

		this.acceptedAt = new Date()
		this.acceptedByUserId = new Id(input.userId)
		this.validate()
	}

	isPending(): boolean {
		return !this.acceptedAt && this.expiresAt.getTime() > Date.now()
	}
}

export interface OwnerInvitation extends OwnerInvitationProps {}
