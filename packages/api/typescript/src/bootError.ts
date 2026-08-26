/**
 * A single, actionable line for the daemon's own boot failure — never the raw Bun/Node stack trace.
 *
 * Measured on the packaged 0.5.4 build (2026-08-25): `mainRouter.start()` threw Bun's own
 * `EADDRINUSE: Failed to start server. Is port 3030 in use?` when the port was still held by an
 * unrelated dev server, and the top-level `main().catch(...)` handler in `index.ts` logged the
 * WHOLE `Error` object — message plus a multi-frame Bun stack trace — to stderr (see that file's
 * boot-failure handler). The shell (`sidecars::sidecar_log`) persists that stderr verbatim and the
 * boot-error splash renders it in a `<pre>` block (`packages/app/react/public/boot-error.html`): a stack trace
 * there reads as "something is badly broken", not "a port is taken", even though the shell's OWN
 * pre-spawn `port_conflict` check (`src-tauri/src/sidecars/lifecycle.rs`) already produces a clean,
 * one-line reason for the EXACT SAME condition caught before spawning.
 *
 * This is the daemon-side mirror of that message for the RACE the shell's pre-spawn check cannot
 * close (spec 2026-08-25/26, item 5): the shell binds-and-releases a candidate before spawning, but
 * something else can grab it in the gap between that release and the daemon's own `listen()`. When
 * that race is lost, `Config.env.API_PORT` — the SAME port the shell resolved and handed the
 * process — is echoed in the SAME vocabulary the shell's own `port_conflict` uses, so an operator
 * reading either surface recognizes the same failure.
 */
export function formatBootError(error: unknown, port: number): string {
	if (isAddressInUse(error)) {
		return `port :${port} is already taken by another process — refusing to boot onto a port this shell does not own`
	}
	return error instanceof Error ? (error.stack ?? error.message) : String(error)
}

/** Node/Bun's own `net`/`http` listen failure carries `code: 'EADDRINUSE'`; Bun's `Failed to start
 *  server. Is port ... in use?` wrapper is matched too, in case a future runtime drops the `code`
 *  but keeps naming the condition in the message. */
function isAddressInUse(error: unknown): boolean {
	if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'EADDRINUSE') return true
	const message = error instanceof Error ? error.message : String(error)
	return message.includes('EADDRINUSE')
}
