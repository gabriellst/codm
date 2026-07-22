import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError, Config } from '@codedm/core-typescript'
import { Client } from '@codedm/client-typescript'
import { ChannelStatus } from '@codedm/contracts-typescript/wire/enums'
import { normalizeChannelStatus } from '../channelStatus'
import type { ApplicationErrors } from '../errors'

export const GetChannelPairingStatusInputSchema = z.object({
	ownerId: z.uuid(),
	channelId: z.uuid(),
})
export const GetChannelPairingStatusOutputSchema = z.object({
	channelId: z.uuid(),
	status: z.enum(ChannelStatus),
})

// Match the connect timeout — a status poll that outlives the dialog's 2s interval is useless.
const GATEWAY_TIMEOUT_MS = 8000

/**
 * Read — the connect dialog's pairing poll (T06). A SERVER-SIDE proxy that reads the operator's
 * WhatsApp channel state straight from the gateway's channels resource
 * (`GET /channels/{id}` on the Go gateway), so the dialog can detect CONNECTED and flip to success
 * without a second real-time channel. Polled ~every 2s while the dialog is open.
 *
 * The gateway is the source of truth for pairing state (its status projector writes CONNECTED once
 * whatsmeow reports the device paired); api-ts does not mirror that row, so this proxies over the
 * apikey-guarded S2S surface rather than reading a local table. `channelId` comes from the preceding
 * `ConnectChannel` response. The raw gateway status is normalized onto the contracts
 * {@link ChannelStatus} the browser speaks. Any transport failure maps to the same honest
 * {@link ApplicationErrors} `GATEWAY_UNAVAILABLE` the connect proxy raises — under `CODEDM_E2E` the
 * gateway is absent, so the poll surfaces exactly that.
 */
@injectable()
export class GetChannelPairingStatus extends Handler<typeof GetChannelPairingStatusInputSchema, typeof GetChannelPairingStatusOutputSchema> {
	readonly name = 'get_channel_pairing_status' as const
	readonly inputSchema = GetChannelPairingStatusInputSchema
	readonly outputSchema = GetChannelPairingStatusOutputSchema

	constructor(private readonly client: Client) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const gatewayConfig = {
			headers: { apikey: Config.env.CODEDM_GATEWAY_API_KEY, 'X-Owner-Id': input.ownerId },
			timeout: GATEWAY_TIMEOUT_MS,
			retry: false as const,
		}

		let channel: { id?: string; status?: string } | undefined
		try {
			channel = await this.client.go.getChannel(input.channelId, gatewayConfig)
		} catch {
			throw new BaseError<ApplicationErrors>('GATEWAY_UNAVAILABLE', 'the WhatsApp channel gateway is unreachable')
		}

		return {
			channelId: channel?.id ?? input.channelId,
			status: normalizeChannelStatus(channel?.status),
		}
	}
}
