# Decentralized platform connections + `ConnectionMode` re-model

> Status: planned (not started) · Date: 2026-05-25 · BC: `integration`
> Supersedes the central `integration/schemas/platform.ts` design.

## 1. Motivation

Today every platform's connect schema lives in one central file (`src/integration/schemas/platform.ts`): the descriptor leaves, the registry union, the connect-input union, and `PlatformProps`. We want to:

1. **Decentralize** — each platform owns its connect *description* + its service impls, co-located in a per-platform folder, so adding/porting a platform is a single self-contained folder.
2. **Align the catalog to bk-dash** — the connect catalog (the merchant's "Conectar" grid) should be the real bk-dash set across 5 categories, not the current speculative mix.
3. **Re-model the connection concept** — the UI distinguishes *Automática* (we have an API integration) from *Manual* (no API, the merchant hand-maps fields). Today's `AuthMode.MANUAL` confusingly means "paste API credentials" (which is still API-backed). We disambiguate with a new three-value `ConnectionMode`.

## 2. Decisions (with rationale)

These were settled in a design interview; recorded here so the "why" survives.

- **D1 — Per-platform `Description` files.** Each platform declares a `<Platform>Description.ts` `z.object` leaf (the connect definition), co-located with its service impls. *Alternatives considered:* central file (status quo — the thing we're leaving); each service declares its own I/O (rejected — `connectionModes`/category/platform aren't a single service's concern).
- **D2 — Per-platform impl folders.** `services/<platform>/` holds the Description + that platform's exchanger/handshaker. The **type folders** (`OAuthCodeExchanger/`, `CredentialsExchanger/`, `HandshakeService/`) keep only the *framework*: abstract base + mock + factory. *Alternative:* a `descriptors/` folder (rejected — re-centralizes).
- **D3 — `services/index.ts` is a pure schema aggregator.** It imports every `<platform>/<Platform>Description`, builds `PlatformRegistrySchema` (nested discriminated union) + `PlatformConnectInputSchema`, and hosts `PlatformSchema`/`PlatformProps`. **It must not re-export services/factories** — otherwise `base ← impl ← factory ← index ← base` becomes a cycle.
- **D4 — `PlatformProps`/`PlatformSchema` live in the aggregator.** *Accepted trade-off:* the entity + repos import the aggregator (loading them eagerly builds the registry). Not a cycle (Descriptions are pure leaves: only `z` + wire enums). *Guardrail:* abstract base classes type their `type`/`platform` fields with the **wire enums directly** (not `PlatformProps`) so the bases don't import the aggregator. *Alternative:* a standalone leaf coordinate module (avoids the coupling — revisit if the coupling bites).
- **D5 — "Coming-soon" descriptions are in the registry.** A Description in a folder ⇒ it appears in the catalog. If it has no exchanger, connect throws `PLATFORM_NOT_SUPPORTED`. An `active` flag lets the UI render "Em breve" + disable Connect.
- **D6 — `ConnectionMode { OAUTH, CREDENTIALS, MANUAL }`** replaces `AuthMode`:
  - `OAUTH` — API-backed, token via OAuth flow.
  - `CREDENTIALS` — API-backed, merchant pastes an API key/token we call with. *(= today's `AuthMode.MANUAL`, renamed.)*
  - `MANUAL` — **no API**; merchant hand-maps fields.
  - Badge: *Automática* = supports `OAUTH`|`CREDENTIALS`; *Manual* = supports `MANUAL`. A Description declares `connectionModes: ConnectionMode[]`.
  - `ManualCredentialsExchanger` → **`CredentialsExchanger`**. `Descriptor` → **`Description`** everywhere.
- **D7 — Real exchangers only for the 5 OAuth platforms:** Shopify, NuvemShop, Facebook, Google, Tiktok. Everyone else ships a Description with no real field-filling / no exchanger.

## 3. Target catalog (from the connect-grid screenshot)

| Category (`StoreIntegrationType`) | Platform | `connectionModes` | active | Real exchanger now? |
|---|---|---|---|---|
| **SALES_CHANNEL** (Loja Virtual) | Shopify | `[OAUTH]` | ✅ | ✅ OAuth (exists) |
| | NuvemShop | `[OAUTH]` | ✅ | ✅ OAuth (build) |
| **PAYMENT_GATEWAY** (Gateway) | Shopify (Payments) | `[CREDENTIALS, MANUAL]` | ✅ | — desc only |
| | MercadoPago | `[MANUAL]` | ✅ | — desc only |
| | Appmax | `[MANUAL]` | ✅ | — desc only |
| | Stripe | `[MANUAL]` | ✅ | — desc only |
| | Paypal | `[MANUAL]` | ✅ | — desc only |
| | Yever | `[MANUAL]` | ✅ | — desc only |
| **CHECKOUT** | Yampi | `[CREDENTIALS, MANUAL]` | ✅ | — desc only |
| | Cartpanda | `[MANUAL]` | ✅ | — desc only |
| | Adoorei | `[MANUAL]` | ✅ | — desc only |
| | Yever | `[MANUAL]` | ✅ | — desc only |
| | Zedy | `[MANUAL]` | ✅ | — desc only |
| **MARKETING_PLATFORM** (Marketing) | Facebook (META) | `[OAUTH, MANUAL]` | ✅ | ✅ OAuth (build) |
| | Google Ads | `[OAUTH, MANUAL]` | ✅ | ✅ OAuth (build) |
| | Tiktok | `[OAUTH, MANUAL]` | ✅ | ✅ OAuth (build) |
| | Taboola | `[MANUAL]` | ❌ Em breve | — desc only |
| **INFOPRODUCT** (new) | Kiwify | `[CREDENTIALS]` | ❌ Em breve | — desc only |
| | Hotmart | `[CREDENTIALS]` | ❌ Em breve | — desc only |

Notes: Shopify + Yever appear in two categories (separate Description leaves). For the OAuth-real platforms only the `OAUTH` leaf is functional; their `MANUAL` leaf is a coming-soon field-mapping stub. Credential fields for non-OAuth platforms are placeholders until each is ported.

## 4. Target contracts enums (`packages/contracts/wire/enums/*.tsp`)

- `auth-mode.tsp` → **rename to `connection-mode.tsp`**: `ConnectionMode { OAUTH, CREDENTIALS, MANUAL }`.
- `store-integration-type.tsp`: add `INFOPRODUCT`.
- `sales-platform.tsp`: `{ SHOPIFY, NUVEM_SHOP }` — **drop CART_PANDA, YAMPI, KIWIFY**.
- `checkout-platform.tsp`: `{ CART_PANDA, YAMPI, ADOOREI, YEVER, ZEDY }`.
- `payment-gateway-platform.tsp`: `{ SHOPIFY, MERCADO_PAGO, APPMAX, STRIPE, PAYPAL, YEVER }`.
- `marketing-platform.tsp`: `{ META, GOOGLE_ADS, TIKTOK, TABOOLA }`.
- new `infoproduct-platform.tsp`: `InfoproductPlatform { KIWIFY, HOTMART }`.

## 5. Phased implementation

### Phase 1a — Rename `AuthMode` → `ConnectionMode` (isolated, low risk)
1. `auth-mode.tsp` → `connection-mode.tsp`: `ConnectionMode { OAUTH, CREDENTIALS, MANUAL }` (OAUTH unchanged; today's `MANUAL` → `CREDENTIALS`; new `MANUAL` = field-mapping, unused until Phase 4).
2. `bun emit-openapi && bun sdk`.
3. Fix every `AuthMode` reference → `ConnectionMode`, and `AuthMode.MANUAL` → `ConnectionMode.CREDENTIALS` (the existing paste-credentials path). Rename `ManualCredentialsExchanger` → `CredentialsExchanger` (class + mock + factory + folder). The descriptor discriminant `authMode` → `connectionMode`.
4. Gate: `bun tsc` + `bun run test`.

### Phase 1b — Platform enum re-bucket (high ripple — only after 1a is green)
1. Edit the platform `.tsp` enums per §4: `SalesPlatform → { SHOPIFY, NUVEM_SHOP }`; `CheckoutPlatform += ADOOREI, YEVER, ZEDY`; `PaymentGatewayPlatform → { SHOPIFY, MERCADO_PAGO, APPMAX, STRIPE, PAYPAL, YEVER }`; `MarketingPlatform += TABOOLA`; `StoreIntegrationType += INFOPRODUCT`; new `infoproduct-platform.tsp`.
2. **Audit + migrate** every reference to the dropped `SalesPlatform` members (CART_PANDA/YAMPI/KIWIFY as a *sales* platform) across BCs + wire events (`order-updated`, `ad-spend-recorded`, …) — this is the blast radius.
3. `bun emit-openapi && bun sdk`.
4. Gate: `bun tsc` + `bun run test`.

### Phase 2 — Structure + renames (existing platforms)
1. Create `services/<platform>/` folders; move `ShopifyOAuthCodeExchanger` + `ShopifyHandshaker` → `services/shopify/`; move the (renamed) Shopify Description there.
2. `Descriptor → Description`; `ManualCredentialsExchanger → CredentialsExchanger` (class + mock + factory + folder).
3. Create `services/index.ts` aggregator (Descriptions → `PlatformRegistrySchema` + `PlatformConnectInputSchema`); move `PlatformSchema`/`PlatformProps` there; abstract bases switch to wire-enum field types.
4. CartPanda becomes a CHECKOUT + `MANUAL` (description-only) — **remove** `CartPandaSalesCredentialsExchanger`.
5. Update consumers (`ConnectIntegration`, `GetPlatformDescriptionsController`, entity, repos, registry).
6. Gate: `bun tsc` + `bun test src/integration`.

### Phase 3 — Catalog of Descriptions
1. Add a `<platform>/<Platform>Description.ts` for every catalog platform in §3 (with `connectionModes`, `active`, category, credential fields where known; placeholders otherwise).
2. Build the OAuth exchangers for **NuvemShop, Facebook, Google, Tiktok** (Shopify exists). Description-only for the rest.
3. Add `active`/coming-soon to the Description schema; `GetPlatformDescriptionsController` already emits the registry.
4. Gate: `bun tsc` + tests + verify `GET /integrations/platforms` JSON Schema.

### Phase 4 — Three-way connect flow
1. `PlatformConnectInputSchema` discriminates `connectionMode (OAUTH|CREDENTIALS|MANUAL) → type → platform`; dual-mode platforms emit a leaf per supported mode.
2. `ConnectIntegration` dispatches: `OAUTH` → oauth exchanger + handshake; `CREDENTIALS` → credentials exchanger + handshake; `MANUAL` → field-mapping (no exchanger — stub).
3. Gate: `bun tsc` + `bun run test`.

## 6. Deferred / open
- The `MANUAL` field-mapping connect path: what fields it collects + how mapping is persisted (no API). Stubbed in Phase 4.
- `CREDENTIALS` exchangers for gateways/checkouts (Yampi, Shopify-Payments, …) — descriptions only for now.
- Exact credential fields for non-OAuth platforms — placeholders until ported.

## 7. Risks
- **Cross-language SDK** regen (Go + Rust) on every enum change — `bun sdk` must stay green.
- **`SalesPlatform` trim** is the biggest blast radius: anything treating CART_PANDA/YAMPI/KIWIFY as a sales platform (order events, projections, repos) must be migrated. Audit before deleting the members.
- **Aggregator coupling** (D4): keep `services/index.ts` a pure schema aggregator; if coupling bites, fall back to a leaf coordinate module for `PlatformProps`.

## 8. Status — implemented 2026-05-25

All phases implemented. `ConnectIntegration` deviations from the plan, for the record:
- `services/index.ts` IS the aggregator and hosts `PlatformProps`/`PlatformSchema` (D4); consumers import `@integration/services` (old `@integration/schemas` deleted).
- **Per-mode Descriptions (refines D6).** Instead of one Description carrying a `connectionModes: ConnectionMode[]` array, each platform exports **one `z.object` leaf per `(platform × mode)`** — e.g. `ShopifyOAuthDescriptionSchema` + `ShopifyCredentialsDescriptionSchema`. Each leaf is flat: `connectionMode: z.literal(MODE)`, `type: z.literal(CATEGORY)`, `platform: z.literal(MEMBER)`, `active`, `scopes` (tuple of literals), **mode-specific `inputTokens`** (`z.object`), `outputTokens`. This is what lets the input shape differ by mode (Shopify OAUTH wants `{shopDomain}`; Shopify CREDENTIALS wants `{storeDomain, clientId, clientSecret}`).
- `PlatformRegistrySchema` is a **three-level nested discriminated union**: `connectionMode → type → platform` (every discriminant is unique within its branch). Connect union (`PlatformConnectInputSchema`) derives one leaf per `(mode, type, platform)` via `oauthLeaf`/`credentialsLeaf`/`manualLeaf` helpers — each adds `storeId`+`userId`, sets `credentials = leaf.inputTokens`, and OAUTH adds `oauthCode`.
- Real OAuth exchangers: Shopify, NuvemShop, Meta, GoogleAds, Tiktok. All other catalog platforms are description-only (connect → `PLATFORM_NOT_SUPPORTED`). The 3-way `ConnectIntegration` dispatch is effectively binary today (`OAUTH` vs else→`CredentialsExchanger`) since no `CREDENTIALS`/`MANUAL` platform has a real exchanger yet — the field-mapping path stays a deferred stub.
- Multi-category platforms split into separate Descriptions: `ShopifyDescription` (sales) + `ShopifyPaymentsDescription` (gateway); `YeverGatewayDescription` + `YeverCheckoutDescription`.

**Gate:** `api-typescript` tsc clean (only 2 pre-existing EXTERNAL errors remain — `client/.../executeSync.ts` + `marketing/ReconcileMarketingAccounts.ts` `GoClient.marketingReconcile`, both from the parallel go-sync restructure, NOT this work); `bun test src/integration` 158 pass / 0 fail.

**Deferred / blocked:** the api `openapi.json` + full client SDK regen is blocked by the external go-sync `/sync/sync/jobs/{id}` route bug (`bun sdk` Go-client gen panics) — unblock once that lands. `inputTokens`/`outputTokens` for description-only platforms are placeholders.
