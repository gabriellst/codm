import { injectable } from 'tsyringe-neo'
import { Handler, BaseError, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { DeviceToken } from '../entities/DeviceToken'
import { DeviceTokenRepository } from '../repositories/DeviceTokenRepository'
import type { ApplicationErrors } from '../errors'

export const RevokeDeviceInputSchema = z.object({
	token: z.string(),
})

export const RevokeDeviceOutputSchema = z.void()

/**
 * Logout (spec decision 4, AC-6). The bearer's hash has to resolve to a row at all (APPLICATION
 * error — the token was never issued or this daemon has none matching it); once resolved,
 * `entity.revoke()` owns the idempotent-refuse invariant — a second revoke of the same token throws
 * the SAME DEVICE_TOKEN_INVALID as a DOMAIN error (see errors/index.ts).
 */
@injectable()
export class RevokeDevice extends Handler<typeof RevokeDeviceInputSchema, typeof RevokeDeviceOutputSchema> {
	readonly name = 'revoke_device' as const
	readonly inputSchema = RevokeDeviceInputSchema
	readonly outputSchema = RevokeDeviceOutputSchema

	constructor(private readonly deviceTokens: DeviceTokenRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const entity = await this.deviceTokens.findByHash(DeviceToken.hashOf(input.token), tx)
			if (!entity) throw new BaseError<ApplicationErrors>('DEVICE_TOKEN_INVALID')

			entity.revoke()
			await this.deviceTokens.save(entity, tx)
		})
	}
}
