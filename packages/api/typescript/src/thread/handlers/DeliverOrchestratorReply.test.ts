import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { scheduledCommands } from '@codedm/contracts/db'
import { DrizzleClient } from '@codedm/core-typescript'
import { TestBed, givenThread } from '@test/support'
import { OrchestratorRepliedEvent } from '@codedm/contracts-typescript/wire/events'
import { TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { TranscriptRepository } from '../repositories/TranscriptRepository'
import { DeliverOrchestratorReply } from './DeliverOrchestratorReply'

/**
 * The handler is THIN since B3 — it maps the envelope and delegates. The behaviour it used to own
 * (transcript entry, quote resolution, atomicity with the delivery order) is proven at its new home,
 * `usecases/RecordOrchestratorReply.test.ts`. What is left to prove here is exactly the handler's job:
 * the envelope guard, and that a valid envelope reaches the use case.
 */
describe('DeliverOrchestratorReply — the envelope guard and the delegation', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let db: DrizzleClient

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
		db = testBed.resolve(DrizzleClient)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('delegates: a valid envelope produces the SYSTEM entry and the delivery command', async () => {
		const thread = await givenThread(testBed)

		await testBed
			.resolve(DeliverOrchestratorReply)
			.handle(new OrchestratorRepliedEvent({ ownerId: OPERATOR_ID, payload: { threadId: thread.id.value, text: 'sim, claro' } }) as never)

		const entries = await testBed.resolve(TranscriptRepository).recentByThread(thread.id.value, 10)
		expect(entries.find(e => e.kind === TranscriptKind.SYSTEM)?.text).toBe('sim, claro')
		const [command] = await db.select().from(scheduledCommands)
		expect(command?.name).toBe('deliver_channel_message')
	})

	it('an envelope with no owner is dropped before anything is written', async () => {
		const thread = await givenThread(testBed)
		const before = await testBed.probe().snapshot(['transcriptEntries', 'scheduledCommands'] as const)

		await testBed
			.resolve(DeliverOrchestratorReply)
			.handle({ name: OrchestratorRepliedEvent.name, payload: { threadId: thread.id.value, text: 'sem dono' } } as never)

		expect(await testBed.probe().snapshot(['transcriptEntries', 'scheduledCommands'] as const)).toEqual(before)
	})
})
