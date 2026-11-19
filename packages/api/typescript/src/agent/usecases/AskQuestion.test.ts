import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { DomainEventRepository } from '@codm/core-typescript'
import { AskAnswerKind, AskEffect, StopKind } from '@codm/contracts-typescript/wire/enums'
import { AskQuestion } from './AskQuestion'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'

/**
 * `AskQuestion` (fase 3, item 1) — a question the issue can go on without. The escalation rule has ONE
 * owner (the `StopAsk` value object), and the tool tells the session what the ask became.
 */
describe('AskQuestion', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const ownerId = testId('ask-question', 'owner')
	const issueId = testId('ask-question', 'issue')
	const threadId = testId('ask-question', 'thread')
	const options = [
		{ id: 'blue', label: 'Azul' },
		{ id: 'green', label: 'Verde' },
	]

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

	it('a question with no effect stays a question — with its default on the fact', async () => {
		const out = await testBed.resolve(AskQuestion).execute({
			ownerId,
			issueId,
			threadId,
			question: 'Azul ou verde no banner?',
			options,
			default: { kind: AskAnswerKind.OPTION, optionId: 'blue' },
			effects: [],
		})

		expect(out.kind).toBe(StopKind.QUESTION_ASKED)
		const [fact] = await testBed.resolve(DomainEventRepository).findByType(AgentRunStopRaisedEvent)
		expect(fact?.payload.kind).toBe(StopKind.QUESTION_ASKED)
		expect(fact?.payload.ask?.default).toEqual({ kind: AskAnswerKind.OPTION, optionId: 'blue' })
	})

	it('a question with a declared effect BECOMES a decision, and the session is told so', async () => {
		const out = await testBed.resolve(AskQuestion).execute({
			ownerId,
			issueId,
			threadId,
			question: 'Mando o e-mail para a base inteira?',
			options,
			default: { kind: AskAnswerKind.OPTION, optionId: 'blue' },
			effects: [AskEffect.CLIENT_DATA],
		})

		expect(out.kind).toBe(StopKind.DECISION_REQUESTED)
		const [fact] = await testBed.resolve(DomainEventRepository).findByType(AgentRunStopRaisedEvent)
		expect(fact?.payload.kind).toBe(StopKind.DECISION_REQUESTED)
	})

	it('FALSEADOR — a question without a default is not a value the tool receives', () => {
		const parsed = testBed
			.resolve(AskQuestion)
			.inputSchema.safeParse({ ownerId, issueId, threadId, question: 'Azul?', options, effects: [] })
		expect(parsed.success).toBe(false)
	})

	it('FALSEADOR — a default naming no option is refused on the call by name, nothing saved', async () => {
		const before = await testBed.probe().snapshot(['events', 'outbox'] as const)
		const failure = await testBed
			.resolve(AskQuestion)
			.execute({
				ownerId,
				issueId,
				threadId,
				question: 'Azul ou verde?',
				options,
				default: { kind: AskAnswerKind.OPTION, optionId: 'red' },
				effects: [],
			})
			.then(
				() => undefined,
				(error: unknown) => error,
			)
		expect(failure).toEqual(expect.objectContaining({ name: 'ASK_OPTION_UNKNOWN' }))
		expect(await testBed.probe().snapshot(['events', 'outbox'] as const)).toEqual(before)
	})
})
