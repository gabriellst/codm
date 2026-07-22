import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { UserProfileSchema } from '../entities/UserProfile'

export const ProfileUpdatedEventSchema = z.domainEvent({
	userProfile: UserProfileSchema.input(),
})

export class ProfileUpdatedEvent extends BaseDomainEvent<typeof ProfileUpdatedEventSchema> {
	static override readonly name = 'auth.user.profile_updated' as const
	static readonly schema = ProfileUpdatedEventSchema
}
