import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { ConnectChannel, ConnectChannelOutputSchema } from '../usecases/ConnectChannel'

export const ConnectChannelControllerInputSchema = z.object({ ctx: z.object({ ownerId: z.uuid() }) })
export const ConnectChannelControllerOutputSchema = ConnectChannelOutputSchema

/**
 * POST /ui/channels/connect — the console's WhatsApp pairing entry point. A thin proxy that forwards
 * the operator's connect to the Go channel gateway SERVER-SIDE (the gateway apikey is attached in the
 * use case, never here and never in the browser). Returns `{ channelId, status }`; the live QR then
 * arrives via the pairing-status poll.
 */
@injectable()
export class ConnectChannelController extends Controller<typeof ConnectChannelControllerInputSchema, typeof ConnectChannelControllerOutputSchema> {
	readonly path = '/ui/channels/connect'
	readonly method = 'post' as const
	readonly description = 'Start or resume WhatsApp pairing via the channel gateway (T06)'
	readonly inputSchema = ConnectChannelControllerInputSchema
	readonly outputSchema = ConnectChannelControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private connectChannel: ConnectChannel) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.connectChannel.execute({ ownerId: request.ctx.ownerId })
		return { status: HttpStatusCode.OK, data }
	}
}
