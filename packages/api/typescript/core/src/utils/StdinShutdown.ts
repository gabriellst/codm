import type { Readable } from 'node:stream'

import { PARENT_PID_ENV } from './Watchdog'

/**
 * SHELL→DAEMON STDIN CHANNEL — the shutdown sentinel the desktop shell writes to this process's
 * stdin on the GRACEFUL step of its own shutdown escalation, on EVERY platform
 * (`src-tauri/src/sidecars/lifecycle.rs`, `Supervised::terminate`). POSIX still gets SIGTERM too —
 * the sentinel is belt-and-suspenders there. On Windows `send_sigterm` is a documented no-op (no
 * signal exists for a console-less child) and this stdin line is the ONLY announcement the shell can
 * make before its `force_kill` (`CommandChild::kill` = `TerminateProcess`) — a hard kill that skips
 * every listener, taking the whole drain (outbox, mediator, every provider CLI process tree —
 * `AgentProcess.ts`) with it.
 *
 * Naming mirrors `Watchdog.ts`: both are the daemon's reaction to a fact the SHELL, not the daemon,
 * observes first. `Watchdog` answers "did my supervisor disappear?" by polling; this answers "did my
 * supervisor ASK me to stop?" by listening. Same drain either way — see `src/index.ts`.
 *
 * MIRROR of `src-tauri/src/sidecars/lifecycle.rs` `SHUTDOWN_SENTINEL` — TS cannot import that file,
 * so this names it as the other half of the pair, against drift. Same seam rule as `config/updater.ts`
 * mirroring `updater.rs`. The Rust constant carries a trailing `\n` (it writes straight into the raw
 * byte stream and the newline is what makes it one line); this one does not, because it is compared
 * against an already-line-split string — see `isShutdownSentinelLine`.
 */
export const SHUTDOWN_SENTINEL_LINE = 'supervisor:shutdown'

/**
 * PURE — is this line (already split on '\n') the shutdown sentinel? Trimmed so a trailing '\r'
 * survives if the shell's pipe ever delivers CRLF — the daemon does not need to care which the OS
 * used.
 */
export function isShutdownSentinelLine(line: string): boolean {
	return line.trim() === SHUTDOWN_SENTINEL_LINE
}

export interface StdinShutdownOptions {
	/** Defaults to `process.stdin`. Injectable so tests never touch the real stream. */
	readonly stdin?: Readable
	/**
	 * Defaults to `Boolean(process.env.CODM_PARENT_PID)` — armed only under a supervising shell, so a
	 * human's keyboard in a dev terminal is never mistaken for a shutdown request.
	 */
	readonly enabled?: boolean
	/**
	 * THE DRAIN — the SAME `shutdown()` the signal handlers and the parent watchdog call. Required:
	 * there is no default reaction, because there is no safe one — see `Watchdog.ts`'s `onOrphaned`.
	 */
	readonly onShutdown: () => void
}

/**
 * Arm the stdin listener. A no-op when `enabled` resolves to `false` (the default check), which is
 * what keeps `bun dev`, tests and the e2e harness untouched — none of them are supervised by a
 * desktop shell.
 *
 * ONE trigger: a matched sentinel LINE. EOF on stdin is deliberately NOT a shutdown order — it is
 * redundant with two mechanisms that already cover "the supervisor is gone" without this one's
 * footgun: `startParentWatchdog` (polls liveness) and SIGTERM on POSIX. The footgun: ANY supervisor
 * that sets `CODM_PARENT_PID` (arming this listener) without keeping a live stdin pipe open to the
 * child — CI, a service manager, a dev/smoke script that mirrors the shell's env but spawns without
 * `stdin: 'pipe'` — hands the child a stdin that reads EOF immediately, so treating EOF as "stop"
 * shut the daemon down before it ever answered health. On EOF this just releases the listeners
 * (`release()`) and does nothing else; there is no path from EOF to `onShutdown`.
 *
 * Fires `onShutdown` AT MOST ONCE — a second sentinel is silently ignored here; `shutdown()` itself
 * (`src/index.ts`) carries its own `isShuttingDown` guard, so a sentinel racing a SIGTERM is safe at
 * two independent layers, not just one.
 */
export function armStdinShutdown(options: StdinShutdownOptions): void {
	const enabled = options.enabled ?? Boolean(process.env[PARENT_PID_ENV])
	if (!enabled) return

	const stdin = options.stdin ?? process.stdin
	let fired = false
	let buffered = ''

	const release = (): void => {
		stdin.off('data', onData)
		stdin.off('end', release)
	}

	const onData = (chunk: string | Buffer): void => {
		buffered += chunk.toString()
		const lines = buffered.split('\n')
		buffered = lines.pop() ?? ''
		for (const line of lines) {
			if (isShutdownSentinelLine(line)) {
				fire()
				return
			}
		}
	}

	const fire = (): void => {
		if (fired) return
		fired = true
		release()
		options.onShutdown()
	}

	stdin.setEncoding('utf8')
	stdin.on('data', onData)
	stdin.on('end', release)
}
