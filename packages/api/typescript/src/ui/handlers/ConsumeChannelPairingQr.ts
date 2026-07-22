import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codedm/core-typescript'
import { ChannelPairingQrUpdatedEvent } from '@codedm/contracts-typescript/wire/events'
import { PairingQrCache } from '../services/PairingQrCache'

/**
 * BC1 → console. Subscribes to the gateway's `integration.channel.pairing_qr_updated` (a fresh
 * WhatsApp QR, rotating ~every 30s) and stores the newest rotation in the in-process
 * {@link PairingQrCache}, keyed by the envelope `ownerId`.
 *
 * The subscription itself is load-bearing: the RedisExternalMediator only opens a stream when a
 * NAMED handler registers for it, so without this handler the QR event would never be consumed by
 * the TS daemon (the ListenEvents SSE relay is a catch-all that piggybacks on already-open streams).
 * With it, the connect dialog's status poll (`GetChannelPairingStatus`) can hand the live code to
 * the browser. Pure read-model plumbing — no persistence, no further side effects.
 */
@injectable()
export class ConsumeChannelPairingQr extends EventHandler<typeof ChannelPairingQrUpdatedEvent> {
	readonly event = ChannelPairingQrUpdatedEvent

	constructor(private readonly qrCache: PairingQrCache) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId
		if (!ownerId) return
		this.qrCache.set(ownerId, {
			qr: event.payload.qrPayload,
			qrExpiresAt: event.payload.qrExpiresAt,
		})
	}
}
