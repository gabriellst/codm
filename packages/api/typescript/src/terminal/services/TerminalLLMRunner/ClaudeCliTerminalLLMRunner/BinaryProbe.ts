import { spawnPty, type PtyHandle } from './spawner'
import type { RunnerLogger } from './logger/RunnerLogger'
import { stripAnsi } from './ansi'

/** Minimal interface for the PTY instance the probe drives (real Bun.Terminal or a fake). */
export type ProbePty = Pick<PtyHandle, 'onData' | 'onExit'>

/** Factory type — injectable so tests can supply a fake without a real PTY. */
export type PtySpawner = () => ProbePty

/**
 * One-shot diagnostic probe: spawns a tiny shell in a Bun.Terminal PTY and reports what PTY
 * children can see from the daemon process (tty state, cwd, claude version). Helps distinguish
 * "PTY broken in this process context" from "claude-specific issue" when the runner gets 0 bytes
 * back.
 *
 * Idempotent — runs once per process. Output is emitted as a single boxed `binary-probe` section
 * through the runner logger.
 */
export class BinaryProbe {
	private static done = false

	static resetForTests(): void {
		BinaryProbe.done = false
	}

	static runOnce(logger: RunnerLogger, spawner?: PtySpawner): void {
		if (BinaryProbe.done) return
		BinaryProbe.done = true
		const section = logger.section('binary-probe')
		const probe = spawner
			? spawner()
			: spawnPty(
					[
						'/bin/sh',
						'-c',
						'tty || echo "no tty"; pwd; whoami; command -v claude && claude --version 2>&1 || echo "claude: not found"',
					],
					{
						cwd: process.cwd(),
						env: process.env as Record<string, string>,
					},
				)
		let buf = ''
		probe.onData(d => {
			buf += d
		})
		probe.onExit(e => {
			const plain = stripAnsi(buf).trim()
			const lines = plain.split('\n').filter(l => l.length > 0)
			const tty = lines[0] ?? 'unknown'
			const pwd = lines[1] ?? 'unknown'
			const whoami = lines[2] ?? 'unknown'
			const claudeBin = lines[3] ?? 'unknown'
			const claudeVersion = lines[4] ?? 'unknown'
			section.field('exitCode', String(e.exitCode))
			section.field('tty', tty)
			section.field('pwd', pwd)
			section.field('whoami', whoami)
			section.field('claude', `${claudeBin} (${claudeVersion})`)
			section.close()
		})
	}
}
