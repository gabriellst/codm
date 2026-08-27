import { injectable } from 'tsyringe-neo'
import type { ZodType } from 'zod'
import { AgentName, AgentRunOutcome } from '../../../enums'
import { E2eMcpDriver } from '../../../mcp/E2eMcpDriver'
import { wireToolName } from '../../../mcp/wire'
import { AgentScenarioSelection } from '../../AgentScenario'
import type { AgentScenarioAct } from '../../AgentScenario'
import type { AgentFrame } from '../../../types/AgentFrame'
import type { AgentRunRequest } from '../../../types/AgentRunRequest'
import type { AgentRuntimeEvent } from '../../../types/AgentRuntimeEvent'
import { AgentRunner } from '../AgentRunner'

/**
 * The `AgentRunner` bound in the `e2e` DI env column (agent/registry.ts).
 *
 * The Playwright harness boots the REAL daemon over the real SQLite, but must never spawn a provider
 * CLI. This stand-in keeps the whole inbound → reply → fork → work → declare chain hermetic AND
 * deterministic, which is what lets a spec poll for a settled issue status instead of guessing.
 *
 * ### It INTERPRETS a roteiro; it does not hold one
 * Every line it says, every tool frame it emits and every fact it declares comes from an
 * `AgentScenario` (`services/AgentScenario`) chosen by `AgentScenarioSelection`. Before that contract
 * existed this class held its whole performance as literals in this body, which was enough for a
 * correctness spec — those only ask "did the chain run" — and not enough for a promotional capture of
 * the console, which asks what the chain SAID. Branching here on which audience is watching would put
 * a raw-flag `if` inside the seam; declaring the performance moves the choice to data, and the
 * `default` roteiro reproduces this file's old behaviour line for line.
 *
 * Two things are NOT scenario data, on purpose:
 *
 *  - **The failure trigger below**, because it is a property of the harness, not of a story.
 *  - **Identity**, because it is unrepresentable here. `AgentRunRequest` carries no `ownerId`,
 *    `issueId` or `threadId` (AC-1.11/AC-6.12) and neither does a scenario; the ids on a declaration
 *    are filled in by `E2eMcpDriver` from the opaque run token, exactly as the MCP router does on
 *    every real tool call. This file hands the driver the invocation whole and never looks inside it.
 *
 * ### WHEN THE RUN CARRIES TOOLS IT DECLARES, because nothing else will (AC-6.2)
 * Fase 6 removed the INFERRED completion for any agent with a non-empty tool scope (§4.3 rule 7):
 * with tools, "the issue is done" is SAID, never derived from a clean exit. A stub that only exits
 * cleanly would therefore leave every issue stuck at WORKING — the removal and its replacement cannot
 * ship apart. So a run that arrives with an `mcp` invocation drives the REAL MCP endpoint through a
 * real client and declares whatever its act declares.
 */
@injectable()
export class E2eStubAgentRunner extends AgentRunner {
	/**
	 * A sentinel substring for an ORCHESTRATOR run's inbound text (thinking-indicator spec, T5/AC-6).
	 *
	 * The stand-in otherwise never fails, so AC-6 ("erro do run edita a mensagem de fase para erro
	 * amigável e corta a presença") has nothing to trigger against. There is no identity-free way to
	 * ask for a failure here — `AgentRunRequest` deliberately carries no `ownerId`/`issueId`/`threadId`
	 * (AC-6.12) — so the ONLY signal this runner can read is the rendered PROMPT TEXT, which is exactly
	 * what a real inbound message becomes (`OrchestratorPromptBuilder.user`). A spec that seeds an
	 * inbound message containing this string gets a deterministic, hermetic run failure with no real
	 * provider crash involved.
	 *
	 * Deliberately NOT a scenario field: a roteiro says what a healthy run performs, and every roteiro
	 * must be able to fail this way. Putting it on the scenario would mean re-declaring it in each.
	 */
	static readonly THINKING_ERROR_SENTINEL = 'e2e-thinking-error-trigger'

	constructor(
		private readonly declarations: E2eMcpDriver,
		private readonly scenarios: AgentScenarioSelection,
	) {
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
		// against the work act's real tool calls are untouched.
		//
		// BEFORE the act is taken, so a run that never performs does not consume a scene either.
		if (isOrchestrator && request.messages.some(message => message.content.includes(E2eStubAgentRunner.THINKING_ERROR_SENTINEL))) {
			throw new Error('e2e-stub: simulated run failure (thinking-indicator error path)')
		}

		// The NEXT act of that agent's sequence — a script plays its scenes in order and never has to
		// ask which one it is in. See `AgentScenario` for why the alternative (reading the rendered
		// prompt to tell a conversational turn from an `ISSUE_RESULT` one) was rejected.
		const act: AgentScenarioAct = isOrchestrator ? this.scenarios.nextOrchestratorAct() : this.scenarios.nextWorkAct()

		// What the turn will report as its reply — the SAY beats, in order, and the header when the act
		// asks for one. Accumulated rather than re-derived so the text a viewer reads in the transcript
		// is exactly the text this run emitted as frames.
		const spoken: string[] = []
		let textFrames = 0

		const say = (text: string): AgentRuntimeEvent => {
			spoken.push(text)
			const frame: AgentFrame = { kind: 'assistant_text', messageId: `e2e-stub-${textFrames++}`, text, parentToolUseId: null }
			return { type: 'frame', frame }
		}

		// `agentName`, not a provider: since Fase 4.5 the request carries no provider identity — WHICH
		// CLI a run belongs to is settled by the DI binding that produced this very object.
		if (act.echoesRunHeader) yield say(`$ ${request.agentName} (e2e-stub) in ${request.cwd}`)

		for (const [index, beat] of act.beats.entries()) {
			await pace(beat.afterMs, request.signal)
			if (beat.kind === 'SAY') {
				yield say(beat.text)
				continue
			}
			// A tool pair with NO side effect: the tool is never called and need not exist. It drives the
			// terminal panel's action row and — on an orchestrator turn — a thinking-phase edit, whose
			// tracking reads `frame.tool` alone. That is what proves the placeholder advances by PHASE
			// rather than by a fixed count, without a second real MCP round trip in the path other specs
			// assert on.
			const toolUseId = `e2e-stub-beat-${index}`
			yield { type: 'frame', frame: { kind: 'tool_use', toolUseId, tool: beat.tool, input: beat.input, parentToolUseId: null } }
			yield { type: 'frame', frame: { kind: 'tool_result', toolUseId, ok: true, summary: beat.summary, parentToolUseId: null } }
		}

		// THE DECLARATION. `request.mcp` present ⟺ the agent declared a non-empty tool scope (§4.3 rule
		// 7) — the same equivalence `RunIssueTurn` reads from the other side as `agent.tools.length`.
		if (request.mcp) {
			const calls = await this.declarations.declare(request.mcp, act.declarations, { cwd: request.cwd })
			// The frames are emitted with the WIRE spelling a CLI would report, so the accumulator's
			// anti-double-publish guard is exercised on the real shape rather than on a name only this
			// file ever produces.
			for (const [index, call] of calls.entries()) {
				await pace(act.declarationPaceMs, request.signal)
				const toolUseId = `e2e-stub-tool-${index}`
				const tool = wireToolName(call.tool)
				yield { type: 'frame', frame: { kind: 'tool_use', toolUseId, tool, input: call.input, parentToolUseId: null } }
				yield { type: 'frame', frame: { kind: 'tool_result', toolUseId, ok: true, summary: call.summary, parentToolUseId: null } }
			}
		}

		yield {
			type: 'finished',
			result: { outcome: AgentRunOutcome.COMPLETED, replyText: spoken.join('\n'), sessionId: 'e2e-stub-session', failed: false },
		}
	}

	async shutdown(): Promise<void> {
		// Nothing to release — this runner never owns a process.
	}
}

/**
 * The pause a beat asks for, before the beat.
 *
 * Absent means no pause at all, which is what the `default` roteiro declares everywhere — a
 * correctness suite polls for settled state, so a millisecond of theatre is a millisecond added to
 * every spec that runs an agent. Only a roteiro meant to be WATCHED asks for time.
 *
 * Abort-aware, and that is the one thing here that is not about the film: a cancelled run must not
 * keep the daemon holding a mailbox lease through the rest of a script. The abort does not change the
 * run's OUTCOME — this stand-in ignores `signal` for that, exactly as it did before pacing existed —
 * it only collapses the waiting.
 */
function pace(ms: number | undefined, signal: AbortSignal | undefined): Promise<void> {
	if (!ms || signal?.aborted) return Promise.resolve()
	return new Promise<void>(resolve => {
		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort)
			resolve()
		}, ms)
		function onAbort() {
			clearTimeout(timer)
			resolve()
		}
		signal?.addEventListener('abort', onAbort, { once: true })
	})
}
