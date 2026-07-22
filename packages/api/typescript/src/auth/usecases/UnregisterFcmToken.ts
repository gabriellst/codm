import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { FcmRegistrationTokenRepository } from '../repositories/FcmRegistrationTokenRepository'
import { FcmTokenUnregisteredEvent } from '../events'

export const UnregisterFcmTokenInputSchema = z.object({
	userId: z.uuid(),
	token: z.string().min(1),
})

export const UnregisterFcmTokenOutputSchema = z.void()

@injectable()
export class UnregisterFcmToken extends Handler<typeof UnregisterFcmTokenInputSchema, typeof UnregisterFcmTokenOutputSchema> {
	readonly name = 'unregister_fcm_token' as const
	readonly inputSchema = UnregisterFcmTokenInputSchema
	readonly outputSchema = UnregisterFcmTokenOutputSchema

	constructor(private readonly repo: FcmRegistrationTokenRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const existing = await this.repo.findByToken(input.token, tx)
			// Spec C10 is "no-op if absent". Also silently ignore cross-user
			// unregister attempts — the SDK input has no userId, so the
			// controller injects session.user.id; defense-in-depth here.
			if (!existing || existing.userId.value !== input.userId) return

			await this.repo.delete(existing.id.value, tx)
			await this.domainEventRepository.save(
				new FcmTokenUnregisteredEvent({
					entityId: existing.id.value,
					ownerId: input.userId,
					payload: { userId: input.userId, tokenId: existing.id.value },
				}),
				tx,
			)
		})
	}
}
