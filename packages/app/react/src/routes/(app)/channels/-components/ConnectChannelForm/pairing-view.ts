import { ChannelStatusEnum, type ChannelStatus } from '@codm/client-typescript/go'

/** What the connect form shows — one screen per pairing situation, in this precedence order. */
export type PairingView = 'connected' | 'error' | 'dropped' | 'expired' | 'qr' | 'starting'

export interface PairingFacts {
	/** The connect call itself answered CONNECTED, or the poll already sees the channel CONNECTED. */
	connected: boolean
	/** Resolving the channel or the connect call failed. */
	failed: boolean
	/** A QR was shown and outlived its TTL. */
	expired: boolean
	/** The connect call has answered (successfully). */
	connectAnswered: boolean
	/** The QR the connect call handed back, if it handed one back. */
	qr: string | null
	/** The channel status the 2s poll last read, if it has read one. */
	polledStatus: ChannelStatus | undefined
}

/**
 * Decides the form's screen from what the connect call and the poll have said.
 *
 * ### `dropped` — the session the gateway resumed was refused (2026-11-08)
 * A connect that answers WITHOUT a QR means the gateway resumed a stored session instead of pairing.
 * If the platform then refuses that session — the device was unlinked from the phone: WhatsApp answers
 * 401, whatsmeow deletes the keys and the gateway evicts the channel — the poll reads DISCONNECTED and
 * nothing more will ever happen on its own. Before this state the form had no screen for it: no QR,
 * so the expiry timer never started, and no error, since the connect call itself had succeeded. The
 * operator watched "Iniciando o gateway do WhatsApp…" spin forever. A retry is what unblocks it: the
 * evicted channel is rebuilt from scratch and the next connect hands back a fresh QR.
 *
 * `connected` outranks `dropped`, so a brief DISCONNECTED between two polls that then come back
 * CONNECTED (a whatsmeow reconnect) settles on the connected screen by itself.
 */
export function pairingView(facts: PairingFacts): PairingView {
	if (facts.connected) return 'connected'
	if (facts.failed) return 'error'
	if (facts.connectAnswered && !facts.qr && facts.polledStatus === ChannelStatusEnum.DISCONNECTED) return 'dropped'
	if (facts.expired) return 'expired'
	if (facts.qr) return 'qr'
	return 'starting'
}
