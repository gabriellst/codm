import type { PtyHandle } from './spawner'
import { stripAnsi, shouldAutoAcceptTrustPrompt, isMainUiReady } from './ansi'
import type { RunnerLogger } from './logger/RunnerLogger'

export class BootExitError extends Error {
	override readonly name = 'BootExitError'
	constructor(
		readonly exitCode: number,
		readonly lastOutput: string,
	) {
		super(`claude CLI exited during boot (exit code ${exitCode}). Last stdout: ${lastOutput || '(no output)'}`)
	}
}

interface BootSequenceOpts {
	pty: Pick<PtyHandle, 'write' | 'onData' | 'onExit'>
	logger: RunnerLogger
	/**
	 * Minimum settle window. If claude has emitted any bytes by this point we proceed immediately.
	 * If it hasn't, we keep waiting (up to `maxSettleMs`) for the first byte — sending the priming
	 * prompt into a still-initializing REPL is what causes the "prompt echoed back but never
	 * submitted" hang.
	 */
	settleMs: number
	/**
	 * Hard upper bound on the boot wait. Defaults to `settleMs * 6`.
	 */
	maxSettleMs?: number
}

export class BootSilentError extends Error {
	override readonly name = 'BootSilentError'
	constructor(readonly elapsedMs: number) {
		super(`claude wrote 0 bytes during ${elapsedMs}ms boot wait — cc-daemon spare-slot is likely wedged. Kill PTY + retry.`)
	}
}

export interface BootResult {
	bootBytes: number
	trustHandled: boolean
}

/**
 * Owns the spawn → settle handshake for the `claude` CLI. One boot-scoped `pty.onData`
 * subscription multiplexes internally to:
 *
 *   - trust-scanner: sniffs for the trust banner (whitespace-squashed matching per the D2 spike —
 *     see ansi.ts), writes `\r` once (accepts the highlighted "Yes, I trust" default), then stops.
 *   - boot-buffer: rolling 4KB tail for crash diagnostics.
 *   - byte-watch: signals the settle Promise as soon as the first byte arrives.
 *
 * Adaptive settle: wait min `settleMs`. If still 0 bytes, keep waiting up to `maxSettleMs` for
 * the first byte. Past that we abandon the attempt — the priming prompt would be doomed against a
 * not-yet-initialized REPL, and the runner's retry-once wrapper recovers much faster from a
 * respawn than from a 60s priming timeout.
 *
 * Rejects with:
 *   - `BootExitError` if the PTY exits during the settle window.
 *   - `BootSilentError` if no bytes arrive by `maxSettleMs`.
 */
export class ClaudeBootSequence {
	private readonly pty: BootSequenceOpts['pty']
	private readonly logger: RunnerLogger
	private readonly settleMs: number
	private readonly maxSettleMs: number

	constructor(opts: BootSequenceOpts) {
		this.pty = opts.pty
		this.logger = opts.logger
		this.settleMs = opts.settleMs
		this.maxSettleMs = opts.maxSettleMs ?? opts.settleMs * 6
	}

	async run(): Promise<BootResult> {
		const subs: Array<{ dispose(): void }> = []
		let bootBuf = ''
		let trustHandled = false
		let uiReady = false
		let firstByteResolve: (() => void) | null = null
		const firstByte = new Promise<void>(resolve => {
			firstByteResolve = resolve
		})
		let uiReadyResolve: (() => void) | null = null
		const uiReadySeen = new Promise<void>(resolve => {
			uiReadyResolve = resolve
		})

		const dataSub = this.pty.onData((data: string) => {
			if (bootBuf.length === 0 && data.length > 0 && firstByteResolve) {
				firstByteResolve()
				firstByteResolve = null
			}
			bootBuf = (bootBuf + data).slice(-4096)
			const window = stripAnsi(bootBuf).slice(-2048)
			if (!trustHandled) {
				if (shouldAutoAcceptTrustPrompt(window)) {
					trustHandled = true
					try {
						this.pty.write('\r')
					} catch {}
					this.logger.line({
						tier: 'info',
						severity: 'success',
						label: 'trust',
						message: 'auto-accepted trust banner',
					})
				}
			}
			// Main-TUI readiness (Step-5 smoke finding): writing the priming paste before the input
			// box is up loses the turn. Resolve the marker promise the moment the UI shows.
			if (!uiReady && isMainUiReady(window)) {
				uiReady = true
				uiReadyResolve?.()
				uiReadyResolve = null
			}
		})
		subs.push(dataSub)

		const cleanup = () => {
			for (const s of subs) {
				try {
					s.dispose()
				} catch {}
			}
		}

		try {
			await new Promise<void>((resolve, reject) => {
				const exitSub = this.pty.onExit(e => {
					exitSub.dispose()
					const plain = stripAnsi(bootBuf).replace(/\s+/g, ' ').trim().slice(-800)
					reject(new BootExitError(e.exitCode, plain))
				})
				subs.push(exitSub)
				// Phase A: minimum settle window. Even if claude is fast we give the trust banner a
				// chance to render before proceeding.
				const minT = setTimeout(() => {
					if (bootBuf.length > 0) {
						// Bytes are flowing. Prefer to hand over only once the main TUI is up —
						// wait for the marker up to maxSettleMs, falling back to a time-based
						// handover (marker wording drifts across claude releases; the fake-PTY
						// suites never print it).
						if (uiReady) {
							resolve()
							return
						}
						const uiDeadline = setTimeout(() => resolve(), Math.max(0, this.maxSettleMs - this.settleMs))
						;(uiDeadline as { unref?: () => void }).unref?.()
						void uiReadySeen.then(() => {
							clearTimeout(uiDeadline)
							resolve()
						})
						return
					}
					this.logger.line({
						tier: 'info',
						severity: 'warn',
						label: 'boot-wait',
						message: `no bytes yet at ${this.settleMs}ms — extending wait up to ${this.maxSettleMs}ms`,
					})
					// Phase B: grace window. Either the first byte arrives, or we time out and
					// reject silent.
					const graceMs = this.maxSettleMs - this.settleMs
					const graceT = setTimeout(() => {
						if (bootBuf.length === 0) {
							reject(new BootSilentError(this.maxSettleMs))
						} else {
							resolve()
						}
					}, graceMs)
					;(graceT as { unref?: () => void }).unref?.()
					void firstByte.then(() => {
						clearTimeout(graceT)
						// Once we see the first byte, give claude a small extra moment to render
						// past the banner before we claim "ready".
						const settleT = setTimeout(() => resolve(), 500)
						;(settleT as { unref?: () => void }).unref?.()
					})
				}, this.settleMs)
				;(minT as { unref?: () => void }).unref?.()
			})
		} catch (err) {
			cleanup()
			throw err
		}
		cleanup()
		return { bootBytes: bootBuf.length, trustHandled }
	}
}
