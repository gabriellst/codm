import { describe, expect, it } from 'bun:test'
import type { ZodLiteral, ZodObject } from 'zod'
import { BaseIntegrationEvent } from '@codm/core-typescript'
import { StopKind } from '@codm/contracts-typescript/wire/enums'
import * as WireEvents from '@codm/contracts-typescript/wire/events'
import { ThreadStopRaisedEvent, ChannelMessageDeliveredEvent, ChannelMessageReceivedEvent } from '@codm/contracts-typescript/wire/events'
import { deliveryOwnerId, isBroadcastableIntegrationEvent, ListenEventsControllerOutputSchema } from './ListenEvents'

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
		new ThreadStopRaisedEvent({
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

	/**
	 * AC-F2.2 — THE GO HALF OF THE SURFACE REACHES THE BROWSER.
	 *
	 * The broadcaster used to admit an event with `event instanceof BaseIntegrationEvent`, and that gate
	 * is true for exactly one of the two shapes this callback receives. A fact THIS daemon published is
	 * a class instance. A fact the Go gateway published travels as an outbox row, is read back as TEXT,
	 * and reaches `notifyCallbacks` as whatever `JSON.parse` returned — a prototype-less object. So the
	 * gate silently withheld every `integration.channel*` fact, which is every inbound WhatsApp message:
	 * the console could not learn about a message except by someone reloading the page.
	 *
	 * The round-trip below is not a stand-in for the ingress — it is the same operation the ingress
	 * performs (`JSON.parse(row.payload)`), and losing the prototype is the whole of what it does.
	 *
	 * FALSIFIER: restore `instanceof BaseIntegrationEvent` as the admission gate in `ListenEvents.ts`
	 * and this test goes red while every other test in this file stays green.
	 */
	it('AC-F2.2 — an INGRESS envelope (plain object, no prototype) is admitted, exactly like a published instance', () => {
		const published = new ChannelMessageReceivedEvent({
			ownerId: OWNER_A,
			payload: { channelId: 'ch-1', remoteId: '5511999999999@s.whatsapp.net', messageType: 'TEXT' } as never,
		})
		const fromIngress: unknown = JSON.parse(JSON.stringify(published))

		// The precondition that made the old gate wrong — stated, so the test explains itself when it fails.
		expect(fromIngress instanceof BaseIntegrationEvent).toBe(false)

		expect(isBroadcastableIntegrationEvent(fromIngress)).toBe(true)
		expect(isBroadcastableIntegrationEvent(published)).toBe(true)
		expect(deliveryOwnerId(fromIngress as BaseIntegrationEvent)).toBe(OWNER_A)
	})

	it('the admission gate still refuses what is not an integration event', () => {
		expect(isBroadcastableIntegrationEvent(null)).toBe(false)
		expect(isBroadcastableIntegrationEvent({ name: 'thread.steered', payload: {} })).toBe(false)
		expect(isBroadcastableIntegrationEvent({ name: 'integration.issue.opened' })).toBe(false)
	})

	it('an event without an envelope owner is withheld (nothing to scope it to)', () => {
		const noOwner = new ThreadStopRaisedEvent({
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
			author: 'HUMAN',
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
