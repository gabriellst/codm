import { spawn as spawnChild } from 'node:child_process'
import { BaseError } from '@codedm/core-typescript'
import type { TerminalApplicationErrors } from '../../../errors'

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

/**
 * The real spawner: plain pipes, no PTY.
 *
 * `detached: true` gives the child its own process group so `kill()` can take down the whole tree —
 * a provider CLI spawns children of its own (hooks, MCP servers), and killing only the parent leaks
 * them. This is also what makes the watchdog's kill actually a kill.
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
		throw new BaseError<TerminalApplicationErrors>('TERMINAL_SPAWN_FAILED', `failed to spawn ${bin}: ${String(cause)}`)
	}

	// Node reports spawn failures (ENOENT) ASYNCHRONOUSLY on 'error', not by throwing above. Attaching
	// a no-op immediately guarantees the event is never unhandled — an unhandled 'error' takes the
	// whole daemon down — even before `exited` below attaches its own listener.
	let spawnError: Error | null = null
	child.once('error', cause => {
		spawnError = cause
	})

	const exited = new Promise<number>((resolve, reject) => {
		child.once('error', cause => reject(new BaseError<TerminalApplicationErrors>('TERMINAL_SPAWN_FAILED', `failed to spawn ${bin}: ${String(cause)}`)))
		child.once('close', code => resolve(code ?? 0))
	})

	const empty = (async function* () {})()

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
			try {
				// Negative pid = the process GROUP, available because of `detached: true`.
				if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
			} catch {
				// Already gone, or never started — either way there is nothing left to kill.
				child.kill('SIGKILL')
			}
		},
		exited,
	}
}
