# Real FCM Push Delivery — Design Spec (W10)

**Date:** 2026-06-01
**Status:** Draft
**Bounded Context:** notifications (primary); identity (cross-read: FcmRegistrationTokenRepository, UserPreferencesRepository)
**Kind:** feature
**Story Points:** 8 — 5 base (new real-env service + DI re-wiring + SendNotification injection + OrderUpdatedNotifyHandler preference guard + DailyDigestHandler + W2 cron job registration) +1 for cross-service contract (FCM multicast via firebase-admin, new env var FIREBASE_SERVICE_ACCOUNT_JSON), rounded to 8 for the combined surface that W2's scheduler depends on for the digest job registration.
**Part of:** .specs/2026-06-01-bk-dash-crucial-gaps-closure-roadmap-design.md (master roadmap)
**Depends on:** W2 (Go recurring-sync scheduler — digest cron job registration target)

---

## Context

The `notifications` bounded context in `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript/src/notifications/` has full structural plumbing for push delivery — entities, repos, a `PushDeliveryService` port — but none of it reaches a real FCM endpoint in any environment.

The `PushDeliveryService` abstract class lives at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript/src/notifications/services/PushDeliveryService.ts`. Two concrete implementations exist: `MockPushDeliveryService` (in-memory accumulator used in mock/unit contexts) and `LogPushDeliveryService` (`/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript/src/notifications/services/LogPushDeliveryService.ts`) which writes a row to `notifications.push_log` but calls no FCM API. The notifications `registry.ts` at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript/src/notifications/registry.ts` binds `LogPushDeliveryService` in **both** `integration` and `real` environments — meaning production traffic is silently dropped to a log table.

`SendNotification` at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript/src/notifications/usecases/SendNotification.ts` creates `BkdashNotificationDelivery` rows for the PUSH channel but never calls `PushDeliveryService.deliver()` — the service is not even injected into its constructor. FCM tokens are fully registered and queryable via `FcmRegistrationTokenRepository.listByUserId` (port at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript/src/identity/repositories/FcmRegistrationTokenRepository/FcmRegistrationTokenRepository.ts`), and per-store push opt-in is persisted in `UserPreferences.orderPushPerStore` (entity at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript/src/identity/entities/UserPreferences.ts`). Neither is consulted at delivery time.

The `OrderUpdatedNotifyHandler` at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript/src/notifications/handlers/OrderUpdatedNotifyHandler.ts` fans out an ORDER_RECEIVED push to every store member on `isNew=true` with an explicit code comment: *"Store-level opt-in toggle is a future iter; for now every member receives the push."* The `external.ts` barrel at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript/src/notifications/handlers/external.ts` mirrors this with a `// DEFERRED` block. The `internal.ts` barrel at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript/src/notifications/handlers/internal.ts` is an empty `// Export internal handlers here` stub — no subscriber for `DailyDigestTriggeredEvent` exists despite the event being emitted by `TriggerDailyDigest`.

`DailyDigestTriggeredEvent` is defined at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript/src/notifications/events/DailyDigestTriggeredEvent.ts` and carries `triggeredByUserId`, `storeId`, and `scheduledAt`. `TriggerDailyDigest` at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript/src/notifications/usecases/TriggerDailyDigest.ts` emits it and returns zero counts — the actual per-user fan-out is explicitly documented as "async + downstream" in the use case JSDoc.

## Problem

1. Push notifications are never delivered to devices in any environment including production. `PushDeliveryService` is not injected into `SendNotification`, so PUSH-channel delivery rows are created but no FCM call is made — devices receive nothing.
2. `LogPushDeliveryService` is bound in the `real` registry, meaning production silently absorbs all push attempts into a log table instead of reaching FCM.
3. `OrderUpdatedNotifyHandler` ignores `UserPreferences.orderPushPerStore` — every store member receives every order push regardless of whether they opted out for that store.
4. `DailyDigestTriggeredEvent` has no subscriber. `TriggerDailyDigest` emits the event; the handler that does the per-user fan-out was documented as "downstream" but never written. The hourly cron that should call `TriggerDailyDigest` is similarly absent (W2 provides the scheduler; this workstream registers the job).

## Goal

Merchants' devices receive real FCM push notifications when orders arrive and when the daily digest fires. `SendNotification` calls `PushDeliveryService.deliver()` for each PUSH-channel delivery row using the recipient's registered FCM tokens; `FirebasePushDeliveryService` (new) executes the FCM multicast call in production; `OrderUpdatedNotifyHandler` gates each recipient through `UserPreferences.orderPushPerStore` before calling `SendNotification`; a `DailyDigestHandler` subscribes to `DailyDigestTriggeredEvent`, fans out per-user digest pushes gated by `dailyNotificationsEnabled` and timezone, and a `DailyDigestJob` registers into W2's Go scheduler to fire the `TriggerDailyDigest` controller endpoint hourly.

## Decisions

1. **`FirebasePushDeliveryService` (new) implements `PushDeliveryService.deliver()` via `firebase-admin` `messaging().sendEachForMulticast()`** — multicast up to 500 tokens per call (FCM's documented batch limit). The service accepts a `MulticastMessage` built from `PushNotification.kind` as the FCM `notification.title` and `PushNotification.payload` as the FCM `data` map. Tokens are fetched by the *caller* (`SendNotification`) via `FcmRegistrationTokenRepository.listByUserId` and passed as the `tokens` array; `FirebasePushDeliveryService.deliver()` receives the assembled `PushNotification` plus the resolved token list. The port signature on `PushDeliveryService` is extended: `deliver(notification: PushNotification, tokens: string[]): Promise<void>`. (Brief: "FirebasePushDeliveryService implementing PushDeliveryService.deliver() via firebase-admin multicast".)

2. **`firebase-admin` is added as a production dependency of `packages/api/typescript`.** `LogPushDeliveryService` and `MockPushDeliveryService` do not import it. The app is initialized once via `firebaseAdmin.initializeApp({ credential: firebaseAdmin.credential.cert(JSON.parse(Config.env.FIREBASE_SERVICE_ACCOUNT_JSON)) })` inside `FirebasePushDeliveryService`'s constructor using a `@singleton()` guard. A new env var `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON string of the service-account credentials) is added to `Config.env` with an empty string default; absence in dev/integration causes the constructor to skip initialization and deliver a no-op. (Brief: "no firebase-admin import anywhere".)

3. **`PushDeliveryService` binding in `notifications/registry.ts` real env is replaced from `LogPushDeliveryService` to `FirebasePushDeliveryService` (new).** `mock` and `integration` environments retain their existing bindings (`MockPushDeliveryService` and `LogPushDeliveryService` respectively). (Brief: "bound in real env (LogPushDeliveryService stays in mock/integration)".)

4. **`SendNotification` is updated to inject `FcmRegistrationTokenRepository` and `PushDeliveryService` alongside the two existing repos.** After saving each PUSH-channel `BkdashNotificationDelivery`, it calls `fcmTokenRepo.listByUserId(recipient)` and, if the list is non-empty, calls `pushDeliveryService.deliver(notification, tokens)`. Tokens resolve within the same `withTransaction` block but the FCM HTTP call is fire-and-forget (not awaited inside the transaction); a failed FCM call is logged but does not roll back the delivery row. (Brief: "wire PushDeliveryService injection into SendNotification and call deliver() per PUSH-channel delivery row using FcmRegistrationTokenRepository.listByUserId".)

5. **`OrderUpdatedNotifyHandler` gates each recipient through `UserPreferences.orderPushPerStore` before adding them to `targetUserIds`.** The handler injects `UserPreferencesRepository` (cross-BC read from `identity`). For each member, it loads preferences via `findByUserId`; if `orderPushPerStore[storeId]` is explicitly `false`, the member is excluded. A missing preferences row (first-time user) defaults to opted-in (matching `UserPreferences.createDefault` which sets `orderPushPerStore: {}`). (Brief: "honors the per-store orderPushPerStore opt-in".)

6. **`DailyDigestHandler` (new, internal handler) subscribes to `DailyDigestTriggeredEvent` and fans out per-user digest pushes.** The handler queries all users whose `dailyNotificationsEnabled = true` via `UserPreferencesRepository.findAllWithDailyEnabled()` (new method on the port), filters by timezone match (current UTC hour equals the user's preferred `08:00` local hour using `Intl.DateTimeFormat`), then calls `SendNotification.execute()` once per batch of users with `category: NotificationCategory.DAILY_DIGEST` and `pushEnabled: true`. It is exported from `notifications/handlers/internal.ts` and registered in the notifications `BoundedContext` config. (Brief: "daily-digest fan-out handler subscribing to DailyDigestTriggeredEvent".)

7. **`DailyDigestJob` (new Go job) registers into W2's `Scheduler` via `scheduler.Register(job)` in `sync/module.go`.** The job's `Run(ctx)` calls the TS API `POST /v1/notifications/trigger-daily-digest` with `{ userId: SYSTEM_ACTOR_ID }` via the existing `Client` SDK singleton pattern (per the `project_sdk_client_singleton.md` memory). Interval: 1 hour. This honors the cross-cutting decision from the brief: "the digest cron registers into W2's Go scheduler." (Brief: "register into W2's Go scheduler, with timezone resolution".)

8. **`UserPreferencesRepository` receives a new method `findAllWithDailyEnabled(): Promise<UserPreferences[]>`.** Both the port and the Drizzle implementation add this method. The mock returns an empty array by default. This is the minimal read surface the `DailyDigestHandler` needs without a full query service. (Brief: handler requires per-user fan-out scoped by `dailyNotificationsEnabled`.)

9. **Email transport remains `ConsoleMailSender` stub in all environments.** No changes to `MailSender` binding in `shared/registry.ts`. (Brief: "Email stays a stub by user direction — DO NOT build email transport".)

10. **`NotificationCategory.DAILY_DIGEST` must exist in the contracts enum.** If absent, it is added to the TypeSpec source and regenerated via `bun sdk` before implementing the handler. (Codebase convention: closed-set categories are `z.enum(NotificationCategory)`; the value must exist in `@template/contracts-typescript/wire/enums`.)

## User Stories

**As a merchant**, given I have the bk-dash mobile app installed with a registered FCM token, when a new order arrives on my Shopify store, then within seconds I receive a push notification on my device with the order amount and payment status.

**As a merchant**, given I have disabled order push notifications for store X (`orderPushPerStore[storeX] = false`), when a new order arrives on store X, then I do not receive a push for that order; other store members with the toggle enabled still receive theirs.

**As a merchant with `dailyNotificationsEnabled = true`**, given it is 8 AM in my configured timezone, when the hourly digest job fires, then I receive a push notification summarizing yesterday's activity for my stores.

**As a merchant with `dailyNotificationsEnabled = false`**, when the hourly digest job fires at 8 AM my time, then I receive no push notification.

**As a developer running integration tests**, given `PushDeliveryService` is bound to `LogPushDeliveryService` in the integration env, when `SendNotification` runs with `pushEnabled: true`, then no FCM HTTP call is made and the test passes without network access.

## Acceptance Criteria

1. `FirebasePushDeliveryService` (new) is located at `packages/api/typescript/src/notifications/services/FirebasePushDeliveryService.ts`; `notifications/registry.ts` binds it for `real` env; `bun tsc` passes with no new errors.

2. `SendNotification` injects `FcmRegistrationTokenRepository` and `PushDeliveryService`; for a PUSH-channel delivery row targeting a user with one registered FCM token, `MockPushDeliveryService.inspect()` returns exactly one `PushNotification` entry after `SendNotification.execute()` (integration test in `Notifications.test.ts` or a new `SendNotification.push.test.ts`).

3. `SendNotification` with `pushEnabled: true` targeting a user with **no** registered FCM tokens does not call `PushDeliveryService.deliver()` — `MockPushDeliveryService.inspect()` returns an empty array (no-token branch is a no-op, not an error).

4. `OrderUpdatedNotifyHandler` with a member having `orderPushPerStore[storeId] = false` excludes that member from `targetUserIds`; `SendNotification` is called with the remaining opted-in members only (handler test in `OrderUpdatedNotifyHandler.test.ts`).

5. `OrderUpdatedNotifyHandler` with a member having no `UserPreferences` row (preferences not found) includes that member in `targetUserIds` (opt-in by default).

6. `DailyDigestHandler` subscribes to `DailyDigestTriggeredEvent`; calling `handler.handle(event)` directly in a mock-mode test with two users (one with `dailyNotificationsEnabled = true` and matching timezone hour, one with `dailyNotificationsEnabled = false`) results in exactly one `SendNotification.execute()` call for the enabled user.

7. `UserPreferencesRepository` port has `findAllWithDailyEnabled(): Promise<UserPreferences[]>`; `DrizzleUserPreferencesRepository` implements it with `WHERE daily_notifications_enabled = true`; `MockUserPreferencesRepository` returns the seeded list.

8. `DailyDigestJob` Go file compiles (`go build ./...` from `packages/api/go` passes) and its `Run(ctx)` calls the TS client SDK endpoint for `trigger-daily-digest`; `sync/module.go` registers it via `scheduler.Register(dailyDigestJob)`.

9. `notifications/handlers/internal.ts` exports `DailyDigestHandler`; the notifications `BoundedContext` wiring registers it as a subscriber to `DailyDigestTriggeredEvent`.

10. `bun run test` (full suite excluding e2e) passes green with all new and modified tests.

---

## Open Questions

1. **`PushDeliveryService.deliver()` signature change** — extending the port to `deliver(notification, tokens)` breaks `LogPushDeliveryService` and `MockPushDeliveryService`. Confirm whether to (a) update all three implementations in this workstream, or (b) have `SendNotification` resolve tokens itself and pass them separately from the notification, keeping the port signature unchanged (deliver called per-token). Option (b) avoids the port change but creates N calls per user instead of one multicast.

2. **SYSTEM_ACTOR_ID for the digest cron** — `DailyDigestJob.Run()` calls `TriggerDailyDigest` with `userId: SYSTEM_ACTOR_ID`. Confirm whether a well-known UUID constant exists for system-triggered actions (similar to `BK_DASH_NAMESPACE`) or whether a new `SYSTEM_ACTOR_ID` constant should be defined in `core/src/utils/`.

3. **`NotificationCategory.DAILY_DIGEST` existence** — the current `NotificationCategory` enum values are not fully visible from the file system read; confirm whether `DAILY_DIGEST` is already present in the TypeSpec source before adding it to avoid a redundant contracts regen.

4. **Timezone resolution for digest fan-out** — `UserPreferences.timezone` is optional (may be `undefined`). Confirm fallback: skip users with no timezone set, or default to UTC for the `08:00` comparison.

---

## Out of Scope

- Email transport (stays `ConsoleMailSender` stub — explicitly excluded by brief).
- Store-member invite email or any email-based notification.
- `NotificationKind` enum values beyond what already exists in contracts (VIDEO_PUBLISHED, COMMENT_REPLY, NEW_SUBSCRIBER are legacy polyglot values; do not remove them).
- FCM token cleanup / stale-token eviction on multicast failure responses.
- BK Messenger, revenue-milestone, Kanban/tasks, disputes pipeline.
- CartPanda / Yampi integrations.
