import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread } from '@test/support'
import { TranscriptKind } from '@template/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { IngestChannelMessage } from './IngestChannelMessage'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { TranscriptRepository } from '../repositories/TranscriptRepository'
import { MessageIngestedEvent } from '../events'
import { DomainEventRepository } from '@template/core-typescript'

/**
 * C16 IngestChannelMessage — the invocation-gate matrix. The message is ALWAYS transcribed +
 * buffered (observation ≠ invocation); `invocable` is the AND of three gates: not paused, sender may
 * invoke, and (when the mention gate is on) the tag is present. Only an invocable inbound hands off
 * to classification downstream.
 */
describe('IngestChannelMessage gate matrix', () => {
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

	const ingest = (threadId: string, senderExternalId: string, text: string) =>
		testBed.resolve(IngestChannelMessage).execute({ threadId, senderExternalId, text, receivedAt: new Date() })

	it('always transcribes, even from a non-invoking sender (observation != invocation)', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		// The seeded contact participant has canInvoke=false.
		const out = await ingest(thread.id.value, thread.contactRef.externalId, 'just watching')

		expect(out.invocable).toBe(false)
		const entries = await testBed.resolve(TranscriptRepository).listByThread(thread.id.value)
		const contact = entries.filter(e => e.kind === TranscriptKind.CONTACT)
		expect(contact).toHaveLength(1)
		expect(contact[0]?.text).toBe('just watching')
		// The ingest fact is emitted regardless of invocability.
		const events = await testBed.resolve(DomainEventRepository).findByType(MessageIngestedEvent)
		expect(events).toHaveLength(1)
	})

	it('gate: an unknown sender (no participant deny) is invocable', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const out = await ingest(thread.id.value, 'stranger-42', 'ship the coupon fix')
		expect(out.invocable).toBe(true)
	})

	it('gate: a paused thread is never invocable', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		thread.pause()
		await testBed.resolve(ThreadRepository).save(thread)

		const out = await ingest(thread.id.value, 'stranger-42', 'ship the coupon fix')
		expect(out.invocable).toBe(false)
	})

	it('gate: a participant with canInvoke=false is denied', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		// The seeded contact participant is a read-only participant.
		const out = await ingest(thread.id.value, thread.contactRef.externalId, 'do the thing')
		expect(out.invocable).toBe(false)
	})

	it('gate: the mention gate requires the tag to be present', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		thread.configureMentionGate({ enabled: true, tag: '@bot' })
		await testBed.resolve(ThreadRepository).save(thread)

		const withoutTag = await ingest(thread.id.value, 'stranger-42', 'no mention here')
		expect(withoutTag.invocable).toBe(false)

		const withTag = await ingest(thread.id.value, 'stranger-42', 'hey @bot ship it')
		expect(withTag.invocable).toBe(true)
	})
})
