import { AggregateRoot, Id, z } from '@template/core-typescript'
import Z from 'zod'
import { FcmPlatform } from '@template/contracts-typescript/wire/enums'

const FcmRegistrationTokenSchema = z.object({
	userId: z.instance(Id),
	token: z.string().min(1),
	platform: z.enum(FcmPlatform),
	lastSeenAt: z.date(),
})

export type FcmRegistrationTokenProps = Z.infer<typeof FcmRegistrationTokenSchema>

export class FcmRegistrationToken extends AggregateRoot<typeof FcmRegistrationTokenSchema> {
	static override schema = FcmRegistrationTokenSchema

	static create(data: { userId: string; token: string; platform: FcmPlatform }): FcmRegistrationToken {
		return new FcmRegistrationToken({
			userId: data.userId,
			token: data.token,
			platform: data.platform,
			lastSeenAt: new Date(),
		})
	}

	touch(): void {
		this.lastSeenAt = new Date()
		this.validate()
	}
}

export interface FcmRegistrationToken extends FcmRegistrationTokenProps {}
