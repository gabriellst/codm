import { BaseDomainEvent, z } from '@template/core-typescript'

export const PasswordChangedEventSchema = z.domainEvent({
	userId: z.uuid(),
	changedAt: z.iso.datetime({ offset: true }),
})

export class PasswordChangedEvent extends BaseDomainEvent<typeof PasswordChangedEventSchema> {
	static override readonly name = 'auth.user.password_changed' as const
	static readonly schema = PasswordChangedEventSchema
}
