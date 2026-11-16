import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { scheduledCommands } from '@codm/contracts/db'
import { LibSqlDatabaseDriver, LibSqlTransaction } from '@codm/core-typescript'
import { TestBed, givenThread } from '@test/support'
import { OrchestratorRepliedEvent } from '@codm/contracts-typescript/wire/events'
import { TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from '../repositories/ThreadRepository'
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
	let db: LibSqlTransaction

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		db = testBed.resolve(LibSqlDatabaseDriver).db
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
			.handle(
				new OrchestratorRepliedEvent({ ownerId: MOCK_CLOUD_OWNER_ID, payload: { threadId: thread.id.value, text: 'sim, claro' } }) as never,
			)

		const entries = await testBed.resolve(ThreadRepository).recentEntries(thread.id.value, 10)
		expect(entries.find(e => e.kind === TranscriptKind.SYSTEM)?.text).toBe('sim, claro')
		const [command] = await db.select().from(scheduledCommands)
		expect(command?.name).toBe('deliver_channel_message')
	})

	/**
	 * A RESULT'S ANSWER IS THAT ISSUE'S MESSAGE. Before this, no agent message in the transcript said which
	 * issue it came from (measured on a real install: 0% of thousands), so an issue's timeline could not
	 * show what was said about it and a reply-quote could not point back to it.
	 *
	 * Falsifier: drop `issueId` from the delegation (or from `RecordOrchestratorReply`) and the entry
	 * records unbound.
	 */
	it('the issue the reply speaks for is recorded on the SYSTEM entry', async () => {
		const thread = await givenThread(testBed)
		const issueId = '019e4d24-6524-7041-9e1c-8108180cde01'

		await testBed.resolve(DeliverOrchestratorReply).handle(
			new OrchestratorRepliedEvent({
				ownerId: MOCK_CLOUD_OWNER_ID,
				payload: { threadId: thread.id.value, text: 'pronto, no ar', issueId },
			}) as never,
		)

		const entries = await testBed.resolve(ThreadRepository).recentEntries(thread.id.value, 10)
		expect(entries.find(e => e.kind === TranscriptKind.SYSTEM)?.issueId).toBe(issueId)
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
