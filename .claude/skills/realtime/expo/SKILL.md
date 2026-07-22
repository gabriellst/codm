# realtime (expo) — useServerEvents canon for mobile

Mobile mirror of the web realtime canon (`packages/app/react/CLAUDE.md` → "Real-time"). The
backend streams store-scoped integration events over SSE (`GET /v1/ui/events`,
`ListenEventsController`). Expo consumes them through `packages/app/expo/lib/use-server-events.ts`.

## The two hooks (RTM-01)

- **`useServerEventSource()`** — opens THE connection (react-native-sse → `/v1/ui/events`, the
  `@better-auth/expo` cookie in a header). Mounted EXACTLY ONCE, via `<ServerEventsMount/>` in the
  authed `(tabs)` layout. Screens NEVER mount it.
- **`useServerEvents(name | name[], callback)`** — typed subscription. `name` is the SDK-derived
  `ServerEventName` (`ListenEventsQueryResponse['name']`) — a typo'd name is a tsc error. Array
  form for sibling events; discriminate via `event.name` (the body is narrowed by the discriminant).

## The canonical callback is guard-then-invalidate (RTM-02)

The callback guards by payload scope first (ONLY for sub-store ids — the stream is already
store-scoped server-side), then invalidates the SDK query key — never `setQueryData` / manual
cache mutation, never `refetchInterval` polling for an event-backed query. One shared handler for
sibling events is canon. Live exemplar: the home tab (`app/(tabs)/home/index.tsx`).
