import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import type { ZodType } from 'zod'
import { TestBed, givenIssue, givenThread, givenWorkspace } from '@test/support'
import { LoggingService, MockLoggingService } from '@codedm/core-typescript'
import { AgentModelId, ClassificationMethod, ProviderKind, TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { MessageClassifiedEvent } from '@thread/events/MessageClassifiedEvent'
import { TranscriptRepository } from '@thread/repositories/TranscriptRepository'
import { RunIssueTurnOnClassification } from '@agent/handlers/RunIssueTurnOnClassification'
import { AgentSessionRepository } from '@agent/repositories'
import { AgentRunner } from '@agent/services/AgentRunner'
import { ClaudeAgentRunner } from '@agent/services/AgentRunner'
import { ResumeInvalidationReason, AgentRunOutcome } from '@agent/enums'
import type { AgentRunRequest, AgentRuntimeEvent } from '@agent/types'

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
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	/** A thread bound to a real workspace + an open issue on it — the shape the closer resolves. */
	async function givenIssueOnThread() {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, {
			ownerId: OPERATOR_ID,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value })
		return { workspace, thread, issue }
	}

	/** Append an inbound message to the issue's conversation, exactly as `ClassifyMessage` leaves it. */
	async function givenInboundOnIssue(threadId: string, issueId: string, text: string): Promise<string> {
		const transcript = testBed.resolve(TranscriptRepository)
		const entry = await transcript.append({ ownerId: OPERATOR_ID, threadId, kind: TranscriptKind.CONTACT, text })
		await transcript.setIssueId(entry.entryId, issueId)
		return entry.entryId
	}

	function classified(threadId: string, entryId: string, issueId: string): MessageClassifiedEvent {
		return new MessageClassifiedEvent({
			entityId: threadId,
			ownerId: OPERATOR_ID,
			payload: { threadId, entryId, issueId, method: ClassificationMethod.CONTEXT_MATCH },
		})
	}

	it('turn 1 opens with --session-id, turn 2 resumes it with --resume, and the row follows', async () => {
		const runner = new CapturingRunner()
		testBed.override(AgentRunner, runner)
		const handler = testBed.resolve(RunIssueTurnOnClassification)
		const sessions = testBed.resolve(AgentSessionRepository)
		const { thread, issue, workspace } = await givenIssueOnThread()

		// ── TURN 1 ─────────────────────────────────────────────────────────────────────────────────
		const entry1 = await givenInboundOnIssue(thread.id.value, issue.id.value, 'fix the coupon focus bug')
		await handler.handle(classified(thread.id.value, entry1, issue.id.value))

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
		await handler.handle(classified(thread.id.value, entry2, issue.id.value))

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
		// stuffed back into the prompt. The second prompt is the second message and nothing else.
		expect(runner.requests[1]?.messages).toHaveLength(1)
		expect(runner.requests[1]?.messages[0]?.content).toBe('also fix the coupon label')
	})

	it('AC-4.4 — a conversation that advanced past the cursor starts fresh AND logs the named reason', async () => {
		const runner = new CapturingRunner()
		testBed.override(AgentRunner, runner)
		const logging = testBed.resolve(LoggingService) as MockLoggingService
		const handler = testBed.resolve(RunIssueTurnOnClassification)
		const { thread, issue } = await givenIssueOnThread()

		const entry1 = await givenInboundOnIssue(thread.id.value, issue.id.value, 'first message')
		await handler.handle(classified(thread.id.value, entry1, issue.id.value))

		// A message lands on the issue WITHOUT a turn consuming it — the handler's defensive drops, or
		// a turn that died before committing. The session's cursor is now stale by one.
		await givenInboundOnIssue(thread.id.value, issue.id.value, 'a message no turn ever consumed')

		logging.clearLogs()
		const entry3 = await givenInboundOnIssue(thread.id.value, issue.id.value, 'third message')
		await handler.handle(classified(thread.id.value, entry3, issue.id.value))

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
