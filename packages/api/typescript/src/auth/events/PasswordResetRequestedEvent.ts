import { BaseDomainEvent, z } from '@codedm/core-typescript'

export const PasswordResetRequestedEventSchema = z.domainEvent({
	userId: z.uuid(),
	requestedAt: z.iso.datetime({ offset: true }),
})

export class PasswordResetRequestedEvent extends BaseDomainEvent<typeof PasswordResetRequestedEventSchema> {
	static override readonly name = 'auth.user.password_reset_requested' as const
	static readonly schema = PasswordResetRequestedEventSchema
}
