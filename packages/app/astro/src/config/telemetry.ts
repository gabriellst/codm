/**
 * Site-side telemetry consent — the landing's half of the SP4 consent decision.
 *
 * The console has had a real opt-out since SP4 (Settings → Telemetry, persisted by
 * `useTelemetryConsentStore`); the landing had NONE, so a visitor could only refuse by
 * installing a tracking blocker. That gap is what the privacy policy's section 12 used to
 * document. This module is the shared vocabulary that closes it: `posthogInit.ts` reads the
 * choice BEFORE `posthog.init`, and the Footer's toggle writes it and announces the change.
 *
 * Separate key from the console's `codm.telemetry-consent` ON PURPOSE. The two surfaces are
 * different origins (Cloudflare Pages vs. the Tauri webview), so nothing is shared anyway —
 * and the console's entry is a zustand-persist envelope (`{state:{enabled},version}`), a shape
 * this file must not depend on. One key, one meaning: `'off'` means declined, anything else
 * (including absent) means the SP4 default, which is ON with disclosure.
 */
export const TELEMETRY_CONSENT_KEY = 'codm.site-telemetry-consent'

/** Fired on `window` when the choice changes, so an already-loaded PostHog can react without a reload. */
export const TELEMETRY_CONSENT_EVENT = 'codm:site-telemetry-consent'

export interface TelemetryConsentEventDetail {
	enabled: boolean
}

/**
 * Reads the persisted choice. Defaults to ENABLED — the SP4 default is "ligado por padrão, com
 * aviso", and the footer disclosure is that aviso. A throwing `localStorage` (private mode,
 * storage blocked by the browser) must not take the site down, and reading it as "declined"
 * would silently disable analytics for everyone in those modes — so the default wins there too.
 */
export function readSiteTelemetryConsent(): boolean {
	try {
		return localStorage.getItem(TELEMETRY_CONSENT_KEY) !== 'off'
	} catch {
		return true
	}
}

/** Persists the choice. Silently a no-op when storage is unavailable — the in-page effect still applies. */
export function writeSiteTelemetryConsent(enabled: boolean): void {
	try {
		localStorage.setItem(TELEMETRY_CONSENT_KEY, enabled ? 'on' : 'off')
	} catch {
		/* storage blocked — the live opt-out below still takes effect for this page view */
	}
}
