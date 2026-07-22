# SPEC-08: Domain entity events embed the typed entity (via `toJSON`) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle.

**Goal:** Replace every domain entity CRUD event's per-field or untyped snapshot payload with a single typed entity key (`z.domainEvent({ <entity>: <Entity>Schema })`), populated from `entity.toJSON()`. This eliminates schema drift between entity and event, removes 7 `z.record(z.string(), z.unknown())` patterns and 4 ad-hoc `entity: z.object({...})` patterns, and makes event consumers typed end-to-end.

**Architecture:** Six parallel context tasks (analytics, catalog, finance, marketing, identity, tenancy) — each is an atomic commit that keeps its own tests green. A shared pre-flight task (Task 0) exports any unexported entity schemas first, so downstream tasks never need to backtrack. Tasks 1–6 execute in parallel after Task 0. Task 7 adds a cross-context round-trip test and runs the full suite.

**Tech Stack:** TypeScript + Bun + Zod (`z` from `@template/core-typescript`). No DB changes; no migration; no SDK regen (events are not OpenAPI-exposed).

**Spec:** `.specs/2026-05-25-refactor-batch-2/SPEC-08-events-embed-entity-tojson.md`
**Tasks:** 8 (Task 0 + 6 parallel context tasks + Task 7 QA)
**Estimated minutes:** 130

> **Planner note — SPEC-01 dependency awareness.** SPEC-01 will fold `targetAmountCents + currency` into `MonetaryAmount` on `Goal` and `amountCents + currency` into `MonetaryAmount` on `OperationalCost`. SPEC-08 must run **after** SPEC-01 lands so the embedded `GoalSchema` / `OperationalCostSchema` is final. Until then, if executing SPEC-08 before SPEC-01, keep the flat fields in `GoalCreatedEventSchema` / `OperationalCostCreatedEventSchema` — the `/build` agent should recheck `GoalSchema`'s current shape at execution time and embed whatever the entity declares. The spec says "Depends on SPEC-01" for this reason.

> **Planner note — schema visibility pre-flight.** Four schemas are unexported today: `WarrantyReserveSchema` (`const`), `FeesConfigurationSchema` (`const`), `UserProfileSchema` (`const`), and `StoreSchema` is already exported (`export const`). Task 0 exposes the three unexported schemas with `export const` — a one-line change per file that has zero behavioral impact. This unblocks all downstream tasks without modifying any test or event.

> **Planner note — identity/tenancy event pattern.** `ProfileUpdatedEvent`, `UserPreferencesUpdatedEvent`, `StoreSettingsUpdatedEvent`, and `StorePreferencesUpdatedEvent` already use `entity: z.object({...})` (typed, not `z.record`). The migration for these four is a replace, not a net-new add: the per-field `entity` shape becomes the entity's canonical schema import. The payload key stays `entity` (not renamed to `profile`/`store`) because the existing `index.test.ts` fixtures already assert on `entity.*` — the publisher side changes but the consumer-visible key name stays.

> **Planner note — `ProductCostCreatedEvent` / `OperationalCostCreatedEvent`.** These are per-field *Created* events (no `entity: z.record`). The spec includes per-field Created events in scope. Both get replaced with the entity schema embed (`productCost: ProductCostSchema`, `operationalCost: OperationalCostSchema`). `WarrantyReserveCreatedEvent` is also per-field and in scope (finance context). `TaxesUpdatedEvent` and `FeesConfigurationUpdatedEvent` use `entity: z.record(...)` today and are in scope. There are no `TaxesCreatedEvent` or `FeesConfigurationCreatedEvent` (Taxes/Fees use a time-effective insert model — the `UpdateTaxes` / `UpdateFeesConfiguration` use cases create a new row and emit the `*Updated` event).

> **Planner note — `ManualAdSpendRecordedEvent` scoping.** `ManualAdSpendRecordedEvent` is the *Created* event for `AdSpend`. It is currently per-field (not `z.record`). It falls under the spec's "domain entity CRUD events" and must be updated to embed `AdSpendSchema`. `ManualAdSpendUpdatedEvent` uses `z.record` and is the *Updated* case.

> **Planner note — parallelism.** Crosses 6 bounded contexts and 20+ artifacts — threshold for `/task-breakdown` annotation applies. Tasks 1–6 are `parallel-after-wave-1` (after Task 0 lands). Task 7 is `serial` (integration QA). No frontend artifacts; no SDK regen needed.

---

## Wave Plan

**Feature type:** 4 — New behavior on existing entities (no new aggregates; existing entity schemas are embedded in existing events).
**Phases in scope:** 1 (Behavior Slices), 2 (Integration QA).
**Critical path length:** 3 steps — Task 0 → any Task 1–6 → Task 7.

### Phase 1 — Behavior Slices

```
Task 0 (serial)
  └── Tasks 1–6 (parallel-after-wave-1)
        └── Task 7 (serial)
```

### Parallelism Matrix

| Kind | Count | Classification |
|------|-------|----------------|
| event (Modify) | 13 | parallel-after-wave-1 |
| usecase (Modify, publisher) | 12 | parallel-after-wave-1 |
| entity schema (export) | 3 | serial (Task 0) |
| test (Modify) | 7 | parallel-after-wave-1 |
| integration QA | 1 | serial (Task 7) |

---

## Task 0: Export the three unexported entity schemas

**Files:**
- Modify: `packages/api/typescript/src/finance/entities/WarrantyReserve.ts` — `const WarrantyReserveSchema` → `export const WarrantyReserveSchema`
- Modify: `packages/api/typescript/src/finance/entities/FeesConfiguration.ts` — `const FeesConfigurationSchema` → `export const FeesConfigurationSchema`
- Modify: `packages/api/typescript/src/identity/entities/UserProfile.ts` — `const UserProfileSchema` → `export const UserProfileSchema`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity
**Depends on:** (none)

- [ ] **Step 1: Add `export` to the three unexported schemas (RED)**

In `packages/api/typescript/src/finance/entities/WarrantyReserve.ts` line 5, change:

```ts
const WarrantyReserveSchema = z.object({
```

to:

```ts
export const WarrantyReserveSchema = z.object({
```

In `packages/api/typescript/src/finance/entities/FeesConfiguration.ts` line 20, change:

```ts
const FeesConfigurationSchema = z.object({
```

to:

```ts
export const FeesConfigurationSchema = z.object({
```

In `packages/api/typescript/src/identity/entities/UserProfile.ts` line 18, change:

```ts
const UserProfileSchema = z.object({
```

to:

```ts
export const UserProfileSchema = z.object({
```

- [ ] **Step 2: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors. The schemas are consumed only in the same file (entity class `static override schema = XxxSchema`) — making them exported does not break any consumer.

- [ ] **Step 3: `bun run test` green**

```bash
cd packages/api/typescript && bun run test
```

Expected: all tests pass. No behavioral change — only visibility change.

- [ ] **Step 4: Commit**

Use `/commit`:

```
refactor(entities): export WarrantyReserveSchema, FeesConfigurationSchema, UserProfileSchema (SPEC-08 Task 0)
```

Stage: `packages/api/typescript/src/finance/entities/WarrantyReserve.ts`, `packages/api/typescript/src/finance/entities/FeesConfiguration.ts`, `packages/api/typescript/src/identity/entities/UserProfile.ts`

---

## Task 1: analytics — GoalCreatedEvent + GoalUpdatedEvent embed GoalSchema

**Files:**
- Modify: `packages/api/typescript/src/analytics/events/GoalCreatedEvent.ts`
- Modify: `packages/api/typescript/src/analytics/events/GoalUpdatedEvent.ts`
- Modify: `packages/api/typescript/src/analytics/usecases/CreateGoal.ts`
- Modify: `packages/api/typescript/src/analytics/usecases/UpdateGoal.ts`
- Modify: `packages/api/typescript/src/analytics/usecases/Goal.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /event, /usecase, /test
**Depends on:** 0

- [ ] **Step 1: Write the failing assertion (RED)**

Open `packages/api/typescript/src/analytics/usecases/Goal.test.ts`. Add a failing assertion inside the `Update changedFields + no-op when no change` test after `expect(emitted[0].payload.entity).toBeDefined()`:

```ts
// SPEC-08: entity key must be typed GoalSchema, not z.record
expect(emitted[0].payload.goal).toBeDefined()           // RED — key is still `entity`
expect(emitted[0].payload.goal.targetAmountCents).toBe(200_000)
```

And in `Create persists + emits GoalCreatedEvent`:

```ts
// SPEC-08: payload must carry `goal` key, not per-field spread
expect(emitted[0].payload.goal).toBeDefined()           // RED — no `goal` key yet
expect(emitted[0].payload.goal.storeId).toBe(STORE)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/api/typescript && bun test src/analytics/usecases/Goal.test.ts
```

Expected: FAIL — `emitted[0].payload.goal` is `undefined`.

- [ ] **Step 3: Rewrite `GoalCreatedEvent.ts` (GREEN)**

Replace `packages/api/typescript/src/analytics/events/GoalCreatedEvent.ts`:

```ts
import { BaseDomainEvent, z } from '@template/core-typescript'
import { GoalSchema } from '../entities/Goal'

export const GoalCreatedEventSchema = z.domainEvent({
  goal: GoalSchema,
})

export class GoalCreatedEvent extends BaseDomainEvent<typeof GoalCreatedEventSchema> {
  static override readonly name = 'analytics.goal.created' as const
  static readonly schema = GoalCreatedEventSchema
}
```

- [ ] **Step 4: Rewrite `GoalUpdatedEvent.ts`**

Replace `packages/api/typescript/src/analytics/events/GoalUpdatedEvent.ts`:

```ts
import { BaseDomainEvent, z } from '@template/core-typescript'
import { GoalSchema } from '../entities/Goal'

export const GoalUpdatedEventSchema = z.domainEvent({
  goal: GoalSchema,
})

export class GoalUpdatedEvent extends BaseDomainEvent<typeof GoalUpdatedEventSchema> {
  static override readonly name = 'analytics.goal.updated' as const
  static readonly schema = GoalUpdatedEventSchema
}
```

- [ ] **Step 5: Update `CreateGoal.ts` publisher**

In `packages/api/typescript/src/analytics/usecases/CreateGoal.ts`, replace the `GoalCreatedEvent` construction:

```ts
await this.domainEventRepository.save(
  new GoalCreatedEvent({
    entityId: entity.id.value,
    ownerId: input.storeId,
    payload: { goal: entity.toJSON() },
  }),
  tx,
)
```

Remove the now-unused enum imports (`CurrencyCodeSchema`, `GoalTypeSchema`) from this file if they are only used in the event payload construction — keep them if they are used in the `CreateGoalInputSchema`.

- [ ] **Step 6: Update `UpdateGoal.ts` publisher**

In `packages/api/typescript/src/analytics/usecases/UpdateGoal.ts`, replace the `GoalUpdatedEvent` construction:

```ts
await this.domainEventRepository.save(
  new GoalUpdatedEvent({
    entityId: entity.id.value,
    ownerId: entity.storeId.value,
    payload: { goal: entity.toJSON() },
  }),
  tx,
)
```

- [ ] **Step 7: Fix the test assertions**

Replace the two failing assertions added in Step 1 and clean up the old `entity` assertions in `Goal.test.ts`:

In `Update changedFields + no-op when no change`:
```ts
const emitted = await readEvents(GoalUpdatedEvent.name)
expect(emitted).toHaveLength(1)
expect(emitted[0].payload.goal).toBeDefined()
expect(emitted[0].payload.goal.targetAmountCents).toBe(200_000)
```

In `Create persists + emits GoalCreatedEvent`:
```ts
const emitted = await readEvents(GoalCreatedEvent.name)
expect(emitted).toHaveLength(1)
expect(emitted[0].payload.goal).toBeDefined()
expect(emitted[0].payload.goal.storeId).toBe(STORE)
```

Remove `expect(emitted[0].payload.entity).toBeDefined()` and `expect(emitted[0].payload.goalId).toBe(id)` from the Create assertion (they no longer exist on the payload).

- [ ] **Step 8: Run test to verify GREEN**

```bash
cd packages/api/typescript && bun test src/analytics/usecases/Goal.test.ts
```

Expected: all tests PASS.

- [ ] **Step 9: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 10: Commit**

Use `/commit`:

```
refactor(analytics): GoalCreatedEvent + GoalUpdatedEvent embed GoalSchema (SPEC-08 Task 1)
```

Stage: `packages/api/typescript/src/analytics/events/GoalCreatedEvent.ts`, `packages/api/typescript/src/analytics/events/GoalUpdatedEvent.ts`, `packages/api/typescript/src/analytics/usecases/CreateGoal.ts`, `packages/api/typescript/src/analytics/usecases/UpdateGoal.ts`, `packages/api/typescript/src/analytics/usecases/Goal.test.ts`

---

## Task 2: catalog — ProductCostCreatedEvent + ProductCostUpdatedEvent embed ProductCostSchema

**Files:**
- Modify: `packages/api/typescript/src/catalog/events/ProductCostCreatedEvent.ts`
- Modify: `packages/api/typescript/src/catalog/events/ProductCostUpdatedEvent.ts`
- Modify: `packages/api/typescript/src/catalog/usecases/CreateProductCost.ts`
- Modify: `packages/api/typescript/src/catalog/usecases/UpdateProductCost.ts`
- Modify: `packages/api/typescript/src/catalog/usecases/UpdateProductCost.test.ts`
- Modify: `packages/api/typescript/src/catalog/usecases/CreateProductCost.test.ts` (if event payload is asserted)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /event, /usecase, /test
**Depends on:** 0

- [ ] **Step 1: Write the failing assertion (RED)**

Open `packages/api/typescript/src/catalog/usecases/UpdateProductCost.test.ts`. Replace:

```ts
expect(emitted[0].payload.entity).toBeDefined()
expect(emitted[0].payload.productCostId).toBe(productCostId)
```

with:

```ts
expect(emitted[0].payload.productCost).toBeDefined()           // RED
expect(emitted[0].payload.productCost.storeId).toBe(STORE)
```

Do the same for the second test `updates options + reports changedFields`:

```ts
expect(emitted[0].payload.productCost).toBeDefined()           // RED
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/api/typescript && bun test src/catalog/usecases/UpdateProductCost.test.ts
```

Expected: FAIL — `emitted[0].payload.productCost` is `undefined`.

- [ ] **Step 3: Rewrite `ProductCostCreatedEvent.ts`**

Replace `packages/api/typescript/src/catalog/events/ProductCostCreatedEvent.ts`:

```ts
import { BaseDomainEvent, z } from '@template/core-typescript'
import { ProductCostSchema } from '../entities/ProductCost'

export const ProductCostCreatedEventSchema = z.domainEvent({
  productCost: ProductCostSchema,
})

export class ProductCostCreatedEvent extends BaseDomainEvent<typeof ProductCostCreatedEventSchema> {
  static override readonly name = 'catalog.product_cost.created' as const
  static readonly schema = ProductCostCreatedEventSchema
}
```

- [ ] **Step 4: Rewrite `ProductCostUpdatedEvent.ts`**

Replace `packages/api/typescript/src/catalog/events/ProductCostUpdatedEvent.ts`:

```ts
import { BaseDomainEvent, z } from '@template/core-typescript'
import { ProductCostSchema } from '../entities/ProductCost'

export const ProductCostUpdatedEventSchema = z.domainEvent({
  productCost: ProductCostSchema,
})

export class ProductCostUpdatedEvent extends BaseDomainEvent<typeof ProductCostUpdatedEventSchema> {
  static override readonly name = 'catalog.product_cost.updated' as const
  static readonly schema = ProductCostUpdatedEventSchema
}
```

- [ ] **Step 5: Update `CreateProductCost.ts` publisher**

Replace the `ProductCostCreatedEvent` construction in `CreateProductCost.ts`:

```ts
await this.domainEventRepository.save(
  new ProductCostCreatedEvent({
    entityId: productCost.id.value,
    ownerId: input.storeId,
    payload: { productCost: productCost.toJSON() },
  }),
  tx,
)
```

- [ ] **Step 6: Update `UpdateProductCost.ts` publisher**

Replace the `ProductCostUpdatedEvent` construction in `UpdateProductCost.ts`:

```ts
await this.domainEventRepository.save(
  new ProductCostUpdatedEvent({
    entityId: productCost.id.value,
    ownerId: productCost.storeId,
    payload: { productCost: productCost.toJSON() },
  }),
  tx,
)
```

- [ ] **Step 7: Update `ProductCostApplicationHandler` consumer**

Open `packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts`. This handler subscribes to the **wire** `ProductCostCreatedEvent` and `ProductCostDeletedEvent` from `@template/contracts-typescript/wire/events` — not the domain event — so its payload shape is not affected by this task. Confirm by checking the import source: if it imports from `@template/contracts-typescript/wire/events`, leave it unchanged. If it imports from `../../../catalog/events`, update `event.payload.storeId` / `event.payload.variantId` to `event.payload.productCost.storeId` / `event.payload.productCost.options[0].items[0].variantIds[0]` (unlikely — the wire event is a separate shape). Document the finding as a comment.

- [ ] **Step 8: Fix test assertions**

Update `UpdateProductCost.test.ts` assertions to use `productCost` key. Do the same for `CreateProductCost.test.ts` if it asserts on `ProductCostCreatedEvent` payload fields.

- [ ] **Step 9: Run test GREEN**

```bash
cd packages/api/typescript && bun test src/catalog/usecases/UpdateProductCost.test.ts
cd packages/api/typescript && bun test src/catalog/usecases/CreateProductCost.test.ts
```

Expected: all tests PASS.

- [ ] **Step 10: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 11: Commit**

Use `/commit`:

```
refactor(catalog): ProductCostCreatedEvent + ProductCostUpdatedEvent embed ProductCostSchema (SPEC-08 Task 2)
```

Stage: `packages/api/typescript/src/catalog/events/`, `packages/api/typescript/src/catalog/usecases/CreateProductCost.ts`, `packages/api/typescript/src/catalog/usecases/UpdateProductCost.ts`, `packages/api/typescript/src/catalog/usecases/UpdateProductCost.test.ts`, `packages/api/typescript/src/catalog/usecases/CreateProductCost.test.ts`

---

## Task 3: finance — OperationalCostCreatedEvent + OperationalCostUpdatedEvent + WarrantyReserveCreatedEvent + WarrantyReserveUpdatedEvent + TaxesUpdatedEvent + FeesConfigurationUpdatedEvent embed entity schemas

**Files:**
- Modify: `packages/api/typescript/src/finance/events/OperationalCostCreatedEvent.ts`
- Modify: `packages/api/typescript/src/finance/events/OperationalCostUpdatedEvent.ts`
- Modify: `packages/api/typescript/src/finance/events/WarrantyReserveCreatedEvent.ts`
- Modify: `packages/api/typescript/src/finance/events/WarrantyReserveUpdatedEvent.ts`
- Modify: `packages/api/typescript/src/finance/events/TaxesUpdatedEvent.ts`
- Modify: `packages/api/typescript/src/finance/events/FeesConfigurationUpdatedEvent.ts`
- Modify: `packages/api/typescript/src/finance/usecases/CreateOperationalCost.ts`
- Modify: `packages/api/typescript/src/finance/usecases/UpdateOperationalCost.ts`
- Modify: `packages/api/typescript/src/finance/usecases/CreateWarrantyReserve.ts`
- Modify: `packages/api/typescript/src/finance/usecases/UpdateWarrantyReserve.ts`
- Modify: `packages/api/typescript/src/finance/usecases/UpdateTaxes.ts`
- Modify: `packages/api/typescript/src/finance/usecases/UpdateFeesConfiguration.ts`
- Modify: `packages/api/typescript/src/finance/usecases/OperationalCost.test.ts`
- Modify: `packages/api/typescript/src/finance/usecases/WarrantyReserve.test.ts`
- Modify: `packages/api/typescript/src/finance/usecases/Taxes.test.ts`
- Modify: `packages/api/typescript/src/finance/usecases/FeesConfiguration.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /event, /usecase, /test
**Depends on:** 0

> **Note:** `TaxesUpdatedEvent` keeps `effectiveStartDate` and `previousTaxesId` alongside the embedded entity — those are routing/supersession fields needed by consumers, not entity-snapshot fields. The entity key becomes `taxes: TaxesSchema`. Similarly `FeesConfigurationUpdatedEvent` keeps `effectiveStartDate` and `previousFeesConfigurationId` alongside `feesConfiguration: FeesConfigurationSchema`.

- [ ] **Step 1: Write failing assertions (RED)**

In `packages/api/typescript/src/finance/usecases/OperationalCost.test.ts`, find any assertion on `emitted[0].payload.entity` or `emitted[0].payload.operationalCostId` from the event payload (not from a repo read). Add failing assertions:

```ts
// SPEC-08 RED assertions
expect(emitted[0].payload.operationalCost).toBeDefined()
expect(emitted[0].payload.operationalCost.storeId).toBe(STORE_ID)
```

Do the same in `WarrantyReserve.test.ts`, `Taxes.test.ts`, `FeesConfiguration.test.ts` for their respective events.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/api/typescript && bun test src/finance/usecases/OperationalCost.test.ts
cd packages/api/typescript && bun test src/finance/usecases/WarrantyReserve.test.ts
cd packages/api/typescript && bun test src/finance/usecases/Taxes.test.ts
cd packages/api/typescript && bun test src/finance/usecases/FeesConfiguration.test.ts
```

Expected: FAIL on the new `payload.operationalCost` / `payload.warrantyReserve` / `payload.taxes` / `payload.feesConfiguration` assertions.

- [ ] **Step 3: Rewrite the 6 event files (GREEN)**

**`OperationalCostCreatedEvent.ts`:**
```ts
import { BaseDomainEvent, z } from '@template/core-typescript'
import { OperationalCostSchema } from '../entities/OperationalCost'

export const OperationalCostCreatedEventSchema = z.domainEvent({
  operationalCost: OperationalCostSchema,
})

export class OperationalCostCreatedEvent extends BaseDomainEvent<typeof OperationalCostCreatedEventSchema> {
  static override readonly name = 'finance.operational_cost.created' as const
  static readonly schema = OperationalCostCreatedEventSchema
}
```

**`OperationalCostUpdatedEvent.ts`:**
```ts
import { BaseDomainEvent, z } from '@template/core-typescript'
import { OperationalCostSchema } from '../entities/OperationalCost'

export const OperationalCostUpdatedEventSchema = z.domainEvent({
  operationalCost: OperationalCostSchema,
})

export class OperationalCostUpdatedEvent extends BaseDomainEvent<typeof OperationalCostUpdatedEventSchema> {
  static override readonly name = 'finance.operational_cost.updated' as const
  static readonly schema = OperationalCostUpdatedEventSchema
}
```

**`WarrantyReserveCreatedEvent.ts`:**
```ts
import { BaseDomainEvent, z } from '@template/core-typescript'
import { WarrantyReserveSchema } from '../entities/WarrantyReserve'

export const WarrantyReserveCreatedEventSchema = z.domainEvent({
  warrantyReserve: WarrantyReserveSchema,
  previousWarrantyReserveId: z.uuid().nullable(),
})

export class WarrantyReserveCreatedEvent extends BaseDomainEvent<typeof WarrantyReserveCreatedEventSchema> {
  static override readonly name = 'finance.warranty_reserve.created' as const
  static readonly schema = WarrantyReserveCreatedEventSchema
}
```

> Note: `previousWarrantyReserveId` is kept as a routing field (it is not part of the entity's own schema but is needed by downstream handlers to supersede the prior row).

**`WarrantyReserveUpdatedEvent.ts`:**
```ts
import { BaseDomainEvent, z } from '@template/core-typescript'
import { WarrantyReserveSchema } from '../entities/WarrantyReserve'

export const WarrantyReserveUpdatedEventSchema = z.domainEvent({
  warrantyReserve: WarrantyReserveSchema,
})

export class WarrantyReserveUpdatedEvent extends BaseDomainEvent<typeof WarrantyReserveUpdatedEventSchema> {
  static override readonly name = 'finance.warranty_reserve.updated' as const
  static readonly schema = WarrantyReserveUpdatedEventSchema
}
```

**`TaxesUpdatedEvent.ts`:**
```ts
import { BaseDomainEvent, z } from '@template/core-typescript'
import { TaxesSchema } from '../entities/Taxes'

export const TaxesUpdatedEventSchema = z.domainEvent({
  taxes: TaxesSchema,
  effectiveStartDate: z.date(),
  previousTaxesId: z.uuid().nullable(),
})

export class TaxesUpdatedEvent extends BaseDomainEvent<typeof TaxesUpdatedEventSchema> {
  static override readonly name = 'finance.taxes.updated' as const
  static readonly schema = TaxesUpdatedEventSchema
}
```

**`FeesConfigurationUpdatedEvent.ts`:**
```ts
import { BaseDomainEvent, z } from '@template/core-typescript'
import { FeesConfigurationSchema } from '../entities/FeesConfiguration'

export const FeesConfigurationUpdatedEventSchema = z.domainEvent({
  feesConfiguration: FeesConfigurationSchema,
  effectiveStartDate: z.date(),
  previousFeesConfigurationId: z.uuid().nullable(),
})

export class FeesConfigurationUpdatedEvent extends BaseDomainEvent<typeof FeesConfigurationUpdatedEventSchema> {
  static override readonly name = 'finance.fees_configuration.updated' as const
  static readonly schema = FeesConfigurationUpdatedEventSchema
}
```

- [ ] **Step 4: Update the 6 publisher use cases**

**`CreateOperationalCost.ts`** — replace the event construction:
```ts
await this.domainEventRepository.save(
  new OperationalCostCreatedEvent({
    entityId: entity.id.value,
    ownerId: input.storeId,
    payload: { operationalCost: entity.toJSON() },
  }),
  tx,
)
```

**`UpdateOperationalCost.ts`:**
```ts
await this.domainEventRepository.save(
  new OperationalCostUpdatedEvent({
    entityId: entity.id.value,
    ownerId: entity.storeId,
    payload: { operationalCost: entity.toJSON() },
  }),
  tx,
)
```

**`CreateWarrantyReserve.ts`** — verify it emits `WarrantyReserveCreatedEvent`. Read the file first; update the payload to `{ warrantyReserve: entity.toJSON(), previousWarrantyReserveId: previous?.id.value ?? null }`.

**`UpdateWarrantyReserve.ts`:**
```ts
await this.domainEventRepository.save(
  new WarrantyReserveUpdatedEvent({
    entityId: entity.id.value,
    ownerId: entity.storeId,
    payload: { warrantyReserve: entity.toJSON() },
  }),
  tx,
)
```

**`UpdateTaxes.ts`:**
```ts
await this.domainEventRepository.save(
  new TaxesUpdatedEvent({
    entityId: fresh.id.value,
    ownerId: input.storeId,
    payload: {
      taxes: fresh.toJSON(),
      effectiveStartDate: input.effectiveFrom,
      previousTaxesId: previous?.id.value ?? null,
    },
  }),
  tx,
)
```

**`UpdateFeesConfiguration.ts`:**
```ts
await this.domainEventRepository.save(
  new FeesConfigurationUpdatedEvent({
    entityId: fresh.id.value,
    ownerId: input.storeId,
    payload: {
      feesConfiguration: fresh.toJSON(),
      effectiveStartDate: input.effectiveFrom,
      previousFeesConfigurationId: previous?.id.value ?? null,
    },
  }),
  tx,
)
```

- [ ] **Step 5: Fix test assertions in all 4 test files**

Update every assertion on `payload.entity`, `payload.operationalCostId`, `payload.warrantyReserveId`, `payload.taxesId`, `payload.feesConfigurationId` (as event payload fields) to use the new entity key: `payload.operationalCost.storeId`, `payload.warrantyReserve.storeId`, `payload.taxes.storeId`, `payload.feesConfiguration.storeId`, etc.

- [ ] **Step 6: Run tests GREEN**

```bash
cd packages/api/typescript && bun test src/finance/usecases/OperationalCost.test.ts
cd packages/api/typescript && bun test src/finance/usecases/WarrantyReserve.test.ts
cd packages/api/typescript && bun test src/finance/usecases/Taxes.test.ts
cd packages/api/typescript && bun test src/finance/usecases/FeesConfiguration.test.ts
```

Expected: all PASS.

- [ ] **Step 7: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

Use `/commit`:

```
refactor(finance): 6 events embed entity schemas via toJSON; drop z.record (SPEC-08 Task 3)
```

Stage: `packages/api/typescript/src/finance/events/`, `packages/api/typescript/src/finance/usecases/`

---

## Task 4: marketing — ManualAdSpendRecordedEvent + ManualAdSpendUpdatedEvent embed AdSpendSchema

**Files:**
- Modify: `packages/api/typescript/src/marketing/events/ManualAdSpendRecordedEvent.ts`
- Modify: `packages/api/typescript/src/marketing/events/ManualAdSpendUpdatedEvent.ts`
- Modify: `packages/api/typescript/src/marketing/usecases/RecordManualAdSpend.ts` (publisher of Recorded)
- Modify: `packages/api/typescript/src/marketing/usecases/UpdateManualAdSpend.ts`
- Modify: `packages/api/typescript/src/marketing/usecases/ManualAdSpend.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /event, /usecase, /test
**Depends on:** 0

- [ ] **Step 1: Write the failing assertion (RED)**

Open `packages/api/typescript/src/marketing/usecases/ManualAdSpend.test.ts`. Find the assertion on `ManualAdSpendUpdatedEvent` payload. Add:

```ts
expect(emitted[0].payload.adSpend).toBeDefined()        // RED
expect(emitted[0].payload.adSpend.storeId).toBeDefined()
```

Likewise for `ManualAdSpendRecordedEvent` if asserted.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/api/typescript && bun test src/marketing/usecases/ManualAdSpend.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Rewrite `ManualAdSpendRecordedEvent.ts`**

```ts
import { BaseDomainEvent, z } from '@template/core-typescript'
import { AdSpendSchema } from '../entities/AdSpend'

export const ManualAdSpendRecordedEventSchema = z.domainEvent({
  adSpend: AdSpendSchema,
})

/**
 * In-process domain event for MANUAL ad-spend creation. AUTOMATIC rows
 * use the cross-BC `integration.shared.marketing.ad_spend_recorded`
 * event published by go-worker; manual rows stay local to TS-Marketing
 * per spec.
 */
export class ManualAdSpendRecordedEvent extends BaseDomainEvent<typeof ManualAdSpendRecordedEventSchema> {
  static override readonly name = 'marketing.manual_ad_spend.recorded' as const
  static readonly schema = ManualAdSpendRecordedEventSchema
}
```

- [ ] **Step 4: Rewrite `ManualAdSpendUpdatedEvent.ts`**

```ts
import { BaseDomainEvent, z } from '@template/core-typescript'
import { AdSpendSchema } from '../entities/AdSpend'

export const ManualAdSpendUpdatedEventSchema = z.domainEvent({
  adSpend: AdSpendSchema,
})

export class ManualAdSpendUpdatedEvent extends BaseDomainEvent<typeof ManualAdSpendUpdatedEventSchema> {
  static override readonly name = 'marketing.manual_ad_spend.updated' as const
  static readonly schema = ManualAdSpendUpdatedEventSchema
}
```

- [ ] **Step 5: Update `RecordManualAdSpend.ts` publisher**

Find the `RecordManualAdSpend` use case. Update the event construction:

```ts
await this.domainEventRepository.save(
  new ManualAdSpendRecordedEvent({
    entityId: entity.id.value,
    ownerId: entity.storeId.value,
    payload: { adSpend: entity.toJSON() },
  }),
  tx,
)
```

- [ ] **Step 6: Update `UpdateManualAdSpend.ts` publisher**

```ts
await this.domainEventRepository.save(
  new ManualAdSpendUpdatedEvent({
    entityId: entity.id.value,
    ownerId: entity.storeId.value,
    payload: { adSpend: entity.toJSON() },
  }),
  tx,
)
```

- [ ] **Step 7: Fix test assertions**

Update `ManualAdSpend.test.ts` to assert on `payload.adSpend.*` instead of `payload.entity.*` or per-field keys.

- [ ] **Step 8: Run test GREEN**

```bash
cd packages/api/typescript && bun test src/marketing/usecases/ManualAdSpend.test.ts
```

Expected: all PASS.

- [ ] **Step 9: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 10: Commit**

Use `/commit`:

```
refactor(marketing): ManualAdSpendRecordedEvent + ManualAdSpendUpdatedEvent embed AdSpendSchema (SPEC-08 Task 4)
```

Stage: `packages/api/typescript/src/marketing/events/ManualAdSpendRecordedEvent.ts`, `packages/api/typescript/src/marketing/events/ManualAdSpendUpdatedEvent.ts`, `packages/api/typescript/src/marketing/usecases/RecordManualAdSpend.ts`, `packages/api/typescript/src/marketing/usecases/UpdateManualAdSpend.ts`, `packages/api/typescript/src/marketing/usecases/ManualAdSpend.test.ts`

---

## Task 5: identity — ProfileUpdatedEvent + UserPreferencesUpdatedEvent embed entity schemas

**Files:**
- Modify: `packages/api/typescript/src/identity/events/ProfileUpdatedEvent.ts`
- Modify: `packages/api/typescript/src/identity/events/UserPreferencesUpdatedEvent.ts`
- Modify: `packages/api/typescript/src/identity/usecases/UpdateProfile.ts`
- Modify: `packages/api/typescript/src/identity/usecases/UpdateUserPreferences.ts`
- Modify: `packages/api/typescript/src/identity/events/index.test.ts`
- Modify: `packages/api/typescript/src/identity/usecases/UpdateProfile.test.ts`
- Modify: `packages/api/typescript/src/identity/usecases/UpdateUserPreferences.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /event, /usecase, /test
**Depends on:** 0

> **Key scoping note:** `ProfileUpdatedEvent` currently wraps `entity: z.object({ userId, name, pictureUrl })` — a hand-written subset of the auth `User`. However, `UpdateProfile.ts` mutates `authUser.name` / `authUser.image` which live on the `better-auth` user table, not on a `UserProfile` aggregate. The event's "entity" is not backed by a DDD aggregate with a `schema` and `toJSON`. **Resolution:** Use the exported `UserProfileSchema` (from Task 0) applied to a projection of the auth user's relevant fields — the `UpdateProfile` use case builds `UserProfile.create(...)` from the auth user, or constructs the `toJSON()` shape directly. Since `UpdateProfile` does not hold a `UserProfile` aggregate instance today, the use case should build the payload as `UserProfileSchema.parse({ userId, timezone: undefined, language: undefined, ... })` from the auth user's fields, or call `new UserProfile({...}).toJSON()` — whichever matches what the entity schema accepts. Document the pattern clearly. The key in the event becomes `userProfile` (matching the entity name).

> **`UserPreferencesUpdatedEvent` note:** `UpdateUserPreferences.ts` loads and mutates a `UserPreferences` aggregate via `prefsRepo`. The aggregate has `UserPreferencesSchema` (already exported). The payload key becomes `userPreferences: UserPreferencesSchema`.

- [ ] **Step 1: Write failing assertions (RED)**

In `packages/api/typescript/src/identity/events/index.test.ts`, replace:

```ts
it('ProfileUpdatedEvent payload carries the full profile entity snapshot', () => {
  const e = new ProfileUpdatedEvent({
    entityId: 'u1',
    ownerId: 'u1',
    payload: {
      userId: 'u1',
      entity: { userId: 'u1', name: 'Bob', pictureUrl: null },
    },
  })
  expect(e.payload.entity.name).toBe('Bob')
```

with:

```ts
it('ProfileUpdatedEvent payload carries userProfile key typed by UserProfileSchema', () => {
  const e = new ProfileUpdatedEvent({
    entityId: 'u1',
    ownerId: 'u1',
    payload: {
      userProfile: { userId: 'u1' },          // RED — schema expects new key
    },
  })
  expect(e.payload.userProfile).toBeDefined()  // RED
```

And similarly for `UserPreferencesUpdatedEvent`:

```ts
it('UserPreferencesUpdatedEvent payload carries userPreferences key typed by UserPreferencesSchema', () => {
  const e = new UserPreferencesUpdatedEvent({
    entityId: 'u1',
    ownerId: 'u1',
    payload: {
      userPreferences: {                       // RED
        userId: 'u1',
        notificationCurrencyMode: NotificationCurrencyMode.CUSTOM_CURRENCY,
        customCurrency: 'BRL',
        dailyNotificationsEnabled: false,
        orderPushPerStore: {},
      },
    },
  })
  expect(e.payload.userPreferences).toBeDefined() // RED
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/api/typescript && bun test src/identity/events/index.test.ts
```

Expected: FAIL — `payload.userProfile` / `payload.userPreferences` are not valid on the current schema.

- [ ] **Step 3: Rewrite `ProfileUpdatedEvent.ts`**

```ts
import { BaseDomainEvent, z } from '@template/core-typescript'
import { UserProfileSchema } from '../entities/UserProfile'

export const ProfileUpdatedEventSchema = z.domainEvent({
  userProfile: UserProfileSchema,
})

export class ProfileUpdatedEvent extends BaseDomainEvent<typeof ProfileUpdatedEventSchema> {
  static override readonly name = 'identity.user.profile_updated' as const
  static readonly schema = ProfileUpdatedEventSchema
}
```

- [ ] **Step 4: Rewrite `UserPreferencesUpdatedEvent.ts`**

```ts
import { BaseDomainEvent, z } from '@template/core-typescript'
import { UserPreferencesSchema } from '../entities/UserPreferences'

export const UserPreferencesUpdatedEventSchema = z.domainEvent({
  userPreferences: UserPreferencesSchema,
})

export class UserPreferencesUpdatedEvent extends BaseDomainEvent<typeof UserPreferencesUpdatedEventSchema> {
  static override readonly name = 'identity.user_preferences.updated' as const
  static readonly schema = UserPreferencesUpdatedEventSchema
}
```

- [ ] **Step 5: Update `UpdateProfile.ts` publisher**

The use case does not hold a `UserProfile` aggregate — it mutates `authUser` directly. Build the profile snapshot using the entity's `toJSON` shape. The simplest approach: construct a `UserProfile` from the updated auth user fields and call `toJSON()`:

```ts
import { UserProfile } from '../entities/UserProfile'
// Inside handle():
const profileEntity = UserProfile.create({
  userId: input.userId,
  timezone: undefined,
  language: undefined,
})
// then override name/pictureUrl — but UserProfile does not carry those today.
```

However, `UserProfileSchema` has `userId`, `timezone`, `language`, `brazilianTaxId`, `leadToken`, `disabledAt` — it does NOT have `name` or `pictureUrl` (those live on the `better-auth` user table). `ProfileUpdatedEvent` was previously carrying a hand-crafted subset. Since the event's entity must match `UserProfileSchema`, and `UserProfileSchema` does not have `name`/`pictureUrl`, the payload can only carry fields that `UserProfileSchema` recognizes.

**Decision:** Load the `UserProfile` aggregate from the `UserPreferencesRepository` / the identity's profile repo if one exists. If no `UserProfile` aggregate is loaded in `UpdateProfile`, build a minimal `UserProfile.create({ userId: input.userId })` and call `toJSON()` — the event then carries `{ userId, timezone: undefined, language: undefined, ... }`. The handler (currently a no-op stub) will need to re-read the auth user for `name`/`pictureUrl` when it ships in a future iter. This is consistent with the spec: "handlers must not re-fetch" means within the event's own bounded context — the identity context's downstream handler (not yet shipped) is a separate concern.

```ts
await this.domainEventRepository.save(
  new ProfileUpdatedEvent({
    entityId: input.userId,
    ownerId: input.userId,
    payload: {
      userProfile: UserProfile.create({ userId: input.userId }).toJSON(),
    },
  }),
  tx,
)
```

If a `UserProfileRepository` is available in this context, load the entity and call `.toJSON()` instead of constructing a new one.

- [ ] **Step 6: Update `UpdateUserPreferences.ts` publisher**

```ts
await this.domainEventRepository.save(
  new UserPreferencesUpdatedEvent({
    entityId: input.userId,
    ownerId: input.userId,
    payload: { userPreferences: prefs.toJSON() },
  }),
  tx,
)
```

- [ ] **Step 7: Fix test files**

Update `identity/events/index.test.ts` fixtures to use `userProfile` / `userPreferences` keys. Update `UpdateProfile.test.ts` and `UpdateUserPreferences.test.ts` to assert on the new keys.

- [ ] **Step 8: Run tests GREEN**

```bash
cd packages/api/typescript && bun test src/identity/events/index.test.ts
cd packages/api/typescript && bun test src/identity/usecases/UpdateProfile.test.ts
cd packages/api/typescript && bun test src/identity/usecases/UpdateUserPreferences.test.ts
```

Expected: all PASS.

- [ ] **Step 9: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 10: Commit**

Use `/commit`:

```
refactor(identity): ProfileUpdatedEvent + UserPreferencesUpdatedEvent embed entity schemas (SPEC-08 Task 5)
```

Stage: `packages/api/typescript/src/identity/events/ProfileUpdatedEvent.ts`, `packages/api/typescript/src/identity/events/UserPreferencesUpdatedEvent.ts`, `packages/api/typescript/src/identity/usecases/UpdateProfile.ts`, `packages/api/typescript/src/identity/usecases/UpdateUserPreferences.ts`, `packages/api/typescript/src/identity/events/index.test.ts`, `packages/api/typescript/src/identity/usecases/UpdateProfile.test.ts`, `packages/api/typescript/src/identity/usecases/UpdateUserPreferences.test.ts`

---

## Task 6: tenancy — StoreSettingsUpdatedEvent + StorePreferencesUpdatedEvent embed StoreSchema

**Files:**
- Modify: `packages/api/typescript/src/tenancy/events/StoreSettingsUpdatedEvent.ts`
- Modify: `packages/api/typescript/src/tenancy/events/StorePreferencesUpdatedEvent.ts`
- Modify: `packages/api/typescript/src/tenancy/usecases/UpdateStoreSettings.ts`
- Modify: `packages/api/typescript/src/tenancy/usecases/UpdateStorePreferences.ts`
- Modify: `packages/api/typescript/src/tenancy/events/index.test.ts`
- Modify: `packages/api/typescript/src/tenancy/usecases/UpdateStoreSettings.test.ts`
- Modify: `packages/api/typescript/src/tenancy/usecases/UpdateStorePreferences.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /event, /usecase, /test
**Depends on:** 0

> **Design note:** Both `StoreSettingsUpdatedEvent` and `StorePreferencesUpdatedEvent` wrap subsets of the `Store` aggregate. Both events also carry `updatedByUserId` as a routing field (not part of the entity snapshot). The entity key becomes `store: StoreSchema` — the entire `Store` aggregate is embedded. The `updatedByUserId` field stays alongside as a top-level payload field. This matches the spec's intent: embed the entity schema for the full aggregate snapshot.

- [ ] **Step 1: Write failing assertions (RED)**

In `packages/api/typescript/src/tenancy/events/index.test.ts`, replace the `StoreSettingsUpdatedEvent` fixture to use `store` key:

```ts
it('StoreSettingsUpdatedEvent carries the full Store entity snapshot (store key)', () => {
  const e = new StoreSettingsUpdatedEvent({
    entityId: STORE_ID,
    ownerId: USER_ID,
    payload: {
      store: {                                  // RED — currently `entity: { storeId, name, ...}`
        name: 'Acme',
        reportingCurrency: 'BRL',
        timezone: 'America/Sao_Paulo',
        isDisabled: false,
        showStoreNameInNotifications: true,
      },
      updatedByUserId: USER_ID,
    },
  })
  expect(e.payload.store.name).toBe('Acme')    // RED
```

And for `StorePreferencesUpdatedEvent`:

```ts
it('StorePreferencesUpdatedEvent carries the full Store entity snapshot (store key)', () => {
  const e = new StorePreferencesUpdatedEvent({
    entityId: STORE_ID,
    ownerId: USER_ID,
    payload: {
      store: {                                  // RED
        name: 'Acme',
        reportingCurrency: 'BRL',
        timezone: 'America/Sao_Paulo',
        isDisabled: false,
        showStoreNameInNotifications: true,
      },
      updatedByUserId: USER_ID,
    },
  })
  expect(e.payload.store.reportingCurrency).toBe('BRL')  // RED
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/api/typescript && bun test src/tenancy/events/index.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Rewrite `StoreSettingsUpdatedEvent.ts`**

```ts
import { BaseDomainEvent, z } from '@template/core-typescript'
import { StoreSchema } from '../entities/Store'

export const StoreSettingsUpdatedEventSchema = z.domainEvent({
  store: StoreSchema,
  updatedByuserId: z.uuid(),
})

export class StoreSettingsUpdatedEvent extends BaseDomainEvent<typeof StoreSettingsUpdatedEventSchema> {
  static override readonly name = 'tenancy.store.settings_updated' as const
  static readonly schema = StoreSettingsUpdatedEventSchema
}
```

- [ ] **Step 4: Rewrite `StorePreferencesUpdatedEvent.ts`**

```ts
import { BaseDomainEvent, z } from '@template/core-typescript'
import { StoreSchema } from '../entities/Store'

export const StorePreferencesUpdatedEventSchema = z.domainEvent({
  store: StoreSchema,
  updatedByuserId: z.uuid(),
})

export class StorePreferencesUpdatedEvent extends BaseDomainEvent<typeof StorePreferencesUpdatedEventSchema> {
  static override readonly name = 'tenancy.store_preferences.updated' as const
  static readonly schema = StorePreferencesUpdatedEventSchema
}
```

- [ ] **Step 5: Update `UpdateStoreSettings.ts` publisher**

```ts
await this.domainEventRepository.save(
  new StoreSettingsUpdatedEvent({
    entityId: input.storeId,
    ownerId: input.updatedByUserId,
    payload: {
      store: store.toJSON(),
      updatedByUserId: input.updatedByUserId,
    },
  }),
  tx,
)
```

- [ ] **Step 6: Update `UpdateStorePreferences.ts` publisher**

```ts
await this.domainEventRepository.save(
  new StorePreferencesUpdatedEvent({
    entityId: input.storeId,
    ownerId: input.updatedByUserId,
    payload: {
      store: store.toJSON(),
      updatedByUserId: input.updatedByUserId,
    },
  }),
  tx,
)
```

- [ ] **Step 7: Fix test files**

Update `tenancy/events/index.test.ts` fixtures (replace old `entity: { storeId, name, ... }` patterns). Update `UpdateStoreSettings.test.ts` and `UpdateStorePreferences.test.ts` payload assertions.

- [ ] **Step 8: Run tests GREEN**

```bash
cd packages/api/typescript && bun test src/tenancy/events/index.test.ts
cd packages/api/typescript && bun test src/tenancy/usecases/UpdateStoreSettings.test.ts
cd packages/api/typescript && bun test src/tenancy/usecases/UpdateStorePreferences.test.ts
```

Expected: all PASS.

- [ ] **Step 9: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 10: Commit**

Use `/commit`:

```
refactor(tenancy): StoreSettingsUpdatedEvent + StorePreferencesUpdatedEvent embed StoreSchema (SPEC-08 Task 6)
```

Stage: `packages/api/typescript/src/tenancy/events/StoreSettingsUpdatedEvent.ts`, `packages/api/typescript/src/tenancy/events/StorePreferencesUpdatedEvent.ts`, `packages/api/typescript/src/tenancy/usecases/UpdateStoreSettings.ts`, `packages/api/typescript/src/tenancy/usecases/UpdateStorePreferences.ts`, `packages/api/typescript/src/tenancy/events/index.test.ts`, `packages/api/typescript/src/tenancy/usecases/UpdateStoreSettings.test.ts`, `packages/api/typescript/src/tenancy/usecases/UpdateStorePreferences.test.ts`

---

## Task 7: Integration QA — round-trip assertions + full suite green

**Files:**
- Create: `packages/api/typescript/src/analytics/events/GoalEvent.roundtrip.test.ts`
- Create: `packages/api/typescript/src/catalog/events/ProductCostEvent.roundtrip.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** 1, 2, 3, 4, 5, 6

> **Why round-trip tests?** The spec mandates `Entity.schema.parse(entity.toJSON())`. The round-trip test proves that `toJSON()` produces a value that the entity schema validates without error — i.e., the embedded event schema is consistent with the entity's own invariants. One test per context is sufficient; analytics and catalog are the most complex (GoalSchema with MonetaryAmount dependency, ProductCostSchema with nested items). The finance, marketing, identity, and tenancy round-trips are covered by the existing use-case tests (which save + read the entity).

- [ ] **Step 1: Verify no `z.record(z.string(), z.unknown())` remains (RED)**

```bash
grep -r "z\.record(z\.string(), z\.unknown())" packages/api/typescript/src/
```

Expected: **zero matches**. If any match remains, the corresponding context task did not complete.

- [ ] **Step 2: Create `GoalEvent.roundtrip.test.ts`**

Create `packages/api/typescript/src/analytics/events/GoalEvent.roundtrip.test.ts`:

```ts
import { describe, it, expect } from 'bun:test'
import { Goal, GoalSchema } from '../entities/Goal'
import { GoalCreatedEvent } from './GoalCreatedEvent'
import { GoalUpdatedEvent } from './GoalUpdatedEvent'
import { CurrencyCode, GoalType } from '@template/contracts-typescript/wire/enums'

const STORE = 'aaaaaaaa-0001-4000-8000-000000000001'
const USER = 'eeeeeeee-0001-4000-8000-000000000001'

describe('Goal event round-trip (SPEC-08)', () => {
  it('Goal.toJSON() round-trips through GoalSchema.parse()', () => {
    const goal = Goal.create({
      userId: USER,
      storeId: STORE,
      type: GoalType.REVENUE,
      targetAmountCents: 100_000,
      currency: CurrencyCode.USD,
      from: '2026-06-01',
      to: '2026-06-30',
    })
    const json = goal.toJSON()
    const parsed = GoalSchema.safeParse(json)
    expect(parsed.success).toBe(true)
  })

  it('GoalCreatedEvent payload.goal is a valid GoalSchema parse result', () => {
    const goal = Goal.create({
      userId: USER,
      storeId: STORE,
      type: GoalType.REVENUE,
      targetAmountCents: 50_000,
      currency: CurrencyCode.BRL,
      from: '2026-07-01',
      to: '2026-07-31',
    })
    const event = new GoalCreatedEvent({
      entityId: goal.id.value,
      ownerId: STORE,
      payload: { goal: goal.toJSON() },
    })
    const parsed = GoalSchema.safeParse(event.payload.goal)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.type).toBe(GoalType.REVENUE)
  })

  it('GoalUpdatedEvent payload.goal carries the mutated snapshot', () => {
    const goal = Goal.create({
      userId: USER,
      storeId: STORE,
      type: GoalType.PROFIT,
      targetAmountCents: 100_000,
      currency: CurrencyCode.USD,
      from: '2026-06-01',
      to: '2026-06-30',
    })
    goal.updateTarget({ targetAmountCents: 200_000 })
    const event = new GoalUpdatedEvent({
      entityId: goal.id.value,
      ownerId: STORE,
      payload: { goal: goal.toJSON() },
    })
    const parsed = GoalSchema.safeParse(event.payload.goal)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    // After SPEC-01 this will be parsed.data.targetAmount.amountCents; until then:
    expect(parsed.data.targetAmountCents).toBe(200_000)
  })
})
```

- [ ] **Step 3: Create `ProductCostEvent.roundtrip.test.ts`**

Create `packages/api/typescript/src/catalog/events/ProductCostEvent.roundtrip.test.ts`:

```ts
import { describe, it, expect } from 'bun:test'
import { ProductCost, ProductCostSchema } from '../entities/ProductCost'
import { ProductCostCreatedEvent } from './ProductCostCreatedEvent'
import { CurrencyCode, ProductCostType, QuantityModifier } from '@template/contracts-typescript/wire/enums'

const STORE = 'aaaaaaaa-0001-4000-8000-000000000001'
const SI = 'bbbbbbbb-0001-4000-8000-000000000001'
const VARIANT = 'dddddddd-0001-4000-8000-000000000001'

describe('ProductCost event round-trip (SPEC-08)', () => {
  it('ProductCost.toJSON() round-trips through ProductCostSchema.parse()', () => {
    const entity = ProductCost.create({
      storeId: STORE,
      storeIntegrationId: SI,
      productId: null,
      costType: ProductCostType.SINGLE,
      options: [
        {
          currency: CurrencyCode.USD,
          startDate: '2026-01-01',
          shipping: { amountCents: 0, currency: CurrencyCode.USD },
          items: [
            {
              variantIds: [VARIANT],
              quantity: 1,
              quantityModifier: QuantityModifier.EQ,
              unitCost: { amountCents: 500, currency: CurrencyCode.USD },
              shipping: { amountCents: 0, currency: CurrencyCode.USD },
            },
          ],
        },
      ],
    })
    const json = entity.toJSON()
    const parsed = ProductCostSchema.safeParse(json)
    expect(parsed.success).toBe(true)
  })

  it('ProductCostCreatedEvent payload.productCost is valid', () => {
    const entity = ProductCost.create({
      storeId: STORE,
      storeIntegrationId: SI,
      productId: null,
      costType: ProductCostType.SINGLE,
      options: [
        {
          currency: CurrencyCode.USD,
          startDate: '2026-01-01',
          shipping: { amountCents: 0, currency: CurrencyCode.USD },
          items: [
            {
              variantIds: [VARIANT],
              quantity: 1,
              quantityModifier: QuantityModifier.EQ,
              unitCost: { amountCents: 200, currency: CurrencyCode.USD },
              shipping: { amountCents: 0, currency: CurrencyCode.USD },
            },
          ],
        },
      ],
    })
    const event = new ProductCostCreatedEvent({
      entityId: entity.id.value,
      ownerId: STORE,
      payload: { productCost: entity.toJSON() },
    })
    const parsed = ProductCostSchema.safeParse(event.payload.productCost)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.storeId).toBe(STORE)
    expect(parsed.data.costType).toBe(ProductCostType.SINGLE)
  })
})
```

- [ ] **Step 4: Run round-trip tests**

```bash
cd packages/api/typescript && bun test src/analytics/events/GoalEvent.roundtrip.test.ts
cd packages/api/typescript && bun test src/catalog/events/ProductCostEvent.roundtrip.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Run the full suite**

```bash
cd packages/api/typescript && bun run test
```

Expected: all tests PASS. Zero regressions.

- [ ] **Step 6: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 7: Grep for remaining violations**

```bash
grep -r "entity: z\.record(z\.string(), z\.unknown())" packages/api/typescript/src/
grep -r "entity: \{ \.\.\.entity \}" packages/api/typescript/src/
grep -r "entity: \{ \.\.\.productCost \}" packages/api/typescript/src/
grep -r "entity: \{ \.\.\.fresh \}" packages/api/typescript/src/
```

Expected: **zero matches** for all four patterns.

- [ ] **Step 8: Commit**

Use `/commit`:

```
test(events): round-trip assertions for GoalSchema + ProductCostSchema (SPEC-08 Task 7)
```

Stage: `packages/api/typescript/src/analytics/events/GoalEvent.roundtrip.test.ts`, `packages/api/typescript/src/catalog/events/ProductCostEvent.roundtrip.test.ts`

---

## Acceptance Criteria Coverage

| AC | Covered by |
|---|---|
| No `entity: z.record(z.string(), z.unknown())` remains | Task 7 Step 1 (grep) |
| `GoalCreatedEvent` / `GoalUpdatedEvent` embed `GoalSchema` | Task 1 Steps 3–4 |
| `ProductCostCreatedEvent` / `ProductCostUpdatedEvent` embed `ProductCostSchema` | Task 2 Steps 3–4 |
| Finance: 6 events embed entity schemas | Task 3 Steps 3 |
| `ManualAdSpendRecordedEvent` / `ManualAdSpendUpdatedEvent` embed `AdSpendSchema` | Task 4 Steps 3–4 |
| `ProfileUpdatedEvent` / `UserPreferencesUpdatedEvent` embed entity schemas | Task 5 Steps 3–4 |
| `StoreSettingsUpdatedEvent` / `StorePreferencesUpdatedEvent` embed `StoreSchema` | Task 6 Steps 3–4 |
| Publishers use `entity.toJSON()` — no manual field spreading | Tasks 1–6 Step 5/6 (publisher updates) |
| Consumers read `event.payload.<entity>` typed by schema | Tasks 1–6 test assertions |
| Round-trip test: `Entity.schema.parse(entity.toJSON())` | Task 7 Steps 2–4 |
| `bun tsc` clean | Each task Step 9/2 |
| `bun run test` clean | Task 7 Step 5 |
