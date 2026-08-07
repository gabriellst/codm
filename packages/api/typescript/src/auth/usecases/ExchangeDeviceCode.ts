import { injectable } from 'tsyringe-neo'
import { Handler, BaseError, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { DeviceToken } from '../entities/DeviceToken'
import { DeviceTokenRepository } from '../repositories/DeviceTokenRepository'
import type { ApplicationErrors } from '../errors'

export const ExchangeDeviceCodeInputSchema = z.object({
	code: z.uuid(),
})

export const ExchangeDeviceCodeOutputSchema = z.object({
	token: z.string(),
})

// v1 has no device-naming UX (spec: "UI de conta elaborada" is out of scope) — every device token
// gets this literal label until a naming screen exists to collect a real one.
const DEFAULT_DEVICE_LABEL = 'Desktop'

/**
 * Trades a one-time device code for a long-lived device token (spec decision 4, AC-2). The exactly-
 * once guarantee is `DeviceTokenRepository.consumeCode` — a single atomic UPDATE ... RETURNING — so
 * this use case never checks-then-acts: a code that was already consumed, or has expired, simply
 * fails to claim, and both collapse into the same DEVICE_CODE_INVALID a caller cannot use to probe
 * which happened.
 */
@injectable()
export class ExchangeDeviceCode extends Handler<typeof ExchangeDeviceCodeInputSchema, typeof ExchangeDeviceCodeOutputSchema> {
	readonly name = 'exchange_device_code' as const
	readonly inputSchema = ExchangeDeviceCodeInputSchema
	readonly outputSchema = ExchangeDeviceCodeOutputSchema

	constructor(private readonly deviceTokens: DeviceTokenRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const claimed = await this.deviceTokens.consumeCode(input.code, new Date(), tx)
			if (!claimed) throw new BaseError<ApplicationErrors>('DEVICE_CODE_INVALID')

			const { entity, plaintext } = DeviceToken.issue(claimed.userId, DEFAULT_DEVICE_LABEL)
			await this.deviceTokens.save(entity, tx)

			return { token: plaintext }
		})
	}
}
