import { singleton } from 'tsyringe-neo'

/** The latest pairing QR captured for an operator, with the rotation's expiry. */
export interface CachedPairingQr {
	qr: string
	qrExpiresAt: Date
}

/**
 * In-process cache of the LIVE pairing QR, keyed by operator (`ownerId`).
 *
 * The Go channel gateway produces a fresh WhatsApp QR every ~30s and publishes it as the
 * `integration.channel.pairing_qr_updated` integration event over Redis Streams. The TS daemon only
 * consumes a Redis stream when a NAMED handler subscribes to it (the catch-all SSE relay does not
 * open streams by itself) — so `ConsumeChannelPairingQr` subscribes, and stores each rotation HERE.
 * `GetChannelPairingStatus` (the 2s poll the connect dialog runs) reads it back, so the browser gets
 * the scannable code without a second real-time channel.
 *
 * Deliberately in-memory + singleton: pairing is an ephemeral, seconds-long ceremony; a QR that
 * outlives its `qrExpiresAt` is worthless, and the daemon is a single local process (founder
 * decision 3). Nothing here is a source of truth — the CONNECTED status still lives on the
 * gateway-owned `channels` row. A missed/expired QR simply reads back as `null` and the dialog waits
 * for the next rotation (or offers retry).
 */
@singleton()
export class PairingQrCache {
	private readonly byOwner = new Map<string, CachedPairingQr>()

	/** Record the newest rotation for an operator. Later rotations overwrite earlier ones. */
	set(ownerId: string, entry: CachedPairingQr): void {
		this.byOwner.set(ownerId, entry)
	}

	/**
	 * The freshest still-valid QR for an operator, or `null` when there is none / it has expired.
	 * Expired entries are evicted on read so a stale code is never handed to the console.
	 */
	get(ownerId: string, now: Date = new Date()): CachedPairingQr | null {
		const entry = this.byOwner.get(ownerId)
		if (!entry) return null
		if (entry.qrExpiresAt.getTime() <= now.getTime()) {
			this.byOwner.delete(ownerId)
			return null
		}
		return entry
	}

	/** Drop the cached QR for an operator (e.g. once pairing is CONNECTED). */
	clear(ownerId: string): void {
		this.byOwner.delete(ownerId)
	}
}
