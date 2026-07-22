import { BaseDomainEvent, z } from '@template/core-typescript'

export const FcmTokenUnregisteredEventSchema = z.domainEvent({
	userId: z.uuid(),
	tokenId: z.string(),
})

export class FcmTokenUnregisteredEvent extends BaseDomainEvent<typeof FcmTokenUnregisteredEventSchema> {
	static override readonly name = 'auth.fcm_token.unregistered' as const
	static readonly schema = FcmTokenUnregisteredEventSchema
}
