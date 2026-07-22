# Billing pause-slice wiring — spec

> **Date:** 2026-06-10 · **Origin:** slice-closure SCW-01a finding (triage ticket #2,
> `.plans/2026-06-09-correctness-phase-0-and-detectors.md`) — `SubscriptionPausedEvent`
> is declared, exported and schema-tested, with two subscribers waiting, but nothing
> ever raises it. **This spec is also the first feature-loop turn (P1)**: an independent
> verifier derives acceptance tests + graders from this document alone; a builder agent
> implements from it; the graders decide.

## Context

Billing ingests provider webhooks through a fixed choreography:
`HandleBillingWebhook` (verify + snapshot + dedupe) → `BillingWebhookReceivedEvent` →
`BillingWebhookReceivedHandler` invokes the platform mapper → platform-neutral
`ExternalSubscriptionUpdatedEvent { transition }` → `ExternalSubscriptionUpdatedHandler`
— **the single place a provider report becomes a real subscription state transition**.
For each `SubscriptionTransition` it loads/creates the `Subscription` aggregate, calls the
imperative domain method, and persists the aggregate + the corresponding domain event in
ONE transaction. Downstream subscribers of those domain events do **effects only, never
persistence** (the handler's own docblock states this canon).

Today `SubscriptionTransition` has CREATED / PAID / RENEWED / CANCELLED / OVERDUE. There is
no PAUSED transition — yet `SubscriptionPausedEvent` exists, `Subscription.pause()` exists,
`SubscriptionQuotaUpdatedPublisher` subscribes to the paused event (to push the tier change
to Tenancy), and a `SubscriptionPausedHandler` exists that pauses + saves the aggregate.

## Problem

The pause path is dead end-to-end: a provider's "subscription paused" webhook is dropped by
the mapper, so quotas never tighten when a customer pauses. Additionally, the existing
`SubscriptionPausedHandler` performs persistence (pause + save) downstream of the
dispatcher, contradicting the effects-only canon — if the event ever fired today, the pause
would be applied twice through two different code paths.

## Goal

A Kiwify "subscription paused" webhook results in: the aggregate paused exactly once (by the
dispatcher, in the same transaction as the `SubscriptionPausedEvent` persist), the quota
publisher firing afterwards via the outbox, and no redundant persistence handler left behind.

## Decisions

1. **PAUSED joins `SubscriptionTransition`** (billing context enum) and the
   `ExternalSubscriptionUpdatedEvent` payload's transition values.
2. **The Kiwify mapper maps the provider's pause webhook** (`webhook_event_type:
   'subscription_paused'`, alongside the existing canceled/late/renewed types) to
   `transition: PAUSED` carrying `{ externalId, platform: KIWIFY, tier }` — same shape as
   CANCELLED/OVERDUE (no userId/period needed).
3. **`ExternalSubscriptionUpdatedHandler` gains `applyPaused`**, mirroring `applyCancelled`:
   load by platform+externalId; missing row → no-op (out-of-order tolerance); otherwise
   `subscription.pause()`, save, and persist `SubscriptionPausedEvent` via
   `domainEventRepository.save(event, tx)` — same tx, event only when the transition
   actually happened.
4. **`SubscriptionPausedHandler` is DELETED** (file + its test + barrel registration). It is
   a persistence handler downstream of persistence — the dispatcher owns the pause now.
   `SubscriptionQuotaUpdatedPublisher`'s subscription to the paused event is untouched (it
   is the effects-only consumer and, with the multicast mediator, actually fires).
5. No wire/contract changes: `SubscriptionPausedEvent` already exists with the right
   payload; the transition enum is context-local.

## User stories

- As the platform, when a customer pauses their Kiwify subscription, their store's quota
  reflects the paused tier without manual intervention.
- As an operator, a replayed/duplicate pause webhook does not corrupt state (dedupe at
  ingest; missing-row pause is a tolerated no-op).

## Acceptance criteria

- AC1: `KiwifyWebhookMapper` maps a `subscription_paused` webhook for a known subscription
  to exactly one `ExternalSubscriptionUpdatedEvent` with `transition: PAUSED`,
  `platform: KIWIFY`, the webhook's externalId and the mapped tier.
- AC2: `ExternalSubscriptionUpdatedHandler` on `transition: PAUSED` with an EXISTING
  subscription: aggregate becomes inactive (`isActive === false`) AND exactly one
  `SubscriptionPausedEvent` row is persisted (events table), both in the same transaction.
- AC3: `transition: PAUSED` with NO matching subscription: no throw, no save, no event.
- AC4: `SubscriptionPausedHandler` no longer exists (not in handlers/, not exported from
  internal.ts) and nothing else registers a persistence-performing subscriber to
  `billing.subscription.paused`; `SubscriptionQuotaUpdatedPublisher` remains subscribed.
- AC5: Backend type-check green (`bun x tsc -p tsconfig.build.json --noEmit`); the
  transition switch stays exhaustive (`never` default still compiles).
- AC6: No new detector findings (`registry-scan`, `import-direction`); slice-closure no
  longer reports `SubscriptionPausedEvent` as declared-never-raised.
