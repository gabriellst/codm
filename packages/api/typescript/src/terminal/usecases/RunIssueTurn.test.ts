import { testId } from '@test/support'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { BaseError, DomainEventRepository, LoggingService, type MockLoggingService } from '@codedm/core-typescript'
import { ProviderKind, StopKind } from '@codedm/contracts-typescript/wire/enums'
import type { ZodType } from 'zod'
import { RunIssueTurn } from './RunIssueTurn'
import { AgentRunner } from '../services/AgentRunner'
import { AgentStreamRegistry, type TerminalSseFrame } from '../services/AgentStreamRegistry'
import { AgentSessionRepository } from '../repositories'
import { TerminalSessionStartedEvent } from '../events/TerminalSessionStartedEvent'
import { TerminalReplyDraftedEvent } from '../events/TerminalReplyDraftedEvent'
import { TerminalSessionCompletedEvent } from '../events/TerminalSessionCompletedEvent'
import { TerminalStopRaisedEvent } from '../events/TerminalStopRaisedEvent'
import { ResumeInvalidationReason, TerminalRunOutcome, type TransportStopKind } from '../enums'
import type { AgentRunRequest, AgentRuntimeEvent } from '../types'

/** A runner whose one run ends on a TRANSPORT stop — drives the STOPPED branch deterministically. */
class StoppingRunner extends AgentRunner {
	async *run<OutputSchema extends ZodType | undefined = undefined>(
		_request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		yield { type: 'frame', frame: { kind: 'error', detail: 'Error: API rate limit exceeded' } }
		yield {
			type: 'finished',
			result: {
				outcome: TerminalRunOutcome.STOPPED,
				replyText: '',
				sessionId: null,
				failed: false,
				stop: { kind: StopKind.SERVER_ERROR as TransportStopKind, detail: 'provider exited with code 1' },
			},
		}
	}
	async shutdown(): Promise<void> {}
}

/** Captures the request the use case built, so the argv-shaping inputs can be asserted. */
class CapturingRunner extends AgentRunner {
	requests: AgentRunRequest<ZodType | undefined>[] = []
	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		this.requests.push(request)
		yield { type: 'finished', result: { outcome: TerminalRunOutcome.COMPLETED, replyText: 'ok', sessionId: 'sess-cap', failed: false } }
	}
	async shutdown(): Promise<void> {}
}

describe('RunIssueTurn use case', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const ownerId = testId('run-issue-turn', 'owner')
	const threadId = testId('run-issue-turn', 'thread')

	const baseInput = (issueId: string) => ({
		ownerId,
		issueId,
		threadId,
		key: 'coupon-focus',
		title: 'Coupon focus bug',
		provider: ProviderKind.CLAUDE_CODE,
		workspacePath: '/tmp/workspace',
		prompt: 'fix the coupon focus bug',
		messageId: testId('run-issue-turn', 'entry-1'),
	})

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

	it('happy path: streams transport frames to the observer + persists opened/reply/completed facts', async () => {
		const useCase = testBed.resolve(RunIssueTurn)
		const registry = testBed.resolve(AgentStreamRegistry)
		const eventRepo = testBed.resolve(DomainEventRepository)
		const issueId = testId('run-issue-turn', 'issue-1')

		// Attach an SSE observer so the transport half of the two-stream split is observable.
		const frames: TerminalSseFrame[] = []
		registry.register(issueId, ownerId, frame => {
			frames.push(frame)
		})

		const out = await useCase.execute(baseInput(issueId))

		expect(out.outcome).toBe(TerminalRunOutcome.COMPLETED)
		expect(out.replyText).toContain('done')

		// TRANSPORT — observer received line frames tagged with the issue.
		expect(frames.length).toBeGreaterThan(0)
		expect(frames.every(f => f.issueId === issueId)).toBe(true)

		// FACTS — opened + reply + completed persisted; no stop.
		expect(await eventRepo.findByType(TerminalSessionStartedEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(TerminalReplyDraftedEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(TerminalSessionCompletedEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(TerminalStopRaisedEvent)).toHaveLength(0)

		// TEARDOWN — the single-active claim is released.
		expect(registry.isActive(issueId)).toBe(false)
	})

	it('upserts the durable session row from the session id the terminal event reported', async () => {
		const useCase = testBed.resolve(RunIssueTurn)
		const sessions = testBed.resolve(AgentSessionRepository)
		const issueId = testId('run-issue-turn', 'issue-session')

		await useCase.execute(baseInput(issueId))

		const row = await sessions.findByIssueId(issueId)
		expect(row?.agentSessionId).toBe('stub-session')
	})

	it('drives the seam with the workspace as cwd and ONE user message — no mcp, no outputSchema', async () => {
		const runner = new CapturingRunner()
		testBed.override(AgentRunner, runner)
		const useCase = testBed.resolve(RunIssueTurn)
		const issueId = testId('run-issue-turn', 'issue-request')

		await useCase.execute(baseInput(issueId))

		const request = runner.requests[0]
		expect(request?.cwd).toBe('/tmp/workspace')
		expect(request?.messages).toHaveLength(1)
		expect(request?.messages[0]?.content).toBe('fix the coupon focus bug')
		expect(request?.outputSchema).toBeUndefined()
		expect(request?.mcp).toBeUndefined()
		// `binaryPath` is threaded from detection, never read from an ambient map (§4.7).
		expect(request?.binaryPath).toBeDefined()
	})

	it('enforces one session per issue (single-active invariant)', async () => {
		const useCase = testBed.resolve(RunIssueTurn)
		const registry = testBed.resolve(AgentStreamRegistry)
		const issueId = testId('run-issue-turn', 'issue-2')

		registry.beginSession(issueId) // simulate an already-running session
		try {
			await expect(useCase.execute(baseInput(issueId))).rejects.toThrow(
				expect.objectContaining({ name: 'TERMINAL_ALREADY_RUNNING' }) as BaseError,
			)
		} finally {
			registry.endSession(issueId)
		}
	})

	it('rejects a provider that is not installed', async () => {
		const useCase = testBed.resolve(RunIssueTurn)
		const issueId = testId('run-issue-turn', 'issue-3')
		// CODEX is NOT_INSTALLED in the MockProviderDetector default catalog.
		await expect(useCase.execute({ ...baseInput(issueId), provider: ProviderKind.CODEX })).rejects.toThrow(
			expect.objectContaining({ name: 'PROVIDER_NOT_DETECTED' }) as BaseError,
		)
	})

	it('maps a TRANSPORT stop to a STOPPED outcome + a stop-raised fact (runner overridden last)', async () => {
		testBed.override(AgentRunner, new StoppingRunner())
		const useCase = testBed.resolve(RunIssueTurn)
		const eventRepo = testBed.resolve(DomainEventRepository)
		const issueId = testId('run-issue-turn', 'issue-4')

		const out = await useCase.execute(baseInput(issueId))

		expect(out.outcome).toBe(TerminalRunOutcome.STOPPED)
		expect(out.stopId).toBeDefined()
		expect(await eventRepo.findByType(TerminalSessionStartedEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(TerminalStopRaisedEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(TerminalSessionCompletedEvent)).toHaveLength(0)
	})

	/**
	 * CWD_CHANGED convergence (Fase 4 review fix). Three turns on ONE issue: same cwd, a cwd that
	 * MOVES, then that same new cwd again. Before the fix, `AgentSession.recordTurn` never folded
	 * `cwd`, so the row stayed pinned to the FIRST cwd forever — turn 3 would invalidate again
	 * (CWD_CHANGED fires on every turn, never converges). The definition of "converges" is exactly
	 * what this test asserts: the guard fires EXACTLY ONCE (turn 2) and turn 3 resumes.
	 */
	it('CWD_CHANGED converges: fires exactly once when the workspace moves, then the next turn under the SAME new cwd resumes', async () => {
		const runner = new CapturingRunner()
		testBed.override(AgentRunner, runner)
		const logging = testBed.resolve(LoggingService) as MockLoggingService
		const sessions = testBed.resolve(AgentSessionRepository)
		const useCase = testBed.resolve(RunIssueTurn)
		const issueId = testId('run-issue-turn', 'issue-cwd-convergence')

		// ── TURN 1 — brand-new session, established under cwd A. ──────────────────────────────────
		const entry1 = testId('run-issue-turn', 'entry-cwd-1')
		await useCase.execute({ ...baseInput(issueId), workspacePath: '/tmp/workspace-a', messageId: entry1 })
		expect(runner.requests[0]?.session?.newId).toBeDefined()
		expect((await sessions.findByIssueId(issueId))?.cwd).toBe('/tmp/workspace-a')

		// ── TURN 2 — cwd MOVES to B. The guard MUST fire, exactly here. ───────────────────────────
		logging.clearLogs()
		const entry2 = testId('run-issue-turn', 'entry-cwd-2')
		await useCase.execute({ ...baseInput(issueId), workspacePath: '/tmp/workspace-b', messageId: entry2, priorMessageId: entry1 })

		// FRESH, not resumed — a new session id is minted for the new cwd.
		expect(runner.requests[1]?.session?.newId).toBeDefined()
		expect(runner.requests[1]?.session?.resumeId).toBeUndefined()

		// The guard fired exactly once, and said why.
		const warningsAfterTurn2 = logging.getLogsByLevel('warn').map(entry => entry.args.content)
		const cwdInvalidationsAfterTurn2 = warningsAfterTurn2.filter(content => content?.reason === ResumeInvalidationReason.CWD_CHANGED)
		expect(cwdInvalidationsAfterTurn2).toHaveLength(1)

		// CONVERGENCE: the row now tracks the NEW cwd — the reference point the NEXT turn compares
		// against is B, not the stale A.
		const afterTurn2 = await sessions.findByIssueId(issueId)
		expect(afterTurn2?.cwd).toBe('/tmp/workspace-b')

		// ── TURN 3 — SAME cwd as turn 2 (B). The guard must NOT fire again: this turn resumes. ────
		logging.clearLogs()
		const entry3 = testId('run-issue-turn', 'entry-cwd-3')
		await useCase.execute({ ...baseInput(issueId), workspacePath: '/tmp/workspace-b', messageId: entry3, priorMessageId: entry2 })

		expect(runner.requests[2]?.session?.resumeId).toBeDefined()
		expect(runner.requests[2]?.session?.newId).toBeUndefined()

		// No further CWD_CHANGED invalidation — the guard converged instead of latching.
		const warningsAfterTurn3 = logging.getLogsByLevel('warn').map(entry => entry.args.content)
		expect(warningsAfterTurn3.some(content => content?.reason === ResumeInvalidationReason.CWD_CHANGED)).toBe(false)
	})
})
