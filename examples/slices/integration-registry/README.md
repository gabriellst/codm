# Integration Registry — Tier-3 exemplar (template polyglot)

> **Not live code.** Every `.ts` here is copied from
> `template@feat/template-polyglot` (tip `ccdd8c531`, 2026-07-01) — purged product
> vocabulary renamed to neutral identifiers (product-residue rail), otherwise
> verbatim — and carries a
> `// CONTEXT-ORIGIN:` header naming its origin file. It is **not part of the
> workspace build** (no `package.json`, not referenced by any `tsconfig`, not an
> Nx project), so the `@template/*` imports intentionally do not resolve. Read it
> as a reference for the pattern, not as something to compile.

This is the **integration-descriptor registry** pattern: how the `integration`
bounded context models "a store connects platform X in mode Y" as a single,
statically-typed, fully-derived contract — instead of a loose `Record<string,
any>` of provider configs.

The pattern has three tiers. **Tier (a)** — the closed enums (`ConnectionMode`,
`StoreIntegrationType`, `SalesPlatform`, `CheckoutPlatform`, `PaymentGateway`,
`MarketingPlatform`, `InfoproductPlatform`) — lives in `packages/contracts`
(TypeSpec) and is not reproduced here. This exemplar captures **tier (b)** (the
descriptor registry) and **tier (c)** (the behavior factories).

---

## Tier (b) — the platform-descriptor registry

### `registry.ts` (origin: `src/integration/services/index.ts`)

The heart of the pattern. Three things live here, each built on the leaves:

1. **`PlatformRegistrySchema`** — a **triple-nested discriminated union**
   keyed `connectionMode → type → platform`. Every leaf's three discriminator
   literals are unique within its branch, so `z.discriminatedUnion` at each
   level narrows cleanly:

   ```
   connectionMode ∈ { OAUTH, CREDENTIALS, MANUAL }
     └─ type ∈ { SALES_CHANNEL, CHECKOUT, PAYMENT_GATEWAY, MARKETING_PLATFORM, INFOPRODUCT }
          └─ platform ∈ (the enum for that type)
   ```

   This union *is* the SDK/OpenAPI type the frontend renders connect forms off
   (see `ListPlatformDescriptors`).

2. **`PlatformSchema` / `PlatformProps`** — the runtime `(type, platform)`
   coordinate, a `z.discriminatedUnion('type', …)` where each branch pins the
   platform enum for that type. This is the key the **tier-(c)** factories
   resolve behavior by, and what the entity stores.

3. **The derived connect contract** — `oauthLeaf` / `credentialsLeaf` /
   `manualLeaf` are generic helpers that read a leaf's `.shape.inputTokens` and
   re-shape it into a connect-body leaf (`credentials` = the leaf's input
   tokens; OAUTH additionally carries `oauthCode`). `PlatformConnectBodySchema`
   (full union) and `PlatformConnectNonOAuthBodySchema` (HTTP-reachable subset,
   OAuth removed) are **assembled from the same leaves** — the connect API can
   never drift from the descriptor registry because both are the same source.

### `leaves/` (origin: `src/integration/services/<platform>/<Platform>Description.ts`)

Each leaf is a `z.object` with three literal discriminators
(`connectionMode`, `type`, `platform`) plus `scopes`, `inputTokens` (what the
merchant supplies to connect) and `outputTokens` (what the handshake yields).
Two representative leaves are included:

- **`ShopifyDescription.ts`** — one platform, **two** modes: an `OAUTH` leaf
  (only `shopDomain` needed) and a `CREDENTIALS` leaf (merchant's own app
  keys). Also shows deriving a runtime scope list straight off the descriptor
  (`ShopifyOAuthScopes`) so the handshake and authorize URL can't disagree.
- **`StripeDescription.ts`** — a `MANUAL` leaf: no API, empty `inputTokens` /
  `outputTokens`, field-mapping only. The leanest possible leaf.

The full registry has ~20 leaves under
`src/integration/services/*/` on the origin branch.

### Controllers — the type-carriers

- **`controllers/ListPlatformDescriptors.ts`** — `GET /integrations/platforms`.
  Its `outputSchema` **is** `PlatformRegistrySchema`, whose only purpose is to
  push the whole discriminated union into the generated SDK/OpenAPI so the
  frontend renders per-platform connect forms off the static type. The runtime
  body is the registry serialized as JSON Schema; the base Controller doesn't
  validate output, so the deliberate divergence is type-erased behind a cast.
- **`controllers/ConnectIntegration.ts`** — `POST /integrations`. Its body is
  the registry-**derived** connect union (`ConnectIntegrationBodySchema`, itself
  built on `PlatformConnectNonOAuthBodySchema`). The server-injected
  `storeId` (session's active store) and `userId` (session) are layered on in
  the handler — they never belong in the connect form — and the union narrows
  by `connectionMode` downstream with no cast.

---

## Tier (c) — the behavior factories, keyed `(type, platform)`

Once the registry pins the valid `(type, platform)` coordinates, each behavior
(handshake, authorize-URL build, credential exchange, OAuth code exchange,
additional-platform run) gets a **factory that resolves the impl for a
coordinate**. Shape is identical across all of them:

- Concrete impls are **constructor-injected** DI params (no `register()`, no
  `@injectAll`).
- Membership is a **static nested record** `type → platform → impl`.
- `.get(platform: PlatformProps)` indexes the record and throws
  `PLATFORM_NOT_SUPPORTED` fail-fast for any coordinate without an impl (e.g.
  manual platforms have no handshake, credential platforms have no authorize
  URL). No `.has()` — callers just `.get()` and let it throw.
- **Adding a provider = add a constructor param + one table entry.**

Two flavors are included to show the range:

- **`factories/HandshakeServiceFactory.ts`** — the plain nested-record form.
  Also demonstrates **token-only abstract classes** (`WooCommerceHandshaker`
  etc.) that the DI registry binds to a mock in mock/integration envs and
  leaves unbound in `real` (so the factory throws until a real impl ships).
- **`factories/AuthorizeUrlBuilderFactory.ts`** — the **mapped-type** form:
  `BuilderRegistry` = `{ [T in StoreIntegrationType]?: Partial<Record<
  PlatformForType<T>, AuthorizeUrlBuilder>> }` correlates each type with its
  own platform enum at the *type* level. It also ships the reverse map
  `PATH_SEGMENT_TO_PLATFORM` (lower-snake `:platform` path segment →
  `(type, platform)`) used by the OAuth callback controller to dispatch, derived
  from the same `PLATFORM_PATH_SEGMENTS` so the two can't drift.

The base classes these factories resolve (`HandshakeService`,
`AuthorizeUrlBuilder`) live next to their factories on the origin branch under
`src/integration/services/HandshakeService/` and
`src/integration/services/AuthorizeUrlBuilder/` and are not reproduced here.

---

## Why it's worth lifting

- **One source of truth.** The connect API, the OpenAPI type the frontend
  renders forms off, and the runtime `(type, platform)` factory key are all the
  same leaves. A new provider is added once (a leaf + a factory param) and every
  surface updates in lockstep.
- **The type system enforces provider coverage.** A leaf with the wrong
  discriminator literal fails the `discriminatedUnion` build; a factory missing
  a constructor param fails DI; an unsupported coordinate throws a named error
  instead of silently mis-routing.
- **Modes are first-class.** OAuth vs credentials vs manual is a discriminator,
  not a boolean flag or a runtime branch — the HTTP-reachable subset
  (`…NonOAuthBodySchema`) is a *narrowing* of the full union, not a re-declaration.

### Origin files (branch `feat/template-polyglot` @ `ccdd8c531`)

| Exemplar file | Origin |
|---|---|
| `registry.ts` | `packages/api/typescript/src/integration/services/index.ts` |
| `leaves/ShopifyDescription.ts` | `…/src/integration/services/shopify/ShopifyDescription.ts` |
| `leaves/StripeDescription.ts` | `…/src/integration/services/stripe/StripeDescription.ts` |
| `controllers/ListPlatformDescriptors.ts` | `…/src/integration/controllers/ListPlatformDescriptors.ts` |
| `controllers/ConnectIntegration.ts` | `…/src/integration/controllers/ConnectIntegration.ts` |
| `factories/HandshakeServiceFactory.ts` | `…/src/integration/services/HandshakeService/HandshakeServiceFactory.ts` |
| `factories/AuthorizeUrlBuilderFactory.ts` | `…/src/integration/services/AuthorizeUrlBuilder/AuthorizeUrlBuilderFactory.ts` |
