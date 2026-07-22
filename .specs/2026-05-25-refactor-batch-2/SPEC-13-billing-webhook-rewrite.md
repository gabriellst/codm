# SPEC-13: Billing-webhook flow rewrite (received → mapper handler → external event → domain event)

**Wave:** 5   **Depends on:** (none; recommended after SPEC-08)   **Status:** done

## Motivation

The billing webhook does its mapping **eagerly in the use case**: `HandleBillingWebhook` verifies the signature, resolves the platform mapper via `BillingWebhookMapperFactory`, and `KiwifyWebhookMapper.map()` returns the **final** domain events (`SubscriptionCreated` / `Paid` / `Renewed` / `Cancelled` / `Overdue`) which are saved alongside a `BillingWebhookReceivedEvent` audit record. So the received event is a side-record, not the spine of the flow.

The Go restructure spec (`.specs/2026-05-24-go-sync-restructure-design.md`) establishes the target shape: a single ingest controller publishes a raw `WebhookReceivedEvent`; a per-`(platform, event)` mapper **handler** turns it into an `ExternalXUpdatedEvent`; an internal handler consumes that and publishes the true domain events. We want billing to mirror it: ingest is dumb, mapping is a handler, the true subscription domain events come from a second handler. Also remove `webhookEventType`, which only matters during mapping and currently leaks into the event envelope.

## Scope

1. **Dumb ingest** — `HandleBillingWebhookController` / `HandleBillingWebhook` use case: verify the signature, derive the dedupe `externalEventId`, and publish a **raw** `BillingWebhookReceivedEvent` carrying `{ platform, externalEventId, rawBody }`. **No mapper call, no derived events** in the use case. Dedupe stays here (`saveIfNotExists` on the deterministic entity id).
2. **Drop `webhookEventType`** from `BillingWebhookReceivedEvent`, from `BillingWebhookMapper`'s `MappedWebhook` return type, and from the use-case plumbing + tests.
3. **Mapper handler** — a new internal handler on `BillingWebhookReceivedEvent` resolves `BillingWebhookMapperFactory.get(platform)`, parses `rawBody`, and publishes one or more `ExternalSubscriptionUpdatedEvent` (the new intermediate event carrying the platform-neutral subscription facts the mapper extracted). The mapper now returns these intermediate events, not final domain events.
4. **Domain handler** — an internal handler on `ExternalSubscriptionUpdatedEvent` decides the true domain transition (Created vs Paid vs Renewed vs Cancelled vs Overdue) and publishes the corresponding subscription domain event(s); the existing subscription handlers persist the aggregate unchanged.
5. Keep `BillingWebhookMapperFactory` keyed by platform (only `KIWIFY` today); `KiwifyWebhookMapper` is rewritten to emit `ExternalSubscriptionUpdatedEvent`(s) instead of final events.

## Affected files

- `src/billing/controllers/HandleBillingWebhook.ts`, `src/billing/usecases/HandleBillingWebhook.ts`
- `src/billing/events/BillingWebhookReceivedEvent.ts` (drop `webhookEventType`) + NEW `ExternalSubscriptionUpdatedEvent.ts`
- `src/billing/services/BillingWebhookMapper.ts` (return type), `KiwifyWebhookMapper.ts` (emit intermediate events)
- NEW handlers in `src/billing/handlers/internal.ts`: `BillingWebhookReceived` → mapper; `ExternalSubscriptionUpdated` → domain events
- Existing subscription handlers (persist) — unchanged consumers of the final events
- Tests: `KiwifyWebhookMapper.test.ts`, `HandleBillingWebhook.test.ts`, `events.test.ts`, `ListSubscriptionEventHistory.test.ts` (drop `webhookEventType` fixtures)

## Acceptance criteria

- [ ] `HandleBillingWebhook` publishes only `BillingWebhookReceivedEvent` (raw) — no mapper call, no final domain events in the use case.
- [ ] `webhookEventType` appears nowhere (grep `webhookEventType` across `src/billing/**` → zero, incl. tests).
- [ ] A handler maps `BillingWebhookReceivedEvent` → `ExternalSubscriptionUpdatedEvent`; a second handler maps that → the true subscription domain event(s).
- [ ] Dedupe still happens at the received-event boundary (duplicate delivery is a no-op); a flow test drives a Kiwify `order_approved` payload end-to-end and asserts the subscription is created.
- [ ] `bun tsc` clean; `bun run test` clean.

## Out of scope

- Adding a second billing platform (only `KIWIFY` exists; the factory stays ready for more).
- Auto-detecting platform from the body — `platform` still arrives on the route and rides on the received event for the factory; "no inline mapping" is the point, not "no platform".
- Changing the `Subscription` aggregate or its persistence handlers.

## Notes

- The `ExternalSubscriptionUpdatedEvent` is the billing analogue of the Go spec's `ExternalXUpdatedEvent` — an internal domain event (not cross-service) representing "an external provider reported a subscription change". Keep its payload platform-neutral.
- Recommended after SPEC-08 so the subscription domain events already follow the embed-entity shape and aren't reshaped twice.
- Dedupe semantics: the received event is the idempotency boundary (one row per `(platform, externalEventId)`); the mapper handler must therefore be deterministic so a replay produces the same intermediate/domain events.
- See memory `feedback_webhook_mapper_pattern` — per-platform Zod schema + mapper + DI factory keyed by platform is the established ingest pattern; this spec moves the mapper *invocation* from the use case into a handler.
