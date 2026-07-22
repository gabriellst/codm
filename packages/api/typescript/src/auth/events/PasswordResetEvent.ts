import { BaseDomainEvent, z } from '@template/core-typescript'

export const PasswordResetEventSchema = z.domainEvent({
	userId: z.uuid(),
	resetAt: z.iso.datetime({ offset: true }),
})

export class PasswordResetEvent extends BaseDomainEvent<typeof PasswordResetEventSchema> {
	static override readonly name = 'auth.user.password_reset' as const
	static readonly schema = PasswordResetEventSchema
}
