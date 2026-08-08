import posthog from 'posthog-js'
import type { AnalyticsService } from './AnalyticsService'

const KEY = import.meta.env.VITE_POSTHOG_KEY
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

// Module-level, not instance state — same reasoning as `TauriLoggingService`'s `attached` flag:
// the Container is a per-boot singleton, but React StrictMode double-invoke / HMR must not call
// `posthog.init` twice on the ONE global `posthog` object.
let initialized = false

function ensureInit(): void {
	if (initialized) return
	initialized = true
	posthog.init(KEY, {
		api_host: HOST,
		autocapture: true,
		// Manual — driven by TanStack Router's OWN navigation event (`useAnalyticsPageview`), not
		// posthog-js's own History-API monkeypatch (SP4 spec: "use o evento de navegação dele, não
		// o pushState cru").
		capture_pageview: false,
		// OFF for now (SP4 spec decision 7 + Emenda 2026-08-07): the console's screens show project
		// names and conversation excerpts — turning replay on deserves a masking review first
		// (the roadmap's own eliminatory criterion for the tool). Flip once that review lands, not
		// before, and turn it on with input masking already configured, never as an afterthought.
		disable_session_recording: true,
		// Default ON with disclosure (Emenda 2026-08-07: "ligado por padrão, com aviso"). This is
		// posthog-js's OWN default already, spelled out here so the choice is visible in code, not
		// implicit. `useAnalyticsConsent` (mounted at root) applies the persisted
		// `useTelemetryConsentStore` choice right after init, so a returning user who opted out
		// stays opted out from the first paint of a fresh session.
		opt_out_capturing_by_default: false,
	})
}

/**
 * Real PostHog wiring. Host-agnostic ON PURPOSE — unlike every other service in this seam (whose
 * axis of variation IS the host: a browser tab vs. the Tauri webview), posthog-js is plain
 * fetch/XHR and behaves identically in both, so there is no Browser-vs-Tauri split for this
 * capability. The actual axis of variation is "is there an ingest key" (dev without
 * `VITE_POSTHOG_KEY` configured) — `./index.ts` picks this class vs. `NoopAnalyticsService` for
 * that, once, by config rather than by host.
 */
export class PostHogAnalyticsService implements AnalyticsService {
	constructor() {
		ensureInit()
	}

	identify(userId: string, properties?: Record<string, unknown>): void {
		posthog.identify(userId, properties)
	}

	reset(): void {
		posthog.reset()
	}

	setPersonProperties(properties: Record<string, unknown>): void {
		posthog.setPersonProperties(properties)
	}

	capturePageview(url: string): void {
		posthog.capture('$pageview', { $current_url: url })
	}

	optIn(): void {
		posthog.opt_in_capturing()
	}

	optOut(): void {
		posthog.opt_out_capturing()
	}
}
