import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread, testId } from '@test/support'
import { DomainEventRepository, type BaseError } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind, ProviderKind, PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { ForkIssue } from './ForkIssue'
import { IssueForkedEvent } from '../events/IssueForkedEvent'

/**
 * `ForkIssue` — the thread + provider lookup moved here from `ForkIssueController`
 * (import-direction#R1: controllers never touch repositories, they validate and call a use case).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * THE PROPERTY THAT MATTERS IS THAT THE MOVE CHANGED NOTHING OBSERVABLE. Before, the controller read
 * the thread via `ThreadRepository`, resolved `provider` from it, and forwarded the value on the wire
 * to the use case. Now the use case resolves both itself from `threadId` alone. This suite asserts the
 * two outcomes that behavior owed the caller and still must: a vanished thread refuses with the SAME
 * code (`AGENT_RUN_SCOPE_MISMATCH`) and writes NOTHING, and a real thread's `providers[0]` is exactly
 * the value that lands in both the mailbox `WORK` item and `IssueForkedEvent` — nobody downstream can
 * tell the resolution moved.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
describe('ForkIssue — thread + provider resolved from the repository, not the wire', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const ownerId = testId('fork-issue', 'owner')

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('a thread that does not exist refuses with AGENT_RUN_SCOPE_MISMATCH and writes nothing', async () => {
		const useCase = testBed.resolve(ForkIssue)
		const eventRepo = testBed.resolve(DomainEventRepository)
		const before = await testBed.probe().snapshot(['events', 'outbox'])

		const missingThreadId = testId('fork-issue', 'missing-thread')
		const failure = await useCase
			.execute({
				ownerId,
				threadId: missingThreadId,
				goal: 'põe um toggle de dark mode',
				originEntryId: testId('fork-issue', 'entry'),
				posture: PermissionPosture.AUTO,
			})
			.then(
				() => undefined,
				(error: unknown) => error,
			)

		expect(failure).toEqual(expect.objectContaining({ name: 'AGENT_RUN_SCOPE_MISMATCH' }) as BaseError)
		expect(await eventRepo.findByType(IssueForkedEvent)).toHaveLength(0)
		expect(await testBed.probe().snapshot(['events', 'outbox'])).toEqual(before)
	})

	it("forks the issue with the THREAD's own provider — resolved server-side, never a wire argument", async () => {
		const thread = await givenThread(testBed, { ownerId, providers: [ProviderKind.CODEX] })
		const useCase = testBed.resolve(ForkIssue)
		const eventRepo = testBed.resolve(DomainEventRepository)
		const originEntryId = testId('fork-issue', 'entry')

		const out = await useCase.execute({
			ownerId,
			threadId: thread.id.value,
			goal: 'põe um toggle de dark mode nas configurações',
			originEntryId,
			posture: PermissionPosture.AUTO,
		})

		expect(out.issueId).toBeDefined()
		expect(out.key).toBeDefined()

		// The mailbox item — the same provider a live `AgentRunnerFactory` would need to pick the CLI —
		// carries the thread's OWN binding, resolved from the repository the controller used to read.
		const mailbox = testBed.resolve(MailboxRepository)
		const claimed = await mailbox.claimNext('test-worker', 60_000)
		expect(claimed?.targetKind).toBe(MailboxTargetKind.ISSUE)
		expect(claimed?.targetId).toBe(out.issueId)
		expect(claimed?.kind).toBe(MailboxItemKind.WORK)
		expect(claimed?.payload).toEqual(
			expect.objectContaining({
				issueId: out.issueId,
				threadId: thread.id.value,
				provider: ProviderKind.CODEX,
				originEntryId,
			}),
		)

		const events = await eventRepo.findByType(IssueForkedEvent)
		expect(events).toHaveLength(1)
		expect(events[0]?.payload).toEqual(
			expect.objectContaining({
				issueId: out.issueId,
				threadId: thread.id.value,
				provider: ProviderKind.CODEX,
				originEntryId,
			}),
		)
	})

	/**
	 * THE SHORT KEY AND THE TITLE (fase 0, item 4). Keys were a slug of the goal's first 40 characters;
	 * now they are `<PREFIX>-<n>`, numbered per WORKSPACE — two groups on the same repository share the
	 * sequence — and the card title is the orchestrator's short title when it gives one.
	 *
	 * Falsifier: revert to `uniqueSlugKey` and the keys stop matching `^[A-Z0-9]+-\d+$`; scope the counter
	 * by thread and the second group's issue restarts at 1.
	 */
	it('keys are <PREFIX>-<n>, numbered per workspace across groups; the short title is used when given', async () => {
		const first = await givenThread(testBed, { ownerId })
		const useCase = testBed.resolve(ForkIssue)
		const fork = (threadId: string, goal: string, title?: string) =>
			useCase.execute({
				ownerId,
				threadId,
				goal,
				title,
				originEntryId: testId('fork-issue', `entry-${goal}`),
				posture: PermissionPosture.AUTO,
			})

		const one = await fork(first.id.value, 'Pedido no grupo (12/11, de quem tem libera): põe um toggle de dark mode', 'Toggle de dark mode')
		const two = await fork(first.id.value, 'corrige o rodapé')

		expect(one.key).toMatch(/^[A-Z0-9]+-1$/)
		const prefix = one.key.split('-')[0]
		expect(two.key).toBe(`${prefix}-2`)

		// A SECOND GROUP on the SAME workspace continues the sequence; a group on another workspace starts at 1.
		const sameRepo = await givenThread(testBed, { ownerId, workspaceId: first.workspaceId })
		const otherRepo = await givenThread(testBed, { ownerId })
		expect((await fork(sameRepo.id.value, 'ajusta o cabeçalho')).key).toBe(`${prefix}-3`)
		expect((await fork(otherRepo.id.value, 'outro projeto')).key).toMatch(/^[A-Z0-9]+-1$/)

		const events = await testBed.resolve(DomainEventRepository).findByType(IssueForkedEvent)
		const titles = events.map(event => event.payload.title)
		expect(titles).toContain('Toggle de dark mode')
		expect(titles).toContain('corrige o rodapé')
	})
})
