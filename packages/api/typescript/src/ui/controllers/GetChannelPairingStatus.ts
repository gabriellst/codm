import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetChannelPairingStatus, GetChannelPairingStatusOutputSchema } from '../usecases/GetChannelPairingStatus'

export const GetChannelPairingStatusControllerInputSchema = z.object({ ctx: z.object({ ownerId: z.uuid() }) })
export const GetChannelPairingStatusControllerOutputSchema = GetChannelPairingStatusOutputSchema

/**
 * GET /ui/channels/pairing-status — the connect dialog's pairing poll (~every 2s while open).
 * Surfaces the operator's WhatsApp channel `status` (from the gateway-owned row) plus the live QR
 * rotation captured from the gateway stream, so the dialog can render the code and flip to success
 * on CONNECTED.
 */
@injectable()
export class GetChannelPairingStatusController extends Controller<
	typeof GetChannelPairingStatusControllerInputSchema,
	typeof GetChannelPairingStatusControllerOutputSchema
> {
	readonly path = '/ui/channels/pairing-status'
	readonly method = 'get' as const
	readonly description = 'WhatsApp pairing status + live QR for the connect dialog poll (T06)'
	readonly inputSchema = GetChannelPairingStatusControllerInputSchema
	readonly outputSchema = GetChannelPairingStatusControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private query: GetChannelPairingStatus) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId })
		return { status: HttpStatusCode.OK, data }
	}
}
