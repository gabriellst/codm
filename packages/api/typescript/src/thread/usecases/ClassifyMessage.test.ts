import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread, givenIssue } from '@test/support'
import { BaseError, DomainEventRepository } from '@codedm/core-typescript'
import { ClassificationMethod, TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { AgentRunner } from '@agent/services/AgentRunner'
import { AgentRunOutcome } from '@agent/enums'
import { OPERATOR_ID } from '@auth/operator'
import { ClassifyMessage } from './ClassifyMessage'
import { TranscriptRepository } from '../repositories/TranscriptRepository'
import { ClarificationRepository } from '../repositories/ClarificationRepository'
import { MessageClassifiedEvent } from '../events'

/**
 * C17 ClassifyMessage — the single-stream demultiplex. Each ClassificationMethod branch:
 *   - REPLY_QUOTE   — deterministic, resolved by the seeded stub (no LLM): a reply-quote to an open
 *                     issue routes there authoritatively.
 *   - CONTEXT_MATCH — the runner is stubbed to a confident match on an open issue.
 *   - NEW_ISSUE     — the runner is stubbed to open new work.
 *   - CLARIFIED     — the default inert stub (empty structured object) degrades to a clarification,
 *                     which enforces the max-ONE-open-clarification-per-sender invariant.
 */
describe('ClassifyMessage — classification routes + clarification invariant', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	// The runner's next structured decision — mutated per test; the fake is bound in beforeEach.
	let nextDecision: Record<string, unknown>

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
		nextDecision = {} // inert default → CLARIFY
		// The ONE seam: a classification is `run({ outputSchema })` drained to its single terminal
		// event, whose `output` is the decision. No `generate` method exists to fake any more.
		const fakeRunner = {
			run: () =>
				(async function* () {
					yield {
						type: 'finished',
						result: {
							outcome: AgentRunOutcome.COMPLETED,
							replyText: JSON.stringify(nextDecision),
							sessionId: null,
							output: nextDecision,
							failed: false,
						},
					}
				})(),
			shutdown: async () => {},
		} as unknown as AgentRunner
		testBed.override(AgentRunner, fakeRunner)
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const append = (
		threadId: string,
		opts: Partial<{ issueId: string; quotedEntryId: string; senderExternalId: string; text: string }> = {},
	) =>
		testBed.resolve(TranscriptRepository).append({
			ownerId: OPERATOR_ID,
			threadId,
			kind: TranscriptKind.CONTACT,
			text: opts.text ?? 'ship the coupon fix',
			senderExternalId: opts.senderExternalId ?? 'stranger-42',
			issueId: opts.issueId,
			quotedEntryId: opts.quotedEntryId,
		})

	const actionLines = async (threadId: string) =>
		(await testBed.resolve(TranscriptRepository).listByThread(threadId)).filter(e => e.kind === TranscriptKind.ACTION)

	it('REPLY_QUOTE: a reply-quote to an open issue routes there authoritatively', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value })
		// The quoted entry is already routed to the open issue.
		const quoted = await append(thread.id.value, { issueId: issue.id.value })
		const inbound = await append(thread.id.value, { quotedEntryId: quoted.entryId })

		const out = await testBed.resolve(ClassifyMessage).execute({ threadId: thread.id.value, entryId: inbound.entryId })

		expect(out.method).toBe(ClassificationMethod.REPLY_QUOTE)
		expect(out.issueId).toBe(issue.id.value)
		// Inbound entry is stamped with the resolved issue.
		const stamped = await testBed.resolve(TranscriptRepository).findById(inbound.entryId)
		expect(stamped?.issueId).toBe(issue.id.value)
		// ACTION audit line + the classified fact.
		expect((await actionLines(thread.id.value)).some(e => e.text === `classified: ${ClassificationMethod.REPLY_QUOTE}`)).toBe(true)
		expect(await testBed.resolve(DomainEventRepository).findByType(MessageClassifiedEvent)).toHaveLength(1)
	})

	it('CONTEXT_MATCH: a confident LLM match on an open issue routes there', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value })
		nextDecision = { decision: 'MATCH_ISSUE', issueId: issue.id.value, confidence: 0.9 }
		const inbound = await append(thread.id.value)

		const out = await testBed.resolve(ClassifyMessage).execute({ threadId: thread.id.value, entryId: inbound.entryId })

		expect(out.method).toBe(ClassificationMethod.CONTEXT_MATCH)
		expect(out.issueId).toBe(issue.id.value)
		expect(await testBed.resolve(DomainEventRepository).findByType(MessageClassifiedEvent)).toHaveLength(1)
	})

	it('NEW_ISSUE: an unmatched message opens new work', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		nextDecision = { decision: 'NEW_ISSUE', title: 'Fix the coupon rounding' }
		const inbound = await append(thread.id.value)

		const out = await testBed.resolve(ClassifyMessage).execute({ threadId: thread.id.value, entryId: inbound.entryId })

		expect(out.method).toBe(ClassificationMethod.NEW_ISSUE)
		expect(out.issueId).toBeUndefined()
		expect((await actionLines(thread.id.value)).some(e => e.text === `classified: ${ClassificationMethod.NEW_ISSUE}`)).toBe(true)
		expect(await testBed.resolve(DomainEventRepository).findByType(MessageClassifiedEvent)).toHaveLength(1)
	})

	it('CLARIFY: an ambiguous message opens a clarification, and only ONE stays open per sender', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const first = await append(thread.id.value, { senderExternalId: 'sender-x', text: 'the thing' })

		const out = await testBed.resolve(ClassifyMessage).execute({ threadId: thread.id.value, entryId: first.entryId })
		expect(out.method).toBe(ClassificationMethod.CLARIFIED)
		expect(out.issueId).toBeUndefined()
		expect(await testBed.resolve(ClarificationRepository).findOpen(thread.id.value, 'sender-x')).toBeDefined()

		// A second ambiguous inbound from the SAME sender must not open a second clarification.
		const second = await append(thread.id.value, { senderExternalId: 'sender-x', text: 'still the thing' })
		await expect(testBed.resolve(ClassifyMessage).execute({ threadId: thread.id.value, entryId: second.entryId })).rejects.toThrow(
			BaseError,
		)
	})
})
