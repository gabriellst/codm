import { injectable } from 'tsyringe-neo'
import { z, type ZodType } from 'zod'
import { AgentStopReason, StopKind } from '@codedm/contracts-typescript/wire/enums'
import { LoggingService } from '@codedm/core-typescript'
import { TerminalRunOutcome, type TransportStopKind } from '../../../enums'
import { providerDef } from '../../../providers'
import type { AgentFrame, AgentRunRequest, AgentRunResult, AgentRuntimeEvent } from '../../../types'
import { LineBuffer, StreamJsonCodec, StreamJsonToTurnFactAccumulator, type TerminalResultRecord } from '../../StreamJsonCodec'
import { AgentRunner } from '../AgentRunner'
import { nodeAgentProcessSpawner, type AgentProcess, type AgentProcessSpawner } from './AgentProcess'

/** No frame for this long ⇒ the run is wedged. The BACKSTOP of §4.3 rule 5, never the primary signal. */
const DEFAULT_INACTIVITY_MS = 180_000

export interface StreamJsonAgentRunnerOptions {
	spawner?: AgentProcessSpawner
	inactivityMs?: number
}

/** A CLI that says any of these is asking for a human to log in — not a run that failed on its merits. */
const AUTH_HINT = /\/login\b|not logged in|please log ?in|authentication (?:required|failed)|unauthorized/i

/**
 * The `AgentRunner` over BIDIRECTIONAL STREAM-JSON on plain pipes — no PTY, no SDK, no HTTP of ours.
 *
 * It does exactly two things: own a child process, and turn its stdout into `AgentRuntimeEvent`s. All
 * the judgement lives elsewhere on purpose — the wire grammar in `StreamJsonCodec`, the domain fold in
 * `StreamJsonToTurnFactAccumulator`, and every per-CLI difference in `ProviderDef`. There is no
 * `if (provider === …)` in this file and there must never be one: a provider difference that shows up
 * as control flow here means it should have been a `ProviderDef` FIELD (§8 rule 4). A CLI with no
 * stream-json at all is not a special case, it is `streamFormat: 'plain'`.
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
 * simply stops talking. It fires on INACTIVITY, not on total duration — a long tool call is not a hang.
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
export class StreamJsonAgentRunner extends AgentRunner {
	private readonly spawner: AgentProcessSpawner
	private readonly inactivityMs: number
	private readonly live = new Set<AgentProcess>()

	constructor(
		private readonly logging: LoggingService,
		options: StreamJsonAgentRunnerOptions = {},
	) {
		super()
		this.spawner = options.spawner ?? nodeAgentProcessSpawner
		this.inactivityMs = options.inactivityMs ?? Number(process.env.CODEDM_AGENT_INACTIVITY_MS ?? DEFAULT_INACTIVITY_MS)
	}

	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		const def = providerDef(request.provider)
		const warn = (message: string): void =>
			this.logging.warn({ content: { message, agentName: request.agentName, provider: request.provider } })

		const codec = new StreamJsonCodec({ onWarn: warn })
		// UNSTAMPED on purpose — the runner has no `ownerId`/`issueId` to stamp with, by design
		// (AC-1.11: identity rides inside the opaque MCP token). The layer holding the envelope adds it.
		const accumulator = new StreamJsonToTurnFactAccumulator({})

		const prompt = renderPrompt(request)
		const args = def.buildArgs({
			model: request.model,
			cwd: request.cwd,
			extraDirs: request.extraDirs,
			resumeSessionId: request.session?.resumeId,
			newSessionId: request.session?.newId,
			mcp: request.mcp,
			caps: request.caps ?? {},
		})
		const cmd = [request.binaryPath ?? def.bin, ...args]
		// `promptViaStdin: false` ⇒ the CLI wants the prompt as its final argument. DATA, not a branch.
		if (!def.promptViaStdin) cmd.push(prompt)

		let proc: AgentProcess
		try {
			proc = this.spawner({ cmd, cwd: request.cwd, stdin: def.promptViaStdin })
		} catch (cause) {
			// Even a spawn that fails synchronously must arrive as the terminal event, not as a throw —
			// the consumer's drain loop is the only place it can be handled uniformly.
			yield {
				type: 'finished',
				result: failure(TerminalRunOutcome.STOPPED, `${StopKind.SERVER_ERROR}: ${String(cause)}`, StopKind.SERVER_ERROR),
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
		const plainLines: string[] = []
		// The same reassembly primitive the codec uses, for the same reason: a chunk is not a line, and
		// a final line with no trailing newline is a real line rather than debris.
		const plainBuffer = new LineBuffer()

		/** One stdout line of a `plain` provider → the frame and the fact it stands for. */
		const emitPlain = function* (text: string): Generator<AgentRuntimeEvent> {
			if (text.trim().length === 0) return
			plainLines.push(text)
			const frame: AgentFrame = { kind: 'assistant_text', messageId: `${request.agentName}-plain`, text, parentToolUseId: null }
			yield { type: 'frame', frame }
			const fact = accumulator.apply(frame)
			if (fact) yield { type: 'fact', fact }
		}

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
			if (def.promptViaStdin) {
				proc.write(def.promptInputFormat === 'stream-json' ? renderStreamJsonStdin(request) : prompt)
				// A CLI without stream-json input has no notion of a turn staying open: write, close, read.
				if (def.promptInputFormat !== 'stream-json') closeStdin()
			}

			const iterator = proc.stdout[Symbol.asyncIterator]()
			let pending: Promise<IteratorResult<Uint8Array | string>> | null = null

			for (;;) {
				let timer: ReturnType<typeof setTimeout> | undefined
				const step = pending ?? iterator.next()
				pending = step
				const timeout = new Promise<'timeout'>(resolve => {
					timer = setTimeout(() => resolve('timeout'), this.inactivityMs)
				})
				const settled = await Promise.race([step, timeout])
				clearTimeout(timer)

				if (settled === 'timeout') {
					watchdogFired = true
					warn(`no output for ${this.inactivityMs}ms — killing the run (watchdog backstop)`)
					// The raced promise outlives this loop; without a catch its later rejection is unhandled.
					step.catch(() => {})
					proc.kill()
					break
				}
				pending = null
				if (settled.done) break

				// `plain` providers have NO frame grammar — running the JSONL codec over their stdout would
				// only manufacture a parse warning per line. One assistant_text frame per line instead:
				// same runner, same seam, same union, strictly less information (§4.7).
				if (def.streamFormat === 'plain') {
					for (const text of plainBuffer.push(settled.value)) {
						yield* emitPlain(text)
					}
					continue
				}

				for (const decoded of codec.push(settled.value)) {
					for (const frame of decoded.frames) {
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
			}

			if (def.streamFormat === 'plain') {
				for (const text of plainBuffer.flush()) yield* emitPlain(text)
			} else {
				for (const decoded of codec.flush()) {
					for (const frame of decoded.frames) {
						yield { type: 'frame', frame }
						const fact = accumulator.apply(frame)
						if (fact) yield { type: 'fact', fact }
					}
					if (decoded.terminal) terminal = decoded.terminal
				}
			}

			closeStdin()
			const exitCode = await proc.exited.catch(() => -1)
			await stderrPump

			// Orphan tool calls become FAILED here — the turn is over and they never reported a result.
			for (const fact of accumulator.flush()) yield { type: 'fact', fact }

			yield {
				type: 'finished',
				result: this.buildResult(request, {
					terminal,
					sessionId,
					exitCode,
					watchdogFired,
					stderr: stderrChunks.join(''),
					plainText: plainLines.join('\n'),
				}),
			}
		} finally {
			request.signal?.removeEventListener('abort', onAbort)
			this.live.delete(proc)
			proc.kill()
		}
	}

	/**
	 * Fold everything observed into the ONE terminal record — and never throw while doing it.
	 *
	 * Only TRANSPORT stops can be raised here (`AUTH_REQUIRED`, `SERVER_ERROR`); the type says so, and
	 * that is the point. A DOMAIN stop is unrepresentable from this side because it can only come from
	 * a `codedm__raise_stop` call, which is Fase 6.
	 */
	private buildResult<OutputSchema extends ZodType | undefined>(
		request: AgentRunRequest<OutputSchema>,
		observed: {
			terminal?: TerminalResultRecord
			sessionId: string | null
			exitCode: number
			watchdogFired: boolean
			stderr: string
			plainText: string
		},
	): AgentRunResult {
		const replyText = observed.terminal?.text ?? observed.plainText
		const stop = this.classifyStop(observed)

		if (stop) {
			return { outcome: TerminalRunOutcome.STOPPED, replyText, sessionId: observed.sessionId, failed: false, stop }
		}

		if (!request.outputSchema) {
			return { outcome: TerminalRunOutcome.COMPLETED, replyText, sessionId: observed.sessionId, failed: false }
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
				outcome: TerminalRunOutcome.COMPLETED,
				replyText,
				sessionId: observed.sessionId,
				failed: true,
				failure: 'terminal reply text was not JSON',
			}
		}
		const parsed = request.outputSchema.safeParse(candidate)
		return parsed.success
			? { outcome: TerminalRunOutcome.COMPLETED, replyText, sessionId: observed.sessionId, output: parsed.data, failed: false }
			: { outcome: TerminalRunOutcome.COMPLETED, replyText, sessionId: observed.sessionId, failed: true, failure: parsed.error.message }
	}

	private classifyStop(observed: {
		terminal?: TerminalResultRecord
		exitCode: number
		watchdogFired: boolean
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
		if (observed.exitCode !== 0) {
			return {
				kind: StopKind.SERVER_ERROR as TransportStopKind,
				detail: `provider exited with code ${observed.exitCode}${observed.stderr ? `: ${observed.stderr.trim()}` : ''}`,
			}
		}
		return undefined
	}

	async shutdown(): Promise<void> {
		for (const proc of this.live) proc.kill()
		this.live.clear()
	}
}

function failure(outcome: TerminalRunOutcome, detail: string, kind: TransportStopKind): AgentRunResult {
	return { outcome, replyText: '', sessionId: null, failed: false, stop: { kind, detail } }
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
 * The turn as ONE plain-text prompt — the shape every CLI understands.
 *
 * The system prompt is PREPENDED rather than passed as a flag, and that is a deliberate limit of this
 * phase rather than an oversight: no `ProviderDef` declares a system-prompt flag, and the defs are
 * frozen Fase-1 artifacts that a transport phase may not edit. Prepending is the behaviour every
 * provider supports, including the `plain` ones. When a def grows a `systemPromptFlag`, this function
 * is where it lands — as a field read, never as a `provider === …` branch.
 */
function renderPrompt(request: AgentRunRequest<ZodType | undefined>): string {
	const parts = [request.systemPrompt, request.messages.map(m => m.content).join('\n\n')]
	if (request.outputSchema) parts.push(structuredOutputDirective(request.outputSchema))
	return parts.filter(part => part && part.length > 0).join('\n\n')
}

/**
 * The stream-json stdin form: ONE JSONL user line per message.
 *
 * Several messages are the SAME live turn, not several turns — which is exactly why stdin is a stream
 * and not an argument, and why closing it is a decision rather than a formality. The system prompt
 * rides on the FIRST line for the reason above; sending it as its own line would make it a separate
 * user turn, which is not what it is.
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
