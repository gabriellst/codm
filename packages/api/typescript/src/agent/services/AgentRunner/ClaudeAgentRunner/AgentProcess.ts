import { spawn as spawnChild } from 'node:child_process'
import { resolveInvocation } from '../platformInvocation'
import { BaseError, PROCESS_TREES, type ProcessTree } from '@codm/core-typescript'
import type { AgentApplicationErrors } from '../../../errors'

export interface AgentProcessSpec {
	cmd: readonly string[]
	cwd: string
	/** Per-run environment additions. Callers pass a complete merged environment. */
	env?: NodeJS.ProcessEnv
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
	/**
	 * Resolves when THE PROCESS dies — not when its pipes close, and the distinction is a measured bug
	 * rather than a nicety.
	 *
	 * Node's `'close'` fires only once the child has exited AND every stdio stream it was given is
	 * closed. A CLI that leaves a grandchild holding the inherited stdout/stderr pipe therefore keeps
	 * `'close'` pending FOREVER after its own death — and the runner awaits this promise (and the
	 * stderr drain) after the read loop, so the turn's promise never settled, so the mailbox heartbeat
	 * next door kept renewing the lease of a turn whose process had been gone for half an hour
	 * (27/08). `'exit'` is the honest signal: it fires when the pid is gone, which is exactly the
	 * question every caller here is asking.
	 */
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
		// COMO invocar é decisão da plataforma, não deste arquivo — ver `resolveInvocation`. No Windows
		// o binário do provedor costuma ser um `.cmd` do npm, que `spawn` recusa executar direto
		// (EINVAL); fora dali isto é a identidade.
		const invocation = resolveInvocation(bin as string, args)
		let child: ReturnType<typeof spawnChild>
		try {
			child = spawnChild(invocation.file, invocation.args, {
				cwd: spec.cwd,
				env: spec.env,
				stdio: [spec.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
				...invocation.options,
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
			// `'exit'`, NOT `'close'` — the pid is what we are waiting on. See the interface docblock:
			// `'close'` additionally waits for every inherited pipe to shut, which a leaked grandchild
			// can hold open past our own death.
			child.once('exit', code => resolve(code ?? 0))
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
