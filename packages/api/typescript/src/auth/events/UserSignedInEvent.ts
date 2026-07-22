import { BaseDomainEvent, z } from '@codedm/core-typescript'

export const UserSignedInEventSchema = z.domainEvent({
	userId: z.uuid(),
	signedInAt: z.iso.datetime({ offset: true }),
})

export class UserSignedInEvent extends BaseDomainEvent<typeof UserSignedInEventSchema> {
	static override readonly name = 'auth.user.signed_in' as const
	static readonly schema = UserSignedInEventSchema
}
