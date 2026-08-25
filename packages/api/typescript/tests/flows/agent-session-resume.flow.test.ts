import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import type { ZodType } from 'zod'
import { TestBed, givenIssue, givenThread, givenWorkspace } from '@test/support'
import { LoggingService, MockLoggingService } from '@codm/core-typescript'
import { AgentModelId, MailboxItemKind, ProviderKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { RunIssueTurn } from '@agent/usecases/RunIssueTurn'
import { AgentSessionRepository } from '@agent/repositories/AgentSessionRepository'
import { AgentRunner } from '@agent/services/AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '@agent/services/AgentRunnerFactory'
import { ClaudeAgentRunner } from '@agent/services/AgentRunner'
import { ResumeInvalidationReason, AgentRunOutcome } from '@agent/enums'
import type { AgentRunRequest } from '@agent/types/AgentRunRequest'
import type { AgentRuntimeEvent } from '@agent/types/AgentRuntimeEvent'

/**
 * MULTI-TURN e2e (AC-4.3 / AC-4.4) — two inbound messages on the SAME issue, driven through the real
 * saga closer over the real SQLite store, and the second one RESUMES the session the first persisted.
 *
 * ### Why this lives here and not in the Playwright suite
 * AC-4.3 demands two proofs of the same fact: the ARGV the second turn would spawn with, and the
 * STATE of the persisted row. Neither is observable from a browser — Playwright drives the daemon
 * over HTTP, and exposing either an argv or a session row through the wire just to be able to assert
 * on it would mint a test-only API surface this goal does not sanction. So the "end to end" here is
 * the daemon's own end to end: the integration DI env with the real repository, the real transcript,
 * the real handler and the real argv builder, with only the CLI itself stubbed (§8 rule 8 — no test
 * spawns a provider binary). The Playwright suite keeps proving the browser-visible half.
 *
 * ### Why the argv is built from the REAL builder rather than asserted on `request.session`
 * `session: { resumeId }` is our vocabulary; `--resume <id>` is the CLI's. Asserting only the former
 * would pass even if `buildArgs` dropped the flag. So the spec feeds the captured request through
 * `ClaudeAgentRunner.buildArgs` — the very function `ClaudeAgentRunner.run()` calls — and asserts the
 * flags that actually reach the process.
 */

/** Captures each request the use case built, and reports a stable CLI session id back. */
class CapturingRunner extends AgentRunner {
	static readonly CLI_SESSION_ID = 'cli-session-abc'
	readonly requests: AgentRunRequest<ZodType | undefined>[] = []

	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		this.requests.push(request)
		yield {
			type: 'finished',
			result: {
				outcome: AgentRunOutcome.COMPLETED,
				replyText: 'ok',
				sessionId: CapturingRunner.CLI_SESSION_ID,
				failed: false,
			},
		}
	}

	async shutdown(): Promise<void> {}
}

/** The argv the given request would actually spawn with, through the real runner. */
function argvFor(request: AgentRunRequest<ZodType | undefined> | undefined): string[] {
	if (!request) throw new Error('no run request was captured')
	return ClaudeAgentRunner.buildArgs({
		model: request.model,
		cwd: request.cwd,
		extraDirs: request.extraDirs,
		resumeSessionId: request.session?.resumeId,
		newSessionId: request.session?.newId,
		mcp: request.mcp,
		caps: request.caps ?? {},
	})
}

describe('Flow (integration): two inbound messages on one issue → the second RESUMES the first', () => {
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

	/** A thread bound to a real workspace + an open issue on it — the shape the closer resolves. */
	async function givenIssueOnThread() {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
		return { workspace, thread, issue }
	}

	/**
	 * Append an inbound message to the issue's conversation, exactly as `ClassifyMessage` leaves it.
	 *
	 * Recorded BY THE AGGREGATE since B4: `issueId` is stamped at record time rather than by a follow-up
	 * `setIssueId` (which died with `TranscriptRepository`), and a CONTACT line carries the sender that
	 * spoke — the invariant `recordEntry` owns.
	 */
	async function givenInboundOnIssue(threadId: string, issueId: string, text: string): Promise<string> {
		const threads = testBed.resolve(ThreadRepository)
		const thread = await threads.findById(threadId)
		if (!thread) throw new Error(`no thread ${threadId}`)
		const entry = thread.recordEntry({
			kind: TranscriptKind.CONTACT,
			text,
			senderExternalId: thread.contactRef.externalId,
			issueId,
		})
		await threads.save(thread)
		return entry.entryId
	}

	/**
	 * Drives a turn the way the MAILBOX DISPATCHER now does — directly, with the run context resolved
	 * from the thread. It used to go through `RunIssueTurnOnClassification`, which was the sole runtime
	 * caller of `RunIssueTurn` and died with the classifier it listened to (§5). The PROPERTY under
	 * test is unchanged and is the reason this file survived the deletion rather than going with it:
	 * turn 1 mints a session, turn 2 resumes it, and the durable row follows.
	 */
	const runTurnFor = (
		runTurn: RunIssueTurn,
		ctx: { threadId: string; issueId: string; key: string; title: string; workspacePath: string },
		entryId: string,
		prompt: string,
		priorMessageId?: string,
	) =>
		runTurn.execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			issueId: ctx.issueId,
			threadId: ctx.threadId,
			key: ctx.key,
			title: ctx.title,
			provider: ProviderKind.CLAUDE_CODE,
			workspacePath: ctx.workspacePath,
			prompt,
			// DERIVED from the one fact this helper already has, and the same rule the dispatcher applies:
			// a turn that continues from an earlier message is an amendment to work in flight, a turn that
			// starts from nothing is the brief. Stating it per call site would have every case repeat what
			// `priorMessageId` on the line below already says.
			turnKind: priorMessageId ? MailboxItemKind.STEER : MailboxItemKind.WORK,
			messageId: entryId,
			// The conversation position this turn CONTINUES FROM. `resumeDecision` compares it against the
			// persisted cursor, so omitting it makes every turn look like it skipped ahead and invalidates
			// the resume — which is what happened when this driver was first rewired, and is exactly the
			// guard doing its job.
			priorMessageId,
		})

	it('turn 1 opens with --session-id, turn 2 resumes it with --resume, and the row follows', async () => {
		const runner = new CapturingRunner()
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))
		const runTurn = testBed.resolve(RunIssueTurn)
		const sessions = testBed.resolve(AgentSessionRepository)
		const { thread, issue, workspace } = await givenIssueOnThread()

		// ── TURN 1 ─────────────────────────────────────────────────────────────────────────────────
		const entry1 = await givenInboundOnIssue(thread.id.value, issue.id.value, 'fix the coupon focus bug')
		await runTurnFor(
			runTurn,
			{ threadId: thread.id.value, issueId: issue.id.value, key: issue.key, title: issue.title, workspacePath: workspace.path },
			entry1,
			'fix the coupon focus bug',
		)

		const argv1 = argvFor(runner.requests[0])
		// A brand-new session: the id is MINTED by us and pinned with --session-id. No --resume.
		expect(argv1).toContain('--session-id')
		expect(argv1).not.toContain('--resume')
		expect(runner.requests[0]?.session?.newId).toBeDefined()
		expect(runner.requests[0]?.session?.resumeId).toBeUndefined()

		// The row records the CLI's own session id and the cursor the turn consumed.
		const afterTurn1 = await sessions.findByIssueId(issue.id.value)
		expect(afterTurn1?.agentSessionId).toBe(CapturingRunner.CLI_SESSION_ID)
		expect(afterTurn1?.lastMessageId).toBe(entry1)
		expect(afterTurn1?.model).toBe(AgentModelId.DEFAULT)
		expect(afterTurn1?.cwd).toBe(workspace.path)

		// ── TURN 2 ─────────────────────────────────────────────────────────────────────────────────
		const entry2 = await givenInboundOnIssue(thread.id.value, issue.id.value, 'also fix the coupon label')
		await runTurnFor(
			runTurn,
			{ threadId: thread.id.value, issueId: issue.id.value, key: issue.key, title: issue.title, workspacePath: workspace.path },
			entry2,
			'also fix the coupon label',
			entry1,
		)

		expect(runner.requests).toHaveLength(2)
		const argv2 = argvFor(runner.requests[1])
		// PROOF 1 (argv) — the second spawn resumes the persisted id, and does NOT also pin a new one
		// (the two flags are mutually exclusive by construction in `buildArgs`).
		expect(argv2).toContain('--resume')
		expect(argv2[argv2.indexOf('--resume') + 1]).toBe(CapturingRunner.CLI_SESSION_ID)
		expect(argv2).not.toContain('--session-id')
		expect(runner.requests[1]?.session?.resumeId).toBe(CapturingRunner.CLI_SESSION_ID)

		// PROOF 2 (row state) — still ONE row for the issue, cursor advanced to the second message.
		const afterTurn2 = await sessions.findByIssueId(issue.id.value)
		expect(afterTurn2?.id.value).toBe(afterTurn1?.id.value ?? '')
		expect(afterTurn2?.agentSessionId).toBe(CapturingRunner.CLI_SESSION_ID)
		expect(afterTurn2?.lastMessageId).toBe(entry2)
		expect(afterTurn2?.version).toBeGreaterThan(afterTurn1?.version ?? 0)

		// The multi-turn context came from the CLI's own session — NOT from a rendered transcript
		// stuffed back into the prompt. The second prompt is the second message and nothing else: ONE
		// `<msg>` block, marked as the amendment it is, and no history above it.
		expect(runner.requests[1]?.messages).toHaveLength(1)
		const secondPrompt = runner.requests[1]?.messages[0]?.content as string
		expect(secondPrompt).toContain('also fix the coupon label')
		expect(secondPrompt).toContain('tipo="steer"')
		expect(secondPrompt.match(/<msg /g)).toHaveLength(1)
	})

	it('AC-4.4 — a conversation that advanced past the cursor starts fresh AND logs the named reason', async () => {
		const runner = new CapturingRunner()
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))
		const logging = testBed.resolve(LoggingService) as MockLoggingService
		const runTurn = testBed.resolve(RunIssueTurn)
		const { thread, issue, workspace } = await givenIssueOnThread()

		const entry1 = await givenInboundOnIssue(thread.id.value, issue.id.value, 'first message')
		await runTurnFor(
			runTurn,
			{ threadId: thread.id.value, issueId: issue.id.value, key: issue.key, title: issue.title, workspacePath: workspace.path },
			entry1,
			'fix the coupon focus bug',
		)

		// A message lands on the issue WITHOUT a turn consuming it — the handler's defensive drops, or
		// a turn that died before committing. The session's cursor is now stale by one.
		const skipped = await givenInboundOnIssue(thread.id.value, issue.id.value, 'a message no turn ever consumed')

		logging.clearLogs()
		const entry3 = await givenInboundOnIssue(thread.id.value, issue.id.value, 'third message')
		await runTurnFor(
			runTurn,
			{ threadId: thread.id.value, issueId: issue.id.value, key: issue.key, title: issue.title, workspacePath: workspace.path },
			entry3,
			'third message',
			skipped,
		)

		// FRESH, not resumed: the skipped message would otherwise be silently missing from the context.
		const argv = argvFor(runner.requests[1])
		expect(argv).toContain('--session-id')
		expect(argv).not.toContain('--resume')

		// …and it SAID SO. This is the whole of "no silent session reset".
		const warned = logging.getLogsByLevel('warn').map(entry => entry.args.content)
		const invalidation = warned.find(content => content?.reason === ResumeInvalidationReason.CONVERSATION_ADVANCED)
		expect(invalidation).toBeDefined()
		expect(invalidation?.issueId).toBe(issue.id.value)
		expect(invalidation?.abandonedSessionId).toBe(CapturingRunner.CLI_SESSION_ID)
	})
})
