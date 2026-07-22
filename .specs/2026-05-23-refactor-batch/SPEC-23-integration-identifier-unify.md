# SPEC-23: Unify on single `integrationIdentifier`

**Wave:** 4   **Stream:** B   **Depends on:** SPEC-19   **Status:** done

## Motivation

`ConnectIntegration` currently has:

```ts
const externalIdSeed = sealedPayload.shopDomain
  ?? sealedPayload.shopIdentifier
  ?? input.platform
```

The triple `??` is defensive code papering over inconsistent field naming across platforms. Different platforms call their identifier different things (`shopDomain` for Shopify, `siteUrl` for Woo, `businessAccountId` for Meta), but the use case treats them all the same downstream — derive the deterministic id from this identifier.

Unify on a single field name `integrationIdentifier` in the use case's input. Each per-platform exchanger / form maps the merchant-facing field name to `integrationIdentifier` at the controller boundary.

## Scope

### Input shape

`ConnectIntegration.InputSchema` becomes:

```ts
export const ConnectIntegrationInputSchema = z.object({
  type: z.enum(StoreIntegrationType),
  platform: z.string(),                       // narrowed via PlatformSchema.parse downstream
  integrationIdentifier: z.string().min(1),    // canonical identifier — interpreted per platform
  credentials: z.record(z.string(), z.string()).optional(),  // manual fields, if authMode=MANUAL
  oauthCode: z.string().optional(),             // OAuth code, if authMode=OAUTH
})
```

### Exchanger input shape

Both `OAuthCodeExchanger.exchange(...)` and `ManualCredentialsExchanger.exchange(...)` (SPEC-15) take `integrationIdentifier` as input. Each per-platform implementation interprets it:
- `ShopifyOAuthCodeExchanger`: treats `integrationIdentifier` as the shop domain (`foo.myshopify.com`).
- `WoocommerceManualCredentialsExchanger`: treats it as the site URL.
- `MetaOAuthCodeExchanger`: treats it as the business account id.

The platform descriptor (`PLATFORM_REGISTRY[type][platform].inputTokens[0]`) names which user-facing input field IS the canonical identifier. Frontend forms read this to label the field.

### Controller-side mapping

The connect controller receives the merchant's form input (which uses platform-natural field names like `shopDomain`). It maps the first `inputTokens[0]` field's value to `integrationIdentifier` before invoking the use case:

```ts
const descriptor = platformDescriptor({ type, platform })
const identifierField = descriptor.inputTokens[0]   // e.g. 'shopDomain'
const integrationIdentifier = body.credentials[identifierField]
```

(The frontend can also do this mapping; either side works as long as the use case input is canonical.)

## Affected files

- `packages/api/typescript/src/integration/usecases/ConnectIntegration.ts` — input schema, drop `??` chain, use `input.integrationIdentifier` directly
- `packages/api/typescript/src/integration/controllers/ConnectIntegrationController.ts` — map merchant-facing fields → `integrationIdentifier`
- `packages/api/typescript/src/integration/services/OAuthCodeExchanger/OAuthCodeExchanger.ts` — abstract signature uses `identifier: string`
- `packages/api/typescript/src/integration/services/OAuthCodeExchanger/ShopifyOAuthCodeExchanger.ts` — accept identifier as shop domain
- `packages/api/typescript/src/integration/services/OAuthCodeExchanger/MockOAuthCodeExchanger.ts` — same
- Tests of ConnectIntegration and exchangers

## Acceptance criteria

- [ ] `ConnectIntegration` input has `integrationIdentifier: string` (no `??` chain anywhere).
- [ ] Both exchanger interfaces take `identifier: string`.
- [ ] Controller maps merchant-facing field → `integrationIdentifier` via `descriptor.inputTokens[0]`.
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean.

## Out of scope

- Form-rendering on the frontend — depends on the descriptor exposure controller from SPEC-19; not changed here.
- `ManualCredentialsExchanger` introduction — SPEC-15 (this spec just defines the shared param name).

## Notes

- The deterministic id derivation (post SPEC-20) becomes:
  ```ts
  const id = StoreIntegration.deterministicId({ type, platform }, input.integrationIdentifier)
  ```
  — no `??` chain.
- For platforms where the identifier doubles as part of the URL (e.g. Shopify's `foo.myshopify.com` is both identifier AND the admin API host), the exchanger's per-platform code does that mapping internally.
