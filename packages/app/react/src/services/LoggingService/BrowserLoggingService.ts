import type { LoggingService } from './LoggingService'

/**
 * HONEST DEGRADATION: a plain browser tab (dev server, e2e) has no host-side log file to forward
 * into — devtools already show everything `console.*` produces, which is the whole story there.
 * No-op rather than inventing a destination.
 */
export class BrowserLoggingService implements LoggingService {
	async attachConsole(): Promise<void> {
		// no-op — see class doc.
	}
}
