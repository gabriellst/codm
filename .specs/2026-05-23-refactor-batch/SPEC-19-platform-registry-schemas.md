# SPEC-19: Platform registry under `core/src/schemas/`

**Wave:** 3   **Stream:** B   **Depends on:** Wave 2 complete   **Status:** done

## Motivation

The `(StoreIntegrationType → allowed platforms)` discriminated union currently lives at `packages/api/typescript/src/integration/objects/Platform.ts`. It encodes more than validation:
- Which platforms exist per integration type
- (Implicit, via `platformHashSeed`) — the deterministic-id seed format

For the upcoming Wave 4 connect-flow rework (SPEC-15, SPEC-18, SPEC-21, SPEC-22, SPEC-23), we also need to encode per-platform metadata:
- `authMode` — OAuth vs manual credential capture
- `scopes` — required OAuth scopes for handshake verification
- `inputTokens` — fields the merchant provides at connect time
- `outputTokens` — fields persisted to the credential vault after exchange

Move all of this into a single shared registry under `core/src/schemas/platform.ts`, expressed entirely as Zod schemas so it's runtime-validated AND consumable as controller output types (frontend gets the typing via the SDK).

## Scope

### Contracts side

Add new wire enum `AuthMode`:

```typespec
// packages/contracts/wire/enums/auth-mode.tsp
@doc("How a platform's credentials are captured during connect — OAuth code-exchange or merchant-pasted manual tokens.")
enum AuthMode {
  OAUTH: "OAUTH",
  MANUAL: "MANUAL",
}
```

Regenerate contracts: `bun emit-openapi && bun sdk`.

### TS side

**Create `packages/api/typescript/core/src/schemas/platform.ts`** with:

```typescript
import { z } from '../utils/schema'
import {
  AuthMode,
  StoreIntegrationType,
  SalesPlatform, CheckoutPlatform, PaymentGatewayPlatform, MarketingPlatform,
} from '@template/contracts-typescript/wire/enums'

// Base descriptor — runtime validator.
export const PlatformDescriptorSchema = z.object({
  authMode: z.enum(AuthMode),
  scopes: z.array(z.string()),
  inputTokens: z.array(z.string()),
  outputTokens: z.array(z.string()),
})
export type PlatformDescriptor = z.infer<typeof PlatformDescriptorSchema>

// Per-platform schemas — narrow `authMode` via z.literal so controller
// outputs returning a single platform's descriptor carry the precise type
// to the SDK and on to the frontend.
export const ShopifyDescriptorSchema = z.object({
  authMode: z.literal(AuthMode.OAUTH),
  scopes: z.array(z.string()),
  inputTokens: z.array(z.string()),
  outputTokens: z.array(z.string()),
})

export const WoocommerceDescriptorSchema = z.object({
  authMode: z.literal(AuthMode.MANUAL),
  scopes: z.array(z.string()),
  inputTokens: z.array(z.string()),
  outputTokens: z.array(z.string()),
})

// ... one schema per (type, platform). 12–20 schemas total. Each one named
// `<Platform>DescriptorSchema`.

// Registry schema — nested z.object keyed by enum values.
export const PlatformRegistrySchema = z.object({
  [StoreIntegrationType.SALES_CHANNEL]: z.object({
    [SalesPlatform.SHOPIFY]: ShopifyDescriptorSchema,
    [SalesPlatform.WOOCOMMERCE]: WoocommerceDescriptorSchema,
    // ...
  }),
  [StoreIntegrationType.CHECKOUT]: z.object({ /* ... */ }),
  [StoreIntegrationType.PAYMENT_GATEWAY]: z.object({ /* ... */ }),
  [StoreIntegrationType.MARKETING_PLATFORM]: z.object({
    [MarketingPlatform.META]: MetaDescriptorSchema,
    // ...
  }),
})
export type PlatformRegistry = z.infer<typeof PlatformRegistrySchema>

// The data — parsed at module load so config drift fails fast on startup.
export const PLATFORM_REGISTRY: PlatformRegistry = PlatformRegistrySchema.parse({
  [StoreIntegrationType.SALES_CHANNEL]: {
    [SalesPlatform.SHOPIFY]: {
      authMode: AuthMode.OAUTH,
      scopes: ['read_products', 'read_orders', 'read_customers'],
      inputTokens: ['shopDomain'],
      outputTokens: ['accessToken', 'scope'],
    },
    [SalesPlatform.WOOCOMMERCE]: {
      authMode: AuthMode.MANUAL,
      scopes: [],
      inputTokens: ['siteUrl', 'consumerKey', 'consumerSecret'],
      outputTokens: ['siteUrl', 'consumerKey', 'consumerSecret'],
    },
  },
  // ...
})

// Discriminated-union validator for runtime `(type, platform)` checks.
export const PlatformSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal(StoreIntegrationType.SALES_CHANNEL),       platform: z.enum(SalesPlatform) }),
  z.object({ type: z.literal(StoreIntegrationType.CHECKOUT),            platform: z.enum(CheckoutPlatform) }),
  z.object({ type: z.literal(StoreIntegrationType.PAYMENT_GATEWAY),     platform: z.enum(PaymentGatewayPlatform) }),
  z.object({ type: z.literal(StoreIntegrationType.MARKETING_PLATFORM),  platform: z.enum(MarketingPlatform) }),
])
export type PlatformProps = z.infer<typeof PlatformSchema>

export function platformDescriptor(p: PlatformProps): PlatformDescriptor {
  return PLATFORM_REGISTRY[p.type][p.platform]
}
```

Export `schemas` as a subpath from `@template/core-typescript`:
- Update `packages/api/typescript/core/package.json` exports map to include `"./schemas": "./src/schemas/index.ts"`.
- Create `packages/api/typescript/core/src/schemas/index.ts` re-exporting from `platform.ts`.

**Delete `packages/api/typescript/src/integration/objects/Platform.ts`** (replaced by core/schemas/platform).
- Drop the `Platform.ts` re-export from `integration/objects/index.ts`.
- Replace every `import { PlatformSchema, type PlatformProps, platformHashSeed } from '../objects/Platform'` with `import { PlatformSchema, type PlatformProps } from '@shared/schemas'`.
- `platformHashSeed()` callers were already handled by SPEC-20's per-entity static factories — verify zero remaining `platformHashSeed` imports.

### Per-platform values to populate

The exact platforms + scopes + input/output token lists per platform are domain knowledge. Initial values:

| Type | Platform | authMode | scopes | inputTokens | outputTokens |
|---|---|---|---|---|---|
| SALES_CHANNEL | SHOPIFY | OAUTH | `read_products`, `read_orders`, `read_customers` | `shopDomain` | `accessToken`, `scope` |
| SALES_CHANNEL | WOOCOMMERCE | MANUAL | — | `siteUrl`, `consumerKey`, `consumerSecret` | `siteUrl`, `consumerKey`, `consumerSecret` |
| MARKETING_PLATFORM | META | OAUTH | `ads_read`, `business_management` | `businessAccountId` | `accessToken`, `refreshToken`, `scope` |
| MARKETING_PLATFORM | GOOGLE | OAUTH | `https://www.googleapis.com/auth/adwords` | `customerId` | `accessToken`, `refreshToken`, `scope` |
| PAYMENT_GATEWAY | STRIPE | OAUTH | `read_write` | `accountId` | `accessToken`, `refreshToken` |
| CHECKOUT | … | … | … | … | … |

Fill in the rest from existing wire-enum members. For any platform without a defined behavior yet, use `authMode: MANUAL` and empty `scopes`, and surface in the PR description.

### Frontend exposure (within this spec)

Add a controller endpoint that returns the (frontend-relevant slice of the) registry:

- `packages/api/typescript/src/integration/controllers/GetPlatformDescriptorsController.ts` — `GET /integrations/platforms`
- Output schema = `PlatformRegistrySchema` (or a frontend-curated subset that omits internal-only fields if any are added later).
- Regenerate SDK after: `bun emit-openapi && bun sdk`.

Frontend (when wiring up Connect UI later) reads this to render manual-credential forms dynamically per platform.

## Affected files

### TS
- `packages/api/typescript/core/src/schemas/platform.ts` — NEW
- `packages/api/typescript/core/src/schemas/index.ts` — NEW
- `packages/api/typescript/core/package.json` — exports map
- `packages/api/typescript/src/integration/objects/Platform.ts` — DELETE
- `packages/api/typescript/src/integration/objects/index.ts` — drop Platform export
- All callers of `Platform.ts` (search: `'../objects/Platform'`, `'./objects/Platform'`)
- `packages/api/typescript/src/integration/controllers/GetPlatformDescriptorsController.ts` — NEW

### Contracts
- `packages/contracts/wire/enums/auth-mode.tsp` — NEW
- `packages/contracts/wire/main.tsp` — import auth-mode (if explicit imports are used)

### Generated (do not edit by hand)
- `packages/contracts/generated/typescript/src/wire/enums/auth-mode.ts` — created by `bun emit-openapi`
- `packages/contracts/generated/go/wire/enums/auth_mode.go` — same
- `packages/client/dist/typescript/src/typescript/` — updated by `bun sdk`

## Acceptance criteria

- [ ] `core/src/schemas/platform.ts` exists with full registry, all platforms populated.
- [ ] `AuthMode` enum exists in contracts and is generated for both TS and Go.
- [ ] `integration/objects/Platform.ts` deleted; zero remaining imports.
- [ ] Zero remaining `platformHashSeed` imports anywhere.
- [ ] `GET /integrations/platforms` returns the registry; SDK regenerated with the new operation.
- [ ] `PLATFORM_REGISTRY` parses at module load (failure here = spec broken).
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean.

## Out of scope

- Wave 4 connect-flow refactor — reads from this registry but doesn't change it.
- Go-side consumption of the registry — Go's sync pipelines are statically typed per-platform; no runtime descriptor lookup needed.
- Removing platforms from the wire enums — only the registry is touched.

## Notes

- The registry's per-platform schema duplication (12–20 schemas with mostly-identical shapes but different `z.literal` for `authMode`) is intentional — it gives the SDK precise per-platform types when a controller returns a single descriptor.
- For the `inputTokens` / `outputTokens` arrays: the strings are field names, not enum values. They drive UI form rendering and credential-vault payload shape, not validation directly.
- The `scopes` array is platform-specific OAuth scope strings (e.g. Shopify uses `read_products`, Google uses fully qualified URLs). No common type.
- SPEC-18 reads `platformDescriptor(p).scopes` to verify handshake.
- SPEC-15 reads `platformDescriptor(p).authMode` to dispatch to OAuth vs Manual exchanger.
- SPEC-22 reads `platformDescriptor(p).inputTokens` to assert all expected fields are present.
- SPEC-23 uses the FIRST entry of `inputTokens[]` as the canonical `integrationIdentifier`.
