import type { SupervisionService, SupervisionState } from './SupervisionService'

/**
 * HONEST DEGRADATION, and worth being precise about why `healthy` is the truth here rather than an
 * optimistic default: a browser tab has NO supervised child processes. Nothing this port watches can
 * die, because nothing this port watches exists — in the web dev stack the backends are started and
 * stopped by the developer, and their liveness is not this port's subject. Reporting a state the
 * console then renders a "channel offline" banner for would be inventing an incident.
 *
 * `restart()` degrades to a reload: the browser's equivalent of "start over", and the closest honest
 * answer to a button whose desktop meaning is "restart the shell and its fleet".
 */
export class BrowserSupervisionService implements SupervisionService {
	async current(): Promise<SupervisionState> {
		return { kind: 'healthy' }
	}

	async subscribe(): Promise<() => void> {
		return () => undefined
	}

	async restart(): Promise<void> {
		window.location.reload()
	}
}
