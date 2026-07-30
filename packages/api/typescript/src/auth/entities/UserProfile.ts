import { AggregateRoot, Id, z } from '@codm/core-typescript'
import { LanguageTag, Timezone } from '@shared/objects'
import type Z from 'zod'

// Supplementary user fields. Format rules live in the value objects (Timezone, LanguageTag) —
// the entity declares WHICH concepts it carries, never how they validate (SRP). Lifecycle facts
// (lead attribution, disablement) are EVENTS, not columns: they were dropped from this aggregate
// because a fact that happened is inferable from the event stream, not state to mirror here.
export const UserProfileSchema = z.object({
	userId: z.instance(Id),
	timezone: z.instance(Timezone).optional(),
	language: z.instance(LanguageTag).optional(),
})

export type UserProfileProps = Z.infer<typeof UserProfileSchema>

export class UserProfile extends AggregateRoot<typeof UserProfileSchema> {
	static override schema = UserProfileSchema

	static create(data: { userId: string; timezone?: string; language?: string }): UserProfile {
		// `id` is the FK to authentication.users.id — must equal userId.
		// Domain-event entityId reads from `entity.id.value`, so binding the
		// two keeps audit logs + event payloads consistent with the database row.
		return new UserProfile({
			id: data.userId,
			userId: data.userId,
			timezone: data.timezone === undefined ? undefined : new Timezone(data.timezone),
			language: data.language === undefined ? undefined : new LanguageTag(data.language),
		})
	}

	updateProfile(data: { timezone?: string; language?: string }): void {
		if (data.timezone !== undefined) this.timezone = new Timezone(data.timezone)
		if (data.language !== undefined) this.language = new LanguageTag(data.language)
		this.validate()
	}
}

export interface UserProfile extends UserProfileProps {}
