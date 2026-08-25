/**
 * Product analytics for the console (SP4 — Emenda 2026-08-07: "PostHog SOZINHO", sem Sentry). PORT
 * only — impls colocated, same shape as every other capability in this seam.
 *
 * Deliberately narrow: autocapture (clicks/inputs) and pageviews are wired by `init` itself
 * (autocapture) and `capturePageview` (called from a router subscription, see
 * `useAnalyticsPageview`) — there is no generic `capture(event, props)` escape hatch here on purpose.
 * The spec is explicit that PostHog measures what the PERSON does on-screen; what the SYSTEM does
 * (turns, issues) stays on the daemon's OTel and never reaches this port. If a screen seems to need
 * a bespoke event, that is a spec gap to report, not a method to add quietly.
 */
export interface AnalyticsService {
	/**
	 * Ties every event captured from this point on to `userId` (SP2's cloud account id) instead of
	 * an anonymous distinct_id — the join key for the landing→console funnel (Story 4) and for
	 * correlating a person across sessions. Call once the console confirms a cloud login (fresh
	 * login AND a warm boot with an existing device token both count — see `useAnalyticsIdentity`).
	 */
	identify(userId: string, properties?: Record<string, unknown>): void

	/** Clears the identified person and starts a fresh anonymous distinct_id — the counterpart of
	 *  `identify`, called on logout so a NEXT login (possibly a different account) never inherits
	 *  the previous person's events. */
	reset(): void

	/**
	 * Sets/merges properties on the CURRENTLY identified person without emitting a new event — used
	 * to fold the onboarding checklist (`channelDone`/`workspaceDone`/`threadDone` from
	 * `useGetOnboarding`) into the person record for free, no bespoke "onboarding step
	 * completed" event needed.
	 */
	setPersonProperties(properties: Record<string, unknown>): void

	/** Emits a `$pageview` for `url`. Called from `useAnalyticsPageview`, which drives it off TanStack
	 *  Router's OWN navigation events — never off a raw `history.pushState` listener, and never
	 *  posthog-js's own History-API autopatch (disabled at init, see `PostHogAnalyticsService`). */
	capturePageview(url: string): void

	/** Resumes capturing after `optOut` — mirrors posthog-js's own verb so the consent toggle
	 *  (Settings) reads as a direct translation, not a reinterpretation. */
	optIn(): void

	/** Stops ALL capture (autocapture, pageviews, identify, person properties) until the next
	 *  `optIn` — the toggle OFF path (AC-5: "toggle de consentimento OFF zera exportação"). */
	optOut(): void
}
