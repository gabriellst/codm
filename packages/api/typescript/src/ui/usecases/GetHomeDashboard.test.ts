import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue, givenThread, givenWorkspace } from '@test/support'
import { IssueStatus, ThreadStatus } from '@codm/contracts-typescript/wire/enums'
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

	/**
	 * THE BUG THE FOUNDER SAW: "1 agente trabalhando agora" in the headline, "Nenhuma sessão ativa"
	 * directly beneath it, on the same payload.
	 *
	 * `threads.status` is written in exactly three places — `create()` → IDLE, `pause()` → PAUSED,
	 * `resume()` → IDLE (`setStatus` has no caller) — so the column NEVER holds RUNNING or
	 * NEEDS_ATTENTION, which are the only two values `activeSessions` filters for. The block was empty
	 * by construction, permanently, no matter what the agents were doing.
	 *
	 * Note this test does not touch `thread.status` at all: it creates the state the PRODUCT creates
	 * (an issue working on a thread) and asserts the dashboard reflects it. Setting the column by hand
	 * is what let the old version of this test pass over a field the product cannot actually set.
	 *
	 * FALSIFIER: read `t.status` from the column again in `GetHomeDashboard` instead of deriving, and
	 * this goes red while the IDLE case above stays green.
	 */
	it('a thread with a WORKING issue is RUNNING and IS an active session — status is derived, not stored', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })
		await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, key: 'working-now', status: IssueStatus.WORKING })

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: OPERATOR_ID })

		// The headline and the block must agree — that disagreement WAS the bug.
		expect(dashboard.agentsRunningNow).toBe(1)
		expect(dashboard.activeSessions.map(t => t.threadId)).toContain(thread.id.value)
		expect(dashboard.threads.find(t => t.threadId === thread.id.value)?.status).toBe(ThreadStatus.RUNNING)
	})

	it('the operator pausing beats work in flight — PAUSED outranks RUNNING', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })
		await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, key: 'working-now', status: IssueStatus.WORKING })
		thread.pause()
		await testBed.resolve(ThreadRepository).save(thread)

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: OPERATOR_ID })

		expect(dashboard.threads.find(t => t.threadId === thread.id.value)?.status).toBe(ThreadStatus.PAUSED)
		// Paused is not "active" — the operator asked for silence.
		expect(dashboard.activeSessions.map(t => t.threadId)).not.toContain(thread.id.value)
	})
})
