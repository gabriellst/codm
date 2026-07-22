# P10-NOTIFICATIONS — BK Dash BC10 Notifications — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`)
> syntax for tracking. Each Task wraps one observable behavior in an outer
> RED → GREEN → REFACTOR cycle, ends with `bun tsc && bun lint && bun test`
> and a single conventional commit. **All TS files land under
> `packages/api/typescript/src/notifications/` co-existing with polyglot's
> pre-existing video-push BC in the same folder** (see §0 — collision
> strategy: filename + TS-export prefixes `BkDash*`; the schema is already
> partitioned into pg `notify.*` via `packages/contracts/db/schema/bkdash_notifications.ts`).
> No BC-foreign writes — Notifications only consumes integration events
> from other BCs.

**Goal:** Land the full BC10 Notifications bounded context — `BkDashNotification`
and `BkDashNotificationDelivery` aggregates, FCM + email + in-app channel
adapters, 15-minute dedupe via `contentHash`, daily-digest scheduler keyed on
`identity.user_preferences.timezone` + `dailyNotificationsEnabled`, per-Store
opt-in order-push using `identity.user_preferences.orderPushPerStore`,
invitation/handshake-failed routing, and the `BkDashNotificationsInboxQuery`
read — so the three C53–C55 commands and T37 read fully serve the frontend
once `bun run codegen` is rerun.

**Architecture:** A new BK Dash slice **inside the existing
`packages/api/typescript/src/notifications/` folder** mirroring the `auth`
skeleton (`enums/ objects/ entities/ repositories/ services/ usecases/
controllers/ handlers/ events/ middlewares/ errors/ registry.ts index.ts`).
The folder already hosts polyglot's video-push BC (`PushDeliveryService`,
`NotifySubscribersHandler`, `SubscriptionReadRepository`). **Coexistence
rules** are codified in §0. Two aggregates: `BkDashNotification` (the
message + dispatch policy) and `BkDashNotificationDelivery` (the per-(userId
× channel) attempt row, also the read-model row backing T37). Three channel
**adapters** behind a `BkDashChannelDispatcher` port:
`EmailNotificationDispatcher` (over a NEW `MailSender` framework abstraction
introduced by Task 8 in `packages/api/typescript/core/src/services/MailSender/`
with `ConsoleMailSender` default), `PushNotificationDispatcher` (stub
against a NEW `FcmClient` port in `packages/api/typescript/src/notifications/services/`
with `ConsoleFcmClient` default), and `InAppNotificationDispatcher` (no-op —
the row in `notify.notification_deliveries` IS the in-app inbox). A
`BkDashDedupeService` resolves the 15-minute sliding window via the
`contentHash` column already present on `bkdashNotifications`. A
`BkDashDailyDigestScheduler` runs as a cron use case (hourly tick → for
each user whose timezone-local hour == 09:00 AND
`dailyNotificationsEnabled = true`, build the previous-day digest payload
via a `BkDashDigestComposer` port — the real implementation lands with
P11-ANALYTICS, P10 ships `StubBkDashDigestComposer`).

External handlers wire the **subscription matrix** (§1 below) — Identity
events (`fcm_token.*`, `user_preferences.updated`), Tenancy
`store_member.invited`, Integration `integration.handshake_failed`, Sales
`order.updated` — each routes through `BkDashSendNotificationUseCase` with
a fixed `category` + `origin = SYSTEM`.

The context publishes only Notification-domain events
(`BkDashNotificationCreatedEvent`, `BkDashNotificationDeliveredEvent`,
`BkDashNotificationDeliveryFailedEvent`, `BkDashNotificationReadEvent`,
`BkDashDailyDigestSentEvent`) — these stay **intra-API** (no `shared.*`
outbound), so no `packages/contracts/wire/events/` additions are needed
from P10.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe-neo, Zod, bun:test.
**Spec:** `.specs/2026-05-21-ddd-modeling-bk-dash.md` (§4 BC10, §7.10, §7.13
intra-API matrix, §7.14 NotificationsErrors)
**Master plan:** `.plans/2026-05-21-bk-dash-port.md` (sub-plan P10-NOTIFICATIONS)
**Depends on sub-plans:** P1-IDENTITY (User, UserPreferences with
`timezone`, `dailyNotificationsEnabled`, `orderPushPerStore`,
`fcm_registration_tokens`), P2-TENANCY (Store, StoreMembership roles,
`shared.store_member.invited`), P4-INTEGRATION (`shared.integration.handshake_failed`),
P6-SALES (`shared.order.updated`).
**Tasks:** 21
**Estimated minutes:** ~390

---

## 0. Convention reference (absorbed during planning, NOT to be re-read by /build)

- **Polyglot BC home.** TS BCs live at `packages/api/typescript/src/<bc>/`.
  Mirror the **`auth`** BC structure (see `packages/api/typescript/src/auth/`):
  `controllers/ entities/ enums/ errors/ events/ handlers/ middlewares/
  objects/ repositories/ usecases/ registry.ts index.ts`. Polyglot's
  `notifications` BC has the same layout PLUS a `services/` subfolder —
  reuse that pattern for our channel dispatchers + dedupe + digest services.
- **Folder collision.** `packages/api/typescript/src/notifications/` already
  hosts polyglot's video-push BC (`entities/`, `events/`, `handlers/
  NotifySubscribersHandler.ts`, `services/{LogPushDeliveryService,
  MockPushDeliveryService, PushDeliveryService}.ts`, `repositories/
  SubscriptionReadRepository/`). **DO NOT delete or merge those files** —
  they back the unrelated video-push subscription concern. Coexistence
  rules:
  - **File names**: every new file gets a `BkDash` prefix
    (`BkDashNotification.ts`, `BkDashChannelDispatcher.ts`,
    `BkDashSendNotification.ts`, etc.).
  - **TS exports**: every exported symbol gets a `BkDash` prefix
    (`BkDashNotification`, `BkDashNotificationRepository`,
    `BkDashSendNotificationUseCase`).
  - **Subfolders**: when polyglot owns a generic file
    (`PushDeliveryService.ts`), prefix the BK Dash equivalent
    (`BkDashPushNotificationDispatcher.ts`). Do not nest in a
    `bk-dash/` subfolder — `auth` proves the BC-level flat structure
    works.
  - **Barrels (`*/index.ts`)**: the existing barrels re-export polyglot
    files; APPEND new BK Dash exports — do not remove existing entries.
- **DB schema is partitioned.** Polyglot's video-push lives in pgSchema
  `notifications` (`packages/contracts/db/schema/notifications.ts`).
  BK Dash lives in pgSchema `notify`
  (`packages/contracts/db/schema/bkdash_notifications.ts`) — already
  authored. **TS-export names to import at use sites: `bkdashNotifications`
  + `bkdashNotificationDeliveries`** (NOT `notifications` — that's polyglot).
- **MailSender abstraction does NOT exist yet.** Greenfield: introduce
  `packages/api/typescript/core/src/services/MailSender/` (interface +
  `ConsoleMailSender` default) as part of Task 8. This is a **framework
  addition** (per master-plan addendum, polyglot core is the right home
  for cross-language abstractions). Sibling pattern: copy the shape of
  `packages/api/typescript/core/src/services/Mediator/` (abstract class +
  `Console*` default registered in the polyglot root container).
- **FcmClient abstraction does NOT exist yet.** Lives in the BC, not
  core — `packages/api/typescript/src/notifications/services/BkDashFcmClient.ts`
  + `BkDashConsoleFcmClient.ts`. Matches polyglot's
  `PushDeliveryService` shape (abstract class, `Mock*` + `Log*` defaults).
  Real Firebase Admin SDK wiring is out of scope (deferred to a follow-up
  `P-INFRA-FIREBASE` sub-plan).
- **Entity shape.** Follow `packages/api/typescript/src/auth/entities/User.ts`:
  Zod schema via `z.object({...})` from `@template/core-typescript`, entity
  class extends `BaseEntity<typeof Schema>`, `static schema = Schema`,
  `static create()` factory, business methods, invariants raise
  `BaseError<NotificationsErrors | BaseDomainErrors>`.
- **Repository shape.** Follow
  `packages/api/typescript/src/auth/repositories/UserRepository/`:
  three files per aggregate — interface (`<Name>Repository.ts`), Drizzle
  impl (`Drizzle<Name>Repository.ts`), mock impl (`Mock<Name>Repository.ts`)
  — and a co-located `index.ts` barrel. Per-env bindings registered in
  the BC's `registry.ts`.
- **Use case shape.** Follow
  `packages/api/typescript/src/auth/usecases/RegisterUser.ts`: `InputSchema`
  / `OutputSchema` exports + `@injectable()` class extending `UseCase<...>`.
- **Controller shape.** Follow
  `packages/api/typescript/src/auth/controllers/GetSession.ts`: `@injectable()`
  class extending `Controller<InputSchema, OutputSchema>` with `path`,
  `method`, `description`, `errors[]`, `middlewares[]` properties + a
  `handle(input)` method.
- **Event shape.** Follow
  `packages/api/typescript/src/auth/events/UserRegisteredEvent.ts`:
  `z.domainEvent({...})` schema + class extending `BaseDomainEvent` with
  `static override readonly name = 'notifications.<entity>.<verb>' as const`.
- **Error glossary.** Re-export the cross-cutting `NotificationsErrors`
  type union from `packages/api/typescript/src/notifications/errors/`.
  Side-effect-register codes in `errors/index.ts` per the `auth`
  pattern (`import './errors'` from `registry.ts`).
- **Schema helper import.** `import { z } from '@template/core-typescript'`
  for entity/event schemas; raw `import Z from 'zod'` for type inference.
- **Wire enum imports.** All notification enums already authored:
  `packages/contracts/wire/enums/{notification-category,notification-origin,notification-channel,notification-currency-mode,notification-kind}.tsp`.
  Import generated TS via `@template/contracts-typescript/wire`
  (e.g. `import { NotificationCategory } from '@template/contracts-typescript/wire'`).
  Verify generated path with `find packages/contracts/generated/typescript/wire -name "notification-*"`.
- **DB schema imports.** `import { bkdashNotifications,
  bkdashNotificationDeliveries } from '@template/contracts-db/schema/bkdash_notifications'`
  (verify the alias maps to `packages/contracts/db/schema/`; otherwise
  use the relative path the `auth` repo uses for `users`/`accounts`).
- **Sales `OrderUpdated`.** Authored in
  `packages/contracts/wire/events/order-updated.tsp`. Has `isNew: boolean`
  field used for the per-Store gate (per spec §4 BC10).
- **Identity FCM events.** Spec calls for `shared.fcm_token.registered`
  + `shared.fcm_token.unregistered` + `shared.user_preferences.updated` —
  these are P1-IDENTITY deliverables in
  `packages/contracts/wire/events/`. Currently MISSING from the wire/
  folder (verified by `ls packages/contracts/wire/events/`). Tracked
  via `# QUESTION` 7 — Task 20 codes against placeholder event classes
  defined in P1-IDENTITY's plan.
- **Tenancy `store_member.invited`.** Spec calls for
  `shared.store_member.invited` — P2-TENANCY deliverable. MISSING from
  `packages/contracts/wire/events/`. `# QUESTION` 8 — Task 17 codes
  against a placeholder event class P2 will deliver.
- **Integration `handshake_failed`.** Already present:
  `packages/contracts/wire/events/integration-handshake-failed.tsp`.
- **Test placement.** Colocated `<File>.test.ts`. Integration tests
  resolve via `TestBed.create('integration', { testContainer, ownerId })`
  per `packages/api/typescript/src/auth/controllers/GetSession.test.ts`
  shape. Process-level flows live under
  `packages/api/typescript/tests/flows/`.
- **MEMORY note (cross-process boundary).** `givenEvent` seeds the
  `shared.events` outbox for cross-process tests only. **In-process
  handler tests instantiate the event class and call
  `handler.handle(event)` directly** — Tasks 17, 18, 19, 20 follow this.

---

## 1. Subscription Matrix (load-bearing — every external handler maps to one row)

| Source BC | Integration event | Notifications reaction | `NotificationCategory` | `origin` | Channels | Recipient resolution |
|---|---|---|---|---|---|---|
| Identity | `shared.fcm_token.registered` | Refresh routing cache for the user (no notification dispatched) | — | — | — | n/a (cache mutation) |
| Identity | `shared.fcm_token.unregistered` | Refresh routing cache for the user (no notification dispatched) | — | — | — | n/a (cache mutation) |
| Identity | `shared.user_preferences.updated` | Refresh routing cache (timezone, `dailyNotificationsEnabled`, `notificationCurrency`, `orderPushPerStore`) | — | — | — | n/a (cache mutation) |
| Tenancy | `shared.store_member.invited` | Send invitation email | `INVITATION` | `SYSTEM` | `EMAIL` | `targetEmail` from payload (User may not exist yet — see Task 12 `targetEmails?` branch) |
| Integration | `shared.integration.handshake_failed` | Notify Store OWNERs + ADMINs | `SYNC_ERROR` | `SYSTEM` | `IN_APP` + `PUSH` (if registered FCM tokens) + `EMAIL` (if `important = true`) | resolve `storeId → owners/admins` via Tenancy `StoreMembershipRepository` |
| Sales | `shared.order.updated` (only when `isNew === true` AND `identity.user_preferences.orderPushPerStore[storeId] === true`) | Per-order push | `ORDER_RECEIVED` | `SYSTEM` | `PUSH` (only) | per-User opt-in via `userPreferences.orderPushPerStore` lookup |

**Non-event-triggered:**
- `BkDashTriggerDailyDigestUseCase` (C54) — cron tick OR admin one-shot.
- `BkDashSendNotificationUseCase` (C53) — direct admin/system call.
- `BkDashMarkNotificationReadUseCase` (C55) — user click on inbox item.

> All handler implementations route through the **same**
> `BkDashSendNotificationUseCase` with a pre-built input. Handlers never
> poke repositories directly — keeps dedupe + delivery logic in one place.

---

## 2. File Structure

```
packages/api/typescript/src/notifications/          # SHARED with polyglot video-push BC
├── index.ts                                          # MODIFY: append BK Dash controllers/handlers to BoundedContext.create
├── registry.ts                                       # MODIFY: append BK Dash bindings + MailSender + FcmClient + DigestComposer
├── middlewares/
│   └── index.ts                                      # EXISTS (polyglot) — append BK Dash defaults if any
├── enums/
│   ├── index.ts                                      # MODIFY: add BkDashDeliveryStatus export
│   └── BkDashDeliveryStatus.ts                       # NEW — PENDING | SENT | FAILED | READ (matches `notification_deliveries.status` column)
├── objects/
│   ├── index.ts                                      # MODIFY: append BkDashContentHash export
│   ├── BkDashContentHash.ts                          # NEW — value object — sha256(category|recipientUserId|content-defining subset)
│   └── BkDashContentHash.test.ts
├── entities/
│   ├── index.ts                                      # MODIFY: append exports
│   ├── BkDashNotification.ts                         # NEW — aggregate root mapping to notify.notifications
│   ├── BkDashNotification.test.ts
│   ├── BkDashNotificationDelivery.ts                 # NEW — child aggregate mapping to notify.notification_deliveries
│   └── BkDashNotificationDelivery.test.ts
├── errors/
│   └── index.ts                                      # MODIFY: register TARGET_USERS_OR_STORE_REQUIRED, NOTIFICATION_DELIVERY_NOT_FOUND
├── events/
│   ├── index.ts                                      # MODIFY: append BK Dash domain event exports
│   ├── BkDashNotificationCreatedEvent.ts
│   ├── BkDashNotificationDeliveredEvent.ts
│   ├── BkDashNotificationDeliveryFailedEvent.ts
│   ├── BkDashNotificationReadEvent.ts
│   ├── BkDashDailyDigestSentEvent.ts
│   └── BkDashEvents.test.ts                          # one combined test asserting names + schemas
├── repositories/
│   ├── index.ts                                      # MODIFY: append exports
│   ├── BkDashNotificationRepository/
│   │   ├── index.ts
│   │   ├── BkDashNotificationRepository.ts           # interface
│   │   ├── DrizzleBkDashNotificationRepository.ts
│   │   ├── DrizzleBkDashNotificationRepository.test.ts
│   │   └── MockBkDashNotificationRepository.ts
│   └── BkDashNotificationDeliveryRepository/
│       ├── index.ts
│       ├── BkDashNotificationDeliveryRepository.ts
│       ├── DrizzleBkDashNotificationDeliveryRepository.ts
│       ├── DrizzleBkDashNotificationDeliveryRepository.test.ts
│       └── MockBkDashNotificationDeliveryRepository.ts
├── services/
│   ├── (existing polyglot: PushDeliveryService.ts, LogPushDeliveryService.ts, MockPushDeliveryService.ts — DO NOT TOUCH)
│   ├── BkDashChannelDispatcher.ts                    # NEW — abstract port
│   ├── BkDashEmailNotificationDispatcher.ts          # NEW — adapter over MailSender
│   ├── BkDashPushNotificationDispatcher.ts           # NEW — adapter over BkDashFcmClient
│   ├── BkDashInAppNotificationDispatcher.ts          # NEW — no-op
│   ├── BkDashFcmClient.ts                            # NEW — port (abstract class)
│   ├── BkDashConsoleFcmClient.ts                     # NEW — default impl (logs)
│   ├── BkDashDedupeService.ts                        # NEW — 15-min sliding window query
│   ├── BkDashDedupeService.test.ts
│   ├── BkDashDigestComposer.ts                       # NEW — port (P11 supplies real impl)
│   ├── BkDashStubDigestComposer.ts                   # NEW — default impl
│   ├── BkDashFcmTokenLookup.ts                       # NEW — port abstracted over identity fcm_registration_tokens (so we don't reach into Identity directly)
│   ├── BkDashRoutingCache.ts                         # NEW — in-memory routing cache (per-process Map)
│   ├── BkDashEmailDispatcher.test.ts
│   └── BkDashPushDispatcher.test.ts
├── usecases/
│   ├── index.ts                                      # MODIFY: append exports
│   ├── BkDashSendNotification.ts                     # C53
│   ├── BkDashSendNotification.test.ts
│   ├── BkDashTriggerDailyDigest.ts                   # C54
│   ├── BkDashTriggerDailyDigest.test.ts
│   ├── BkDashMarkNotificationRead.ts                 # C55
│   └── BkDashMarkNotificationRead.test.ts
├── queries/
│   ├── index.ts
│   ├── BkDashNotificationsInboxQuery.ts              # T37 — direct Drizzle BFF read
│   └── BkDashNotificationsInboxQuery.test.ts
├── controllers/
│   ├── index.ts                                      # MODIFY: append BK Dash controllers
│   ├── BkDashSendNotificationController.ts           # POST /bk-dash/notifications
│   ├── BkDashTriggerDailyDigestController.ts         # POST /bk-dash/notifications/daily-digest
│   ├── BkDashMarkNotificationReadController.ts       # POST /bk-dash/notifications/deliveries/:notificationDeliveryId/read
│   └── BkDashNotificationsInboxController.ts         # GET /bk-dash/notifications/inbox
└── handlers/
    ├── (existing: NotifySubscribersHandler.ts — polyglot video — DO NOT TOUCH)
    ├── external.ts                                   # MODIFY: append BK Dash external handler exports
    ├── internal.ts                                   # MODIFY (no-op for P10 — no internal handlers)
    ├── BkDashOnFcmTokenRegistered.ts                 # Identity → routing cache refresh
    ├── BkDashOnFcmTokenUnregistered.ts               # Identity → routing cache refresh
    ├── BkDashOnUserPreferencesUpdated.ts             # Identity → routing cache refresh
    ├── BkDashOnStoreMemberInvited.ts                 # Tenancy → INVITATION email
    ├── BkDashOnIntegrationHandshakeFailed.ts         # Integration → SYNC_ERROR multi-channel
    ├── BkDashOnOrderUpdated.ts                       # Sales → per-Store opt-in ORDER_RECEIVED push
    └── BkDashIdentityCacheRefresh.test.ts            # combined test for the cache-refresh trio
```

**Framework addition (Task 8 only) — outside the BC:**
```
packages/api/typescript/core/src/services/MailSender/
├── index.ts
├── MailSender.ts                                   # abstract class — sendMail({to, subject, body, ...})
└── ConsoleMailSender.ts                            # default impl (logs)
```

**No migration in this sub-plan.** `packages/contracts/db/schema/bkdash_notifications.ts`
is **already authored** (iter 42). The generated SQL has already been
applied. P10 only consumes those tables; no `/migrate` step.

---

## 3. Phase / Wave / Classification Map (per `/task-breakdown`)

This sub-plan produces 21 Tasks across 3 phases. Auto-applied because it
crosses 6 BCs in the subscription matrix and ships ≥10 artifacts.

| Task # | Title | Phase | Wave | Classification |
|---|---|---|---|---|
| T01 | `BkDashDeliveryStatus` enum + barrel update | 0 (Contract Lock) | W0 | parallel-now |
| T02 | `BkDashContentHash` value object | 0 | W0 | parallel-now |
| T03 | `BkDashNotification` entity + invariants | 1 (Behavior Slice) | W1 | parallel-after-contract |
| T04 | `BkDashNotificationDelivery` entity + invariants | 1 | W1 | parallel-after-contract |
| T05 | Five domain events (Created/Delivered/DeliveryFailed/Read/DailyDigestSent) | 0 | W0 | parallel-now |
| T06 | Verify wire/db imports + register errors (TARGET_USERS_OR_STORE_REQUIRED, NOTIFICATION_DELIVERY_NOT_FOUND) | 0 | W0 | serial |
| T07 | `BkDashNotificationRepository` + `BkDashNotificationDeliveryRepository` (interface + Drizzle + Mock) | 1 | W2 | parallel-after-contract |
| T08 | Framework `MailSender` (core) + BC ports (`BkDashChannelDispatcher`, `BkDashFcmClient`, `BkDashDigestComposer`, `BkDashFcmTokenLookup`, `BkDashRoutingCache`) + defaults | 0 | W0 | parallel-now |
| T09 | `BkDashEmailNotificationDispatcher` (over MailSender) + `BkDashInAppNotificationDispatcher` (no-op) | 1 | W2 | parallel-after-contract |
| T10 | `BkDashPushNotificationDispatcher` (over `BkDashFcmClient` + `BkDashFcmTokenLookup`) | 1 | W2 | parallel-after-contract |
| T11 | `BkDashDedupeService` (15-min window via `contentHash`) | 1 | W2 | parallel-after-contract |
| T12 | `BkDashSendNotificationUseCase` (C53) — wires dedupe + channel fan-out + emits the three domain events | 1 | W3 | serial |
| T13 | `BkDashMarkNotificationReadUseCase` (C55) — idempotent, emits `BkDashNotificationReadEvent` only on first read | 1 | W3 | parallel-after-wave-2 |
| T14 | `BkDashTriggerDailyDigestUseCase` (C54) — hourly cron, timezone gate, `dailyNotificationsEnabled` gate, admin escape hatch | 1 | W3 | parallel-after-wave-2 |
| T15 | `BkDashNotificationsInboxQuery` (T37) — direct Drizzle BFF read, scoped by `userId` | 1 | W3 | parallel-after-wave-2 |
| T16 | 4 controllers (Send / TriggerDailyDigest / MarkRead / Inbox) | 0 (Contract Lock) | W4 | serial |
| T17 | External handler: `BkDashOnStoreMemberInvited` (Tenancy → INVITATION email) | 2 (Integration) | W5 | parallel-now |
| T18 | External handler: `BkDashOnIntegrationHandshakeFailed` (Integration → SYNC_ERROR multi-channel) | 2 | W5 | parallel-now |
| T19 | External handler: `BkDashOnOrderUpdated` (Sales → per-Store opt-in ORDER_RECEIVED push) | 2 | W5 | parallel-now |
| T20 | External handlers: `BkDashOnFcmTokenRegistered/Unregistered/UserPreferencesUpdated` (Identity cache-refresh trio) | 2 | W5 | parallel-now |
| T21 | Registry wiring, `index.ts` boot (mount router + register handlers), `bun run codegen`, end-to-end flow test | 2 (Integration / QA) | W6 | serial |

---

## Task 1: `BkDashDeliveryStatus` enum

**Files:**
- Create: `packages/api/typescript/src/notifications/enums/BkDashDeliveryStatus.ts`
- Modify: `packages/api/typescript/src/notifications/enums/index.ts` (append export)
- Test: `packages/api/typescript/src/notifications/enums/BkDashDeliveryStatus.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum
**Depends on:** (none — wire enums already authored in `packages/contracts/wire/enums/`)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { BkDashDeliveryStatus, BkDashDeliveryStatusSchema } from './BkDashDeliveryStatus'

describe('BkDashDeliveryStatus', () => {
  it('exposes the four lifecycle values matching notify.notification_deliveries.status', () => {
    expect(BkDashDeliveryStatus.PENDING).toBe('PENDING')
    expect(BkDashDeliveryStatus.SENT).toBe('SENT')
    expect(BkDashDeliveryStatus.FAILED).toBe('FAILED')
    expect(BkDashDeliveryStatus.READ).toBe('READ')
  })
  it('schema rejects unknown', () => {
    expect(BkDashDeliveryStatusSchema.safeParse('DELIVERED').success).toBe(false)
  })
})
```

- [ ] **Step 2: Verify failure** — `bun test packages/api/typescript/src/notifications/enums`
- [ ] **Step 3: Implement** — `export const BkDashDeliveryStatus = { PENDING: 'PENDING', SENT: 'SENT', FAILED: 'FAILED', READ: 'READ' } as const` + `BkDashDeliveryStatusSchema = z.nativeEnum(...)`.
  > Note: the values **MUST** match the strings allowed by the
  > `notify.notification_deliveries.status` text column (PENDING | SENT |
  > FAILED | READ — verified by reading the schema file).
- [ ] **Step 4: Verify pass + `bun tsc` + `bun lint`.**
- [ ] **Step 5: Commit** — `feat(notifications): BkDashDeliveryStatus enum (P10 Task 1)`.

---

## Task 2: `BkDashContentHash` value object

**Files:**
- Create: `packages/api/typescript/src/notifications/objects/BkDashContentHash.ts`
- Modify: `packages/api/typescript/src/notifications/objects/index.ts` (append)
- Test: `packages/api/typescript/src/notifications/objects/BkDashContentHash.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /value-object
**Depends on:** (none)

- [ ] **Step 1: Test (red)** —
  - `BkDashContentHash.fromParts({ category, recipientUserId, title, body, payloadSubset? }).value` returns a sha256 hex string.
  - Two equivalent inputs (same category/recipient/title/body/payloadSubset) produce the same hash.
  - Payload-key ordering does NOT affect the hash (canonicalize via JSON sort).
  - `value` matches the column type — string (the schema uses `text`).
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** — `BkDashContentHash.fromParts(parts)` uses `new Bun.CryptoHasher('sha256')` and a canonical JSON-sort helper. Class extends `ValueObject` from `@template/core-typescript`.
- [ ] **Step 4: Verify pass + tsc + lint.**
- [ ] **Step 5: Commit** — `feat(notifications): BkDashContentHash value object for 15-min dedupe (P10 Task 2)`.

---

## Task 3: `BkDashNotification` entity + invariants

**Files:**
- Create: `packages/api/typescript/src/notifications/entities/BkDashNotification.ts`
- Modify: `packages/api/typescript/src/notifications/entities/index.ts`
- Test: `packages/api/typescript/src/notifications/entities/BkDashNotification.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /schema, /errors
**Depends on:** Task 1, Task 2, Task 6

- [ ] **Step 1: Test (red)** — `BkDashNotification.create({...})`:
  - Builds with valid `recipientUserId`, `storeId?`, `category`,
    `origin`, `title`, `body`, `payload?`.
  - Computes `contentHash` automatically via `BkDashContentHash.fromParts`.
  - Rejects empty `title` / empty `body` with `INVALID_ENTITY`.
  - Allows `storeId = undefined` (system-wide broadcast — schema column is nullable).
  - `recipientUserId` is **required** per the schema (`.notNull()`) — entity raises on omission.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** — class extends `BaseEntity<typeof BkDashNotificationSchema>`, `static schema = BkDashNotificationSchema`, `static create(input)`, business helpers (`eligibleChannels(prefs)`). Invariants raise `BaseError<NotificationsErrors | BaseDomainErrors>`. Use `NotificationCategory` + `NotificationOrigin` from `@template/contracts-typescript/wire`.
- [ ] **Step 4: Verify pass + tsc + lint.**
- [ ] **Step 5: Commit** — `feat(notifications): BkDashNotification aggregate root (P10 Task 3)`.

---

## Task 4: `BkDashNotificationDelivery` entity + invariants

**Files:**
- Create: `packages/api/typescript/src/notifications/entities/BkDashNotificationDelivery.ts`
- Modify: `packages/api/typescript/src/notifications/entities/index.ts`
- Test: `packages/api/typescript/src/notifications/entities/BkDashNotificationDelivery.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity
**Depends on:** Task 1, Task 3

- [ ] **Step 1: Test (red)** —
  - `BkDashNotificationDelivery.create({ notificationId, channel })` → `status = PENDING`, `deliveredAt = readAt = null`, `attemptCount = 0`.
  - `markSent(at, externalDeliveryId?)` flips `status = SENT`, sets `deliveredAt`, increments `attemptCount`.
  - `markFailed(at, reason)` flips `status = FAILED`, sets `lastError`, increments `attemptCount`.
  - `markRead(at)` flips `status = READ`, sets `readAt`; **idempotent** — calling twice keeps original `readAt`.
  - `markRead` from `PENDING` is allowed ONLY for `PUSH` channel (FCM may deliver-then-read without server-side `markSent` — see `# QUESTION` 2). For `EMAIL` / `IN_APP` channels it raises `INVALID_ENTITY`.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify pass + tsc + lint.**
- [ ] **Step 5: Commit** — `feat(notifications): BkDashNotificationDelivery child aggregate (P10 Task 4)`.

---

## Task 5: Five domain events

**Files:**
- Create: `packages/api/typescript/src/notifications/events/BkDashNotificationCreatedEvent.ts`
- Create: `packages/api/typescript/src/notifications/events/BkDashNotificationDeliveredEvent.ts`
- Create: `packages/api/typescript/src/notifications/events/BkDashNotificationDeliveryFailedEvent.ts`
- Create: `packages/api/typescript/src/notifications/events/BkDashNotificationReadEvent.ts`
- Create: `packages/api/typescript/src/notifications/events/BkDashDailyDigestSentEvent.ts`
- Modify: `packages/api/typescript/src/notifications/events/index.ts` (append exports)
- Test: `packages/api/typescript/src/notifications/events/BkDashEvents.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /event
**Depends on:** Task 1

- [ ] **Step 1: Test** — instantiate each event with a sample payload, assert the static `name` matches:
  - `BkDashNotificationCreatedEvent` → `'notifications.bk_dash_notification.created'`
  - `BkDashNotificationDeliveredEvent` → `'notifications.bk_dash_delivery.delivered'`
  - `BkDashNotificationDeliveryFailedEvent` → `'notifications.bk_dash_delivery.failed'`
  - `BkDashNotificationReadEvent` → `'notifications.bk_dash_delivery.read'`
  - `BkDashDailyDigestSentEvent` → `'notifications.bk_dash_digest.sent'`

  Per spec §4 BC10 payloads:
  - `BkDashNotificationCreatedEvent { notificationId, category, recipientUserId, storeId? }`
  - `BkDashNotificationDeliveredEvent { notificationDeliveryId, notificationId, channel, externalDeliveryId? }`
  - `BkDashNotificationDeliveryFailedEvent { notificationDeliveryId, notificationId, channel, reason }`
  - `BkDashNotificationReadEvent { notificationDeliveryId, notificationId, userId, readAt }`
  - `BkDashDailyDigestSentEvent { userId, storeId, sentAt, notificationCurrency }`

- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** — use `z.domainEvent({...})` from `@template/core-typescript`; mirror `packages/api/typescript/src/auth/events/UserRegisteredEvent.ts`.
- [ ] **Step 4: Verify pass + tsc + lint.**
- [ ] **Step 5: Commit** — `feat(notifications): five BK Dash domain events for delivery lifecycle (P10 Task 5)`.

---

## Task 6: Verify wire/db imports + register errors

**Files:**
- Modify: `packages/api/typescript/src/notifications/errors/index.ts` (add `BkDash`-prefixed exports + register codes)
- (No new code path file — Task 6 also validates `import { NotificationCategory } from '@template/contracts-typescript/wire'` resolves and `import { bkdashNotifications, bkdashNotificationDeliveries } from '<db-alias>'` resolves.)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /errors
**Depends on:** (Iter 41 wire codegen, Iter 42 contracts/db schema)

- [ ] **Step 1: Verify generated wire path.** Run `find packages/contracts/generated/typescript/wire -name "notification-*"` — assert the five notification enums (`category`, `channel`, `origin`, `kind`, `currency-mode`) are emitted.
- [ ] **Step 2: Verify db-schema import path.** Run `grep -r "bkdash_notifications" packages/api/typescript/tsconfig*.json packages/api/typescript/package.json` — assert the alias `@template/contracts-db` (or equivalent) maps `packages/contracts/db/schema/`. If absent, document the **relative** import path the BC will use.
- [ ] **Step 3: Register error codes.** Per `packages/api/typescript/src/auth/errors/index.ts` pattern: append `BkDashNotificationsErrors = 'TARGET_USERS_OR_STORE_REQUIRED' | 'NOTIFICATION_DELIVERY_NOT_FOUND'`. Register each code's HTTP status (400 + 404 respectively) via the framework's error registry side-effect.
- [ ] **Step 4: Test (red→green)** — a tiny test asserts `new BaseError<BkDashNotificationsErrors>('TARGET_USERS_OR_STORE_REQUIRED')` maps to HTTP 400 via `GlobalErrorMapper`.
- [ ] **Step 5: Verify pass + tsc + lint.**
- [ ] **Step 6: Commit** — `feat(notifications): register BK Dash error codes + verify wire/db imports (P10 Task 6)`.

---

## Task 7: Repositories (interface + Drizzle + Mock for both aggregates)

**Files:**
- Create: `packages/api/typescript/src/notifications/repositories/BkDashNotificationRepository/{index,BkDashNotificationRepository,DrizzleBkDashNotificationRepository,MockBkDashNotificationRepository,DrizzleBkDashNotificationRepository.test}.ts`
- Create: `packages/api/typescript/src/notifications/repositories/BkDashNotificationDeliveryRepository/{index,BkDashNotificationDeliveryRepository,DrizzleBkDashNotificationDeliveryRepository,MockBkDashNotificationDeliveryRepository,DrizzleBkDashNotificationDeliveryRepository.test}.ts`
- Modify: `packages/api/typescript/src/notifications/repositories/index.ts` (append exports — preserve existing `SubscriptionReadRepository` export)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository
**Depends on:** Task 6

**Required methods (`BkDashNotificationRepository`):**
- `save(notification: BkDashNotification): Promise<void>`
- `findById(id: string): Promise<BkDashNotification | null>`
- `findRecentByContentHash(args: { recipientUserId: string; contentHash: string; sinceMs: number }): Promise<BkDashNotification | null>` — backs the 15-min dedupe window via index `notifications_recipient_content_hash_idx`.

**Required methods (`BkDashNotificationDeliveryRepository`):**
- `save(delivery: BkDashNotificationDelivery): Promise<void>`
- `saveMany(deliveries: BkDashNotificationDelivery[]): Promise<void>`
- `findById(id: string): Promise<BkDashNotificationDelivery | null>`
- `findByIdForUser(id: string, userId: string): Promise<BkDashNotificationDelivery | null>` — authz scope for `BkDashMarkNotificationReadUseCase`. JOINs `notifications` to filter by `recipient_user_id`.

- [ ] **Step 1: Tests (red)** — integration tests per method using `TestBed.create('integration', { testContainer, ownerId: 'p10-notifications' })`. Use the polyglot `TestBed` from `packages/api/typescript/tests/support/`.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** — Drizzle for `real`/`integration` (importing `bkdashNotifications` / `bkdashNotificationDeliveries` from the contracts package), in-memory Map for `mock`. Mirror `packages/api/typescript/src/auth/repositories/UserRepository/`.
- [ ] **Step 4: Verify pass + tsc + lint.**
- [ ] **Step 5: Commit** — `feat(notifications): BkDash Notification + NotificationDelivery repositories (P10 Task 7)`.

---

## Task 8: Framework `MailSender` (core) + BC ports (`BkDashChannelDispatcher`, `BkDashFcmClient`, `BkDashDigestComposer`, `BkDashFcmTokenLookup`, `BkDashRoutingCache`) + defaults

> **Iter-44 partial:** `MailSender` (core abstract + `ConsoleMailSender` default + `index.ts` + tests + `core/src/index.ts` export) shipped in commit `<iter 44>`. The seven BC ports remain to be authored in a follow-up slice — they live in `packages/api/typescript/src/notifications/services/` and will land alongside the BC build.

**Files:**
- Create: `packages/api/typescript/core/src/services/MailSender/MailSender.ts` (abstract class) + `ConsoleMailSender.ts` + `index.ts`
- Modify: `packages/api/typescript/core/src/index.ts` (export `MailSender` + `ConsoleMailSender`)
- Create: `packages/api/typescript/src/notifications/services/BkDashChannelDispatcher.ts`
- Create: `packages/api/typescript/src/notifications/services/BkDashFcmClient.ts`
- Create: `packages/api/typescript/src/notifications/services/BkDashConsoleFcmClient.ts`
- Create: `packages/api/typescript/src/notifications/services/BkDashDigestComposer.ts`
- Create: `packages/api/typescript/src/notifications/services/BkDashStubDigestComposer.ts`
- Create: `packages/api/typescript/src/notifications/services/BkDashFcmTokenLookup.ts`
- Create: `packages/api/typescript/src/notifications/services/BkDashRoutingCache.ts`
- Test: `packages/api/typescript/core/src/services/MailSender/ConsoleMailSender.test.ts`
- Test: `packages/api/typescript/src/notifications/services/BkDashConsoleFcmClient.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer (Contract Lock — `MailSender` becomes a polyglot framework export)
**Model:** sonnet
**Skills:** /service
**Depends on:** Task 1

- [ ] **Step 1: Test (red)** — `ConsoleMailSender.sendMail({ to, subject, body })` resolves and logs; `BkDashConsoleFcmClient.sendPush({ tokens, title, body, data })` resolves and logs; `BkDashStubDigestComposer.compose({ userId, storeId, dateRange, currency })` returns a placeholder `{ title, body, payload }`; `BkDashRoutingCache.get(userId)` returns `undefined` after `invalidate(userId)`.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement.** Mirror polyglot core's pattern (see `packages/api/typescript/core/src/services/Mediator/`). The `BkDashChannelDispatcher` exposes:
```typescript
abstract dispatch(
  channel: NotificationChannel,
  delivery: BkDashNotificationDelivery,
  context: {
    notification: BkDashNotification
    recipient: { userId: string; email?: string }
  }
): Promise<{ sentAt: Date; externalDeliveryId?: string } | { failedAt: Date; reason: string }>
```
`BkDashFcmTokenLookup` exposes `tokensForUser(userId): Promise<string[]>` — implementation injects a port that P1-IDENTITY's `FcmRegistrationTokenRepository` will satisfy (see `# QUESTION` 3).
- [ ] **Step 4: Verify pass + tsc + lint.**
- [ ] **Step 5: Commit** — `feat(core,notifications): MailSender (core) + BK Dash dispatcher/FcmClient/DigestComposer/FcmTokenLookup/RoutingCache ports + defaults (P10 Task 8)`.

---

## Task 9: `BkDashEmailNotificationDispatcher` + `BkDashInAppNotificationDispatcher`

**Files:**
- Create: `packages/api/typescript/src/notifications/services/BkDashEmailNotificationDispatcher.ts`
- Create: `packages/api/typescript/src/notifications/services/BkDashInAppNotificationDispatcher.ts`
- Test: `packages/api/typescript/src/notifications/services/BkDashEmailDispatcher.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service
**Depends on:** Task 8

- [ ] **Step 1: Test (red)** — `BkDashEmailNotificationDispatcher.dispatch(...)` calls `MailSender.sendMail({ to: recipient.email, subject: notification.title, body: notification.body })`. When `recipient.email` is undefined → returns `{ failedAt, reason: 'NO_EMAIL_ADDRESS' }`. On MailSender throw → returns `{ failedAt, reason: <err.message> }`.
  `BkDashInAppNotificationDispatcher.dispatch(...)` resolves immediately with `{ sentAt: new Date() }`.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** — `@injectable()`, constructor injects `MailSender` from `@template/core-typescript`.
- [ ] **Step 4: Verify pass + tsc + lint.**
- [ ] **Step 5: Commit** — `feat(notifications): BkDash email + in-app channel dispatchers (P10 Task 9)`.

---

## Task 10: `BkDashPushNotificationDispatcher`

**Files:**
- Create: `packages/api/typescript/src/notifications/services/BkDashPushNotificationDispatcher.ts`
- Test: `packages/api/typescript/src/notifications/services/BkDashPushDispatcher.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service
**Depends on:** Task 8

- [ ] **Step 1: Test (red)** — `BkDashPushNotificationDispatcher.dispatch(...)`:
  - Calls `BkDashFcmTokenLookup.tokensForUser(recipient.userId)`.
  - When `tokens.length === 0` → returns `{ failedAt, reason: 'NO_DEVICE_TOKENS' }`.
  - Calls `BkDashFcmClient.sendPush({ tokens, title: notification.title, body: notification.body, data: notification.payload })`.
  - On FcmClient throw → returns `{ failedAt, reason: <err.message> }`.
  - On success → returns `{ sentAt, externalDeliveryId: <fcm message id from client> }`.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify pass + tsc + lint.**
- [ ] **Step 5: Commit** — `feat(notifications): BkDashPushNotificationDispatcher over BkDashFcmClient (P10 Task 10)`.

---

## Task 11: `BkDashDedupeService` — 15-min sliding window

**Files:**
- Create: `packages/api/typescript/src/notifications/services/BkDashDedupeService.ts`
- Test: `packages/api/typescript/src/notifications/services/BkDashDedupeService.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service
**Depends on:** Task 2, Task 7

- [ ] **Step 1: Test (red)** —
  - `isDuplicate({ recipientUserId, contentHash })` calls `BkDashNotificationRepository.findRecentByContentHash` with `sinceMs = Date.now() - 15 * 60_000`. Returns `true` iff a row exists.
  - For multiple recipients: input `{ recipientUserIds[], contentHash }` → output `{ allowedUserIds[], skippedDuplicateUserIds[] }`.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify pass + tsc + lint.**
- [ ] **Step 5: Commit** — `feat(notifications): BkDashDedupeService 15-min sliding window (P10 Task 11)`.

---

## Task 12: `BkDashSendNotificationUseCase` (C53)

**Files:**
- Create: `packages/api/typescript/src/notifications/usecases/BkDashSendNotification.ts`
- Test: `packages/api/typescript/src/notifications/usecases/BkDashSendNotification.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /schema, /usecase, /test
**Depends on:** Task 3, Task 4, Task 7, Task 9, Task 10, Task 11

**InputSchema (verbatim from spec §7.10 C53):**
```typescript
{
  storeId?: string;
  targetUserIds?: string[];
  targetEmails?: string[];   // bypass user lookup for invitee flow (Task 17)
  title: string;             // .min(1)
  body: string;              // .min(1)
  category: NotificationCategory;
  origin: NotificationOrigin;  // default SYSTEM
  channels: NotificationChannel[];  // explicit channel set; respects user prefs
  important: boolean;
  payload?: Record<string, unknown>;
}
```

**OutputSchema:**
```typescript
{
  notificationIds: string[];   // one per (user OR email) recipient
  deliveriesCreated: number;
  deliveriesSkippedDuplicate: number;
}
```

**Errors:** `TARGET_USERS_OR_STORE_REQUIRED`, plus inherited `UNAUTHORIZED`, `FORBIDDEN`, `SESSION_EXPIRED`, `VALIDATION_ERROR`.

**Algorithm:**
1. Validate: at least one of `storeId`, `targetUserIds`, `targetEmails` MUST be set — else throw `TARGET_USERS_OR_STORE_REQUIRED`.
2. Resolve recipient set:
   - If `targetUserIds` → use them directly.
   - Else if `storeId` → resolve `storeId → all members` via `StoreMembershipRepository` (from P2-TENANCY — DI lookup).
   - `targetEmails` are kept as-is (email-only path for invitations).
3. Per recipient, build `BkDashContentHash.fromParts({ category, recipientUserId|email, title, body, payloadSubset })`.
4. Run `BkDashDedupeService.isDuplicate` per recipient → split into `allowed` / `skipped`.
5. For each allowed recipient: create one `BkDashNotification` row (`recipientUserId` for user-recipients; for email-only recipients see `# QUESTION` 6 — fallback is a `'email:<addr>'` synthetic recipientUserId or a separate column added in a follow-up; for now P10 skips dedupe on email-only and creates one notification per delivery).
6. For each `(notificationId, channel)` in `channels`, create `BkDashNotificationDelivery(PENDING)`, persist via `saveMany`.
7. For each delivery, dispatch via `BkDashChannelDispatcher` → on result, call `markSent` / `markFailed` and `save`.
8. Emit `BkDashNotificationCreatedEvent` per notification + `BkDashNotificationDeliveredEvent` or `BkDashNotificationDeliveryFailedEvent` per delivery.
9. Return `{ notificationIds, deliveriesCreated, deliveriesSkippedDuplicate }`.

- [ ] **Step 1: Test (red)** — cover algorithm:
  - Throws `TARGET_USERS_OR_STORE_REQUIRED` when all three target fields empty.
  - Returns `deliveriesSkippedDuplicate` count when dedupe service skips users.
  - Resolves Store members when only `storeId` given (use polyglot test helpers — verify name via `find packages/api/typescript/tests/support -name "given*"`).
  - Emits the three domain-event kinds in correct counts.
  - `targetEmails` branch creates notifications without StoreMembership lookup.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify pass + tsc + lint.**
- [ ] **Step 5: Commit** — `feat(notifications): BkDashSendNotificationUseCase (C53) with dedupe + channel fan-out (P10 Task 12)`.

---

## Task 13: `BkDashMarkNotificationReadUseCase` (C55)

**Files:**
- Create: `packages/api/typescript/src/notifications/usecases/BkDashMarkNotificationRead.ts`
- Test: `packages/api/typescript/src/notifications/usecases/BkDashMarkNotificationRead.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /schema, /usecase
**Depends on:** Task 4, Task 7

**InputSchema:** `{ notificationDeliveryId: string }`. **OutputSchema:** `void` (204).
**Errors:** `NOTIFICATION_DELIVERY_NOT_FOUND`, plus inherited `UNAUTHORIZED`, `SESSION_EXPIRED`.

**Algorithm:**
1. Resolve `userId` from auth context (via the auth middleware request augment — see `packages/api/typescript/src/auth/middlewares/AuthActorMiddleware.ts` for the pattern).
2. `findByIdForUser(notificationDeliveryId, userId)` — null → throw `NOTIFICATION_DELIVERY_NOT_FOUND` (covers both "doesn't exist" and "not your delivery").
3. If `delivery.readAt != null` → no-op (idempotent), return.
4. Else `delivery.markRead(now)`, `save`, emit `BkDashNotificationReadEvent`.

- [ ] **Step 1: Test (red).**
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify pass + tsc + lint.**
- [ ] **Step 5: Commit** — `feat(notifications): BkDashMarkNotificationReadUseCase (C55) (P10 Task 13)`.

---

## Task 14: `BkDashTriggerDailyDigestUseCase` (C54)

**Files:**
- Create: `packages/api/typescript/src/notifications/usecases/BkDashTriggerDailyDigest.ts`
- Test: `packages/api/typescript/src/notifications/usecases/BkDashTriggerDailyDigest.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /schema, /usecase, /test
**Depends on:** Task 8, Task 12

**InputSchema:** `{ runForUserId?: string }`. **OutputSchema:** `{ triggered: number; skippedDisabled: number; skippedTimezoneMismatch: number }`.
**Errors:** `USER_NOT_FOUND` (only when `runForUserId` given), `VALIDATION_ERROR`.

**Algorithm:**
1. If `runForUserId` set (admin escape hatch) → fetch just that User + UserPreferences; SKIP timezone gate AND `dailyNotificationsEnabled` gate.
2. Else: query `identity.user_preferences` directly via Drizzle (the BC owns this read because it's a cross-context BFF read for scheduling — no need to push it into Identity). Iterate.
3. For each user:
   - Compute local hour from `userPreferences.timezone` (IANA — e.g. via `Intl.DateTimeFormat(tz, { hour: '2-digit', hour12: false }).format(clock.now())`).
   - Gate: hour === 09 (else `skippedTimezoneMismatch++`).
   - Gate: `dailyNotificationsEnabled === true` OR admin override (else `skippedDisabled++`).
   - Resolve "primary store" — see `# QUESTION` 4: assumption = the Store with the most recent `lastAccess` on the User's `storeMemberships`. If none → skip (count `skippedDisabled`).
   - Call `BkDashDigestComposer.compose({ userId, storeId, dateRange: previousDay, currency: notificationCurrency })` → `{ title, body, payload }`.
   - Dispatch via `BkDashSendNotificationUseCase.execute({ targetUserIds: [userId], storeId, title, body, payload, category: 'DAILY_DIGEST', origin: 'SCHEDULER', channels: ['PUSH', 'EMAIL'], important: false })`.
   - Emit `BkDashDailyDigestSentEvent`.
   - `triggered++`.

- [ ] **Step 1: Test (red)** — three scenarios:
  - Admin escape hatch dispatches regardless of flags.
  - Timezone-mismatched user counts in `skippedTimezoneMismatch`.
  - Disabled user counts in `skippedDisabled`.
  - Mock `BkDashDigestComposer` via `BkDashStubDigestComposer`.
  - Inject a `Clock` port (`abstract class Clock { now(): Date }`) — `MockClock` in tests, `SystemClock` in `real`/`integration` registries (see `# QUESTION` 5; verify polyglot core already exposes a `Clock` — search `find packages/api/typescript/core/src -iname "clock*"` — if absent, add it under `core/src/utils/Clock.ts` as part of this task).
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify pass + tsc + lint.**
- [ ] **Step 5: Commit** — `feat(notifications): BkDashTriggerDailyDigestUseCase cron (C54) (P10 Task 14)`.

---

## Task 15: `BkDashNotificationsInboxQuery` (T37)

**Files:**
- Create: `packages/api/typescript/src/notifications/queries/BkDashNotificationsInboxQuery.ts`
- Create: `packages/api/typescript/src/notifications/queries/index.ts`
- Test: `packages/api/typescript/src/notifications/queries/BkDashNotificationsInboxQuery.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query
**Depends on:** Task 7

**InputSchema (verbatim §7.10 T37):**
```typescript
{
  unreadOnly?: boolean;
  categories?: NotificationCategory[];
  page: number;            // .int().positive()
  limit: number;           // .int().min(1).max(100)
}
```

**OutputSchema:**
```typescript
{
  total: number;
  unreadCount: number;
  items: Array<{
    notificationDeliveryId: string;
    notificationId: string;
    title: string;
    body: string;
    category: NotificationCategory;
    origin: NotificationOrigin;
    channel: NotificationChannel;
    payload?: Record<string, unknown>;
    deliveredAt: string | null;
    readAt: string | null;
  }>;
}
```

**Algorithm:** direct Drizzle SELECT joining `bkdashNotificationDeliveries` to `bkdashNotifications` on `notification_id`, filtered by `notifications.recipient_user_id = ctx.userId`, optional `deliveries.read_at IS NULL` when `unreadOnly`, optional `notifications.category IN (...)`, ordered by `deliveries.delivered_at DESC NULLS LAST, deliveries.created_at DESC`. `unreadCount` issued as a second query (cheap, exploits `notification_deliveries_status_idx`).

- [ ] **Step 1: Test (red)** — seed 5 deliveries (mix of read/unread, mixed categories), assert page/limit + unread filter + unreadCount.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify pass + tsc + lint.**
- [ ] **Step 5: Commit** — `feat(notifications): BkDashNotificationsInboxQuery (T37) (P10 Task 15)`.

---

## Task 16: Four controllers — Contract Lock

**Files:**
- Create: `packages/api/typescript/src/notifications/controllers/BkDashSendNotificationController.ts` — `POST /bk-dash/notifications`
- Create: `packages/api/typescript/src/notifications/controllers/BkDashTriggerDailyDigestController.ts` — `POST /bk-dash/notifications/daily-digest` (admin-only via `x-admin-secret` middleware)
- Create: `packages/api/typescript/src/notifications/controllers/BkDashMarkNotificationReadController.ts` — `POST /bk-dash/notifications/deliveries/:notificationDeliveryId/read`
- Create: `packages/api/typescript/src/notifications/controllers/BkDashNotificationsInboxController.ts` — `GET /bk-dash/notifications/inbox`
- Modify: `packages/api/typescript/src/notifications/controllers/index.ts` (APPEND BkDash exports; preserve any existing polyglot video-push controllers)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer (Contract Lock — both reviewers REQUIRED)
**Model:** sonnet
**Skills:** /controller, /schema
**Depends on:** Task 12, Task 13, Task 14, Task 15

> **Contract Lock note (per `/plan`):** these four controllers define the public HTTP surface of BC10. Any subsequent change is a Contract Break — the agent MUST regenerate codegen (`bun run codegen`) and update consumers at the same commit.

> **Path prefix `/bk-dash/`** is used to avoid colliding with polyglot's video-push routes if any get mounted under `/notifications/*` later. Verify by `grep -r "path = " packages/api/typescript/src/notifications/controllers/ --include="*.ts"` after Task 21.

- [ ] **Step 1: Test (red)** — controller-level tests (no DB; mock use-case) per `packages/api/typescript/src/auth/controllers/GetSession.test.ts` shape.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement.** Each controller extends `Controller<InputSchema, OutputSchema>`, lists `errors[]` per use-case glossary, mounts the auth middleware (`AuthActorMiddleware`) for C53/C55/T37 and the admin-secret middleware (verify name via `find packages/api/typescript/src -iname "*admin*"`) for C54.
- [ ] **Step 4: Run `bun run codegen`** (regenerates OpenAPI + the typed client). Confirm the four new routes appear in the emitted client.
- [ ] **Step 5: Verify pass + tsc + lint + codegen diff committed.**
- [ ] **Step 6: Commit** — `feat(notifications): 4 BK Dash controllers (C53/C54/C55 + T37) + codegen (P10 Task 16 — Contract Lock)`.

---

## Task 17: External handler — `BkDashOnStoreMemberInvited` (Tenancy → INVITATION email)

**Files:**
- Create: `packages/api/typescript/src/notifications/handlers/BkDashOnStoreMemberInvited.ts`
- Test: `packages/api/typescript/src/notifications/handlers/BkDashOnStoreMemberInvited.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler
**Depends on:** Task 12, P2-TENANCY (publishes `shared.store_member.invited`)

**Subscribes:** `shared.store_member.invited` (P2 deliverable; placeholder event class imported from `@template/contracts-typescript/wire` — see `# QUESTION` 8 if not yet authored).

**Expected payload:** `{ storeId, storeName, invitedEmail, invitedRole, invitationToken, inviterUserId }`.

**Reaction:** call `BkDashSendNotificationUseCase` with
- `storeId`, `targetEmails: [event.invitedEmail]` (invitee may not exist as a User yet — uses the email-only branch from Task 12),
- `title: 'You're invited to <storeName>'`,
- `body: '<inviterName-or-email> invited you to <storeName> as <invitedRole>. Click to accept.'`,
- `category: 'INVITATION'`, `origin: 'SYSTEM'`,
- `channels: ['EMAIL']`, `important: true`,
- `payload: { invitationToken, storeId, storeName }`.

- [ ] **Step 1: Test (red)** — instantiate the event class and call `handler.handle(event)` directly (per MEMORY note `feedback_givenevent_scope.md`). Assert `MailSender` spy was called with the expected `to`/`subject`.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify pass + tsc + lint.**
- [ ] **Step 5: Commit** — `feat(notifications): handler BkDashOnStoreMemberInvited → INVITATION email (P10 Task 17)`.

---

## Task 18: External handler — `BkDashOnIntegrationHandshakeFailed` (SYNC_ERROR multi-channel)

**Files:**
- Create: `packages/api/typescript/src/notifications/handlers/BkDashOnIntegrationHandshakeFailed.ts`
- Test: `packages/api/typescript/src/notifications/handlers/BkDashOnIntegrationHandshakeFailed.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler
**Depends on:** Task 12, P4-INTEGRATION (`shared.integration.handshake_failed` already authored in `packages/contracts/wire/events/integration-handshake-failed.tsp`)

**Subscribes:** `IntegrationHandshakeFailedEvent` from `@template/contracts-typescript/wire`.

**Reaction:**
1. Resolve `storeIntegrationId → storeId` via `StoreIntegrationRepository` (from P4-INTEGRATION).
2. Resolve `storeId → memberUserIds[]` filtered to roles `OWNER`, `ADMIN` via `StoreMembershipRepository` (from P2-TENANCY).
3. Call `BkDashSendNotificationUseCase` with `storeId`, `targetUserIds: memberUserIds`, title `'Integration sync error'`, body `'Your integration failed to connect: <reason>'`, `category: 'SYNC_ERROR'`, `origin: 'SYSTEM'`, `channels: ['IN_APP', 'PUSH', 'EMAIL']`, `important: true`, `payload: { storeIntegrationId, reason }`.

- [ ] **Step 1: Test (red).**
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify pass + tsc + lint.**
- [ ] **Step 5: Commit** — `feat(notifications): handler BkDashOnIntegrationHandshakeFailed → SYNC_ERROR multi-channel (P10 Task 18)`.

---

## Task 19: External handler — `BkDashOnOrderUpdated` (per-Store opt-in ORDER_RECEIVED push)

**Files:**
- Create: `packages/api/typescript/src/notifications/handlers/BkDashOnOrderUpdated.ts`
- Test: `packages/api/typescript/src/notifications/handlers/BkDashOnOrderUpdated.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler
**Depends on:** Task 12, P6-SALES (publishes `shared.order.updated`; `OrderUpdatedEvent` already authored in `packages/contracts/wire/events/order-updated.tsp`); P1-IDENTITY (`identity.user_preferences.orderPushPerStore` JSONB)

**Subscribes:** `OrderUpdatedEvent` from `@template/contracts-typescript/wire`.

**Gate:** only when `event.isNew === true` AND for each Store member, `userPreferences.orderPushPerStore[event.storeId] === true`.

**Reaction:** dispatch via `BkDashSendNotificationUseCase` per opted-in member with `category: 'ORDER_RECEIVED'`, `origin: 'SYSTEM'`, `channels: ['PUSH']`, `important: false`, title `'New order received'`, body `'Order #<orderNumber> for <total>'`, `payload: { orderId, orderNumber }`.

- [ ] **Step 1: Test (red)** — verify gating:
  - When `isNew === false` → no dispatch.
  - When `orderPushPerStore[storeId]` is `false` or missing → that user is skipped.
  - When some members opt in and others don't → only opted-in members receive the push.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify pass + tsc + lint.**
- [ ] **Step 5: Commit** — `feat(notifications): handler BkDashOnOrderUpdated → per-User opt-in ORDER_RECEIVED push (P10 Task 19)`.

---

## Task 20: External handlers — Identity cache-refresh trio

**Files:**
- Create: `packages/api/typescript/src/notifications/handlers/BkDashOnFcmTokenRegistered.ts`
- Create: `packages/api/typescript/src/notifications/handlers/BkDashOnFcmTokenUnregistered.ts`
- Create: `packages/api/typescript/src/notifications/handlers/BkDashOnUserPreferencesUpdated.ts`
- Test: `packages/api/typescript/src/notifications/handlers/BkDashIdentityCacheRefresh.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler
**Depends on:** Task 8, P1-IDENTITY (publishes the three `shared.*` events — see `# QUESTION` 7)

**Reaction:** each handler calls `BkDashRoutingCache.invalidate(userId)`. The cache value is `{ dailyNotificationsEnabled, notificationCurrency, notificationCurrencyMode, timezone, fcmTokens[], orderPushPerStore }` — used by `BkDashTriggerDailyDigestUseCase` and `BkDashPushNotificationDispatcher` to avoid chatty per-event DB hits.

- [ ] **Step 1: Test (red)** — for each handler, fire the event and assert `cache.get(userId)` is `undefined` afterward.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify pass + tsc + lint.**
- [ ] **Step 5: Commit** — `feat(notifications): BkDash Identity cache-refresh handlers (FCM tokens + UserPreferences) (P10 Task 20)`.

---

## Task 21: Registry wiring + boot + flow-test smoke + final codegen

**Files:**
- Modify: `packages/api/typescript/src/notifications/registry.ts` (append BkDash bindings; preserve existing polyglot bindings)
- Modify: `packages/api/typescript/src/notifications/index.ts` (extend the existing `BoundedContext.create(...)` call to include the four BkDash controllers, the six BkDash external handlers, and the BkDash registry; preserve existing polyglot controllers/handlers)
- Modify: `packages/api/typescript/src/notifications/handlers/external.ts` + `internal.ts` (append BkDash handler exports)
- Modify: `packages/api/typescript/src/index.ts` (no change expected — the notifications router is already mounted by `import NotificationsRouter from '@notifications/index'`)
- Create: `packages/api/typescript/tests/flows/bk-dash-notifications-end-to-end.flow.test.ts` — drives `BkDashSendNotificationUseCase` → asserts inbox query reflects the delivery → marks-as-read → asserts inbox shows zero unread

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer (Contract Lock part 2)
**Model:** sonnet
**Skills:** /bounded-context, /sdk, /test
**Depends on:** all previous Tasks

**Registry bindings (per CLAUDE.md §Skills & Registries):**
```typescript
INSTANCE_REGISTRY: InstanceRegistry = {
  mock: [
    // ...existing polyglot bindings (PushDeliveryService → MockPushDeliveryService, SubscriptionReadRepository → MockSubscriptionReadRepository)
    { token: BkDashNotificationRepository,         instance: MockBkDashNotificationRepository },
    { token: BkDashNotificationDeliveryRepository, instance: MockBkDashNotificationDeliveryRepository },
    { token: MailSender,                           instance: ConsoleMailSender },
    { token: BkDashFcmClient,                      instance: BkDashConsoleFcmClient },
    { token: BkDashDigestComposer,                 instance: BkDashStubDigestComposer },
    { token: BkDashFcmTokenLookup,                 instance: MockBkDashFcmTokenLookup },
    { token: BkDashRoutingCache,                   instance: InMemoryBkDashRoutingCache },
    { token: Clock,                                instance: MockClock },
  ],
  integration: [
    // ...existing polyglot
    { token: BkDashNotificationRepository,         instance: DrizzleBkDashNotificationRepository },
    { token: BkDashNotificationDeliveryRepository, instance: DrizzleBkDashNotificationDeliveryRepository },
    { token: MailSender,                           instance: ConsoleMailSender },
    { token: BkDashFcmClient,                      instance: BkDashConsoleFcmClient },
    { token: BkDashDigestComposer,                 instance: BkDashStubDigestComposer },
    { token: BkDashFcmTokenLookup,                 instance: DrizzleBkDashFcmTokenLookup },
    { token: BkDashRoutingCache,                   instance: InMemoryBkDashRoutingCache },
    { token: Clock,                                instance: SystemClock },
  ],
  real: [
    // ...existing polyglot
    { token: BkDashNotificationRepository,         instance: DrizzleBkDashNotificationRepository },
    { token: BkDashNotificationDeliveryRepository, instance: DrizzleBkDashNotificationDeliveryRepository },
    { token: MailSender,                           instance: ConsoleMailSender },  // real SMTP deferred — follow-up
    { token: BkDashFcmClient,                      instance: BkDashConsoleFcmClient }, // real Firebase deferred — follow-up
    { token: BkDashDigestComposer,                 instance: BkDashStubDigestComposer }, // real composer lands with P11-ANALYTICS
    { token: BkDashFcmTokenLookup,                 instance: DrizzleBkDashFcmTokenLookup },
    { token: BkDashRoutingCache,                   instance: InMemoryBkDashRoutingCache },
    { token: Clock,                                instance: SystemClock },
  ],
}
```

- [ ] **Step 1: Flow test (red)** — full happy path via `TestBed.create('integration', { testContainer, ownerId: 'p10-flow' })`.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Wire registry, mount BkDash controllers/handlers, verify `bun dev` boots without conflict with polyglot video-push.**
- [ ] **Step 4: Run `bun run codegen` and commit the diff.**
- [ ] **Step 5: Verify `bun tsc && bun lint && bun test` (E2E deferred to PE-E2E).**
- [ ] **Step 6: Commit** — `feat(notifications): boot BC10 + flow test + codegen regen (P10 Task 21)`.

---

## 4. Final Validation

- [ ] `bun tsc` — 0 errors across all workspaces.
- [ ] `bun lint` — 0 errors.
- [ ] `bun test affected --base=dev` — every Task's colocated test passes.
- [ ] `bun e2e --grep "@p10-notifications"` — N/A (E2E deferred to PE-E2E).
- [ ] `bun run codegen` regenerated; generated TS client diff committed.
- [ ] AC mapping (spec → test path):

| Spec ref | Test |
|---|---|
| C53 SendNotification — `TARGET_USERS_OR_STORE_REQUIRED` invariant | `usecases/BkDashSendNotification.test.ts` |
| C53 SendNotification — dedupe within 15-min window | `services/BkDashDedupeService.test.ts` + `usecases/BkDashSendNotification.test.ts` |
| C53 SendNotification — per-channel dispatch fan-out | `usecases/BkDashSendNotification.test.ts` |
| C54 TriggerDailyDigest — hourly cron behavior (timezone gate) | `usecases/BkDashTriggerDailyDigest.test.ts` |
| C54 TriggerDailyDigest — `dailyNotificationsEnabled` gate | `usecases/BkDashTriggerDailyDigest.test.ts` |
| C54 TriggerDailyDigest — admin escape hatch (`runForUserId`) | `usecases/BkDashTriggerDailyDigest.test.ts` |
| C55 MarkNotificationRead — idempotency | `entities/BkDashNotificationDelivery.test.ts` + `usecases/BkDashMarkNotificationRead.test.ts` |
| C55 MarkNotificationRead — emits `BkDashNotificationReadEvent` only on first read | `usecases/BkDashMarkNotificationRead.test.ts` |
| C55 MarkNotificationRead — `NOTIFICATION_DELIVERY_NOT_FOUND` authz scope | `usecases/BkDashMarkNotificationRead.test.ts` |
| T37 NotificationsInbox — pagination + unreadOnly + categories filter | `queries/BkDashNotificationsInboxQuery.test.ts` |
| T37 NotificationsInbox — `unreadCount` accuracy | `queries/BkDashNotificationsInboxQuery.test.ts` |
| BC10 subscriptions — Identity FCM/UserPreferences cache refresh | `handlers/BkDashIdentityCacheRefresh.test.ts` |
| BC10 subscriptions — Tenancy `store_member.invited` → invitation email | `handlers/BkDashOnStoreMemberInvited.test.ts` |
| BC10 subscriptions — Integration `handshake_failed` → SYNC_ERROR multi-channel | `handlers/BkDashOnIntegrationHandshakeFailed.test.ts` |
| BC10 subscriptions — Sales `order.updated` (per-User opt-in) → push | `handlers/BkDashOnOrderUpdated.test.ts` |
| End-to-end flow (send → inbox → read) | `tests/flows/bk-dash-notifications-end-to-end.flow.test.ts` |

---

## 5. Notes

- **Polyglot folder coexistence.** This sub-plan extends an existing BC folder rather than minting a new one. Every BK Dash file uses the `BkDash` prefix; every barrel APPENDS rather than rewrites. The video-push BC (polyglot's `NotifySubscribersHandler`, `PushDeliveryService`, `SubscriptionReadRepository`) remains operational.
- **PG schema partitioning.** Polyglot's video-push uses pgSchema `notifications` (in `notifications.ts`); BK Dash uses pgSchema `notify` (in `bkdash_notifications.ts`). No PG-level collision possible. TS-export names are `bkdashNotifications` / `bkdashNotificationDeliveries`.
- **MailSender placement.** Introduced as a **polyglot framework abstraction** under `packages/api/typescript/core/src/services/MailSender/` (Task 8). Matches the cross-language framework pattern (Go and Rust sides will gain equivalents in their respective `core/` packages in future iterations). This is intentional: mail is not BK-Dash-specific.
- **FcmClient placement.** Lives in the BC, not core — Firebase is a vendor concern specific to mobile push for BK Dash today. If Rust/Go ever needs FCM, promote to core then.
- **DigestComposer.** Until P11-ANALYTICS ships, `BkDashStubDigestComposer` returns a placeholder. P11 will register a real composer in its own `INSTANCE_REGISTRY` (per CLAUDE.md per-context DI composition).
- **In-process events in tests.** Per MEMORY note `feedback_givenevent_scope.md`, handler tests in Tasks 17–20 instantiate the event class and call `handler.handle(event)` directly. NEVER seed `shared.events` from within this BC's tests — those are cross-process fixtures.
- **Contract Lock scope.** Tasks 8 (new framework export), 16 (HTTP surface), and 21 (router mount + codegen) all require `spec-compliance-reviewer` + `code-reviewer`. Any change to controller paths, methods, or schemas after Task 16 lands MUST regenerate codegen in the same commit.
- **No new `shared.*` integration events** are produced by P10. The five domain events stay intra-context.
- **No `/migrate` step.** `packages/contracts/db/schema/bkdash_notifications.ts` was authored in iter 42; SQL migrations are already in place. P10 only consumes the tables.

---

## 6. Open questions (`# QUESTION` markers — proceed past these, do not block)

- **`# QUESTION` 1 — Per-User per-Store order-push opt-in.** Spec §4 BC10 hints at "optional per-Store per-order push notification". The contracts schema already lands `identity.user_preferences.orderPushPerStore JSONB` (verified by grep). **Assumption for this sub-plan:** the JSONB is `{ [storeId]: boolean }` and Task 19 reads it directly. If P1-IDENTITY ships a richer shape (e.g. `{ [storeId]: { push: boolean; email: boolean } }`), Task 19 adapts.

- **`# QUESTION` 2 — Push-to-read state transition.** A push notification is `SENT` when the FCM client confirms enqueue, but the user may "read" it on their device WITHOUT the server seeing `markSent` first. **Assumption:** allow `markRead` from `PENDING` for `PUSH` channel only; raise `INVALID_ENTITY` for `EMAIL` / `IN_APP`. Encoded in Task 4.

- **`# QUESTION` 3 — `BkDashFcmTokenLookup` ownership.** Should the abstraction live in this BC (importing `FcmRegistrationTokenRepository` from Identity is a name-only dependency) or be exposed as a public port from P1-IDENTITY? **Assumption:** define the port HERE in P10; bind it in `registry.ts` to a thin Drizzle adapter that reads `identity.fcm_registration_tokens` directly. If P1 publishes its own `FcmTokenLookup` port, this can be deleted.

- **`# QUESTION` 4 — "Primary store" for daily digest.** A User may belong to N Stores. **Assumption:** use the Store with the most recent `lastAccess` on the User's `storeMemberships` rows. If a user has no Store → skip and count as `skippedDisabled`. Encoded in Task 14.

- **`# QUESTION` 5 — Test clock.** Task 14 needs controlled time. **Assumption:** introduce a `Clock` port + `SystemClock` / `MockClock` defaults. First check `find packages/api/typescript/core/src -iname "clock*"` — if polyglot already has one, reuse; else add under `core/src/utils/Clock.ts` as part of Task 14.

- **`# QUESTION` 6 — Email-only recipient for invitations.** The invitee in `store_member.invited` may not yet be a User. `bkdashNotifications.recipient_user_id` is `notNull` per schema, so we cannot create a notification row keyed on email. **Assumption:** synthesize a deterministic surrogate `recipientUserId = uuidv5(BK_DASH_NAMESPACE, 'email:' + lowercase(email))` until P1 introduces an `unverified_users` table OR the schema gains a nullable `recipient_email` column. Encoded in Task 12; tests in Task 17 exercise this branch.

- **`# QUESTION` 7 — Identity events not yet authored.** `packages/contracts/wire/events/` does not yet contain `fcm-token-registered.tsp`, `fcm-token-unregistered.tsp`, `user-preferences-updated.tsp`. P1-IDENTITY owns authoring these. **Workaround for Task 20:** code against placeholder event classes named per the contracts pattern; revisit when P1 ships the wire files. If P1 lands a different shape, Task 20 adapts.

- **`# QUESTION` 8 — Tenancy `store_member.invited` not yet authored.** Same gap as `# QUESTION` 7. P2-TENANCY owns it. Task 17 codes against a placeholder; revisit when P2 ships.
