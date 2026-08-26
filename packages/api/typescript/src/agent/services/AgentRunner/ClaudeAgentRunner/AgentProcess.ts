import { spawn as spawnChild } from 'node:child_process'
import { BaseError, PROCESS_TREES, type ProcessTree } from '@codm/core-typescript'
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
 * pass a fake that replays canned bytes. The codec next door stays pure because the only files in the
 * transport that know `child_process` exists are this one and `ProcessTree.ts`.
 */
export interface AgentProcess {
	/** Raw stdout chunks. The runner never assumes a chunk is a line. */
	stdout: AsyncIterable<Uint8Array | string>
	/** Raw stderr chunks — diagnostics only; never parsed as frames. */
	stderr: AsyncIterable<Uint8Array | string>
	write(chunk: string): void
	/** Close stdin. THE act that ends a turn (measured: holding it open kept the child alive 17358ms). */
	endStdin(): void
	/** Terminate the process TREE, so a CLI's own children die with it. */
	kill(): void
	exited: Promise<number>
}

export type AgentProcessSpawner = (spec: AgentProcessSpec) => AgentProcess

/** POSIX only: how long the terminated group gets on SIGTERM before SIGKILL follows (§4.11). The
 * Windows strategy ignores it — its single pass is already forced (D6). */
const KILL_GRACE_MS = 2_000

/**
 * The real spawner over a `ProcessTree` strategy: plain pipes, no PTY.
 *
 * WHAT makes the tree killable (`detached` on POSIX, nothing on Windows) and HOW it is killed
 * (graceful→forced group signals vs one forced `taskkill /T /F`) are the strategy's — this function
 * only spreads its `spawnOptions` into the spawn and hands `kill()` to its `terminate()`. `kill()`
 * is idempotent HERE, so a strategy never has to be.
 *
 * Exported as a FACTORY so the strategy is a parameter (tests pair a real `/bin/sh` with a fake
 * tree); production binds it once, below, by ONE lookup on `process.platform`.
 */
export function createNodeAgentProcessSpawner(tree: ProcessTree): AgentProcessSpawner {
	return spec => {
		const [bin, ...args] = spec.cmd
		let child: ReturnType<typeof spawnChild>
		try {
			child = spawnChild(bin as string, args, {
				cwd: spec.cwd,
				stdio: [spec.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
				...tree.spawnOptions,
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

		// Fallback for stdout/stderr when the child was spawned without a pipe — yields nothing.
		const empty = (async function* () {
			// no-op — deliberately empty, see comment above
		})()

		let killed = false

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
				tree.terminate(child, exited, KILL_GRACE_MS)
			},
			exited,
		}
	}
}

/** The production spawner — the host platform's strategy, resolved once by ONE lookup. */
export const nodeAgentProcessSpawner: AgentProcessSpawner = createNodeAgentProcessSpawner(PROCESS_TREES[process.platform])
