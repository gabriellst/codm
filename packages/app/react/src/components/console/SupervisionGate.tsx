import { onlineManager } from '@tanstack/react-query'
import { type ReactNode, useEffect, useState } from 'react'
import { useSupervision } from '@/services'
import type { SupervisionState } from '@/services'

/**
 * THE OTHER HALF OF SUPERVISION: the banner TELLS the operator the backend died; this stops the
 * console from working as if it hadn't.
 *
 * The B1 readiness gate (`ReadinessGate` → `Reveal::Main`) is a BOOT gate and a BINARY one: it holds
 * the window until both healths answer 200 and then it is over. Every death after that found the
 * console fetching happily against a corpse — failing, retrying, and (since the toast suppression)
 * failing in silence. Suppressing the toast treated the symptom; a request that cannot succeed
 * should not leave.
 *
 * The mechanism is `onlineManager`, and it is the whole reason this is 30 lines instead of an
 * `enabled:` on every hook in the app: `setOnline(false)` pauses EVERY query and mutation at the
 * observer — no fetch, no retry, no error, no toast — and `setOnline(true)` resumes what was paused
 * and refetches what went stale, without a single call site knowing. `onlineManager` is a
 * process-global singleton (not a field of the QueryClient), which is why this binding does not live
 * in `router.tsx`: the QueryClient it builds has nothing to offer here, while the SupervisionService
 * this needs is only reachable through the DI Container that `ServicesProvider` builds
 * asynchronously — inside React. Putting it in `router.tsx` would mean a SECOND composition root for
 * the port.
 *
 * WHY IT GATES ITS CHILDREN rather than just running an effect beside them: React flushes passive
 * effects CHILD-FIRST, so a `useQuery` deeper in the tree subscribes and fetches before any effect
 * of ours could pause it. A console that mounts with the daemon already down would fire its whole
 * doomed opening burst and only then discover the fact — the `boot_failures` lesson (spec Decision 9)
 * paid once already by the splash. So the first PULL happens with nothing rendered under it.
 */

/**
 * WHICH DEATHS MAKE SERVER WORK POINTLESS — per sidecar, deliberately, because they are not
 * interchangeable.
 *
 * `down` + `daemon` → PAUSE. The daemon is the origin of EVERY request the console makes, its own
 * and the gateway's alike: `computeServiceBaseUrls` routes every gateway operation through the
 * daemon's ChannelProxy ("never :3032 directly"), so a dead daemon means there is no reachable
 * backend at all. Nothing that leaves can arrive. Note this still matters even though a dead daemon
 * also hides the window (spec Decision 6): hidden is not unmounted — the webview keeps running,
 * timers keep firing, and React Query keeps refetching behind a window nobody can see.
 *
 * `down` + `gateway` → KEEP RUNNING. The daemon is alive, so every `typescript`-service read still
 * works and the console stays genuinely usable; only the proxied gateway calls fail. Pausing here
 * would freeze screens that have nothing wrong with them, to say something `SupervisionBanner`
 * already says better.
 *
 * `degraded` (either sidecar) → KEEP RUNNING. `degraded` is a 503 from the process's OWN health
 * (spec Decision 4): the process ANSWERED, an internal gate reproved itself — a pending migration, a
 * stopped dispatcher — and it usually resolves unattended. Most requests still succeed. Worse,
 * pausing costs more than reads: `onlineManager` pauses MUTATIONS too, so an operator action would
 * hang mid-air on a hiccup that was going to clear itself in seconds. The same reasoning that keeps
 * the banner quiet on `degraded` keeps the queries running on it.
 *
 * Anything else → KEEP RUNNING. The default is ONLINE and it is not an optimism: turning "I don't
 * know" into an inert app is a worse failure than the one this fixes.
 */
export function queriesCanRun(state: SupervisionState): boolean {
	return !(state.kind === 'down' && state.sidecar === 'daemon')
}

/**
 * How long the console waits for the FIRST supervision answer before rendering anyway.
 *
 * A supervisor that never replies must not cost the operator their console. The budget exists so the
 * gate can only ever DELAY the app, never withhold it: when it expires we render and stay ONLINE,
 * and a late answer still applies when it lands. Same principle as the boot budget in the shell,
 * three orders of magnitude smaller because this is one in-process IPC round trip, not a fleet
 * coming up.
 */
const INITIAL_PULL_BUDGET_MS = 2_000

export function SupervisionGate({ children }: { children: ReactNode }) {
	const supervision = useSupervision()
	const [ready, setReady] = useState(false)

	useEffect(() => {
		let cancelled = false
		let unsubscribe: (() => void) | undefined

		const apply = (state: SupervisionState) => {
			if (!cancelled) onlineManager.setOnline(queriesCanRun(state))
		}
		const release = () => {
			if (!cancelled) setReady(true)
		}
		const budget = setTimeout(release, INITIAL_PULL_BUDGET_MS)

		// PULL first (spec Decision 9). A console that opens with the fleet already down will never
		// receive a transition — there is none to receive — so the subscription alone would leave it
		// firing into the void. The `catch` is the default-online path: an unreachable supervisor
		// tells us nothing, and nothing is not a reason to stop working.
		void supervision
			.current()
			.then(apply)
			.catch(() => undefined)
			.finally(() => {
				clearTimeout(budget)
				release()
			})

		// PUSH — every transition after that one.
		void supervision
			.subscribe(apply)
			.then(fn => {
				// The subscription can resolve after teardown; drop it rather than leak a listener.
				if (cancelled) fn()
				else unsubscribe = fn
			})
			.catch(() => undefined)

		return () => {
			cancelled = true
			clearTimeout(budget)
			unsubscribe?.()
			// Nobody is watching supervision any more, so nobody can lift a pause: leave the global
			// on its default rather than stranding the next mount offline.
			onlineManager.setOnline(true)
		}
	}, [supervision])

	// Same shape as the ServicesProvider splash it follows, so the held frame is a background and not
	// a white flash.
	if (!ready) return <div className="fixed inset-0 bg-background" data-supervision-gate="pending" />
	return <>{children}</>
}
