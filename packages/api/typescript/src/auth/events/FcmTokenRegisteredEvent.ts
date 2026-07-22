import { FcmPlatform } from '@template/contracts-typescript/wire/enums'
import { BaseDomainEvent, z } from '@template/core-typescript'

export const FcmTokenRegisteredEventSchema = z.domainEvent({
	userId: z.uuid(),
	tokenId: z.string(),
	platform: z.enum(FcmPlatform),
})

export class FcmTokenRegisteredEvent extends BaseDomainEvent<typeof FcmTokenRegisteredEventSchema> {
	static override readonly name = 'auth.fcm_token.registered' as const
	static readonly schema = FcmTokenRegisteredEventSchema
}
