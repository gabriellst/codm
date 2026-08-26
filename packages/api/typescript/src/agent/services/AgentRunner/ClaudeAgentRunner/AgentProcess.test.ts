import { describe, expect, it } from 'bun:test'
import { posixProcessTree, type ProcessTree, type TreeRoot } from '@codm/core-typescript'
import { createNodeAgentProcessSpawner, type AgentProcess } from './AgentProcess'

/**
 * `nodeAgentProcessSpawner` is `createNodeAgentProcessSpawner(PROCESS_TREES[process.platform])`.
 * This suite proves the spawner actually CONSUMES the strategy it was built with — both halves:
 * `spawnOptions` reach `spawn()`, and `kill()` delegates to `terminate()` exactly once with the
 * production grace window. Spawning `/bin/sh` here does not contradict §8 rule 8 (no test spawns a
 * PROVIDER CLI): whether a child became a group leader is an OS fact a fake process cannot show.
 *
 * Both cases spawn `/bin/sh` and probe POSIX process groups — meaningless on a Windows host, hence
 * the `skipIf`. The Windows half of the strategy is already proven host-agnostic in
 * `ProcessTree.test.ts` via the injected exec fake.
 */

const KILL_GRACE_MS = 2_000

function alive(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

/** Does a process GROUP with this id exist? `kill(-pid, 0)` probes the group without signalling it. */
function groupExists(pid: number): boolean {
	try {
		process.kill(-pid, 0)
		return true
	} catch {
		return false
	}
}

async function readFirstLine(proc: AgentProcess): Promise<string> {
	let buffer = ''
	for await (const chunk of proc.stdout) {
		buffer += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
		const newline = buffer.indexOf('\n')
		if (newline >= 0) return buffer.slice(0, newline)
	}
	throw new Error(`process never printed a line; got ${JSON.stringify(buffer)}`)
}

// `exec` replaces the sh with the sleep in the SAME pid: no grandchild inherits the stdout pipe, so
// a fake strategy's direct SIGKILL kills the only process and lets 'close' fire (`exited` resolves
// instead of hanging on a pipe a grandchild still holds). The child+grandchild sweep is
// cancellation.test.ts's property, not this suite's.
const ANNOUNCE_PID_THEN_BLOCK = ['/bin/sh', '-c', 'echo $$; exec sleep 300']

describe('createNodeAgentProcessSpawner — consumes the ProcessTree strategy', () => {
	describe.skipIf(process.platform === 'win32')(
		'spawns with the strategy’s options and hands kill() to terminate() ONCE, with the production grace window',
		() => {
			it('spawns with the strategy’s options and hands kill() to terminate() ONCE, with the production grace window', async () => {
				const calls: { pid: number | undefined; graceMs: number }[] = []
				const tree: ProcessTree = {
					spawnOptions: { detached: false },
					terminate(child: TreeRoot, _exited, graceMs) {
						calls.push({ pid: child.pid, graceMs })
						child.kill('SIGKILL')
					},
				}
				const proc = createNodeAgentProcessSpawner(tree)({ cmd: ANNOUNCE_PID_THEN_BLOCK, cwd: process.cwd(), stdin: false })

				const pid = Number(await readFirstLine(proc))
				expect(alive(pid)).toBe(true)
				// `detached: false` reached `spawn()`: the child shares OUR group, so no group carries its pid.
				// That is the observable difference between the two strategies' spawn options.
				expect(groupExists(pid)).toBe(false)

				proc.kill()
				proc.kill() // idempotent — the second call must not reach the strategy
				expect(calls).toEqual([{ pid, graceMs: KILL_GRACE_MS }])

				await proc.exited
				expect(alive(pid)).toBe(false)
			})
		},
	)

	describe.skipIf(process.platform === 'win32')(
		'with the POSIX strategy the child leads its own process group (today’s behaviour, kept byte-for-byte)',
		() => {
			it('with the POSIX strategy the child leads its own process group (today’s behaviour, kept byte-for-byte)', async () => {
				const proc = createNodeAgentProcessSpawner(posixProcessTree)({ cmd: ANNOUNCE_PID_THEN_BLOCK, cwd: process.cwd(), stdin: false })

				const pid = Number(await readFirstLine(proc))
				expect(groupExists(pid)).toBe(true)

				proc.kill()
				await proc.exited
				expect(alive(pid)).toBe(false)
			})
		},
	)
})
