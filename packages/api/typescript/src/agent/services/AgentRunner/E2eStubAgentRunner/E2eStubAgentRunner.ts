import { injectable } from 'tsyringe-neo'
import type { ZodType } from 'zod'
import { AgentName, AgentRunOutcome } from '../../../enums'
import { E2eMcpDriver } from '../../../mcp/E2eMcpDriver'
import { wireToolName } from '../../../mcp/wire'
import type { AgentFrame } from '../../../types/AgentFrame'
import type { AgentRunRequest } from '../../../types/AgentRunRequest'
import type { AgentRuntimeEvent } from '../../../types/AgentRuntimeEvent'
import { AgentRunner } from '../AgentRunner'

/**
 * The `AgentRunner` bound in the `e2e` DI env column (agent/registry.ts).
 *
 * The Playwright harness boots the REAL daemon over the real SQLite, but must never spawn a provider
 * CLI. This stand-in keeps the whole inbound → classify → session → declare chain hermetic AND
 * deterministic, which is what lets a spec poll for a settled issue status instead of guessing.
 *
 *   - CLASSIFICATION (`outputSchema` present) — always a `NEW_ISSUE` decision, so the saga closer
 *     mints a fresh issue and a slug key derived from the inbound message.
 *   - WORK (no `outputSchema`) — a couple of canned `assistant_text` frames and a COMPLETED terminal
 *     event.
 *
 * ### WHEN THE RUN CARRIES TOOLS IT DECLARES, because nothing else will (AC-6.2)
 * Fase 6 removed the INFERRED completion for any agent with a non-empty tool scope (§4.3 rule 7): with
 * tools, "the issue is done" is SAID, never derived from a clean exit. A stub that only exits cleanly
 * would therefore leave every issue stuck at WORKING — the removal and its replacement cannot ship
 * apart. So a run that arrives with an `mcp` invocation drives the REAL MCP endpoint through a real
 * client and declares: an artifact, then the completion.
 *
 * The identity those calls need is resolved INSIDE `E2eMcpDriver` from the opaque token, and that is
 * not fastidiousness: AC-6.12 greps this whole directory for the envelope's three identity keys and
 * requires ZERO hits, because the transport seam does not see identity — not even to name it. This
 * file honours that by handing the driver the invocation whole and never looking inside it.
 */
@injectable()
export class E2eStubAgentRunner extends AgentRunner {
	/** Stable reply line the stubbed session "writes" — a spec asserts the transcript renders it. */
	static readonly REPLY_LINE = 'e2e-agent: acknowledged — working on it'
	/** Stable NEW_ISSUE title the classification run returns. */
	static readonly ISSUE_TITLE = 'Fix the login bug'
	/**
	 * A sentinel substring for an ORCHESTRATOR run's inbound text (thinking-indicator spec, T5/AC-6).
	 *
	 * The stub otherwise never fails, so AC-6 ("erro do run edita a mensagem de fase para erro
	 * amigável e corta a presença") has nothing to trigger against. There is no identity-free way to
	 * ask for a failure here — `AgentRunRequest` deliberately carries no `ownerId`/`issueId`/`threadId`
	 * (AC-6.12) — so the ONLY signal this runner can read is the rendered PROMPT TEXT, which is exactly
	 * what a real inbound message becomes (`OrchestratorPromptBuilder.user`). A spec that seeds an
	 * inbound message containing this string gets a deterministic, hermetic run failure with no real
	 * provider crash involved.
	 */
	static readonly THINKING_ERROR_SENTINEL = 'e2e-thinking-error-trigger'

	constructor(private readonly declarations: E2eMcpDriver) {
		super()
	}

	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		// WHICH agent this is, not whether it wants structured output. The stub used to branch on
		// `request.outputSchema`, which existed only because the classifier declared one — and the
		// classifier is gone (§5). Branching on identity is also what lets the orchestrator's turn drive
		// the REAL `issue/create` tool instead of returning a fabricated verdict.
		const isOrchestrator = request.agentName === AgentName.ORCHESTRATOR

		// THE E2E-ONLY FAILURE TRIGGER (thinking-indicator spec, T5/AC-6). Thrown BEFORE any frame is
		// yielded — `RunOrchestratorTurn` has already opened the "Pensando" placeholder and started the
		// typing loop by the time it calls this generator, so a throw here reaches its `catch` block
		// exactly like a real provider crash would (`closeCuesOnNoDelivery`): the placeholder gets
		// edited to the friendly error copy and the presence loop gets cancelled. Orchestrator-only —
		// the WORK agent (`isOrchestrator === false`) never reads this sentinel, so 09/10's assertions
		// against `declareIssueWorkComplete`'s real tool calls are untouched.
		if (isOrchestrator && request.messages.some(message => message.content.includes(E2eStubAgentRunner.THINKING_ERROR_SENTINEL))) {
			throw new Error('e2e-stub: simulated run failure (thinking-indicator error path)')
		}

		// `agentName`, not a provider: since Fase 4.5 the request carries no provider identity — WHICH
		// CLI a run belongs to is settled by the DI binding that produced this very object.
		const lines = [`$ ${request.agentName} (e2e-stub) in ${request.cwd}`, E2eStubAgentRunner.REPLY_LINE]
		for (const [index, text] of lines.entries()) {
			const frame: AgentFrame = { kind: 'assistant_text', messageId: `e2e-stub-${index}`, text, parentToolUseId: null }
			yield { type: 'frame', frame }
		}

		// A SYNTHETIC SECOND PHASE (thinking-indicator spec, T5/AC-3) — orchestrator-only, and NOT an
		// MCP call: no side effect, no real tool invoked, just a `tool_use`/`tool_result` frame pair
		// with a tool name distinct from the real fork call below. `RunOrchestratorTurn`'s phase-edit
		// tracking (`lastPhaseTool`) only reads `frame.tool`, so this drives a SECOND "Pensando" verb
		// transition ahead of the real `ForkIssue` declaration, proving the placeholder advances by
		// PHASE (not by a fixed count) without risking the real MCP round trip other specs assert on.
		if (isOrchestrator) {
			const toolUseId = 'e2e-stub-thinking-phase'
			yield {
				type: 'frame',
				frame: { kind: 'tool_use', toolUseId, tool: 'e2e_stub_survey_context', input: {}, parentToolUseId: null },
			}
			yield { type: 'frame', frame: { kind: 'tool_result', toolUseId, ok: true, summary: 'context surveyed', parentToolUseId: null } }
		}

		// THE DECLARATION. `request.mcp` present ⟺ the agent declared a non-empty tool scope (§4.3 rule
		// 7) — the same equivalence `RunIssueTurn` reads from the other side as `agent.tools.length`.
		if (request.mcp) {
			const calls = isOrchestrator
				? await this.declarations.forkIssue(request.mcp)
				: await this.declarations.declareIssueWorkComplete(request.mcp)
			// The frames are emitted with the WIRE spelling a CLI would report, so the accumulator's
			// anti-double-publish guard is exercised on the real shape rather than on a name only this
			// file ever produces.
			for (const [index, call] of calls.entries()) {
				const toolUseId = `e2e-stub-tool-${index}`
				const tool = wireToolName(call.tool)
				yield { type: 'frame', frame: { kind: 'tool_use', toolUseId, tool, input: call.input, parentToolUseId: null } }
				yield { type: 'frame', frame: { kind: 'tool_result', toolUseId, ok: true, summary: call.summary, parentToolUseId: null } }
			}
		}

		yield {
			type: 'finished',
			result: { outcome: AgentRunOutcome.COMPLETED, replyText: lines.join('\n'), sessionId: 'e2e-stub-session', failed: false },
		}
	}

	async shutdown(): Promise<void> {
		// Nothing to release — this runner never owns a process.
	}
}
