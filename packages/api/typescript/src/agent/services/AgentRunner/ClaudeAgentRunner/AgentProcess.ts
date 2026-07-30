import { spawn as spawnChild } from 'node:child_process'
import { BaseError } from '@codm/core-typescript'
import type { AgentApplicationErrors } from '../../../errors'

export interface AgentProcessSpec {
	cmd: readonly string[]
	cwd: string
	/** Whether stdin stays open for writes. `false` when the prompt rode in on argv. */
	stdin: boolean
}

/**
 * A running provider CLI, reduced to the four things the runner actually does with one.
 *
 * This interface is the ENTIRE reason the runner is testable. §8 rule 8 forbids any test from
 * spawning a real CLI, so the process is a port: production passes `nodeAgentProcessSpawner`, tests
 * pass a fake that replays canned bytes. The codec next door stays pure because the only file in the
 * transport that knows `child_process` exists is this one.
 */
export interface AgentProcess {
	/** Raw stdout chunks. The runner never assumes a chunk is a line. */
	stdout: AsyncIterable<Uint8Array | string>
	/** Raw stderr chunks — diagnostics only; never parsed as frames. */
	stderr: AsyncIterable<Uint8Array | string>
	write(chunk: string): void
	/** Close stdin. THE act that ends a turn (measured: holding it open kept the child alive 17358ms). */
	endStdin(): void
	/** Terminate the process GROUP, so a CLI's own children die with it. */
	kill(): void
	exited: Promise<number>
}

export type AgentProcessSpawner = (spec: AgentProcessSpec) => AgentProcess

/** How long a killed process group gets to exit on SIGTERM before SIGKILL follows (§4.11). */
const KILL_GRACE_MS = 2_000

/**
 * The real spawner: plain pipes, no PTY.
 *
 * `detached: true` gives the child its own process group so `kill()` can take down the whole tree —
 * a provider CLI spawns children of its own (hooks, MCP servers), and killing only the parent leaks
 * them. This is also what makes the watchdog's kill actually a kill.
 *
 * `kill()` is GRACEFUL-THEN-FORCED, and the order matters for the same reason the group does: SIGTERM
 * to the GROUP first, so the CLI gets a chance to tear down the children it spawned itself, then
 * SIGKILL to the group after a grace window for the case where it does not. Going straight to SIGKILL
 * denies every descendant that chance — exactly the leak the group kill exists to prevent. The
 * escalation timer is `unref`'d: a pending kill must never be the reason a process (or a test runner)
 * stays alive.
 */
export const nodeAgentProcessSpawner: AgentProcessSpawner = spec => {
	const [bin, ...args] = spec.cmd
	let child: ReturnType<typeof spawnChild>
	try {
		child = spawnChild(bin as string, args, {
			cwd: spec.cwd,
			stdio: [spec.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
			detached: true,
		})
	} catch (cause) {
		throw new BaseError<AgentApplicationErrors>('TERMINAL_SPAWN_FAILED', `failed to spawn ${bin}: ${String(cause)}`)
	}

	// Node reports spawn failures (ENOENT) ASYNCHRONOUSLY on 'error', not by throwing above. Attaching
	// a no-op immediately guarantees the event is never unhandled — an unhandled 'error' takes the
	// whole daemon down — even before `exited` below attaches its own listener.
	let spawnError: Error | null = null
	child.once('error', cause => {
		spawnError = cause
	})

	const exited = new Promise<number>((resolve, reject) => {
		child.once('error', cause =>
			reject(new BaseError<AgentApplicationErrors>('TERMINAL_SPAWN_FAILED', `failed to spawn ${bin}: ${String(cause)}`)),
		)
		child.once('close', code => resolve(code ?? 0))
	})

	const empty = (async function* () {})()

	let killed = false
	/**
	 * Signal the whole process GROUP. Returns whether the group still existed — a `false` means there
	 * is nothing left to escalate to, which is why the caller stops rather than arming a timer.
	 */
	const signalGroup = (signal: 'SIGTERM' | 'SIGKILL'): boolean => {
		if (child.pid === undefined) return false
		try {
			process.kill(-child.pid, signal)
			return true
		} catch {
			// ESRCH (already reaped) or EPERM (never became a group leader): fall back to the direct
			// child, which is the only pid we can still name.
			child.kill(signal)
			return false
		}
	}

	return {
		stdout: child.stdout ?? empty,
		stderr: child.stderr ?? empty,
		write(chunk) {
			if (spawnError) return
			child.stdin?.write(chunk)
		},
		endStdin() {
			child.stdin?.end()
		},
		kill() {
			if (killed) return
			killed = true
			// Negative pid = the process GROUP, available because of `detached: true`.
			if (!signalGroup('SIGTERM')) return
			const escalation = setTimeout(() => signalGroup('SIGKILL'), KILL_GRACE_MS)
			escalation.unref?.()
			// A group that exits on SIGTERM must not keep a live timer around for the grace window.
			void exited.then(
				() => clearTimeout(escalation),
				() => clearTimeout(escalation),
			)
		},
		exited,
	}
}
