import { spawn } from 'node:child_process'
import { injectable } from 'tsyringe-neo'
import { PublishRunOutcome } from '@codm/contracts-typescript/wire/enums'
import { resolveProviderEnv } from '../AgentRunner/platformInvocation'
import {
	PUBLISH_OUTPUT_MAX_BYTES,
	PublishCommandRunner,
	type PublishCommandResult,
	type PublishCommandRun,
	type RanOutcome,
} from './PublishCommandRunner'

/**
 * The daemon's own secrets — never handed to a command the owner declared (it runs a deploy, not the daemon). A
 * declared relation: every key with one of these prefixes, and these keys.
 */
export const PUBLISH_ENV_DROPPED_PREFIXES: readonly string[] = ['CODM_']
export const PUBLISH_ENV_DROPPED_KEYS: readonly string[] = ['JWT_SECRET', 'BETTER_AUTH_SECRET', 'INTERNAL_SERVICE_KEY']

/** The child's environment: the PATH the provider CLIs get (a Finder-launched daemon inherits almost none), minus the secrets. */
export function publishCommandEnv(executable: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	const composed = resolveProviderEnv(executable, { env: base })
	return Object.fromEntries(
		Object.entries(composed).filter(
			([key]) => !PUBLISH_ENV_DROPPED_KEYS.includes(key) && !PUBLISH_ENV_DROPPED_PREFIXES.some(prefix => key.startsWith(prefix)),
		),
	)
}

/** Keeps the LAST `max` bytes written to it — the tail of the output is where a failure explains itself. */
class OutputTail {
	private chunks: Buffer[] = []
	private size = 0
	truncated = false

	constructor(private readonly max: number) {}

	push(chunk: Buffer): void {
		this.chunks.push(chunk)
		this.size += chunk.length
		while (this.size > this.max && this.chunks.length > 0) {
			const head = this.chunks[0] as Buffer
			const excess = this.size - this.max
			this.truncated = true
			if (head.length <= excess) {
				this.chunks.shift()
				this.size -= head.length
			} else {
				this.chunks[0] = head.subarray(excess)
				this.size -= excess
			}
		}
	}

	text(): string {
		return Buffer.concat(this.chunks).toString('utf8')
	}
}

/**
 * The runner of the `real` environment: `spawn(argv[0], argv.slice(1))` with `shell: false` — an argument with `;`,
 * `$()` or a space reaches the program literally. `detached` puts it in a process group of its own, so the deadline
 * kills the command AND what it started (a deploy script's children), not just its first process.
 */
@injectable()
export class ProcessPublishCommandRunner extends PublishCommandRunner {
	run({ argv, cwd, timeoutMs }: PublishCommandRun): Promise<PublishCommandResult> {
		const [executable = '', ...args] = argv
		const startedAt = Date.now()
		const tail = new OutputTail(PUBLISH_OUTPUT_MAX_BYTES)
		return new Promise(resolve => {
			let timedOut = false
			let settled = false
			const finish = (outcome: RanOutcome, exitCode?: number) => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				resolve({ outcome, exitCode, durationMs: Date.now() - startedAt, output: tail.text(), truncated: tail.truncated })
			}
			const child = spawn(executable, args, {
				cwd,
				env: publishCommandEnv(executable),
				shell: false,
				detached: true,
				windowsHide: true,
				stdio: ['ignore', 'pipe', 'pipe'],
			})
			// The deadline settles at once: a descendant that escaped the group and holds the pipes open never keeps the
			// task waiting past it.
			const timer = setTimeout(() => {
				timedOut = true
				killGroup(child.pid, () => child.kill('SIGKILL'))
				finish(PublishRunOutcome.TIMED_OUT)
			}, timeoutMs)
			child.stdout?.on('data', (chunk: Buffer) => tail.push(chunk))
			child.stderr?.on('data', (chunk: Buffer) => tail.push(chunk))
			// A spawn that fails (no such executable, cwd gone) is an outcome — its message names the executable at most,
			// never the arguments (they may carry a credential).
			child.on('error', error => {
				tail.push(Buffer.from(`could not start the command: ${(error as NodeJS.ErrnoException).code ?? 'spawn error'}\n`))
				finish(PublishRunOutcome.FAILED)
			})
			child.on('close', (code: number | null) => {
				if (timedOut) return finish(PublishRunOutcome.TIMED_OUT)
				if (code === 0) return finish(PublishRunOutcome.SUCCEEDED, 0)
				return finish(PublishRunOutcome.FAILED, code ?? undefined)
			})
		})
	}
}

/** Kill the process group (`-pid`); where there is no group to kill, the process itself. */
function killGroup(pid: number | undefined, fallback: () => void): void {
	try {
		if (pid === undefined) throw new Error('no pid')
		process.kill(-pid, 'SIGKILL')
	} catch {
		fallback()
	}
}
