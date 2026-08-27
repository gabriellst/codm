import type { ArtifactKind } from '@codm/contracts-typescript/wire/enums'

/**
 * THE ROTEIRO OF A SCRIPTED RUN — what the deterministic stand-in performs, declared as data.
 *
 * ### Why this type exists
 * `E2eStubAgentRunner` used to hold its whole performance as literals in its own body: two canned
 * lines, one synthetic tool pair, and two hard-coded MCP declarations. That is enough for a
 * correctness spec, which only ever asks "did the chain run", and not enough for anything that asks
 * "what did the chain SAY" — a promotional capture of the console needs a believable conversation, a
 * terminal that reads like work, and artifacts that are the run's own output. Branching the runner on
 * which of those two audiences is watching would put a raw-flag `if` inside a domain class, which is
 * exactly what the `e2e` DI column exists to avoid.
 *
 * So the performance becomes a DECLARED contract and the runner becomes its interpreter. The shape is
 * lifted from the sibling that already solved this on the Go side — `mock.Scenario` /
 * `defaultE2eScenario()` in `internal/channel/overlay.go`, the channel gateway's "roteiro declarado no
 * boot" (QR frames, auto-pairing, seeded contacts). Same idea, other half of the stack.
 *
 * ### The identity boundary this file inherits
 * Nothing here names the run's identity, and nothing here CAN: AC-6.12 keeps the three envelope keys
 * out of `services/AgentRunner/**` entirely, so a declaration below says WHAT to declare and never on
 * whose behalf. The ids are filled in by `agent/mcp/E2eMcpDriver`, which resolves them from the opaque
 * run token exactly as the MCP router does on every real tool call.
 *
 * ### Why an artifact's location is not a plain string
 * A scratch workspace is a `mkdtemp` — it has no name a scenario author could write down. So a
 * scenario declares WHERE the bytes are relative to the run, and the resolution happens at run time
 * against `cwd`. Spelling this as a union rather than a `string` plus a boolean is what makes "a LINK
 * has no local bytes" unrepresentable rather than merely discouraged.
 */
export type AgentScenarioArtifactRef =
	/** Bytes on disk, relative to the run's own workspace — resolved against `cwd` when declared. */
	| { readonly at: 'WORKSPACE'; readonly relativePath: string }
	/** No local bytes: the artifact IS the address (a preview deploy, a pull request). */
	| { readonly at: 'URL'; readonly url: string }

/**
 * ONE fact the scripted run declares over the REAL MCP door — never a frame it merely prints.
 *
 * The distinction is load-bearing and predates this file: since Fase 6 an agent carrying a tool scope
 * must SAY that its issue is done, and a clean exit no longer implies it (§4.3 rule 7). A beat is
 * theatre; a declaration is a write that travels the JSON-RPC transport, the router's token
 * verification, its scope check, the generated tool, the HTTP hop and the use case.
 */
export type AgentScenarioDeclaration =
	/** Fork an issue out of the conversation. Requires an origin transcript entry — see `AgentScenarioAct`. */
	| { readonly kind: 'FORK_ISSUE'; readonly goal: string }
	/** Record one artifact against the thread the run belongs to. */
	| {
			readonly kind: 'RECORD_ARTIFACT'
			readonly artifact: {
				readonly kind: ArtifactKind
				readonly name: string
				readonly ref: AgentScenarioArtifactRef
				readonly meta: string
			}
	  }
	/** Declare the run's issue COMPLETED. */
	| { readonly kind: 'COMPLETE_ISSUE'; readonly summary: string }

/**
 * ONE beat of theatre — narration or synthetic tool activity, streamed in order.
 *
 * `afterMs` is a PAUSE TAKEN BEFORE the beat, and it is the whole reason this type carries timing at
 * all. A run that yields its frames in a tight loop is indistinguishable from a run that did no work:
 * the terminal panel fills between two animation frames and a viewer sees a wall of text appear at
 * once. Absent means no pause, which is what every correctness spec wants — they poll for settled
 * state and every millisecond of theatre is a millisecond of suite.
 */
export type AgentScenarioBeat =
	/** An `assistant_text` frame. Reaches the terminal panel as a `›` output row. */
	| { readonly kind: 'SAY'; readonly text: string; readonly afterMs?: number }
	/**
	 * A `tool_use`/`tool_result` PAIR with no side effect of any kind — the tool is not called and
	 * need not exist. It drives the two things that read tool frames: the terminal panel's `⏺` action
	 * row, and the orchestrator's thinking-phase edit (`RunOrchestratorTurn` reads `frame.tool` through
	 * `describeToolActivity`, which is total over every name).
	 */
	| {
			readonly kind: 'TOOL'
			readonly tool: string
			readonly input: Readonly<Record<string, unknown>>
			readonly summary: string
			readonly afterMs?: number
	  }

/** What ONE agent performs when the scenario drives it. */
export interface AgentScenarioAct {
	/**
	 * Emit the stand-in's `$ <agent> (e2e-stub) in <cwd>` header as the run's first line.
	 *
	 * A declared field rather than an always-on preamble, because the line is a HARNESS marker: it
	 * says "this run was a stub" to whoever is reading a failing spec's transcript. A promotional
	 * capture wants the opposite — nothing on screen that admits the harness exists.
	 */
	readonly echoesRunHeader: boolean
	readonly beats: readonly AgentScenarioBeat[]
	/**
	 * Declarations made AFTER the beats, in order, over one MCP connection.
	 *
	 * After, never interleaved: the beats are theatre and the declarations are writes, and a scenario
	 * that could put a write in the middle of the narration would let the two disagree about when the
	 * work actually finished. It also matches what a real turn does — narrate while working, declare
	 * at the end.
	 */
	readonly declarations: readonly AgentScenarioDeclaration[]
	/** Pause before each declaration's frame pair, so a watcher can read the tool name it just ran. */
	readonly declarationPaceMs?: number
}

/**
 * A whole roteiro: SUCCESSIVE acts for each of the two agents.
 *
 * ### Why a sequence and not one act per agent
 * An agent is driven more than once per story, and the turns are not interchangeable. The orchestrator
 * in particular gets at least two: the conversational turn that answers the contact and forks the
 * work, and — once the issue finishes — an `ISSUE_RESULT` turn that composes the answer about it
 * (`RunIssueTurn` enqueues it; `MailboxDispatcher` gives it no originating entry, which is why it
 * cannot fork a second issue). One act per agent would make both turns say the SAME line, which a
 * correctness spec never notices and a viewer reads as the agent repeating itself.
 *
 * Successive acts also need no discriminant, and that is the point. The stand-in cannot see which
 * KIND of turn it is driving — `AgentRunRequest` carries the rendered prompt and nothing else that
 * distinguishes them — so selecting an act by inspecting prompt prose would couple this roteiro to
 * copy that belongs to `OrchestratorPromptBuilder`. A script does not need to ask which scene it is
 * in; it plays the next one.
 *
 * ### Past the end, the last act repeats
 * A run is not obliged to stop when the script does — a mailbox retry, an extra inbound message, a
 * steer. Repeating the final act is what makes the one-act `default` roteiro behave exactly as the
 * hard-coded stand-in did before scenarios existed: the same performance, every turn, forever.
 *
 * Two fields and not a map keyed by `AgentName`, deliberately. `AgentName` is identity — a log label,
 * a span, a run-token claim — and the registry's own comment forbids it as a resolution key (AC-5.3).
 */
export interface AgentScenario {
	readonly id: AgentScenarioId
	/** Conversational turns, in order: the reply to the contact, then the answer about the finished issue. */
	readonly orchestrator: readonly [AgentScenarioAct, ...AgentScenarioAct[]]
	/** The issue's working turns — the ones whose frames fill the console's terminal panel. */
	readonly work: readonly [AgentScenarioAct, ...AgentScenarioAct[]]
}

/**
 * Every roteiro that exists. A closed set, so the selection door validates against it and a typo is a
 * `tsc` error rather than a run that silently performs nothing.
 */
export const AGENT_SCENARIO_IDS = ['default', 'demo-pt', 'demo-en'] as const

export type AgentScenarioId = (typeof AGENT_SCENARIO_IDS)[number]
