import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import type { ZodType } from 'zod'
import { DomainEventRepository } from '@codm/core-typescript'
import {
	AgentModelId,
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	ProviderKind,
	StopKind,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenArtifact, givenStop, givenThread, testId } from '@test/support'
import { ISSUE_CONTEXT_BUDGET, ISSUE_HANDOFF_ASK_AT, RunIssueTurn } from './RunIssueTurn'
import { WriteHandoffNotes } from './WriteHandoffNotes'
import { AgentRunner } from '../services/AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '../services/AgentRunnerFactory'
import { IssueTurnAborter } from '../services/IssueTurnAborter'
import { GitWorktreeProbe, type MockGitWorktreeProbe } from '../services/GitWorktreeProbe'
import { AgentSessionRepository } from '../repositories/AgentSessionRepository'
import { MailboxRepository } from '../repositories/MailboxRepository'
import { AgentSession } from '../entities/AgentSession'
import { AgentSessionHandedOffEvent } from '../events/AgentSessionHandedOffEvent'
import { AgentRunOutcome, HandoffNotesSource, ResumeInvalidationReason, type TransportStopKind } from '../enums'
import { operationIdOf, WriteHandoffNotesController } from '../mcp/exposure'
import type { AgentRunRequest } from '../types/AgentRunRequest'
import type { AgentRuntimeEvent } from '../types/AgentRuntimeEvent'

/** What one scripted run does: the context it reports, and optionally something mid-turn or a different end. */
interface Script {
	contextTokens?: number
	act?: (request: AgentRunRequest<ZodType | undefined>) => Promise<void>
	/** Ends on a transport stop the dispatcher retries (a usage limit). */
	limited?: boolean
	/** Reports no session at all (the CLI died before saying which). */
	noSession?: boolean
}

/** Records every request; each run reports the session it was handed (resumed or minted) and the scripted context. */
class ScriptedRunner extends AgentRunner {
	requests: AgentRunRequest<ZodType | undefined>[] = []
	scripts: Script[] = []

	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		this.requests.push(request)
		const script = this.scripts.shift() ?? {}
		await script.act?.(request)
		const sessionId = script.noSession ? null : (request.session?.resumeId ?? request.session?.newId ?? null)
		yield {
			type: 'finished',
			result: script.limited
				? {
						outcome: AgentRunOutcome.STOPPED,
						replyText: '',
						sessionId,
						failed: false,
						stop: { kind: StopKind.SERVER_ERROR as TransportStopKind, detail: 'usage limit' },
					}
				: { outcome: AgentRunOutcome.COMPLETED, replyText: 'ok', sessionId, failed: false, contextTokens: script.contextTokens ?? 20_000 },
		}
	}
	async shutdown(): Promise<void> {}

	userMessage(index: number): string {
		return String(this.requests[index]?.messages[0]?.content ?? '')
	}
}

/**
 * TROCA DE SESSÃO COM NOTAS (fase 4, item 6a) — aceite "preserva o fio": acima de 100 mil o turno pede notas; acima
 * de 120 mil a sessão nova começa com as notas, o objetivo, a decisão aberta e o recado pendente; sem notas, as
 * derivadas; abaixo de 100 mil nada muda; o fato `handed_off` guarda as duas sessões. E a troca não perde nada quando
 * o turno é pausado, cortado por um "agora" ou devolvido para nova tentativa.
 *
 * Falsifiers: drop `contextBudget` from `resolveSession` and the 130k session resumes (no seed); clear the notes in
 * `recordTurn` instead of `completeHandoff` and the 110k turn loses the notes it wrote; upsert the row on a retried
 * handoff turn and the retry resumes the new session with no seed.
 */
describe('RunIssueTurn — session handoff with notes', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const runner = new ScriptedRunner()
	const ownerId = testId('handoff', 'owner')
	const NOTES = 'Goal: export the report as PDF. Done: the template. Decided: A4 portrait. Next: the footer. Branch: feat/pdf.'
	const PENDING = 'põe o logo no rodapé também'

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId })
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))
	})
	beforeEach(async () => {
		await testBed.reset()
		runner.requests = []
		runner.scripts = []
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	/** A task whose session already ran a turn (cursor `entry-0`) and measured `contextTokens`; optionally with notes. */
	async function givenTaskSession(contextTokens: number, notes?: string) {
		const thread = await givenThread(testBed, { ownerId })
		const threadId = thread.id.value
		const issueId = testId('handoff', `issue-${contextTokens}-${notes ? 'notes' : 'none'}`)
		const session = AgentSession.create({
			ownerId,
			issueId,
			threadId,
			provider: ProviderKind.CLAUDE_CODE,
			cwd: '/tmp/workspace',
			agentSessionId: 'old-session',
			model: AgentModelId.DEFAULT,
			lastMessageId: testId('handoff', 'entry-0'),
			contextTokens,
		})
		if (notes) session.recordHandoff(notes)
		await testBed.resolve(AgentSessionRepository).save(session)
		return { threadId, issueId }
	}

	/** The task's durable record: the brief, an answered decision, a message it read, an open question, an artifact. */
	async function givenTaskRecord(threadId: string, issueId: string) {
		const mailbox = testBed.resolve(MailboxRepository)
		const consumed = async (kind: MailboxItemKind, claimClass: MailboxClaimClass, payload: object, dedupKey: string) => {
			await mailbox.enqueue({
				ownerId,
				targetKind: MailboxTargetKind.ISSUE,
				targetId: issueId,
				kind,
				claimClass,
				posture: PermissionPosture.AUTO,
				payload: { issueId, threadId, key: 'APP-7', title: 'Relatório em PDF', ...payload },
				dedupKey,
			})
			const claimed = await mailbox.claimNext('handoff-test', 60_000)
			if (claimed) await mailbox.complete([claimed.id])
		}
		await consumed(MailboxItemKind.WORK, MailboxClaimClass.WORK, { goal: 'Exportar o relatório mensal em PDF' }, 'work:handoff')
		await consumed(MailboxItemKind.STEER, MailboxClaimClass.DECISION_ANSWER, { text: 'Formato? → A4 retrato' }, 'resume:handoff')
		await consumed(MailboxItemKind.STEER, MailboxClaimClass.STEER, { text: 'usa a fonte da marca' }, 'steer:handoff')
		await givenStop(testBed, {
			threadId,
			issueId,
			title: 'Domínio da prévia',
			ask: {
				question: 'Publicar no domínio novo?',
				options: [
					{ id: 'yes', label: 'Sim' },
					{ id: 'no', label: 'Não' },
				],
				effects: [],
				requested: StopKind.DECISION_REQUESTED,
			},
		})
		await givenArtifact(testBed, threadId, { issueId, name: 'previa.pdf', ref: '/tmp/previa.pdf' })
		;(testBed.resolve(GitWorktreeProbe) as MockGitWorktreeProbe).scriptWorkingState('/tmp/workspace', {
			branch: 'feat/pdf',
			changes: [' M src/report.ts'],
		})
	}

	const steerInput = (threadId: string, issueId: string, n = 1) => ({
		ownerId,
		issueId,
		threadId,
		key: 'APP-7',
		title: 'Relatório em PDF',
		provider: ProviderKind.CLAUDE_CODE,
		workspacePath: '/tmp/workspace',
		prompt: PENDING,
		turnKind: MailboxItemKind.STEER as const,
		posture: PermissionPosture.AUTO,
		messageId: testId('handoff', `entry-${n}`),
		priorMessageId: testId('handoff', 'entry-0'),
	})

	const askLine = operationIdOf(WriteHandoffNotesController)

	it('below the ask threshold nothing changes: the session resumes, with no ask and no seed', async () => {
		const { threadId, issueId } = await givenTaskSession(ISSUE_HANDOFF_ASK_AT - 1)
		await testBed.resolve(RunIssueTurn).execute(steerInput(threadId, issueId))

		expect(runner.requests[0]?.session?.resumeId).toBe('old-session')
		expect(runner.userMessage(0)).not.toContain(askLine)
		expect(runner.userMessage(0)).not.toContain('NEW SESSION')
		expect(await testBed.resolve(DomainEventRepository).findByType(AgentSessionHandedOffEvent)).toHaveLength(0)
	})

	it('past the ask threshold the turn resumes and asks for notes — and the notes the session writes survive the turn', async () => {
		const { threadId, issueId } = await givenTaskSession(110_000)
		runner.scripts = [
			{
				contextTokens: 115_000,
				act: () => testBed.resolve(WriteHandoffNotes).execute({ ownerId, threadId, issueId, notes: NOTES }),
			},
		]
		await testBed.resolve(RunIssueTurn).execute(steerInput(threadId, issueId))

		expect(runner.requests[0]?.session?.resumeId).toBe('old-session')
		expect(runner.userMessage(0)).toContain(askLine)
		// The ask rides the MESSAGE — the system prompt of a resumed session never changes (its cache would be rewritten).
		expect(runner.requests[0]?.systemPrompt).not.toContain(askLine)
		const row = await testBed.resolve(AgentSessionRepository).findByIssueId(issueId)
		expect(row?.handoffNotes).toBe(NOTES)
		expect(row?.lastContextTokens).toBe(115_000)
	})

	it('past the budget a FRESH session starts with the notes, the goal, the open decision and the pending message', async () => {
		const { threadId, issueId } = await givenTaskSession(ISSUE_CONTEXT_BUDGET + 10_000, NOTES)
		await givenTaskRecord(threadId, issueId)
		await testBed.resolve(RunIssueTurn).execute(steerInput(threadId, issueId))

		const request = runner.requests[0]
		expect(request?.session?.resumeId).toBeUndefined()
		const first = runner.userMessage(0)
		expect(first).toContain(NOTES)
		expect(first).toContain('Exportar o relatório mensal em PDF')
		expect(first).toContain('Publicar no domínio novo?')
		expect(first).toContain('Formato? → A4 retrato')
		expect(first).toContain('previa.pdf')
		expect(first).toContain('feat/pdf')
		expect(first).toContain(PENDING)
		// The seed comes BEFORE the message: the message is read as the next step of work under way.
		expect(first.indexOf(NOTES)).toBeLessThan(first.indexOf(PENDING))

		const row = await testBed.resolve(AgentSessionRepository).findByIssueId(issueId)
		expect(row?.agentSessionId).toBe(request?.session?.newId)
		expect(row?.handoffNotes).toBeUndefined()
		expect(row?.lastContextTokens).toBe(20_000)
		// The cursor moves on as on every turn — the handoff loses no message.
		expect(row?.lastMessageId).toBe(testId('handoff', 'entry-1'))

		const facts = await testBed.resolve(DomainEventRepository).findByType(AgentSessionHandedOffEvent)
		expect(facts).toHaveLength(1)
		expect(facts[0]?.payload).toEqual({
			issueId,
			fromContextTokens: ISSUE_CONTEXT_BUDGET + 10_000,
			notesSource: HandoffNotesSource.SESSION,
			fromAgentSessionId: 'old-session',
			toAgentSessionId: String(request?.session?.newId),
			reason: ResumeInvalidationReason.CONTEXT_BUDGET_EXCEEDED,
		})
	})

	/**
	 * THE SUPERVISOR'S RESTART (fase 5, S5): a session far UNDER the budget whose row carries the request opens a fresh
	 * session seeded with its notes — `HANDOFF_REQUESTED`, reported before the budget and every premise — the fact says
	 * why, and the request is cleared with the handoff (the turn after resumes the new session). Falsifiers: check the
	 * request after the budget (or not at all) and the small session resumes; leave `SEEDS_FROM_NOTES[HANDOFF_REQUESTED]`
	 * false and it starts bare; drop the column from the repository's update set and the third turn restarts again.
	 */
	it('a restart the supervisor requested opens a fresh session from the notes even with a small context, once', async () => {
		const { threadId, issueId } = await givenTaskSession(30_000, NOTES)
		await givenTaskRecord(threadId, issueId)
		const sessions = testBed.resolve(AgentSessionRepository)
		const row = await sessions.findByIssueId(issueId)
		row?.requestHandoff(new Date(Date.now() - 60_000))
		if (row) await sessions.save(row)

		await testBed.resolve(RunIssueTurn).execute(steerInput(threadId, issueId))
		const request = runner.requests[0]
		expect(request?.session?.resumeId).toBeUndefined()
		expect(runner.userMessage(0)).toContain(NOTES)
		const facts = await testBed.resolve(DomainEventRepository).findByType(AgentSessionHandedOffEvent)
		expect(facts.map(fact => fact.payload.reason)).toEqual([ResumeInvalidationReason.HANDOFF_REQUESTED])
		const after = await sessions.findByIssueId(issueId)
		expect(after?.handoffRequestedAt).toBeUndefined()
		expect(after?.agentSessionId).toBe(request?.session?.newId)

		// The next turn resumes the NEW session: the request was answered once.
		await testBed.resolve(RunIssueTurn).execute({ ...steerInput(threadId, issueId, 2), priorMessageId: testId('handoff', 'entry-1') })
		expect(runner.requests[1]?.session?.resumeId).toBe(String(request?.session?.newId))
	})

	it('without notes (it jumped past the band, or ignored the ask) the fresh session starts from the derived ones', async () => {
		const { threadId, issueId } = await givenTaskSession(200_000)
		await givenTaskRecord(threadId, issueId)
		await testBed.resolve(RunIssueTurn).execute(steerInput(threadId, issueId))

		const first = runner.userMessage(0)
		expect(runner.requests[0]?.session?.newId).toBeDefined()
		expect(first).not.toContain('NOTES THE PREVIOUS SESSION WROTE')
		expect(first).toContain('Exportar o relatório mensal em PDF')
		expect(first).toContain('usa a fonte da marca')
		expect(first).toContain(PENDING)
		const facts = await testBed.resolve(DomainEventRepository).findByType(AgentSessionHandedOffEvent)
		expect(facts[0]?.payload.notesSource).toBe(HandoffNotesSource.DERIVED)
	})

	it('a pause before the spawn records nothing: the next turn hands off again, from the same notes', async () => {
		const { threadId, issueId } = await givenTaskSession(150_000, NOTES)
		const aborter = testBed.resolve(IssueTurnAborter)
		const turn = aborter.begin(issueId)
		aborter.abort(issueId)
		const held = await testBed.resolve(RunIssueTurn).execute(steerInput(threadId, issueId))
		turn.end()
		expect(held.held).toBe(true)
		const untouched = await testBed.resolve(AgentSessionRepository).findByIssueId(issueId)
		expect(untouched?.agentSessionId).toBe('old-session')
		expect(untouched?.handoffNotes).toBe(NOTES)

		await Bun.sleep(2) // two turns of one issue in one millisecond mint the same event id — see RunIssueTurn.test (CWD_CHANGED)
		await testBed.resolve(RunIssueTurn).execute(steerInput(threadId, issueId))
		expect(runner.userMessage(0)).toContain(NOTES)
		expect(await testBed.resolve(DomainEventRepository).findByType(AgentSessionHandedOffEvent)).toHaveLength(1)
	})

	it('a pause that kills the handoff turn mid-run records nothing either: the next turn seeds again from the notes', async () => {
		const { threadId, issueId } = await givenTaskSession(150_000, NOTES)
		const aborter = testBed.resolve(IssueTurnAborter)
		const turn = aborter.begin(issueId)
		runner.scripts = [{ act: async () => void aborter.abort(issueId) }]
		const out = await testBed.resolve(RunIssueTurn).execute(steerInput(threadId, issueId))
		turn.end()

		expect(out.held).toBe(true)
		const row = await testBed.resolve(AgentSessionRepository).findByIssueId(issueId)
		expect(row?.agentSessionId).toBe('old-session')
		expect(row?.handoffNotes).toBe(NOTES)
		expect(await testBed.resolve(DomainEventRepository).findByType(AgentSessionHandedOffEvent)).toHaveLength(0)

		await Bun.sleep(2) // two turns of one issue in one millisecond mint the same event id — see RunIssueTurn.test (CWD_CHANGED)
		await testBed.resolve(RunIssueTurn).execute(steerInput(threadId, issueId))
		expect(runner.requests[1]?.session?.resumeId).toBeUndefined()
		expect(runner.userMessage(1)).toContain(NOTES)
	})

	it('an "agora" that cuts the handoff turn after the CLI reported its session completes the handoff — the steer resumes the new session', async () => {
		const { threadId, issueId } = await givenTaskSession(150_000, NOTES)
		const aborter = testBed.resolve(IssueTurnAborter)
		const turn = aborter.begin(issueId)
		runner.scripts = [{ act: async () => void aborter.interrupt(issueId, testId('handoff', 'agora')) }]
		const out = await testBed.resolve(RunIssueTurn).execute(steerInput(threadId, issueId))
		turn.end()

		expect(out.interrupted).toEqual({ sessionKept: true })
		const row = await testBed.resolve(AgentSessionRepository).findByIssueId(issueId)
		expect(row?.agentSessionId).toBe(runner.requests[0]?.session?.newId)
		expect(row?.handoffNotes).toBeUndefined()
		expect(await testBed.resolve(DomainEventRepository).findByType(AgentSessionHandedOffEvent)).toHaveLength(1)

		// The steer's turn continues the NEW session (small context): no second handoff.
		await Bun.sleep(2) // two turns of one issue in one millisecond mint the same event id — see RunIssueTurn.test (CWD_CHANGED)
		await testBed.resolve(RunIssueTurn).execute({ ...steerInput(threadId, issueId, 2), priorMessageId: testId('handoff', 'entry-1') })
		expect(runner.requests[1]?.session?.resumeId).toBe(runner.requests[0]?.session?.newId)
	})

	it('an "agora" that cuts the handoff turn BEFORE the CLI reported a session keeps nothing: the next turn seeds again', async () => {
		const { threadId, issueId } = await givenTaskSession(150_000, NOTES)
		const aborter = testBed.resolve(IssueTurnAborter)
		const turn = aborter.begin(issueId)
		runner.scripts = [{ noSession: true, act: async () => void aborter.interrupt(issueId, testId('handoff', 'agora')) }]
		const out = await testBed.resolve(RunIssueTurn).execute(steerInput(threadId, issueId))
		turn.end()

		expect(out.interrupted).toEqual({ sessionKept: false })
		const row = await testBed.resolve(AgentSessionRepository).findByIssueId(issueId)
		expect(row?.agentSessionId).toBe('old-session')
		expect(row?.handoffNotes).toBe(NOTES)
		expect(await testBed.resolve(DomainEventRepository).findByType(AgentSessionHandedOffEvent)).toHaveLength(0)

		await Bun.sleep(2) // two turns of one issue in one millisecond mint the same event id — see RunIssueTurn.test (CWD_CHANGED)
		await testBed.resolve(RunIssueTurn).execute(steerInput(threadId, issueId))
		expect(runner.userMessage(1)).toContain(NOTES)
	})

	it('a handoff turn the dispatcher will retry (usage limit) leaves the row as it was: the retry seeds again', async () => {
		const { threadId, issueId } = await givenTaskSession(150_000, NOTES)
		runner.scripts = [{ limited: true }]
		const out = await testBed.resolve(RunIssueTurn).execute(steerInput(threadId, issueId))

		expect(out.transportStop).toBeDefined()
		const row = await testBed.resolve(AgentSessionRepository).findByIssueId(issueId)
		expect(row?.agentSessionId).toBe('old-session')
		expect(row?.handoffNotes).toBe(NOTES)
		expect(await testBed.resolve(DomainEventRepository).findByType(AgentSessionHandedOffEvent)).toHaveLength(0)

		await Bun.sleep(2) // two turns of one issue in one millisecond mint the same event id — see RunIssueTurn.test (CWD_CHANGED)
		await testBed.resolve(RunIssueTurn).execute(steerInput(threadId, issueId))
		expect(runner.requests[1]?.session?.resumeId).toBeUndefined()
		expect(runner.userMessage(1)).toContain(NOTES)
	})
})
