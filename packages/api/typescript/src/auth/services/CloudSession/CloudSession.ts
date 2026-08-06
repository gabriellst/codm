/**
 * "Is this install allowed to run agents" — the LOCAL, daemon-side half of SP2's login gate (spec
 * decisions 5-6, AC-4/AC-5). Wraps a device token cached on disk, revalidated against the cloud's
 * `GET /v1/cloud/entitlement` when reachable. The concrete implementation is `FileCloudSession`
 * (real: disk cache + HTTP) / `MockCloudSession` (mock, integration — no socket, no disk, per the
 * S2S rule: a test cannot depend on the cloud profile being up).
 *
 * `isEntitled()` is the ONLY thing `DrizzleMailboxDispatcher` reads before `claimNext` (Task T7) — it
 * is SYNCHRONOUS and cache-first ON PURPOSE: the dispatcher polls it on every drain pass (as often as
 * every 250ms under load), and a network round-trip on that path would throttle the whole queue to
 * the cloud's latency instead of the local disk's. Network reachability only ever updates the CACHE,
 * through `revalidate()` — never `isEntitled()` itself.
 *
 * Offline tolerance (spec decision 6) is the load-bearing property: a token that was valid the last
 * time the cloud was reached stays valid INDEFINITELY while offline — punishing a free-plan user for
 * a network blip has no product upside now that there is no billing left to protect. Only an explicit
 * 401/403 from the cloud (the token was actually revoked) flips the gate; anything else — a timeout,
 * a DNS failure, a 500 — changes nothing (AC-5).
 */
export abstract class CloudSession {
	/**
	 * Cache a freshly-exchanged device token — pushed by the console (T6) via `POST
	 * /v1/session/cloud-token` right after the desktop trades its one-time code for one. Persists it
	 * (0600) and kicks off a best-effort `revalidate()`; never throws on a revalidation failure — the
	 * token is trusted the instant it is set, exactly like a fresh login should be.
	 */
	abstract setToken(token: string): void

	/** Synchronous, cache-first — see the class docblock for why this never touches the network itself. */
	abstract isEntitled(): boolean

	/**
	 * Check the cached token against the cloud. 401/403 revokes (flips the gate closed and clears the
	 * cache); a network failure or any other error changes NOTHING (spec decision 6 — offline never
	 * punishes). Meant to be called at boot and periodically by the real daemon; safe to await or
	 * fire-and-forget either way, since it never throws.
	 */
	abstract revalidate(): Promise<void>
}
