# SPEC-20: `Id.fromSeed` — unify deterministic id derivation

**Wave:** 3   **Stream:** A   **Depends on:** Wave 2 complete   **Status:** done

## Motivation

Two deterministic-id algorithms coexist today, both informally called "hash":

| Helper | Algo | Used by |
|---|---|---|
| `Id.fromHash([...])` (`core/src/objects/Id.ts:25`) | SHA-256, truncated to 32 hex chars — **looks like UUID, not RFC 4122 valid** | `identity/CaptureLead`, `billing/HandleBillingWebhook`, `sales/projections/OrderProjection`, `sales/projections/projectors/OrderProjector` |
| `HashedID(...)` (`core/src/objects/HashedID.ts:21`) | Real **UUIDv5** w/ `BK_DASH_NAMESPACE` + RFC 4122 bits — mirrored on Go side | `sales/entities/OrderOverride`, `integration/entities/StoreIntegration`, `integration/entities/MarketingAdAccount`, `integration/objects/Platform` |

Two algorithms → two surprising-id bugs waiting to happen. Cross-language stability (TS ↔ Go) requires UUIDv5. The SHA-256 form has no real upside.

Unify on **UUIDv5** under a single static factory `Id.fromSeed(...)`. Delete both helpers.

## Scope

### TS side

1. **Add `Id.fromSeed(...parts: string[]): Id`** to `core/src/objects/Id.ts`:
   - Algorithm = current `HashedID()` (UUIDv5 with `BK_DASH_NAMESPACE`, parts joined by `:`).
   - Re-home `BK_DASH_NAMESPACE` constant into `Id.ts` as a private `const`. Drop the public export.
   - Inline the UUIDv5 logic (SHA-1 + version + variant bit-twiddling) — do not depend on an external `uuid` package.

2. **Delete `core/src/objects/HashedID.ts`** entirely. Drop its export from `core/src/objects/index.ts` and any other barrel.

3. **Delete `Id.fromHash([...])`** from `Id.ts`. The old SHA-256 method goes away.

4. **Migrate all callers**:

| Current | New |
|---|---|
| `HashedID('integration', 'SHOPIFY', 'foo')` | `Id.fromSeed('integration', 'SHOPIFY', 'foo')` (or per-entity factory — see below) |
| `HashedID(...platformHashSeed(p, ext))` | `StoreIntegration.deterministicId(p, ext)` (new static — see below) |
| `Id.fromHash(['identity', 'lead', email])` | `Id.fromSeed('identity', 'lead', email)` |
| `Id.fromHash([p.platform, p.externalId])` | `Order.deterministicId(p)` (new static — see below) |

5. **Add per-entity static factories** for entities with non-trivial seed shapes. The static encapsulates the seed format so call sites don't repeat it:

```ts
// integration/entities/StoreIntegration.ts
static deterministicId(platform: PlatformProps, externalId: string): Id {
  return Id.fromSeed('integration', `${platform.type}:${platform.platform}`, externalId)
}

// sales/entities/OrderOverride.ts
static deterministicId(orderId: string, storeIntegrationExternalId: string): Id {
  return Id.fromSeed('order_override', orderId, storeIntegrationExternalId)
}

// integration/entities/MarketingAdAccount.ts
static deterministicId(platform: MarketingPlatform, adAccountExternalId: string): Id {
  return Id.fromSeed('marketing_ad_account', platform, adAccountExternalId)
}

// sales/projections/OrderProjection.ts + OrderProjector.ts (Order is Go-canonical but TS-projected)
static deterministicId(platform: SalesPlatform, externalId: string): Id {
  return Id.fromSeed(platform, externalId)
}
```

Note: `platformHashSeed()` in `integration/objects/Platform.ts` becomes obsolete — `StoreIntegration.deterministicId` is the only caller of the seed shape it used to build. SPEC-19 deletes `Platform.ts` entirely.

### Go side

`packages/api/go/core/objects/id.go` mirror change:

1. Add `IDFromSeed(parts ...string) (ID, error)` — identical algorithm and namespace as the TS `Id.fromSeed`.
2. Delete the old `HashedID(values ...string)` function.
3. Update all Go callers (search: `objects.HashedID(`) to call `objects.IDFromSeed(...)`.

Algorithm in Go:
```go
func IDFromSeed(parts ...string) (ID, error) {
  if len(parts) == 0 {
    return ID{}, errors.NewBaseError(errors.CodeInvalidID, "at least one part is required")
  }
  u := uuid.NewSHA1(BK_DASH_NAMESPACE, []byte(strings.Join(parts, ":")))
  return ID{value: u}, nil
}
```

Cross-language verification: `Id.fromSeed('integration', 'SHOPIFY', 'foo.myshopify.com')` must produce the same UUID string on both TS and Go (parity test exists at `packages/api/typescript/src/identity/objects/HashedIdParity.test.ts` — update or replace).

## Affected files

### TS
- `packages/api/typescript/core/src/objects/Id.ts` — add `fromSeed`, remove `fromHash`
- `packages/api/typescript/core/src/objects/HashedID.ts` — DELETE
- `packages/api/typescript/core/src/objects/HashedID.test.ts` — DELETE (or replace with `Id.fromSeed.test.ts`)
- `packages/api/typescript/core/src/objects/index.ts` — drop HashedID export
- `packages/api/typescript/src/identity/objects/index.ts` — drop comment referring to `Id.fromHash`
- `packages/api/typescript/src/identity/usecases/CaptureLead.ts` — migrate `Id.fromHash([...])` → `Id.fromSeed(...)`
- `packages/api/typescript/src/billing/usecases/HandleBillingWebhook.ts` — same
- `packages/api/typescript/src/billing/events/BillingWebhookReceivedEvent.ts` — same
- `packages/api/typescript/src/sales/projections/OrderProjection.ts` — migrate to `OrderProjection.deterministicId(p)`
- `packages/api/typescript/src/sales/projections/projectors/OrderProjector.ts` — same
- `packages/api/typescript/src/sales/entities/OrderOverride.ts` — drop `HashedID` import, add static factory
- `packages/api/typescript/src/integration/entities/StoreIntegration.ts` — drop `HashedID` import, add static factory
- `packages/api/typescript/src/integration/entities/MarketingAdAccount.ts` — drop `HashedID` import, add static factory
- `packages/api/typescript/src/identity/objects/HashedIdParity.test.ts` — update for new naming

### Go
- `packages/api/go/core/objects/id.go` — add `IDFromSeed`, delete `HashedID`
- All Go callers (search `HashedID(` under `packages/api/go/`)

## Acceptance criteria

- [ ] `rg "HashedID|Id\.fromHash" packages/api/typescript packages/api/go` returns zero matches.
- [ ] `Id.fromSeed(...)` exists and is the only deterministic-id factory.
- [ ] Per-entity `static deterministicId(...)` exists on `StoreIntegration`, `OrderOverride`, `MarketingAdAccount`, `OrderProjection`, `OrderProjector`.
- [ ] TS ↔ Go parity test passes: identical inputs produce identical UUIDs across languages.
- [ ] `bun tsc` clean.
- [ ] `go vet ./...` clean for `packages/api/go/`.
- [ ] `bun run test` clean.
- [ ] Go test suite clean.

## Out of scope

- The `Platform.ts` cleanup (handled by SPEC-19).
- Entity-id schema fields swapping to `z.instance(Id)` (handled by SPEC-02).
- Random-id generation — `Id.value()` (UUIDv7) is unchanged.
- Data migrations — template repo, no production rows to worry about.

## Notes

- **The TS `Id.fromHash` (SHA-256) and `HashedID` (UUIDv5) produce DIFFERENT bytes for the same input.** Callers migrating from `Id.fromHash` to `Id.fromSeed` will get new ids for the same input strings. In a template repo this is fine (no persisted data). If this spec ever lands on a branch with real data, a migration is required.
- The Go `HashedID` is already UUIDv5 with the same namespace — Go callers see no byte change, just a rename.
- Module-load wiring: the `BK_DASH_NAMESPACE` constant should NOT be exported. If any external consumer needs it (cross-language tests), expose a `parityFingerprint(...)` test helper instead.
