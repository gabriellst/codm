# SPEC-21: OAuth exchanger returns `displayName` + `contactEmail`

**Wave:** 4   **Stream:** B   **Depends on:** SPEC-19   **Status:** done

## Motivation

Today, the connect flow looks up displayName / contactEmail in TWO different places:
- `OAuthCodeExchanger.exchange()` — returns tokens only
- `HandshakeService.handshake()` — returns `displayName` derived from the provider's "shop info" / "account info" API call

This forces the connect use case to call handshake to get a label, even when the merchant just exchanged the OAuth code. Two round trips when one would do.

Move displayName + contactEmail to the exchanger — it's already calling the provider's token endpoint and often gets these fields for free in the same response (Shopify includes shop info in the OAuth callback; Meta includes ad account info; etc.). Handshake stays focused on "is the connection alive + scoped correctly."

## Scope

### Update `OAuthCodeExchanger` return shape

```ts
// integration/services/OAuthCodeExchanger/OAuthCodeExchanger.ts
export interface OAuthExchangeResult {
  tokens: OAuthTokens
  /** Human-readable account label, if the provider supplies it in the token-exchange response. */
  displayName?: string
  /** Merchant contact email, if the provider supplies it. */
  contactEmail?: string
}

export abstract class OAuthCodeExchanger {
  abstract exchange(input: { code: string; identifier: string }): Promise<OAuthExchangeResult>
}
```

(`identifier` here is the unified `integrationIdentifier` per SPEC-23 — sequence: SPEC-23 lands first, then this.)

### Per-platform impl changes

- `ShopifyOAuthCodeExchanger.exchange()`: after the token call, hit `/admin/api/2024-04/shop.json` once to retrieve `shop.name` (displayName) and `shop.email` (contactEmail). Return both alongside tokens.
- Other OAuth platforms (Meta, Google, Stripe): populate `displayName` / `contactEmail` from whatever the platform's OAuth response or immediate-after-OAuth profile endpoint provides. If a platform doesn't expose these, leave undefined — the connect use case falls back to a generated label like `<platform>-<external-id>`.

### Connect use case adjustments

- `ConnectIntegration` no longer derives displayName from handshake. It uses `exchangeResult.displayName ?? <fallback>`.
- The handshake step (SPEC-18 territory) returns only `{ externalId }` — no displayName needed in its result.

### `HandshakeResult` simplified

```ts
export interface HandshakeResult {
  externalId: string
  // displayName: REMOVED — moved to OAuthExchangeResult.
  // discoveredAdAccountExternalIds stays for marketing platforms.
  discoveredAdAccountExternalIds?: string[]
}
```

## Affected files

- `packages/api/typescript/src/integration/services/OAuthCodeExchanger/OAuthCodeExchanger.ts` — return type
- `packages/api/typescript/src/integration/services/OAuthCodeExchanger/ShopifyOAuthCodeExchanger.ts` — add shop-info call
- `packages/api/typescript/src/integration/services/OAuthCodeExchanger/MockOAuthCodeExchanger.ts` — return displayName/contactEmail in mock
- `packages/api/typescript/src/integration/services/HandshakeService/HandshakeService.ts` — drop displayName from HandshakeResult
- `packages/api/typescript/src/integration/services/HandshakeService/ShopifyHandshaker.ts` — stop returning displayName
- `packages/api/typescript/src/integration/usecases/ConnectIntegration.ts` — consume new shape, drop handshake-derived label
- Tests across the above paths

## Acceptance criteria

- [ ] `OAuthCodeExchanger.exchange()` returns `OAuthExchangeResult` (tokens + optional displayName + contactEmail).
- [ ] `ShopifyOAuthCodeExchanger` populates both fields from shop.json.
- [ ] `HandshakeResult` no longer carries displayName.
- [ ] `ConnectIntegration` derives label from exchange result (with safe fallback).
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean.

## Out of scope

- `ManualCredentialsExchanger` — SPEC-15 introduces it with the same return shape (`{ tokens, displayName?, contactEmail? }`); this spec only changes the OAuth exchanger.
- Updating `HandshakeService` for the scope-verification change — handled by SPEC-18.
- Frontend "Connect successful — connected as <displayName>" UI strings — out of scope.

## Notes

- The shop-info call adds one HTTP hop to Shopify connect. Acceptable cost — it ran during handshake anyway; we're moving when it runs, not adding it.
- The fallback label inside `ConnectIntegration` is something simple: `${platform.toLowerCase()}:${externalId}`. The merchant can rename later.
