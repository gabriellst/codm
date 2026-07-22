# SPEC-09: Remove changed-fields tracking — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle.

**Goal:** Remove all `string[]` changed-field tracking from entity update methods and the no-op-skip guards from use cases. After SPEC-08 the `*Updated` event embeds the full entity snapshot, so the arrays have zero consumers. The update path becomes unconditionally: apply → save → publish `*Updated`.

**Architecture:** Six atomic commits grouped by bounded-context proximity — (1) entities (4 entities across analytics/finance/sales/tenancy); (2) tenancy use cases + tests; (3) analytics use case + test; (4) identity use case + test; (5) catalog + marketing use cases + tests; (6) finance use cases + tests. The `MarkNotificationRead.changed` boolean is explicitly left untouched. Verification grep runs after each commit and as a final gate. No migration, no SDK regen, no contract change.

**Tech Stack:** TypeScript + Bun + Zod.

**Spec:** `.specs/2026-05-25-refactor-batch-2/SPEC-09-remove-changed-fields.md`
**Tasks:** 6
**Estimated minutes:** 80

> **Planner note — task-breakdown threshold crossed (≥3 bounded contexts).** This plan touches analytics, catalog, finance, identity, marketing, sales, and tenancy — seven contexts. The phase-lane model applies: Tasks 1–2 form Phase 0 (entity contract lock — no use-case behavior change until entity signatures are settled), Tasks 3–6 are parallel Behavior Slices (each context is independent), and the final verification grep is Phase 2.

> **Planner note — MarkNotificationRead is explicitly excluded.** `MarkNotificationRead.ts` line 30: `const changed = delivery.markRead(input.userId)` — this is a domain-meaningful boolean returned by `BkdashNotificationDelivery.markRead()` indicating "was it newly marked read" (idempotent guard, not field tracking). It stays.

> **Planner note — UpdateOrderOverride.ts line 48.** `existing.changedFields(input.patch).length === 0` is the only remaining caller of `OrderOverride.changedFields`. After Task 1 deletes the method, Task 5 (sales) removes the guard from the use case, making the merge unconditional.

> **Planner note — UpdateTaxes and UpdateFeesConfiguration.** Neither `Taxes` nor `FeesConfiguration` entities have a `changedFields`/`changed` return — the `const changedFields: string[] = []` arrays in their use cases are purely locally-built (not returned by entity methods). Task 6 simply removes the local arrays; the supersession-insert logic and event emission are untouched.

> **Planner note — UpdateStoreSettings no-op tests.** The existing tests `'empty input → no event, no error'` and `'no-op (same value) → no event'` assert on the `changed.length === 0` skip. After SPEC-09, those scenarios emit `StoreSettingsUpdatedEvent` (idempotent re-publish is acceptable per spec). Tests are updated to assert the event IS emitted — not that it is absent.

---

## Task 1: Entities — remove `string[]` returns and `changedFields` method

> Phase 0 — Contract Lock. Settles all entity signatures before use cases are touched.

**Files:**
- Modify: `packages/api/typescript/src/tenancy/entities/Store.ts`
- Modify: `packages/api/typescript/src/analytics/entities/Goal.ts`
- Modify: `packages/api/typescript/src/finance/entities/OperationalCost.ts`
- Modify: `packages/api/typescript/src/finance/entities/WarrantyReserve.ts`
- Modify: `packages/api/typescript/src/sales/entities/OrderOverride.ts`
- Modify: `packages/api/typescript/src/tenancy/entities/Store.test.ts`
- Modify: `packages/api/typescript/src/sales/entities/OrderOverride.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity
**Depends on:** (none — but assume SPEC-08 has landed so `*Updated` events already embed the entity)

- [ ] **Step 1: Write failing assertions (RED)**

Add a compile-time assertion in `Store.test.ts` that the method returns `void`:

```ts
it('updateSettings returns void after SPEC-09', () => {
  const s = Store.create({ name: 'Acme', reportingCurrency: CurrencyCode.BRL, timezone: 'UTC' })
  // If updateSettings still returns string[], TypeScript will not error here at runtime,
  // but the next line will fail to compile because void has no .sort().
  // Run `bun tsc` to confirm the RED phase.
  const result: void = s.updateSettings({ name: 'Acme Co' })
  expect(result).toBeUndefined()
})
```

Add to `OrderOverride.test.ts`:

```ts
it('changedFields method no longer exists after SPEC-09', () => {
  const override = OrderOverride.create({
    storeId: 'store-1',
    orderId: 'order-1',
    storeIntegrationExternalId: 'shopify.mystore.com',
    fields: { paymentStatus: PaymentStatus.PENDING },
    updatedByUserId: 'user-1',
  })
  // Accessing override.changedFields must produce a TypeScript error.
  // Verify RED by running `bun tsc`; do NOT call the method — it must not exist.
  expect('changedFields' in override).toBe(false)
})
```

- [ ] **Step 2: Run `bun tsc` to confirm RED**

```bash
cd packages/api/typescript && bun tsc 2>&1 | head -40
```

Expected: type errors at `s.updateSettings(...)` (can't assign `string[]` to `void`) and at any caller of `store.updateSettings` or `entity.updatePreferences` that captures the return value.

- [ ] **Step 3: Update `Store.ts` — `updateSettings` and `updatePreferences` return `void`**

In `packages/api/typescript/src/tenancy/entities/Store.ts`:

Replace `updateSettings`:

```ts
updateSettings(input: { name?: string; pictureUrl?: string; email?: string; phoneNumber?: string }): void {
  for (const k of ['name', 'pictureUrl', 'email', 'phoneNumber'] as const) {
    if (input[k] !== undefined && this[k] !== input[k]) {
      ;(this as any)[k] = input[k]
    }
  }
  this.validate()
}
```

Replace `updatePreferences`:

```ts
updatePreferences(
  input: {
    reportingCurrency?: CurrencyCode
    timezone?: string
    showStoreNameInNotifications?: boolean
  },
  ctx: { hasOrders: boolean },
): void {
  if (input.reportingCurrency !== undefined && input.reportingCurrency !== this.reportingCurrency) {
    if (ctx.hasOrders) throw new BaseError<DomainErrors>('REPORTING_CURRENCY_LOCKED')
    this.reportingCurrency = input.reportingCurrency
  }
  if (input.timezone !== undefined && input.timezone !== this.timezone) {
    this.timezone = input.timezone
  }
  if (input.showStoreNameInNotifications !== undefined && input.showStoreNameInNotifications !== this.showStoreNameInNotifications) {
    this.showStoreNameInNotifications = input.showStoreNameInNotifications
  }
  this.validate()
}
```

Key changes: drop `const changed: string[] = []`, drop `changed.push(k)`, drop `return changed`, change return type annotations to `: void`.

- [ ] **Step 4: Update `Goal.ts` — `updateTarget` returns `void`**

In `packages/api/typescript/src/analytics/entities/Goal.ts`:

Replace `updateTarget`:

```ts
updateTarget(patch: { targetAmountCents?: number; from?: string; to?: string }): void {
  const effFrom = patch.from ?? this.from
  const effTo = patch.to ?? this.to
  if (effFrom > effTo) {
    throw new BaseError<AnalyticsDomainErrors>('INVALID_DATE_RANGE', 'from must be <= to')
  }
  if (patch.targetAmountCents !== undefined) {
    this.targetAmountCents = patch.targetAmountCents
  }
  if (patch.from !== undefined) {
    this.from = patch.from
  }
  if (patch.to !== undefined) {
    this.to = patch.to
  }
  this.validate()
}
```

Key changes: drop `const changed`, drop per-field `changed.push(...)`, drop `if (changed.length > 0) this.validate()` guard (validate unconditionally), return type `: void`.

- [ ] **Step 5: Update `OperationalCost.ts` — `update` returns `void`**

In `packages/api/typescript/src/finance/entities/OperationalCost.ts`:

Replace `update`:

```ts
update(patch: {
  category?: OperationalCostCategory
  description?: string
  amountCents?: number
  currency?: CurrencyCode
  recurrency?: OperationalCostRecurrency
  startDate?: string
  endDate?: string | null
}): void {
  if (this.deletedAt !== null) {
    throw new BaseError<FinanceDomainErrors>('INVALID_DATE_RANGE', 'cannot update a deleted OperationalCost')
  }
  const effectiveStart = patch.startDate ?? this.startDate
  const effectiveEnd = patch.endDate !== undefined ? patch.endDate : this.endDate
  if (effectiveEnd !== null && effectiveStart > effectiveEnd) {
    throw new BaseError<FinanceDomainErrors>('INVALID_DATE_RANGE', 'startDate must be <= endDate')
  }
  if (patch.category !== undefined) { this.category = patch.category }
  if (patch.description !== undefined) { this.description = patch.description }
  if (patch.amountCents !== undefined) { this.amountCents = patch.amountCents }
  if (patch.currency !== undefined) { this.currency = patch.currency }
  if (patch.recurrency !== undefined) { this.recurrency = patch.recurrency }
  if (patch.startDate !== undefined) { this.startDate = patch.startDate }
  if (patch.endDate !== undefined) { this.endDate = patch.endDate }
  this.validate()
}
```

Key changes: drop `const changed`, drop per-field inequality checks (apply unconditionally when field is present), drop `if (changed.length > 0) this.validate()` (validate unconditionally), return type `: void`.

Note: the per-field `!== this.xxx` equality checks are also removed — the entity no longer detects same-value writes (idempotent re-publish is acceptable).

- [ ] **Step 6: Update `WarrantyReserve.ts` — `update` returns `void`**

In `packages/api/typescript/src/finance/entities/WarrantyReserve.ts`:

Replace `update`:

```ts
update(patch: { rate?: number }): void {
  if (this.deletedAt !== null) {
    throw new BaseError<FinanceDomainErrors>('INVALID_DATE_RANGE', 'cannot update a deleted WarrantyReserve')
  }
  if (patch.rate !== undefined) {
    this.rate = patch.rate
  }
  this.validate()
}
```

Key changes: drop `const changed`, drop inequality check on `rate`, drop `if (changed.length > 0) this.validate()`, return type `: void`.

- [ ] **Step 7: Update `OrderOverride.ts` — delete `changedFields` method**

In `packages/api/typescript/src/sales/entities/OrderOverride.ts`:

Delete the `changedFields` method entirely (lines 57–60 in the current file):

```ts
// DELETE this block:
changedFields(incoming: OrderOverrideFields): (keyof OrderOverrideFields)[] {
  const keys = Object.keys(incoming) as Array<keyof OrderOverrideFields>
  return keys.filter(k => JSON.stringify(this.fields[k]) !== JSON.stringify(incoming[k]))
}
```

No replacement — callers will be updated in Task 5 (UpdateOrderOverride).

- [ ] **Step 8: Update entity tests**

In `packages/api/typescript/src/tenancy/entities/Store.test.ts`:

Replace the two tests that assert on the returned array and the no-op empty-array return:

```ts
// BEFORE (delete):
it('updateSettings returns the changedFields list, alphabetized after sort()', () => { ... })
it('updateSettings no-op when value matches current returns empty array', () => { ... })
it('updatePreferences allows currency change when hasOrders=false', () => {
  ...
  const changed = s.updatePreferences(...)
  expect(changed).toEqual(['reportingCurrency'])
  ...
})
it('updatePreferences accepts timezone-only change even when hasOrders=true', () => {
  ...
  const changed = s.updatePreferences(...)
  expect(changed).toEqual(['timezone'])
  ...
})
it('updatePreferences flips showStoreNameInNotifications when changed', () => {
  ...
  const changed = s.updatePreferences(...)
  expect(changed).toEqual(['showStoreNameInNotifications'])
  ...
})
```

Replace with:

```ts
it('updateSettings mutates the entity — name and email change', () => {
  const s = Store.create({ name: 'Acme', reportingCurrency: CurrencyCode.BRL, timezone: 'UTC' })
  s.updateSettings({ name: 'Acme Co', email: 'hello@acme.test' })
  expect(s.name).toBe('Acme Co')
  expect(s.email).toBe('hello@acme.test')
})

it('updateSettings with same value is a no-op mutation (idempotent)', () => {
  const s = Store.create({ name: 'Acme', reportingCurrency: CurrencyCode.BRL, timezone: 'UTC' })
  s.updateSettings({ name: 'Acme' })
  expect(s.name).toBe('Acme') // unchanged
})

it('updatePreferences allows currency change when hasOrders=false', () => {
  const s = Store.create({ name: 'Acme', reportingCurrency: CurrencyCode.BRL, timezone: 'UTC' })
  s.updatePreferences({ reportingCurrency: CurrencyCode.USD }, { hasOrders: false })
  expect(s.reportingCurrency).toBe(CurrencyCode.USD)
})

it('updatePreferences accepts timezone-only change even when hasOrders=true', () => {
  const s = Store.create({ name: 'Acme', reportingCurrency: CurrencyCode.BRL, timezone: 'UTC' })
  s.updatePreferences({ timezone: 'America/New_York' }, { hasOrders: true })
  expect(s.timezone).toBe('America/New_York')
})

it('updatePreferences flips showStoreNameInNotifications', () => {
  const s = Store.create({ name: 'Acme', reportingCurrency: CurrencyCode.BRL, timezone: 'UTC' })
  s.updatePreferences({ showStoreNameInNotifications: false }, { hasOrders: false })
  expect(s.showStoreNameInNotifications).toBe(false)
})

it('updateSettings returns void after SPEC-09', () => {
  const s = Store.create({ name: 'Acme', reportingCurrency: CurrencyCode.BRL, timezone: 'UTC' })
  const result: void = s.updateSettings({ name: 'Acme Co' })
  expect(result).toBeUndefined()
})
```

In `packages/api/typescript/src/sales/entities/OrderOverride.test.ts`:

Delete the two tests that assert on `changedFields`:

```ts
// DELETE:
it('changedFields returns keys whose values differ', () => { ... })
it('changedFields returns empty when nothing differs', () => { ... })
```

Add the existence-check test added in Step 1:

```ts
it('changedFields method no longer exists after SPEC-09', () => {
  const override = OrderOverride.create({
    storeId: 'store-1',
    orderId: 'order-1',
    storeIntegrationExternalId: 'shopify.mystore.com',
    fields: { paymentStatus: PaymentStatus.PENDING },
    updatedByUserId: 'user-1',
  })
  expect('changedFields' in override).toBe(false)
})
```

- [ ] **Step 9: Run entity test suites (GREEN)**

```bash
cd packages/api/typescript && bun test src/tenancy/entities/Store.test.ts src/sales/entities/OrderOverride.test.ts
```

Expected: all pass.

- [ ] **Step 10: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc 2>&1 | head -60
```

Expected: errors ONLY at callers that still capture the return value or call `changedFields` — these are in use cases addressed in Tasks 2–6. Note any tsc errors by file path so subsequent tasks can be targeted.

- [ ] **Step 11: Commit**

Use `/commit`:

```
refactor(entities): remove string[] changed-field returns + changedFields method (SPEC-09 Task 1)
```

Stage: `packages/api/typescript/src/tenancy/entities/Store.ts`, `packages/api/typescript/src/analytics/entities/Goal.ts`, `packages/api/typescript/src/finance/entities/OperationalCost.ts`, `packages/api/typescript/src/finance/entities/WarrantyReserve.ts`, `packages/api/typescript/src/sales/entities/OrderOverride.ts`, `packages/api/typescript/src/tenancy/entities/Store.test.ts`, `packages/api/typescript/src/sales/entities/OrderOverride.test.ts`

---

## Task 2: Tenancy use cases — `UpdateStoreSettings` and `UpdateStorePreferences`

> Phase 1 Behavior Slice — tenancy context.

**Files:**
- Modify: `packages/api/typescript/src/tenancy/usecases/UpdateStoreSettings.ts`
- Modify: `packages/api/typescript/src/tenancy/usecases/UpdateStorePreferences.ts`
- Modify: `packages/api/typescript/src/tenancy/usecases/UpdateStoreSettings.test.ts`
- Modify: `packages/api/typescript/src/tenancy/usecases/UpdateStorePreferences.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase
**Depends on:** 1

- [ ] **Step 1: Write failing assertion (RED)**

In `UpdateStoreSettings.test.ts`, add at the end of the describe block:

```ts
it('empty input emits StoreSettingsUpdated after SPEC-09 (no no-op skip)', async () => {
  // After SPEC-09 the use case always saves + emits. This test will fail
  // until the `if (changed.length === 0) return` guard is removed.
  const storeId = await seedStore()
  await useCase.execute({ storeId, updatedByUserId: UPDATER_ID })
  const evts = await readEvents()
  expect(evts).toHaveLength(1)
})
```

Run test to confirm RED:

```bash
cd packages/api/typescript && bun test src/tenancy/usecases/UpdateStoreSettings.test.ts --reporter verbose 2>&1 | tail -20
```

Expected: FAIL — `expect(evts).toHaveLength(1)` fails because the current code returns early.

- [ ] **Step 2: Rewrite `UpdateStoreSettings.ts`**

Remove `const changed = store.updateSettings(...)` capture and the `if (changed.length === 0) return` guard. The method now returns `void`. Apply unconditionally:

```ts
protected async handle(input: this['input'], tx?: DrizzleClient): Promise<this['output']> {
  return this.withTransaction(tx, async tx => {
    const store = await this.storeRepo.findById(input.storeId, tx)
    if (!store) throw new BaseError<ApplicationErrors>('STORE_NOT_FOUND')

    store.updateSettings({
      name: input.name,
      pictureUrl: input.pictureUrl ?? undefined,
      email: input.email ?? undefined,
      phoneNumber: input.phoneNumber ?? undefined,
    })

    await this.storeRepo.save(store, tx)
    await this.domainEventRepository.save(
      new StoreSettingsUpdatedEvent({
        entityId: input.storeId,
        ownerId: input.updatedByUserId,
        payload: {
          storeId: input.storeId,
          entity: {
            storeId: input.storeId,
            name: store.name,
            pictureUrl: store.pictureUrl ?? null,
            email: store.email ?? null,
            phoneNumber: store.phoneNumber ?? null,
          },
          updatedByUserId: input.updatedByUserId,
        },
      }),
      tx,
    )
  })
}
```

Note: Once SPEC-08 is applied the event payload shape will already use `store.toJSON()` — the snippet above preserves the current hand-spread form that was in place at the time of this plan. If SPEC-08 has landed first, use `store.toJSON()` instead.

- [ ] **Step 3: Rewrite `UpdateStorePreferences.ts`**

Remove `const changed = store.updatePreferences(...)` capture and the `if (changed.length === 0) return` guard. Apply unconditionally:

```ts
protected async handle(input: this['input'], tx?: DrizzleClient): Promise<this['output']> {
  return this.withTransaction(tx, async tx => {
    const store = await this.storeRepo.findById(input.storeId, tx)
    if (!store) throw new BaseError<ApplicationErrors>('STORE_NOT_FOUND')

    const hasOrders = await this.orderSampling.hasOrdersForStore(input.storeId)

    store.updatePreferences(
      {
        reportingCurrency: input.reportingCurrency,
        timezone: input.timezone,
        showStoreNameInNotifications: input.showStoreNameInNotifications,
      },
      { hasOrders },
    )

    await this.storeRepo.save(store, tx)
    await this.domainEventRepository.save(
      new StorePreferencesUpdatedEvent({
        entityId: input.storeId,
        ownerId: input.updatedByUserId,
        payload: {
          storeId: input.storeId,
          entity: {
            storeId: input.storeId,
            reportingCurrency: store.reportingCurrency,
            timezone: store.timezone,
            showStoreNameInNotifications: store.showStoreNameInNotifications,
          },
          updatedByUserId: input.updatedByUserId,
        },
      }),
      tx,
    )
  })
}
```

- [ ] **Step 4: Update `UpdateStoreSettings.test.ts`**

Replace the two no-op tests that expect ZERO events:

```ts
// BEFORE — delete both:
it('empty input → no event, no error', ...)
it('no-op (same value) → no event', ...)
```

Replace with:

```ts
it('empty input → event still emitted (no no-op skip after SPEC-09)', async () => {
  const storeId = await seedStore()
  await useCase.execute({ storeId, updatedByUserId: UPDATER_ID })
  const evts = await readEvents()
  expect(evts).toHaveLength(1)
  expect(evts[0].payload.updatedByUserId).toBe(UPDATER_ID)
})

it('same-value update → event emitted (idempotent re-publish)', async () => {
  const storeId = await seedStore()
  await useCase.execute({ storeId, updatedByUserId: UPDATER_ID, name: 'Acme' })
  const evts = await readEvents()
  expect(evts).toHaveLength(1)
})
```

Keep the `'partial update emits StoreSettingsUpdated with changedFields'` test as-is (rename it to `'partial update emits StoreSettingsUpdated with entity snapshot'` to drop the "changedFields" language if desired, but functionally it still passes).

Keep the `'throws STORE_NOT_FOUND for unknown storeId'` test as-is.

- [ ] **Step 5: Update `UpdateStorePreferences.test.ts`**

Replace the no-op test:

```ts
// BEFORE — delete:
it('empty input → no event, no error', ...)
```

Replace with:

```ts
it('empty input → event still emitted after SPEC-09 (no no-op skip)', async () => {
  const storeId = await seedStore()
  const uc = useCaseWithOrders(false)
  await uc.execute({ storeId, updatedByUserId: UPDATER_ID })
  const evts = await readEvents()
  expect(evts).toHaveLength(1)
})
```

Keep all other tests (currency-locked, timezone, showStore, STORE_NOT_FOUND) as-is — they still pass because the entity invariants are unchanged.

- [ ] **Step 6: Run tenancy test suites (GREEN)**

```bash
cd packages/api/typescript && bun test src/tenancy/usecases/UpdateStoreSettings.test.ts src/tenancy/usecases/UpdateStorePreferences.test.ts
```

Expected: all pass.

- [ ] **Step 7: `bun tsc` clean on tenancy**

```bash
cd packages/api/typescript && bun tsc --noEmit 2>&1 | grep tenancy
```

Expected: 0 tenancy errors.

- [ ] **Step 8: Commit**

Use `/commit`:

```
refactor(tenancy): remove changed-fields guard from UpdateStoreSettings/Preferences (SPEC-09 Task 2)
```

Stage: `packages/api/typescript/src/tenancy/usecases/UpdateStoreSettings.ts`, `packages/api/typescript/src/tenancy/usecases/UpdateStorePreferences.ts`, `packages/api/typescript/src/tenancy/usecases/UpdateStoreSettings.test.ts`, `packages/api/typescript/src/tenancy/usecases/UpdateStorePreferences.test.ts`

---

## Task 3: Analytics — `UpdateGoal`

> Phase 1 Behavior Slice — analytics context.

**Files:**
- Modify: `packages/api/typescript/src/analytics/usecases/UpdateGoal.ts`
- Modify: `packages/api/typescript/src/analytics/usecases/Goal.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase
**Depends on:** 1

- [ ] **Step 1: Write failing assertion (RED)**

In `Goal.test.ts`, the `'Update changedFields + no-op when no change'` test currently asserts:

```ts
await update.execute({ userId: USER, goalId: id, targetAmountCents: 200_000 })
expect(await readEvents(GoalUpdatedEvent.name)).toHaveLength(1) // still 1
```

This second assertion verifies the no-op skip. After SPEC-09, a same-value call will emit a second event. Add a test that will fail under the current code:

```ts
it('Update always emits GoalUpdatedEvent — no no-op skip (SPEC-09)', async () => {
  const id = await seed()
  await update.execute({ userId: USER, goalId: id, targetAmountCents: 200_000 })
  await update.execute({ userId: USER, goalId: id, targetAmountCents: 200_000 }) // same value
  // After SPEC-09 both calls emit — expect 2 events
  expect(await readEvents(GoalUpdatedEvent.name)).toHaveLength(2)
})
```

Run to confirm RED:

```bash
cd packages/api/typescript && bun test src/analytics/usecases/Goal.test.ts --reporter verbose 2>&1 | tail -20
```

Expected: FAIL — test expects 2 events, but the guard makes the second call a no-op.

- [ ] **Step 2: Rewrite `UpdateGoal.ts`**

Remove `const changedFields = entity.updateTarget(...)` capture and the `if (changedFields.length === 0) return` guard. Apply unconditionally. Also pull the `save` + `event` emission out of the nested `this.withTransaction` (use the outer one via the existing `tx` parameter pattern):

```ts
protected async handle(input: this['input'], tx?: DrizzleClient): Promise<this['output']> {
  const entity = await this.goals.findById(input.goalId, tx)
  if (!entity) {
    throw new BaseError<AnalyticsApplicationErrors>('GOAL_NOT_FOUND')
  }

  entity.updateTarget({
    targetAmountCents: input.targetAmountCents,
    from: input.from,
    to: input.to,
  })

  await this.withTransaction(tx, async tx => {
    await this.goals.save(entity, tx)
    await this.domainEventRepository.save(
      new GoalUpdatedEvent({
        entityId: entity.id.value,
        ownerId: entity.storeId.value,
        payload: { goalId: entity.id.value, storeId: entity.storeId.value, entity: { ...entity } as Record<string, unknown> },
      }),
      tx,
    )
  })
}
```

Note: the `entity: { ...entity }` spread will be replaced by `entity.toJSON()` once SPEC-08 has landed. Preserve whatever payload shape SPEC-08 left.

- [ ] **Step 3: Update `Goal.test.ts`**

Replace the `'Update changedFields + no-op when no change'` test:

```ts
// BEFORE — delete:
it('Update changedFields + no-op when no change', async () => { ... })
```

Replace with:

```ts
it('Update persists + emits GoalUpdatedEvent', async () => {
  const id = await seed()
  await update.execute({ userId: USER, goalId: id, targetAmountCents: 200_000 })
  expect((await repo.findById(id))?.targetAmountCents).toBe(200_000)

  const emitted = await readEvents(GoalUpdatedEvent.name)
  expect(emitted).toHaveLength(1)
  expect(emitted[0].payload.entity).toBeDefined()
})

it('Update always emits GoalUpdatedEvent — no no-op skip (SPEC-09)', async () => {
  const id = await seed()
  await update.execute({ userId: USER, goalId: id, targetAmountCents: 200_000 })
  await update.execute({ userId: USER, goalId: id, targetAmountCents: 200_000 }) // same value
  expect(await readEvents(GoalUpdatedEvent.name)).toHaveLength(2)
})
```

- [ ] **Step 4: Run analytics test suite (GREEN)**

```bash
cd packages/api/typescript && bun test src/analytics/usecases/Goal.test.ts
```

Expected: all pass.

- [ ] **Step 5: `bun tsc` clean on analytics**

```bash
cd packages/api/typescript && bun tsc --noEmit 2>&1 | grep analytics
```

Expected: 0 analytics errors.

- [ ] **Step 6: Commit**

Use `/commit`:

```
refactor(analytics): remove changed-fields guard from UpdateGoal (SPEC-09 Task 3)
```

Stage: `packages/api/typescript/src/analytics/usecases/UpdateGoal.ts`, `packages/api/typescript/src/analytics/usecases/Goal.test.ts`

---

## Task 4: Identity — `UpdateUserPreferences`

> Phase 1 Behavior Slice — identity context.

**Files:**
- Modify: `packages/api/typescript/src/identity/usecases/UpdateUserPreferences.ts`
- Modify: `packages/api/typescript/src/identity/usecases/UpdateUserPreferences.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase
**Depends on:** 1

- [ ] **Step 1: Write failing assertion (RED)**

In `UpdateUserPreferences.test.ts`, the `'no-op call (same value) → no event emitted'` test currently asserts `expect(evts).toHaveLength(0)`. Add a test that will fail:

```ts
it('same-value update emits event after SPEC-09 (no no-op skip)', async () => {
  const userId = await seedUserWithPrefs('spec09@b.com')
  await useCase.execute({ userId, dailyNotificationsEnabled: true }) // default is already true
  const evts = await readUpdatedEvents()
  expect(evts).toHaveLength(1)
})
```

Run to confirm RED:

```bash
cd packages/api/typescript && bun test src/identity/usecases/UpdateUserPreferences.test.ts --reporter verbose 2>&1 | tail -20
```

Expected: FAIL — the guard skips the same-value call.

- [ ] **Step 2: Rewrite `UpdateUserPreferences.ts`**

Remove the `const before = { ... }` snapshot, the `const changed = ...` boolean expression, and the `if (!changed) return` guard. The handle body becomes:

```ts
protected async handle(input: this['input'], tx?: DrizzleClient): Promise<this['output']> {
  return this.withTransaction(tx, async tx => {
    const prefs = await this.prefsRepo.findByUserId(input.userId, tx)
    if (!prefs) throw new BaseError<ApplicationErrors>('USER_PREFERENCES_NOT_FOUND')

    prefs.updatePreferences({
      timezone: input.timezone,
      notificationCurrencyMode: input.notificationCurrencyMode,
      customCurrency: input.customCurrency,
      dailyNotificationsEnabled: input.dailyNotificationsEnabled,
    })

    await this.prefsRepo.save(prefs, tx)
    await this.domainEventRepository.save(
      new UserPreferencesUpdatedEvent({
        entityId: input.userId,
        ownerId: input.userId,
        payload: {
          userId: input.userId,
          entity: {
            userId: input.userId,
            timezone: prefs.timezone,
            notificationCurrencyMode: prefs.notificationCurrencyMode,
            customCurrency: prefs.customCurrency,
            dailyNotificationsEnabled: prefs.dailyNotificationsEnabled,
          },
        },
      }),
      tx,
    )
  })
}
```

- [ ] **Step 3: Update `UpdateUserPreferences.test.ts`**

Replace the two no-op tests:

```ts
// BEFORE — delete both:
it('no-op call (same value) → no event emitted', ...)
it('empty input (no fields) → no event, no error', ...)
```

Replace with:

```ts
it('same-value update emits event after SPEC-09 (no no-op skip)', async () => {
  const userId = await seedUserWithPrefs('spec09@b.com')
  await useCase.execute({ userId, dailyNotificationsEnabled: true }) // default is already true
  const evts = await readUpdatedEvents()
  expect(evts).toHaveLength(1)
})

it('empty input → event still emitted (all fields undefined, prefs saved as-is)', async () => {
  const userId = await seedUserWithPrefs('empty09@b.com')
  await useCase.execute({ userId })
  const evts = await readUpdatedEvents()
  expect(evts).toHaveLength(1)
})
```

Keep all other tests unchanged (`notificationCurrencyMode`, `customCurrency`, `timezone`, `null customCurrency`, `USER_PREFERENCES_NOT_FOUND`, `INVALID_TIMEZONE`).

- [ ] **Step 4: Run identity test suite (GREEN)**

```bash
cd packages/api/typescript && bun test src/identity/usecases/UpdateUserPreferences.test.ts
```

Expected: all pass.

- [ ] **Step 5: `bun tsc` clean on identity**

```bash
cd packages/api/typescript && bun tsc --noEmit 2>&1 | grep identity
```

Expected: 0 identity errors.

- [ ] **Step 6: Commit**

Use `/commit`:

```
refactor(identity): remove changed-fields guard from UpdateUserPreferences (SPEC-09 Task 4)
```

Stage: `packages/api/typescript/src/identity/usecases/UpdateUserPreferences.ts`, `packages/api/typescript/src/identity/usecases/UpdateUserPreferences.test.ts`

---

## Task 5: Catalog, Marketing, and Sales — `UpdateProductCost`, `UpdateManualAdSpend`, `UpdateOrderOverride`

> Phase 1 Behavior Slice — catalog + marketing + sales contexts (parallel opportunity within this task since contexts are independent; grouped here because all three are "built but unused `changedFields` local" pattern plus `OrderOverride` caller).

**Files:**
- Modify: `packages/api/typescript/src/catalog/usecases/UpdateProductCost.ts`
- Modify: `packages/api/typescript/src/catalog/usecases/UpdateProductCost.test.ts`
- Modify: `packages/api/typescript/src/marketing/usecases/UpdateManualAdSpend.ts`
- Modify: `packages/api/typescript/src/marketing/usecases/ManualAdSpend.test.ts`
- Modify: `packages/api/typescript/src/sales/usecases/UpdateOrderOverride.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase
**Depends on:** 1

- [ ] **Step 1: Write failing assertions (RED)**

In `UpdateProductCost.test.ts`, the `'no-op when no fields supplied — does not emit an event'` test currently expects 0 events. Add:

```ts
it('no fields supplied → event still emitted after SPEC-09 (no no-op skip)', async () => {
  const productCostId = await seedProductCost()
  await useCase.execute({ userId: USER, productCostId })
  const emitted = await readUpdatedEvents()
  expect(emitted).toHaveLength(1)
})
```

In `ManualAdSpend.test.ts`, the `'no-op + no event when no fields supplied'` test currently expects 0. Add:

```ts
it('no fields supplied → event still emitted after SPEC-09', async () => {
  const adSpendId = await seedManual()
  await update.execute({ userId: USER, adSpendId })
  const updated = await readEvents(ManualAdSpendUpdatedEvent.name)
  expect(updated).toHaveLength(1)
})
```

Run to confirm RED:

```bash
cd packages/api/typescript && bun test src/catalog/usecases/UpdateProductCost.test.ts src/marketing/usecases/ManualAdSpend.test.ts --reporter verbose 2>&1 | tail -30
```

- [ ] **Step 2: Rewrite `UpdateProductCost.ts`**

Remove the `const changedFields: string[] = []` block and the `if (changedFields.length === 0) { return }` guard. The use case must now unconditionally apply + save + emit:

```ts
protected async handle(input: this['input'], tx?: DrizzleClient): Promise<this['output']> {
  const productCost = await this.productCosts.findById(input.productCostId, tx)
  if (!productCost || productCost.isDeleted) {
    throw new BaseError<CatalogApplicationErrors>('PRODUCT_COST_NOT_FOUND')
  }

  await this.withTransaction(tx, async tx => {
    productCost.update({ displayName: input.displayName, options: input.options })
    await this.productCosts.save(productCost, tx)

    await this.domainEventRepository.save(
      new ProductCostUpdatedEvent({
        entityId: productCost.id.value,
        ownerId: productCost.storeId,
        payload: {
          productCostId: productCost.id.value,
          storeId: productCost.storeId,
          storeIntegrationId: productCost.storeIntegrationId,
          productId: productCost.productId,
          entity: { ...productCost } as Record<string, unknown>,
        },
      }),
      tx,
    )
  })
}
```

Note: the comment in the old docstring referencing `changedFields` is also removed.

- [ ] **Step 3: Rewrite `UpdateManualAdSpend.ts`**

Remove `const changedFields: string[] = []`, the per-field `changedFields.push(...)` block, and the `if (changedFields.length === 0) return` guard. Unconditional apply + save + emit:

```ts
protected async handle(input: this['input'], tx?: DrizzleClient): Promise<this['output']> {
  const entity = await this.adSpends.findById(input.adSpendId, tx)
  if (!entity) {
    throw new BaseError<MarketingApplicationErrors>('AD_SPEND_NOT_FOUND')
  }

  await this.withTransaction(tx, async tx => {
    entity.updateManual({
      name: input.name,
      description: input.description,
      startDate: input.startDate,
      endDate: input.endDate,
      spend:
        input.amountCents !== undefined
          ? {
              amountCents: input.amountCents,
              currency: input.currency ?? entity.currency,
            }
          : undefined,
    })
    await this.adSpends.save(entity, tx)

    await this.domainEventRepository.save(
      new ManualAdSpendUpdatedEvent({
        entityId: entity.id.value,
        ownerId: entity.storeId.value,
        payload: {
          adSpendId: entity.id.value,
          storeId: entity.storeId.value,
          entity: { ...entity } as Record<string, unknown>,
        },
      }),
      tx,
    )
  })
}
```

Also remove the old docstring reference to `changedFields`.

- [ ] **Step 4: Rewrite `UpdateOrderOverride.ts` — remove `changedFields` caller**

In `UpdateOrderOverride.ts`, the `existing.changedFields(input.patch).length === 0` guard (lines 48–50) is the last remaining call site of the now-deleted method. Remove the no-op skip. The merge branch becomes unconditional:

```ts
if (existing) {
  existing.mergeFields(input.patch, input.userId)
  entity = existing
} else {
  entity = OrderOverride.create({
    storeId: input.storeId,
    orderId: input.orderId,
    storeIntegrationExternalId: input.storeIntegrationExternalId,
    fields: input.patch,
    updatedByUserId: input.userId,
  })
}
```

The rest of the use case (save + emit `OrderOverriddenEvent`) is unchanged.

- [ ] **Step 5: Update `UpdateProductCost.test.ts`**

Replace the no-op test:

```ts
// BEFORE — delete:
it('no-op when no fields supplied — does not emit an event', ...)
```

Replace with:

```ts
it('no fields supplied → event still emitted after SPEC-09 (no no-op skip)', async () => {
  const productCostId = await seedProductCost()
  await useCase.execute({ userId: USER, productCostId })
  const emitted = await readUpdatedEvents()
  expect(emitted).toHaveLength(1)
  expect(emitted[0].payload.entity).toBeDefined()
})
```

Keep all other tests unchanged (displayName update, options update, both-fields, PRODUCT_COST_NOT_FOUND, soft-deleted, INVALID_DATE_RANGE).

Also update the test titles to drop "with changedFields=[X]" language where it appears:

```ts
// Before: 'updates displayName + emits ProductCostUpdatedEvent with changedFields=[displayName]'
// After:  'updates displayName + emits ProductCostUpdatedEvent'
// Before: 'updates options + reports changedFields=[options]; ...'
// After:  'updates options + emits ProductCostUpdatedEvent; ...'
// Before: 'updates both fields together — changedFields lists both'
// After:  'updates both fields together — emits ProductCostUpdatedEvent'
```

- [ ] **Step 6: Update `ManualAdSpend.test.ts`**

Replace the no-op test:

```ts
// BEFORE — delete:
it('no-op + no event when no fields supplied', ...)
```

Replace with:

```ts
it('no fields supplied → event still emitted after SPEC-09', async () => {
  const adSpendId = await seedManual()
  await update.execute({ userId: USER, adSpendId })
  const updated = await readEvents(ManualAdSpendUpdatedEvent.name)
  expect(updated).toHaveLength(1)
})
```

Also rename `'updates name + description + emits with changedFields'` to `'updates name + description + emits ManualAdSpendUpdatedEvent'`.

- [ ] **Step 7: Run test suites (GREEN)**

```bash
cd packages/api/typescript && bun test src/catalog/usecases/UpdateProductCost.test.ts src/marketing/usecases/ManualAdSpend.test.ts
```

Expected: all pass.

- [ ] **Step 8: `bun tsc` clean on catalog/marketing/sales**

```bash
cd packages/api/typescript && bun tsc --noEmit 2>&1 | grep -E 'catalog|marketing|sales'
```

Expected: 0 errors in those paths.

- [ ] **Step 9: Commit**

Use `/commit`:

```
refactor(catalog,marketing,sales): remove changed-fields guards (SPEC-09 Task 5)
```

Stage: `packages/api/typescript/src/catalog/usecases/UpdateProductCost.ts`, `packages/api/typescript/src/catalog/usecases/UpdateProductCost.test.ts`, `packages/api/typescript/src/marketing/usecases/UpdateManualAdSpend.ts`, `packages/api/typescript/src/marketing/usecases/ManualAdSpend.test.ts`, `packages/api/typescript/src/sales/usecases/UpdateOrderOverride.ts`

---

## Task 6: Finance — `UpdateOperationalCost`, `UpdateWarrantyReserve`, `UpdateTaxes`, `UpdateFeesConfiguration`

> Phase 1 Behavior Slice — finance context. `UpdateTaxes` and `UpdateFeesConfiguration` have locally-built `changedFields` arrays (not entity method returns) that are unused and must be removed.

**Files:**
- Modify: `packages/api/typescript/src/finance/usecases/UpdateOperationalCost.ts`
- Modify: `packages/api/typescript/src/finance/usecases/UpdateWarrantyReserve.ts`
- Modify: `packages/api/typescript/src/finance/usecases/UpdateTaxes.ts`
- Modify: `packages/api/typescript/src/finance/usecases/UpdateFeesConfiguration.ts`
- Modify: `packages/api/typescript/src/finance/usecases/OperationalCost.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase
**Depends on:** 1

- [ ] **Step 1: Write failing assertion (RED)**

In `OperationalCost.test.ts`, the `'Update emits with changedFields, no-op when nothing differs'` test asserts:

```ts
await update.execute({ userId: USER, operationalCostId: id, amountCents: 200_000 })
expect(after).toHaveLength(1) // still 1
```

Add a test that will fail:

```ts
it('same-value update emits event after SPEC-09 (no no-op skip)', async () => {
  const id = await seed()
  await update.execute({ userId: USER, operationalCostId: id, amountCents: 100_000 }) // same as seed
  const emitted = await readEvents(OperationalCostUpdatedEvent.name)
  expect(emitted).toHaveLength(1) // was zero before SPEC-09
})
```

Run to confirm RED:

```bash
cd packages/api/typescript && bun test src/finance/usecases/OperationalCost.test.ts --reporter verbose 2>&1 | tail -20
```

- [ ] **Step 2: Rewrite `UpdateOperationalCost.ts`**

Remove `const changedFields = entity.update({...})` capture and the `if (changedFields.length === 0) return` guard. Apply unconditionally:

```ts
protected async handle(input: this['input'], tx?: DrizzleClient): Promise<this['output']> {
  const entity = await this.costs.findById(input.operationalCostId, tx)
  if (!entity) {
    throw new BaseError<FinanceApplicationErrors>('OPERATIONAL_COST_NOT_FOUND')
  }

  entity.update({
    category: input.category,
    description: input.description,
    amountCents: input.amountCents,
    currency: input.currency,
    recurrency: input.recurrency,
    startDate: input.startDate,
    endDate: input.endDate,
  })

  await this.withTransaction(tx, async tx => {
    await this.costs.save(entity, tx)
    await this.domainEventRepository.save(
      new OperationalCostUpdatedEvent({
        entityId: entity.id.value,
        ownerId: entity.storeId,
        payload: {
          operationalCostId: entity.id.value,
          storeId: entity.storeId,
          entity: { ...entity } as Record<string, unknown>,
        },
      }),
      tx,
    )
  })
}
```

Also update the docstring: remove `"validates dates + reports changedFields"` language.

- [ ] **Step 3: Rewrite `UpdateWarrantyReserve.ts`**

Remove `const changedFields = entity.update({...})` capture and the `if (changedFields.length === 0) return` guard. Apply unconditionally:

```ts
protected async handle(input: this['input'], tx?: DrizzleClient): Promise<this['output']> {
  const entity = await this.warranties.findById(input.warrantyReserveId, tx)
  if (!entity || entity.isDeleted) {
    throw new BaseError<FinanceApplicationErrors>('WARRANTY_RESERVE_NOT_FOUND')
  }

  entity.update({ rate: input.rate !== undefined ? input.rate / 100 : undefined })

  await this.withTransaction(tx, async tx => {
    await this.warranties.save(entity, tx)
    await this.domainEventRepository.save(
      new WarrantyReserveUpdatedEvent({
        entityId: entity.id.value,
        ownerId: entity.storeId,
        payload: { warrantyReserveId: entity.id.value, storeId: entity.storeId, entity: { ...entity } as Record<string, unknown> },
      }),
      tx,
    )
  })
}
```

- [ ] **Step 4: Rewrite `UpdateTaxes.ts` — remove locally-built `changedFields` array**

The `UpdateTaxes` use case builds `const changedFields: string[] = []` purely as a local variable that is never consumed (the array is never passed to the event payload nor used in any guard). Simply delete the 5-line block:

```ts
// DELETE — lines 55–61 in the current file:
const changedFields: string[] = []
if (input.revenueTaxType !== undefined) changedFields.push('type')
if (input.revenueTaxDeductionType !== undefined) changedFields.push('deductionType')
if (input.revenueTaxRate !== undefined) changedFields.push('rate')
if (input.revenueTaxMultiplier !== undefined) changedFields.push('revenueTaxMultiplier')
if (input.marketingTaxRatePerPlatform !== undefined) changedFields.push('marketingTaxRatePerPlatform')
```

Everything else (supersede previous row, create fresh row, emit event) is unchanged and was already unconditional — no guard exists here.

- [ ] **Step 5: Rewrite `UpdateFeesConfiguration.ts` — remove locally-built `changedFields` array**

Same pattern as UpdateTaxes. Delete the 4-line block:

```ts
// DELETE — lines 49–52 in the current file:
const changedFields: string[] = []
if (input.gatewayFees !== undefined) changedFields.push('gatewayFees')
if (input.checkoutFees !== undefined) changedFields.push('checkoutFees')
if (input.shippingFee !== undefined) changedFields.push('shippingFee')
```

Everything else is unchanged.

Also update the docstring: remove `"emit FeesConfigurationUpdatedEvent with the changedFields list"` language.

- [ ] **Step 6: Update `OperationalCost.test.ts`**

Replace the `'Update emits with changedFields, no-op when nothing differs'` test:

```ts
// BEFORE — delete:
it('Update emits with changedFields, no-op when nothing differs', async () => { ... })
```

Replace with:

```ts
it('Update persists + emits OperationalCostUpdatedEvent', async () => {
  const id = await seed()
  await update.execute({ userId: USER, operationalCostId: id, amountCents: 200_000, description: 'New rent' })

  const saved = await repo.findById(id)
  expect(saved?.amountCents).toBe(200_000)
  expect(saved?.description).toBe('New rent')
  const emitted = await readEvents(OperationalCostUpdatedEvent.name)
  expect(emitted).toHaveLength(1)
  expect(emitted[0].payload.entity).toBeDefined()
})

it('same-value update emits event after SPEC-09 (no no-op skip)', async () => {
  const id = await seed()
  await update.execute({ userId: USER, operationalCostId: id, amountCents: 100_000 }) // same as seed
  const emitted = await readEvents(OperationalCostUpdatedEvent.name)
  expect(emitted).toHaveLength(1)
})
```

Keep all other tests unchanged (Create, Create INVALID_DATE_RANGE, Update OPERATIONAL_COST_NOT_FOUND, Delete, Toggle, List).

- [ ] **Step 7: Run finance test suite (GREEN)**

```bash
cd packages/api/typescript && bun test src/finance/usecases/OperationalCost.test.ts
```

Expected: all pass.

- [ ] **Step 8: Full test suite**

```bash
cd packages/api/typescript && bun run test
```

Expected: all tests pass across all contexts. Zero regressions.

- [ ] **Step 9: Final verification grep (Phase 2)**

```bash
grep -rn 'changedFields\|changed: string\[\]\|const changedFields\|const changed' \
  packages/api/typescript/src/**/*.ts \
  --include='*.ts' \
  | grep -v '.test.ts' \
  | grep -v 'MarkNotificationRead.ts'
```

Expected: **zero** results. If any appear, they are unreported callers that must be fixed before the commit.

Also run the use-case guard grep:

```bash
grep -rn 'if (changed' packages/api/typescript/src/**/*.ts --include='*.ts' | grep -v '.test.ts' | grep -v 'MarkNotificationRead.ts'
```

Expected: zero results (`MarkNotificationRead.ts` uses `if (!changed) return` — excluded).

- [ ] **Step 10: `bun tsc` clean (final)**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 11: Commit**

Use `/commit`:

```
refactor(finance): remove changed-fields tracking from UpdateOperationalCost, UpdateWarrantyReserve, UpdateTaxes, UpdateFeesConfiguration (SPEC-09 Task 6)
```

Stage: `packages/api/typescript/src/finance/usecases/UpdateOperationalCost.ts`, `packages/api/typescript/src/finance/usecases/UpdateWarrantyReserve.ts`, `packages/api/typescript/src/finance/usecases/UpdateTaxes.ts`, `packages/api/typescript/src/finance/usecases/UpdateFeesConfiguration.ts`, `packages/api/typescript/src/finance/usecases/OperationalCost.test.ts`

---

## Acceptance Criteria Coverage

| AC | Covered by |
|---|---|
| No entity method returns `string[]` of changed fields; `changedFields` method deleted | Task 1 Steps 3–7, 9–10 |
| No `changed: string[]` or `const changed/changedFields` in production `src/**` | Task 6 Step 9 (verification grep) |
| Update use cases unconditionally apply → save → publish `*Updated` (no `if (changed.length === 0) return`) | Tasks 2–6 |
| Tests updated; no test asserts on a changed-fields array | Tasks 1–6 (per-task test updates) |
| `bun tsc` clean | Tasks 1 Step 10, 2 Step 7, 3 Step 5, 4 Step 5, 5 Step 8, 6 Step 10 |
| `bun run test` clean | Task 6 Step 8 |
| `MarkNotificationRead.changed` boolean untouched | Spec Out-of-scope; not modified in any task |
