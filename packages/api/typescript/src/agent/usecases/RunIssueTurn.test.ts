import { testId } from '@test/support'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { BaseError, DomainEventRepository, LoggingService, type MockLoggingService } from '@codedm/core-typescript'
import { ProviderKind, ProviderStatus, StopKind } from '@codedm/contracts-typescript/wire/enums'
import type { ZodType } from 'zod'
import { RunIssueTurn } from './RunIssueTurn'
import { AgentRunner } from '../services/AgentRunner'
import { ProviderDetector, MockProviderDetector } from '../services/ProviderDetector'
import { AgentStreamRegistry, type TerminalSseFrame } from '../services/AgentStreamRegistry'
import { AgentSessionRepository } from '../repositories'
import { AgentRunStartedEvent } from '../events/AgentRunStartedEvent'
import { AgentRunReplyDraftedEvent } from '../events/AgentRunReplyDraftedEvent'
import { AgentRunCompletedEvent } from '../events/AgentRunCompletedEvent'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
import { ResumeInvalidationReason, AgentRunOutcome, type TransportStopKind } from '../enums'
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
				outcome: AgentRunOutcome.STOPPED,
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
		yield { type: 'finished', result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'ok', sessionId: 'sess-cap', failed: false } }
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

		expect(out.outcome).toBe(AgentRunOutcome.COMPLETED)
		expect(out.replyText).toContain('done')

		// TRANSPORT — observer received line frames tagged with the issue.
		expect(frames.length).toBeGreaterThan(0)
		expect(frames.every(f => f.issueId === issueId)).toBe(true)

		// FACTS — opened + reply persisted. The COMPLETION is deliberately absent (AC-6.4(b)): the
		// injected `IssueWorkAgent` declares a non-empty tool scope, so the ONLY producer of the
		// completion fact is the declaration use case behind `TransitionIssueStatus`. Minting one here
		// too would publish the frozen `integration.issue.completed` twice — the exact double-publish
		// this phase's predicate exists to prevent, in the "declared AND also ended normally" case.
		expect(await eventRepo.findByType(AgentRunStartedEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(AgentRunReplyDraftedEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(AgentRunCompletedEvent)).toHaveLength(0)
		expect(await eventRepo.findByType(AgentRunStopRaisedEvent)).toHaveLength(0)

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

	it('drives the seam with the workspace as cwd and ONE user message — with mcp, no outputSchema', async () => {
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
		// `mcp` IS present now, and its presence is the same fact the completion predicate reads from the
		// other side: `request.mcp` present ⟺ `agent.tools.length > 0` (§4.3 rule 7). The use case cannot
		// see the request — it is assembled inside the agent — which is why the predicate is written on
		// the tool scope and this assertion is the mirror that proves the two agree.
		expect(request?.mcp?.transport).toBe('http')
		expect(request?.mcp?.allowedTools.length).toBeGreaterThan(0)
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

	/**
	 * THE MISROUTING HAZARD THIS SUITE CLOSES. `DetectProviders` reports codex identically to
	 * claude-code, and `AttachThread` only checks installation — so a machine where the codex BINARY
	 * happens to be on PATH lets a thread declare `providers: ['CODEX']` even though no runner drives
	 * it. Before this guard, `resolveProvider` would return normally (detection succeeded) and
	 * `drainRun` would fall through to `this.runner.run()` — silently executing the turn with
	 * whichever runner IS bound (`StubAgentRunner` here, `ClaudeAgentRunner` in `real`).
	 *
	 * Overriding `ProviderDetector` (not `AgentRunner`) is what proves the RIGHT layer is doing the
	 * rejecting: the bound runner stays the ordinary `StubAgentRunner` — the guard is `RunIssueTurn`
	 * comparing `input.provider` against `RUNNER_SUPPORTED_PROVIDERS` (`agent/registry.ts`), the DI
	 * wiring's own declaration of what the bound runner drives, so a codex request is refused before
	 * `run()` is ever reached without the runner class itself ever naming a `ProviderKind` (AC-4.5.3).
	 *
	 * Placed AFTER "rejects a provider that is not installed": `testBed.override` replaces the
	 * container binding for the rest of the suite (it is not undone by `reset()`), so this must run
	 * once the CODEX-not-installed case above has already observed the pristine catalog. The override
	 * only supplies a CODEX entry — `MockProviderDetector`'s CLAUDE_CODE default (including
	 * `caps.sessionResume`) still falls through untouched, which is why every test that runs after
	 * this one (all of them use `baseInput()`'s default CLAUDE_CODE) is unaffected.
	 */
	it('fails loudly — names the provider and refuses to run — when the provider is DETECTED but no runner exists for it', async () => {
		testBed.override(
			ProviderDetector,
			MockProviderDetector.with({
				[ProviderKind.CODEX]: {
					name: ProviderKind.CODEX,
					status: ProviderStatus.DETECTED,
					binaryPath: '/usr/local/bin/codex',
					version: '1.0.0',
				},
			}),
		)
		const useCase = testBed.resolve(RunIssueTurn)
		const issueId = testId('run-issue-turn', 'issue-codex-no-runner')

		const failure = await useCase.execute({ ...baseInput(issueId), provider: ProviderKind.CODEX }).then(
			() => undefined,
			(error: unknown) => error,
		)

		expect(failure).toEqual(expect.objectContaining({ name: 'NOT_IMPLEMENTED' }) as BaseError)
		expect((failure as BaseError).message).toContain(ProviderKind.CODEX)
	})

	it('maps a TRANSPORT stop to a STOPPED outcome + a stop-raised fact (runner overridden last)', async () => {
		testBed.override(AgentRunner, new StoppingRunner())
		const useCase = testBed.resolve(RunIssueTurn)
		const eventRepo = testBed.resolve(DomainEventRepository)
		const issueId = testId('run-issue-turn', 'issue-4')

		const out = await useCase.execute(baseInput(issueId))

		expect(out.outcome).toBe(AgentRunOutcome.STOPPED)
		expect(out.stopId).toBeDefined()
		expect(await eventRepo.findByType(AgentRunStartedEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(AgentRunStopRaisedEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(AgentRunCompletedEvent)).toHaveLength(0)
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
		// The sleep is NOT a synchronization hack, and it is not hiding a bug in the code under test.
		// `BaseEvent` mints its id as `Id.fromSeed(JSON.stringify(this))` (`core/src/types/BaseEvent.ts:22`)
		// and the only time-varying part of that serialization is `time`, at MILLISECOND resolution.
		// This test drives THREE turns on ONE issue, and `AgentRunStartedEvent`'s payload
		// (issueId/threadId/key/title/provider) is byte-identical across all three — so two turns landing
		// inside the same millisecond mint the SAME id and the second insert dies on
		// `UNIQUE constraint failed: shared_events.id`. That race is PRE-EXISTING and independent of any
		// runner refactor: reproduced on an untouched worktree at 6f807917 in 1 of 3 full-suite runs (it
		// only fires in the full suite, where the process is warm enough for two turns to share a
		// millisecond; the file passes alone every time). Advancing the clock 2ms makes the SUITE
		// deterministic without papering over the hazard — the collision itself is reported as a finding
		// against `BaseEvent`, whose fix is a behaviour change and therefore not this phase's business.
		await Bun.sleep(2)
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
		await Bun.sleep(2) // same millisecond-collision reason as turn 2 — see the note above.
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
