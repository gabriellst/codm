import { isProcessAlive } from './ProcessLiveness'

/**
 * PARENT WATCHDOG — the daemon's own answer to "the shell died and nobody told me".
 *
 * LIVES IN THE KERNEL, and the docblock below is the argument for why: not one line of this file
 * knows what product it is supervising. The condition is a pid comparison plus a liveness probe,
 * the reaction is whatever drain the caller hands in, and every dependency is injectable. It sat in
 * `packages/api/typescript/src/watchdog.ts` under the reasoning "it belongs to no bounded context"
 * — which was the right observation and the wrong conclusion: belonging to no context of THIS
 * product is precisely what makes something kernel.
 *
 * The Go gateway independently grew the same mechanism (`core/pkg/watchdog/watchdog.go`, same
 * `CODM_PARENT_PID` contract) — two implementations of one idea is the strongest evidence available
 * that the idea is not product-specific.
 *
 * ## Why the CHILD has to do this
 *
 * The desktop shell already kills this process on every exit path it can observe: `RunEvent::Exit`
 * (window close, Cmd+Q) and SIGTERM/SIGINT/SIGHUP (`src-tauri/src/sidecars/lifecycle.rs`). None of
 * that runs under `SIGKILL`, a panic in its event loop, or a power cut — no hook of the parent's
 * survives its own sudden death. What happens instead is that this process is REPARENTED (to
 * launchd on macOS, pid 1) and keeps running forever, holding `:3030` and answering a console that
 * belongs to a shell that no longer exists.
 *
 * That is not hypothetical: it is the 31/07 incident, twice in one day. `tauri dev` hard-kills the
 * shell on every recompile, and one of the surviving daemons went on serving a stale provider
 * catalog to a brand-new window — a bug with no error anywhere in it.
 *
 * ## The condition — two observations, one rule, no branch per OS
 *
 * Orphaned ⇔ a supervisor was declared AND (`process.ppid !== CODM_PARENT_PID` OR
 * `kill(CODM_PARENT_PID, 0)` says it is gone).
 *
 * The ppid half is exact on POSIX: a pid's parent changes for exactly one reason — the parent died —
 * so it needs no liveness probe and cannot be fooled by pid reuse. It is also stronger than
 * `ppid === 1`: under a subreaper the orphan is re-parented to something that is not init.
 *
 * The probe half is what Windows needs: there is NO reparenting there. The ppid a process reports is
 * the pid of whoever created it, frozen at spawn, alive or not — the ppid half never fires. The probe
 * (`ProcessLiveness.isProcessAlive`, the same one `DataDirLock` uses on a lock holder) is the only
 * question Windows answers. Its weakness — a reused pid reads as "alive" — is exactly what the ppid
 * half covers on POSIX, and on Windows is accepted (the shell's next-boot reaper is the belt to this
 * suspenders). Both halves run every tick on every OS: the rule is uniform, the OS just decides which
 * half turns true first.
 *
 * ## The reaction — the caller's drain, never a signal to ourselves
 *
 * `onOrphaned` is REQUIRED and `src/index.ts` hands in the very same `shutdown()` its SIGTERM/SIGINT
 * handlers run. It used to be `process.kill(process.pid, 'SIGTERM')` by default, which reads as "run
 * the graceful path" on POSIX and is an unconditional TerminateProcess on Windows — no listener runs,
 * the whole outbox/mediator/DB drain is skipped, and the provider CLI trees (spawned in groups of
 * their own, `AgentProcess.ts`) are leaked. Calling the drain directly is the same drain on every OS.
 * NOT `process.exit`: only that drain can reach the grandchildren.
 *
 * ## Why `CODM_PARENT_PID` is not in `REPO.env`
 *
 * It is a spawn-time argument, not configuration — same class as `CODM_MIGRATIONS_DIR`, which the
 * shell also injects and which is likewise absent from the registry and from `.env.example`. Adding
 * it there would put a pid in a file humans edit, and a stale value in `.env` would make every
 * `bun dev` daemon shut itself down one second after boot. Unset simply DISABLES the watchdog,
 * which is exactly right for `bun dev`, the tests and the e2e harness: nothing is supervising them.
 */

/** The env key the desktop shell stamps each sidecar with. Mirrored in `src-tauri/src/sidecars/mod.rs`. */
export const PARENT_PID_ENV = 'CODM_PARENT_PID'

/** How often the parent is checked. Short enough that a port is free ~1s after the shell dies. */
export const WATCHDOG_INTERVAL_MS = 1_000

/**
 * PURE — the supervisor pid the shell declared, or `null` when it declared nothing usable.
 *
 * Missing, empty and malformed all collapse to `null` on purpose: "nobody claimed to be supervising
 * us" is the normal state under `bun dev`, and it must never be confused with "our supervisor left".
 */
export function declaredSupervisorPid(raw: string | undefined): number | null {
	const pid = Number(raw)
	return Number.isInteger(pid) && pid > 0 ? pid : null
}

/** What ONE tick observed about the declared supervisor. */
export interface SupervisorObservation {
	/** `process.ppid` at this tick — changes under us when the parent dies (POSIX reparenting). */
	readonly parentPid: number
	/** `kill(supervisorPid, 0)` at this tick — the only signal Windows gives, where ppid is frozen. */
	readonly supervisorAlive: boolean
}

/**
 * PURE — orphaned iff a supervisor was declared AND it is no longer this process's parent OR it is
 * no longer alive. Both halves are evaluated; see "The condition" above for why neither is enough.
 */
export function isOrphaned(supervisorPid: string | undefined, observed: SupervisorObservation): boolean {
	const expected = declaredSupervisorPid(supervisorPid)
	if (expected === null) return false
	return observed.parentPid !== expected || !observed.supervisorAlive
}

export interface ParentWatchdogOptions {
	/** Defaults to `process.env.CODM_PARENT_PID`. */
	readonly supervisorPid?: string | undefined
	/** Defaults to reading `process.ppid` on every tick — it changes under us when the parent dies. */
	readonly currentParentPid?: () => number
	/** Defaults to `isProcessAlive` (`kill(pid, 0)`) — the half of the condition Windows relies on. */
	readonly supervisorAlive?: (pid: number) => boolean
	/**
	 * THE DRAIN. Required, and the caller's — `src/index.ts` passes the same `shutdown()` its signal
	 * handlers run. Never a signal to ourselves: that is a hard kill on Windows.
	 */
	readonly onOrphaned: () => void
	readonly intervalMs?: number
}

/**
 * Start watching. Returns a stop function, or `null` when no supervisor was declared (the watchdog
 * is off, by design, for every non-desktop way of running the daemon).
 *
 * The timer is `unref`'d: a watchdog must never be the reason a process stays alive, and it must
 * never keep a test runner open either.
 */
export function startParentWatchdog(options: ParentWatchdogOptions): (() => void) | null {
	const supervisorPid = options.supervisorPid ?? process.env[PARENT_PID_ENV]
	const currentParentPid = options.currentParentPid ?? (() => process.ppid)
	const supervisorAlive = options.supervisorAlive ?? isProcessAlive
	const intervalMs = options.intervalMs ?? WATCHDOG_INTERVAL_MS

	// Not supervised → nothing to watch. Returning null (rather than a no-op timer) keeps the
	// "is this daemon under a shell?" question answerable by the caller.
	const expected = declaredSupervisorPid(supervisorPid)
	if (expected === null) return null

	let fired = false
	const timer = setInterval(() => {
		if (fired) return
		const observed: SupervisorObservation = { parentPid: currentParentPid(), supervisorAlive: supervisorAlive(expected) }
		if (!isOrphaned(supervisorPid, observed)) return
		fired = true
		clearInterval(timer)
		console.error(
			`🛑 supervisor pid ${expected} is gone (parent now ${observed.parentPid}, alive=${observed.supervisorAlive}) — shutting down so no port is left held`,
		)
		options.onOrphaned()
	}, intervalMs)
	timer.unref?.()

	return () => clearInterval(timer)
}
