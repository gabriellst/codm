/**
 * The PACKAGED app's own port range — a shell decision, same posture as `./cloud.ts` for
 * `CODM_CLOUD_URL`: it is NOT derived from `REPO.env.API_PORT.example` / `REPO.env.CHANNEL_PORT.example`
 * (3030/3032), which stay the DEV family (`.env.example`, `bun dev`, the console harness, e2e).
 *
 * Measured 2026-08-25 on the installed 0.5.4 build: the packaged daemon booted with `API_PORT=3030`
 * (`./env` used to read `SHELL_ENV.API_PORT = REPO.env.API_PORT.example` verbatim) and died on
 * `EADDRINUSE: Failed to start server. Is port 3030 in use?` — port 3030 had been held for 15h by an
 * unrelated `bun run --watch ./src` dev server from a SIBLING project on the same machine. The
 * consequence cascaded: `boot failed for 1 sidecar(s): codm-daemon`, the login loopback answered
 * `NETWORK_ERROR`, the SSE stream answered `Load failed`, and from the operator's seat the icon simply
 * produced no usable window. A packaged app has no business sharing a port family with every other
 * `bun dev`/Node/Go process a founder might have running — it needs a range far enough from the
 * common ones that a collision is unlikely, AND more than one candidate so a single collision (this
 * one, or the next unrelated one) does not repeat the incident.
 *
 * ── why THESE numbers ─────────────────────────────────────────────────────────────────────────────
 * - Far from the well-known/registered range and from every port this repo's OWN dev stack binds
 *   (3000-9000ish: 3030/3032/3100/3200/4321/5173/6379/9009 — Grafana/Loki/Tempo/Mimir/redis/vite/
 *   astro/the two dev backends) — a packaged app sharing that neighborhood is exactly how the 0.5.4
 *   incident happened, and it is also the range most OTHER local dev tooling on a founder's machine
 *   picks by convention.
 * - Below the IANA/OS ephemeral range (49152-65535 on macOS/Linux, higher still on Windows): a port
 *   in that band can be handed to a random OUTBOUND connection by the OS at any moment, which would
 *   make an apparently-free candidate collide moments after the bind-and-release probe in
 *   `sidecars::lifecycle::port_conflict` says it is clear.
 * - `47330`/`47332` (spaced by 2, not sequential) keep the daemon's and the gateway's candidate FOR
 *   THE SAME ATTEMPT NUMBER always a distinct port from each other even if something briefly binds a
 *   whole contiguous block — belt-and-suspenders, since the two lists are tried independently.
 * - Four candidates per sidecar (not one, not a dozen): one is exactly what regressed on 2026-08-25;
 *   four survives up to three simultaneous unrelated squatters before the operator ever sees a
 *   boot-error splash, without the list growing long enough that `docs/RELEASE.md` becomes stale
 *   documentation nobody re-reads.
 *
 * Consumed by `./env` (SHELL_ENV.API_PORT / SHELL_ENV.CHANNEL_PORT become `{ kind: 'candidates' }`
 * entries built from this table) and, transitively, by `./generate.ts` (CSP `connect-src`/`img-src`
 * authorize EVERY candidate) and the Rust supervisor (`shell_env::port_candidates` + the boot-time
 * "first free wins" scan in `sidecars::lifecycle::choose_free_port`).
 */
export const PORT_CANDIDATES = {
	API_PORT: [47330, 47340, 47350, 47360],
	CHANNEL_PORT: [47332, 47342, 47352, 47362],
} as const satisfies Record<'API_PORT' | 'CHANNEL_PORT', readonly number[]>

export type PortCandidateKey = keyof typeof PORT_CANDIDATES
