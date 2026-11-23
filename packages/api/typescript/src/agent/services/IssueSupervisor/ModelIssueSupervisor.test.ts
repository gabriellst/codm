import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import type { ZodType } from 'zod'
import { DomainEventRepository } from '@codm/core-typescript'
import {
	IssueTimelineItemKind,
	ProviderKind,
	SupervisorVerdict,
	SuspicionReason,
	TranscriptKind,
	UsageRole,
} from '@codm/contracts-typescript/wire/enums'
import { smallModelFor } from '@catalog'
import { TestBed } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import type { IssueTimelineItem } from '@shared/schemas'
import { AgentName, AgentRunOutcome } from '../../enums'
import { SupervisorFallback } from '../../enums/SupervisorFallback'
import { AgentUsageEvent } from '../../events/AgentUsageEvent'
import { SupervisorOutputSchema } from '../../agents/SupervisorAgent'
import type { AgentRunRequest } from '../../types/AgentRunRequest'
import type { AgentRuntimeEvent } from '../../types/AgentRuntimeEvent'
import { AgentRunner } from '../AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '../AgentRunnerFactory'
import type { SuspectIssue } from '../SuspectIssueReader'
import { redactForModel, type SupervisorSubject } from './IssueSupervisor'
import { ModelIssueSupervisor } from './ModelIssueSupervisor'

const usage = { inputTokens: 30, outputTokens: 8, cacheCreationInputTokens: 0, cacheReadInputTokens: 600 }

/** The supervisor's model, stubbed: answers `output` (or hangs until aborted) — never a CLI. Keeps every request. */
class ScriptedRunner extends AgentRunner {
	readonly requests: AgentRunRequest<ZodType | undefined>[] = []
	constructor(private readonly output: unknown | 'hang') {
		super()
	}
	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		this.requests.push(request)
		if (this.output === 'hang') {
			await new Promise<void>(resolve => request.signal?.addEventListener('abort', () => resolve(), { once: true }))
			yield {
				type: 'finished',
				result: { outcome: AgentRunOutcome.STOPPED, replyText: '', sessionId: null, failed: true, failure: 'killed' },
			}
			return
		}
		yield {
			type: 'finished',
			result: { outcome: AgentRunOutcome.COMPLETED, replyText: '', sessionId: null, output: this.output, failed: false, usage },
		}
	}
	async shutdown(): Promise<void> {}
}

/** The production policy with a short budget, so the timeout case takes milliseconds. */
class QuickModelIssueSupervisor extends ModelIssueSupervisor {
	protected override timeoutMs = 60
}

const NOW = new Date('2026-11-23T12:00:00.000Z')
const issueId = '00000000-0000-4000-8000-0000000000c1'

const suspect = (reason: SuspicionReason): SuspectIssue => ({
	issueId,
	ownerId: MOCK_CLOUD_OWNER_ID,
	threadId: '00000000-0000-4000-8000-0000000000c2',
	key: 'APP-7',
	title: 'Página de preços',
	provider: ProviderKind.CLAUDE_CODE,
	reason,
	since: new Date(NOW.getTime() - 45 * 60_000),
	nudgesLastDay: 2,
	actedLastDay: [],
})

/**
 * Sentinels built at run time, so no phone- or address-shaped literal sits in the source: a run of digits long enough
 * to be a phone or a document, written with separators, and an address with `@`.
 */
const DIGITS = Array.from({ length: 11 }, (_, index) => String((index * 7 + 3) % 10)).join('')
const SPACED_DIGITS = `${DIGITS.slice(0, 2)} ${DIGITS.slice(2, 7)}-${DIGITS.slice(7)}`
const ADDRESS = ['pessoa', 'exemplo.test'].join('@')

const moment = (text: string, minutesAgo: number): IssueTimelineItem => ({
	kind: IssueTimelineItemKind.MESSAGE,
	id: `m-${minutesAgo}`,
	at: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
	entryId: `m-${minutesAgo}`,
	transcriptKind: TranscriptKind.CONTACT,
	text,
})

describe('ModelIssueSupervisor — a tool-less small-model review that fails closed to LEAVE', () => {
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

	const review = async (output: unknown, subject: Partial<SupervisorSubject> = {}, quick = false) => {
		const runner = new ScriptedRunner(output)
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))
		const supervisor = quick ? testBed.resolve(QuickModelIssueSupervisor) : testBed.resolve(ModelIssueSupervisor)
		const decision = await supervisor.review({ suspect: suspect(SuspicionReason.STALLED_OPEN), timeline: [], now: NOW, ...subject })
		return { decision, runner }
	}

	it('a confident, admitted verdict stands — one stateless run on the small model, with NO tools', async () => {
		const { decision, runner } = await review({ verdict: SupervisorVerdict.NUDGE, confidence: 0.9 })

		expect(decision).toEqual({ verdict: SupervisorVerdict.NUDGE, confidence: 0.9 })
		const request = runner.requests[0]
		expect(request?.agentName).toBe(AgentName.SUPERVISOR)
		expect(request?.model).toBe(smallModelFor(ProviderKind.CLAUDE_CODE))
		expect(request?.outputSchema).toBe(SupervisorOutputSchema)
		expect(request?.builtinTools).toEqual([])
		expect(request?.mcp).toBeUndefined()
		expect(request?.session).toBeUndefined()
	})

	it('its spend is recorded as SUPERVISOR on the task — what the quota budget counts in the reserve', async () => {
		await review({ verdict: SupervisorVerdict.LEAVE, confidence: 0.8 })
		const facts = (await testBed.resolve(DomainEventRepository).findByType(AgentUsageEvent)).filter(fact => fact.entityId === issueId)
		expect(facts.length).toBeGreaterThan(0)
		expect(facts.every(fact => fact.payload.role === UsageRole.SUPERVISOR)).toBe(true)
	})

	it('fails closed: unparseable, outside the admitted verdicts, below the floor, or past the budget ⇒ LEAVE with why', async () => {
		expect((await review({ nonsense: true })).decision).toEqual({
			verdict: SupervisorVerdict.LEAVE,
			fallback: SupervisorFallback.UNPARSEABLE,
		})
		// A live turn gone silent is never nudged — the watchdog is the only killer; the supervisor only flags.
		expect(
			(await review({ verdict: SupervisorVerdict.NUDGE, confidence: 0.99 }, { suspect: suspect(SuspicionReason.SILENT_TURN) })).decision,
		).toEqual({ verdict: SupervisorVerdict.LEAVE, fallback: SupervisorFallback.NOT_ADMITTED, confidence: 0.99 })
		expect((await review({ verdict: SupervisorVerdict.RESTART_WITH_NOTES, confidence: 0.4 })).decision).toEqual({
			verdict: SupervisorVerdict.LEAVE,
			fallback: SupervisorFallback.LOW_CONFIDENCE,
			confidence: 0.4,
		})
		expect((await review('hang', {}, true)).decision).toEqual({ verdict: SupervisorVerdict.LEAVE, fallback: SupervisorFallback.TIMEOUT })
	})

	it('the prompt offers only the admitted verdicts, and free text leaves the machine redacted', async () => {
		const timeline = [moment(`me liga no ${SPACED_DIGITS} ou escreve para ${ADDRESS}`, 50), moment(`conta ${DIGITS}`, 40)]
		const { runner } = await review(
			{ verdict: SupervisorVerdict.LEAVE, confidence: 0.9 },
			{ suspect: suspect(SuspicionReason.SILENT_TURN), timeline },
		)

		const prompt = [runner.requests[0]?.systemPrompt ?? '', ...(runner.requests[0]?.messages.map(message => message.content) ?? [])].join(
			'\n',
		)
		expect(prompt).not.toContain(DIGITS)
		expect(prompt).not.toContain(SPACED_DIGITS)
		expect(prompt).not.toContain(ADDRESS)
		expect(prompt).toContain('[omitido]')
		expect(prompt).toContain(`- ${SupervisorVerdict.ESCALATE}:`)
		expect(prompt).not.toContain(`- ${SupervisorVerdict.NUDGE}:`)
	})

	it('redactForModel: long digit runs and addresses go, short numbers and names stay', () => {
		expect(redactForModel(`ligue ${SPACED_DIGITS}`)).toBe('ligue [omitido]')
		expect(redactForModel(`escreva a ${ADDRESS}.`)).toBe('escreva a [omitido]')
		expect(redactForModel('Ana pediu 3 telas em 12 min')).toBe('Ana pediu 3 telas em 12 min')
	})
})
