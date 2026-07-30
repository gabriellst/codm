import { testId } from '@test/support'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { BaseError, DomainEventRepository, LoggingService, type MockLoggingService } from '@codedm/core-typescript'
import {
	IssueStatus,
	MailboxItemKind,
	MailboxTargetKind,
	ProviderKind,
	ProviderStatus,
	StopKind,
} from '@codedm/contracts-typescript/wire/enums'
import type { ZodType } from 'zod'
import { RunIssueTurn } from './RunIssueTurn'
import { DeclareIssueComplete } from './DeclareIssueComplete'
import { AgentRunner } from '../services/AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '../services/AgentRunnerFactory'
import { ProviderDetector, MockProviderDetector } from '../services/ProviderDetector'
import { AgentStreamRegistry, type TerminalSseFrame } from '../services/AgentStreamRegistry'
import { AgentIdentityService } from '@codedm/core-typescript'
import { AgentSessionRepository, MailboxRepository } from '../repositories'
import { IssueWorkAgent, IssueWorkPromptBuilder } from '../agents/IssueWorkAgent'
import { AgentRunStartedEvent } from '../events/AgentRunStartedEvent'
import { AgentRunCompletedEvent } from '../events/AgentRunCompletedEvent'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
import { ResumeInvalidationReason, AgentRunOutcome, FactSource, type TransportStopKind } from '../enums'
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

		// FACTS — opened. The reply is NO LONGER a fact: since B1 the turn's text rides the ISSUE_RESULT
		// mailbox item instead of `agent.run.reply_drafted`, so the orchestrator can COMPOSE it rather
		// than the raw worker voice going straight to the channel. Asserted below on the mailbox.
		//
		// The COMPLETION is deliberately absent (AC-6.4(b)): the
		// injected `IssueWorkAgent` declares a non-empty tool scope, so the ONLY producer of the
		// completion fact is the declaration use case behind `TransitionIssueStatus`. Minting one here
		// too would publish the frozen `integration.issue.completed` twice — the exact double-publish
		// this phase's predicate exists to prevent, in the "declared AND also ended normally" case.
		expect(await eventRepo.findByType(AgentRunStartedEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(AgentRunCompletedEvent)).toHaveLength(0)
		expect(await eventRepo.findByType(AgentRunStopRaisedEvent)).toHaveLength(0)

		// AC-B1.1 — the RESULT is queued for the thread, in the same transaction as the outcome facts.
		const queued = await testBed.resolve(MailboxRepository).claimNext('run-issue-turn-test', 60_000)
		expect(queued?.kind).toBe(MailboxItemKind.ISSUE_RESULT)
		expect(queued?.targetKind).toBe(MailboxTargetKind.THREAD)
		expect((queued?.payload as { outcome: { replyText: string } } | undefined)?.outcome.replyText).toBeTruthy()

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

	/**
	 * AC-6.4(b) — THE DEGENERATE CASE, and the DECLARED half of §4.3 rule 6.
	 *
	 * Two plausible producers of the same fact are live at once: the agent DECLARED completion through
	 * the tool, and its turn ALSO ended normally. Exactly one of them may write, and the ledger must say
	 * WHICH — otherwise `FactSource` is a column nobody ever reads back and the whole DECLARED/INFERRED
	 * distinction is a promise rather than a fact.
	 *
	 * The declaration is executed as the USE CASE behind `TransitionIssueStatus`, not through the MCP
	 * router: the router's job (authorising the call) is measured by AC-6.6's own suite, and going
	 * through it here would make this test fail for reasons that have nothing to do with double-publish.
	 * The write it performs is byte-identical either way.
	 *
	 * The source is read back from `shared_events` — `DomainEventRepository.findByType` rehydrates from
	 * the table — never from a log line, which is what AC-6.4(c)/AC-6.7(a) spell out.
	 */
	it('AC-6.4(b) — DECLARED then ALSO ended normally: exactly ONE completion fact, and the ledger says DECLARED', async () => {
		const declare = testBed.resolve(DeclareIssueComplete)
		const useCase = testBed.resolve(RunIssueTurn)
		const eventRepo = testBed.resolve(DomainEventRepository)
		const issueId = testId('run-issue-turn', 'issue-declared-and-completed')

		await declare.execute({
			ownerId,
			issueId,
			threadId,
			status: IssueStatus.COMPLETED,
			summary: 'coupon focus restored',
			key: 'coupon-focus',
		})

		// The injected agent is the REAL `IssueWorkAgent`, whose `tools` is the derived expansion of
		// `issue-handling` — i.e. non-empty — so `RunIssueTurn` must stay silent about the conclusion.
		await useCase.execute(baseInput(issueId))

		const completed = await eventRepo.findByType(AgentRunCompletedEvent)
		expect(completed).toHaveLength(1)
		expect(completed[0]?.payload.source).toBe(FactSource.DECLARED)
	})

	it('drives the seam with the workspace as cwd and ONE user message — with mcp, no outputSchema', async () => {
		const runner = new CapturingRunner()
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))
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
	 * `drainRun` would fall through to a `run()` on whichever runner IS bound (`StubAgentRunner` here,
	 * `ClaudeAgentRunner` in `real`).
	 *
	 * Overriding `ProviderDetector` (not the runner factory) is what proves the RIGHT layer is doing
	 * the rejecting: the bound factory stays the ordinary `StubAgentRunnerFactory` — the guard is
	 * `AgentRunnerFactory.for(provider)` returning no runner for CODEX, the DI wiring's own declaration
	 * of what it can drive, so a codex request is refused before `run()` is ever reached without the
	 * runner class itself ever naming a `ProviderKind` (AC-4.5.3). The stub factory deliberately stands
	 * in only for CLAUDE_CODE, which is what keeps this assertion meaningful.
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
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(new StoppingRunner()))
		const useCase = testBed.resolve(RunIssueTurn)
		const eventRepo = testBed.resolve(DomainEventRepository)
		const issueId = testId('run-issue-turn', 'issue-4')

		const out = await useCase.execute(baseInput(issueId))

		expect(out.outcome).toBe(AgentRunOutcome.STOPPED)
		expect(out.stopId).toBeDefined()
		expect(await eventRepo.findByType(AgentRunStartedEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(AgentRunCompletedEvent)).toHaveLength(0)

		// AC-6.7(c), the parenthetical half: "and the same holds for an agent WITH a tool scope — the
		// transport stop is minted just the same". This agent's scope is NON-empty, and the stop lands
		// anyway, tagged INFERRED: the runner OBSERVED it on the process, no tool was involved, and no
		// model could have declared it (`DeclareStop` refuses the transport kinds outright).
		const stops = await eventRepo.findByType(AgentRunStopRaisedEvent)
		expect(stops).toHaveLength(1)
		expect(stops[0]?.payload.kind).toBe(StopKind.SERVER_ERROR)
		expect(stops[0]?.payload.source).toBe(FactSource.INFERRED)
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
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))
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

/**
 * A double of the WORKING agent whose only difference is an EMPTY tool scope — the shape AC-6.4
 * prescribes verbatim ("injeta-se um agent-duplo cujo `readonly tools` é `[]` ou
 * `TOOLS_IN_SCOPE['issue-handling']`").
 *
 * ### Why `tools` and nothing else
 * `RunIssueTurn` reads exactly one thing off the agent besides `run()`: `this.agent.tools.length`
 * (`RunIssueTurn.ts:284` and `:304`). That is the whole predicate, and §4.3 rule 7 is explicit that it
 * must be so — the use case cannot see `request.mcp`, which is assembled INSIDE the agent, so a test
 * that tried to build the case from the request would be testing a field the code under test never
 * touches.
 *
 * ### What `mcpScope` is doing here, said out loud
 * It stays `'issue-handling'`: `IssueWorkAgent` narrows the field to a literal, so a subclass cannot
 * un-declare it. The consequence is that the base still mints a run token and still attaches an `mcp`
 * invocation — with an EMPTY `allowedTools`. Far from weakening the test, that is what makes it sharp:
 * the request carries `mcp` and the use case mints the INFERRED fact anyway, which is only possible if
 * the predicate really is the tool scope. A use case that had (wrongly) keyed on `request.mcp` would
 * stay silent and this suite would go red.
 */
class ToollessIssueWorkAgent extends IssueWorkAgent {
	override readonly tools: readonly string[] = []
}

/**
 * AC-6.4(c) and AC-6.7 — the INFERRED half of the ledger, in its own TestBed.
 *
 * Isolated in a second `describe` on purpose: `testBed.override` is NOT undone by `reset()`, so
 * swapping the agent inside the suite above would hand the tool-less double to every test declared
 * after it — including the one that asserts `mcp.allowedTools.length > 0`. A second bed costs one
 * PGlite instance and removes an ordering hazard that a future edit would otherwise re-introduce
 * silently.
 */
describe('RunIssueTurn — the agent with an EMPTY tool scope (AC-6.4(c), AC-6.7)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const ownerId = testId('run-issue-turn-toolless', 'owner')
	const threadId = testId('run-issue-turn-toolless', 'thread')

	const baseInput = (issueId: string) => ({
		ownerId,
		issueId,
		threadId,
		key: 'coupon-focus',
		title: 'Coupon focus bug',
		provider: ProviderKind.CLAUDE_CODE,
		workspacePath: '/tmp/workspace',
		prompt: 'fix the coupon focus bug',
		messageId: testId('run-issue-turn-toolless', 'entry-1'),
	})

	/**
	 * Rebinds `IssueWorkAgent` to the tool-less double. It takes NO runner: the runner reaches an agent
	 * as a parameter to `run()`, resolved by `RunIssueTurn` from whichever `AgentRunnerFactory` is bound
	 * at call time — so a double built here can no longer capture a stale one.
	 */
	const injectToollessAgent = () =>
		testBed.override(IssueWorkAgent, new ToollessIssueWorkAgent(testBed.resolve(AgentIdentityService), new IssueWorkPromptBuilder()))

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
	 * AC-6.4(c) — the MIRROR of the degenerate case, and AC-6.7(a) in the same breath.
	 *
	 * With no tools there is no declaration path at all, so the turn's clean end is the ONLY evidence
	 * the issue is done, and `RunIssueTurn` must mint the completion — exactly once, and marked
	 * INFERRED. That mark is the point: "how many issues closed by inference?" has to be a `SELECT`
	 * over the ledger, which is only true if something actually writes the column AND something
	 * actually reads it back. Read from `shared_events`, never from a log (AC-6.7(a), literally).
	 */
	it('AC-6.4(c)/AC-6.7(a) — ends normally with NO tools: exactly ONE completion fact, and it is INFERRED', async () => {
		injectToollessAgent()
		const useCase = testBed.resolve(RunIssueTurn)
		const eventRepo = testBed.resolve(DomainEventRepository)
		const issueId = testId('run-issue-turn-toolless', 'issue-inferred')

		const out = await useCase.execute(baseInput(issueId))
		expect(out.outcome).toBe(AgentRunOutcome.COMPLETED)

		const completed = await eventRepo.findByType(AgentRunCompletedEvent)
		expect(completed).toHaveLength(1)
		expect(completed[0]?.payload.source).toBe(FactSource.INFERRED)

		// AC-6.7(b) — a run with no tools produces NO domain stop. `RaiseStop` / `AskOperator` are the
		// only origins of APPROVAL_NEEDED / HUMAN_REQUESTED / BLOCKED_BY_CLASSIFICATION, and neither is
		// reachable without a tool scope, so the absence here is structural rather than incidental.
		expect(await eventRepo.findByType(AgentRunStopRaisedEvent)).toHaveLength(0)
	})

	/**
	 * AC-6.7(c) — degradation is VISIBLE, not silent: a run with no tools can still be stopped by the
	 * TRANSPORT, and that stop is minted whatever the scope is, always INFERRED.
	 *
	 * This is the alínea that keeps "no tools" from meaning "no observations". The runner watches the
	 * process and the stream; `AUTH_REQUIRED` / `SERVER_ERROR` are its findings, and they never needed a
	 * tool to be true.
	 *
	 * Declared LAST in this bed because the runner override persists — every earlier test must have
	 * already observed the ordinary stub.
	 */
	it('AC-6.7(c) — still raises a TRANSPORT stop with no tools, marked INFERRED, and mints no completion', async () => {
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(new StoppingRunner()))
		injectToollessAgent()
		const useCase = testBed.resolve(RunIssueTurn)
		const eventRepo = testBed.resolve(DomainEventRepository)
		const issueId = testId('run-issue-turn-toolless', 'issue-transport-stop')

		const out = await useCase.execute(baseInput(issueId))
		expect(out.outcome).toBe(AgentRunOutcome.STOPPED)

		const stops = await eventRepo.findByType(AgentRunStopRaisedEvent)
		expect(stops).toHaveLength(1)
		expect(stops[0]?.payload.kind).toBe(StopKind.SERVER_ERROR)
		expect(stops[0]?.payload.source).toBe(FactSource.INFERRED)
		expect(await eventRepo.findByType(AgentRunCompletedEvent)).toHaveLength(0)
	})
})
