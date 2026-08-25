import type { UpdateService } from './UpdateService'

/**
 * HONEST DEGRADATION, same reasoning as `BrowserSupervisionService`: a browser tab has no shell
 * auto-updater sitting behind it — nothing is ever downloaded, nothing ever installs, so there is
 * never a version pending a restart. `pending()` stays `null` forever and `subscribe()` never
 * fires, which is exactly why the pill this port backs never renders in a dev/browser session.
 *
 * `restart()` is unreachable in practice (the pill that calls it never mounts here), so it stays an
 * inert no-op rather than inventing a browser-side meaning — unlike supervision's `restart()`,
 * there is no honest "closest equivalent" action to take (a page reload restarts nothing into a new
 * version; it would just be a lie dressed as a fallback).
 */
export class BrowserUpdateService implements UpdateService {
	async pending(): Promise<string | null> {
		return null
	}

	async subscribe(): Promise<() => void> {
		return () => undefined
	}

	async restart(): Promise<void> {
		// no-op — see class docs.
	}
}
