import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { UserRole } from '../enums/UserRole'

// The ONE user-registration event since the identity→auth collapse. Emitted by IdentityAuthHooks
// on the BetterAuth sign-up lifecycle — the sole registration path. `role`/`leadEmail` are
// optional (the sign-up hook sets neither) and reserved for future enrichment.
export const UserRegisteredEventSchema = z.domainEvent({
	userId: z.uuid(),
	email: z.string(),
	leadEmail: z.string().optional(),
	role: z.enum(UserRole).optional(),
})

export class UserRegisteredEvent extends BaseDomainEvent<typeof UserRegisteredEventSchema> {
	static override readonly name = 'auth.user.registered' as const
	static readonly schema = UserRegisteredEventSchema
}
