import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue, givenThread } from '@test/support'
import { DomainEventRepository, type ExternalMediator } from '@codm/core-typescript'
import { AskEffect, IssueStatus, OutputRouting, PublishFollowUpKind, StopKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { RecordStopFromExecution } from '@thread/handlers/RecordStopFromExecution'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { AskDecision } from './AskDecision'
import { AskOperator } from './AskOperator'
import { DeclareIssueComplete } from './DeclareIssueComplete'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
import { PublishAgentIntegrationEvents } from '../handlers/PublishAgentIntegrationEvents'

/**
 * `AskDecision` (fase 3, item 1) — the tool an issue asks the group to DECIDE with — and the legacy doors
 * that alias to it. Every case is driven to the GROUP: the fact the tool saves goes through the bridge
 * (`PublishAgentIntegrationEvents`) and the thread's consumer (`RecordStopFromExecution` → `RaiseStop`), and
 * the assertions read the stop row and the message the output policy recorded. That is the chain a
 * dropped `ask` (at the bridge, at the parse) would break without any unit test noticing.
 */
describe('AskDecision — a decision reaches the group with its code', () => {
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

	async function givenIssueOnThread() {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'APP-12' })
		return { threadId: thread.id.value, issueId: issue.id.value }
	}

	/** Every stop fact saved so far → the bridge → the thread's consumer, in order. */
	async function deliverStopFacts(): Promise<void> {
		const published: unknown[] = []
		const mediator = { publish: mock(async (event: unknown) => void published.push(event)) } as unknown as ExternalMediator
		const bridge = new PublishAgentIntegrationEvents(mediator)
		for (const fact of await testBed.resolve(DomainEventRepository).findByType(AgentRunStopRaisedEvent)) {
			await bridge.handle(fact as never)
		}
		for (const event of published) await testBed.resolve(RecordStopFromExecution).handle(event as never)
	}

	async function groupMessages(threadId: string) {
		const entries = await testBed.resolve(ThreadRepository).listEntries(threadId)
		return entries.filter(entry => entry.kind === TranscriptKind.SYSTEM && entry.routing === OutputRouting.GROUP)
	}

	it('raises a DECISION_REQUESTED stop with its ask, and the group reads it with its code and options', async () => {
		const { threadId, issueId } = await givenIssueOnThread()

		const { stopId } = await testBed.resolve(AskDecision).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId,
			issueId,
			question: 'A prévia está pronta. Publico?',
			options: [
				{ id: 'yes', label: 'Publica' },
				{ id: 'no', label: 'Ainda não' },
			],
			effects: [AskEffect.PUBLISH],
		})
		await deliverStopFacts()

		const stop = await testBed.resolve(ThreadRepository).findStop(stopId)
		expect(stop?.kind).toBe(StopKind.DECISION_REQUESTED)
		expect(stop?.ask?.effects).toEqual([AskEffect.PUBLISH])
		const [message] = await groupMessages(threadId)
		expect(message?.text).toContain('APP-12 · D1 — A prévia está pronta. Publico?')
		expect(message?.text).toContain('1) Publica')
		expect(message?.stopId).toBe(stopId)
	})

	it('fase 4 (6c) — the option that authorizes PUBLISH and the `onPublished` follow-up reach the stored stop', async () => {
		const { threadId, issueId } = await givenIssueOnThread()
		const { stopId } = await testBed.resolve(AskDecision).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId,
			issueId,
			question: 'A prévia está pronta. Publico?',
			options: [
				{ id: 'yes', label: 'Publica', authorizes: [AskEffect.PUBLISH] },
				{ id: 'no', label: 'Ainda não' },
			],
			effects: [AskEffect.PUBLISH],
			onPublished: { kind: PublishFollowUpKind.COMPLETE, summary: 'Página no ar.' },
		})
		await deliverStopFacts()

		const stop = await testBed.resolve(ThreadRepository).findStop(stopId)
		expect(stop?.ask?.options[0]?.authorizes).toEqual([AskEffect.PUBLISH])
		expect(stop?.ask?.onPublished).toEqual({ kind: PublishFollowUpKind.COMPLETE, summary: 'Página no ar.' })
	})

	it('FALSEADOR — a malformed ask is refused ON THE CALL by name, and no fact is saved', async () => {
		const { threadId, issueId } = await givenIssueOnThread()
		const before = await testBed.probe().snapshot(['events', 'outbox'] as const)

		const failure = await testBed
			.resolve(AskDecision)
			.execute({
				ownerId: MOCK_CLOUD_OWNER_ID,
				threadId,
				issueId,
				question: 'Qual tema?',
				options: [
					{ id: 'a', label: 'Claro' },
					{ id: 'a', label: 'Escuro' },
				],
				effects: [],
			})
			.then(
				() => undefined,
				(error: unknown) => error,
			)

		expect(failure).toEqual(expect.objectContaining({ name: 'ASK_OPTIONS_DUPLICATED' }))
		expect(await testBed.probe().snapshot(['events', 'outbox'] as const)).toEqual(before)
	})

	it('the schema takes 2 to 6 options — one is not a decision', () => {
		const parsed = testBed.resolve(AskDecision).inputSchema.safeParse({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: MOCK_CLOUD_OWNER_ID,
			issueId: MOCK_CLOUD_OWNER_ID,
			question: 'Publico?',
			options: [{ id: 'yes', label: 'Sim' }],
			effects: [],
		})
		expect(parsed.success).toBe(false)
	})

	/**
	 * The gap the aliases close: the legacy HUMAN_REQUESTED that `AskOperator` / `NEEDS_INPUT` raised had no
	 * level (`LEVEL_OF_STOP` null) and said nothing in the group by itself. As decisions, they reach it.
	 */
	it('the legacy doors (AskOperator, NEEDS_INPUT) now reach the group as decisions', async () => {
		const { threadId, issueId } = await givenIssueOnThread()

		await testBed.resolve(AskOperator).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId, issueId, question: 'Qual bucket uso?' })
		await testBed.resolve(DeclareIssueComplete).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId,
			issueId,
			status: IssueStatus.NEEDS_INPUT,
			summary: '',
			key: 'APP-12',
		})
		await deliverStopFacts()

		const open = await testBed.resolve(ThreadRepository).openStopsByIssue(issueId)
		expect(open.map(stop => stop.kind)).toEqual([StopKind.DECISION_REQUESTED, StopKind.DECISION_REQUESTED])
		const messages = await groupMessages(threadId)
		expect(messages).toHaveLength(2)
		expect(messages[0]?.text).toContain('APP-12 · D1 — Qual bucket uso?')
		// An empty NEEDS_INPUT still asks something people can read — the decision title, in the group's language.
		expect(messages[1]?.text).toContain('APP-12 · D2 — Uma tarefa precisa de uma decisão')
	})
})
