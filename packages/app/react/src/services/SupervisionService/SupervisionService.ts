/**
 * Supervision PORT — is the backend the console talks to still alive?
 *
 * The console CANNOT answer this itself, and that is the whole reason this is a port instead of a
 * poll in a hook. Every gateway operation travels through the daemon's ChannelProxy (`Config
 * .gatewayBaseUrl` — "never :3032 directly"), so a browser has no route to observe the gateway; and
 * when the thing that died IS the daemon, a poll living in the console dies with it. The host
 * supervises (it owns the child processes and already holds a typed client for both), and the
 * console consumes the verdict.
 *
 * PULL + PUSH, both, on purpose: `subscribe` is the live channel, but a push only reaches whoever
 * was already mounted — a console that opens with the gateway ALREADY down would never hear one.
 * `current()` is what makes that operator's banner appear.
 *
 * Pure types, no host SDK — like every other port here, this is the shape a future expo/native
 * implementation would satisfy verbatim.
 */

/** The supervised processes. Mirrors the shell's `SidecarService`; kept structural so the port
 *  stays free of any generated binding. */
export type SupervisedSidecar = 'daemon' | 'gateway'

/**
 * `degraded` = the process ANSWERED but reported an internal gate down (a 503 from its own health).
 * It usually resolves itself and asks nothing of the operator. `down` = it stopped answering, or the
 * host watched it exit.
 */
export type SupervisionState =
	| { kind: 'healthy' }
	| { kind: 'degraded'; sidecar: SupervisedSidecar }
	| { kind: 'down'; sidecar: SupervisedSidecar }

export interface SupervisionService {
	/** The state right now (PULL) — what a component reads on mount. */
	current(): Promise<SupervisionState>
	/** Live transitions (PUSH). Resolves to the unsubscribe function. */
	subscribe(listener: (state: SupervisionState) => void): Promise<() => void>
	/** Restart everything — the only recovery offered, since nothing respawns silently. */
	restart(): Promise<void>
}
