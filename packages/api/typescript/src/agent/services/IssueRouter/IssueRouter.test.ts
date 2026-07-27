import { describe, expect, it } from 'bun:test'
import type { ZodType } from 'zod'
import { BaseError } from '@codedm/core-typescript'
import { ClassificationMethod, StopKind } from '@codedm/contracts-typescript/wire/enums'
import type { OpenIssueRef } from '@thread/services/OpenIssuesReader'
import { AgentRunner } from '../AgentRunner'
import { AgentRunOutcome, AgentName, type TransportStopKind } from '../../enums'
import type { AgentRunRequest, AgentRuntimeEvent } from '../../types'
import { ClassifyIssueAgent, ClassifyIssuePromptBuilder } from '../../agents/ClassifyIssueAgent'
import { IssueRouter, type RouteMessageInput } from './IssueRouter'

/**
 * Stubbed `AgentRunner` — never spawns a subprocess, never calls a real LLM.
 *
 * It answers the ONE seam method and nothing else, which is the point of the rewrite: there is no
 * `generate` to stub, only a `run` that yields one terminal event carrying `output`. The request log
 * IS the "did it consult the model?" assertion (the reply-quote shortcut must never appear in it), and
 * `nextEvents` lets a test stage a transport stop or a validation failure — both of which the seam
 * reports as DATA rather than throwing (§4.3 rule 4).
 */
class StubbedRunner extends AgentRunner {
	nextDecision: Record<string, unknown> = { decision: 'CLARIFY' }
	/** When set, replaces the canned terminal event entirely. */
	nextEvents: AgentRuntimeEvent[] | undefined

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

/** The run envelope every route carries. No `issueId`: classification is what DECIDES one. */
const route = (overrides: Partial<RouteMessageInput> = {}): RouteMessageInput => ({
	ownerId: '00000000-0000-4000-8000-0000000000aa',
	threadId: '00000000-0000-4000-8000-0000000000bb',
	cwd: '/Users/dev/project',
	message: 'x',
	openIssues,
	...overrides,
})

/** The real router over the real agent over a stubbed runner — only the process boundary is faked. */
const build = () => {
	const runner = new StubbedRunner()
	const router = new IssueRouter(new ClassifyIssueAgent(runner, new ClassifyIssuePromptBuilder()))
	return { runner, router }
}

describe('IssueRouter — routing policy over ClassifyIssueAgent', () => {
	it('reply-quote to an open issue routes deterministically WITHOUT calling the agent', async () => {
		const { runner, router } = build()

		const decision = await router.classify(route({ message: 'and also this', quotedIssueId: 'issue-nav' }))

		expect(decision).toEqual({ kind: 'MATCH_ISSUE', method: ClassificationMethod.REPLY_QUOTE, issueId: 'issue-nav' })
		expect(runner.requests).toHaveLength(0)
	})

	it('ignores a reply-quote that points at a non-open issue and falls through to the agent', async () => {
		const { runner, router } = build()
		runner.nextDecision = { decision: 'NEW_ISSUE', title: 'Something new' }

		const decision = await router.classify(route({ message: 'brand new thing', quotedIssueId: 'issue-gone' }))

		expect(decision.kind).toBe('NEW_ISSUE')
		expect(runner.requests).toHaveLength(1)
	})

	it('MATCH_ISSUE above threshold → CONTEXT_MATCH on the returned issue', async () => {
		const { runner, router } = build()
		runner.nextDecision = { decision: 'MATCH_ISSUE', issueId: 'issue-pix', confidence: 0.9 }

		const decision = await router.classify(route({ message: 'still cannot pay with pix' }))

		expect(decision).toEqual({ kind: 'MATCH_ISSUE', method: ClassificationMethod.CONTEXT_MATCH, issueId: 'issue-pix', confidence: 0.9 })
	})

	it('MATCH_ISSUE below threshold degrades to CLARIFY', async () => {
		const { runner, router } = build()
		runner.nextDecision = { decision: 'MATCH_ISSUE', issueId: 'issue-pix', confidence: 0.3, question: 'Pix or nav?' }

		const decision = await router.classify(route({ message: 'the thing is broken', threshold: 0.6 }))

		expect(decision).toEqual({ kind: 'CLARIFY', question: 'Pix or nav?', candidateIssueIds: ['issue-pix', 'issue-nav'] })
	})

	it('MATCH_ISSUE pointing at an unknown issue degrades to CLARIFY', async () => {
		const { runner, router } = build()
		runner.nextDecision = { decision: 'MATCH_ISSUE', issueId: 'issue-ghost', confidence: 0.99 }

		const decision = await router.classify(route({ message: 'hmm' }))
		expect(decision.kind).toBe('CLARIFY')
	})

	it('NEW_ISSUE derives a unique slug key, suffixing on collision with an existing key', async () => {
		const { runner, router } = build()
		runner.nextDecision = { decision: 'NEW_ISSUE', title: 'Pix payment', confidence: 0.8 }

		const decision = await router.classify(route({ message: 'pix again but different' }))

		// slugify('Pix payment') === 'pix-payment' collides with the open issue's key → suffixed.
		expect(decision).toEqual({ kind: 'NEW_ISSUE', slugKey: 'pix-payment-2', title: 'Pix payment', confidence: 0.8 })
	})

	it('NEW_ISSUE without a proposed title falls back to the message and still slugs uniquely', async () => {
		const { runner, router } = build()
		runner.nextDecision = { decision: 'NEW_ISSUE' }

		const decision = await router.classify(route({ message: 'Add a dark mode toggle' }))
		expect(decision).toMatchObject({ kind: 'NEW_ISSUE', slugKey: 'add-a-dark-mode-toggle', title: 'Add a dark mode toggle' })
	})

	it('CLARIFY passes the model question through with the open issues as candidates', async () => {
		const { runner, router } = build()
		runner.nextDecision = { decision: 'CLARIFY', question: 'Is this about Pix or the mobile nav?' }

		const decision = await router.classify(route({ message: 'it is broken' }))
		expect(decision).toEqual({
			kind: 'CLARIFY',
			question: 'Is this about Pix or the mobile nav?',
			candidateIssueIds: ['issue-pix', 'issue-nav'],
		})
	})

	it('turns a TRANSPORT stop into CLASSIFICATION_FAILED — the seam reports it, the AGENT names it', async () => {
		const { runner, router } = build()
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

		await expect(router.classify(route())).rejects.toThrow(expect.objectContaining({ name: 'CLASSIFICATION_FAILED' }) as BaseError)
	})

	it('turns a FAILED structured validation into CLASSIFICATION_FAILED — never a thrown parse error', async () => {
		const { runner, router } = build()
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

		await expect(router.classify(route())).rejects.toThrow(expect.objectContaining({ name: 'CLASSIFICATION_FAILED' }) as BaseError)
	})

	it('the agent drains to its terminal event, stamps its own identity, and declares NOTHING', async () => {
		const { runner, router } = build()
		runner.nextDecision = { decision: 'CLARIFY', question: 'which one?' }

		await router.classify(route({ cwd: '/Users/dev/project' }))

		const request = runner.requests[0]
		expect(request?.outputSchema).toBeDefined()
		// `tools = []` ⇒ no `mcp` at all (§4.3 rule 7) — a classifier decides, it does not act.
		expect(request?.mcp).toBeUndefined()
		expect(request?.messages).toHaveLength(1)
		// Identity is stamped by the base's template-method `run()`, not by `buildRequest`.
		expect(request?.agentName).toBe(AgentName.CLASSIFY_ISSUE)
		// The workspace path travels through the envelope — never `process.cwd()` (§4.6).
		expect(request?.cwd).toBe('/Users/dev/project')
	})
})
