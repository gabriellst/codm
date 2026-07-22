# SPEC-13: Billing-webhook flow rewrite — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle.

**Goal:** Decouple billing-webhook ingestion from mapping by splitting the eager use-case flow into three layers: a dumb ingest use case that publishes a raw `BillingWebhookReceivedEvent`; a `BillingWebhookReceived` handler that invokes the platform mapper and publishes `ExternalSubscriptionUpdatedEvent`(s); and a `ExternalSubscriptionUpdated` handler that decides the true subscription domain event. Remove `webhookEventType` from the received-event envelope throughout. The existing 6 subscription persist-handlers are unchanged.

**Architecture:** Five atomic commits: (1) create `ExternalSubscriptionUpdatedEvent`; (2) strip `webhookEventType` from `BillingWebhookReceivedEvent` + rewrite `KiwifyWebhookMapper` to emit the new intermediate event; (3) rewrite `HandleBillingWebhook` use case to dumb ingest; (4) add the two new internal handlers (`BillingWebhookReceivedHandler`, `ExternalSubscriptionUpdatedHandler`) + register them; (5) add the end-to-end flow test. The dedupe gate stays at the ingest boundary (`saveIfNotExists` on the deterministic received-event `entityId`). The mapper handler must be deterministic so replays produce the same intermediate events.

**Tech Stack:** TypeScript + Bun + tsyringe-neo + Zod (`@template/core-typescript`). No DB migration; no SDK regen.

**Spec:** `.specs/2026-05-25-refactor-batch-2/SPEC-13-billing-webhook-rewrite.md`
**Tasks:** 5
**Estimated minutes:** 110

> **Planner note — `webhookEventType` removal is multi-file.** The field appears in: `BillingWebhookReceivedEvent` schema, `MappedWebhook` return type in `BillingWebhookMapper.ts`, the `HandleBillingWebhook` use case body (`const { ..., webhookEventType, ... } = mapper.map(...)`), and four test files (`KiwifyWebhookMapper.test.ts`, `HandleBillingWebhook.test.ts`, `events.test.ts`, `ListSubscriptionEventHistory.test.ts`). Task 2 removes it in one commit so `bun tsc` never sees a partial state.

> **Planner note — `ExternalSubscriptionUpdatedEvent` is an internal domain event, not a cross-service integration event.** It stays in `billing/events/` and travels via `InternalMediator`. Its payload is platform-neutral (`externalId`, `platform`, `tier`, optional `userId` + `period` for the Created branch, optional subscription-lookup result for non-Created branches). The mapper handler resolves `SubscriptionRepository` to determine Created vs Paid by looking up the existing subscription — the same logic that currently lives in `KiwifyWebhookMapper.mapOrderApproved` moves into this event's payload-building step.

> **Planner note — mapper is now purely transformational.** `KiwifyWebhookMapper.map()` no longer returns `BaseDomainEvent[]`; it returns `ExternalSubscriptionUpdatedEvent[]` (the intermediate events). `BillingWebhookMapper` abstract class and `MappedWebhook` type are updated accordingly. `KiwifyWebhookMapper` still injects `SubscriptionRepository` for the Created-vs-Paid branch — the dependency stays in the mapper, not in the handler, so the mapper stays deterministic at a given point in time (same repository state → same events).

> **Planner note — handler-per-event-name convention.** Per memory `feedback_handler_per_event_name`: each handler gets its own file (`BillingWebhookReceivedHandler.ts`, `ExternalSubscriptionUpdatedHandler.ts`); no `On` prefix; both are registered in `internal.ts`. The `ExternalSubscriptionUpdatedHandler` fans out the 5 domain event types (`SubscriptionCreated`, `SubscriptionPaid`, `SubscriptionRenewed`, `SubscriptionCancelled`, `SubscriptionOverdue`) via `this.internalMediator.publish(event)` rather than direct `saveMany` — so the existing persist-handlers fire as before.

---

## Task 1: `ExternalSubscriptionUpdatedEvent` exists in `billing/events/`

**Files:**
- Create: `packages/api/typescript/src/billing/events/ExternalSubscriptionUpdatedEvent.ts`
- Modify: `packages/api/typescript/src/billing/events/index.ts` — add export

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /event
**Depends on:** (none)

- [ ] **Step 1: Write the failing test (RED)**

Create `packages/api/typescript/src/billing/events/ExternalSubscriptionUpdatedEvent.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { BillingPlatform, PlanPeriod, PlanTier } from '@template/contracts-typescript/wire/enums'
import { ExternalSubscriptionUpdatedEvent } from './ExternalSubscriptionUpdatedEvent'

const basePayload = {
  externalId: 'kiwify_sub_001',
  platform: BillingPlatform.KIWIFY,
  tier: PlanTier.BASIC,
}

describe('ExternalSubscriptionUpdatedEvent', () => {
  it('static name is billing.subscription.external_updated', () => {
    expect(ExternalSubscriptionUpdatedEvent.name).toBe('billing.subscription.external_updated')
  })

  it('accepts lean payload (Paid/Renewed/Cancelled/Overdue branch — no userId/period)', () => {
    const r = ExternalSubscriptionUpdatedEvent.schema.shape.payload.safeParse(basePayload)
    expect(r.success).toBe(true)
  })

  it('accepts full payload with userId + period (Created branch)', () => {
    const r = ExternalSubscriptionUpdatedEvent.schema.shape.payload.safeParse({
      ...basePayload,
      userId: '019e4d24-6524-7041-9e1c-8108180cddae',
      period: PlanPeriod.MONTHLY,
    })
    expect(r.success).toBe(true)
  })

  it('rejects unknown platform', () => {
    const r = ExternalSubscriptionUpdatedEvent.schema.shape.payload.safeParse({
      ...basePayload,
      platform: 'NOT_REAL',
    })
    expect(r.success).toBe(false)
  })

  it('rejects unknown tier', () => {
    const r = ExternalSubscriptionUpdatedEvent.schema.shape.payload.safeParse({
      ...basePayload,
      tier: 'PLATINUM',
    })
    expect(r.success).toBe(false)
  })

  it('rejects empty externalId', () => {
    const r = ExternalSubscriptionUpdatedEvent.schema.shape.payload.safeParse({
      ...basePayload,
      externalId: '',
    })
    expect(r.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/api/typescript && bun test src/billing/events/ExternalSubscriptionUpdatedEvent.test.ts
```

Expected: FAIL — `Cannot find module './ExternalSubscriptionUpdatedEvent'`.

- [ ] **Step 3: Create `ExternalSubscriptionUpdatedEvent.ts`**

Create `packages/api/typescript/src/billing/events/ExternalSubscriptionUpdatedEvent.ts`:

```ts
import { BaseDomainEvent, z } from '@template/core-typescript'
import {
  BillingPlatformSchema,
  PlanPeriodSchema,
  PlanTierSchema,
} from '@template/contracts-typescript/wire/enums'

/**
 * Platform-neutral intermediate event published by the BillingWebhookReceived
 * handler after the platform mapper has parsed the raw webhook body.
 *
 * This is the billing analogue of Go spec's ExternalXUpdatedEvent: an internal
 * domain event (not cross-service) that decouples the "provider said something
 * changed" fact from the true subscription domain transition.
 *
 * Payload is platform-neutral:
 *  - Always: externalId, platform, tier
 *  - Created branch: userId + period (subscription row doesn't exist yet)
 *  - Other branches: userId + period are absent; handlers locate the row via
 *    (platform, externalId).
 *
 * A second internal handler (ExternalSubscriptionUpdatedHandler) inspects the
 * payload to determine the correct domain event: SubscriptionCreated (when
 * userId + period are present) or Paid/Renewed/Cancelled/Overdue (lean).
 */
export const ExternalSubscriptionUpdatedEventSchema = z.domainEvent({
  externalId: z.string().min(1),
  platform: BillingPlatformSchema,
  tier: PlanTierSchema,
  // Present on the Created branch only.
  userId: z.string().optional(),
  period: PlanPeriodSchema.optional(),
})

export class ExternalSubscriptionUpdatedEvent extends BaseDomainEvent<
  typeof ExternalSubscriptionUpdatedEventSchema
> {
  static override readonly name = 'billing.subscription.external_updated' as const
  static readonly schema = ExternalSubscriptionUpdatedEventSchema
}
```

- [ ] **Step 4: Export from barrel**

In `packages/api/typescript/src/billing/events/index.ts`, add:

```ts
export { ExternalSubscriptionUpdatedEvent } from './ExternalSubscriptionUpdatedEvent'
```

- [ ] **Step 5: Run test to verify it passes (GREEN)**

```bash
cd packages/api/typescript && bun test src/billing/events/ExternalSubscriptionUpdatedEvent.test.ts
```

Expected: PASS — 6 tests.

- [ ] **Step 6: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

Use `/commit`:

```
feat(billing): add ExternalSubscriptionUpdatedEvent (SPEC-13 Task 1)
```

Stage: `packages/api/typescript/src/billing/events/ExternalSubscriptionUpdatedEvent.ts`, `packages/api/typescript/src/billing/events/ExternalSubscriptionUpdatedEvent.test.ts`, `packages/api/typescript/src/billing/events/index.ts`

---

## Task 2: Drop `webhookEventType`; rewrite `KiwifyWebhookMapper` to emit `ExternalSubscriptionUpdatedEvent`

**Files:**
- Modify: `packages/api/typescript/src/billing/events/BillingWebhookReceivedEvent.ts` — remove `webhookEventType` from schema
- Modify: `packages/api/typescript/src/billing/services/BillingWebhookMapper.ts` — change `MappedWebhook` return type
- Modify: `packages/api/typescript/src/billing/services/KiwifyWebhookMapper.ts` — emit `ExternalSubscriptionUpdatedEvent` instead of final events
- Modify: `packages/api/typescript/src/billing/services/KiwifyWebhookMapper.test.ts` — update assertions; drop `webhookEventType` references
- Modify: `packages/api/typescript/src/billing/events/events.test.ts` — remove `webhookEventType` fixture assertions

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /event, /service
**Depends on:** 1

- [ ] **Step 1: Write the failing assertion (RED)**

In `packages/api/typescript/src/billing/events/events.test.ts`, change the `BillingWebhookReceivedEvent` `accepts a canonical webhook envelope payload` test to exclude `webhookEventType` from the payload (so it will fail against the current schema which still requires it):

```ts
it('accepts a canonical webhook envelope payload WITHOUT webhookEventType', () => {
  const r = BillingWebhookReceivedEvent.schema.shape.payload.safeParse({
    platform: BillingPlatform.KIWIFY,
    externalEventId: 'kiwify_evt_001',
    rawBody: { webhook_event_type: 'order_approved', subscription_id: 'kiwify_sub_001' },
    // webhookEventType intentionally absent — SPEC-13 removes it
  })
  expect(r.success).toBe(true)
})
```

Also add a test asserting `webhookEventType` is rejected:

```ts
it('rejects any payload that includes webhookEventType (field removed)', () => {
  const r = BillingWebhookReceivedEvent.schema.shape.payload.safeParse({
    platform: BillingPlatform.KIWIFY,
    externalEventId: 'kiwify_evt_001',
    webhookEventType: 'order_approved',
    rawBody: {},
  })
  // After SPEC-13 the schema uses z.strict() or simply omits the key;
  // a payload without webhookEventType must pass and one with it must also
  // pass (Zod strips by default). The real assertion is the removed field
  // is no longer required.
  expect(r.success).toBe(true)
})
```

Run `bun test src/billing/events/events.test.ts` — the first new test fails because the current schema requires `webhookEventType`.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/api/typescript && bun test src/billing/events/events.test.ts
```

Expected: FAIL — the "without webhookEventType" test fails because `webhookEventType` is `z.string().min(1)` (required).

- [ ] **Step 3: Update `BillingWebhookReceivedEvent.ts`**

In `packages/api/typescript/src/billing/events/BillingWebhookReceivedEvent.ts`, remove `webhookEventType` from the schema and update the JSDoc:

```ts
import { BaseDomainEvent, z } from '@template/core-typescript'
import { BillingPlatformSchema } from '@template/contracts-typescript/wire/enums'

/**
 * Fired by HandleBillingWebhook the moment a verified webhook payload arrives.
 * Carries only { platform, externalEventId, rawBody } — mapping happens in the
 * BillingWebhookReceivedHandler, which resolves the platform mapper and publishes
 * ExternalSubscriptionUpdatedEvent(s).
 *
 * webhookEventType was removed in SPEC-13: it only mattered during mapping
 * and leaked provider vocabulary into the received-event envelope.
 *
 * Idempotency: entityId = Id.fromSeed(['billing', 'webhook', platform,
 * externalEventId]). Partial unique index on events(entity_id) WHERE
 * name = 'billing.webhook.received' makes duplicate deliveries a DB-level no-op.
 */
export const BillingWebhookReceivedEventSchema = z.domainEvent({
  platform: BillingPlatformSchema,
  externalEventId: z.string().min(1),
  // Raw provider body — full webhook captured for audit + replay.
  rawBody: z.record(z.string(), z.unknown()),
})

export class BillingWebhookReceivedEvent extends BaseDomainEvent<typeof BillingWebhookReceivedEventSchema> {
  static override readonly name = 'billing.webhook.received' as const
  static readonly schema = BillingWebhookReceivedEventSchema
}
```

- [ ] **Step 4: Update `BillingWebhookMapper.ts` — change `MappedWebhook` return type**

In `packages/api/typescript/src/billing/services/BillingWebhookMapper.ts`, replace the `MappedWebhook` type and `map` signature:

```ts
import type { BillingPlatform } from '@template/contracts-typescript/wire/enums'
import type { ExternalSubscriptionUpdatedEvent } from '../events'

/**
 * One mapper per provider. Takes the raw webhook body, validates against a
 * provider-specific Zod schema, infers the externalEventId from the body, and
 * returns ExternalSubscriptionUpdatedEvent(s) (platform-neutral intermediate
 * events). The use case no longer calls map() — the BillingWebhookReceivedHandler
 * does, after the dedupe gate fires.
 *
 * Returns an empty array for webhook types the provider sends but the system
 * doesn't act on (no-op, not error).
 *
 * ref: feedback_webhook_mapper_pattern memory.
 */
export abstract class BillingWebhookMapper {
  abstract readonly platform: BillingPlatform

  abstract map(rawBody: Record<string, unknown>): Promise<MappedWebhook>
}

export type MappedWebhook = {
  /** Provider's webhook delivery id — entityId seed for the idempotency hash. */
  externalEventId: string
  /** Intermediate platform-neutral events to publish via internal mediator. */
  events: ExternalSubscriptionUpdatedEvent[]
}
```

- [ ] **Step 5: Rewrite `KiwifyWebhookMapper.ts`**

Replace `packages/api/typescript/src/billing/services/KiwifyWebhookMapper.ts`. The sub-mappers now return `ExternalSubscriptionUpdatedEvent[]` instead of `BaseDomainEvent[]`. The `webhookEventType` local variable and the `MappedWebhook.webhookEventType` field are removed. The repository lookup logic stays in the mapper (same dependency, same determinism):

```ts
import { injectable } from 'tsyringe-neo'
import { BaseError } from '@template/core-typescript'
import { BillingPlatform, PlanPeriod, PlanTier } from '@template/contracts-typescript/wire/enums'
import { SubscriptionRepository } from '../repositories/SubscriptionRepository'
import { ExternalSubscriptionUpdatedEvent } from '../events'
import type { ApplicationErrors, InterfaceErrors } from '../errors'
import { BillingWebhookMapper, type MappedWebhook } from './BillingWebhookMapper'
import { KiwifyWebhookSchema, type KiwifyWebhook, type KiwifyWebhookEventType } from './KiwifyWebhookSchema'

@injectable()
export class KiwifyWebhookMapper extends BillingWebhookMapper {
  readonly platform = BillingPlatform.KIWIFY

  private readonly mappers: Partial<
    Record<KiwifyWebhookEventType, (w: KiwifyWebhook) => Promise<ExternalSubscriptionUpdatedEvent[]>>
  > = {
    order_approved: w => this.mapOrderApproved(w),
    subscription_renewed: w => this.mapSubscriptionRenewed(w),
    subscription_canceled: w => this.mapSubscriptionCancelled(w),
    chargedback: w => this.mapSubscriptionCancelled(w),
    order_refunded: w => this.mapSubscriptionCancelled(w),
    subscription_late: w => this.mapSubscriptionOverdue(w),
  }

  constructor(private readonly subscriptions: SubscriptionRepository) {
    super()
  }

  async map(rawBody: Record<string, unknown>): Promise<MappedWebhook> {
    const parsed = KiwifyWebhookSchema.safeParse(rawBody)
    if (!parsed.success) {
      throw new BaseError<InterfaceErrors>('BILLING_WEBHOOK_PAYLOAD_INVALID')
    }

    const webhook = parsed.data as KiwifyWebhook
    const externalEventId = this.extractExternalEventId(webhook)

    const handler = this.mappers[webhook.webhook_event_type]
    const events = handler ? await handler(webhook) : []

    return { externalEventId, events }
  }

  private extractExternalEventId(w: KiwifyWebhook): string {
    return `${w.order_id}:${w.webhook_event_type}`
  }

  private async mapOrderApproved(w: KiwifyWebhook): Promise<ExternalSubscriptionUpdatedEvent[]> {
    const { externalId, tier, period } = this.extractSubscriptionFacts(w)
    const existing = await this.subscriptions.findByPlatformAndExternalId(BillingPlatform.KIWIFY, externalId)

    if (existing) {
      return [
        new ExternalSubscriptionUpdatedEvent({
          entityId: externalId,
          ownerId: existing.userId.value,
          payload: { externalId, platform: BillingPlatform.KIWIFY, tier },
        }),
      ]
    }

    const userId = this.extractUserId(w)
    return [
      new ExternalSubscriptionUpdatedEvent({
        entityId: externalId,
        ownerId: userId,
        payload: { externalId, platform: BillingPlatform.KIWIFY, tier, userId, period },
      }),
    ]
  }

  private async mapSubscriptionRenewed(w: KiwifyWebhook): Promise<ExternalSubscriptionUpdatedEvent[]> {
    const { externalId, tier } = this.extractSubscriptionFacts(w)
    const existing = await this.subscriptions.findByPlatformAndExternalId(BillingPlatform.KIWIFY, externalId)
    if (!existing) return []
    return [
      new ExternalSubscriptionUpdatedEvent({
        entityId: externalId,
        ownerId: existing.userId.value,
        payload: { externalId, platform: BillingPlatform.KIWIFY, tier },
      }),
    ]
  }

  private async mapSubscriptionCancelled(w: KiwifyWebhook): Promise<ExternalSubscriptionUpdatedEvent[]> {
    const { externalId, tier } = this.extractSubscriptionFacts(w)
    const existing = await this.subscriptions.findByPlatformAndExternalId(BillingPlatform.KIWIFY, externalId)
    if (!existing) return []
    return [
      new ExternalSubscriptionUpdatedEvent({
        entityId: externalId,
        ownerId: existing.userId.value,
        payload: { externalId, platform: BillingPlatform.KIWIFY, tier },
      }),
    ]
  }

  private async mapSubscriptionOverdue(w: KiwifyWebhook): Promise<ExternalSubscriptionUpdatedEvent[]> {
    const { externalId, tier } = this.extractSubscriptionFacts(w)
    const existing = await this.subscriptions.findByPlatformAndExternalId(BillingPlatform.KIWIFY, externalId)
    if (!existing) return []
    return [
      new ExternalSubscriptionUpdatedEvent({
        entityId: externalId,
        ownerId: existing.userId.value,
        payload: { externalId, platform: BillingPlatform.KIWIFY, tier },
      }),
    ]
  }

  private extractSubscriptionFacts(w: KiwifyWebhook): {
    externalId: string
    tier: PlanTier
    period: PlanPeriod
  } {
    const externalId = w.subscription_id
    if (!externalId) {
      throw new BaseError<InterfaceErrors>('BILLING_WEBHOOK_PAYLOAD_INVALID')
    }
    return {
      externalId,
      tier: this.mapTier(w.Product.product_name),
      period: this.mapPeriod(w.Subscription?.plan.frequency ?? ''),
    }
  }

  private extractUserId(w: KiwifyWebhook): string {
    const userId = w.TrackingParameters.s1
    if (!userId) throw new BaseError<ApplicationErrors>('SUBSCRIPTION_LOOKUP_FAILED')
    return userId
  }

  private mapTier(productName: string): PlanTier {
    const h = productName.toLowerCase()
    if (h.includes('ilimitadas') || h.includes('ilimitado')) return PlanTier.UNLIMITED
    if (h.includes('plano 5')) return PlanTier.ADVANCED
    if (h.includes('plano 3')) return PlanTier.INTERMEDIATE
    if (h.includes('plano 1')) return PlanTier.BASIC
    return PlanTier.BASIC
  }

  private mapPeriod(frequency: string): PlanPeriod {
    switch (frequency.toLowerCase()) {
      case 'annually':
        return PlanPeriod.ANNUAL
      case 'quarterly':
        return PlanPeriod.QUARTERLY
      default:
        return PlanPeriod.MONTHLY
    }
  }
}
```

- [ ] **Step 6: Update `KiwifyWebhookMapper.test.ts`**

The existing mapper tests assert on `out.events[0]` being instances of `SubscriptionCreatedEvent`, `SubscriptionPaidEvent`, etc. Replace those assertions with `ExternalSubscriptionUpdatedEvent` checks, verifying the payload shape instead of the event class:

Key changes:
- Import `ExternalSubscriptionUpdatedEvent` instead of `SubscriptionCreatedEvent`, `SubscriptionPaidEvent`, etc.
- Change `expect(out.events[0]).toBeInstanceOf(SubscriptionCreatedEvent)` → `expect(out.events[0]).toBeInstanceOf(ExternalSubscriptionUpdatedEvent)` with payload checks for `userId` + `period` presence (Created branch).
- Change `toBeInstanceOf(SubscriptionPaidEvent)` → `toBeInstanceOf(ExternalSubscriptionUpdatedEvent)` with payload check for absence of `userId` (Paid/Renewed/etc. branch).
- Remove all `webhookEventType` assertions from the `MappedWebhook envelope` describe block; keep `externalEventId` assertion.
- The `'includes metadata even for unhandled event types'` test only checks `externalEventId` and `events: []` — remove the `webhookEventType` assertion.

- [ ] **Step 7: Update `events.test.ts`**

Remove the three `BillingWebhookReceivedEvent` tests that reference `webhookEventType`:
- The "accepts a canonical webhook envelope payload" test: remove `webhookEventType: 'order_approved'` from the fixture; assert success.
- The "rejects empty webhookEventType" test: delete entirely.
- Keep "static name is billing.webhook.received" and "rejects empty externalEventId".

- [ ] **Step 8: Run tests (GREEN)**

```bash
cd packages/api/typescript && bun test src/billing/events/events.test.ts src/billing/services/KiwifyWebhookMapper.test.ts
```

Expected: all pass.

- [ ] **Step 9: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors. The use case still calls `mapper.map()` at this point and destructures `webhookEventType` — tsc will flag that. Fix by removing the `webhookEventType` destructuring in `HandleBillingWebhook.ts` (the field no longer exists on `MappedWebhook`). Remove the line `payload: { ..., webhookEventType, ... }` from the `BillingWebhookReceivedEvent` construction; the field is gone from both the type and the schema.

- [ ] **Step 10: Run full test suite**

```bash
cd packages/api/typescript && bun run test
```

Expected: all pass. The use case `HandleBillingWebhook.test.ts` still passes because it only asserts on `BillingWebhookReceivedEvent` and `SubscriptionCreatedEvent` event counts, and the use case still calls the mapper in this intermediate state. Tighten that in Task 3.

- [ ] **Step 11: Commit**

Use `/commit`:

```
refactor(billing): drop webhookEventType; mapper emits ExternalSubscriptionUpdatedEvent (SPEC-13 Task 2)
```

Stage: `packages/api/typescript/src/billing/events/BillingWebhookReceivedEvent.ts`, `packages/api/typescript/src/billing/services/BillingWebhookMapper.ts`, `packages/api/typescript/src/billing/services/KiwifyWebhookMapper.ts`, `packages/api/typescript/src/billing/services/KiwifyWebhookMapper.test.ts`, `packages/api/typescript/src/billing/events/events.test.ts`

---

## Task 3: Rewrite `HandleBillingWebhook` use case to dumb ingest

**Files:**
- Modify: `packages/api/typescript/src/billing/usecases/HandleBillingWebhook.ts` — remove mapper call; publish only raw `BillingWebhookReceivedEvent`
- Modify: `packages/api/typescript/src/billing/usecases/HandleBillingWebhook.test.ts` — rewrite assertions for the new dumb-ingest shape

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase
**Depends on:** 2

- [ ] **Step 1: Write the failing assertion (RED)**

In `packages/api/typescript/src/billing/usecases/HandleBillingWebhook.test.ts`, add a test asserting the use case does NOT call the mapper factory:

```ts
it('happy path (dumb ingest): persists only BillingWebhookReceived — no mapper call, no derived events', async () => {
  // After SPEC-13, the use case only persists BillingWebhookReceivedEvent.
  // SubscriptionCreatedEvent is NOT emitted by the use case — it comes from
  // the BillingWebhookReceivedHandler.
  await callWith()
  expect(countEventsOfType(BillingWebhookReceivedEvent)).toBe(1)
  // No subscription event in the repo from the use case itself.
  expect(countEventsOfType(SubscriptionCreatedEvent)).toBe(0)
})
```

Run `bun test src/billing/usecases/HandleBillingWebhook.test.ts` — the existing `happy path` test asserts `SubscriptionCreatedEvent` count = 1, so the new test (or the old one after rewrite) will drive the RED state.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/api/typescript && bun test src/billing/usecases/HandleBillingWebhook.test.ts
```

Expected: FAIL — `countEventsOfType(SubscriptionCreatedEvent)` is 1 (old behaviour), new assertion expects 0.

- [ ] **Step 3: Rewrite `HandleBillingWebhook.ts`**

Replace the file with the dumb-ingest implementation:

```ts
import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, Id, z, DrizzleClient } from '@template/core-typescript'
import { BillingPlatformSchema } from '@template/contracts-typescript/wire/enums'
import { BillingWebhookReceivedEvent } from '../events'
import { KiwifyWebhookVerifier } from '../services'
import type { InterfaceErrors } from '../errors'

export const HandleBillingWebhookInputSchema = z.object({
  platform: BillingPlatformSchema,
  rawBody: z.record(z.string(), z.unknown()),
  signature: z.string().optional(),
  rawBodyString: z.string(),
})

export const HandleBillingWebhookOutputSchema = z.void()

/**
 * Dumb ingest — the single billing-webhook entry point after SPEC-13.
 *
 * Steps:
 *  1. Verify provider signature → BILLING_WEBHOOK_SIGNATURE_INVALID
 *  2. Build deterministic entityId from (platform, rawBody hash)
 *     — externalEventId is NOT extracted here; the mapper handler does it.
 *     We use a content-hash of the raw body as the idempotency seed so
 *     re-deliveries of the same body are deduplicated without knowing the
 *     platform's delivery-id field.
 *  3. saveIfNotExists(BillingWebhookReceivedEvent) — duplicate delivery → ack.
 *
 * No mapper call. No derived events. The BillingWebhookReceivedHandler reads
 * BillingWebhookReceivedEvent from the outbox and invokes the mapper.
 */
@injectable()
export class HandleBillingWebhook extends Handler<typeof HandleBillingWebhookInputSchema, typeof HandleBillingWebhookOutputSchema> {
  readonly name = 'handle_billing_webhook' as const
  readonly inputSchema = HandleBillingWebhookInputSchema
  readonly outputSchema = HandleBillingWebhookOutputSchema

  constructor(private readonly verifier: KiwifyWebhookVerifier) {
    super()
  }

  protected async handle(input: this['input'], tx?: DrizzleClient): Promise<this['output']> {
    if (!this.verifier.verify(input.rawBodyString, input.signature)) {
      throw new BaseError<InterfaceErrors>('BILLING_WEBHOOK_SIGNATURE_INVALID')
    }

    // Deterministic delivery id: stable across re-deliveries of the same body.
    // Uses a simple content hash of the raw body string so we never need to
    // know the provider's delivery-id field at ingest time.
    const externalEventId = Id.fromSeed('billing', 'webhook', input.platform, input.rawBodyString).value

    const entityId = Id.fromSeed('billing', 'webhook', input.platform, externalEventId).value

    await this.withTransaction(tx, async tx => {
      const received = new BillingWebhookReceivedEvent({
        entityId,
        payload: {
          platform: input.platform,
          externalEventId,
          rawBody: input.rawBody,
        },
      })

      await this.domainEventRepository.saveIfNotExists(received, tx)
      // Duplicate delivery → no-op (saveIfNotExists returns false; we still return void).
    })
    return
  }
}
```

> **Planner note — `externalEventId` seeding change.** The old use case derived `externalEventId` from the mapper (Kiwify: `order_id:webhook_event_type`). After this change, the use case cannot call the mapper, so we derive `externalEventId` as a content-hash seed of the raw body string using `Id.fromSeed`. This is still deterministic (same body bytes → same seed). The mapper handler will derive its own `MappedWebhook.externalEventId` from the body when it runs; the received-event's `externalEventId` field is the ingest-boundary dedupe key, not the provider's delivery id. If the project prefers preserving the old provider-literal key, the mapper must be called before the saveIfNotExists — but the spec explicitly states "no mapper call in the use case", so content-hash is the right approach.

- [ ] **Step 4: Update `HandleBillingWebhook.test.ts`**

Rewrite the test suite to match the dumb-ingest shape:

- Remove `BillingWebhookMapperFactory`, `KiwifyWebhookMapper`, `SubscriptionRepository`, `MockSubscriptionRepository` imports and DI setup.
- The `useCase = new HandleBillingWebhook(verifier)` constructor (no factory).
- `callWith()` helper no longer needs `signFor` on a mapper-derived string — it signs the raw body string directly (same as before).
- Replace `happy path: persists BillingWebhookReceived + SubscriptionCreated` with `happy path (dumb ingest): persists only BillingWebhookReceived`.
- Remove `emits SubscriptionPaid (not Created) when subscription already exists` test — that is now the domain-handler's concern.
- Keep: `throws BILLING_WEBHOOK_SIGNATURE_INVALID`, `throws BILLING_WEBHOOK_PAYLOAD_INVALID` (now the mapper isn't called so this test should be removed — payload validation is the mapper handler's concern), `idempotent: second identical webhook does not emit a second batch`, `idempotent: BillingWebhookReceived dedupes to single row`.

> Note: `BILLING_WEBHOOK_PAYLOAD_INVALID` is no longer thrown by the use case (mapper isn't called). Remove that test; it moves to the handler test in Task 4.

- [ ] **Step 5: Run test to verify it passes (GREEN)**

```bash
cd packages/api/typescript && bun test src/billing/usecases/HandleBillingWebhook.test.ts
```

Expected: PASS.

- [ ] **Step 6: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 7: Run full test suite**

```bash
cd packages/api/typescript && bun run test
```

Expected: all pass.

- [ ] **Step 8: Commit**

Use `/commit`:

```
refactor(billing): HandleBillingWebhook dumb ingest — no mapper call (SPEC-13 Task 3)
```

Stage: `packages/api/typescript/src/billing/usecases/HandleBillingWebhook.ts`, `packages/api/typescript/src/billing/usecases/HandleBillingWebhook.test.ts`

---

## Task 4: Add `BillingWebhookReceivedHandler` + `ExternalSubscriptionUpdatedHandler`; register both

**Files:**
- Create: `packages/api/typescript/src/billing/handlers/BillingWebhookReceivedHandler.ts`
- Create: `packages/api/typescript/src/billing/handlers/BillingWebhookReceivedHandler.test.ts`
- Create: `packages/api/typescript/src/billing/handlers/ExternalSubscriptionUpdatedHandler.ts`
- Create: `packages/api/typescript/src/billing/handlers/ExternalSubscriptionUpdatedHandler.test.ts`
- Modify: `packages/api/typescript/src/billing/handlers/internal.ts` — add exports for both handlers
- Modify: `packages/api/typescript/src/billing/registry.ts` — no change needed (handlers are auto-registered via `BoundedContext.create`; confirm wiring)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler
**Depends on:** 3

- [ ] **Step 1: Write the failing tests (RED)**

Create `packages/api/typescript/src/billing/handlers/BillingWebhookReceivedHandler.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'bun:test'
import { BillingPlatform } from '@template/contracts-typescript/wire/enums'
import { BillingWebhookReceivedEvent, ExternalSubscriptionUpdatedEvent } from '../events'
import { MockSubscriptionRepository } from '../repositories/SubscriptionRepository/MockSubscriptionRepository'
import { KiwifyWebhookMapper } from '../services/KiwifyWebhookMapper'
import { BillingWebhookMapperFactory } from '../services/BillingWebhookMapperFactory'
import { BillingWebhookReceivedHandler } from './BillingWebhookReceivedHandler'
import {
  EventEmitter2Mediator,
  InternalMediator,
  MockDomainEventRepository,
  DomainEventRepository,
  MockUnitOfWorkFactory,
  UnitOfWorkFactory,
} from '@template/core-typescript'
import { container } from 'tsyringe-neo'

const ENTITY_ID = '019e4d24-6524-7041-9e1c-8108180cddae'
const USER_ID = '019e4d24-6524-7041-9e1c-8108180cddae'

function makeEvent(rawBody: Record<string, unknown>): BillingWebhookReceivedEvent {
  return new BillingWebhookReceivedEvent({
    entityId: ENTITY_ID,
    payload: {
      platform: BillingPlatform.KIWIFY,
      externalEventId: 'order_001:order_approved',
      rawBody,
    },
  }) as BillingWebhookReceivedEvent
}

function makeOrderApprovedBody(): Record<string, unknown> {
  return {
    order_id: 'order_001',
    order_ref: 'ref_001',
    order_status: 'paid',
    payment_method: 'credit_card',
    store_id: 'store_001',
    payment_merchant_id: 'merchant_001',
    installments: 1,
    sale_type: 'one_time',
    created_at: '2026-05-25T10:00:00.000Z',
    updated_at: '2026-05-25T10:00:00.000Z',
    webhook_event_type: 'order_approved',
    Product: { product_id: 'p1', product_name: 'Plano 1 mensal' },
    Customer: { full_name: 'Alice', first_name: 'Alice', email: 'alice@example.com', mobile: '+5511999999999', ip: '127.0.0.1' },
    Commissions: {
      charge_amount: 19900, product_base_price: 19900, product_base_price_currency: 'BRL',
      kiwify_fee: 1000, kiwify_fee_currency: 'BRL', commissioned_stores: [],
      currency: 'BRL', my_commission: 18900, funds_status: 'completed',
    },
    TrackingParameters: { s1: USER_ID },
    checkout_link: 'https://kiwify.com.br/...',
    subscription_id: 'kiwify_sub_001',
    Subscription: {
      start_date: '2026-05-25T10:00:00.000Z', next_payment: '2026-06-25T10:00:00.000Z', status: 'active',
      customer_access: { has_access: true, active_period: true, access_until: null },
      plan: { id: 'plan_001', name: 'Plano 1 mensal', frequency: 'monthly', qty_charges: 12 },
      charges: { completed: [], future: [] },
    },
  }
}

describe('BillingWebhookReceivedHandler', () => {
  let domainEventRepo: MockDomainEventRepository
  let subscriptionRepo: MockSubscriptionRepository
  let handler: BillingWebhookReceivedHandler
  let testContainer: ReturnType<typeof container.createChildContainer>

  beforeEach(() => {
    testContainer = container.createChildContainer()
    domainEventRepo = new MockDomainEventRepository()
    subscriptionRepo = new MockSubscriptionRepository()
    testContainer.registerInstance(DomainEventRepository as any, domainEventRepo)
    testContainer.registerInstance(UnitOfWorkFactory as any, new MockUnitOfWorkFactory())
    testContainer.registerInstance(InternalMediator as any, new EventEmitter2Mediator())

    const mapper = new KiwifyWebhookMapper(subscriptionRepo)
    const factory = new BillingWebhookMapperFactory(mapper)
    handler = new BillingWebhookReceivedHandler(factory)
    handler.bindContainer(testContainer)
  })

  it('resolves mapper for KIWIFY and publishes ExternalSubscriptionUpdatedEvent', async () => {
    const event = makeEvent(makeOrderApprovedBody())
    await handler.handle(event as any)
    const saved = (domainEventRepo as any).domainEvents as Map<string, { name: string }>
    const externalUpdated = [...saved.values()].filter(e => e.name === ExternalSubscriptionUpdatedEvent.name)
    expect(externalUpdated.length).toBe(1)
  })

  it('throws BILLING_WEBHOOK_PAYLOAD_INVALID for unparseable rawBody', async () => {
    const { BaseError } = await import('@template/core-typescript')
    const event = makeEvent({ totally: 'wrong' })
    let caught: unknown = null
    try {
      await handler.handle(event as any)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(BaseError)
    expect((caught as InstanceType<typeof BaseError>).name).toBe('BILLING_WEBHOOK_PAYLOAD_INVALID')
  })

  it('is a no-op for unknown platform (BILLING_WEBHOOK_UNKNOWN_PLATFORM)', async () => {
    const { BaseError } = await import('@template/core-typescript')
    const event = new BillingWebhookReceivedEvent({
      entityId: ENTITY_ID,
      payload: { platform: 'UNKNOWN_PLATFORM' as any, externalEventId: 'x', rawBody: {} },
    }) as BillingWebhookReceivedEvent
    let caught: unknown = null
    try {
      await handler.handle(event as any)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(BaseError)
    expect((caught as InstanceType<typeof BaseError>).name).toBe('BILLING_WEBHOOK_UNKNOWN_PLATFORM')
  })

  it('publishes empty set for no-op webhook event types (billet_created etc.)', async () => {
    const body = { ...makeOrderApprovedBody(), webhook_event_type: 'billet_created' }
    const event = makeEvent(body)
    await handler.handle(event as any)
    const saved = (domainEventRepo as any).domainEvents as Map<string, { name: string }>
    const externalUpdated = [...saved.values()].filter(e => e.name === ExternalSubscriptionUpdatedEvent.name)
    expect(externalUpdated.length).toBe(0)
  })
})
```

Create `packages/api/typescript/src/billing/handlers/ExternalSubscriptionUpdatedHandler.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'bun:test'
import { BillingPlatform, PlanPeriod, PlanTier } from '@template/contracts-typescript/wire/enums'
import { ExternalSubscriptionUpdatedEvent } from '../events'
import { ExternalSubscriptionUpdatedHandler } from './ExternalSubscriptionUpdatedHandler'
import {
  EventEmitter2Mediator,
  InternalMediator,
  MockDomainEventRepository,
  DomainEventRepository,
  MockUnitOfWorkFactory,
  UnitOfWorkFactory,
  SpyMediator,
} from '@template/core-typescript'
import { container } from 'tsyringe-neo'

const EXTERNAL_ID = 'kiwify_sub_001'
const USER_ID = '019e4d24-6524-7041-9e1c-8108180cddae'

function makeCreatedEvent(): ExternalSubscriptionUpdatedEvent {
  return new ExternalSubscriptionUpdatedEvent({
    entityId: EXTERNAL_ID,
    ownerId: USER_ID,
    payload: {
      externalId: EXTERNAL_ID,
      platform: BillingPlatform.KIWIFY,
      tier: PlanTier.BASIC,
      userId: USER_ID,
      period: PlanPeriod.MONTHLY,
    },
  }) as ExternalSubscriptionUpdatedEvent
}

function makeLeanEvent(): ExternalSubscriptionUpdatedEvent {
  return new ExternalSubscriptionUpdatedEvent({
    entityId: EXTERNAL_ID,
    ownerId: USER_ID,
    payload: {
      externalId: EXTERNAL_ID,
      platform: BillingPlatform.KIWIFY,
      tier: PlanTier.BASIC,
    },
  }) as ExternalSubscriptionUpdatedEvent
}

describe('ExternalSubscriptionUpdatedHandler', () => {
  let spyMediator: SpyMediator
  let handler: ExternalSubscriptionUpdatedHandler
  let testContainer: ReturnType<typeof container.createChildContainer>

  beforeEach(() => {
    testContainer = container.createChildContainer()
    spyMediator = new SpyMediator()
    testContainer.registerInstance(DomainEventRepository as any, new MockDomainEventRepository())
    testContainer.registerInstance(UnitOfWorkFactory as any, new MockUnitOfWorkFactory())
    testContainer.registerInstance(InternalMediator as any, spyMediator)
    handler = new ExternalSubscriptionUpdatedHandler()
    handler.bindContainer(testContainer)
  })

  it('publishes SubscriptionCreated when payload has userId + period (Created branch)', async () => {
    await handler.handle(makeCreatedEvent() as any)
    const published = spyMediator.getPublished()
    expect(published).toHaveLength(1)
    expect(published[0].name).toBe('billing.subscription.created')
  })

  it('publishes SubscriptionPaid when payload has no userId (lean branch from order_approved on existing sub)', async () => {
    // Lean event from KiwifyWebhookMapper order_approved + existing sub branch
    await handler.handle(makeLeanEvent() as any)
    const published = spyMediator.getPublished()
    expect(published).toHaveLength(1)
    expect(published[0].name).toBe('billing.subscription.paid')
  })
})
```

> **Note:** `SpyMediator` must expose a `getPublished()` method. Verify it exists in `@template/core-typescript`; if not, use a simple in-memory spy or `EventEmitter2Mediator` with event inspection. The existing `ExternalMediator` spy from the flow test suggests `SpyMediator` is available.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/api/typescript && bun test src/billing/handlers/BillingWebhookReceivedHandler.test.ts src/billing/handlers/ExternalSubscriptionUpdatedHandler.test.ts
```

Expected: FAIL — both files not found.

- [ ] **Step 3: Create `BillingWebhookReceivedHandler.ts`**

Create `packages/api/typescript/src/billing/handlers/BillingWebhookReceivedHandler.ts`:

```ts
import { injectable } from 'tsyringe-neo'
import { BaseError, EventHandler } from '@template/core-typescript'
import { BillingWebhookReceivedEvent } from '../events'
import { BillingWebhookMapperFactory } from '../services'
import type { InterfaceErrors } from '../errors'

/**
 * Internal handler for BillingWebhookReceivedEvent.
 *
 * Resolves the platform mapper via BillingWebhookMapperFactory, parses rawBody,
 * and publishes ExternalSubscriptionUpdatedEvent(s) via the internal mediator.
 *
 * Determinism: given the same BillingWebhookReceivedEvent (same rawBody +
 * same database state), this handler always produces the same intermediate
 * events — replay-safe.
 *
 * Error handling:
 *  - BILLING_WEBHOOK_UNKNOWN_PLATFORM — factory.get() returns undefined.
 *  - BILLING_WEBHOOK_PAYLOAD_INVALID — mapper.map() throws on schema mismatch.
 *  These bubble up; the outbox retries will back off and alert.
 */
@injectable()
export class BillingWebhookReceivedHandler extends EventHandler<typeof BillingWebhookReceivedEvent> {
  readonly event = BillingWebhookReceivedEvent

  constructor(private readonly mapperFactory: BillingWebhookMapperFactory) {
    super()
  }

  async handle(event: this['input']): Promise<this['output']> {
    const mapper = this.mapperFactory.get(event.payload.platform)
    if (!mapper) {
      throw new BaseError<InterfaceErrors>('BILLING_WEBHOOK_UNKNOWN_PLATFORM')
    }

    const { events } = await mapper.map(event.payload.rawBody)

    for (const intermediate of events) {
      await this.domainEventRepository.save(intermediate)
    }
  }
}
```

- [ ] **Step 4: Create `ExternalSubscriptionUpdatedHandler.ts`**

Create `packages/api/typescript/src/billing/handlers/ExternalSubscriptionUpdatedHandler.ts`:

```ts
import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import {
  ExternalSubscriptionUpdatedEvent,
  SubscriptionCreatedEvent,
  SubscriptionPaidEvent,
  SubscriptionRenewedEvent,
  SubscriptionCancelledEvent,
  SubscriptionOverdueEvent,
} from '../events'

/**
 * Internal handler for ExternalSubscriptionUpdatedEvent.
 *
 * Decides the true subscription domain transition by inspecting the
 * platform-neutral intermediate payload:
 *  - userId + period present → Created (no existing subscription row)
 *  - userId + period absent → Paid (existing subscription found by mapper)
 *
 * For the Renewed/Cancelled/Overdue transitions the mapper currently emits
 * the same lean payload shape as Paid. The handler must distinguish them;
 * since the intermediate event doesn't carry the transition type, we default
 * lean events (without userId) from order_approved context to Paid.
 *
 * SPEC-13 NOTE: A future refinement could add a `transition` discriminant to
 * ExternalSubscriptionUpdatedEvent to let the handler route without ambiguity.
 * For now, the mapper is the only source and its event-type routing is:
 *   order_approved + no existing row → payload has userId (Created branch)
 *   order_approved + existing row   → payload has no userId (Paid branch)
 *   subscription_renewed            → payload has no userId (Renewed branch)
 *   subscription_canceled / chargedback / order_refunded → Cancelled branch
 *   subscription_late               → Overdue branch
 *
 * Since we can't distinguish Paid vs Renewed vs Cancelled vs Overdue from
 * the lean payload alone, add a `transition` field to
 * ExternalSubscriptionUpdatedEvent to carry the routing intent explicitly.
 * This is an acceptable extension — update the event schema and mapper in the
 * same commit.
 */
@injectable()
export class ExternalSubscriptionUpdatedHandler extends EventHandler<typeof ExternalSubscriptionUpdatedEvent> {
  readonly event = ExternalSubscriptionUpdatedEvent

  async handle(event: this['input']): Promise<this['output']> {
    const { externalId, platform, tier, userId, period } = event.payload

    if (userId && period) {
      // Created branch: subscription row does not exist yet.
      await this.internalMediator.publish(
        new SubscriptionCreatedEvent({
          entityId: externalId,
          ownerId: userId,
          payload: { externalId, platform, tier, userId, period },
        }),
      )
      return
    }

    // Lean branch: subscription exists (Paid, Renewed, Cancelled, Overdue).
    // Defaulting to Paid for now — see NOTE above. The transition discriminant
    // will resolve this properly.
    await this.internalMediator.publish(
      new SubscriptionPaidEvent({
        entityId: externalId,
        ownerId: event.ownerId ?? '',
        payload: { externalId, platform, tier },
      }),
    )
  }
}
```

> **Planner note — transition discriminant.** The current `ExternalSubscriptionUpdatedEvent` payload cannot distinguish Paid / Renewed / Cancelled / Overdue without a `transition` field because they all share the same lean shape. Add `transition: z.enum(['created', 'paid', 'renewed', 'cancelled', 'overdue'])` to `ExternalSubscriptionUpdatedEventSchema` and propagate it in `KiwifyWebhookMapper` sub-mappers. The handler then does a `switch (event.payload.transition)` instead of the userId-presence heuristic. This keeps the handler stateless and correct. Implement this extension within Task 4 alongside the handler creation — it is a small addition to Task 1's event and Task 2's mapper and must be in the same commit to keep `bun tsc` clean.

**Revised approach for Task 4:** Before creating the handlers, extend `ExternalSubscriptionUpdatedEvent` (Task 1 file) with `transition` and update `KiwifyWebhookMapper` (Task 2 file) to set it. Then create the handlers using `switch (event.payload.transition)`.

- [ ] **Step 5: Update `ExternalSubscriptionUpdatedEvent` schema to add `transition`**

In `packages/api/typescript/src/billing/events/ExternalSubscriptionUpdatedEvent.ts`, add the `transition` discriminant to the payload schema:

```ts
transition: z.enum(['created', 'paid', 'renewed', 'cancelled', 'overdue']),
```

- [ ] **Step 6: Update `KiwifyWebhookMapper` sub-mappers to set `transition`**

Each sub-mapper sets the `transition` field in the `ExternalSubscriptionUpdatedEvent` payload:
- `mapOrderApproved` existing row → `transition: 'paid'`
- `mapOrderApproved` new row → `transition: 'created'`
- `mapSubscriptionRenewed` → `transition: 'renewed'`
- `mapSubscriptionCancelled` → `transition: 'cancelled'`
- `mapSubscriptionOverdue` → `transition: 'overdue'`

- [ ] **Step 7: Rewrite `ExternalSubscriptionUpdatedHandler` with `switch`**

Replace the userId-presence heuristic with a clean `switch (event.payload.transition)`:

```ts
switch (event.payload.transition) {
  case 'created':
    // userId + period guaranteed by schema (mapper always sets them on Created)
    await this.internalMediator.publish(new SubscriptionCreatedEvent({ ... }))
    break
  case 'paid':
    await this.internalMediator.publish(new SubscriptionPaidEvent({ ... }))
    break
  case 'renewed':
    await this.internalMediator.publish(new SubscriptionRenewedEvent({ ... }))
    break
  case 'cancelled':
    await this.internalMediator.publish(new SubscriptionCancelledEvent({ ... }))
    break
  case 'overdue':
    await this.internalMediator.publish(new SubscriptionOverdueEvent({ ... }))
    break
  default: {
    const _: never = event.payload.transition
    break
  }
}
```

- [ ] **Step 8: Register both handlers in `internal.ts`**

In `packages/api/typescript/src/billing/handlers/internal.ts`, add:

```ts
export { BillingWebhookReceivedHandler } from './BillingWebhookReceivedHandler'
export { ExternalSubscriptionUpdatedHandler } from './ExternalSubscriptionUpdatedHandler'
```

- [ ] **Step 9: Run tests (GREEN)**

```bash
cd packages/api/typescript && bun test src/billing/handlers/BillingWebhookReceivedHandler.test.ts src/billing/handlers/ExternalSubscriptionUpdatedHandler.test.ts
```

Expected: all pass.

- [ ] **Step 10: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 11: Run full test suite**

```bash
cd packages/api/typescript && bun run test
```

Expected: all pass.

- [ ] **Step 12: Commit**

Use `/commit`:

```
feat(billing): BillingWebhookReceivedHandler + ExternalSubscriptionUpdatedHandler (SPEC-13 Task 4)
```

Stage: all new handler files, updated `internal.ts`, updated `ExternalSubscriptionUpdatedEvent.ts` (transition field), updated `KiwifyWebhookMapper.ts` (transition), updated test files.

---

## Task 5: End-to-end flow test — Kiwify `order_approved` → `SubscriptionCreated`

**Files:**
- Create: `packages/api/typescript/tests/flows/billing-webhook-order-approved.flow.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** 4

- [ ] **Step 1: Write the test (RED)**

The test does not exist yet. Create it so it drives the full chain end-to-end in `mock` mode:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import {
  InternalMediator,
  MockOutboxDispatcher,
  DomainEventRepository,
  MockDomainEventRepository,
  UnitOfWorkFactory,
  MockUnitOfWorkFactory,
  EventEmitter2Mediator,
} from '@template/core-typescript'
import { BillingPlatform } from '@template/contracts-typescript/wire/enums'
import {
  BillingWebhookReceivedEvent,
  ExternalSubscriptionUpdatedEvent,
  SubscriptionCreatedEvent,
} from '@billing/events'
import { HandleBillingWebhook } from '@billing/usecases/HandleBillingWebhook'
import { BillingWebhookReceivedHandler } from '@billing/handlers/BillingWebhookReceivedHandler'
import { ExternalSubscriptionUpdatedHandler } from '@billing/handlers/ExternalSubscriptionUpdatedHandler'
import { SubscriptionCreatedHandler } from '@billing/handlers/SubscriptionCreatedHandler'
import {
  BillingWebhookMapperFactory,
  KiwifyWebhookMapper,
  KiwifyWebhookVerifier,
} from '@billing/services'
import { MockSubscriptionRepository, SubscriptionRepository } from '@billing/repositories/SubscriptionRepository'

const SECRET = 'test_kiwify_secret_flow'
const USER_ID = '019e4d24-6524-7041-9e1c-8108180cddae'
const SUB_ID = 'kiwify_sub_flow_001'

function makeKiwifyBody(): Record<string, unknown> {
  return {
    order_id: 'order_flow_001',
    order_ref: 'ref_flow_001',
    order_status: 'paid',
    payment_method: 'credit_card',
    store_id: 'store_001',
    payment_merchant_id: 'merchant_001',
    installments: 1,
    sale_type: 'one_time',
    created_at: '2026-05-25T10:00:00.000Z',
    updated_at: '2026-05-25T10:00:00.000Z',
    webhook_event_type: 'order_approved',
    Product: { product_id: 'p1', product_name: 'Plano 1 mensal' },
    Customer: { full_name: 'Alice', first_name: 'Alice', email: 'alice@example.com', mobile: '+5511999999999', ip: '127.0.0.1' },
    Commissions: {
      charge_amount: 19900, product_base_price: 19900, product_base_price_currency: 'BRL',
      kiwify_fee: 1000, kiwify_fee_currency: 'BRL', commissioned_stores: [],
      currency: 'BRL', my_commission: 18900, funds_status: 'completed',
    },
    TrackingParameters: { s1: USER_ID },
    checkout_link: 'https://kiwify.com.br/...',
    subscription_id: SUB_ID,
    Subscription: {
      start_date: '2026-05-25T10:00:00.000Z', next_payment: '2026-06-25T10:00:00.000Z', status: 'active',
      customer_access: { has_access: true, active_period: true, access_until: null },
      plan: { id: 'plan_001', name: 'Plano 1 mensal', frequency: 'monthly', qty_charges: 12 },
      charges: { completed: [], future: [] },
    },
  }
}

/**
 * FLOW: Kiwify order_approved webhook → dumb ingest → BillingWebhookReceived
 * handler → ExternalSubscriptionUpdated → ExternalSubscriptionUpdated handler
 * → SubscriptionCreated → SubscriptionCreatedHandler → Subscription materialised.
 *
 * All 3 handlers are registered on the in-process mediator. MockOutboxDispatcher
 * flushes events synchronously via internalMediator.publish. The mock mode
 * repo uses MockSubscriptionRepository; no Docker required.
 */
describe('FLOW: billing webhook order_approved → Subscription created', () => {
  let testBed: TestBed
  let testContainer: DependencyContainer
  let useCase: HandleBillingWebhook
  let outbox: MockOutboxDispatcher
  let internalMediator: InternalMediator
  let domainEventRepo: MockDomainEventRepository
  let subscriptionRepo: MockSubscriptionRepository

  beforeAll(async () => {
    testContainer = container.createChildContainer()
    testBed = await TestBed.create('mock', { testContainer })

    domainEventRepo = new MockDomainEventRepository()
    subscriptionRepo = new MockSubscriptionRepository()

    testContainer.registerInstance(DomainEventRepository as any, domainEventRepo)
    testContainer.registerInstance(UnitOfWorkFactory as any, new MockUnitOfWorkFactory())
    testContainer.registerInstance(SubscriptionRepository as any, subscriptionRepo)

    const mediator = new EventEmitter2Mediator()
    testContainer.registerInstance(InternalMediator as any, mediator)
    internalMediator = mediator

    outbox = testContainer.resolve(MockOutboxDispatcher as any) as MockOutboxDispatcher

    // Wire use case
    const verifier = new KiwifyWebhookVerifier(SECRET)
    useCase = new HandleBillingWebhook(verifier)
    useCase.bindContainer(testContainer)

    // Wire handlers and register with mediator
    const kiwifyMapper = new KiwifyWebhookMapper(subscriptionRepo)
    const factory = new BillingWebhookMapperFactory(kiwifyMapper)

    const webhookReceivedHandler = new BillingWebhookReceivedHandler(factory)
    webhookReceivedHandler.bindContainer(testContainer)
    internalMediator.register(webhookReceivedHandler)

    const externalUpdatedHandler = new ExternalSubscriptionUpdatedHandler()
    externalUpdatedHandler.bindContainer(testContainer)
    internalMediator.register(externalUpdatedHandler)

    const subscriptionCreatedHandler = new SubscriptionCreatedHandler(subscriptionRepo)
    subscriptionCreatedHandler.bindContainer(testContainer)
    internalMediator.register(subscriptionCreatedHandler)
  })

  beforeEach(async () => {
    await testBed.reset()
    subscriptionRepo.clear?.()
    domainEventRepo.clear?.()
  })

  afterAll(async () => {
    await testBed.destroy()
  })

  function signBody(body: string): string {
    const { createHmac } = require('node:crypto')
    return createHmac('sha1', SECRET).update(body, 'utf8').digest('hex')
  }

  function countEvents(eventName: string): number {
    let count = 0
    for (const e of (domainEventRepo as any).domainEvents?.values?.() ?? []) {
      if ((e as { name: string }).name === eventName) count++
    }
    return count
  }

  it('end-to-end: Kiwify order_approved → Subscription is materialised in repo', async () => {
    const body = makeKiwifyBody()
    const bodyStr = JSON.stringify(body)
    const sig = signBody(bodyStr)

    await useCase.execute({
      platform: BillingPlatform.KIWIFY,
      rawBody: body,
      signature: sig,
      rawBodyString: bodyStr,
    })

    // Step 1: BillingWebhookReceivedEvent persisted by use case
    expect(countEvents(BillingWebhookReceivedEvent.name)).toBe(1)

    // Flush outbox so the chain fires: BillingWebhookReceived → ExternalUpdated → Created
    await outbox.flush()

    // Step 2: ExternalSubscriptionUpdatedEvent published by BillingWebhookReceivedHandler
    expect(countEvents(ExternalSubscriptionUpdatedEvent.name)).toBe(1)

    // Step 3: SubscriptionCreatedEvent published by ExternalSubscriptionUpdatedHandler
    expect(countEvents(SubscriptionCreatedEvent.name)).toBe(1)

    // Step 4: Subscription aggregate materialised by SubscriptionCreatedHandler
    const sub = await subscriptionRepo.findByPlatformAndExternalId(BillingPlatform.KIWIFY, SUB_ID)
    expect(sub).toBeDefined()
    expect(sub?.isActive).toBe(true)
    expect(sub?.userId).toBe(USER_ID)
  })

  it('dedupe: second identical delivery produces no additional events or subscription rows', async () => {
    const body = makeKiwifyBody()
    const bodyStr = JSON.stringify(body)
    const sig = signBody(bodyStr)

    const call = () =>
      useCase.execute({
        platform: BillingPlatform.KIWIFY,
        rawBody: body,
        signature: sig,
        rawBodyString: bodyStr,
      })

    await call()
    await outbox.flush()

    const firstCount = countEvents(SubscriptionCreatedEvent.name)

    await call()
    await outbox.flush()

    expect(countEvents(SubscriptionCreatedEvent.name)).toBe(firstCount) // unchanged
    const subs = await subscriptionRepo.findByPlatformAndExternalId(BillingPlatform.KIWIFY, SUB_ID)
    expect(subs).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/api/typescript && bun test tests/flows/billing-webhook-order-approved.flow.test.ts
```

Expected: FAIL — import errors (handlers not found, or mediator not wiring all handlers). The test will also fail if `MockDomainEventRepository` does not have a `clear()` method or if `outbox.flush()` doesn't flush the mediator chain correctly. Diagnose and fix wiring.

- [ ] **Step 3: Fix any wiring issues**

Common failures to diagnose:
- `MockSubscriptionRepository` does not have `clear()` — check the class; if absent, add a `clear()` method or call `(repo as any).subscriptions = new Map()`.
- `MockOutboxDispatcher.flush()` dispatches saved events via the mediator — verify it reads from `domainEventRepo` and calls `internalMediator.publish`. If the flow test for `UpdateOrderOverride` uses a similar pattern, mirror it exactly.
- `ExternalSubscriptionUpdatedHandler.internalMediator.publish()` must be accessible — base class `EventHandler` provides `this.internalMediator` as a lazy getter; `bindContainer` must be called before `handle`.

- [ ] **Step 4: Run test to verify it passes (GREEN)**

```bash
cd packages/api/typescript && bun test tests/flows/billing-webhook-order-approved.flow.test.ts
```

Expected: PASS — 2 tests.

- [ ] **Step 5: Run full test suite**

```bash
cd packages/api/typescript && bun run test
```

Expected: all pass. Grep for `webhookEventType` in `src/billing/**` — must be zero:

```bash
grep -r 'webhookEventType' packages/api/typescript/src/billing/ && echo "FOUND — fail" || echo "clean"
```

Expected: `clean`.

- [ ] **Step 6: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

Use `/commit`:

```
test(billing): end-to-end flow test order_approved → Subscription created (SPEC-13 Task 5)
```

Stage: `packages/api/typescript/tests/flows/billing-webhook-order-approved.flow.test.ts`

---

## Acceptance Criteria Coverage

| AC | Covered by |
|---|---|
| `HandleBillingWebhook` publishes only raw `BillingWebhookReceivedEvent` — no mapper call | Task 3 Step 3 + test Step 1 |
| `webhookEventType` appears nowhere in `src/billing/**` (grep → zero) | Task 5 Step 5 grep |
| `BillingWebhookReceivedHandler` maps received event → `ExternalSubscriptionUpdatedEvent` | Task 4 Step 3 + test |
| `ExternalSubscriptionUpdatedHandler` maps intermediate event → true subscription domain event | Task 4 Steps 4–7 + test |
| Dedupe at received-event boundary; duplicate delivery is a no-op | Task 3 (saveIfNotExists) + Task 5 Step 1 dedupe test |
| Flow test: Kiwify `order_approved` → subscription created end-to-end | Task 5 |
| `bun tsc` clean | Tasks 1–5 each verify |
| `bun run test` clean | Tasks 2, 3, 5 verify |
