import { z } from '@template/core-typescript'
import { Controller, HttpStatusCode, BaseError, Config } from '@template/core-typescript'
import type { BaseInterfaceErrors } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { ApplyQuotaOverride } from '@quota/usecases'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

export const ApplyQuotaOverrideControllerInput = z
	.object({
		body: z.object({
			ownerId: z.string(),
			meter: z.enum(QuotaKey),
			delta: z.number().int(),
			idempotencyKey: z.string().min(1),
		}),
	})
	.example([
		{
			body: { ownerId: 'tenant-123', meter: QuotaKey.EXAMPLE_KEY, delta: 1000, idempotencyKey: 'quota-override-1' },
		},
	])

export const ApplyQuotaOverrideControllerOutput = z.void()

/**
 * Operator-only endpoint — gated on a platform credential (`X-Operator-Key`), never on the
 * tenant/session model. This is deliberate: a session gate would let any owner self-grant unlimited
 * quota by setting `body.ownerId` to their own id. The `quota` context registers ZERO default
 * middlewares and this controller adds none, so the operator credential (not a logged-in actor
 * session) is the sole authentication mechanism. The header is read off the raw request — the
 * framework's input envelope only populates body/query/params/ctx.
 */
@injectable()
export class ApplyQuotaOverrideController extends Controller<
	typeof ApplyQuotaOverrideControllerInput,
	typeof ApplyQuotaOverrideControllerOutput
> {
	readonly path = '/quota/overrides'
	readonly method = 'post'
	readonly description = 'Apply a quota override to a tenant (operator only, via X-Operator-Key)'
	readonly inputSchema = ApplyQuotaOverrideControllerInput
	readonly outputSchema = ApplyQuotaOverrideControllerOutput

	constructor(private applyQuotaOverride: ApplyQuotaOverride) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		this.assertOperator(request.raw.headers.get('x-operator-key'))

		await this.applyQuotaOverride.execute({
			ownerId: request.body.ownerId,
			meter: request.body.meter,
			delta: request.body.delta,
			idempotencyKey: request.body.idempotencyKey,
		})

		return { status: HttpStatusCode.NO_CONTENT }
	}

	// Constant-time compare so a header-mismatch timing can't leak the operator key. Fails CLOSED
	// when the secret isn't configured (empty expected key rejects every request).
	private assertOperator(providedKey: string | null): void {
		const expected = Config.env.OPERATOR_API_KEY
		if (!expected || !providedKey || providedKey.length !== expected.length) {
			throw new BaseError<BaseInterfaceErrors>('UNAUTHORIZED')
		}
		let mismatch = 0
		for (let i = 0; i < expected.length; i++) mismatch |= providedKey.charCodeAt(i) ^ expected.charCodeAt(i)
		if (mismatch !== 0) throw new BaseError<BaseInterfaceErrors>('UNAUTHORIZED')
	}
}
