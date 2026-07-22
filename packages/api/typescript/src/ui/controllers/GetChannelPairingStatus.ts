import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetChannelPairingStatus, GetChannelPairingStatusOutputSchema } from '../usecases/GetChannelPairingStatus'

export const GetChannelPairingStatusControllerInputSchema = z.object({
	query: z.object({ channelId: z.uuid() }),
	ctx: z.object({ ownerId: z.uuid() }),
})
export const GetChannelPairingStatusControllerOutputSchema = GetChannelPairingStatusOutputSchema

/**
 * GET /ui/channels/pairing-status — the connect dialog's pairing poll (~every 2s while open).
 * Proxies the operator's WhatsApp channel `status` from the gateway (keyed by the `channelId` the
 * preceding connect returned), so the dialog can flip to success on CONNECTED.
 */
@injectable()
export class GetChannelPairingStatusController extends Controller<
	typeof GetChannelPairingStatusControllerInputSchema,
	typeof GetChannelPairingStatusControllerOutputSchema
> {
	readonly path = '/ui/channels/pairing-status'
	readonly method = 'get' as const
	readonly description = 'WhatsApp pairing status for the connect dialog poll (T06)'
	readonly inputSchema = GetChannelPairingStatusControllerInputSchema
	readonly outputSchema = GetChannelPairingStatusControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private query: GetChannelPairingStatus) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId, channelId: request.query.channelId })
		return { status: HttpStatusCode.OK, data }
	}
}
