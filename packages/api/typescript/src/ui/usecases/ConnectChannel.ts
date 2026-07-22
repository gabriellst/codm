import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError, Config } from '@codedm/core-typescript'
import { Client } from '@codedm/client-typescript'
import { ChannelStatus } from '@codedm/contracts-typescript/wire/enums'
import type { ApplicationErrors } from '../errors'

export const ConnectChannelInputSchema = z.object({ ownerId: z.uuid() })
export const ConnectChannelOutputSchema = z.object({
	channelId: z.uuid(),
	status: z.enum(ChannelStatus),
})

// The Go gateway's connect surface returns fast with the row's live status: a fresh session is
// PAIRING (QR codes then stream over `integration.channel.pairing_qr_updated`); an already-paired
// device reconnects straight to CONNECTED. Anything unexpected is normalised to PAIRING so a stray
// upstream value never trips the output contract into a 500.
function normalizeStatus(raw: string): ChannelStatus {
	return (Object.values(ChannelStatus) as string[]).includes(raw) ? (raw as ChannelStatus) : ChannelStatus.PAIRING
}

// Fail fast — pairing is an interactive ceremony; a hung gateway call must surface as
// GATEWAY_UNAVAILABLE quickly, not spin for the SDK's default 30s.
const GATEWAY_TIMEOUT_MS = 8000

/**
 * SERVER-SIDE proxy to the Go channel gateway's `POST /channel/connect` (BC1). Starts or resumes the
 * operator's WhatsApp session and returns `{ channelId, status }`.
 *
 * The gateway HTTP surface is service-to-service: it is guarded by the `apikey` header, which is read
 * from `Config.env` and attached HERE — it never reaches the browser (the console calls THIS proxy,
 * not the gateway). The apikey is empty by default (the gateway allows-all locally), so local dev
 * needs no secret.
 *
 * The connect response carries no QR: a fresh pairing streams rotating QR codes as integration events
 * that `ConsumeChannelPairingQr` caches and `GetChannelPairingStatus` (the dialog's 2s poll) hands to
 * the browser. Any transport failure — gateway not running (connection refused), timeout, upstream
 * 5xx — is mapped to a single honest {@link ApplicationErrors} `GATEWAY_UNAVAILABLE`, never a 500
 * soup. Under `CODEDM_E2E` the gateway is absent, so this error path is exactly what the seam sees.
 */
@injectable()
export class ConnectChannel extends Handler<typeof ConnectChannelInputSchema, typeof ConnectChannelOutputSchema> {
	readonly name = 'connect_channel' as const
	readonly inputSchema = ConnectChannelInputSchema
	readonly outputSchema = ConnectChannelOutputSchema

	constructor(private readonly client: Client) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const gatewayConfig = {
			headers: { apikey: Config.env.CODEDM_GATEWAY_API_KEY },
			timeout: GATEWAY_TIMEOUT_MS,
			retry: false as const,
		}

		// The verbatim gateway splits pairing into two calls: resolve
		// (`GET /channels/resolve`, get-or-create the owner's WhatsApp channel) then connect
		// (`POST /channels/{id}/connect`, which starts whatsmeow and returns the live state + QR).
		// Owner scoping rides the `X-Owner-Id` header (swagger-ignored, so it isn't a client param).
		let out: { channelId?: string; state?: string } | undefined
		try {
			const channel = await this.client.go.getOrCreateChannel(
				{ platform: 'WHATSAPP' },
				{ ...gatewayConfig, headers: { ...gatewayConfig.headers, 'X-Owner-Id': input.ownerId } },
			)
			if (channel?.id) {
				const connected = await this.client.go.connectChannel(channel.id, gatewayConfig)
				out = { channelId: connected?.id ?? channel.id, state: connected?.state }
			}
		} catch {
			throw new BaseError<ApplicationErrors>('GATEWAY_UNAVAILABLE', 'the WhatsApp channel gateway is unreachable')
		}

		if (!out?.channelId) {
			throw new BaseError<ApplicationErrors>('GATEWAY_UNAVAILABLE', 'the WhatsApp channel gateway returned no channel')
		}

		return { channelId: out.channelId, status: normalizeStatus(out.state ?? ChannelStatus.PAIRING) }
	}
}
