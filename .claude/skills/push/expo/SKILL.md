# push (expo) — push-notification canon for mobile

Push has two halves: the **mobile** registers its device token + handles incoming notifications, and
the **backend** delivers via a `PushDeliveryService` implementation. The wire between them is the
existing `RegisterFcmToken` endpoint.

## Mobile: register the token once, in the authed area (PUSH-01)

A `usePushNotifications()` hook (in `lib/`) on mount: request permission
(`getPermissionsAsync` → `requestPermissionsAsync`); if granted, get the Expo push token
(`getExpoPushTokenAsync({ projectId })`); register it via the SDK mutation `useRegisterFcmToken`
with `{ token, platform }` (platform from the SDK's `FcmPlatform` enum via `Platform.OS` — NEVER a
hardcoded string). De-dupe so the same token isn't re-registered every mount. Mount it ONCE via a
null-rendering `<PushRegistration/>` in the authed layout (beside `<ServerEventsMount/>`) — never in
a screen. `setNotificationHandler(...)` is set once at module level. Guard `getExpoPushTokenAsync`
in try/catch so a simulator / no-EAS-projectId environment doesn't crash.

## Backend: a PushDeliveryService implementation, bound for `real` (PUSH-02)

The notifications context owns `abstract PushDeliveryService { deliver({ userId, kind, payload }) }`.
The real transport (`ExpoPushDeliveryService`) reads the user's registered tokens via the identity
`FcmRegistrationTokenRepository` (cross-context read through a Repository is sanctioned — root
CLAUDE.md), filters to `Expo.isExpoPushToken(...)`, and sends via `expo-server-sdk`
(`chunkPushNotifications` + `sendPushNotificationsAsync`). A dead token / per-ticket error is logged
and swallowed — one bad token must NOT fail the whole delivery. Bind it ONLY for the `real` mode in
`notifications/registry.ts` (mock→Mock, integration→Log) so tests stay offline.

## Anti-patterns

- Registering the push token from a screen / on every render instead of one mounted `<PushRegistration/>`.
- Hardcoding the platform string instead of the SDK `FcmPlatform` enum.
- A `PushDeliveryService` that throws on a single dead token (fails the batch).
- Binding the real Expo transport for `mock`/`integration` (tests must not hit the network).
- `getExpoPushTokenAsync` uncaught (crashes on simulators / missing EAS projectId).
