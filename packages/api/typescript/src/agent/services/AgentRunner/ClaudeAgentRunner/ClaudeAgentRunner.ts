import { injectable } from 'tsyringe-neo'
import { z, type ZodType } from 'zod'
import { AgentModelId, AgentStopReason, StopKind } from '@codm/contracts-typescript/wire/enums'
import { LoggingService } from '@codm/core-typescript'
import { ProductConfig } from '@shared/config/ProductConfig'
import { AgentRunOutcome, type TransportStopKind } from '../../../enums'
import type { AgentMcpInvocation } from '../../../types/AgentMcpInvocation'
import type { AgentRunRequest } from '../../../types/AgentRunRequest'
import type { AgentRunResult, AgentRuntimeEvent } from '../../../types/AgentRuntimeEvent'
import type { ProviderBinarySpec } from '../../../types/ProviderBinarySpec'
import type { ProviderCapabilities } from '../../../types/ProviderCapabilities'
import { StreamJsonCodec, StreamJsonToTurnFactAccumulator, type TerminalResultRecord } from '../../StreamJsonCodec'
import { AgentRunner } from '../AgentRunner'
import { nodeAgentProcessSpawner, type AgentProcess, type AgentProcessSpawner } from './AgentProcess'
// The server key is single-sourced in `mcp/wire.ts` — a LEAF module — because the runner, the MCP
// manifest and the turn-fact accumulator all need the same spelling and routing them through one
// another would drag a subprocess-spawning module into a pure state machine.
import { MCP_RUN_TOKEN_ENV, MCP_SERVER_KEY } from '../../../mcp/wire'
import { AgentIdentityService } from '@codm/core-typescript'

export interface ClaudeAgentRunnerOptions {
	spawner?: AgentProcessSpawner
	inactivityMs?: number
	postMortemMs?: number
}

/**
 * How long the run keeps reading AFTER the child is already dead — and how long a teardown may take.
 *
 * A dead child produces no new output, so this is not an activity budget: it bounds the wait for
 * bytes ALREADY in the pipe (the terminal `result` frame is routinely among them) and for the pipes
 * themselves to shut. Both are seconds-scale by nature, and both are unbounded in the failure this
 * closes — a grandchild the CLI leaked inherits the pipe and holds it open forever, which is how a
 * run whose process had been gone half an hour still had nothing to report (27/08).
 *
 * Comfortably past `KILL_GRACE_MS` (2s, `AgentProcess.ts`), so a child that only dies at the SIGKILL
 * escalation is still reaped inside the window rather than reported as a run that never exited.
 */
const POST_MORTEM_DRAIN_MS = 5_000

/** A CLI that says any of these is asking for a human to log in — not a run that failed on its merits. */
const AUTH_HINT = /\/login\b|not logged in|please log ?in|authentication (?:required|failed)|unauthorized/i

/**
 * O shebang do próprio CLI (`#!/usr/bin/env node`) falhando: exit 127 é command-not-found, e esta
 * mensagem no stderr diz QUAL comando — o binário do provedor foi achado e executado, mas o `node`
 * que ele precisa não está no PATH do filho. Sem esta tradução o operador recebia só "provider
 * exited with code 127", que não aponta para nada (medido: 3 tentativas e o item envenenava).
 */
const MISSING_NODE_HINT = /env: '?node'?: No such file or directory/i

/**
 * `AgentModelId` → the CLI's own model alias. A MAP, not a `switch`, and it lives HERE because "what
 * this binary calls its models" is a fact about claude and about nothing else. `DEFAULT` is absent on
 * purpose: it is the instruction to omit `--model` altogether, which is why it is a member of the enum
 * rather than `undefined`.
 */
const CLAUDE_MODEL_ALIASES: Partial<Record<AgentModelId, string>> = {
	[AgentModelId.SONNET]: 'sonnet',
	[AgentModelId.OPUS]: 'opus',
	[AgentModelId.HAIKU]: 'haiku',
}

/** Everything `buildArgs` needs to produce a full argv. One record, no ambient state. */
export interface ClaudeBuildArgsOptions {
	/** `AgentModelId.DEFAULT` means OMIT the model flag entirely — not "pass the string DEFAULT". */
	model?: AgentModelId
	cwd: string
	/** Extra roots the agent may touch beyond `cwd` (`--add-dir`). */
	extraDirs?: readonly string[]
	/** Mutually exclusive with `newSessionId` — resuming an existing provider session. */
	resumeSessionId?: string
	/** Mutually exclusive with `resumeSessionId` — pinning the id of a session being created. */
	newSessionId?: string
	/** Present ⟺ the agent declared a non-empty tool scope (§4.2). */
	mcp?: AgentMcpInvocation
	/** Probed capabilities of THIS binary. By parameter, on purpose — see `ProviderCapabilities`. */
	caps: ProviderCapabilities
}

/**
 * THE `claude` RUNNER — one class per CLI, and everything claude-shaped lives in it.
 *
 * It drives the binary in BIDIRECTIONAL HEADLESS STREAM-JSON over plain pipes. No PTY, no Agent SDK,
 * no HTTP to Anthropic from our side. The canonical invocation it encodes verbatim
 * (`.specs/codedm/2026-07-26-agent-driving-stream-json.md`):
 *
 *   claude -p --input-format stream-json --output-format stream-json --verbose \
 *          [--include-partial-messages] [--model X] [--add-dir …] \
 *          [--session-id <uuid> | --resume <id>] \
 *          [--mcp-config <json> --allowedTools a,b] \
 *          --permission-mode auto
 *
 * ### Why a class per CLI, and not one runner driven by a data literal (Fase 4.5)
 * The predecessor was ONE runner that took a per-CLI DATA LITERAL and drove any of three CLIs from it.
 * That design held two rules that cannot coexist: "a capability difference lives in DATA, never as a
 * branch in the runner", and, at the same time, defs declaring `streamFormat: 'plain'`. A stream
 * format is not an argv — it is a DIFFERENT PARSING PATH, and one runner cannot honour it without
 * exactly the branch the first rule forbids. The `if (def.streamFormat === 'plain')` that used to sit
 * in the middle of this drain loop was that contradiction, made of code.
 *
 * The data-literal pattern was imported from a codebase driving 26 HOMOGENEOUS CLIs, where the literal
 * pays for itself. Here there are three, two of which need a different parse — the precondition is
 * absent. So the abstraction died and the rule survived: the unit of variation is THE CLI. Grouping by
 * transport instead (a `StreamJson…` / `PlainText…` split) would have been the same mistake one level
 * up, because it assumes two CLIs emitting JSONL emit the SAME JSONL — false already: this one carries
 * `--session-id`/`--resume`, `--mcp-config`, and the measured anomalies of §4.3 (a terminal `result`
 * frame with NO `parent_tool_use_id`; `tool_use`/`tool_result` as CONTENT BLOCKS inside
 * `message.content[]`; the sub-agent tool arriving as `Agent` while init advertises `Task`; usage only
 * on the terminal frame). That grouping would have put a provider-identity branch back INSIDE the class.
 *
 * What is genuinely shared is a UTILITY, never a base class: `StreamJsonCodec` (line buffering + frame
 * decoding) and `StreamJsonToTurnFactAccumulator` (the domain fold). Inheritance would smuggle the
 * generalization straight back in.
 *
 * ### TURN-END IS STRUCTURAL, and getting it wrong LEAKS A PROCESS
 * The terminal `result` frame with `stopReason !== TOOL_USE` closes the turn, and only then does stdin
 * close. The measured counterfactual is why this is not a stylistic preference: holding stdin open
 * after the terminal frame left the child ALIVE 17358 ms later with zero further output
 * (`phase2-smoke/raw/stdin-hold-control.json`). `stdin.end()` IS the act that ends the turn.
 *
 * The guard `parentToolUseId == null` that an earlier design put on this rule is deliberately ABSENT,
 * and removing it was a bug fix rather than a loosening (§4.3 rule 5, amended 27-jul): the `result`
 * frame HAS no `parent_tool_use_id` key — `'parent_tool_use_id' in result` is false in all four
 * captures — so a literal implementation of that guard never fires and the turn never closes. The
 * invariant it wanted survives in a stronger form: a sub-agent emits NO `result` frame at all
 * (verified in `raw/s3-subagent.jsonl`, which contains exactly one despite a full sub-agent cycle), so
 * `type === 'result'` is one-per-run by construction. The `stopReason !== TOOL_USE` half is kept as
 * cheap defence but is UNFALSIFIED, not verified: `stop_reason` is null on every assistant frame in
 * the corpus and no `tool_use` result frame could be provoked. It must not be reported as measured.
 *
 * ### The watchdog is NOT optional
 * It is the backstop for the case above going wrong on some future CLI build, and for a child that
 * simply stops talking. It fires on INACTIVITY, not on total duration — a long tool call is not a
 * hang. And inactivity is counted in FRAMES, not bytes: the clock only resets when the codec decodes
 * at least one frame, so bytes that never close a frame (a retry, a partial message) do not count as
 * a sign of life.
 * It is also ONLY a backstop: a turn the terminal `result` frame already closed structurally wins over
 * a watchdog that fires afterward (e.g. while the child lingers post-close, measured 17.4s alive with
 * zero further frames in `phase2-smoke/raw/stdin-hold-control.json`). The watchdog exists to bound a
 * run that never closes, not to reclassify one that did — see `classifyStop` below.
 *
 * ### Nothing thrown mid-drain
 * A structured-output failure, a dead process, a watchdog kill: all three become the terminal
 * `finished` event (§4.3 rule 4). A consumer half-way through draining can always finish draining.
 */
@injectable()
export class ClaudeAgentRunner extends AgentRunner {
	/**
	 * How this CLI is FOUND and probed — read by `ProviderDetector`, and static because detection
	 * happens before (and independently of) any run.
	 *
	 * It lives on the runner rather than in a registry of literals because "how to find claude" and
	 * "how to drive claude" are the same knowledge: the day the binary is renamed or grows a flag, one
	 * file changes. `capabilityTokens` is greped against `--help` output, so a capability is DISCOVERED
	 * rather than assumed from a version string — an older build that lacks `--include-partial-messages`
	 * would abort on the unknown argument, so guessing is not a safe default.
	 */
	static readonly binary: ProviderBinarySpec = {
		bin: 'claude',
		versionArgs: ['--version'],
		helpArgs: ['--help'],
		capabilityTokens: {
			'--include-partial-messages': 'partialMessages',
			'--mcp-config': 'mcpConfig',
			'--resume': 'sessionResume',
		},
	}

	// NOT `readonly`, and NOT constructor parameters — see `withOptions` below for why.
	private spawner: AgentProcessSpawner = nodeAgentProcessSpawner
	/** No frame for this long ⇒ the run is wedged. The BACKSTOP of §4.3 rule 5, never the primary signal. */
	private inactivityMs = ProductConfig.env.CODM_AGENT_INACTIVITY_MS
	/** How long a run keeps draining after the child is already dead. See `POST_MORTEM_DRAIN_MS`. */
	private postMortemMs = POST_MORTEM_DRAIN_MS
	private readonly live = new Set<AgentProcess>()

	/**
	 * EVERY PARAMETER HERE MUST BE DI-RESOLVABLE. This class is constructed by the container (through
	 * `AgentRunnerFactory`, which injects it by concrete type), and tsyringe introspects EVERY
	 * constructor parameter — INCLUDING one that has a default value. The previous signature ended in
	 * `options: ClaudeAgentRunnerOptions = {}`, whose emitted `design:paramtypes` entry is `Object`;
	 * resolving `Object` throws `TypeInfo not known for "Object"`.
	 *
	 * That throw was silent and catastrophic. `Mediator.register` catches a handler that fails to
	 * resolve, logs `Failed to resolve Handler …` and decrements a counter — so the whole chain that
	 * reaches this class (`ConsumeInboundMessage` → `ClassifyMessage` → `DefaultIssueRouter` →
	 * `ClassifyIssueAgent` → here) simply never registered, while the daemon booted, reported healthy
	 * and served 200s. `SqlExternalMediator` claims only event names that HAVE a registered handler,
	 * so every `integration.channel_message.received` row sat in the outbox untouched at
	 * `attempts = 0`: inbound messages produced nothing, forever, with no error anywhere.
	 *
	 * Nothing caught it because nothing exercised this path: `mock`/`integration` bind a stub, the `e2e`
	 * DI column swaps in `E2eStubAgentRunner` (whose one parameter IS resolvable), and the unit
	 * tests construct this class by hand. Production was the only caller that went through the
	 * container.
	 */
	constructor(
		private readonly logging: LoggingService,
		private readonly identities: AgentIdentityService,
	) {
		super()
	}

	/**
	 * TEST SEAM — the only supported way to override the spawner or the inactivity budget.
	 *
	 * Deliberately a static rather than an optional constructor parameter: an optional parameter reads
	 * as harmless and is not (see the constructor docblock), and a seam that only tests use should be
	 * visible as such at the call site instead of hiding in the signature the container reads.
	 */
	static withOptions(logging: LoggingService, identities: AgentIdentityService, options: ClaudeAgentRunnerOptions): ClaudeAgentRunner {
		const runner = new ClaudeAgentRunner(logging, identities)
		if (options.spawner !== undefined) runner.spawner = options.spawner
		if (options.inactivityMs !== undefined) runner.inactivityMs = options.inactivityMs
		if (options.postMortemMs !== undefined) runner.postMortemMs = options.postMortemMs
		return runner
	}

	/**
	 * The full argv for one invocation — PURE: same options in, same argv out. No module state, no
	 * ambient `caps` lookup, no clock.
	 *
	 * `static`, so it is callable without owning a process (the resume flow spec asserts the argv a
	 * captured request WOULD spawn with) while staying off the prototype — the seam is still exactly
	 * `run` + `shutdown` (AC-4.5.4).
	 *
	 * Three of these flags each delete a whole class of code that used to exist here:
	 *  - `--output-format stream-json` deletes the TUI marker parser AND the per-session transcript-file
	 *    reader (the CLI's own on-disk project transcripts — the path literal is deliberately NOT written
	 *    anywhere in this file; `tests/architecture/pty-isolation.test.ts` confines it to the legacy
	 *    engine subtree, and a mere mention here would be a violation of that rail). The reply is
	 *    reconstructed exclusively from parsed stdout frames; mining raw stdout instead yields empty
	 *    extractions, which is the bug that parked the old engine.
	 *  - `--permission-mode auto` deletes the trust-prompt keystroke injection: headless `-p` with no TTY
	 *    never shows a prompt, so there is nothing to auto-accept. `auto` — NOT `bypassPermissions`, which
	 *    is a blanket waiver. The input driving these runs is an inbound message from a third party, so the
	 *    CLI's own graduated mode is the right posture; a blanket bypass would hand that input the full
	 *    tool surface unconditionally. MEASURED on this build (2.1.220) before the change, because the
	 *    original justification for the bypass was "headless never prompts, so anything else risks a hang":
	 *    a headless `auto` run completed in 10s, exit 0, with a normal terminal frame
	 *    (`stop_reason: end_turn`, `permission_denials: []`), and Write + Read both executed. So `auto`
	 *    neither hangs nor disables tools. What `auto` blocks that `bypassPermissions` does not was NOT
	 *    characterized — that would require probing destructive operations, and is deliberately unmeasured
	 *    rather than asserted.
	 *  - `--session-id` / `--resume` delete transcript re-sending. Multi-turn context is the CLI's own
	 *    session; re-rendering the transcript into the prompt is only the fallback for a CLI without it.
	 */
	static buildArgs({ model, extraDirs, resumeSessionId, newSessionId, mcp, caps }: ClaudeBuildArgsOptions): string[] {
		const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose']

		// Capability-gated, NOT version-gated: an older build without the flag would abort on an
		// unknown argument, and a newer one gets token-level deltas the moment the probe sees it.
		if (caps.partialMessages) args.push('--include-partial-messages')

		// DEFAULT ⇒ omit the flag entirely so the CLI chooses. An unmapped member (a value added
		// to the wire enum without a CLI alias) also omits rather than passing a bogus string.
		const modelAlias = model && model !== AgentModelId.DEFAULT ? CLAUDE_MODEL_ALIASES[model] : undefined
		if (modelAlias) args.push('--model', modelAlias)

		for (const dir of extraDirs ?? []) args.push('--add-dir', dir)

		// MUTUALLY EXCLUSIVE by construction, not by caller discipline: resuming an existing session
		// and pinning the id of a new one are contradictory instructions, and passing both makes the
		// CLI's behaviour version-dependent. Resume wins — it is the strictly more informed intent.
		if (resumeSessionId) args.push('--resume', resumeSessionId)
		else if (newSessionId) args.push('--session-id', newSessionId)

		// `mcp` present says the AGENT asked for tools; this CLI can always receive them, which is why
		// the second half of what used to be an AND (`the def declares the flags`) is gone: it existed
		// only to express "some other CLI cannot", and that other CLI now has its own class or none.
		if (mcp) {
			args.push('--mcp-config', renderMcpConfig(mcp))
			args.push('--allowedTools', mcp.allowedTools.join(','))
		}

		// Last, and unconditional: headless `-p` has no TTY to render a permission prompt on, so the
		// mode is settled here at spawn. `auto` and NOT `bypassPermissions` — see the method docblock.
		args.push('--permission-mode', 'auto')
		return args
	}

	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		const warn = (message: string): void =>
			this.logging.warn({ content: { message, agentName: request.agentName, bin: ClaudeAgentRunner.binary.bin } })

		const codec = new StreamJsonCodec({ onWarn: warn })
		// UNSTAMPED on purpose — the runner holds none of the envelope's identity keys to stamp with, by
		// design (AC-1.11: identity rides inside the opaque MCP token). The layer holding the envelope
		// adds it. Their NAMES are absent here too: AC-6.12 greps this directory for them and a comment
		// is indistinguishable from a field to a grep.
		const accumulator = new StreamJsonToTurnFactAccumulator({})

		const args = ClaudeAgentRunner.buildArgs({
			model: request.model,
			cwd: request.cwd,
			extraDirs: request.extraDirs,
			resumeSessionId: request.session?.resumeId,
			newSessionId: request.session?.newId,
			mcp: request.mcp,
			caps: request.caps ?? {},
		})
		const cmd = [request.binaryPath, ...args]

		let proc: AgentProcess
		try {
			proc = this.spawner({ cmd, cwd: request.cwd, stdin: true })
		} catch (cause) {
			// Even a spawn that fails synchronously must arrive as the terminal event, not as a throw —
			// the consumer's drain loop is the only place it can be handled uniformly.
			yield {
				type: 'finished',
				result: failure(AgentRunOutcome.STOPPED, `${StopKind.SERVER_ERROR}: ${String(cause)}`, StopKind.SERVER_ERROR),
			}
			return
		}
		this.live.add(proc)

		const stderrChunks: string[] = []
		// Drained in the BACKGROUND and never parsed as frames. Not draining it is a deadlock: a chatty
		// CLI fills the stderr pipe buffer and blocks on write while we wait forever on stdout.
		const stderrPump = drainToStrings(proc.stderr, stderrChunks)

		let terminal: TerminalResultRecord | undefined
		let sessionId: string | null = null
		let stdinClosed = false
		let watchdogFired = false
		/**
		 * The child's pid was reaped while we were still reading its stdout — i.e. the process is gone
		 * and whatever is still holding the pipe open is not it. Distinct from the ordinary ending,
		 * where stdout closes first and the exit is merely the formality that follows.
		 */
		let diedMidStream = false

		const closeStdin = (): void => {
			if (stdinClosed) return
			stdinClosed = true
			proc.endStdin()
		}

		const onAbort = (): void => {
			proc.kill()
		}
		request.signal?.addEventListener('abort', onAbort, { once: true })

		try {
			proc.write(renderStreamJsonStdin(request))

			const iterator = proc.stdout[Symbol.asyncIterator]()
			let pending: Promise<IteratorResult<Uint8Array | string>> | null = null
			let deadlineAt = Date.now() + this.inactivityMs
			/**
			 * DEATH OF THE CHILD, raced against its own output — the signal §4.3 rule 5 never had.
			 *
			 * The watchdog covers SILENCE. It does not cover DEATH, and the two are not the same
			 * ending: a child that dies leaving a grandchild on the inherited pipe produces a stdout
			 * iterator that never yields and never completes, so the loop below sat on `iterator.next()`
			 * with nothing coming. Downstream that is not a slow turn, it is an eternal one — the mailbox
			 * heartbeat renews the lease of a turn whose process is gone, and every recovery mechanism is
			 * keyed on that lease (measured 27/08: two issues stuck over half an hour, no `claude`
			 * process alive).
			 *
			 * Rejection is folded into the same value on purpose: a spawn error arriving here means the
			 * child will never speak either, and the two need identical handling.
			 */
			const death = proc.exited.then(
				() => 'exited' as const,
				() => 'exited' as const,
			)

			for (;;) {
				let timer: ReturnType<typeof setTimeout> | undefined
				// ANNOTATED, and it has to be: `pending` is assigned from `step` on the line below, so the
				// racers array a few lines down (which mentions `step`) is enough of a loop for inference
				// to give up and infer `any` — silently, since `noImplicitAny` only reports the cycle.
				const step: Promise<IteratorResult<Uint8Array | string>> = pending ?? iterator.next()
				pending = step
				const timeout = new Promise<'timeout'>(resolve => {
					timer = setTimeout(() => resolve('timeout'), Math.max(deadlineAt - Date.now(), 0))
				})
				// Once death has been observed it is permanently resolved and would win every subsequent
				// race, so it leaves the field — what bounds the loop from then on is the short drain
				// deadline set below.
				const racers: Promise<IteratorResult<Uint8Array | string> | 'timeout' | 'exited'>[] = [step, timeout]
				if (!diedMidStream) racers.push(death)
				const settled = await Promise.race(racers)
				clearTimeout(timer)

				if (settled === 'exited') {
					// NOT an ending yet: bytes already written by the dead child can still be buffered, and
					// the terminal `result` frame is frequently among them. Keep draining, but on a budget
					// measured in seconds rather than the three-minute silence budget — nothing is going to
					// produce NEW output, so the only thing left to wait for is what is already in the pipe.
					diedMidStream = true
					deadlineAt = Date.now() + this.postMortemMs
					continue
				}

				if (settled === 'timeout') {
					// The child is already dead and its pipe is being held open by something that is not it.
					// There is nothing left to drain and nothing to kill; end the run on what was seen.
					if (diedMidStream) {
						step.catch(() => {
							// no-op — the raced promise outlives this loop, see the watchdog branch below
						})
						break
					}
					watchdogFired = true
					warn(`no output for ${this.inactivityMs}ms — killing the run (watchdog backstop)`)
					// The raced promise outlives this loop; without a catch its later rejection is unhandled.
					step.catch(() => {
						// no-op — see comment above
					})
					proc.kill()
					break
				}
				pending = null
				if (settled.done) break

				let sawFrame = false
				for (const decoded of codec.push(settled.value)) {
					for (const frame of decoded.frames) {
						sawFrame = true
						if (frame.kind === 'system_init') sessionId = frame.sessionId
						yield { type: 'frame', frame }
						const fact = accumulator.apply(frame)
						if (fact) yield { type: 'fact', fact }
					}
					if (decoded.terminal) {
						terminal = decoded.terminal
						if (decoded.terminal.sessionId) sessionId = decoded.terminal.sessionId
						// STRUCTURAL turn-end. TOOL_USE means the model is mid-loop and stdin must stay open.
						if (decoded.terminal.stopReason !== AgentStopReason.TOOL_USE) closeStdin()
					}
				}
				// A frame is a sign of life — of the STREAM. Past the child's death it means the pipe still
				// had buffered bytes, which earns the short drain budget again and never the long one.
				if (sawFrame) deadlineAt = Date.now() + (diedMidStream ? this.postMortemMs : this.inactivityMs)
			}

			for (const decoded of codec.flush()) {
				for (const frame of decoded.frames) {
					yield { type: 'frame', frame }
					const fact = accumulator.apply(frame)
					if (fact) yield { type: 'fact', fact }
				}
				if (decoded.terminal) terminal = decoded.terminal
			}

			closeStdin()
			// BOUNDED, both of them — this is where the 27/08 hang actually lived. The read loop had
			// ended (or been killed) and the turn then parked here forever: `exited` used to resolve on
			// `'close'`, which additionally waits for every inherited pipe to shut, and `stderrPump` is a
			// `for await` over one of those very pipes. A leaked grandchild holding either one is enough,
			// and neither await had a clock. Nothing downstream could tell that apart from a long turn:
			// no frame, no result, no failure — just a lease renewed every three minutes forever.
			//
			// A timeout here is not a guess at the child's runtime: by this line the child has been asked
			// to end (stdin closed, or killed outright), so what is being waited on is a teardown, and a
			// teardown that misses a seconds-wide window is not going to arrive.
			const exitCode = await settleWithin(proc.exited, this.postMortemMs, -1)
			await settleWithin(stderrPump, this.postMortemMs, undefined)

			// Orphan tool calls become FAILED here — the turn is over and they never reported a result.
			for (const fact of accumulator.flush()) yield { type: 'fact', fact }

			yield {
				type: 'finished',
				result: this.buildResult(request, {
					terminal,
					sessionId,
					exitCode,
					watchdogFired,
					diedMidStream,
					stderr: stderrChunks.join(''),
				}),
			}
		} finally {
			request.signal?.removeEventListener('abort', onAbort)
			this.live.delete(proc)
			proc.kill()
			// REVOKE — the runner is the ONLY caller (§4.4), because it is the only layer that knows the
			// process died, and it knows for every ending: clean finish, transport failure, watchdog and
			// cancellation all pass through this `finally`. A late tool call from a dead run then gets 401
			// and writes nothing, which is exactly what §4.11 promises about cancellation.
			//
			// The token stays OPAQUE here. The runner revokes a string it was handed; it never learns —
			// and must never learn — whose issue it belonged to (AC-6.12).
			if (request.mcp) this.identities.revoke(request.mcp.token)
		}
	}

	/**
	 * Fold everything observed into the ONE terminal record — and never throw while doing it.
	 *
	 * Only TRANSPORT stops can be raised here (`AUTH_REQUIRED`, `SERVER_ERROR`); the type says so, and
	 * that is the point. A DOMAIN stop is unrepresentable from this side because it can only come from
	 * a `RaiseStop` / `AskOperator` tool call, which lands through the MCP router and not through here.
	 */
	private buildResult<OutputSchema extends ZodType | undefined>(
		request: AgentRunRequest<OutputSchema>,
		observed: {
			terminal?: TerminalResultRecord
			sessionId: string | null
			exitCode: number
			watchdogFired: boolean
			/** The child was reaped while its stdout was still open — see the field in `run`. */
			diedMidStream: boolean
			stderr: string
		},
	): AgentRunResult {
		const replyText = observed.terminal?.text ?? ''
		const stop = this.classifyStop(observed)

		if (stop) {
			return { outcome: AgentRunOutcome.STOPPED, replyText, sessionId: observed.sessionId, failed: false, stop }
		}

		if (!request.outputSchema) {
			return { outcome: AgentRunOutcome.COMPLETED, replyText, sessionId: observed.sessionId, failed: false }
		}

		// STRUCTURED OUTPUT — §4.3 rule 4. `safeParse`, never `parse`; a failure is DATA on the terminal
		// event so a consumer mid-drain can finish draining and then decide. The window-shrinking JSON
		// scavenger the old one-shot path needed is gone: with stream-json the final assistant text is
		// already delimited by a frame, so there is nothing to excavate it from.
		let candidate: unknown
		try {
			candidate = JSON.parse(replyText.trim())
		} catch {
			return {
				outcome: AgentRunOutcome.COMPLETED,
				replyText,
				sessionId: observed.sessionId,
				failed: true,
				failure: 'terminal reply text was not JSON',
			}
		}
		const parsed = request.outputSchema.safeParse(candidate)
		return parsed.success
			? { outcome: AgentRunOutcome.COMPLETED, replyText, sessionId: observed.sessionId, output: parsed.data, failed: false }
			: { outcome: AgentRunOutcome.COMPLETED, replyText, sessionId: observed.sessionId, failed: true, failure: parsed.error.message }
	}

	private classifyStop(observed: {
		terminal?: TerminalResultRecord
		exitCode: number
		watchdogFired: boolean
		diedMidStream: boolean
		stderr: string
	}): AgentRunResult['stop'] {
		// TRANSPORT evidence ONLY: process stderr and the CLI's own API-layer diagnosis
		// (`apiErrorStatus`, sourced from `api_error_status` on the terminal `result` frame). The
		// assistant's reply text is deliberately EXCLUDED — it is the model's own words, and matching
		// it here would let a run that merely TALKS ABOUT authentication (or is prompted to, by an
		// inbound message) get misclassified as a transport failure it never had.
		const authSignal = `${observed.stderr}\n${observed.terminal?.apiErrorStatus ?? ''}`
		if (AUTH_HINT.test(authSignal)) {
			return { kind: StopKind.AUTH_REQUIRED as TransportStopKind, detail: 'provider CLI is asking for interactive login' }
		}

		// STRUCTURALLY-CLOSED WINS OVER THE WATCHDOG. The terminal `result` frame arriving is the
		// authoritative signal that the turn closed on its own merits; the watchdog is a backstop for
		// a turn that never closes, and must never be allowed to reclassify one that did — even if it
		// fires later, while the child lingers after `stdin.end()` (measured, see class doc above).
		if (observed.terminal) {
			return observed.terminal.isError
				? { kind: StopKind.SERVER_ERROR as TransportStopKind, detail: observed.terminal.text || 'provider reported an error result' }
				: undefined
		}

		if (observed.watchdogFired) {
			return {
				kind: StopKind.SERVER_ERROR as TransportStopKind,
				detail: `no output for ${this.inactivityMs}ms — killed by the inactivity watchdog`,
			}
		}
		// ANTES do genérico "exited with code N": o 127 do shebang tem causa conhecida e ação clara, e
		// um stop que a nomeia é a diferença entre o operador consertar o PATH e três retries poisoning.
		if (observed.exitCode === 127 && MISSING_NODE_HINT.test(observed.stderr)) {
			return {
				kind: StopKind.SERVER_ERROR as TransportStopKind,
				detail: `o CLI do provedor não encontrou o \`node\` no PATH do app (exit 127: ${observed.stderr.trim()})`,
			}
		}
		if (observed.exitCode !== 0) {
			return {
				kind: StopKind.SERVER_ERROR as TransportStopKind,
				detail: `provider exited with code ${observed.exitCode}${observed.stderr ? `: ${observed.stderr.trim()}` : ''}`,
			}
		}
		// DIED WITHOUT CLOSING THE TURN. Reached only when there is no terminal frame (the branch above
		// returns first) and the exit was clean — the child went away mid-stream and said nothing final.
		// Reporting COMPLETED here is what the run used to do, and it is a lie the caller cannot detect:
		// an empty reply with no stop reads as "the agent had nothing to say", so the issue stays WORKING
		// and the operator waits on an answer that will never come. A transport stop is retriable and
		// visible, which is what a run that lost its process actually is.
		if (observed.diedMidStream) {
			return {
				kind: StopKind.SERVER_ERROR as TransportStopKind,
				detail: `o processo do provedor morreu antes de fechar o turno${observed.stderr ? `: ${observed.stderr.trim()}` : ''}`,
			}
		}
		return undefined
	}

	async shutdown(): Promise<void> {
		for (const proc of this.live) proc.kill()
		this.live.clear()
	}
}

function failure(outcome: AgentRunOutcome, detail: string, kind: TransportStopKind): AgentRunResult {
	return { outcome, replyText: '', sessionId: null, failed: false, stop: { kind, detail } }
}

/**
 * Serialize an `AgentMcpInvocation` into the `--mcp-config` payload. The run token rides in the
 * `Authorization` header (http) or in the child `env` (stdio) — never in a tool argument, never in
 * the prompt. Both shapes are what this CLI's `mcpServers` map expects.
 */
function renderMcpConfig(mcp: AgentMcpInvocation): string {
	const server =
		mcp.transport === 'http'
			? { type: 'http', url: mcp.endpoint, headers: { Authorization: `Bearer ${mcp.token}` } }
			: { type: 'stdio', command: mcp.command?.command, args: mcp.command?.args ?? [], env: { [MCP_RUN_TOKEN_ENV]: mcp.token } }
	return JSON.stringify({ mcpServers: { [MCP_SERVER_KEY]: server } })
}

/**
 * MAKE `outputSchema` MEAN SOMETHING TO THE MODEL — the instruction that turns a run structured.
 *
 * MEASURED, and it is why this function exists (Fase-3 vertical smoke,
 * `.specs/codedm/phase3-smoke/raw/vertical.json`): asked to classify an inbound message with an
 * `outputSchema` and NOTHING else, the real `claude` replied
 * `NEW_ISSUE: Fix unresponsive login button click` — a correct decision, in PROSE. §4.2 justified
 * deleting the old shrinking-window JSON scavenger on the grounds that "with stream-json the final
 * assistant text arrives already delimited by a frame", and that reasoning is HALF true: framing fixes
 * where the text ENDS, not whether the text is JSON. Nothing else in the pipeline ever tells the model
 * what shape to answer in, so without this the structured half of the seam cannot work at all.
 *
 * The schema is sent as JSON Schema derived from the Zod type, so there is ONE source of truth: the
 * same object that validates the reply is the one that describes it. A hand-written prose description
 * would be a second, silently-drifting copy of the contract.
 *
 * It lives in the RUNNER rather than in a caller because `outputSchema` is a field of the seam, not of
 * the classifier — §4.2 makes it "the ONE switch that turns this call into classification", and a
 * switch every caller has to remember to also explain in its own prompt is not a switch. And it is
 * appended LAST, after the turn body, because instruction recency is what the model actually obeys.
 */
function structuredOutputDirective(schema: ZodType): string {
	return [
		'Reply with exactly ONE JSON object and nothing else: no prose, no explanation, no markdown code fence.',
		'It must validate against this JSON Schema:',
		JSON.stringify(z.toJSONSchema(schema)),
	].join('\n')
}

/**
 * The stream-json stdin form: ONE JSONL user line per message.
 *
 * Several messages are the SAME live turn, not several turns — which is exactly why stdin is a stream
 * and not an argument, and why closing it is a decision rather than a formality.
 *
 * The system prompt is PREPENDED to the first line rather than passed as a flag, and that is a
 * deliberate limit rather than an oversight: sending it as its own line would make it a separate user
 * turn, which is not what it is. When a system-prompt flag is adopted, it lands in `buildArgs` — as
 * argv, not as a second stdin line.
 */
function renderStreamJsonStdin(request: AgentRunRequest<ZodType | undefined>): string {
	const contents = request.messages.map(m => m.content)
	if (request.systemPrompt) contents[0] = contents[0] ? `${request.systemPrompt}\n\n${contents[0]}` : request.systemPrompt
	// The structured-output directive rides on the LAST line of the turn, for the recency reason stated
	// on `structuredOutputDirective`. A line of its own would still be the same turn (stdin stays open
	// until the terminal frame), but it would read as a separate user message rather than as part of
	// the ask, and the model treats those differently.
	if (request.outputSchema) {
		const directive = structuredOutputDirective(request.outputSchema)
		const last = contents.length - 1
		if (last < 0) contents.push(directive)
		else contents[last] = `${contents[last]}\n\n${directive}`
	}
	return contents.map(content => `${JSON.stringify({ type: 'user', message: { role: 'user', content } })}\n`).join('')
}

async function drainToStrings(stream: AsyncIterable<Uint8Array | string>, sink: string[]): Promise<void> {
	try {
		for await (const chunk of stream) sink.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk))
	} catch {
		// A broken stderr pipe must never be the reason a run fails — stdout is the signal.
	}
}

/**
 * Await `promise`, but never past `ms` — a rejection and an overrun both collapse to `fallback`.
 *
 * Exists because two awaits in `run()` sit AFTER the turn is structurally over and neither had a
 * clock: the process's exit and the stderr drain. Both hang on the same thing — a pipe inherited by a
 * grandchild the CLI leaked — and hanging there is worse than being wrong there, because the caller
 * upstream (a mailbox turn holding a lease it renews every three minutes) has no way to tell an
 * unfinished teardown from an unfinished turn.
 */
async function settleWithin<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined
	try {
		return await Promise.race([
			promise.catch(() => fallback),
			new Promise<T>(resolve => {
				timer = setTimeout(() => resolve(fallback), ms)
			}),
		])
	} finally {
		clearTimeout(timer)
	}
}
