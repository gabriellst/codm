/**
 * Auto-update PORT — is a downloaded update sitting on disk, waiting for the operator to restart
 * into it?
 *
 * The shell installs new versions silently and automatically in the background (`updater.rs`'s
 * `run_check`) — it deliberately stops short of restarting itself, because a self-triggered
 * relaunch could drop the operator mid-conversation with zero warning. This port carries the ONE
 * decision that stays theirs: WHEN. There is no download/progress surface here — by the time this
 * port has anything to say, the new bits are already on disk.
 *
 * PULL + PUSH, both, on purpose — same shape as `SupervisionService`: `pending()` covers a console
 * window that mounts AFTER the background check already finished (the ask+listen pattern
 * `commands/boot.rs` documents — an `app.emit` fired before the page mounted is simply lost, so the
 * page also ASKS), `subscribe` is what makes the restart pill appear without a reload for a console
 * that was already open when the install completed.
 *
 * Pure types, no host SDK — like every other port here, this is the shape a future expo/native
 * implementation would satisfy verbatim.
 */
export interface UpdateService {
	/** The version waiting for a restart right now (PULL), or `null` if nothing is pending. */
	pending(): Promise<string | null>
	/** Fires (at most once per run) the moment a background check finishes installing an update
	 *  (PUSH). Resolves to the unsubscribe function. */
	subscribe(listener: (version: string) => void): Promise<() => void>
	/** Relaunch into the already-installed update. */
	restart(): Promise<void>
}
