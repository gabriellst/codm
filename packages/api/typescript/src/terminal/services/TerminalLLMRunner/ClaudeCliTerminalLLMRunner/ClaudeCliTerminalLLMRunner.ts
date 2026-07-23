import { randomUUID } from 'node:crypto'
import { mkdirSync, existsSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { EventEmitter } from 'node:events'
import { injectable } from 'tsyringe-neo'
import type { z, ZodType } from 'zod'
import { BaseError } from '@codedm/core-typescript'
import { ProviderKind, StopKind } from '@codedm/contracts-typescript/wire/enums'
import { TuiMarker, TurnEndSignal } from '../../../enums'
import {
	TerminalLLMRunner,
	type TerminalLLMRunnerStreamRequest,
	type TerminalLLMSessionSnapshot,
	type ChatMessage,
} from '../TerminalLLMRunner'
import type { AgentGenerateRequest, SessionKillReason, TerminalRuntimeEvent } from '../types'
import { buildCommand, collectStream, extractJson, mergeLineStreams, spawnOneShot, waitExit } from '../oneshot'
import type { TerminalApplicationErrors } from '../../../errors'
import { SessionMap, type LiveSession, type SessionEmitter, type TranscriptTail } from './SessionMap'
import { spawnClaude } from './spawner'
import { createWriteQueue } from './queue'
import { stripAnsi } from './ansi'
import { createInMemorySessionStore, type SessionStore } from './SessionStore'
import { ClaudeBootSequence, BootExitError, BootSilentError } from './ClaudeBootSequence'
import { BinaryProbe } from './BinaryProbe'
import { RunnerLogger } from './logger/RunnerLogger'
import { sessionBadge, LOG_TIER_RANK } from './logger/format'
import { claudeAssistantRecordText, isClaudeTurnTerminalRecord, sessionFilePath, tailJsonl } from './transcript'
import { TuiActionParser, type TuiActionEvent } from './tui/TuiActionParser'
import { ACTION_REGISTRY } from './tui/actionRegistry'

// Session eviction (idle for this long → kill the PTY).
const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000
const DEFAULT_QUEUE_DEPTH = 4
// Initial delay between writing the bracketed-paste body and the first ESC+Enter submission
// attempt. claude's TUI takes time to render the paste placeholder + any overlays it triggers
// (file-ref autocomplete, MCP auth banners, "paste again to expand" hints); 250ms is conservative
// enough that the first dismissal+submit lands after the placeholder is on screen.
// Read lazily so tests can override.
const submitDelayMs = () => Number(process.env.CODEDM_SUBMIT_DELAY_MS ?? 250)
// Submission retry offsets (after the initial submitDelayMs). claude's TUI can pop multiple
// overlays at different times — file-reference scan fires 200-800ms after paste, MCP-failure
// banners can appear 1-30s after spawn, "paste again to expand" hints persist with the
// placeholder. Each shot is ESC (dismiss any active overlay) + \r (submit). Once claude starts
// processing the turn the input box is empty; later shots become harmless no-ops.
const SUBMIT_RETRY_OFFSETS_MS = [600, 1400, 3000, 6500, 15000]
// Poll interval for the JSONL tail's internal loop. Also handles ENOENT (file not yet created).
const filePollMs = () => Number(process.env.CODEDM_JSONL_POLL_MS ?? 50)
// Boot settle window: how long we wait after spawning claude before writing the first prompt.
// claude prints the trust banner + sets up the REPL during this window. The trust-prompt
// auto-accept fires independently inside this window. Note: claude does NOT create the JSONL
// transcript file until *after* it processes a user prompt — so we can't gate on file existence
// here, only on a time-based settle + an early-exit guard.
const bootSettleMs = () => Number(process.env.CODEDM_BOOT_SETTLE_MS ?? 1500)
// Per-turn ceiling: if we never see a `system/turn_duration` record we fail loudly.
const MAX_TURN_MS = 5 * 60 * 1000
// Tighter ceiling for the PRIMING turn (the very first runTurn against a freshly spawned claude).
// If it hasn't written any JSONL within 60s, the claude daemon is wedged and waiting longer
// doesn't help — killing the PTY is what unsticks it, so we fail fast and let spawnSession's
// retry-once loop respawn.
const PRIMING_TURN_MS = 60 * 1000
// Window to see claude's first `⏺` after a submit before we fire one fallback `ESC+\r`.
const SUBMIT_VERIFICATION_MS = 5_000
// claude's TUI enables bracketed paste mode at startup. We wrap each prompt in these markers so
// claude treats the payload as a paste, then send Enter to submit.
const BRACKET_START = '\x1b[200~'
const BRACKET_END = '\x1b[201~'

// Boot-failure output that means the CLI wants a human to re-authenticate. Drives the
// StopKind.AUTH_REQUIRED path (wave-0 amendment) instead of a generic SERVER_ERROR.
const AUTH_REQUIRED_RE = /please run \/login|\/login|invalid api key|not logged in|oauth token|authentication[_ ]?error/i

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => {
		const t = setTimeout(resolve, ms)
		t.unref?.()
	})
}

/**
 * Graceful PTY shutdown for `claude`: send EOT (Ctrl-D / `\x04`) so the REPL cleanly leaves its
 * input prompt, fall through to SIGTERM after a wait, then SIGKILL if the process still hasn't
 * reaped. Abrupt kill can leave the CLI in a partially-written transcript state.
 */
async function closePtyGracefully(pty: {
	write(data: string): void
	kill(signal?: string): void
	onExit(cb: (e: { exitCode: number; signal?: number }) => void): { dispose(): void }
}): Promise<void> {
	const exited = new Promise<void>(resolve => {
		const disposable = pty.onExit(() => {
			disposable.dispose()
			resolve()
		})
	})
	try {
		pty.write('\x04')
	} catch {}
	await Promise.race([exited, sleep(250)])
	try {
		pty.write('\x04')
	} catch {}
	await Promise.race([exited, sleep(750)])
	try {
		pty.kill('SIGTERM')
	} catch {}
	await Promise.race([exited, sleep(500)])
	try {
		pty.kill('SIGKILL')
	} catch {}
	await Promise.race([exited, sleep(250)])
}

/**
 * Replace bare `\n` and `\r` in the user prompt with a single space before writing to the PTY.
 * REPLs treat embedded line endings as "submit this turn", so a multi-line prompt would otherwise
 * arrive as two separate turns.
 */
export function flattenPrompt(prompt: string): string {
	return prompt.replace(/[\r\n]+/g, ' ').trim()
}

/**
 * Render a conversation history window into a plain-text preamble prepended to the per-turn
 * bracketed-paste payload. Empty context produces an empty string.
 *
 * Plain-text only — NO XML tags. claude's TUI parses pasted text for @-mentions and file
 * references; angle-bracketed tags trigger the file-ref scanner to pop a context popup that
 * intercepts Enter, so the turn never submits.
 */
function renderContext(messages: ChatMessage[] | undefined): string {
	if (!messages || messages.length === 0) return ''
	const lines = messages.map(m => {
		const who = m.actor === 'USER' ? 'user' : 'claude'
		return `[${who} @ ${m.occurredAt.toISOString()}] ${m.content}`
	})
	return `Conversation so far:\n${lines.join('\n')}\n\nCurrent message:\n`
}

/**
 * Tracks the in-flight turn for a session. Exactly one is set at a time; `runTurn` installs one,
 * the JSONL tail / TUI markers resolve it.
 */
interface TurnHandle {
	assistantText: string
	/** Flipped true on TuiMarker.RESPONSE_START — claude's first `⏺` after `armForSubmit()`. */
	responseObserved: boolean
	resolve(finalText: string): void
	reject(err: Error): void
}

/** Out-of-band lifecycle notification (evictions/kills outside any bound stream). */
export type RunnerLifecycleEvent =
	| { type: 'killed'; issueId: string; terminalSessionId: string | null; reason: SessionKillReason }
	| { type: 'idle_evicted'; issueId: string; terminalSessionId: string | null; idleForMs: number }

/**
 * Real `TerminalLLMRunner` — the whatscode battle-tested engine, rekeyed by issueId (Fork B) and
 * driven through `Bun.Terminal` (Fork D2) instead of node-pty. Interactive PTY for `claude`, with
 * output recovered from the JSONL transcript claude itself writes at
 * `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`.
 *
 * We spawn `claude --dangerously-skip-permissions --session-id <uuid>` in a PTY and write prompts
 * to its REPL stdin like a human typing. Reading the JSONL is just `tail -f` on a side-effect
 * file claude maintains — Anthropic still sees one long-lived interactive session per issue.
 *
 * Non-claude providers (codex/opencode) have no interactive engine yet: `stream()` degrades to a
 * one-shot pipes run (`output` lines + `exit`), the pre-phase-10 behavior.
 *
 * No code outside this folder may import `Bun.Terminal` / the transcript paths — see
 * `ImportGraphIsolation.test.ts`.
 */
@injectable()
export class ClaudeCliTerminalLLMRunner extends TerminalLLMRunner {
	private readonly map = new SessionMap()
	private readonly idleTimeoutMs: number
	private evictTimer: NodeJS.Timeout | null = null

	private readonly store: SessionStore = createInMemorySessionStore()
	private readonly bus = new EventEmitter()
	private readonly logger: RunnerLogger

	// Per-session in-flight turn handle. Keyed by issueId. Installed by `runTurn` and consumed by
	// the JSONL tail / TUI markers.
	private readonly turns = new Map<string, TurnHandle>()

	onLifecycle(listener: (ev: RunnerLifecycleEvent) => void): () => void {
		this.bus.on('lifecycle', listener)
		return () => this.bus.off('lifecycle', listener)
	}

	async evictIdleNow(): Promise<void> {
		await this.evictIdle()
	}

	constructor() {
		super()
		this.idleTimeoutMs = Number(process.env.CODEDM_IDLE_TIMEOUT_MS ?? DEFAULT_IDLE_TIMEOUT_MS)
		this.logger = new RunnerLogger({ envTier: process.env.CODEDM_LOG })
		BinaryProbe.runOnce(this.logger)
		this.evictTimer = setInterval(() => {
			void this.evictIdle()
		}, 30_000)
		this.evictTimer.unref?.()
	}

	// ── generate(): one-shot structured print-mode call (any provider) ──────────────────────────

	async generate<OutputSchema extends ZodType>(request: AgentGenerateRequest<OutputSchema>): Promise<z.output<OutputSchema>> {
		const { cmd } = buildCommand(request.provider, request.binaryPath, 'generate', request.prompt, request.systemPrompt)
		const proc = spawnOneShot(cmd, request.cwd)
		const [stdout, code] = await Promise.all([collectStream(proc.stdout), waitExit(proc, cmd)])
		if (code !== 0) {
			throw new BaseError<TerminalApplicationErrors>('TERMINAL_SPAWN_FAILED', `${request.provider} generate exited with code ${code}`)
		}
		const json = extractJson(stdout)
		if (json === undefined) {
			throw new BaseError<TerminalApplicationErrors>('CLASSIFICATION_FAILED', `${request.provider} produced no parseable JSON output`)
		}
		return request.outputSchema.parse(json) as z.output<OutputSchema>
	}

	// ── stream(): interactive claude engine (or pipes fallback for other providers) ─────────────

	async *stream(request: TerminalLLMRunnerStreamRequest): AsyncIterable<TerminalRuntimeEvent> {
		if (request.provider !== ProviderKind.CLAUDE_CODE) {
			yield* this.streamOneShot(request)
			return
		}
		yield* this.streamClaudeSession(request)
	}

	/** Pipes fallback for providers without a ported interactive engine (codex/opencode). */
	private async *streamOneShot(request: TerminalLLMRunnerStreamRequest): AsyncIterable<TerminalRuntimeEvent> {
		const { cmd } = buildCommand(request.provider, request.binaryPath, 'stream', request.prompt, request.systemPrompt)
		const proc = spawnOneShot(cmd, request.cwd)
		try {
			for await (const line of mergeLineStreams(proc.stdout, proc.stderr)) {
				yield { type: 'output', line: { at: new Date().toISOString(), line: line.text, stream: line.stream } }
			}
			const code = await waitExit(proc, cmd)
			yield { type: 'exit', code }
		} finally {
			// Belt-and-braces: if the consumer breaks early, don't leak the subprocess.
			proc.kill()
		}
	}

	private async *streamClaudeSession(request: TerminalLLMRunnerStreamRequest): AsyncIterable<TerminalRuntimeEvent> {
		const k = request.issueId
		const buffer: TerminalRuntimeEvent[] = []
		let resolveTurn!: () => void
		let rejectTurn!: (e: Error) => void
		const turnDone = new Promise<void>((res, rej) => {
			resolveTurn = res
			rejectTurn = rej
		})
		// Swallow late rejections after the iterator already threw (avoids unhandled-rejection noise).
		turnDone.catch(() => {})
		let waiter: { resolve: () => void } | null = null

		const emit = (ev: TerminalRuntimeEvent): void => {
			buffer.push(ev)
			waiter?.resolve()
			waiter = null
			if (ev.type === 'turn_completed') resolveTurn()
			// PTY exit (crash, explicit kill) ends the iterator cleanly so the for-await consumer
			// exits instead of hanging.
			if (ev.type === 'killed') resolveTurn()
		}

		let createdHere = false
		let session: LiveSession
		try {
			session = await this.map.getOrCreate(k, async () => {
				createdHere = true
				return this.spawnSession(request, emit)
			})
		} catch (err) {
			// Boot-time auth failures surface as an AUTH_REQUIRED stop (wave-0 amendment) so the
			// control plane flags the thread instead of burying a generic 500.
			if (err instanceof BootExitError || (err instanceof Error && /exited during boot/.test(err.message))) {
				const detail = err instanceof BootExitError ? err.lastOutput || err.message : err.message
				if (AUTH_REQUIRED_RE.test(detail)) {
					yield { type: 'stop', kind: StopKind.AUTH_REQUIRED, detail }
					return
				}
			}
			throw err
		}

		// Rebind the session emitter to THIS turn's `emit`. Without this, the tail callback (set
		// inside spawnSession) would push the next turn's events into the previous stream's dead
		// buffer.
		session.emitter.current = emit

		if (!createdHere) {
			// Warm reuse of the live REPL — surface it as a `resumed` lifecycle event.
			emit({ type: 'session', lifecycle: 'resumed', terminalSessionId: session.terminalSessionId, cwd: session.cwd })
		}

		let pending: Promise<void> | null = null
		if (session.primed) {
			// spawnSession already ran the priming turn and pushed its events through `emit`.
			session.primed = false
			session.lastActivityAt = Date.now()
		} else {
			pending = session.queue.enqueue(renderContext(request.context) + request.prompt)
			void (async () => {
				const next = session.queue.dequeue()
				if (!next) return
				try {
					await this.runTurn(session, next.text)
					session.lastActivityAt = Date.now()
					await turnDone
					next.resolve()
				} catch (err) {
					next.reject(err instanceof Error ? err : new Error(String(err)))
				}
			})()
		}

		try {
			while (true) {
				if (buffer.length > 0) {
					const ev = buffer.shift() as TerminalRuntimeEvent
					yield ev
					if (ev.type === 'turn_completed') break
					if (ev.type === 'killed') break
					if (ev.type === 'stop') break
					continue
				}
				await new Promise<void>(res => {
					waiter = { resolve: res }
				})
			}
			if (pending) await pending
		} catch (err) {
			rejectTurn(err instanceof Error ? err : new Error(String(err)))
			throw err
		}
	}

	async getSession(issueId: string): Promise<TerminalLLMSessionSnapshot | null> {
		const s = this.map.get(issueId)
		if (!s) return null
		return {
			issueId: s.issueId,
			terminalSessionId: s.terminalSessionId,
			cwd: s.cwd,
			lastActivityAt: s.lastActivityAt,
			idle: Date.now() - s.lastActivityAt > this.idleTimeoutMs,
		}
	}

	async killSession(issueId: string): Promise<void> {
		const s = this.map.get(issueId)
		if (!s) return
		// Remove from map *before* killing the PTY so the `onExit` handler short-circuits and
		// doesn't re-emit a duplicate killed event.
		this.map.delete(issueId)
		await this.killOne(s, 'explicit')
	}

	async shutdown(): Promise<void> {
		if (this.evictTimer) clearInterval(this.evictTimer)
		this.evictTimer = null
		await this.map.shutdown(s => this.killOne(s, 'shutdown'))
	}

	private async evictIdle(): Promise<void> {
		await this.map.evictIdle(this.idleTimeoutMs, async s => {
			await this.killOne(s, 'idle')
		})
	}

	/**
	 * Long-lived `pty.onExit` handler wired during spawnSession. Short-circuits when the runner
	 * itself removed the session (killSession / evictIdle / shutdown), so this only fires on
	 * genuine crashes.
	 */
	private handleUnexpectedExit(session: LiveSession): void {
		if (this.map.get(session.key) !== session) return
		this.map.delete(session.key)
		void session.tail.stop()

		try {
			session.emitter.current({ type: 'killed', reason: 'crash', terminalSessionId: session.terminalSessionId })
		} catch {}
		this.bus.emit('lifecycle', {
			type: 'killed',
			issueId: session.issueId,
			terminalSessionId: session.terminalSessionId,
			reason: 'crash',
		} satisfies RunnerLifecycleEvent)
		// Unblock any in-flight turn so its IIFE's queue-entry resolves instead of hanging until
		// MAX_TURN_MS. Resolve (not reject) — the killed event above is the terminal signal the
		// stream consumer reads.
		const turn = this.turns.get(session.key)
		if (turn) {
			this.turns.delete(session.key)
			turn.resolve(turn.assistantText)
		}
	}

	private async killOne(s: LiveSession, reason: SessionKillReason): Promise<void> {
		await s.tail.stop()
		for (const sub of s.traceSubs) {
			try {
				sub.dispose()
			} catch {}
		}
		s.traceSubs = []
		// Signal any active stream that the session is gone so its buffer loop exits on a clean
		// terminal event.
		try {
			s.emitter.current({ type: 'killed', reason, terminalSessionId: s.terminalSessionId })
		} catch {}
		// Unblock any in-flight turn.
		const turn = this.turns.get(s.key)
		if (turn) {
			this.turns.delete(s.key)
			turn.resolve(turn.assistantText)
		}
		await closePtyGracefully(s.pty)
		await this.store.delete(s.issueId)
		if (reason === 'idle') {
			const idleForMs = Date.now() - s.lastActivityAt
			this.bus.emit('lifecycle', {
				type: 'idle_evicted',
				issueId: s.issueId,
				terminalSessionId: s.terminalSessionId,
				idleForMs,
			} satisfies RunnerLifecycleEvent)
		} else {
			this.bus.emit('lifecycle', {
				type: 'killed',
				issueId: s.issueId,
				terminalSessionId: s.terminalSessionId,
				reason,
			} satisfies RunnerLifecycleEvent)
		}
	}

	/**
	 * Forward a parsed JSONL record to whichever stream is currently bound to this session.
	 * Accumulates assistant text and triggers turn completion on `turn_duration` records.
	 */
	private onTranscriptRecord(session: LiveSession, record: Record<string, unknown>): void {
		const text = claudeAssistantRecordText(record)
		if (text !== null) {
			session.logger.line({
				tier: 'verbose',
				severity: 'info',
				label: 'jsonl',
				message: `assistant "${text.slice(0, 80).replace(/\n/g, ' ')}..." (${text.length}ch)`,
			})
			const turn = this.turns.get(session.key)
			if (turn) turn.assistantText += turn.assistantText.length > 0 ? `\n${text}` : text
			session.lastActivityAt = Date.now()
			session.emitter.current({ type: 'reply', text })
			return
		}
		if (isClaudeTurnTerminalRecord(record)) {
			this.completeTurn(session, TurnEndSignal.JSONL_TURN_DURATION)
		}
	}

	/**
	 * Channel 1 callback — observability. Emits an `action` runtime event for the bound stream and
	 * renders a per-type colored one-line entry through the session logger.
	 */
	private onTuiAction(session: LiveSession, event: TuiActionEvent): void {
		const def = ACTION_REGISTRY.find(d => d.type === event.type)
		const preview = event.value.length > 100 ? `${event.value.slice(0, 100)}...` : event.value
		session.logger.line({
			tier: 'info',
			severity: 'info',
			glyph: def?.glyph ?? '?',
			label: event.type.toLowerCase(),
			message: preview,
		})
		session.emitter.current({ type: 'action', action: event.type, value: event.value, at: event.detectedAt.toISOString() })
	}

	/**
	 * Channel 2 callback — reliability signals.
	 *   RESPONSE_START  — submit verification (flips TurnHandle.responseObserved).
	 *   NEXT_PROMPT     — `❯` after `⏺` — third independent turn-end detector.
	 *   TURN_END_MARKER — `✻ <verb> for <N>s`.
	 */
	private onTuiMarker(session: LiveSession, marker: TuiMarker): void {
		switch (marker) {
			case TuiMarker.RESPONSE_START: {
				const turn = this.turns.get(session.key)
				if (turn) turn.responseObserved = true
				session.logger.line({
					tier: 'verbose',
					severity: 'success',
					label: 'submit-ack',
					message: 'claude started responding (⏺)',
				})
				return
			}
			case TuiMarker.NEXT_PROMPT:
				this.completeTurn(session, TurnEndSignal.TUI_NEXT_PROMPT)
				return
			case TuiMarker.TURN_END_MARKER:
				this.completeTurn(session, TurnEndSignal.TUI_MARKER)
				return
		}
	}

	/**
	 * Finalize an in-flight turn. Called from three independent detectors (JSONL turn_duration,
	 * TUI turn-end marker, TUI next-prompt). Whichever fires first wins; re-entrancy is guarded by
	 * the `this.turns.get(...)` lookup.
	 */
	private completeTurn(session: LiveSession, source: TurnEndSignal): void {
		const turn = this.turns.get(session.key)
		if (!turn) return
		const finalText = turn.assistantText
		this.turns.delete(session.key)
		session.lastActivityAt = Date.now()
		session.logger.line({
			tier: 'verbose',
			severity: 'success',
			label: 'turn-end',
			message: `signal=${source.toLowerCase()}`,
		})
		session.emitter.current({ type: 'turn_completed', signal: source })
		session.logger.line({
			tier: 'info',
			severity: 'success',
			label: 'turn-done',
			message: `${finalText.length}ch via ${source.toLowerCase()}`,
		})
		turn.resolve(finalText)
	}

	/**
	 * Write a prompt to the PTY and await turn completion. Installs a TurnHandle the detectors
	 * consume; rejects on `timeoutMs`.
	 *
	 * `submitMode`:
	 * - `single` (default): one `\r` at `submitDelayMs()`. Used for regular turns.
	 * - `multi-shot`: ESC+\r fired at multiple offsets to defeat TUI overlays that intercept the
	 *   submit during a fresh spawn. Priming turn only.
	 */
	private runTurn(
		session: LiveSession,
		prompt: string,
		timeoutMs: number = MAX_TURN_MS,
		submitMode: 'single' | 'multi-shot' = 'single',
	): Promise<string> {
		session.parser?.armForSubmit() // pre-warmed sessions have no parser
		const flat = flattenPrompt(prompt)
		const delayMs = submitDelayMs()
		return new Promise<string>((resolve, reject) => {
			const timeout = setTimeout(() => {
				if (this.turns.get(session.key) === handle) {
					this.turns.delete(session.key)
					reject(new Error(`claude turn did not produce a turn_duration record within ${timeoutMs}ms`))
				}
			}, timeoutMs)
			timeout.unref?.()
			const handle: TurnHandle = {
				assistantText: '',
				responseObserved: false,
				resolve: text => {
					clearTimeout(timeout)
					clearTimeout(verifyT)
					resolve(text)
				},
				reject: err => {
					clearTimeout(timeout)
					clearTimeout(verifyT)
					reject(err)
				},
			}
			this.turns.set(session.key, handle)
			// Submit verification: if we don't see RESPONSE_START within SUBMIT_VERIFICATION_MS,
			// fire ONE fallback ESC+\r.
			const verifyT = setTimeout(() => {
				if (this.turns.get(session.key) !== handle) return
				if (handle.responseObserved) return
				session.logger.line({
					tier: 'info',
					severity: 'warn',
					label: 'submit-retry',
					message: `no ⏺ within ${SUBMIT_VERIFICATION_MS}ms — firing one fallback ESC+\\r`,
				})
				try {
					session.pty.write('\x1b')
					session.pty.write('\r')
				} catch {}
			}, SUBMIT_VERIFICATION_MS)
			verifyT.unref?.()
			try {
				session.logger.line({
					tier: 'info',
					severity: 'info',
					glyph: '▶',
					label: 'turn',
					message: `"${flat.slice(0, 60).replace(/\n/g, ' ')}${flat.length > 60 ? '...' : ''}" (${flat.length}ch)`,
				})
				if (delayMs > 0) {
					// claude's TUI enables bracketed paste mode (\x1b[?2004h) at startup. Plain
					// `flat + \r` lands as typed characters + an in-box newline — NOT a submit. We
					// wrap the text in bracketed paste markers, then send Enter to submit.
					const ESC = '\x1b'
					session.pty.write(BRACKET_START + flat + BRACKET_END)
					const offsets = submitMode === 'multi-shot' ? [delayMs, ...SUBMIT_RETRY_OFFSETS_MS.map(o => delayMs + o)] : [delayMs]
					for (const offsetMs of offsets) {
						const t = setTimeout(() => {
							try {
								if (submitMode === 'multi-shot') session.pty.write(ESC)
								session.pty.write('\r')
							} catch {}
						}, offsetMs)
						t.unref?.()
					}
				} else {
					// Test/fast path: one combined write. Lets mocks that respond per-`write()`
					// emit exactly one response.
					session.pty.write(`${flat}\r`)
				}
			} catch (err) {
				if (this.turns.get(session.key) === handle) {
					this.turns.delete(session.key)
				}
				clearTimeout(timeout)
				clearTimeout(verifyT)
				reject(err instanceof Error ? err : new Error(String(err)))
			}
		})
	}

	/**
	 * Spawn the claude PTY for an issue. Retries once on a silent / wedged claude (priming-turn
	 * timeout, JSONL never written) — killing the stuck PTY usually frees the background
	 * cc-daemon's spare slot. Hard failures (BootExitError: binary missing, auth, bad cwd) do NOT
	 * retry.
	 */
	private async spawnSession(
		request: TerminalLLMRunnerStreamRequest,
		initialEmit: (ev: TerminalRuntimeEvent) => void,
	): Promise<LiveSession> {
		const MAX_ATTEMPTS = 2
		const scopedLogger = this.logger.scope(sessionBadge(request.issueId))
		let lastErr: Error | undefined
		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			try {
				return await this.attemptSpawn(request, initialEmit, scopedLogger)
			} catch (err) {
				lastErr = err instanceof Error ? err : new Error(String(err))
				// Hard failures don't benefit from retry — surface immediately.
				if (err instanceof BootExitError) throw lastErr
				if (attempt < MAX_ATTEMPTS) {
					scopedLogger.line({
						tier: 'info',
						severity: 'warn',
						label: 'retry',
						message: `attempt ${attempt} failed (${lastErr.message.slice(0, 80)}) — respawning`,
					})
					// Brief breath so the daemon's spare-slot machinery can settle.
					await sleep(500)
				}
			}
		}
		throw lastErr ?? new Error('spawnSession failed without a recorded error')
	}

	/**
	 * Focused parameter shape for `bootAndConstructSession` — `prewarm` doesn't have a full stream
	 * request and shouldn't have to construct fake fields.
	 */
	private async bootAndConstructSession(args: {
		issueId: string
		cwd: string
		systemPrompt?: string
		binaryPath?: string
		initialEmit: (ev: TerminalRuntimeEvent) => void
		sectionLogger: RunnerLogger
		// Invoked by the JSONL tail for every parsed record.
		recordFwd: (session: LiveSession, record: Record<string, unknown>) => void
	}): Promise<LiveSession> {
		const k = args.issueId
		const emitter: SessionEmitter = { current: args.initialEmit }
		const sessionId = randomUUID()
		const terminalSessionId = sessionId
		const transcriptPath = sessionFilePath(args.cwd, sessionId)
		// Pre-create the per-cwd project dir so claude doesn't race against us when it tries to
		// create the JSONL file.
		mkdirSync(dirname(transcriptPath), { recursive: true })

		const pty = spawnClaude({
			issueId: args.issueId,
			cwd: args.cwd,
			systemPrompt: args.systemPrompt,
			sessionId,
			binaryPath: args.binaryPath,
		})

		const spawnSection = args.sectionLogger.section('spawn')
		spawnSection.field('cwd', args.cwd)
		spawnSection.field('sessionId', sessionId)
		try {
			const boot = new ClaudeBootSequence({ pty, logger: args.sectionLogger, settleMs: bootSettleMs() })
			const bootResult = await boot.run()
			spawnSection.success('boot', `${bootResult.bootBytes}b${bootResult.trustHandled ? ' · trust ack' : ''}`)
			spawnSection.success('transcript', transcriptPath)
		} catch (err) {
			// BootSilentError ⇒ even with the adaptive wait, claude wrote 0 bytes. Almost always
			// means the cc-daemon's spare-slot is wedged; the retry wrapper respawns.
			if (err instanceof BootSilentError) {
				spawnSection.warn('boot-silent', `${err.message} — retry wrapper will respawn`)
			} else {
				spawnSection.warn('boot-failed', err instanceof Error ? err.message : String(err))
			}
			spawnSection.close()
			try {
				pty.kill()
			} catch {}
			if (err instanceof BootExitError) throw err
			throw err
		}
		spawnSection.close()

		const startOffset = existsSync(transcriptPath) ? statSync(transcriptPath).size : 0
		const abortController = new AbortController()
		const tail: TranscriptTail = {
			sessionId,
			transcriptPath,
			stop: async () => {
				abortController.abort()
			},
		}
		const session: LiveSession = {
			key: k,
			issueId: args.issueId,
			terminalSessionId,
			cwd: args.cwd,
			pty,
			tail,
			queue: createWriteQueue(k, DEFAULT_QUEUE_DEPTH),
			lastActivityAt: Date.now(),
			logger: args.sectionLogger,
			traceSubs: [],
			// Helper sets `primed: true` to match `attemptSpawn`'s contract (priming turn runs
			// after this returns). `prewarm` flips to `false` since no priming turn ran.
			primed: true,
			emitter,
		}

		try {
			// Permanent session-life pty.onData consumer. MUST be attached even when we're not
			// logging — without a consumer the kernel pipe buffer fills (~64KB), claude's stdout
			// writes block, and the JSONL turn_duration record never lands.
			//
			// DUAL ROLE in codedm: (a) dev-console preview at info tier, (b) the TRANSPORT feed —
			// each ANSI-stripped non-empty line is forwarded to the bound stream as an `output`
			// runtime event, which the use case fans to the SSE terminal panel.
			let lineBuf = ''
			session.traceSubs.push(
				pty.onData((data: string) => {
					if (LOG_TIER_RANK[this.logger.tier] >= LOG_TIER_RANK.info) {
						const plain = stripAnsi(data).replace(/\r/g, '')
						const preview =
							plain.trim().length > 0
								? `"${plain.slice(0, 120).replace(/\n/g, ' ')}${plain.length > 120 ? '...' : ''}" (${data.length}b)`
								: `<${data.length}b control codes>`
						args.sectionLogger.line({ tier: 'info', severity: 'trace', label: 'pty-data', message: preview })
					}
					// TRANSPORT: line-buffer the stripped PTY stream into output events.
					lineBuf += stripAnsi(data)
					const parts = lineBuf.split('\n')
					lineBuf = parts.pop() ?? ''
					for (const raw of parts) {
						const line = raw.trimEnd()
						if (line.trim().length === 0) continue
						try {
							session.emitter.current({ type: 'output', line: { at: new Date().toISOString(), line, stream: 'stdout' } })
						} catch {}
					}
				}),
			)

			// Start consuming the tail in the background. Each record flows through `recordFwd`
			// which dispatches to the current emitter and resolves any in-flight TurnHandle on
			// turn_duration.
			void (async () => {
				try {
					for await (const { record } of tailJsonl({
						path: transcriptPath,
						startOffset,
						signal: abortController.signal,
						pollMs: filePollMs(),
					})) {
						args.recordFwd(session, record)
					}
				} catch (err) {
					if (abortController.signal.aborted) return
					// Tail failure (corrupt JSONL, oversized line) — fail any in-flight turn so the
					// caller sees a failure instead of a hang.
					const pendingTurn = this.turns.get(session.key)
					if (pendingTurn) {
						this.turns.delete(session.key)
						pendingTurn.reject(err instanceof Error ? err : new Error(String(err)))
					}
				}
			})()

			// Detect unexpected PTY exits (CLI crash, killed by OS, etc).
			pty.onExit(() => this.handleUnexpectedExit(session))

			// Remember the CLI session id for this issue (in-process resume identity).
			await this.store.set(args.issueId, sessionId)

			return session
		} catch (err) {
			// Failed mid-attempt: stop the tail, dispose every subscriber, kill the PTY.
			abortController.abort()
			for (const sub of session.traceSubs) {
				try {
					sub.dispose()
				} catch {}
			}
			session.traceSubs = []
			const turn = this.turns.get(session.key)
			if (turn) {
				this.turns.delete(session.key)
				turn.reject(err instanceof Error ? err : new Error(String(err)))
			}
			try {
				pty.kill()
			} catch {}
			throw err
		}
	}

	async prewarm(opts: { issueId: string; cwd: string; systemPrompt?: string; binaryPath?: string }): Promise<void> {
		// Fast no-op when the session is already in the map. Avoid even touching `getOrCreate` so
		// we don't accidentally serialize against an in-flight spawn a real `stream()` started.
		if (this.map.get(opts.issueId)) return

		const sectionLogger = this.logger.scope(sessionBadge(opts.issueId))
		await this.map.getOrCreate(opts.issueId, async () => {
			const session = await this.bootAndConstructSession({
				issueId: opts.issueId,
				cwd: opts.cwd,
				systemPrompt: opts.systemPrompt,
				binaryPath: opts.binaryPath,
				// No stream is bound at pre-warm time. `stream()` rebinds `session.emitter.current`
				// on its first invocation; anything emitted before rebind lands here and is dropped
				// — correct: pre-warm is invisible to the user.
				initialEmit: () => {},
				sectionLogger,
				recordFwd: (s, record) => this.onTranscriptRecord(s, record),
			})
			// Helper sets `primed: true` to match attemptSpawn's contract. We didn't run a priming
			// turn, so flip back to false — the next `stream()` call must enter the queue path.
			session.primed = false
			return session
		})
	}

	/**
	 * Single spawn attempt: pty → boot → tail → priming turn. Cleans up its own pty/tail/subs on
	 * any failure path so the retry wrapper doesn't leak between attempts.
	 */
	private async attemptSpawn(
		request: TerminalLLMRunnerStreamRequest,
		initialEmit: (ev: TerminalRuntimeEvent) => void,
		sectionLogger: RunnerLogger,
	): Promise<LiveSession> {
		const session = await this.bootAndConstructSession({
			issueId: request.issueId,
			cwd: request.cwd,
			systemPrompt: request.systemPrompt,
			binaryPath: request.binaryPath,
			initialEmit,
			sectionLogger,
			recordFwd: (s, record) => this.onTranscriptRecord(s, record),
		})

		try {
			// Emit the spawn event ONLY for stream-driven spawns. Pre-warm deliberately suppresses
			// this so the UI doesn't surface "session spawned" without a corresponding inbound.
			session.emitter.current({
				type: 'session',
				lifecycle: 'spawned',
				terminalSessionId: session.terminalSessionId,
				cwd: request.cwd,
			})

			// TUI parser — single classifier feeding BOTH the observability channel (action events)
			// and the reliability-signal channel (submit verification + two turn-end detectors).
			// Attached here (after the helper returns) so callbacks close over `session`. `prewarm`
			// doesn't attach the parser — `LiveSession.parser` is optional and all access uses
			// `session.parser?.…`, so pre-warmed sessions fall back to JSONL turn-end detection.
			session.parser = new TuiActionParser({
				onAction: ev => this.onTuiAction(session, ev),
				onMarker: m => this.onTuiMarker(session, m),
				onPasteWarn: msg =>
					session.logger.line({
						tier: 'verbose',
						severity: 'warn',
						label: 'paste-pending',
						message: msg,
					}),
			})
			session.traceSubs.push(session.pty.onData(d => session.parser?.feed(d)))

			// Run the priming turn against the live REPL with the tighter PRIMING_TURN_MS budget
			// and the 'multi-shot' submit mode so TUI overlays don't intercept the submit.
			await this.runTurn(session, renderContext(request.context) + request.prompt, PRIMING_TURN_MS, 'multi-shot')

			return session
		} catch (err) {
			// Mid-attempt failure: dispose subs + reject any in-flight turn handle + kill the pty.
			void session.tail.stop()
			for (const sub of session.traceSubs) {
				try {
					sub.dispose()
				} catch {}
			}
			session.traceSubs = []
			const turn = this.turns.get(session.key)
			if (turn) {
				this.turns.delete(session.key)
				turn.reject(err instanceof Error ? err : new Error(String(err)))
			}
			try {
				session.pty.kill()
			} catch {}
			throw err
		}
	}
}
