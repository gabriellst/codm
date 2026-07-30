import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue, givenStop, givenThread } from '@test/support'
import { IssueArchiveReason, IssueStatus, StopKind, StopResolution } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { DeleteThread } from './DeleteThread'

/**
 * C-DEL DeleteThread (thread-deletion spec, decisions 2 and 8).
 *
 * The use case owns ONE rule the entity cannot: "trabalho vivo bloqueia". It is cross-aggregate —
 * an issue is another context's row and a stop is a child this aggregate does not hydrate — so the
 * use case READS the two facts and decides, and the code it raises is an ApplicationError.
 *
 * The double-delete guard is NOT tested here beyond its propagation: it is an invariant of the
 * aggregate and its own test lives in `entities/Thread.test.ts` (the golden rule — a use case test
 * does not re-prove field-level rules).
 */
describe('DeleteThread use case', () => {
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

	const deleteThread = () => testBed.resolve(DeleteThread)
	const reload = (threadId: string) => testBed.resolve(ThreadRepository).findById(threadId)

	it('AC-1 — a clean thread is marked deleted, and the row survives', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		await deleteThread().execute({ ownerId: OPERATOR_ID, threadId: thread.id.value })

		// SOFT: the aggregate is still loadable — that is the whole of decision 1. A hard delete would
		// make this undefined and take the transcript with it.
		const reloaded = await reload(thread.id.value)
		expect(reloaded).toBeDefined()
		expect(reloaded?.deletedAt).toBeInstanceOf(Date)
	})

	it('AC-1 — the second call is rejected (THREAD_ALREADY_DELETED)', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		await deleteThread().execute({ ownerId: OPERATOR_ID, threadId: thread.id.value })

		await expect(deleteThread().execute({ ownerId: OPERATOR_ID, threadId: thread.id.value })).rejects.toThrow(
			expect.objectContaining({ name: 'THREAD_ALREADY_DELETED' }),
		)
	})

	it('rejects an unknown thread and another owner’s thread the same way (THREAD_NOT_FOUND)', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		await expect(deleteThread().execute({ ownerId: OPERATOR_ID, threadId: '00000000-0000-4000-8000-0000000000ff' })).rejects.toThrow(
			expect.objectContaining({ name: 'THREAD_NOT_FOUND' }),
		)
		await expect(deleteThread().execute({ ownerId: '00000000-0000-4000-8000-00000000dead', threadId: thread.id.value })).rejects.toThrow(
			expect.objectContaining({ name: 'THREAD_NOT_FOUND' }),
		)
	})

	/**
	 * AC-2, half one. FALSEADOR AC-8a targets exactly this pair: disable the live-work check in
	 * `DeleteThread` and both this test and the stop one below go red.
	 */
	it('AC-2 — a non-archived WORKING issue blocks the delete (THREAD_HAS_ACTIVE_WORK), thread intact', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, status: IssueStatus.WORKING })

		await expect(deleteThread().execute({ ownerId: OPERATOR_ID, threadId: thread.id.value })).rejects.toThrow(
			expect.objectContaining({ name: 'THREAD_HAS_ACTIVE_WORK' }),
		)
		expect((await reload(thread.id.value))?.deletedAt).toBeUndefined()
	})

	it('AC-2 — an OPEN stop blocks the delete (THREAD_HAS_ACTIVE_WORK), thread intact', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		await givenStop(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, kind: StopKind.HUMAN_REQUESTED })

		await expect(deleteThread().execute({ ownerId: OPERATOR_ID, threadId: thread.id.value })).rejects.toThrow(
			expect.objectContaining({ name: 'THREAD_HAS_ACTIVE_WORK' }),
		)
		expect((await reload(thread.id.value))?.deletedAt).toBeUndefined()
	})

	/**
	 * The guard is about LIVE work, not about history — otherwise a thread that ever worked could never
	 * be deleted, and the operator's only exit would be to keep it forever. Both halves of the condition
	 * are asserted in their resolved form, in one thread, so a guard that merely checks "any issue" or
	 * "any stop" fails here.
	 */
	it('AC-2 — a COMPLETED issue and a RESOLVED stop do not block', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, status: IssueStatus.COMPLETED })
		const stop = await givenStop(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, kind: StopKind.HUMAN_REQUESTED })
		const repo = testBed.resolve(ThreadRepository)
		const loaded = (await repo.findById(thread.id.value))!
		loaded.resolveStop(stop, StopResolution.TAKE_OVER)
		await repo.save(loaded)

		await deleteThread().execute({ ownerId: OPERATOR_ID, threadId: thread.id.value })

		expect((await reload(thread.id.value))?.deletedAt).toBeInstanceOf(Date)
	})

	it('AC-2 — an ARCHIVED working issue does not block (the operator already put it away)', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, status: IssueStatus.WORKING })
		issue.archive(IssueArchiveReason.MANUAL)
		await testBed.resolve(IssueRepository).save(issue)

		await deleteThread().execute({ ownerId: OPERATOR_ID, threadId: thread.id.value })

		expect((await reload(thread.id.value))?.deletedAt).toBeInstanceOf(Date)
	})
})
