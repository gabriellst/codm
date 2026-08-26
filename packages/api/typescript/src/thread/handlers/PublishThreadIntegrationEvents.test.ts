import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread } from '@test/support'
import { DomainEventRepository } from '@codm/core-typescript'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { IngestChannelMessage } from '../usecases/IngestChannelMessage'
import { MessageIngestedEvent } from '../events/MessageIngestedEvent'
import { PublishThreadIntegrationEvents } from './PublishThreadIntegrationEvents'

/**
 * B5, decision 1 / AC-3 — the threadId gap `integration.channel_message.received` cannot close (it is
 * addressed by `(channelId, remoteId)`, never by `threadId`) is closed on the OUTBOUND side instead:
 * `IngestChannelMessage` already resolves the thread and stamps `threadId` on `MessageIngestedEvent` —
 * nobody republished it, so a browser console had no wire fact to scope a live chat update to one
 * thread without a server-side join (`BrowserFrameEnricher.threadIdForContact`, removed by this same
 * frente).
 *
 * Dispatches the REAL use case rather than hand-constructing the domain event, then reads it BACK from
 * the repository and feeds it to the handler directly — the colocated-handler convention this repo
 * already uses (`DeliverOrchestratorReply.test.ts`: `.handle()` called directly, no `testBed.spy.register`,
 * because wiring the InternalMediator dispatch end-to-end is a FLOW concern, not a handler-test one).
 * This proves the ACTUAL payload shape `IngestChannelMessage` produces reaches the bridge, not a shape
 * this file assumes.
 */
describe('PublishThreadIntegrationEvents — message_ingested bridges to integration.thread.message_ingested', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('AC-3 — an inbound message publishes integration.thread.message_ingested with the SAME threadId, no lookup', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		await testBed
			.resolve(IngestChannelMessage)
			.execute({ threadId: thread.id.value, senderExternalId: thread.contactRef.externalId, text: 'oi', receivedAt: new Date() })

		const [raised] = await testBed.resolve(DomainEventRepository).findByType(MessageIngestedEvent)
		expect(raised).toBeDefined()
		expect(raised?.payload.threadId).toBe(thread.id.value)

		await testBed.resolve(PublishThreadIntegrationEvents).handle(raised as never)

		const published = testBed.externalSpy.getPublishedOfType('integration.thread.message_ingested')
		expect(published).toHaveLength(1)
		expect(published[0]?.payload).toEqual({ threadId: thread.id.value })
	})
})
