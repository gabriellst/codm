import { describe, expect, it } from 'bun:test'
import type { BaseIntegrationEvent } from '@codedm/core-typescript'
import { StopKind } from '@codedm/contracts-typescript/wire/enums'
import { IssueStopRaisedEvent, ChannelMessageDeliveredEvent } from '@codedm/contracts-typescript/wire/events'
import { browserDeliveryOwnerId } from './ListenEvents'

const OWNER_A = '00000000-0000-4000-8000-00000000000a'
const OWNER_B = '00000000-0000-4000-8000-00000000000b'

/** Simulates the broadcaster's fan-out loop over connected clients using the pure predicate. */
function fanOut(event: BaseIntegrationEvent, clientOwnerIds: string[]): string[] {
	const target = browserDeliveryOwnerId(event)
	if (!target) return []
	return clientOwnerIds.filter(ownerId => ownerId === target)
}

describe('ListenEvents SSE broadcaster filtering', () => {
	const stopRaised = (ownerId: string) =>
		new IssueStopRaisedEvent({
			ownerId,
			payload: { stopId: 'stop-1', issueId: 'issue-1', threadId: 'thread-1', kind: StopKind.HUMAN_REQUESTED },
		}) as unknown as BaseIntegrationEvent

	it('a browser-eligible event resolves to its envelope owner', () => {
		expect(browserDeliveryOwnerId(stopRaised(OWNER_A))).toBe(OWNER_A)
	})

	it('is delivered to the matching-owner client and withheld from a non-matching owner', () => {
		const recipients = fanOut(stopRaised(OWNER_A), [OWNER_A, OWNER_B])
		expect(recipients).toEqual([OWNER_A])
	})

	it('a non-browser event is never delivered (filtered by name)', () => {
		// channel_message.delivered is a receipt watermark — projection-only, NOT on the browser
		// surface (channel_message.received joined BROWSER_EVENTS with the union-slots pilot).
		const notBrowser = new ChannelMessageDeliveredEvent({
			ownerId: OWNER_A,
			payload: {
				channelId: 'ch-1',
				remoteId: 'c-1',
				senderId: 'c-1',
				messageIds: ['m-1'],
				timestamp: 0,
				platform: 'WHATSAPP' as never,
			},
		}) as unknown as BaseIntegrationEvent
		expect(browserDeliveryOwnerId(notBrowser)).toBeUndefined()
		expect(fanOut(notBrowser, [OWNER_A])).toEqual([])
	})

	it('a browser event without an envelope owner is withheld', () => {
		const noOwner = new IssueStopRaisedEvent({
			ownerId: '',
			payload: { stopId: 'stop-1', issueId: 'issue-1', threadId: 'thread-1', kind: StopKind.HUMAN_REQUESTED },
		}) as unknown as BaseIntegrationEvent
		expect(browserDeliveryOwnerId(noOwner)).toBeUndefined()
	})
})
