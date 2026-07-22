import { BaseDomainEvent, z } from '@codedm/core-typescript'

export const UserSignedOutEventSchema = z.domainEvent({
	userId: z.uuid(),
	signedOutAt: z.iso.datetime({ offset: true }),
})

export class UserSignedOutEvent extends BaseDomainEvent<typeof UserSignedOutEventSchema> {
	static override readonly name = 'auth.user.signed_out' as const
	static readonly schema = UserSignedOutEventSchema
}
