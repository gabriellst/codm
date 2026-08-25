# Event ID Stability + Idempotency Foundation

**Date:** 2026-06-03
**Branch:** feat/ecommerce-fork-polyglot
**Status:** Draft — awaiting go/no-go on Wave 1

## Context

Long design thread (idempotency → Vaughn Vernon "Why I Hate the Outbox Pattern" → ordering).
Conclusions that ground this plan:

- Event ids are content-addressed SHA-1 UUIDv5 over the serialized event body
  (`BaseEvent.ts:17-22`, `Id.fromSeed`), **including wall-clock `time`** — so the id is
  NOT stable across re-raises of the same logical event. It's a per-instance hash, not a
  cross-retry dedup key.
- The repo already has Vernon's durable journal (`events` table, append-only) **and** the
  ephemeral outbox he criticizes (`outbox`, deleted on send in `DrizzleOutboxDispatcher.finalize`).
- Aggregates already carry `version` + `incrementVersion()` (`BaseEntity.ts:25`), persisted
  and rehydrated by every repo. BUT:
  - the **domain event never captures the version** (`BaseDomainEvent` has only
    `entityId`/`ownerId`/`payload`) — so the id can't seed on it today;
  - `incrementVersion()` runs **once per `save()`**, not per event;
  - "OCC" is **last-write-wins** — repos write `version` unconditionally via
    `onConflictDoUpdate`, there is no `WHERE version = expected` compare-and-swap anywhere.
- There are **zero Projectors** in `src/` today (base class unused). The actual event
  consumers are **handlers** (e.g. `src/sales/handlers/OrderUpdatedLinkCartHandler.ts`).
  → read-side is greenfield; the urgent idempotency surface is handlers.

## Problem

1. Event id includes wall-clock `time` → not retry-stable → unusable as a dedup/ordering key.
2. Consumers (handlers) have no framework idempotency; redelivery (outbox is at-least-once)
   relies on ad-hoc domain checks.
3. No replay-friendly dispatch substrate (the ephemeral outbox can't be reset/replayed and
   can't fan out to independently-paced subscribers).

## Goal

A stable, monotonic per-aggregate `version` on every domain event that serves three masters
at once — **id-stability, ordering key, and idempotency/replay guard** — without a
per-aggregate table migration (version columns already exist).

## Decisions (locked)

- **D1 — Version becomes a per-event sequence.** `version` advances per raised domain event,
  not per save. Event N on a stream carries the version it advances the aggregate *to*.
  (User-confirmed lean over per-save + index discriminator.)
- **D2 — Reseed `BaseEvent.id` on `(name, entityId, version)`; drop `time` from the seed.**
  `time` stays as a data field on the event, just not in the hash.
- **D3 — Effect-dedup ledger for handlers** uses the existing `idempotency_keys` table,
  keyed by `(scope = handler/effect name, key = business key)` — NOT a global event inbox
  (a global inbox breaks replay; see thread).
- **D4 — Journal + subscription cursor (the "subscription stuff") is DEFERRED** to a later
  wave. It's the highest-risk piece (live-dispatcher surgery + migration) and its value
  lands mainly once Projectors exist, which they don't yet.

## Open sub-decision (needs confirmation in Wave 1)

**S1 — How per-event `version` (D1) reconciles with the existing per-save
`incrementVersion()` and the dual-use of `version` as a plain write-counter on
non-event-emitting CRUD aggregates** (FxRate, OperationalCost, FeesConfiguration, Taxes,
UserPreferences… all call `entity.incrementVersion()` in `save()` without raising events).

Options:
- **(a) Recommended:** `addDomainEvent` stamps `event.version = ++this.version`. Leave the
  per-save `incrementVersion()` in place for now (non-breaking; the event already captured
  its version before save). Event-emitting aggregates get a clean per-event sequence on the
  *event*; CRUD write-counter usage is untouched. Mildly muddy aggregate-version cadence
  (events + save both bump) but **zero repo churn** and ids are correct.
- **(b) Pure:** make `version` strictly the event sequence — remove `incrementVersion()`
  from saves of event-emitting aggregates, baseline new aggregates at 0. Cleanest semantics
  but touches ~30 repo `save()` methods and changes the version baseline. Defer to a later
  wave if wanted.

Plan proceeds with **(a)** unless told otherwise.

**S2 — Events without `entityId`** (rare; pure "something happened" events) can't seed on
`(entityId, version)`. Resolution: such events must supply an explicit `dedupeKey`; absent
both, retain `time` in the seed as a documented fallback. Enumerate these during Wave 1.

## Wave 1 — ID stability foundation (core-only, no migration, immediately buildable)

| File | Change |
|---|---|
| `core/src/types/BaseDomainEvent.ts` | Add `readonly version?: number` to schema + class; accept in constructor data. |
| `core/src/entities/BaseEntity.ts` | `addDomainEvent`: stamp `event.version = ++this.version` (per D1/S1-a). |
| `core/src/types/BaseEvent.ts` | `serialize()` for id-seed excludes `time`; seed = `name + entityId + version` (+ `dedupeKey` fallback per S2). Keep `time` as a field. |
| `core/src/objects/Id.ts` | No change to `fromSeed`; only its inputs change. |
| `core/src/repositories/DrizzleDomainEventRepository.ts` | `toPersistence`/`toOutboxRow` already write `id: event.id`; verify version flows through; consider making `saveIfNotExists` (onConflictDoNothing) the default write path for at-least-once safety. |
| tests | Unit: same `(name, entityId, version)` → identical id across two constructions (currently FAILS due to `time`). Multi-event command → distinct ids by name. Retry of a command from same loaded state → identical event ids. |

Acceptance: constructing the same logical event twice yields the same id; `bun tsc` +
`bun test` green in `packages/api/typescript`.

## Wave 2 — Handler effect-dedup ledger (independent)

- Wire `idempotency_keys` (`infrastructure.ts`) behind handler dispatch: insert
  `(scope, key)` before running the effect; on conflict, skip. Keyed by business effect, not
  event id (D3). Generalize the billing-webhook partial-unique-index pattern
  (`infrastructure.ts:31`) which already does this correctly.
- Start with the cross-context / external-effect handlers in `src/*/handlers/`.

## Wave 3 — Journal + subscription cursor (deferred, separate plan)

- Add monotonic `position bigserial` to `events`; add `subscriptions(subscriber, position)`;
  drive dispatch off `WHERE position > cursor` instead of deleting from `outbox`.
- Requires **low-watermark gap handling** (a `bigserial` gap from a concurrently-committing
  txn can be skipped → lost row). Do NOT ship the naive `WHERE id > cursor`.
- Preserve the current dispatcher's operational features (per-owner sequential, attempts /
  dead-letter, `FOR UPDATE SKIP LOCKED`).
- Optional: upgrade last-write-wins → real compare-and-swap OCC (`WHERE version = expected`)
  so `version` is gap-free-monotonic under concurrency.

## Risks

- **Blast radius:** Wave 1 edits `core/` types touched by every bounded context. Mitigated
  by: no behavior change beyond id derivation, full `bun tsc`/`bun test` gate, no migration.
- **Existing persisted events** keep their old (time-seeded) ids — fine, append-only log; no
  backfill. New events use the new seed. Document the cutover.
- **Ordering** only matters for delta-applying consumers; none exist yet (no projectors).
  Convergent handlers are order-independent. So Wave 1 carries no ordering regression.

## Rollout

Wave 1 as one focused PR → `/build` (per-Task spec-compliance + tsc/lint/test gates) →
`/pr`. Waves 2 and 3 as separate plans/PRs.
