import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread, testId } from '@test/support'
import { DomainEventRepository, type BaseError } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository } from '@agent/repositories'
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
			.execute({ ownerId, threadId: missingThreadId, goal: 'põe um toggle de dark mode', originEntryId: testId('fork-issue', 'entry') })
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
})
