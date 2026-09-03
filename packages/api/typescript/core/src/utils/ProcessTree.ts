import { spawn as spawnChild, type ChildProcess, type SpawnOptions } from 'node:child_process'

/**
 * HOW A PROVIDER CLI'S PROCESS TREE IS OWNED AND TORN DOWN — one strategy per OS family, chosen by
 * ONE lookup on `process.platform` (`PROCESS_TREES`), never by an `if` at a call site.
 *
 * A provider CLI spawns children of its own (hooks, MCP servers — one of which is a client of ours
 * after the MCP inversion), and killing only the direct child leaks them (§4.11, AC-3.3). What "the
 * whole tree" means is an OS fact, so it is declared per OS:
 *
 * Since the MCP inversion, this same contract also governs a SECOND tree: third-party MCP servers are
 * no longer children of the provider CLI — the daemon itself spawns and owns them as direct STDIO
 * children (`DefaultMcpUpstreamRegistry`), so tearing down a run now means walking two trees rooted in
 * this process, not one.
 *
 *  - POSIX: `detached: true` makes the child a process-GROUP leader, so a negative pid names the
 *    group. Graceful `SIGTERM` to the group first, `SIGKILL` to the group after the grace window,
 *    on an `unref`'d timer (a pending kill must never keep a process — or a test runner — alive),
 *    cleared when the tree root exits. This is the pre-existing behaviour, moved here verbatim.
 *  - Windows: there is no process group a signal can name — `process.kill(-pid)` throws `EINVAL`
 *    and `child.kill()` is `TerminateProcess` of ONE pid. The tree is what `taskkill /T` walks
 *    (parent → children by pid), and the pass is FORCED (`/F`) in one shot, per D6: `taskkill`
 *    without `/F` only posts WM_CLOSE to WINDOWS, and a windowless console CLI answers "can only
 *    be terminated forcefully" and stays — a graceful pass would buy 2s of dead latency per
 *    cancel, never a teardown. No timer to arm, nothing to escalate to.
 */
export interface ProcessTree {
	/** Spawn options that make the tree terminable later. Spread into every provider spawn. */
	readonly spawnOptions: Readonly<Pick<SpawnOptions, 'detached' | 'windowsHide'>>
	/**
	 * Terminate the whole tree rooted at `child`. `exited` and `graceMs` drive the POSIX
	 * graceful→forced escalation; the Windows strategy takes the tree down in one forced pass and
	 * ignores both. Idempotence is the caller's job (`AgentProcess.kill`).
	 */
	terminate(child: TreeRoot, exited: Promise<unknown>, graceMs: number): void
}

/** What a strategy needs from the child: its pid, its liveness (`exitCode`/`signalCode` are set the
 * moment the root is reaped), and the direct-kill fallback. */
export type TreeRoot = Pick<ChildProcess, 'pid' | 'kill' | 'exitCode' | 'signalCode'>

/**
 * Fire-and-forget shell-out used by the Windows strategy. A PARAMETER of the factory (with the
 * production default) rather than a module-level seam, so the strategy is unit-tested from any host
 * without a test-only hook living in production code.
 */
export type TreeCommand = (file: string, args: readonly string[]) => void

/** POSIX — the process GROUP is the tree. */
export const posixProcessTree: ProcessTree = {
	spawnOptions: { detached: true },
	terminate(child, exited, graceMs) {
		/**
		 * Signal the whole process GROUP. Returns whether the group still existed — a `false` means
		 * there is nothing left to escalate to, which is why the caller stops rather than arming a timer.
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
		// Negative pid = the process GROUP, available because of `detached: true`.
		if (!signalGroup('SIGTERM')) return
		const escalation = setTimeout(() => signalGroup('SIGKILL'), graceMs)
		escalation.unref?.()
		// A group that exits on SIGTERM must not keep a live timer around for the grace window.
		void exited.then(
			() => clearTimeout(escalation),
			() => clearTimeout(escalation),
		)
	},
}

/** Production shell-out: `taskkill` with no console window and no handle kept on our side. */
const spawnTreeCommand: TreeCommand = (file, args) => {
	const proc = spawnChild(file, [...args], { stdio: 'ignore', windowsHide: true })
	// `taskkill` missing or refusing is not a daemon-level error: the shell's orphan reaper is the
	// backstop. An unhandled 'error' would take the daemon down.
	proc.once('error', () => {
		// no-op — see comment above
	})
	proc.unref()
}

/**
 * Windows — the tree is what `taskkill /T /F` walks, in ONE forced pass (D6; see the module
 * docblock for why a graceful pass is a guaranteed no-op against a console CLI).
 *
 * `detached: false` — explicitly, and asserted by the strategy test: detaching would only cut the
 * child from the console and from the shell's parent-death cleanup, and hides nothing from
 * `taskkill`.
 *
 * The already-reaped guard exists because the runner's `finally` calls `kill()` on EVERY run end,
 * clean exits included: spawning `taskkill /T /F` at a pid the OS may already have handed to
 * someone else is worse than skipping a sweep of descendants a NORMAL exit should have closed
 * itself.
 */
export function windowsProcessTree(run: TreeCommand = spawnTreeCommand): ProcessTree {
	return {
		spawnOptions: { detached: false, windowsHide: true },
		terminate(child, _exited, _graceMs) {
			if (child.pid === undefined) return
			// Tree root already reaped — there is no tree left that this pid safely names.
			if (child.exitCode !== null || child.signalCode !== null) return
			run('taskkill', ['/T', '/F', '/PID', String(child.pid)])
		},
	}
}

/**
 * The declared relation platform → strategy. `Record<NodeJS.Platform, …>` and not a partial map with
 * a fallback: every platform Node can report is listed, so a new member of the union is a `tsc`
 * error here rather than an `undefined` lookup at spawn time (same discipline as `PROVIDER_BINARIES`).
 */
export const PROCESS_TREES: Record<NodeJS.Platform, ProcessTree> = {
	aix: posixProcessTree,
	android: posixProcessTree,
	darwin: posixProcessTree,
	freebsd: posixProcessTree,
	haiku: posixProcessTree,
	linux: posixProcessTree,
	openbsd: posixProcessTree,
	sunos: posixProcessTree,
	cygwin: posixProcessTree,
	netbsd: posixProcessTree,
	win32: windowsProcessTree(),
}
