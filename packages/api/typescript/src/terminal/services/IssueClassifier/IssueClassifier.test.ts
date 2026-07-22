import { describe, expect, it, mock } from 'bun:test'
import type { z, ZodType } from 'zod'
import { BaseError } from '@codedm/core-typescript'
import { ClassificationMethod } from '@codedm/contracts-typescript/wire/enums'
import { AgentRunner, type AgentGenerateRequest, type AgentStreamRequest, type TerminalRuntimeEvent } from '../AgentRunner'
import { IssueClassifier, type OpenIssueRef } from './IssueClassifier'

/**
 * Stubbed runner — never spawns a subprocess, never calls a real LLM. `generate()` returns the
 * canned decision set on `nextDecision`; `stream()` is unused by the classifier and throws if
 * touched. `generateCalls` records how often the LLM path was taken (asserting the reply-quote
 * shortcut never consults it).
 */
class StubbedRunner extends AgentRunner {
	nextDecision: Record<string, unknown> = { decision: 'CLARIFY' }
	generate = mock(async <OutputSchema extends ZodType>(_request: AgentGenerateRequest<OutputSchema>): Promise<z.output<OutputSchema>> => {
		return this.nextDecision as z.output<OutputSchema>
	})
	// eslint-disable-next-line require-yield
	async *stream(_request: AgentStreamRequest): AsyncIterable<TerminalRuntimeEvent> {
		throw new Error('stream() must not be called by the classifier')
	}
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
		expect(runner.generate).toHaveBeenCalledTimes(0)
	})

	it('ignores a reply-quote that points at a non-open issue and falls through to the LLM', async () => {
		const runner = new StubbedRunner()
		runner.nextDecision = { decision: 'NEW_ISSUE', title: 'Something new' }
		const classifier = new IssueClassifier(runner)

		const decision = await classifier.classify({ message: 'brand new thing', quotedIssueId: 'issue-gone', openIssues })

		expect(decision.kind).toBe('NEW_ISSUE')
		expect(runner.generate).toHaveBeenCalledTimes(1)
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
		expect(decision).toEqual({ kind: 'CLARIFY', question: 'Is this about Pix or the mobile nav?', candidateIssueIds: ['issue-pix', 'issue-nav'] })
	})

	it('wraps a runner failure in CLASSIFICATION_FAILED', async () => {
		const runner = new StubbedRunner()
		runner.generate = mock(async () => {
			throw new Error('provider offline')
		})
		const classifier = new IssueClassifier(runner)

		await expect(classifier.classify({ message: 'x', openIssues })).rejects.toThrow(
			expect.objectContaining({ name: 'CLASSIFICATION_FAILED' }) as BaseError,
		)
	})
})
