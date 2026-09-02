import { spawn as spawnChild } from 'node:child_process'
import { resolveInvocation, resolveProviderEnv } from '../platformInvocation'
import { BaseError, PROCESS_TREES, type ProcessTree } from '@codm/core-typescript'
import type { AgentApplicationErrors } from '../../../errors'

export interface AgentProcessSpec {
	cmd: readonly string[]
	cwd: string
	/** Whether stdin stays open for writes. `false` when the prompt rode in on argv. */
	stdin: boolean
	/**
	 * Extra variables for the CHILD's environment, MERGED over the daemon's own.
	 *
	 * It exists because one carrier of the run token cannot be argv: codex's http MCP transport takes
	 * `bearer_token_env_var`, the NAME of a variable it reads the token from, so the value has to be
	 * in the environment of the CLI process itself — measured, `bearer_token` (a value) is rejected
	 * outright. That makes this the one path where the token never appears in `ps` output at all,
	 * which is strictly better than the argv carriers next to it and is why the seam grew a field
	 * rather than the runner growing a `process.env` mutation (global, racy across concurrent runs).
	 *
	 * LAYERED OVER `ChildEnvResolver`, never replacing it: these keys are added on top of the env the
	 * resolver builds, so a run's own variables cannot cost the child the PATH that lets its shebang
	 * find node. Absent is the normal case — most spawns need nothing beyond the resolved base.
	 */
	env?: Readonly<Record<string, string>>
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

/** O ambiente que UM spawn entrega ao filho, em função do binário invocado — seam para os testes
 * fixarem uma base mínima sem depender do env do host (produção usa `resolveProviderEnv`). */
export type ChildEnvResolver = (binary: string) => NodeJS.ProcessEnv

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
 * tree) — and so is the child-env resolver (tests fix a minimal base PATH; production binds
 * `resolveProviderEnv`). Production binds it once, below, by ONE lookup on `process.platform`.
 */
export function createNodeAgentProcessSpawner(tree: ProcessTree, resolveEnv: ChildEnvResolver = resolveProviderEnv): AgentProcessSpawner {
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
				stdio: [spec.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
				// TWO LAYERS, and the order is the contract. The base is ALWAYS built by `resolveEnv` —
				// never inherited, never conditional on the spec — because that is the whole point of the
				// resolver: a daemon launched from a `.app` bundle has a PATH with no node in it, and the
				// CLI's `#!/usr/bin/env node` shebang then dies with 127. `spec.env` layers the run's own
				// variables (today: the MCP run token for codex's http transport) OVER that base, so it
				// adds identity without discarding the PATH that makes the binary runnable at all.
				//
				// This spread used to be `spec.env ? {...process.env, ...spec.env} : {}`, which dropped
				// `resolveEnv` on the floor: it left the resolver with no call site at all, silently
				// reverting the `.app` fix on every spawn, and handed the raw daemon environment to the
				// one path that does set `spec.env`. `AgentProcess.test.ts`'s two PATH cases are the
				// regression guard — they pass NO `spec.env`, so they fail outright if the base is
				// conditional.
				env: { ...resolveEnv(bin as string), ...spec.env },
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
