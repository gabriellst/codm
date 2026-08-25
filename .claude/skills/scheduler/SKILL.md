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

### In THIS fork the trigger is a repeatable JOB, not a Go worker (SCH-03a)

`packages/api/go` here is the WhatsApp gateway, not a worker fleet — there is nothing on that side to
hang a ticker on, and a cross-service hop would buy nothing. What this repo has instead is a durable
scheduler in core: `SqliteCommandQueue` writes `shared_scheduled_commands` rows in the SAME SQLite
file as the domain, polls them once a second, and honours `opts.repeat.every` by RE-ARMING the row
after each run. `BoundedContext.create({ jobs: [{ handler, repeat: { every } }] })` is the one-line
registration — it resolves + binds the handler, registers it as a command handler, and upserts the
repeatable row.

So: still a deliver-due use case (SCH-02), still no business logic in the trigger — the trigger is
just `jobs:`. Exemplars: `AutoArchiveCompletedIssues` (hourly, `issue/index.ts`) and `FireDueLoops`
(per minute, `thread/index.ts`).

**A `setInterval` is never the answer here**, and the reason is sharper than durability in the
abstract: this daemon is a Tauri sidecar that dies every time the operator quits the desktop app.

### A missed run is a DECISION, not an accident (SCH-04)

A poller that was asleep when the alarm rang comes back to a row that is due *and stale*. Firing it
anyway is rarely right for anything a human sees: a 09:00 prompt delivered at 14:00 reads as broken,
and after a weekend's downtime the whole backlog fires in sequence. Give the sweep a grace window,
skip past it, and make "skipped" a DIFFERENT transition from "delivered" so the read model never
reports a delivery that did not happen (`Loop.skipRun` vs `Loop.markFired`).

## Anti-patterns

- `setTimeout`/`setInterval` in the request handler to defer delivery — lost on restart, not durable.
- Delivering at request time and ignoring `scheduledAt` (the stub this canon replaces).
- Business logic in the scheduler worker instead of behind the deliver-due use case.
- Polling without a `scheduled_at` index / a `status` filter (full-table scans every tick).
