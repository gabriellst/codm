import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError, Config } from '@codedm/core-typescript'
import { Client } from '@codedm/client-typescript'
import { ChannelStatus } from '@codedm/contracts-typescript/wire/enums'
import { normalizeChannelStatus } from '../channelStatus'
import type { ApplicationErrors } from '../errors'

export const ConnectChannelInputSchema = z.object({ ownerId: z.uuid() })
export const ConnectChannelOutputSchema = z.object({
	channelId: z.uuid(),
	// The live pairing QR string (WhatsApp `2@…` ref) the browser renders as a scannable code. Null
	// when the connect returns no QR — i.e. an already-paired device reconnecting (status CONNECTED).
	qr: z.string().nullable(),
	status: z.enum(ChannelStatus),
})

// Fail fast — pairing is an interactive ceremony; a hung gateway call must surface as
// GATEWAY_UNAVAILABLE quickly, not spin for the SDK's default 30s.
const GATEWAY_TIMEOUT_MS = 8000

/**
 * SERVER-SIDE proxy to the Go channel gateway. Starts or resumes the operator's WhatsApp session and
 * returns `{ channelId, qr, status }` — the QR is delivered SYNCHRONOUSLY by the gateway's connect
 * call (the verbatim medscall `POST /channels/{id}/connect` blocks on the first QR rotation and hands
 * it back in the response body), so there is no async QR stream to consume.
 *
 * Two gateway calls compose the ceremony:
 *   1. `GET /channels/resolve?platform=WHATSAPP` (get-or-create the operator's WhatsApp channel).
 *      Owner scoping rides the `X-Owner-Id` header (swagger-ignored, so it isn't a client param).
 *   2. `POST /channels/{id}/connect` — starts whatsmeow and returns `{ id, state, qrCode? }`.
 *
 * The gateway HTTP surface is service-to-service: it is guarded by the `apikey` header, read from
 * `Config.env.CODEDM_GATEWAY_API_KEY` and attached HERE — it NEVER reaches the browser (the console
 * calls THIS proxy, not the gateway). The key is empty by default (the gateway allows-all locally),
 * so local dev needs no secret.
 *
 * Any transport failure — gateway not running (connection refused), timeout, upstream 5xx — is mapped
 * to a single honest {@link ApplicationErrors} `GATEWAY_UNAVAILABLE`, never a 500 soup. Under
 * `CODEDM_E2E` the gateway is absent, so this error path is exactly what the seam sees.
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

		let out: { channelId?: string; qrCode?: string; state?: string } | undefined
		try {
			const channel = await this.client.go.getOrCreateChannel(
				{ platform: 'WHATSAPP' },
				{ ...gatewayConfig, headers: { ...gatewayConfig.headers, 'X-Owner-Id': input.ownerId } },
			)
			if (channel?.id) {
				const connected = await this.client.go.connectChannel(channel.id, gatewayConfig)
				out = { channelId: connected?.id ?? channel.id, qrCode: connected?.qrCode, state: connected?.state }
			}
		} catch {
			throw new BaseError<ApplicationErrors>('GATEWAY_UNAVAILABLE', 'the WhatsApp channel gateway is unreachable')
		}

		if (!out?.channelId) {
			throw new BaseError<ApplicationErrors>('GATEWAY_UNAVAILABLE', 'the WhatsApp channel gateway returned no channel')
		}

		return {
			channelId: out.channelId,
			qr: out.qrCode ?? null,
			status: normalizeChannelStatus(out.state),
		}
	}
}
