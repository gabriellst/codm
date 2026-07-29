import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread, givenWorkspace } from '@test/support'
import { OPERATOR_ID } from '@auth/operator'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { GetSessionChat } from './GetSessionChat'

/**
 * F4 — THE COMPOSER HAS NO SELECTOR, SO THIS READ IS THE WHOLE DECISION.
 *
 * The console used to render a two-way STEER/DIRECT toggle, seeded from `composerMode` and flippable
 * per message. Two things were wrong with it: it asked the operator, on every message, a question the
 * app already knew the answer to; and because the seed was copied into local state on mount, a thread
 * that paused or resumed while the box was focused left Enter doing one thing while the header said
 * another.
 *
 * With the toggle gone this field alone decides what pressing Enter does — which is why it is worth a
 * test of its own, and why the test asserts the DISTINCTION rather than one state: a mapping that is
 * constant satisfies either half alone.
 */
describe('GetSessionChat — composerMode is a state, not a preference', () => {
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

	const thread = async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		return givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })
	}

	const chatFor = async (threadId: string) => testBed.resolve(GetSessionChat).execute({ ownerId: OPERATOR_ID, threadId })

	/**
	 * AC-F4.1 — paused sends a STEER, running does not.
	 *
	 * Read it as "who is my typing FOR". A paused thread answers nobody, so what the operator types is
	 * instruction for the agents, queued and acted on at resume. A running thread is a live conversation
	 * the orchestrator is holding, so what the operator types is for the PEOPLE in it.
	 *
	 * NOTE: this INVERTS the previous mapping (`paused ? DIRECT : STEER`). The inversion is the change,
	 * not a side effect of one.
	 *
	 * FALSIFIER: flip the ternary in `GetSessionChat` back and both halves go red at once.
	 */
	it('AC-F4.1 — a PAUSED thread composes a STEER', async () => {
		const t = await thread()
		t.pause()
		await testBed.resolve(ThreadRepository).save(t)

		expect((await chatFor(t.id.value)).composerMode).toBe('STEER')
	})

	it('AC-F4.1 — a RUNNING thread does NOT: it composes a DIRECT message', async () => {
		const t = await thread()

		const chat = await chatFor(t.id.value)

		expect(chat.paused).toBe(false)
		expect(chat.composerMode).toBe('DIRECT')
	})

	it('the mode follows the thread across pause and resume — nothing caches the first answer', async () => {
		const t = await thread()
		const threads = testBed.resolve(ThreadRepository)

		t.pause()
		await threads.save(t)
		expect((await chatFor(t.id.value)).composerMode).toBe('STEER')

		t.resume()
		await threads.save(t)
		expect((await chatFor(t.id.value)).composerMode).toBe('DIRECT')
	})
})
