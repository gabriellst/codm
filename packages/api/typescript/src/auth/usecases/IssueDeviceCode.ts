import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { DeviceTokenRepository } from '../repositories/DeviceTokenRepository'

export const IssueDeviceCodeInputSchema = z.object({
	userId: z.uuid(),
})

export const IssueDeviceCodeOutputSchema = z.object({
	code: z.string(),
})

/** The one-time code lives for 2 minutes (spec T2) — long enough for the deep-link round trip
 * (browser → OS → app), short enough that a code sitting unused is worthless to steal. */
const DEVICE_CODE_TTL_MS = 2 * 60 * 1000

/**
 * Internal use case — mints a one-time device code right after better-auth's OAuth completes.
 * Called by DesktopCallbackController, never reachable from an HTTP body of its own (no controller
 * wraps it): the caller must already hold a valid better-auth session cookie, which is exactly what
 * DesktopCallback verifies before invoking this.
 */
@injectable()
export class IssueDeviceCode extends Handler<typeof IssueDeviceCodeInputSchema, typeof IssueDeviceCodeOutputSchema> {
	readonly name = 'issue_device_code' as const
	readonly inputSchema = IssueDeviceCodeInputSchema
	readonly outputSchema = IssueDeviceCodeOutputSchema

	constructor(private readonly deviceTokens: DeviceTokenRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const code = crypto.randomUUID()
			await this.deviceTokens.issueCode(code, input.userId, new Date(Date.now() + DEVICE_CODE_TTL_MS), tx)
			return { code }
		})
	}
}
