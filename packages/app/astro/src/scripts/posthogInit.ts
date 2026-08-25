import posthog from 'posthog-js'

declare global {
	interface Window {
		__POSTHOG_CONFIG__?: { key: string; host: string }
	}
}

/**
 * Landing's PostHog bootstrap (SP4 spec, Emenda 2026-08-07: "PostHog SOZINHO", US cloud).
 *
 * Reads `window.__POSTHOG_CONFIG__`, set by a small inline `define:vars` script BaseLayout.astro
 * emits right before this one loads. That indirection exists because THIS file is a real ES module
 * (Astro/Vite bundle it, which is what lets `import posthog from 'posthog-js'` resolve at all) —
 * and a bundled module cannot receive Astro's `define:vars` injection, which only targets
 * `is:inline` scripts. The values themselves come from `process.env.VITE_POSTHOG_KEY`/`_HOST` in
 * `BaseLayout.astro`'s FRONTMATTER (Node, unrestricted) rather than `import.meta.env` in THIS file,
 * which would resolve to `undefined`: Astro's Vite integration defaults `envPrefix` to `PUBLIC_`
 * only (astro/dist/core/create-vite.js), so a `VITE_*` var never reaches browser-bundled code here.
 * The env registry already froze the name as `VITE_POSTHOG_KEY` (shared with the console's own
 * `posthog-js` wiring, `PostHogAnalyticsService`) — the fix is the server-side read, not a rename.
 *
 * Astro is a static MPA — every route is a fresh document load, so (unlike the console's
 * TanStack-Router SPA) the DEFAULT `capture_pageview: true` already gives "one pageview per route"
 * for free; there is no router event to hook into here.
 */
const config = window.__POSTHOG_CONFIG__

if (config?.key) {
	posthog.init(config.key, {
		api_host: config.host,
		autocapture: true,
		capture_pageview: true,
		// Same posture as the console's PostHogAnalyticsService — masking hasn't been reviewed for
		// either surface yet (SP4 spec decision 7 + roadmap's masking-as-eliminatory criterion), and
		// there is no Settings surface on the landing to review a recording before turning it on.
		disable_session_recording: true,
	})
}
