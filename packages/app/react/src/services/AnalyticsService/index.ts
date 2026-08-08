import { NoopAnalyticsService } from './NoopAnalyticsService'
import { PostHogAnalyticsService } from './PostHogAnalyticsService'

/**
 * Chosen by CONFIG, not by host — see `PostHogAnalyticsService`'s doc for why this capability has
 * no Browser-vs-Tauri split. Both `registry/browser.ts` and `registry/tauri.ts` bind this SAME
 * export; an empty `VITE_POSTHOG_KEY` (dev without it configured) resolves to the no-op class in
 * BOTH environments, never a half-initialized real one.
 */
export const AnalyticsServiceImpl = import.meta.env.VITE_POSTHOG_KEY ? PostHogAnalyticsService : NoopAnalyticsService
