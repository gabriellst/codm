import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { DomainEventRepository } from '@codm/core-typescript'
import { StopKind } from '@codm/contracts-typescript/wire/enums'
import { AskOperator } from './AskOperator'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
import { FactSource } from '../enums'

/**
 * REVIEW FINDING (MAJOR) — `AskOperator` was exercised by ZERO tests before this file. `git grep -n
 * AskOperator` across every `*.test.ts` returned only two hits, both comments; `E2eMcpDriver` never
 * declares the operation; and `tests/flows/stop-control-plane.flow.test.ts` HAND-CONSTRUCTS an
 * `AgentRunStopRaisedEvent`, which proves the bridge/card leg but neither (a) the fire-and-forget
 * `{delivered:true}` return without an external signal, nor (b) that `AskOperator` emits EXACTLY ONE
 * `AgentRunStopRaisedEvent` with `detail === question` — the domain event
 * `PublishAgentIntegrationEvents.test.ts` already proves maps 1:1 to `integration.thread.stop_raised`,
 * `detail` included. This file closes both, colocated, per AC-6.10.
 */
const COUNTED = ['events', 'outbox'] as const

describe('AskOperator — fire-and-forget, exactly one stop fact (AC-6.10)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const ownerId = testId('ask-operator', 'owner')
	const issueId = testId('ask-operator', 'issue')
	const threadId = testId('ask-operator', 'thread')
	const question = 'Should I drop the legacy `pix_orders` table, or keep it for the migration window?'

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

	/**
	 * AC-6.10(a) — FIRE-AND-FORGET, PROVED, NOT PROMISED. Raced against a short timeout instead of just
	 * timed: an implementation that (wrongly) awaited an external signal — an operator reply, a
	 * pub/sub subscription, anything — would never resolve inside the race, so this rejects on the
	 * timeout rather than merely being slow. That is the falsifier the AC names: "must blow up by
	 * timeout, not pass by having resolved fast enough."
	 */
	it('resolves WITHOUT any external signal — races a timeout that only a blocking implementation could lose', async () => {
		const useCase = testBed.resolve(AskOperator)

		const result = await Promise.race([
			useCase.execute({ ownerId, issueId, threadId, question }),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('AskOperator did not resolve — it is blocking on an external signal')), 200),
			),
		])

		expect(result).toEqual({ delivered: true, stopId: expect.any(String) })
	})

	/**
	 * AC-6.10(b) — EXACTLY ONE stop fact, `kind` fixed by the HANDLER (never chosen by the caller —
	 * there is no `kind` in `AskOperatorInputSchema`), `detail === question` verbatim. Counted on the
	 * ledger AND the outbox — not a single `find` — so a hypothetical double-publish (e.g. one call
	 * that both raises a stop AND records a duplicate) cannot hide behind "a row exists".
	 */
	it('produces EXACTLY ONE AgentRunStopRaisedEvent, kind HUMAN_REQUESTED, detail === question, counted on events + outbox', async () => {
		const useCase = testBed.resolve(AskOperator)
		const eventRepo = testBed.resolve(DomainEventRepository)
		const before = await testBed.probe().snapshot(COUNTED)

		const out = await useCase.execute({ ownerId, issueId, threadId, question })
		expect(out.delivered).toBe(true)

		const stops = await eventRepo.findByType(AgentRunStopRaisedEvent)
		expect(stops).toHaveLength(1)
		expect(stops[0]?.payload.stopId).toBe(out.stopId)
		expect(stops[0]?.payload.kind).toBe(StopKind.HUMAN_REQUESTED)
		expect(stops[0]?.payload.detail).toBe(question)
		expect(stops[0]?.payload.source).toBe(FactSource.DECLARED)

		const after = await testBed.probe().snapshot(COUNTED)
		expect(after.events).toBe(before.events + 1)
		expect(after.outbox).toBe(before.outbox + 1)
	})
})
