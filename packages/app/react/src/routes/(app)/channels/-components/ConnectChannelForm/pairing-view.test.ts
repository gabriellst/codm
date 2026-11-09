import { describe, expect, it } from 'bun:test'
import { ChannelStatusEnum } from '@codm/client-typescript/go'
import { pairingView, type PairingFacts } from './pairing-view'

const facts = (over: Partial<PairingFacts> = {}): PairingFacts => ({
	connected: false,
	failed: false,
	expired: false,
	connectAnswered: false,
	qr: null,
	polledStatus: undefined,
	...over,
})

describe('pairingView — which screen the connect form shows', () => {
	it('spins while the connect call is still out', () => {
		expect(pairingView(facts())).toBe('starting')
	})

	it('keeps spinning while a resumed session is still coming up', () => {
		expect(pairingView(facts({ connectAnswered: true, polledStatus: ChannelStatusEnum.CONNECTING }))).toBe('starting')
	})

	it('shows the QR the connect call handed back', () => {
		expect(pairingView(facts({ connectAnswered: true, qr: '2@abc', polledStatus: ChannelStatusEnum.CONNECTING }))).toBe('qr')
	})

	// 2026-11-08: the device was unlinked from the phone, the connect resumed the stored session
	// (no QR), WhatsApp answered 401 and the gateway evicted the channel. The poll read DISCONNECTED
	// from then on and the form had no screen for it, so the spinner turned forever.
	it('offers a retry once a session resumed without a QR is refused', () => {
		expect(pairingView(facts({ connectAnswered: true, polledStatus: ChannelStatusEnum.DISCONNECTED }))).toBe('dropped')
	})

	it('does not call a pairing in progress dropped — a QR on screen has its own expiry', () => {
		expect(pairingView(facts({ connectAnswered: true, qr: '2@abc', polledStatus: ChannelStatusEnum.DISCONNECTED }))).toBe('qr')
	})

	it('does not read DISCONNECTED before the connect call has answered', () => {
		expect(pairingView(facts({ polledStatus: ChannelStatusEnum.DISCONNECTED }))).toBe('starting')
	})

	it('lets a reconnect that lands win over a DISCONNECTED read', () => {
		expect(pairingView(facts({ connected: true, connectAnswered: true, polledStatus: ChannelStatusEnum.DISCONNECTED }))).toBe('connected')
	})

	it('puts a failed call ahead of everything but a connected channel', () => {
		expect(pairingView(facts({ failed: true, connectAnswered: true, polledStatus: ChannelStatusEnum.DISCONNECTED }))).toBe('error')
		expect(pairingView(facts({ failed: true, connected: true }))).toBe('connected')
	})

	it('shows the expired screen once a QR outlived its TTL', () => {
		expect(pairingView(facts({ connectAnswered: true, qr: '2@abc', expired: true }))).toBe('expired')
	})
})
