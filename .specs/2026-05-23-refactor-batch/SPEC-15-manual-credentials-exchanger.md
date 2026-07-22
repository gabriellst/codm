# SPEC-15: `ManualCredentialsExchanger` — sibling to `OAuthCodeExchanger`

**Wave:** 4   **Stream:** B   **Depends on:** SPEC-21, SPEC-23   **Status:** done

## Motivation

Today, only OAuth platforms have an exchanger (`OAuthCodeExchanger`). Manual platforms (where the merchant pastes API tokens directly — e.g. WooCommerce consumer key/secret, manual Meta token) are special-cased inside the connect use case with conditional logic.

After SPEC-19, the registry tells us each platform's `authMode` (OAUTH or MANUAL). The clean design: one abstract `CredentialsExchanger` interface; two concrete subclasses per `authMode`:
- `OAuthCodeExchanger` — exchanges OAuth code → tokens (already exists).
- `ManualCredentialsExchanger` — validates merchant-pasted credentials → tokens (new).

Both produce the same normalized result shape (`{ tokens, displayName?, contactEmail? }` per SPEC-21). The connect use case dispatches on `authMode` to pick the right factory; from there, the code path is identical.

## Scope

### New abstract class

```ts
// integration/services/ManualCredentialsExchanger/ManualCredentialsExchanger.ts
import type { PlatformProps } from '@shared/schemas'
import type { OAuthExchangeResult } from '../OAuthCodeExchanger'  // reuse the result type

export abstract class ManualCredentialsExchanger {
  abstract readonly type: PlatformProps['type']
  abstract readonly platform: PlatformProps['platform']

  abstract exchange(input: {
    identifier: string
    credentials: Record<string, string>  // raw fields the merchant pasted
  }): Promise<OAuthExchangeResult>
}
```

### Factory

Mirror the existing `OAuthCodeExchangerFactory` pattern:

```ts
// integration/services/ManualCredentialsExchanger/ManualCredentialsExchangerFactory.ts
export class ManualCredentialsExchangerFactory {
  private readonly byKey = new Map<string, ManualCredentialsExchanger>()
  register(s: ManualCredentialsExchanger): void { /* ... */ }
  get(platform: PlatformProps): ManualCredentialsExchanger { /* ... */ }
}
```

### Per-platform impls

For every platform with `authMode === MANUAL` in `PLATFORM_REGISTRY`:
- Create `<Platform>ManualCredentialsExchanger.ts`
- Validates credentials shape (e.g. for WooCommerce, asserts `siteUrl` is a valid HTTPS URL and `consumerKey`/`consumerSecret` are non-empty)
- Optionally pings the platform once to verify credentials work (this overlaps with handshake — recommended: skip in exchange, let handshake do the connectivity test)
- Returns `OAuthExchangeResult` with tokens being the raw credentials (since "manual" means the merchant's pasted values ARE the tokens), and `displayName` / `contactEmail` if discoverable

WooCommerce example:

```ts
export class WoocommerceManualCredentialsExchanger extends ManualCredentialsExchanger {
  readonly type = StoreIntegrationType.SALES_CHANNEL
  readonly platform = SalesPlatform.WOOCOMMERCE

  async exchange(input): Promise<OAuthExchangeResult> {
    const creds = WoocommerceManualCredentialsSchema.parse(input.credentials)
    return {
      tokens: {
        // Manual creds passthrough — see PLATFORM_REGISTRY[SALES_CHANNEL][WOOCOMMERCE].outputTokens
        siteUrl: creds.siteUrl,
        consumerKey: creds.consumerKey,
        consumerSecret: creds.consumerSecret,
      },
      // displayName/contactEmail unavailable for woo without a profile-ping; omit.
    }
  }
}
```

### Connect use-case dispatch

`ConnectIntegration` reads `platformDescriptor({ type, platform }).authMode` and picks the factory:

```ts
const descriptor = platformDescriptor(platform)
const result = descriptor.authMode === AuthMode.OAUTH
  ? await this.oauthFactory.get(platform).exchange({ code: input.oauthCode!, identifier: input.integrationIdentifier })
  : await this.manualFactory.get(platform).exchange({ credentials: input.credentials!, identifier: input.integrationIdentifier })
```

(`oauthCode!` and `credentials!` non-null assertions are valid because SPEC-22 introduces the fail-fast assertion that whichever input matches the authMode is present.)

### `OAuthTokens` shape generalization

Since the manual exchanger returns a token map with non-OAuth field names (`consumerKey`, `consumerSecret`, etc.), generalize `OAuthTokens` to a `NormalizedTokens` record:

```ts
// in OAuthCodeExchanger.ts (or move to a shared file)
export type NormalizedTokens = Record<string, string>  // keys match outputTokens of the registry entry
```

Drop the strongly-typed `accessToken/refreshToken/expiresIn/scope` typing — the registry's per-platform `outputTokens` declares which keys are present.

(If strong typing per platform is desired later, that's a refactor of the exchanger interface to be generic over the descriptor — out of scope for this spec.)

## Affected files

- `packages/api/typescript/src/integration/services/ManualCredentialsExchanger/ManualCredentialsExchanger.ts` — NEW abstract
- `packages/api/typescript/src/integration/services/ManualCredentialsExchanger/ManualCredentialsExchangerFactory.ts` — NEW factory
- `packages/api/typescript/src/integration/services/ManualCredentialsExchanger/<Platform>ManualCredentialsExchanger.ts` — NEW per-platform impls
- `packages/api/typescript/src/integration/services/ManualCredentialsExchanger/MockManualCredentialsExchanger.ts` — NEW mock for tests
- `packages/api/typescript/src/integration/services/ManualCredentialsExchanger/index.ts` — NEW barrel
- `packages/api/typescript/src/integration/services/OAuthCodeExchanger/OAuthCodeExchanger.ts` — generalize `OAuthTokens` to `NormalizedTokens`
- `packages/api/typescript/src/integration/usecases/ConnectIntegration.ts` — dispatch on authMode
- `packages/api/typescript/src/integration/registry.ts` — register Manual factory + per-platform impls
- `packages/api/typescript/src/integration/index.ts` (BC bootstrap) — same

## Acceptance criteria

- [ ] `ManualCredentialsExchanger` abstract exists; at least one per-platform impl (WooCommerce) lands.
- [ ] `ManualCredentialsExchangerFactory` registered in integration BC.
- [ ] `ConnectIntegration` dispatches via `authMode` — no inline ternaries based on `oauthCode !== undefined`.
- [ ] `NormalizedTokens` generalized — both exchangers return the same shape.
- [ ] Tests cover both OAuth and Manual paths through `ConnectIntegration`.
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean.

## Out of scope

- Fail-fast assertions inside `ConnectIntegration` — SPEC-22.
- Per-platform Manual impls beyond WooCommerce (other platforms can be added later as features need them; verify each `MANUAL`-mode platform in the registry has a stub at minimum, throwing `PLATFORM_NOT_SUPPORTED` until implemented).
- Frontend manual-credentials form — depends on the registry exposure controller from SPEC-19; form rendering is a separate frontend task.

## Notes

- The shared `OAuthExchangeResult` type is intentionally reused as `ManualCredentialsExchanger`'s return type — both produce normalized tokens + optional metadata. Naming may eventually shift to a neutral `ExchangeResult` if `OAuth` in the name feels off; defer the rename.
- For manual platforms where the merchant won't have a `displayName` from any API: leave undefined. Connect's fallback (`${platform.toLowerCase()}:${integrationIdentifier}`) covers it.
- Per the platform descriptor's `inputTokens`, the manual exchanger's input `credentials` map must contain every key in `inputTokens`. SPEC-22 enforces this with a fail-fast assertion at the use-case entry.
