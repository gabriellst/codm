# SPEC-08: Domain entity events embed the typed entity (via `toJSON`)

**Wave:** 3   **Depends on:** SPEC-01   **Status:** done

## Motivation

Entity events are shaped three inconsistent ways today:

```ts
// per-field (most created/deleted events)
export const GoalCreatedEventSchema = z.domainEvent({
  goalId: z.uuid(), storeId: z.uuid(), userId: z.uuid(),
  type: GoalTypeSchema, targetAmountCents: z.number().int().positive(),
  currency: CurrencyCodeSchema, from: z.iso.date(), to: z.iso.date(),
})

// untyped snapshot (7 *Updated events, from batch-1 SPEC-14)
export const GoalUpdatedEventSchema = z.domainEvent({
  goalId: z.uuid(), storeId: z.uuid(),
  entity: z.record(z.string(), z.unknown()),
})
```

Per-field payloads duplicate the entity schema and rot when fields change; the `entity: z.record(...)` snapshot is untyped. Entities already have a recursive `.toJSON()` (`core/src/objects/ValueObject.ts`; `BaseEntity` extends `ValueObject`). The clean shape is to embed the entity's own schema under its name and populate it by serialising the aggregate:

```ts
export const GoalCreatedEventSchema = z.domainEvent({ goal: GoalSchema })
// publish: new GoalCreatedEvent({ payload: { goal: goal.toJSON() }, ... })
```

## Scope

1. For each **domain entity CRUD event** (`*Created`, `*Updated`), redefine the payload as a single typed key named for the entity, valued by that entity's exported schema: `z.domainEvent({ <entity>: <Entity>Schema })`.
2. Update the publishers (use cases / handlers) to populate the payload with `entity.toJSON()` instead of hand-spreading fields or `entity: { ...entity }`.
3. Replace the 7 `entity: z.record(...)` snapshots and the 4 ad-hoc typed `entity: z.object({...})` snapshots (identity/tenancy) with the entity-schema embed.
4. Update consumers (internal handlers / projectors that read these events) to read `event.payload.<entity>` typed by the schema. Where a handler re-parses the payload, it now parses against `<Entity>Schema`.

Apply to the entity CRUD events in: `analytics` (Goal), `catalog` (ProductCost, ProductTag*), `finance` (OperationalCost, WarrantyReserve, Taxes, FeesConfiguration, FxRate), `marketing` (ManualAdSpend), `identity` (Profile, UserPreferences), `tenancy` (Store settings/preferences).

## Affected files

- `src/<ctx>/events/*CreatedEvent.ts`, `*UpdatedEvent.ts` for the entity CRUD events above
- The publishing use cases (`Create*`, `Update*`) and any handler that re-publishes them
- Internal handlers / projectors consuming the reshaped payloads
- Exported entity schemas are already public (batch-1 wave-3 opened `export const XxxSchema`)

## Acceptance criteria

- [ ] Entity `*Created` / `*Updated` events declare a single typed entity key (`z.domainEvent({ goal: GoalSchema })`); no `entity: z.record(z.string(), z.unknown())` remains (grep → zero).
- [ ] Publishers populate the payload via `entity.toJSON()` — no manual field spreading / `{ ...entity }` casts in event construction.
- [ ] Consumers read `event.payload.<entity>` against the entity schema.
- [ ] Event schema tests + handler tests updated and green.
- [ ] `bun tsc` clean; `bun run test` clean.

## Out of scope

- **Integration (cross-service) events** — they stay lean wire shapes (Go/Rust consume them; don't push full TS entity schemas across the wire).
- **Delete events** — stay id-only (`{ goalId, storeId }`); a deleted aggregate has no meaningful snapshot.
- **Non-entity lifecycle events** — auth (`UserSignedIn`, `PasswordReset*`), integration handshake, notification events keep their per-field payloads; they don't wrap an aggregate.
- Removing changed-fields tracking — SPEC-09.

## Notes

- Depends on SPEC-01: once `Goal` / `AdSpend` / `OperationalCost` embed `MonetaryAmount`, the event's `<Entity>Schema` carries the VO shape automatically — do 01 first so the embedded schema is final.
- `.toJSON()` recursively converts nested value objects (`Id`, `MonetaryAmount`) to primitives, so the serialised payload matches the entity schema's parsed output — verify with a round-trip test (`Entity.schema.parse(entity.toJSON())`).
- Events remain immutable snapshots (the `/event` skill rule): no `.transform()` in the embedded schema beyond what the entity schema already does; handlers must not re-fetch from the DB.
