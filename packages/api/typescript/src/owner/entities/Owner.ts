import { AggregateRoot, BaseError, z } from '@template/core-typescript'
import Z from 'zod'
import { OwnerKind } from '@template/contracts-typescript/wire/enums'
import type { DomainErrors } from '../errors'

// IANA timezone shape: Region/City or Region/Sub/City; plus UTC alias.
const IANA_TIMEZONE_RE = /^[A-Za-z_+-]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?$|^UTC$/

// The tenant aggregate — deliberately thin (D1: tenant == Owner, single ownerId
// axis). Tenancy facts only: a `kind` discriminator, the `responsibleUserId` that
// answers for it, plus a display name / picture / timezone. Rich identity (billing
// name/email/document) lives on billing's own profile (arrives in W2), never here.
export const OwnerSchema = z.object({
	name: z.string().trim().min(1).max(120),
	kind: z.enum(OwnerKind),
	responsibleUserId: z.string().min(1),
	pictureUrl: z.url().optional(),
	timezone: z
		.string()
		.regex(IANA_TIMEZONE_RE, { error: 'INVALID_TIMEZONE' as DomainErrors })
		.optional(),
	isDisabled: z.boolean().default(false),
	disabledReason: z.string().optional(),
})

export type OwnerProps = Z.infer<typeof OwnerSchema>

export class Owner extends AggregateRoot<typeof OwnerSchema> {
	static override schema = OwnerSchema

	static create(data: { name: string; kind: OwnerKind; responsibleUserId: string; pictureUrl?: string; timezone?: string }): Owner {
		return new Owner({
			name: data.name,
			kind: data.kind,
			responsibleUserId: data.responsibleUserId,
			pictureUrl: data.pictureUrl,
			timezone: data.timezone,
			isDisabled: false,
			disabledReason: undefined,
		})
	}

	updateSettings(input: { name?: string; pictureUrl?: string; timezone?: string }): void {
		// Per-key guards (not a keyed loop): TS can't correlate this[k]/input[k] across a key
		// union, and the explicit form keeps the assignment fully typed with no cast.
		if (input.name !== undefined && this.name !== input.name) this.name = input.name
		if (input.pictureUrl !== undefined && this.pictureUrl !== input.pictureUrl) this.pictureUrl = input.pictureUrl
		if (input.timezone !== undefined && this.timezone !== input.timezone) this.timezone = input.timezone
		this.validate()
	}

	disable(reason?: string): void {
		if (this.isDisabled) throw new BaseError<DomainErrors>('OWNER_ALREADY_DISABLED')
		this.isDisabled = true
		this.disabledReason = reason
	}

	enable(): void {
		if (!this.isDisabled) throw new BaseError<DomainErrors>('OWNER_NOT_DISABLED')
		this.isDisabled = false
		this.disabledReason = undefined
	}
}

export interface Owner extends OwnerProps {}
