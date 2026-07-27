import { describe, expect, it } from 'bun:test'
import { LoggingService } from '@codedm/core-typescript'
import { AgentMessageRole, AgentName } from '../../../enums'
import { nodeAgentProcessSpawner, type AgentProcess } from './AgentProcess'
import { ClaudeAgentRunner } from './ClaudeAgentRunner'

/**
 * AC-3.3 — CANCELLATION KILLS THE WHOLE PROCESS GROUP, not just the direct child.
 *
 * The first case starts a real process, and doing so does NOT contradict §8 rule 8: that rule forbids
 * a test from spawning a PROVIDER CLI (which is why the DI env — not test discipline — is what keeps
 * `ClaudeAgentRunner` out of `mock`/`integration`). What is spawned here is `/bin/sh`, and
 * spawning it is the only way to observe the property under test: a fake process cannot demonstrate
 * that a GRANDCHILD died, because the grandchild is precisely the thing our code holds no handle to.
 * §4.11 is explicit that this is not hypothetical — the CLI's own MCP/tool subprocesses outlive the
 * direct child, and after the MCP inversion (D8) one of those children is a client of ours.
 *
 * The shape: `sh` prints its own pid, backgrounds a long `sleep` (the GRANDCHILD), prints that pid too
 * and then blocks. `kill()` signals the NEGATIVE pid — the group — and the assertion is that neither
 * pid answers `process.kill(pid, 0)` afterwards. Killing only the direct child would leave the `sleep`
 * reparented to init and alive; this test is what makes that failure loud.
 *
 * The remaining cases cover the two ways that kill is REACHED — an aborted signal and `shutdown()` —
 * and use a fake process, because there the subject is the runner's control flow rather than the OS.
 */

const LIVENESS_POLL_MS = 25
const LIVENESS_TIMEOUT_MS = 5_000

/** `process.kill(pid, 0)` — signal 0 probes existence without delivering anything. */
function alive(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

async function waitUntilDead(pid: number): Promise<boolean> {
	const deadline = Date.now() + LIVENESS_TIMEOUT_MS
	while (Date.now() < deadline) {
		if (!alive(pid)) return true
		await new Promise(resolve => setTimeout(resolve, LIVENESS_POLL_MS))
	}
	return !alive(pid)
}

/** Read stdout until both pids have been announced. */
async function readPids(proc: AgentProcess): Promise<{ child: number; grandchild: number }> {
	let buffer = ''
	for await (const chunk of proc.stdout) {
		buffer += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
		const lines = buffer.split('\n').filter(Boolean)
		if (lines.length >= 2) return { child: Number(lines[0]), grandchild: Number(lines[1]) }
	}
	throw new Error(`process never announced both pids; got ${JSON.stringify(buffer)}`)
}

/** A process whose stdout blocks until it is killed — the "child that stops talking" case. */
function fakeBlockingProcess() {
	let release: (() => void) | undefined
	const closed = new Promise<void>(resolve => {
		release = resolve
	})
	const state = { kills: 0, stdinEnded: false }
	const proc: AgentProcess = {
		// A blocking stdout, written as a manual async iterator rather than a generator: a generator with
		// no `yield` is exactly what `lint/correctness/useYield` exists to catch, and suppressing the rule
		// to keep the shorter spelling would be hiding a real smell instead of stating the intent.
		stdout: {
			[Symbol.asyncIterator]: () => ({
				async next(): Promise<IteratorResult<Uint8Array>> {
					await closed
					return { done: true, value: new Uint8Array() }
				},
			}),
		},
		stderr: (async function* (): AsyncGenerator<Uint8Array> {})(),
		write() {},
		endStdin() {
			state.stdinEnded = true
		},
		kill() {
			state.kills++
			release?.()
		},
		exited: closed.then(() => 143),
	}
	return { proc, state }
}

describe('cancellation — process-group kill (§4.11, AC-3.3)', () => {
	it('kills the child AND the grandchild it spawned', async () => {
		// `$$` is sh's own pid; the backgrounded `sleep` is the grandchild, whose pid is `$!`.
		const proc = nodeAgentProcessSpawner({
			cmd: ['/bin/sh', '-c', 'echo $$; sleep 300 & echo $!; wait'],
			cwd: process.cwd(),
			stdin: false,
		})

		const pids = await readPids(proc)
		expect(alive(pids.child)).toBe(true)
		expect(alive(pids.grandchild)).toBe(true)

		proc.kill()

		expect(await waitUntilDead(pids.child)).toBe(true)
		expect(await waitUntilDead(pids.grandchild)).toBe(true)
	})

	it('an aborted run kills the process, and the drain still ends on ONE terminal event', async () => {
		const { proc, state } = fakeBlockingProcess()
		const runner = new ClaudeAgentRunner(new LoggingService(), { spawner: () => proc, inactivityMs: 30_000 })
		const controller = new AbortController()

		const types: string[] = []
		const iteration = (async () => {
			for await (const event of runner.run({
				agentName: AgentName.ISSUE_WORK,
				cwd: process.cwd(),
				messages: [{ role: AgentMessageRole.USER, content: 'noop' }],
				signal: controller.signal,
			})) {
				types.push(event.type)
			}
		})()

		await new Promise(resolve => setTimeout(resolve, 20))
		controller.abort()
		await iteration

		expect(state.kills).toBeGreaterThan(0)
		// §4.3 rule 4: cancellation is DATA on the terminal event, never a throw mid-drain.
		expect(types.filter(t => t === 'finished')).toHaveLength(1)
		expect(types.at(-1)).toBe('finished')
	})

	it('shutdown() kills every process the runner still owns', async () => {
		const { proc, state } = fakeBlockingProcess()
		const runner = new ClaudeAgentRunner(new LoggingService(), { spawner: () => proc, inactivityMs: 30_000 })

		const types: string[] = []
		const iteration = (async () => {
			for await (const event of runner.run({
				agentName: AgentName.ISSUE_WORK,
				cwd: process.cwd(),
				messages: [{ role: AgentMessageRole.USER, content: 'noop' }],
			})) {
				types.push(event.type)
			}
		})()

		await new Promise(resolve => setTimeout(resolve, 20))
		await runner.shutdown()
		await iteration

		expect(state.kills).toBeGreaterThan(0)
		expect(types.at(-1)).toBe('finished')
	})

	it('shutdown() is idempotent — a second call has nothing left to own', async () => {
		const runner = new ClaudeAgentRunner(new LoggingService(), { inactivityMs: 30_000 })
		await runner.shutdown()
		await runner.shutdown()
	})
})
