import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread, givenWorkspace } from '@test/support'
import { ThreadStatus } from '@codedm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { ThreadRepository } from '@thread/repositories'
import { GetHomeDashboard } from './GetHomeDashboard'

/**
 * F1 — THE CONVERSATION LIST IS NOT THE ACTIVE-SESSION LIST.
 *
 * The sidebar rendered `activeSessions`, which filters to `RUNNING | NEEDS_ATTENTION`. A thread that
 * is simply IDLE — the normal state of a conversation nobody is being answered in right now — was
 * therefore invisible: the founder had one real thread, with real messages, and the sidebar said
 * "Nenhuma conversa ainda".
 *
 * The bug was one word at a call site, but the reason it survived is that both fields are plausible
 * names for "the threads". So the test asserts the DISTINCTION rather than either list alone: an idle
 * thread must appear in one and not the other, which is a statement neither field can satisfy by
 * accident.
 */
describe('GetHomeDashboard — threads vs activeSessions', () => {
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

	it('AC-F1.1 — an IDLE thread is listed as a conversation but is NOT an active session', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: OPERATOR_ID })

		expect(dashboard.threads.map(t => t.threadId)).toContain(thread.id.value)
		expect(dashboard.activeSessions.map(t => t.threadId)).not.toContain(thread.id.value)
	})

	it('a RUNNING thread appears in BOTH — the conversation list is a superset', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })
		// `givenThread` has no status override (a thread is born IDLE and transitions), so the state is
		// set through the repository — the same shape `givenIssue` uses to reach COMPLETED.
		thread.status = ThreadStatus.RUNNING
		await testBed.resolve(ThreadRepository).save(thread)

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: OPERATOR_ID })

		expect(dashboard.threads.map(t => t.threadId)).toContain(thread.id.value)
		expect(dashboard.activeSessions.map(t => t.threadId)).toContain(thread.id.value)
	})
})
