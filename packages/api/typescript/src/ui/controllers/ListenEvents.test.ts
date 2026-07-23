import { describe, expect, it } from 'bun:test'
import type { ZodLiteral, ZodObject } from 'zod'
import type { BaseIntegrationEvent } from '@codedm/core-typescript'
import { StopKind } from '@codedm/contracts-typescript/wire/enums'
import * as WireEvents from '@codedm/contracts-typescript/wire/events'
import { IssueStopRaisedEvent, ChannelMessageDeliveredEvent, ChannelMessageReceivedEvent } from '@codedm/contracts-typescript/wire/events'
import { deliveryOwnerId, ListenEventsControllerOutputSchema } from './ListenEvents'

const OWNER_A = '00000000-0000-4000-8000-00000000000a'
const OWNER_B = '00000000-0000-4000-8000-00000000000b'

/** Simulates the broadcaster's fan-out loop over connected clients using the pure predicate. */
function fanOut(event: BaseIntegrationEvent, clientOwnerIds: string[]): string[] {
	const target = deliveryOwnerId(event)
	if (!target) return []
	return clientOwnerIds.filter(ownerId => ownerId === target)
}

describe('ListenEvents SSE broadcaster filtering', () => {
	const stopRaised = (ownerId: string) =>
		new IssueStopRaisedEvent({
			ownerId,
			payload: { stopId: 'stop-1', issueId: 'issue-1', threadId: 'thread-1', kind: StopKind.HUMAN_REQUESTED },
		}) as unknown as BaseIntegrationEvent

	it('an integration event resolves to its envelope owner', () => {
		expect(deliveryOwnerId(stopRaised(OWNER_A))).toBe(OWNER_A)
	})

	it('is delivered to the matching-owner client and withheld from a non-matching owner', () => {
		const recipients = fanOut(stopRaised(OWNER_A), [OWNER_A, OWNER_B])
		expect(recipients).toEqual([OWNER_A])
	})

	it('EVERY integration event is forwarded — no allowlist (founder ratification 23-jul)', () => {
		// channel_message.delivered used to be filtered out by the BROWSER_EVENTS allowlist; the
		// declarative surface forwards the whole contract, filtered only by tenancy.
		const previouslyFiltered = new ChannelMessageDeliveredEvent({
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
		expect(deliveryOwnerId(previouslyFiltered)).toBe(OWNER_A)
		expect(fanOut(previouslyFiltered, [OWNER_A, OWNER_B])).toEqual([OWNER_A])
	})

	it('an event without an envelope owner is withheld (nothing to scope it to)', () => {
		const noOwner = new IssueStopRaisedEvent({
			ownerId: '',
			payload: { stopId: 'stop-1', issueId: 'issue-1', threadId: 'thread-1', kind: StopKind.HUMAN_REQUESTED },
		}) as unknown as BaseIntegrationEvent
		expect(deliveryOwnerId(noOwner)).toBeUndefined()
	})
})

describe('ListenEvents declarative output union (the contract is the single source)', () => {
	// The literal `name` value of a composed union arm.
	const armName = (arm: ZodObject): string => {
		const literal = arm.shape.name as ZodLiteral<string>
		return literal.def.values[0] as string
	}
	const arms = (ListenEventsControllerOutputSchema.options as ZodObject[]).map(armName)

	it('carries an arm for EVERY integration event class in the wire barrel — zero omissions', () => {
		const contractNames = Object.values(WireEvents)
			.filter((e): e is { name: string; schema: unknown } => e != null && typeof e === 'function' && 'schema' in e && 'name' in e)
			.map(e => e.name)
		expect(contractNames.length).toBeGreaterThan(0)
		for (const name of contractNames) {
			expect(arms, `contract event ${name} missing from the SSE output union`).toContain(name)
		}
	})

	it('carries the two enriched browser.* frames alongside the contract surface', () => {
		expect(arms).toContain('browser.thread_status_changed')
		expect(arms).toContain('browser.stop_raised')
	})

	it('materializes union-slot payloads from the owner client (never the opaque contract slots)', () => {
		const received = (ListenEventsControllerOutputSchema.options as ZodObject[]).find(
			arm => armName(arm) === ChannelMessageReceivedEvent.name,
		)
		expect(received).toBeDefined()
		// The materialized payload is the owner's generated aggregate union — parsing a typed WhatsApp
		// TEXT variant succeeds with the content slot preserved as a SHAPE (not swallowed by unknown).
		const parsed = received!.shape.payload.safeParse({
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
			ownerId: OWNER_A,
			content: { text: 'hello' },
			platformData: { isEphemeral: false, isViewOnce: false, isGroup: false, pushName: 'Ada' },
		})
		expect(parsed.success).toBe(true)
		// A payload violating the WHATSAPP/TEXT variant contract fails — the slot is materialized,
		// so an opaque-passthrough (which would accept anything) is a regression.
		const invalid = received!.shape.payload.safeParse({ platform: 'WHATSAPP', messageType: 'TEXT' })
		expect(invalid.success).toBe(false)
	})
})
