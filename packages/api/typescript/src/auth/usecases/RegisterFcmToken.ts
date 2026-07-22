import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'

import { FcmRegistrationToken } from '../entities/FcmRegistrationToken'
import { FcmRegistrationTokenRepository } from '../repositories/FcmRegistrationTokenRepository'
import { FcmTokenRegisteredEvent } from '../events'
import { FcmPlatform } from '@template/contracts-typescript/wire/enums'

export const RegisterFcmTokenInputSchema = z.object({
	userId: z.uuid(),
	token: z.string().min(1),
	platform: z.enum(FcmPlatform),
})

export const RegisterFcmTokenOutputSchema = z.void()

@injectable()
export class RegisterFcmToken extends Handler<typeof RegisterFcmTokenInputSchema, typeof RegisterFcmTokenOutputSchema> {
	readonly name = 'register_fcm_token' as const
	readonly inputSchema = RegisterFcmTokenInputSchema
	readonly outputSchema = RegisterFcmTokenOutputSchema

	constructor(private readonly repo: FcmRegistrationTokenRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const existing = await this.repo.findByToken(input.token, tx)
			if (existing) {
				// Spec C09 is idempotent on token value. Re-registering refreshes
				// liveness without emitting a second FcmTokenRegistered event.
				existing.touch()
				await this.repo.save(existing, tx)
				return
			}

			const fcm = FcmRegistrationToken.create({
				userId: input.userId,
				token: input.token,
				platform: input.platform,
			})
			await this.repo.save(fcm, tx)
			await this.domainEventRepository.save(
				new FcmTokenRegisteredEvent({
					entityId: fcm.id.value,
					ownerId: input.userId,
					payload: { userId: input.userId, tokenId: fcm.id.value, platform: input.platform },
				}),
				tx,
			)
		})
	}
}
