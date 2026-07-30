import { describe, expect, test } from 'bun:test'
/**
 * Runtime half of the union-slots narrowing parity check — the COMPILE-TIME half (the actual
 * regression pin) lives in union-narrowing.typecheck.ts, which the authoritative `tsc` gate
 * type-checks (bun strips types, so a .test.ts alone would never fail on a narrowing regression).
 */
import type { ListenEvents200 } from '@codm/client-typescript/typescript'
import type { ServerEvent } from '@codm/client-typescript/go'
import { narrowDaemonOrigin, narrowGatewayOrigin } from './union-narrowing.typecheck'

describe('union-slots narrowing parity (compile-time pin in union-narrowing.typecheck.ts)', () => {
	test('both origins narrow integration.channel_message.received to the typed payload', () => {
		const frame = {
			name: 'integration.channel_message.received',
			ownerId: 'owner-1',
			payload: {
				channelId: '4b6f6b0a-0000-4000-8000-000000000000',
				messageId: 'wamid.1',
				internalMessageId: '4b6f6b0a-0000-4000-8000-000000000001',
				remoteId: '5511999999999@s.whatsapp.net',
				senderId: '5511999999999',
				fromMe: false,
				isGroup: false,
				timestamp: 1753200000,
				occurredAt: '2026-07-23T00:00:00Z',
				observedAt: '2026-07-23T00:00:01Z',
				messageType: 'TEXT',
				platform: 'WHATSAPP',
				ownerId: 'owner-1',
				content: { text: 'hello' },
				platformData: { isEphemeral: false, isViewOnce: false, isGroup: false, pushName: 'Ada' },
			},
		} satisfies ListenEvents200

		expect(narrowDaemonOrigin(frame)).toEqual({ text: 'hello', pushName: 'Ada' })

		const serverEvent = {
			id: 'evt-1',
			entityId: '4b6f6b0a-0000-4000-8000-000000000000',
			ownerId: 'owner-1',
			time: '2026-07-23T00:00:00Z',
			name: 'integration.channel_message.received',
			payload: frame.payload,
		} as ServerEvent

		expect(narrowGatewayOrigin(serverEvent)).toEqual({ text: 'hello', pushName: 'Ada' })
	})
})
