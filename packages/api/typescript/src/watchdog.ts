/**
 * PARENT WATCHDOG — the daemon's own answer to "the shell died and nobody told me".
 *
 * Lives as a bare `src/*.ts` file for the same reason `boot.ts` and `routers.ts` do: it belongs to
 * no bounded context. It is process lifecycle, not domain.
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
 * ## The condition
 *
 * `process.ppid !== CODM_PARENT_PID`, and nothing else. A pid's parent changes for exactly one
 * reason — the parent died — so the comparison is exact, needs no liveness probe, and (unlike
 * `kill(parentPid, 0)`) cannot be fooled by pid reuse. It is also stronger than `ppid === 1`: on a
 * host with a subreaper the orphan is re-parented to something that is not init, and this still
 * sees it.
 *
 * ## The reaction
 *
 * `SIGTERM` to ourselves. NOT `process.exit`: the graceful shutdown registered in `src/index.ts` is
 * the only thing that can reach the GRANDCHILDREN — every provider CLI is spawned `detached: true`
 * (`AgentProcess.ts`), i.e. in a process group of its own that nothing outside this process can
 * name. Exiting hard here would trade one orphan for several.
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

/** PURE — orphaned iff a supervisor was declared AND it is no longer this process's parent. */
export function isOrphaned(supervisorPid: string | undefined, currentParentPid: number): boolean {
	const expected = declaredSupervisorPid(supervisorPid)
	return expected !== null && currentParentPid !== expected
}

export interface ParentWatchdogOptions {
	/** Defaults to `process.env.CODM_PARENT_PID`. */
	readonly supervisorPid?: string | undefined
	/** Defaults to reading `process.ppid` on every tick — it changes under us when the parent dies. */
	readonly currentParentPid?: () => number
	/** Defaults to raising SIGTERM on ourselves, i.e. the graceful shutdown in `src/index.ts`. */
	readonly onOrphaned?: () => void
	readonly intervalMs?: number
}

/**
 * Start watching. Returns a stop function, or `null` when no supervisor was declared (the watchdog
 * is off, by design, for every non-desktop way of running the daemon).
 *
 * The timer is `unref`'d: a watchdog must never be the reason a process stays alive, and it must
 * never keep a test runner open either.
 */
export function startParentWatchdog(options: ParentWatchdogOptions = {}): (() => void) | null {
	const supervisorPid = options.supervisorPid ?? process.env[PARENT_PID_ENV]
	const currentParentPid = options.currentParentPid ?? (() => process.ppid)
	const onOrphaned = options.onOrphaned ?? (() => process.kill(process.pid, 'SIGTERM'))
	const intervalMs = options.intervalMs ?? WATCHDOG_INTERVAL_MS

	// Not supervised → nothing to watch. Returning null (rather than a no-op timer) keeps the
	// "is this daemon under a shell?" question answerable by the caller.
	if (declaredSupervisorPid(supervisorPid) === null) return null

	let fired = false
	const timer = setInterval(() => {
		if (fired || !isOrphaned(supervisorPid, currentParentPid())) return
		fired = true
		clearInterval(timer)
		console.error(
			`🛑 supervisor pid ${supervisorPid} is gone (now reparented to ${currentParentPid()}) — shutting down so no port is left held`,
		)
		onOrphaned()
	}, intervalMs)
	timer.unref?.()

	return () => clearInterval(timer)
}
