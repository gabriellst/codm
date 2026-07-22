/**
 * Live-refresh cadence for the operator surfaces.
 *
 * The daemon exposes an SSE stream (the react console subscribes to
 * `browser.*` frames and invalidates), but this Expo scaffold ships no SSE
 * client. Rather than fake liveness, the mobile surfaces poll: reads that
 * reflect a running agent (dashboard, session chat, needs-you, issue terminal)
 * pass `refetchInterval: LIVE_REFETCH_MS`. This is the honest fallback until a
 * native EventSource lands — swap the interval for stream invalidation then.
 */
export const LIVE_REFETCH_MS = 5000
