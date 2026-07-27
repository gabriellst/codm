import { describe, expect, it } from 'bun:test'
import type { ZodType } from 'zod'
import { BaseError } from '@codedm/core-typescript'
import { ClassificationMethod, StopKind } from '@codedm/contracts-typescript/wire/enums'
import { AgentRunner } from '../AgentRunner'
import { AgentRunOutcome, type TransportStopKind } from '../../enums'
import type { AgentRunRequest, AgentRuntimeEvent } from '../../types'
import { IssueClassifier, type OpenIssueRef } from './IssueClassifier'

/**
 * Stubbed `AgentRunner` — never spawns a subprocess, never calls a real LLM.
 *
 * It answers the ONE seam method and nothing else, which is the point of this phase: the classifier no
 * longer has a `generate` method to stub, it has a `run` that yields one terminal event carrying
 * `output`. The `run` mock records how often the LLM path was taken (proving the reply-quote shortcut
 * never consults it), and `nextEvents` lets a test stage a transport stop or a validation failure —
 * both of which the seam reports as DATA rather than throwing (§4.3 rule 4).
 */
class StubbedRunner extends AgentRunner {
	nextDecision: Record<string, unknown> = { decision: 'CLARIFY' }
	/** When set, replaces the canned terminal event entirely. */
	nextEvents: AgentRuntimeEvent[] | undefined

	/** Every request the classifier built — the count IS the "did it consult the LLM?" assertion. */
	readonly requests: AgentRunRequest<ZodType | undefined>[] = []

	run<OutputSchema extends ZodType | undefined = undefined>(request: AgentRunRequest<OutputSchema>): AsyncIterable<AgentRuntimeEvent> {
		this.requests.push(request)
		const decision = this.nextDecision
		const events: AgentRuntimeEvent[] = this.nextEvents ?? [
			{
				type: 'finished',
				result: {
					outcome: AgentRunOutcome.COMPLETED,
					replyText: JSON.stringify(decision),
					sessionId: null,
					output: request.outputSchema ? decision : undefined,
					failed: false,
				},
			},
		]
		return (async function* () {
			for (const event of events) yield event
		})()
	}

	async shutdown(): Promise<void> {}
}

const openIssues: OpenIssueRef[] = [
	{ issueId: 'issue-pix', key: 'pix-payment', title: 'Pix payment failing' },
	{ issueId: 'issue-nav', key: 'mobile-nav', title: 'Mobile nav overlaps header' },
]

describe('IssueClassifier', () => {
	it('reply-quote to an open issue routes deterministically WITHOUT calling the LLM', async () => {
		const runner = new StubbedRunner()
		const classifier = new IssueClassifier(runner)

		const decision = await classifier.classify({ message: 'and also this', quotedIssueId: 'issue-nav', openIssues })

		expect(decision).toEqual({ kind: 'MATCH_ISSUE', method: ClassificationMethod.REPLY_QUOTE, issueId: 'issue-nav' })
		expect(runner.requests).toHaveLength(0)
	})

	it('ignores a reply-quote that points at a non-open issue and falls through to the LLM', async () => {
		const runner = new StubbedRunner()
		runner.nextDecision = { decision: 'NEW_ISSUE', title: 'Something new' }
		const classifier = new IssueClassifier(runner)

		const decision = await classifier.classify({ message: 'brand new thing', quotedIssueId: 'issue-gone', openIssues })

		expect(decision.kind).toBe('NEW_ISSUE')
		expect(runner.requests).toHaveLength(1)
	})

	it('MATCH_ISSUE above threshold → CONTEXT_MATCH on the returned issue', async () => {
		const runner = new StubbedRunner()
		runner.nextDecision = { decision: 'MATCH_ISSUE', issueId: 'issue-pix', confidence: 0.9 }
		const classifier = new IssueClassifier(runner)

		const decision = await classifier.classify({ message: 'still cannot pay with pix', openIssues })

		expect(decision).toEqual({ kind: 'MATCH_ISSUE', method: ClassificationMethod.CONTEXT_MATCH, issueId: 'issue-pix', confidence: 0.9 })
	})

	it('MATCH_ISSUE below threshold degrades to CLARIFY', async () => {
		const runner = new StubbedRunner()
		runner.nextDecision = { decision: 'MATCH_ISSUE', issueId: 'issue-pix', confidence: 0.3, question: 'Pix or nav?' }
		const classifier = new IssueClassifier(runner)

		const decision = await classifier.classify({ message: 'the thing is broken', openIssues, threshold: 0.6 })

		expect(decision).toEqual({ kind: 'CLARIFY', question: 'Pix or nav?', candidateIssueIds: ['issue-pix', 'issue-nav'] })
	})

	it('MATCH_ISSUE pointing at an unknown issue degrades to CLARIFY', async () => {
		const runner = new StubbedRunner()
		runner.nextDecision = { decision: 'MATCH_ISSUE', issueId: 'issue-ghost', confidence: 0.99 }
		const classifier = new IssueClassifier(runner)

		const decision = await classifier.classify({ message: 'hmm', openIssues })
		expect(decision.kind).toBe('CLARIFY')
	})

	it('NEW_ISSUE derives a unique slug key, suffixing on collision with an existing key', async () => {
		const runner = new StubbedRunner()
		runner.nextDecision = { decision: 'NEW_ISSUE', title: 'Pix payment', confidence: 0.8 }
		const classifier = new IssueClassifier(runner)

		const decision = await classifier.classify({ message: 'pix again but different', openIssues })

		// slugify('Pix payment') === 'pix-payment' collides with the open issue's key → suffixed.
		expect(decision).toEqual({ kind: 'NEW_ISSUE', slugKey: 'pix-payment-2', title: 'Pix payment', confidence: 0.8 })
	})

	it('NEW_ISSUE without a proposed title falls back to the message and still slugs uniquely', async () => {
		const runner = new StubbedRunner()
		runner.nextDecision = { decision: 'NEW_ISSUE' }
		const classifier = new IssueClassifier(runner)

		const decision = await classifier.classify({ message: 'Add a dark mode toggle', openIssues })
		expect(decision).toMatchObject({ kind: 'NEW_ISSUE', slugKey: 'add-a-dark-mode-toggle', title: 'Add a dark mode toggle' })
	})

	it('CLARIFY passes the model question through with the open issues as candidates', async () => {
		const runner = new StubbedRunner()
		runner.nextDecision = { decision: 'CLARIFY', question: 'Is this about Pix or the mobile nav?' }
		const classifier = new IssueClassifier(runner)

		const decision = await classifier.classify({ message: 'it is broken', openIssues })
		expect(decision).toEqual({
			kind: 'CLARIFY',
			question: 'Is this about Pix or the mobile nav?',
			candidateIssueIds: ['issue-pix', 'issue-nav'],
		})
	})

	it('turns a TRANSPORT stop into CLASSIFICATION_FAILED — the seam reports it, this layer names it', async () => {
		const runner = new StubbedRunner()
		runner.nextEvents = [
			{
				type: 'finished',
				result: {
					outcome: AgentRunOutcome.STOPPED,
					replyText: '',
					sessionId: null,
					failed: false,
					stop: { kind: StopKind.SERVER_ERROR as TransportStopKind, detail: 'provider offline' },
				},
			},
		]
		const classifier = new IssueClassifier(runner)

		await expect(classifier.classify({ message: 'x', openIssues })).rejects.toThrow(
			expect.objectContaining({ name: 'CLASSIFICATION_FAILED' }) as BaseError,
		)
	})

	it('turns a FAILED structured validation into CLASSIFICATION_FAILED — never a thrown parse error', async () => {
		const runner = new StubbedRunner()
		runner.nextEvents = [
			{
				type: 'finished',
				result: {
					outcome: AgentRunOutcome.COMPLETED,
					replyText: 'I am not JSON',
					sessionId: null,
					failed: true,
					failure: 'terminal reply text was not JSON',
				},
			},
		]
		const classifier = new IssueClassifier(runner)

		await expect(classifier.classify({ message: 'x', openIssues })).rejects.toThrow(
			expect.objectContaining({ name: 'CLASSIFICATION_FAILED' }) as BaseError,
		)
	})

	it('drains the run to its terminal event and passes NO mcp — a classifier declares nothing', async () => {
		const runner = new StubbedRunner()
		runner.nextDecision = { decision: 'CLARIFY', question: 'which one?' }
		const classifier = new IssueClassifier(runner)

		await classifier.classify({ message: 'x', openIssues })

		const request = runner.requests[0]
		expect(request?.outputSchema).toBeDefined()
		expect(request?.mcp).toBeUndefined()
		expect(request?.messages).toHaveLength(1)
	})
})
