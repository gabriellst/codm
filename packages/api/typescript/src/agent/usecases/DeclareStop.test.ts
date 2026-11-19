import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { DomainEventRepository, type BaseError } from '@codm/core-typescript'
import { AskEffect, StopKind } from '@codm/contracts-typescript/wire/enums'
import { DECLARED_AS, DeclareStop } from './DeclareStop'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
import { FactSource } from '../enums'
import { TRANSPORT_STOP_KINDS } from '../enums/TransportStopKind'

/**
 * D6-4 — THE GUARD THE EXECUTOR FOUND, WROTE INTO THE GOAL, AND SHIPPED UNTESTED.
 *
 * `DeclareStop` takes the WHOLE frozen `StopKind` (§8 rule 5 forbids redeclaring a value-set contracts
 * already owns), so a model on the other end of the `RaiseStop` tool can ASK for `AUTH_REQUIRED` or
 * `SERVER_ERROR`. Those are TRANSPORT facts: the runner observes them on the process and the stream,
 * and it is the only thing in the system that can. Accepting one would write a transport stop with
 * `source: DECLARED` into the ledger — which makes the `FactSource` column LIE, and the column is the
 * entire reason the DECLARED/INFERRED split exists.
 *
 * ### Why "and NOTHING was written" is counted rather than assumed
 * The invariant is not "an exception was raised" — it is that the refusal happens BEFORE the event is
 * saved. A guard placed one line lower would still throw, still pass an `expect().rejects`, and still
 * leave the lying row behind (the `withTransaction` wrapper commits per call). Counting rows on the
 * ledger and the outbox is what tells those two implementations apart.
 *
 * ### The control case is not decoration
 * A `DeclareStop` that refused EVERYTHING would satisfy every rejection assertion below. The DOMAIN
 * case runs first and asserts the opposite of all of them.
 */
const COUNTED = ['events', 'outbox'] as const

describe('DeclareStop — a model may only declare a DOMAIN stop (D6-4)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const ownerId = testId('declare-stop', 'owner')
	const issueId = testId('declare-stop', 'issue')
	const threadId = testId('declare-stop', 'thread')

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

	it('THE CONTROL — a DOMAIN kind IS declarable, lands one stop fact, and the ledger says DECLARED', async () => {
		const useCase = testBed.resolve(DeclareStop)
		const eventRepo = testBed.resolve(DomainEventRepository)
		const before = await testBed.probe().snapshot(COUNTED)

		const out = await useCase.execute({
			ownerId,
			issueId,
			threadId,
			kind: StopKind.APPROVAL_NEEDED,
			detail: 'the migration drops a column — confirm before I run it',
		})

		expect(out.stopId).toBeDefined()
		const stops = await eventRepo.findByType(AgentRunStopRaisedEvent)
		expect(stops).toHaveLength(1)
		// Fase 3: an approval is an ALIAS of a decision — yes/no in the group's language, and an effect that
		// keeps it for whoever may release (the rule APPROVE always had).
		expect(stops[0]?.payload.kind).toBe(StopKind.DECISION_REQUESTED)
		expect(stops[0]?.payload.ask).toEqual({
			question: 'the migration drops a column — confirm before I run it',
			options: [
				{ id: 'yes', label: 'Sim' },
				{ id: 'no', label: 'Não' },
			],
			effects: [AskEffect.IRREVERSIBLE],
		})
		expect(stops[0]?.payload.source).toBe(FactSource.DECLARED)

		const after = await testBed.probe().snapshot(COUNTED)
		expect(after.events).toBe(before.events + 1)
		expect(after.outbox).toBe(before.outbox + 1)
	})

	/**
	 * Driven off `TRANSPORT_STOP_KINDS` rather than two hand-written cases: that tuple is derived from
	 * the frozen `StopKind`, so a third transport kind added to `stop-kind.tsp` tomorrow arrives here
	 * with no edit. A literal pair would be the second source of truth `TransportStopKind` exists to
	 * avoid — and the one that would silently stop covering the new member.
	 */
	for (const kind of TRANSPORT_STOP_KINDS) {
		it(`refuses to declare the TRANSPORT stop ${kind} — named error, and NOTHING is written`, async () => {
			const useCase = testBed.resolve(DeclareStop)
			const eventRepo = testBed.resolve(DomainEventRepository)
			const before = await testBed.probe().snapshot(COUNTED)

			const failure = await useCase.execute({ ownerId, issueId, threadId, kind, detail: 'the CLI says I need to log in again' }).then(
				() => undefined,
				(error: unknown) => error,
			)

			// Asserted on the CODE, never the message (§ error vocabulary): the code is the public
			// contract the mapper turns into 422 and the frontend turns into an i18n key.
			expect(failure).toEqual(expect.objectContaining({ name: 'AGENT_TRANSPORT_STOP_NOT_DECLARABLE' }) as BaseError)

			expect(await eventRepo.findByType(AgentRunStopRaisedEvent)).toHaveLength(0)
			expect(await testBed.probe().snapshot(COUNTED)).toEqual(before)
		})
	}

	/**
	 * Fase 3 — what each declarable kind BECOMES (`DECLARED_AS`). A person asked for → a decision with a free-text
	 * answer; a classification block → raised as declared; a question or a stall → refused by name (a question
	 * needs the default only `AskQuestion` carries; a stall is the reconciler's inference).
	 */
	it('HUMAN_REQUESTED and DECISION_REQUESTED become a decision with a free-text answer', async () => {
		const useCase = testBed.resolve(DeclareStop)
		const eventRepo = testBed.resolve(DomainEventRepository)

		for (const kind of [StopKind.HUMAN_REQUESTED, StopKind.DECISION_REQUESTED]) {
			await useCase.execute({ ownerId, issueId, threadId, kind, detail: 'which bucket do the exports go to?' })
		}

		const stops = await eventRepo.findByType(AgentRunStopRaisedEvent)
		expect(stops.map(stop => stop.payload.kind)).toEqual([StopKind.DECISION_REQUESTED, StopKind.DECISION_REQUESTED])
		for (const stop of stops) expect(stop.payload.ask).toEqual({ question: 'which bucket do the exports go to?', options: [], effects: [] })
	})

	it('BLOCKED_BY_CLASSIFICATION is raised as declared, with no ask', async () => {
		const useCase = testBed.resolve(DeclareStop)
		const eventRepo = testBed.resolve(DomainEventRepository)

		await useCase.execute({ ownerId, issueId, threadId, kind: StopKind.BLOCKED_BY_CLASSIFICATION, detail: 'the reply was held' })

		const [stop] = await eventRepo.findByType(AgentRunStopRaisedEvent)
		expect(stop?.payload.kind).toBe(StopKind.BLOCKED_BY_CLASSIFICATION)
		expect(stop?.payload.ask).toBeUndefined()
	})

	for (const kind of [StopKind.QUESTION_ASKED, StopKind.STALLED]) {
		it(`refuses ${kind} by name — and NOTHING is written`, async () => {
			const useCase = testBed.resolve(DeclareStop)
			const before = await testBed.probe().snapshot(COUNTED)

			const failure = await useCase.execute({ ownerId, issueId, threadId, kind, detail: 'x' }).then(
				() => undefined,
				(error: unknown) => error,
			)

			expect(failure).toEqual(expect.objectContaining({ name: 'AGENT_STOP_KIND_NOT_DECLARABLE' }) as BaseError)
			expect(await testBed.probe().snapshot(COUNTED)).toEqual(before)
		})
	}

	it('no tool raises the legacy APPROVAL_NEEDED / HUMAN_REQUESTED any more — they stay for the history', () => {
		const raised = Object.values(StopKind).filter(kind => DECLARED_AS[kind].as === 'STOP')
		expect(raised).toEqual([StopKind.BLOCKED_BY_CLASSIFICATION])
		for (const kind of TRANSPORT_STOP_KINDS)
			expect(DECLARED_AS[kind]).toEqual({ as: 'REFUSED', refusal: 'AGENT_TRANSPORT_STOP_NOT_DECLARABLE' })
	})
})
