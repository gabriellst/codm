import { describe, expect, it } from 'bun:test'
import type { BaseIntegrationEvent } from '@template/core-typescript'
import { StopKind } from '@template/contracts-typescript/wire/enums'
import { IssueStopRaisedEvent, ChannelMessageReceivedEvent } from '@template/contracts-typescript/wire/events'
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
		const notBrowser = new ChannelMessageReceivedEvent({
			ownerId: OWNER_A,
			payload: {
				channelId: 'ch-1',
				messageId: 'm-1',
				contactExternalId: 'c-1',
				contactDisplayName: 'x',
				contactKind: 'CONTACT' as never,
				senderExternalId: 'c-1',
				isGroup: false,
				text: 'hi',
				platform: 'WHATSAPP' as never,
				receivedAt: new Date(),
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
