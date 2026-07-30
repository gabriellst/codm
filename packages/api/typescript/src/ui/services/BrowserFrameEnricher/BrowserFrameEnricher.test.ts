import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread, givenIssue } from '@test/support'
import { StopKind, ThreadStatus } from '@codedm/contracts-typescript/wire/enums'
import {
	IssueOpenedEvent,
	ThreadStopRaisedEvent,
	IssueCompletedEvent,
	ChannelMessageReceivedEvent,
} from '@codedm/contracts-typescript/wire/events'
import { OPERATOR_ID } from '@auth/operator'
import { BrowserFrameEnricher } from './BrowserFrameEnricher'

// A channel id is a real uuid on the Thread aggregate — the entity validates it, so a `'ch-1'` here
// fails in `givenThread` long before it could reach the enricher.
const CHANNEL_A = '019e4d24-0000-7041-9e1c-0000000000a1'
const CHANNEL_B = '019e4d24-0000-7041-9e1c-0000000000a2'
const CHANNEL_C = '019e4d24-0000-7041-9e1c-0000000000a3'

/**
 * The SSE enricher synthesizing the two declared `browser.*` frames from integration facts, against
 * REAL read tables (denormalized display fields + derived status).
 */
describe('BrowserFrameEnricher', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('stop_raised → browser.stop_raised (display fields) + browser.thread_status_changed(NEEDS_ATTENTION)', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, contactDisplayName: 'Ada' })
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, key: 'coupon-focus' })

		const frames = await testBed.resolve(BrowserFrameEnricher).enrich(
			new ThreadStopRaisedEvent({
				ownerId: OPERATOR_ID,
				payload: { stopId: 'stop-1', issueId: issue.id.value, threadId: thread.id.value, kind: StopKind.HUMAN_REQUESTED },
			}) as never,
		)

		const stopFrame = frames.find(f => f.name === 'browser.stop_raised')
		expect(stopFrame).toMatchObject({
			threadId: thread.id.value,
			threadDisplayName: 'Ada',
			issueId: issue.id.value,
			issueKey: 'coupon-focus',
			stopKind: StopKind.HUMAN_REQUESTED,
		})
		const statusFrame = frames.find(f => f.name === 'browser.thread_status_changed')
		expect(statusFrame).toMatchObject({ threadId: thread.id.value, status: ThreadStatus.NEEDS_ATTENTION })
	})

	it('opened → browser.thread_status_changed(RUNNING) with a live agent count', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		const frames = await testBed.resolve(BrowserFrameEnricher).enrich(
			new IssueOpenedEvent({
				ownerId: OPERATOR_ID,
				payload: {
					issueId: '019e4d24-0000-7041-9e1c-000000000010',
					threadId: thread.id.value,
					key: 'k',
					title: 't',
					provider: thread.providers[0],
				},
			}) as never,
		)

		expect(frames).toHaveLength(1)
		expect(frames[0]).toMatchObject({ name: 'browser.thread_status_changed', threadId: thread.id.value, status: ThreadStatus.RUNNING })
		expect((frames[0] as { agentsRunningNow: number }).agentsRunningNow).toBeGreaterThanOrEqual(1)
	})

	/**
	 * F2 — the inbound message finds its thread.
	 *
	 * `integration.channel_message.received` is addressed by `(channelId, remoteId)` and carries no
	 * `threadId`, so the browser cannot tell whether a message belongs to the conversation it is looking
	 * at. Resolving it is a join, and the join lives here.
	 */
	const inbound = (channelId: string, remoteId: string) =>
		({
			ownerId: OPERATOR_ID,
			payload: { channelId, remoteId, messageType: 'TEXT', content: { text: 'oi' } },
		}) as never

	it('channel_message.received → browser.thread_message_ingested for the attached thread', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, channelId: CHANNEL_A, contactExternalId: '5511@s.whatsapp.net' })

		const frames = await testBed
			.resolve(BrowserFrameEnricher)
			.enrich(new ChannelMessageReceivedEvent(inbound(CHANNEL_A, '5511@s.whatsapp.net')) as never)

		expect(frames).toEqual([{ name: 'browser.thread_message_ingested', threadId: thread.id.value }])
	})

	/**
	 * THE NARROWING, PINNED. This is the shape the Go gateway's fact actually has by the time the
	 * broadcaster hands it over — an outbox row parsed back from TEXT, with no prototype. The enricher
	 * used to narrow with `instanceof`, which is false for exactly this object, so the case above would
	 * pass while the real inbound message synthesized nothing.
	 *
	 * FALSIFIER: change the `switch (event.name)` in `BrowserFrameEnricher` back to
	 * `event instanceof ChannelMessageReceivedEvent` — this goes red, the test above stays green.
	 */
	it('…and it works on the INGRESS shape too, which is the only shape a real inbound message has', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, channelId: CHANNEL_B, contactExternalId: '5522@s.whatsapp.net' })
		const fromIngress = JSON.parse(JSON.stringify(new ChannelMessageReceivedEvent(inbound(CHANNEL_B, '5522@s.whatsapp.net'))))

		expect(fromIngress instanceof ChannelMessageReceivedEvent).toBe(false)

		const frames = await testBed.resolve(BrowserFrameEnricher).enrich(fromIngress)

		expect(frames).toEqual([{ name: 'browser.thread_message_ingested', threadId: thread.id.value }])
	})

	it('an inbound for a contact no thread is attached to synthesizes nothing', async () => {
		await givenThread(testBed, { ownerId: OPERATOR_ID, channelId: CHANNEL_C, contactExternalId: 'known@s.whatsapp.net' })

		const frames = await testBed
			.resolve(BrowserFrameEnricher)
			.enrich(new ChannelMessageReceivedEvent(inbound(CHANNEL_C, 'stranger@s.whatsapp.net')) as never)

		expect(frames).toHaveLength(0)
	})

	it('a non-mapped fact yields no enriched frames', async () => {
		const frames = await testBed.resolve(BrowserFrameEnricher).enrich(
			new IssueCompletedEvent({
				ownerId: '',
				payload: { issueId: 'i', threadId: 't', key: 'k', completedAt: new Date() },
			}) as never,
		)
		// Empty ownerId short-circuits (envelope tenancy) → nothing synthesized.
		expect(frames).toHaveLength(0)
	})
})
