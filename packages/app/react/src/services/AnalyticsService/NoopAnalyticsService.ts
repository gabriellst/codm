import type { AnalyticsService } from './AnalyticsService'

/**
 * HONEST DEGRADATION: `VITE_POSTHOG_KEY` empty (dev without it configured, or a build that
 * deliberately strips it) — "chave vazia = telemetria desligada, sem erro" (SP4 spec). Chosen by
 * `./index.ts` alongside `PostHogAnalyticsService`; does NOT import `posthog-js`, so the empty-key
 * path never constructs the SDK at all, let alone calls `init` with a blank token.
 */
export class NoopAnalyticsService implements AnalyticsService {
	identify(): void {
		// no-op — see class doc.
	}

	reset(): void {
		// no-op — see class doc.
	}

	setPersonProperties(): void {
		// no-op — see class doc.
	}

	capturePageview(): void {
		// no-op — see class doc.
	}

	optIn(): void {
		// no-op — see class doc.
	}

	optOut(): void {
		// no-op — see class doc.
	}
}
