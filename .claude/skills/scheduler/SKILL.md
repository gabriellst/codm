# scheduler — scheduled reminders / deferred notifications canon

A "remind me later" / scheduled notification is **persist-when-scheduled + a deliver-due endpoint a
periodic worker polls** — never an in-process `setTimeout`, never delivering at request time.

## Persist scheduled, don't deliver now (SCH-01)

When a command carries a future `scheduledAt`, persist the work in a **SCHEDULED** state (a
`status` enum + a nullable `scheduledAt` column), and do NOT fire the delivery/event yet. When
`scheduledAt` is absent or already past, behave immediately (the existing path). The entity's
`create()` decides: `status = scheduledAt && scheduledAt > now ? SCHEDULED : DELIVERED`. Exemplar:
`NotificationDelivery` + `SendNotification` (skips `NotificationSentEvent` when future).

## A deliver-due use case is the seam (SCH-02)

A `DeliverDue<X>` use case loads rows that are due — `findDue(now)` = `status = SCHEDULED AND
scheduledAt <= now` (indexed on `scheduled_at`) — marks each delivered (`markDelivered()` → save)
and raises the same domain event the immediate path raises, so downstream handlers/projectors react
identically. Expose it as a controller (`POST /notifications/deliver-due`).

## The trigger is a thin periodic worker (SCH-03)

The periodic poller belongs in the **Go workers** (`packages/api/go` — "workers, indexers,
schedulers"), calling the deliver-due endpoint on a cron/ticker. The worker holds NO business logic —
it just pokes the seam. (Keep the cadence coarse; due-window precision is the `scheduledAt <= now`
query, not the poll frequency.)

## Anti-patterns

- `setTimeout`/`setInterval` in the request handler to defer delivery — lost on restart, not durable.
- Delivering at request time and ignoring `scheduledAt` (the stub this canon replaces).
- Business logic in the scheduler worker instead of behind the deliver-due use case.
- Polling without a `scheduled_at` index / a `status` filter (full-table scans every tick).
