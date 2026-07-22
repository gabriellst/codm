# SPEC-18: Handshake verifies scopes

**Wave:** 4   **Stream:** A (parallel)   **Depends on:** SPEC-19   **Status:** done

## Motivation

Today, the handshake step (`HandshakeService.handshake()`) only verifies that credentials "work at all" against the provider — typically by hitting one read endpoint and confirming a 2xx. It does NOT verify that the OAuth token grants the scopes our app needs.

Result: a Shopify token with zero scopes still passes handshake. Missing scopes only surface later when an actual feature call fails — surprising the merchant and degrading UX.

After SPEC-19 lands, `PLATFORM_REGISTRY` has required `scopes` per platform. Handshake reads them and asserts the granted scope CSV contains all required.

## Scope

### TS side

For each `HandshakeService` implementation (today: `ShopifyHandshaker`; manual platforms don't have handshakes), after the existing connection test passes:

1. Read `platformDescriptor({ type, platform }).scopes` (the required set).
2. Compare against the granted scopes — sourced from the credential vault payload (the `scope` field from `OAuthTokens` persisted at connect time).
3. If any required scope is missing, throw `INTEGRATION_HANDSHAKE_FAILED` (`INSUFFICIENT_SCOPES`) — distinct from connectivity failures so the UI can render a "reconnect with these missing scopes" CTA.

Add a new application error code `INTEGRATION_INSUFFICIENT_SCOPES` (HTTP 403) — mapped per the integration error registry.

Implementation sketch:

```ts
// integration/services/HandshakeService/ShopifyHandshaker.ts (excerpt)
async handshake(input: { credentials: Record<string, string> }): Promise<HandshakeResult> {
  // ... existing GET /shop.json call ...

  const required = platformDescriptor({
    type: this.type,
    platform: this.platform,
  }).scopes
  const granted = (input.credentials.scope ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const missing = required.filter(s => !granted.includes(s))
  if (missing.length > 0) {
    throw new BaseError<IntegrationApplicationErrors>(
      'INTEGRATION_INSUFFICIENT_SCOPES',
      `missing scopes: ${missing.join(', ')}`,
    )
  }

  return { externalId, displayName }
}
```

### Cases to handle
- **Manual platforms** (`authMode === MANUAL`): no `scope` field in credentials. Their `scopes` array in the registry is empty, so the check is vacuous (`[].filter(...).length === 0`). No special-casing.
- **OAuth platform where the registry lists no required scopes** (rare, but possible): same — vacuous, passes through.
- **OAuth platform but the `scope` field is absent from credentials** (provider didn't echo): treat as `INSUFFICIENT_SCOPES` with all required scopes reported as missing. This catches misconfigured providers.

## Affected files

- `packages/api/typescript/src/integration/services/HandshakeService/ShopifyHandshaker.ts` — add scope verification
- `packages/api/typescript/src/integration/services/HandshakeService/*` — any future per-platform handshaker added during this spec also follows the pattern
- `packages/api/typescript/src/integration/errors.ts` (or wherever integration errors are registered) — add `INTEGRATION_INSUFFICIENT_SCOPES` (HTTP 403)
- Frontend i18n: an entry for the new error code (handled by the error-registry skill's translation key flow — note in PR description)

## Acceptance criteria

- [ ] `ShopifyHandshaker` verifies required scopes against granted.
- [ ] `INTEGRATION_INSUFFICIENT_SCOPES` error code registered (status 403).
- [ ] Handshake tests cover: all-scopes-granted (passes), missing-scope (throws), scope-field-absent (throws), manual-platform (passes vacuously).
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean.

## Out of scope

- Re-attempting OAuth with widened scope request — that's a UI flow, not handshake. Surface via error code only.
- Periodic re-handshake / scope drift detection — out of scope; handshake runs at connect and on demand.
- Changing the OAuth code-exchange step — handled by SPEC-21.

## Notes

- The `scope` field is persisted to the credential vault by `ConnectIntegration` (today at `ConnectIntegration.ts:110`). After SPEC-21, the exchanger explicitly returns scope as part of `outputTokens`, but the vault stays in charge of persistence.
- A future iteration could replace the comma-split with a more rigorous parser (some providers use space-separated, e.g. Google). For now, the registry's `scopes` and the wire `scope` field for each platform agree on comma separation — match per-platform if it ever diverges.
