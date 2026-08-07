import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { ExchangeDeviceCode, ExchangeDeviceCodeInputSchema, ExchangeDeviceCodeOutputSchema } from '../../usecases/ExchangeDeviceCode'

export const ExchangeDeviceCodeControllerInputSchema = z
	.object({ body: ExchangeDeviceCodeInputSchema })
	.example([{ body: { code: '019e4d24-6524-7041-9e1c-8108180cddae' } }])

export const ExchangeDeviceCodeControllerOutputSchema = ExchangeDeviceCodeOutputSchema.example([
	{ token: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2' },
])

/**
 * The desktop's half of the code-for-token trade (spec decision 4, AC-2). PUBLIC on purpose: the
 * caller is the app itself, before it holds any credential this daemon recognizes — the one-time
 * `code` in the body IS the credential, and it is consumed exactly once regardless of who presents
 * it (see ExchangeDeviceCode use case / DrizzleDeviceTokenRepository.consumeCode). No `ctx`, no
 * OperatorMiddleware: this endpoint answers a machine that has never talked to this daemon before.
 */
@injectable()
export class ExchangeDeviceCodeController extends Controller<
	typeof ExchangeDeviceCodeControllerInputSchema,
	typeof ExchangeDeviceCodeControllerOutputSchema
> {
	readonly path = '/cloud/devices/exchange'
	readonly method = 'post' as const
	readonly description = 'Trade a one-time device code for a long-lived device token'
	readonly inputSchema = ExchangeDeviceCodeControllerInputSchema
	readonly outputSchema = ExchangeDeviceCodeControllerOutputSchema

	constructor(private readonly exchangeDeviceCode: ExchangeDeviceCode) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const result = await this.exchangeDeviceCode.execute({ code: request.body.code })
		return { status: HttpStatusCode.OK, data: result }
	}
}
