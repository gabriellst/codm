import { injectable } from 'tsyringe-neo'
import { and, desc, eq } from 'drizzle-orm'
import { Handler, z, DrizzleClient } from '@codedm/core-typescript'
import { channels } from '@codedm/contracts/db'
import { ChannelKind, ChannelStatus } from '@codedm/contracts-typescript/wire/enums'
import { PairingQrCache } from '../services/PairingQrCache'

export const GetChannelPairingStatusInputSchema = z.object({ ownerId: z.uuid() })
export const GetChannelPairingStatusOutputSchema = z.object({
	channelId: z.uuid().nullable(),
	status: z.enum(ChannelStatus),
	qr: z.string().nullable(),
	qrExpiresAt: z.string().nullable(),
})

/**
 * Read — the connect dialog's pairing poll (T06). Surfaces the operator's WhatsApp channel state so
 * the dialog can render the live QR and detect CONNECTED without a second real-time channel:
 *   - `status`      — from the gateway-owned `channels` row (the gateway's status projector writes
 *     CONNECTED on pairing). No row yet → DISCONNECTED.
 *   - `qr` / `qrExpiresAt` — the freshest still-valid rotation captured from
 *     `integration.channel.pairing_qr_updated` into {@link PairingQrCache}; `null` between rotations
 *     or once expired, so the dialog waits for the next code (or offers retry after the TTL).
 *
 * A BFF existence read: direct table + in-process cache, no aggregate orchestration. Polled ~every
 * 2s while the dialog is open — deliberately lean (single indexed lookup) versus the Home dashboard.
 */
@injectable()
export class GetChannelPairingStatus extends Handler<typeof GetChannelPairingStatusInputSchema, typeof GetChannelPairingStatusOutputSchema> {
	readonly name = 'get_channel_pairing_status' as const
	readonly inputSchema = GetChannelPairingStatusInputSchema
	readonly outputSchema = GetChannelPairingStatusOutputSchema

	constructor(
		private readonly db: DrizzleClient,
		private readonly qrCache: PairingQrCache,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const [row] = await this.db
			.select({ id: channels.id, status: channels.status })
			.from(channels)
			.where(and(eq(channels.ownerId, input.ownerId), eq(channels.kind, ChannelKind.WHATSAPP)))
			.orderBy(desc(channels.updatedAt))
			.limit(1)

		const status = (row?.status as ChannelStatus | undefined) ?? ChannelStatus.DISCONNECTED

		// A paired channel needs no QR — drop any stale rotation so the dialog flips straight to success.
		if (status === ChannelStatus.CONNECTED) {
			this.qrCache.clear(input.ownerId)
			return { channelId: row?.id ?? null, status, qr: null, qrExpiresAt: null }
		}

		const cached = this.qrCache.get(input.ownerId)
		return {
			channelId: row?.id ?? null,
			status,
			qr: cached?.qr ?? null,
			qrExpiresAt: cached?.qrExpiresAt.toISOString() ?? null,
		}
	}
}
