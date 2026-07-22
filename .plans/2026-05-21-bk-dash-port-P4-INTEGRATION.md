# P4-INTEGRATION — BK Dash BC3 Integration — Implementation Plan (polyglot rebase)

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`)
> syntax. Each Task wraps one observable behavior in an outer RED→GREEN cycle
> (test first → impl → verify → commit). Files land under
> `packages/api/typescript/src/integration/` exclusively, with two
> cross-cutting touches that are explicitly allow-listed in this sub-plan:
> (a) `packages/api/typescript/core/src/objects/HashedID.ts` — TS counterpart
> of the Go `objects.HashedID` (Task 1); (b)
> `packages/api/typescript/core/src/services/CredentialVault/` — new shared
> credential-encryption service (Tasks 2). All cross-language enums (`StoreIntegrationType`,
> `SalesPlatform`, `CheckoutPlatform`, `PaymentGatewayPlatform`,
> `MarketingPlatform`, `IntegrationCredentialFieldType`) are already authored
> in `packages/contracts/wire/enums/` and emitted into
> `@template/contracts-typescript/wire`. All cross-service integration events
> (`integration.shared.integration.handshake_succeeded` / `handshake_failed`
> / `last_sync_updated` / `progress_updated`,
> `integration.shared.marketing_ad_account.discovered`) are already authored
> in `packages/contracts/wire/events/` — TS consumes them through
> `RedisExternalMediator` handlers in this sub-plan. The DB schema
> (`store_integrations`, `integration_credentials`, `marketing_ad_accounts`)
> is already authored at `packages/contracts/db/schema/integration.ts` — no
> migration work in this sub-plan, only repository implementations.

**Goal:** Stand up BC3 Integration end-to-end on the polyglot layout — the
`StoreIntegration` aggregate with deterministic UUIDv5 IDs derived via
`HashedID(platform, externalId)`, the AES-256-GCM `CredentialVault`, the
`MarketingAdAccount` discovery aggregate, the OAuth/direct-credentials
connect flow, the TS-owned per-platform handshake (formerly a Go
`/integrations/handshake` endpoint — now dropped from Go), disconnect
(with optional cascade data-wipe), reintegration single + batch with rate
limit, active toggle, and the two reads (T11/T12). Credentials are stored
encrypted-at-rest in the `integration.integration_credentials` table and
are passed in plaintext to the Go worker **only** in the request body of
the server-to-server `POST /sync` call — never on Redis Streams. The Go
worker no longer keeps any integration state of its own; the
`integration.shared.*` events it publishes are consumed by TS to update
read-side state.

**Architecture:** Single bounded context at
`packages/api/typescript/src/integration/` consuming
`@template/core-typescript` for framework primitives (mediator, outbox,
`Repository`, `AggregateRoot`, `Controller`, `Handler`,
`BoundedContext.create`, `RedisExternalMediator`). One write-side
aggregate (`StoreIntegration`) owns the per-Store provider connection
header keyed by `id = HashedID('integration', platform, externalId)`. A
sibling aggregate (`IntegrationCredentialSecret`) owns the encrypted
credential payload — split from `StoreIntegration` so projections, logs,
and the SDK can serialize the header without ever touching plaintext.
`MarketingAdAccount` is a nested read-side projection populated from the
Go-published `marketing_ad_account.discovered` integration event;
merchants flip `is_selected = true` per spec. The connection-test
(handshake) is owned by a TS service (`HandshakeService`) that, per
platform, performs a tiny live API call to validate credentials and
discover `externalId` (e.g. Shopify `GET /admin/api/2024-04/shop.json`
returns `{shop.myshopify_domain, shop.name}`); on success TS computes the
deterministic ID, encrypts credentials via the `CredentialVault`, writes
`store_integrations` + `integration_credentials` rows in one
`UnitOfWork`, and emits the in-process `IntegrationActivated` domain
event. When the user later clicks "reintegrate" the use case decrypts
credentials in TS and POSTs them to the Go worker's `/sync` endpoint via
the `GoWorkerClient` — never via Redis.

**Tech Stack:** TypeScript, Bun, Drizzle (Postgres, schema authored in
`@template/contracts/db`), tsyringe-neo, Zod (via
`@template/core-typescript/schema`), node `crypto` (AES-256-GCM),
`uuid` v5 (already a transitive dep via core).

**Spec:** `.specs/2026-05-21-ddd-modeling-bk-dash.md` §4 BC3 + §7.3 +
§"Design Decisions — Deterministic IDs" + §"Design Decisions — Sync Engine
Separation" + §"Design Decisions — Provider Extensibility".

**Master plan:** `.plans/2026-05-21-bk-dash-port.md` (sub-plan
P4-INTEGRATION).

**Depends on sub-plans:**

- **iter 41 (contracts/wire authored)** — `StoreIntegrationType`,
  `SalesPlatform`, `CheckoutPlatform`, `PaymentGatewayPlatform`,
  `MarketingPlatform`, `IntegrationCredentialFieldType`, `CurrencyCode`
  enums; `IntegrationHandshakeSucceeded`, `IntegrationHandshakeFailed`,
  `IntegrationLastSyncUpdated`, `IntegrationProgressUpdated`,
  `MarketingAdAccountDiscovered` integration events. ✅ landed.
- **iter 42 (contracts/db authored)** — `integration.store_integrations`,
  `integration.integration_credentials`,
  `integration.marketing_ad_accounts` tables. ✅ landed.
- **P1-IDENTITY** — `AuthAccountMiddleware` providing `ctx.session.userId`;
  `User` aggregate for tests. P1 is in flight; if its `given.user(...)`
  helper is missing when this sub-plan starts a test, the test stubs the
  fixture manually and links a `# QUESTION: depends on P1` comment.
- **P2-TENANCY** — `Store` aggregate + `StoreMembershipRepository` for the
  `IntegrationStoreMembershipMiddleware` membership guard. If P2 has not
  landed, the middleware is registered as a no-op stub with a
  `# QUESTION: depends on P2` comment — every controller in this sub-plan
  still gates on `AuthAccountMiddleware`.
- **P3-BILLING** (soft) — for `INTEGRATION_QUOTA_EXCEEDED` enforcement via
  the `PLAN_QUOTAS` code constant. If P3 has not landed, the quota check
  is a `# QUESTION: depends on P3 — placeholder always passes` no-op.

**Downstream consumers:**

- **PG-GO-WORKER** — receives the synchronous `POST /sync` from Task 12's
  `GoWorkerClient` (carrying plaintext credentials in the request body)
  whenever a connect / reintegrate / batch-reintegrate fires; publishes
  `integration.shared.integration.{handshake_succeeded,handshake_failed,last_sync_updated,progress_updated}`
  and `integration.shared.marketing_ad_account.discovered` integration
  events, all consumed by this sub-plan's external handlers (Task 13).
- **P5-CATALOG / P6-SALES / P7-MARKETING / P8-TRACKING** — consume the
  in-process `StoreIntegrationDataWipeRequested` integration event we
  introduce in this sub-plan (an EXTENSION to the contracts/wire/events/
  catalog — see QUESTION below) for cascade-delete of their canonical
  projections.
- **P10-NOTIFICATIONS** — subscribes to
  `integration.shared.integration.handshake_failed` (already authored)
  for user notifications.
- **P11-ANALYTICS** — reads `IntegrationsListQuery` (T11) for the
  integrations health dashboard.

**Tasks:** 19
**Estimated minutes:** ~340

---

## Convention reference (read once during planning, NOT re-read by /build)

- **BC folder shape**: `packages/api/typescript/src/auth/` is the canonical
  sibling — flat `controllers/`, `entities/`, `enums/`, `errors/`,
  `events/`, `handlers/{internal,external,<Name>Handler}.ts`,
  `middlewares/`, `objects/`, `repositories/<Name>Repository/{<Name>Repository,Drizzle<Name>Repository,Mock<Name>Repository,index}.ts`,
  `services/`, `usecases/`, `registry.ts`, `index.ts`. Adopt this exact
  shape under `packages/api/typescript/src/integration/`. **Note**: BC
  folders are flat under `src/`, NOT under `src/contexts/`. (The previous
  iteration's plan used `src/contexts/integration` from the medscall
  layout — that path is dropped.)
- **Entity shape**: `packages/api/typescript/src/auth/entities/User.ts` —
  Zod schema named `<X>Schema` (via `import { z } from '@template/core-typescript'`),
  `export type <X>Props = Z.infer<typeof <X>Schema>` from `import Z from 'zod'`,
  `class <X> extends AggregateRoot<typeof <X>Schema>`, `static override schema`,
  `static create(data)`, `export interface <X> extends <X>Props {}` at the
  bottom.
- **Repository shape**: `packages/api/typescript/src/auth/repositories/UserRepository/` —
  abstract class extending `Repository<X>` with `findById/findBy<...>`,
  paired `Drizzle<X>Repository.ts` (uses `tryCatchAsync`,
  `entity.incrementVersion()` before save) and `Mock<X>Repository.ts`,
  barrel `index.ts`.
- **Registry shape**: `packages/api/typescript/src/auth/registry.ts` —
  flat file exporting `INSTANCE_REGISTRY: InstanceRegistry` with three
  keys (`mock` | `integration` | `real`), each an array of
  `{ token, instance }`. The errors index is imported for its
  side-effect (`registerErrorCodes`) at the top.
- **BoundedContext wiring**: `packages/api/typescript/src/auth/index.ts` —
  `BoundedContext.create({ name, controllers, internalHandlers, externalHandlers, registry })`
  where `name` becomes the URL prefix (e.g. `name: 'integration'` →
  `/v1/integration/...`). The router is registered in
  `packages/api/typescript/src/index.ts` alongside `AuthRouter`,
  `NotificationsRouter`, `UIRouter`.
- **DB schema import**: tables come from `@template/contracts/db` —
  `import { storeIntegrations, integrationCredentials, marketingAdAccounts } from '@template/contracts/db'`.
  This sub-plan does NOT author or modify any Drizzle table — schema is
  contracts-side responsibility (already done in iter 42).
- **Integration event import**: TS classes come from
  `@template/contracts-typescript/wire` —
  `import { IntegrationHandshakeSucceededEvent } from '@template/contracts-typescript/wire'`.
  These extend `BaseIntegrationEvent` and have `static name =
  'integration.shared.integration.handshake_succeeded' as const`.
- **Domain event shape**:
  `packages/api/typescript/src/auth/events/UserRegisteredEvent.ts` —
  `z.domainEvent({...})` schema, class extending `BaseDomainEvent`,
  `static name = '<bc>.<entity>.<verb>' as const`. Names introduced by
  this sub-plan: `integration.store_integration.connection_initiated`,
  `integration.store_integration.handshake_succeeded`,
  `integration.store_integration.handshake_failed`,
  `integration.store_integration.activated`,
  `integration.store_integration.deactivated`,
  `integration.store_integration.disconnected`,
  `integration.store_integration.active_toggled`,
  `integration.store_integration.reintegration_triggered`,
  `integration.store_integration.reintegration_batch_requested`,
  `integration.store_integration.data_wipe_requested`.
- **Handler shape**: `packages/api/typescript/src/auth/handlers/UserRegisteredHandler.ts` —
  `extends EventHandler<typeof Event>`, `readonly event = Event`,
  `async handle(event)`. Re-exported via `handlers/internal.ts`
  (in-process subscribers) or `handlers/external.ts` (Redis-stream
  subscribers consuming cross-service integration events).
- **Handler tests**: per `feedback_givenevent_scope` memory —
  instantiate event class directly and call `handler.handle(event)`;
  do NOT seed `givenEvent` for in-process events.
- **Controller shape**:
  `packages/api/typescript/src/auth/controllers/GetSession.ts` —
  `@injectable() class extends Controller<InputSchema, OutputSchema>`,
  `readonly path = '/...' as \`/${string}\``, `readonly method`,
  `readonly description`, `inputSchema`, `outputSchema`, `handle(request)`
  returning `{ status, data }`. `path` is BC-relative (the BC name is
  prepended by `BoundedContext.create({ name: 'integration' })` →
  `/v1/integration/<path>`).
- **Test placement**: colocated `<File>.test.ts`. `bun:test`. Repository
  + use case tests use
  `TestBed.create('integration', { testContainer })` per the canonical
  pattern in `packages/api/typescript/src/auth/controllers/GetSession.test.ts`
  and `packages/api/typescript/src/notifications/handlers/NotifySubscribersHandler.test.ts`.
- **Middlewares**: `packages/api/typescript/src/auth/middlewares/AuthAccountMiddleware.ts` —
  `@singleton() class implements Middleware`, populates
  `request.ctx.session = { userId, email, name }`. This sub-plan's
  `IntegrationStoreMembershipMiddleware` reads `ctx.session.userId` +
  resolves `storeId` from URL params or body, then queries
  `StoreMembershipRepository` (P2 dep — stub if absent).
- **HashedID + namespace (iter 43.5 correction)**: investigation found
  that polyglot's TS `packages/api/typescript/core/src/objects/Id.ts`
  `Id.fromHash()` and Go `packages/api/go/core/objects/id.go`
  `HashedID(values...)` both implement the SAME algorithm:
  `sha256(values.join('-'))` → hex → first 16 bytes → reformatted as
  UUID. The two languages produce identical ids for identical inputs.
  **No divergence between TS and Go.** Both diverge from spec
  §"Deterministic IDs"' specific UUIDv5+namespace algorithm but in the
  same way, so the deterministic-ID contract (re-ingesting same provider
  entity → same row across services) holds. The original
  `BK_DASH_NAMESPACE` constant from the iter-39 addendum
  (`f63cfbe6-7d8e-4d1d-9c5d-9d8a8b1b0c5e`) was relevant for UUIDv5;
  polyglot's SHA-256-truncated approach doesn't take a namespace
  argument. **Decision**: keep polyglot's algorithm as-is; the
  cross-language contract holds without UUIDv5. Drop Task 1's
  Go-side-fix sub-step. Drop Task 4's "BK_DASH_NAMESPACE constant
  drift test" — the constant is no longer load-bearing.

# QUESTION: spec §7.13 lists `integration.shared.*` integration events but does not include `StoreIntegrationDataWipeRequested` as a cross-service event. This sub-plan publishes it as an **in-process** domain event only; downstream BCs (P5/P6/P7/P8) subscribe via the internal mediator. If a downstream BC needs to consume it across a service boundary, the publisher (this sub-plan's `IntegrationDisconnectedHandler`) is amended to also publish a `integration.shared.store_integration.data_wipe_requested` integration event — but until then we keep it in-process. P0-FOUNDATION / contracts/wire authors should rubber-stamp the in-process scope.

# QUESTION: `IntegrationActivated` and `IntegrationDeactivated` are listed in the spec's BC3 published-events list AND are consumed by the Go worker per the master-plan dependency footer (line 1005–1006). However, the polyglot `packages/contracts/wire/events/` catalog does NOT include them. **Resolution**: this sub-plan does NOT author them as cross-service integration events. The Go worker no longer needs them because (a) it does not own any integration state, (b) `/sync` is invoked synchronously by TS on connect / reintegrate. The in-process `IntegrationActivated` / `IntegrationDeactivated` domain events remain for downstream TS handlers (P10 notifications). If at PE-E2E we discover the Go worker DOES need them, contracts/wire authors will add them and this sub-plan's `internal.ts` handlers will be promoted to also publish via `ExternalMediator`.

# QUESTION: the spec uses `MarketingBusinessAccount` as a separate aggregate but `packages/contracts/db/schema/integration.ts` only ships `marketing_ad_accounts`. **Resolution**: drop `MarketingBusinessAccount` from this sub-plan — the spec hints (§4 BC3 line 686) that business accounts are mostly a display affordance for Meta's BM hierarchy; we surface them as an optional `businessAccountName?` column on `marketing_ad_accounts` (already present as `account_name`, no column add needed). If a future iteration needs first-class business accounts, contracts/db/schema/integration.ts adds the table and this sub-plan reopens for the additional repository.

---

## Phase ordering (per /task-breakdown convention)

This sub-plan crosses 1 BC + 2 core-typescript additions (`HashedID`,
`CredentialVault`) + 1 Go-side correction (`id.go`) + consumes 5 contracts/wire
events + writes ~30 TS files — enough to trigger /task-breakdown.

Phase 0 — Contract Lock prerequisites: Tasks 1–3 (core primitives,
errors, enums-re-export).
Phase 1 — Behavior slices: Tasks 4–9 (entities, services).
Phase 2 — Repositories + DB integration: Tasks 10–11.
Phase 3 — Outbound Go client + inbound integration-event handlers: Tasks
12–13.
Phase 4 — Use cases + controllers paired (Contract Lock per controller):
Tasks 14–17.
Phase 5 — BC wiring + SDK regen + flow test: Tasks 18–19.

Wave classification:
- Wave A (serial): Tasks 1–3 (foundation primitives; everything else
  imports from them).
- Wave B (parallel-after-A): Tasks 4–9 (entities + services; disjoint
  files).
- Wave C (parallel-after-B): Tasks 10–13 (repositories + external
  handlers; disjoint).
- Wave D (parallel-after-C, controller-bearing — Contract Lock per
  task): Tasks 14–17 (use case + controller paired, one per command/read).
- Wave E (serial finish): Tasks 18–19 (BC wiring → SDK regen / flow
  test).

---

## Task 1: Lock the BK Dash UUIDv5 namespace + `HashedID` on both TS and Go

**Files:**
- Modify: `packages/api/go/core/objects/id.go` — replace SHA-256 framing
  with `uuid.NewSHA1(BK_DASH_NAMESPACE, []byte(seed))`; export
  `BK_DASH_NAMESPACE = uuid.MustParse("f63cfbe6-7d8e-4d1d-9c5d-9d8a8b1b0c5e")`.
- Create: `packages/api/typescript/core/src/objects/HashedID.ts` — TS
  counterpart.
- Modify: `packages/api/typescript/core/src/objects/index.ts` —
  re-export `HashedID` + `BK_DASH_NAMESPACE`.
- Create: `packages/api/typescript/core/src/objects/HashedID.test.ts`.
- Modify: `packages/api/go/core/objects/id_test.go` (or create if absent).

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /value-object
**Depends on:** (none — foundation)

This is the foundational determinism contract for every canonical entity
ingested across the platform. The namespace constant
`f63cfbe6-7d8e-4d1d-9c5d-9d8a8b1b0c5e` is hard-coded byte-for-byte on
both sides per spec §"Deterministic IDs"; any deviation silently
orphans every previously-ingested entity. The user-supplied note
confirms this constant is the canonical value.

- [ ] **Step 1: Write the failing test (TS)**:

```typescript
// packages/api/typescript/core/src/objects/HashedID.test.ts
import { describe, expect, it } from 'bun:test'
import { HashedID, BK_DASH_NAMESPACE } from './HashedID'

describe('HashedID', () => {
  it('locks the BK Dash UUIDv5 namespace byte-for-byte', () => {
    expect(BK_DASH_NAMESPACE).toBe('f63cfbe6-7d8e-4d1d-9c5d-9d8a8b1b0c5e')
  })

  it('produces a stable UUIDv5 from (type, platform, externalId)', () => {
    const a = HashedID('integration', 'SHOPIFY', 'foo.myshopify.com')
    const b = HashedID('integration', 'SHOPIFY', 'foo.myshopify.com')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('differs across platforms', () => {
    expect(HashedID('integration', 'SHOPIFY', 'x'))
      .not.toBe(HashedID('integration', 'YAMPI', 'x'))
  })

  it('matches Go-side derivation for the same inputs (golden value)', () => {
    // Golden value computed once via the Go side and asserted both ways.
    const got = HashedID('integration', 'SHOPIFY', 'foo.myshopify.com')
    expect(got).toBe('TODO: paste-go-output-here-once-task-1-go-side-runs')
  })
})
```

- [ ] **Step 2: Run → FAIL** (file does not exist).
- [ ] **Step 3: Implement TS** using `uuid` npm package:

```typescript
import { v5 as uuidv5 } from 'uuid'

export const BK_DASH_NAMESPACE = 'f63cfbe6-7d8e-4d1d-9c5d-9d8a8b1b0c5e' as const

export function HashedID(...values: string[]): string {
  if (values.length === 0) throw new Error('HashedID requires at least one value')
  return uuidv5(values.join(':'), BK_DASH_NAMESPACE)
}
```

- [ ] **Step 4: Replace Go SHA-256 framing** with
  `uuid.NewSHA1(BK_DASH_NAMESPACE, []byte(strings.Join(values, ":")))`.
  Add `BK_DASH_NAMESPACE = uuid.MustParse("f63cfbe6-7d8e-4d1d-9c5d-9d8a8b1b0c5e")`
  package-level constant.
- [ ] **Step 5: Co-derive golden value from Go test, paste into TS
  golden assertion**.
- [ ] **Step 6: tsc + lint + test PASS (both languages)**.
- [ ] **Step 7: Commit** — `feat(core): HashedID UUIDv5 with locked BK_DASH_NAMESPACE on TS+Go (P4 Task 1)`.

---

## Task 2: `CredentialVault` AES-256-GCM service in `core-typescript`

**Files:**
- Create: `packages/api/typescript/core/src/services/CredentialVault/CredentialVault.ts` (abstract)
- Create: `packages/api/typescript/core/src/services/CredentialVault/AesCredentialVault.ts`
- Create: `packages/api/typescript/core/src/services/CredentialVault/MockCredentialVault.ts`
- Create: `packages/api/typescript/core/src/services/CredentialVault/index.ts`
- Create: `packages/api/typescript/core/src/services/CredentialVault/AesCredentialVault.test.ts`
- Modify: `packages/api/typescript/core/src/index.ts` — `export * from './services/CredentialVault'`
- Modify: `packages/api/typescript/core/src/utils/Config.ts` — add
  `STORE_INTEGRATION_CREDENTIAL_KEY: z.string().base64().length(44)` (32-byte AES-256 key, base64 = 44 chars with padding).
- Modify: `.env.example` — `STORE_INTEGRATION_CREDENTIAL_KEY=` with comment `# openssl rand -base64 32`.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service
**Depends on:** Task 1

The schema column is `encrypted_payload jsonb` (algorithm-versioned
framing per the schema docstring: `{ iv, ct, tag }` for `aes-256-gcm-v1`,
extensible to envelope encryption later). The `encryption_algorithm`
column lives next to it so future rekeys can pick the right
decryptor.

- [ ] **Step 1: Failing test** — round-trip + tamper detection + IV
  uniqueness + algorithm version returned:

```typescript
import { describe, expect, it } from 'bun:test'
import { AesCredentialVault } from './AesCredentialVault'

const KEY = Buffer.from('a'.repeat(32)).toString('base64')

describe('AesCredentialVault', () => {
  const vault = new AesCredentialVault({ keyBase64: KEY })

  it('round-trips a credential payload', async () => {
    const plain = { accessToken: 'sk_live_abc', shopDomain: 'foo.myshopify.com' }
    const sealed = await vault.seal(plain)
    expect(sealed.encryptionAlgorithm).toBe('aes-256-gcm-v1')
    const out = await vault.open<typeof plain>(sealed)
    expect(out).toEqual(plain)
  })

  it('detects tampered ciphertext (AEAD)', async () => {
    const sealed = await vault.seal({ x: 1 })
    sealed.encryptedPayload.ct = sealed.encryptedPayload.ct.slice(0, -2) + 'AA'
    await expect(vault.open(sealed)).rejects.toThrow()
  })

  it('produces different ciphertexts on each seal (IV uniqueness)', async () => {
    const a = await vault.seal({ a: 1 })
    const b = await vault.seal({ a: 1 })
    expect(a.encryptedPayload.iv).not.toBe(b.encryptedPayload.iv)
  })
})
```

- [ ] **Step 2: FAIL**.
- [ ] **Step 3: Implement** using `crypto.createCipheriv('aes-256-gcm',
  key, iv)`. Output `{ encryptionAlgorithm: 'aes-256-gcm-v1',
  encryptedPayload: { iv: base64, ct: base64, tag: base64 } }`. Throw
  `BaseError<BaseInfrastructureErrors>('STORE_INTEGRATION_CREDENTIAL_DECRYPT_FAILED')`
  on open failure.
- [ ] **Step 4: PASS + tsc + lint**.
- [ ] **Step 5: Commit** — `feat(core): AES-256-GCM CredentialVault service with versioned payload framing (P4 Task 2)`.

---

## Task 3: BC3 errors glossary + framework registration

**Files:**
- Create: `packages/api/typescript/src/integration/errors/index.ts`
- Create: `packages/api/typescript/src/integration/errors/index.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /errors
**Depends on:** Task 2

Mirror `packages/api/typescript/src/auth/errors/index.ts` — typed string
unions per layer, side-effect call to `registerErrorCodes({...})`
mapping each code to its HTTP status. Per spec §7.14 BC3 base set:
`PLATFORM_NOT_SUPPORTED`, `INVALID_CREDENTIAL_FIELDS`,
`OAUTH_CODE_INVALID`, `INTEGRATION_HANDSHAKE_FAILED`,
`INTEGRATION_QUOTA_EXCEEDED`, `STORE_INTEGRATION_NOT_FOUND`,
`STORE_INTEGRATION_INACTIVE`, `STORE_INTEGRATION_ALREADY_DISCONNECTED`,
`REINTEGRATION_RATE_LIMITED`. Add infrastructure codes used by Task 2 /
Task 12: `STORE_INTEGRATION_CREDENTIAL_DECRYPT_FAILED`,
`STORE_INTEGRATION_CREDENTIAL_NOT_FOUND`,
`STORE_INTEGRATION_GO_WORKER_UNREACHABLE`.

```typescript
import { HttpStatusCode, registerErrorCodes } from '@template/core-typescript'
import type {
  BaseDomainErrors,
  BaseApplicationErrors,
  BaseInterfaceErrors,
  BaseInfrastructureErrors,
} from '@template/core-typescript'

export type IntegrationDomainErrors =
  | 'STORE_INTEGRATION_ALREADY_DISCONNECTED'
  | 'STORE_INTEGRATION_INACTIVE'
  | 'INVALID_CREDENTIAL_FIELDS'
export type DomainErrors = BaseDomainErrors | IntegrationDomainErrors

export type IntegrationApplicationErrors =
  | 'PLATFORM_NOT_SUPPORTED'
  | 'STORE_INTEGRATION_NOT_FOUND'
  | 'STORE_INTEGRATION_CREDENTIAL_NOT_FOUND'
  | 'REINTEGRATION_RATE_LIMITED'
  | 'INTEGRATION_QUOTA_EXCEEDED'
  | 'OAUTH_CODE_INVALID'
  | 'INTEGRATION_HANDSHAKE_FAILED'
export type ApplicationErrors = BaseApplicationErrors | IntegrationApplicationErrors

export type IntegrationInfrastructureErrors =
  | 'STORE_INTEGRATION_CREDENTIAL_DECRYPT_FAILED'
  | 'STORE_INTEGRATION_GO_WORKER_UNREACHABLE'
export type InfrastructureErrors = BaseInfrastructureErrors | IntegrationInfrastructureErrors

export type IntegrationInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | IntegrationInterfaceErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
  PLATFORM_NOT_SUPPORTED: HttpStatusCode.BAD_REQUEST,
  INVALID_CREDENTIAL_FIELDS: HttpStatusCode.BAD_REQUEST,
  OAUTH_CODE_INVALID: HttpStatusCode.BAD_REQUEST,
  INTEGRATION_HANDSHAKE_FAILED: HttpStatusCode.BAD_GATEWAY,
  INTEGRATION_QUOTA_EXCEEDED: HttpStatusCode.PAYMENT_REQUIRED,
  STORE_INTEGRATION_NOT_FOUND: HttpStatusCode.NOT_FOUND,
  STORE_INTEGRATION_INACTIVE: HttpStatusCode.CONFLICT,
  STORE_INTEGRATION_ALREADY_DISCONNECTED: HttpStatusCode.CONFLICT,
  REINTEGRATION_RATE_LIMITED: HttpStatusCode.TOO_MANY_REQUESTS,
  STORE_INTEGRATION_CREDENTIAL_NOT_FOUND: HttpStatusCode.INTERNAL_SERVER_ERROR,
  STORE_INTEGRATION_CREDENTIAL_DECRYPT_FAILED: HttpStatusCode.INTERNAL_SERVER_ERROR,
  STORE_INTEGRATION_GO_WORKER_UNREACHABLE: HttpStatusCode.BAD_GATEWAY,
})
```

- [ ] Test asserts the union accepts every spec-required code.
- [ ] PASS + tsc + lint. Commit — `feat(integration): errors glossary + HTTP status registration (P4 Task 3)`.

---

## Task 4: `Platform` discriminated value object (per-BC, not in core)

**Files:**
- Create: `packages/api/typescript/src/integration/objects/Platform.ts`
- Create: `packages/api/typescript/src/integration/objects/index.ts`
- Create: `packages/api/typescript/src/integration/objects/Platform.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /value-object
**Depends on:** Task 3

The `Platform` value object discriminates across `(type,
platformId)` where `type ∈ StoreIntegrationType` and `platformId ∈
SalesPlatform | CheckoutPlatform | PaymentGatewayPlatform |
MarketingPlatform`. It is the **single source of truth** for the
`HashedID(...)` seed in this sub-plan — every callsite that derives a
deterministic id goes through `Platform.toHashSeed()` so the seed
format never drifts.

```typescript
import { z } from '@template/core-typescript'
import {
  StoreIntegrationTypeSchema,
  SalesPlatformSchema,
  CheckoutPlatformSchema,
  PaymentGatewayPlatformSchema,
  MarketingPlatformSchema,
} from '@template/contracts-typescript/wire'

export const PlatformSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SALES_CHANNEL'),       platform: SalesPlatformSchema }),
  z.object({ type: z.literal('CHECKOUT'),            platform: CheckoutPlatformSchema }),
  z.object({ type: z.literal('PAYMENT_GATEWAY'),     platform: PaymentGatewayPlatformSchema }),
  z.object({ type: z.literal('MARKETING_PLATFORM'),  platform: MarketingPlatformSchema }),
])

export type PlatformProps = z.infer<typeof PlatformSchema>

export function platformHashSeed(p: PlatformProps, externalId: string): [string, string, string] {
  return ['integration', `${p.type}:${p.platform}`, externalId]
}
```

- [ ] Test: each branch parses; cross-branch values are rejected (e.g.
  `{ type: 'SALES_CHANNEL', platform: 'META' }` fails); `platformHashSeed`
  always returns a 3-tuple.
- [ ] Commit — `feat(integration): Platform discriminated value object (P4 Task 4)`.

---

## Task 5: `StoreIntegration` aggregate (lifecycle state machine)

**Files:**
- Create: `packages/api/typescript/src/integration/entities/StoreIntegration.ts`
- Create: `packages/api/typescript/src/integration/entities/StoreIntegration.test.ts`
- Create: `packages/api/typescript/src/integration/entities/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Skills:** /entity
**Depends on:** Tasks 1, 3, 4

Aggregate per spec §4 BC3 line 683. The `id` is derived deterministically
in the `static create({platform, externalId, ...})` constructor by calling
`HashedID(...platformHashSeed(platform, externalId))`. Behavior methods
add domain events via `this.addDomainEvent(new ...Event(...))` (the
event classes land in Task 8).

```typescript
import Z from 'zod'
import { AggregateRoot, z, HashedID, BaseError } from '@template/core-typescript'
import { PlatformSchema, platformHashSeed } from '../objects/Platform'
import type { IntegrationDomainErrors } from '../errors'

const StoreIntegrationSchema = z.object({
  storeId: z.string().uuid(),
  type: z.string(),  // mirrors StoreIntegrationTypeSchema; type-narrowed via PlatformSchema on input
  platform: z.string().min(1, { error: 'INVALID_CREDENTIAL_FIELDS' as IntegrationDomainErrors }),
  externalId: z.string(),
  displayName: z.string().min(1).max(120),
  credentialSecretId: z.string().uuid().nullable(),
  active: z.boolean(),
  valid: z.boolean(),
  lastSyncAt: z.string().datetime().nullable(),
  lastHandshakeAt: z.string().datetime().nullable(),
  connectedAt: z.string().datetime(),
  disconnectedAt: z.string().datetime().nullable(),
  ownerId: z.string(),
})

export type StoreIntegrationProps = Z.infer<typeof StoreIntegrationSchema>

export class StoreIntegration extends AggregateRoot<typeof StoreIntegrationSchema> {
  static override schema = StoreIntegrationSchema

  static create(data: {
    storeId: string
    platform: Z.infer<typeof PlatformSchema>
    externalId: string
    displayName: string
    ownerId: string
  }): StoreIntegration {
    const id = HashedID(...platformHashSeed(data.platform, data.externalId))
    return new StoreIntegration({
      id,
      storeId: data.storeId,
      type: data.platform.type,
      platform: data.platform.platform,
      externalId: data.externalId,
      displayName: data.displayName,
      credentialSecretId: null,
      active: false,  // becomes true after markHandshakeSucceeded
      valid: false,
      lastSyncAt: null,
      lastHandshakeAt: null,
      connectedAt: new Date().toISOString(),
      disconnectedAt: null,
      ownerId: data.ownerId,
    })
  }

  markHandshakeSucceeded(at: string = new Date().toISOString()): void { /* sets valid=true, active=true, lastHandshakeAt */ }
  markHandshakeFailed(reason: string): void { /* sets valid=false */ }
  attachCredentialSecret(secretId: string): void { /* sets credentialSecretId */ }
  disconnect(): void {
    if (this.disconnectedAt) throw new BaseError<IntegrationDomainErrors>('STORE_INTEGRATION_ALREADY_DISCONNECTED')
    this.disconnectedAt = new Date().toISOString()
    this.active = false
    this.validate()
  }
  toggleActive(active: boolean): void { /* sets active */ }
  markReintegrationTriggered(): void {
    if (!this.active) throw new BaseError<IntegrationDomainErrors>('STORE_INTEGRATION_INACTIVE')
  }
  recordSyncCompleted(at: string): void { this.lastSyncAt = at; this.validate() }
}

export interface StoreIntegration extends StoreIntegrationProps {}
```

- [ ] Tests cover each transition + each error case.
- [ ] Commit — `feat(integration): StoreIntegration aggregate (P4 Task 5)`.

---

## Task 6: `IntegrationCredentialSecret` aggregate

**Files:**
- Create: `packages/api/typescript/src/integration/entities/IntegrationCredentialSecret.ts`
- Create: `packages/api/typescript/src/integration/entities/IntegrationCredentialSecret.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Skills:** /entity
**Depends on:** Tasks 2, 5

Wraps the `{ encryptionAlgorithm, encryptedPayload }` pair produced by
`CredentialVault.seal(...)`. Splits secrets from `StoreIntegration` so
the header aggregate (and any projection / log line that touches it) can
never accidentally serialize plaintext. The schema mirrors the
`integration_credentials` columns (`storeIntegrationId`,
`encryptionAlgorithm`, `encryptedPayload` jsonb).

- [ ] Test: `rotate(newSealed)` updates payload + bumps `rotatedAt`.
- [ ] Commit — `feat(integration): IntegrationCredentialSecret aggregate (P4 Task 6)`.

---

## Task 7: `MarketingAdAccount` entity (read-side projection)

**Files:**
- Create: `packages/api/typescript/src/integration/entities/MarketingAdAccount.ts`
- Create: `packages/api/typescript/src/integration/entities/MarketingAdAccount.test.ts`

Schema mirrors the `marketing_ad_accounts` columns: `id`,
`storeIntegrationId`, `externalId`, `accountName`, `currency`,
`isSelected`. `static fromDiscoveredEvent(event:
MarketingAdAccountDiscoveredEvent, storeIntegrationId: string)` is the
factory the external handler (Task 13) uses to UPSERT the row. Drop
`MarketingBusinessAccount` per the QUESTION above.

- [ ] Commit — `feat(integration): MarketingAdAccount entity (P4 Task 7)`.

---

## Task 8: Domain events (in-process, BC3-owned)

**Files:**
- Create: `packages/api/typescript/src/integration/events/IntegrationConnectionInitiatedEvent.ts`
- Create: `packages/api/typescript/src/integration/events/IntegrationHandshakeSucceededEvent.ts` (in-process — distinct from the same-named contracts/wire integration event consumed in `external.ts`)
- Create: `packages/api/typescript/src/integration/events/IntegrationHandshakeFailedEvent.ts`
- Create: `packages/api/typescript/src/integration/events/IntegrationActivatedEvent.ts`
- Create: `packages/api/typescript/src/integration/events/IntegrationDeactivatedEvent.ts`
- Create: `packages/api/typescript/src/integration/events/IntegrationDisconnectedEvent.ts`
- Create: `packages/api/typescript/src/integration/events/IntegrationActiveToggledEvent.ts`
- Create: `packages/api/typescript/src/integration/events/ReintegrationTriggeredEvent.ts`
- Create: `packages/api/typescript/src/integration/events/ReintegrationBatchRequestedEvent.ts`
- Create: `packages/api/typescript/src/integration/events/StoreIntegrationDataWipeRequestedEvent.ts`
- Create: `packages/api/typescript/src/integration/events/index.ts`

**Skills:** /event
**Depends on:** Task 5

Mirror `packages/api/typescript/src/auth/events/UserRegisteredEvent.ts` —
each is `z.domainEvent({...})` + class extending `BaseDomainEvent`,
`static name = 'integration.store_integration.<verb>' as const`. These
are in-process events only — the cross-service ones live in
`packages/contracts/wire/events/` and are consumed (not published) by
this sub-plan.

- [ ] Commit — `feat(integration): domain events catalog (P4 Task 8)`.

---

## Task 9: `HandshakeService` (TS-owned connection-test)

**Files:**
- Create: `packages/api/typescript/src/integration/services/HandshakeService/HandshakeService.ts` (abstract)
- Create: `packages/api/typescript/src/integration/services/HandshakeService/ShopifyHandshaker.ts`
- Create: `packages/api/typescript/src/integration/services/HandshakeService/MockHandshakeService.ts`
- Create: `packages/api/typescript/src/integration/services/HandshakeService/index.ts`
- Create: `packages/api/typescript/src/integration/services/HandshakeService/ShopifyHandshaker.test.ts`
- Create: `packages/api/typescript/src/integration/services/OAuthCodeExchanger/OAuthCodeExchanger.ts` (abstract)
- Create: `packages/api/typescript/src/integration/services/OAuthCodeExchanger/ShopifyOAuthCodeExchanger.ts`
- Create: `packages/api/typescript/src/integration/services/OAuthCodeExchanger/MockOAuthCodeExchanger.ts`
- Create: `packages/api/typescript/src/integration/services/OAuthCodeExchanger/index.ts`
- Create: `packages/api/typescript/src/integration/services/PlatformCredentialSchemas.ts`
- Create: `packages/api/typescript/src/integration/services/PlatformCredentialSchemas.test.ts`
- Create: `packages/api/typescript/src/integration/services/index.ts`
- Modify: `packages/api/typescript/core/src/utils/Config.ts` — add `SHOPIFY_CLIENT_ID?: string` + `SHOPIFY_CLIENT_SECRET?: string` (both optional; missing → handshaker throws `PLATFORM_NOT_SUPPORTED`).

**Skills:** /service
**Depends on:** Tasks 4, 5

**Ownership transfer**: per the user-supplied coordination note, the Go
worker's `/integrations/handshake` endpoint is **dropped**. TS owns the
connection-test. The `HandshakeService` per-platform strategy registry
mirrors the OAuth code-exchanger pattern — Shopify is the happy-path
implementation, the other 7 platforms throw `PLATFORM_NOT_SUPPORTED`
until a per-platform extension lands.

```typescript
export type HandshakeResult = {
  externalId: string
  displayName: string
  discoveredAdAccountExternalIds?: string[]  // marketing only — full rows arrive later via the discovered integration event
}

export abstract class HandshakeService {
  abstract handshake(input: {
    platform: PlatformProps
    credentials: Record<string, string>
  }): Promise<HandshakeResult>
}
```

`ShopifyHandshaker`: `GET https://{shopDomain}/admin/api/2024-04/shop.json`
with `X-Shopify-Access-Token` header → maps to `{ externalId:
shop.myshopify_domain, displayName: shop.name }`. On 4xx/5xx throw
`BaseError<IntegrationApplicationErrors>('INTEGRATION_HANDSHAKE_FAILED',
{ reason })`.

`PlatformCredentialSchemas`: keyed registry
`Record<\`${StoreIntegrationType}:${string}\`, { fields:
IntegrationCredentialField[]; schema: ZodObject }>`. Shopify entry ships
the real `{ shopDomain, accessToken }` schema; the rest ship `schema:
z.never()` + descriptors-only so the UI knows what to render but `ConnectIntegration`
throws `PLATFORM_NOT_SUPPORTED` before any network call.

`OAuthCodeExchanger`: same strategy pattern — Shopify exchanges code at
`https://{shop}.myshopify.com/admin/oauth/access_token`.

- [ ] Tests mock `fetch` and assert request shape + error mapping.
- [ ] Commit — `feat(integration): HandshakeService + OAuthCodeExchanger + PlatformCredentialSchemas for Shopify happy path (P4 Task 9)`.

---

## Task 10: Repository interfaces + Mock implementations

**Files:**
- Create: `packages/api/typescript/src/integration/repositories/StoreIntegrationRepository/{StoreIntegrationRepository,MockStoreIntegrationRepository,index}.ts`
- Create: `packages/api/typescript/src/integration/repositories/IntegrationCredentialSecretRepository/{IntegrationCredentialSecretRepository,MockIntegrationCredentialSecretRepository,index}.ts`
- Create: `packages/api/typescript/src/integration/repositories/MarketingAdAccountRepository/{MarketingAdAccountRepository,MockMarketingAdAccountRepository,index}.ts`
- Create: `packages/api/typescript/src/integration/repositories/index.ts`

**Skills:** /repository
**Depends on:** Tasks 5, 6, 7

- `StoreIntegrationRepository`: `findById`, `findByStoreId`,
  `findByStoreIdAndType`, `findByDeterministicId(platform, externalId)`
  (uses `HashedID(...)` inline), `findByExternalId(platform: string,
  externalId: string)` (for external-handler tenant resolution),
  `save`, `delete`.
- `IntegrationCredentialSecretRepository`: `findById`,
  `findByStoreIntegrationId`, `save`, `delete`.
- `MarketingAdAccountRepository`: `findById`, `findByStoreIntegrationId`,
  `saveMany`, `deleteByStoreIntegrationId`, `upsertByExternalId(adAccount)`
  (used by the discovered-event handler).

Mocks use in-memory `Map`. No tests in this task — tested via Drizzle
+ use-case tests.

- [ ] Commit — `feat(integration): repository interfaces + mocks (P4 Task 10)`.

---

## Task 11: Drizzle implementations + colocated repository tests

**Files:**
- Create: `packages/api/typescript/src/integration/repositories/StoreIntegrationRepository/DrizzleStoreIntegrationRepository.ts`
- Create: `packages/api/typescript/src/integration/repositories/StoreIntegrationRepository/DrizzleStoreIntegrationRepository.test.ts`
- Create: `packages/api/typescript/src/integration/repositories/IntegrationCredentialSecretRepository/DrizzleIntegrationCredentialSecretRepository.ts`
- Create: `packages/api/typescript/src/integration/repositories/IntegrationCredentialSecretRepository/DrizzleIntegrationCredentialSecretRepository.test.ts`
- Create: `packages/api/typescript/src/integration/repositories/MarketingAdAccountRepository/DrizzleMarketingAdAccountRepository.ts`
- Create: `packages/api/typescript/src/integration/repositories/MarketingAdAccountRepository/DrizzleMarketingAdAccountRepository.test.ts`

**Skills:** /repository, /test
**Depends on:** Task 10

Mirror `packages/api/typescript/src/auth/repositories/UserRepository/DrizzleUserRepository.ts`:
- `import { storeIntegrations, integrationCredentials, marketingAdAccounts } from '@template/contracts/db'`
- `@injectable()`, ctor `private db: DrizzleClient`
- `tryCatchAsync` wrappers, `entity.incrementVersion()` before save
- `toDomain(row)` / `toPersistence(entity)` helpers

Tests use `TestBed.create('integration', ...)` per
`packages/api/typescript/src/auth/controllers/GetSession.test.ts`. Cover
`save → findById` round-trip, `findByDeterministicId` returns the row
saved with that deterministic id, `findByStoreIdAndType` filters.

- [ ] Commit — `feat(integration): Drizzle repository implementations + integration tests (P4 Task 11)`.

---

## Task 12: `GoWorkerClient` HTTP service (TS → Go server-to-server)

**Files:**
- Create: `packages/api/typescript/src/integration/services/GoWorkerClient/GoWorkerClient.ts` (abstract)
- Create: `packages/api/typescript/src/integration/services/GoWorkerClient/HttpGoWorkerClient.ts`
- Create: `packages/api/typescript/src/integration/services/GoWorkerClient/MockGoWorkerClient.ts`
- Create: `packages/api/typescript/src/integration/services/GoWorkerClient/index.ts`
- Create: `packages/api/typescript/src/integration/services/GoWorkerClient/HttpGoWorkerClient.test.ts`
- Modify: `packages/api/typescript/core/src/utils/Config.ts` — `GO_WORKER_BASE_URL: z.string().url()` + `GO_WORKER_AUTH_TOKEN: z.string().min(32)`.

**Skills:** /service
**Depends on:** Tasks 3, 4

Per the user's coordination note: when `/sync` (or `/marketing/reconcile`)
is triggered, TS POSTs `{ storeIntegrationId, platform, credentials,
pipelines[], windowDays? }` to the Go worker's HTTP endpoint — plaintext
credentials in the request body, **never** on Redis Streams.

```typescript
export abstract class GoWorkerClient {
  abstract requestSync(input: {
    storeIntegrationId: string
    platform: PlatformProps
    credentials: Record<string, string>
    pipelines: ('ORDERS'|'PRODUCTS'|'VARIANTS'|'CAMPAIGNS'|'AD_SPEND'|'PIXEL')[]
    windowDays?: number
  }): Promise<{ acceptedAt: string }>

  abstract requestMarketingReconcile(input: {
    platform: PlatformProps
    credentials: Record<string, string>
    adAccountExternalId: string
    dateRange: { startDate: string; endDate: string }
  }): Promise<void>
}
```

Implementation: `fetch(\`${Config.env.GO_WORKER_BASE_URL}/sync\`, {
method: 'POST', headers: { Authorization: \`Bearer
${Config.env.GO_WORKER_AUTH_TOKEN}\`, ... } })`. On non-2xx throw
`BaseError<IntegrationInfrastructureErrors>('STORE_INTEGRATION_GO_WORKER_UNREACHABLE')`.
**Logger MUST redact `credentials.*`** — sanitize before logging.

- [ ] Tests assert auth header + body shape + that credentials never
  appear in captured log output.
- [ ] Commit — `feat(integration): GoWorkerClient HTTP service (P4 Task 12)`.

---

## Task 13: External handlers (consume contracts/wire integration events)

**Files:**
- Create: `packages/api/typescript/src/integration/handlers/IntegrationHandshakeSucceededExternalHandler.ts`
- Create: `packages/api/typescript/src/integration/handlers/IntegrationHandshakeFailedExternalHandler.ts`
- Create: `packages/api/typescript/src/integration/handlers/IntegrationLastSyncUpdatedExternalHandler.ts`
- Create: `packages/api/typescript/src/integration/handlers/IntegrationProgressUpdatedExternalHandler.ts`
- Create: `packages/api/typescript/src/integration/handlers/MarketingAdAccountDiscoveredExternalHandler.ts`
- Create: `packages/api/typescript/src/integration/handlers/IntegrationHandshakeSucceededExternalHandler.test.ts`
- Create: `packages/api/typescript/src/integration/handlers/IntegrationActivatedHandler.ts` (in-process — publishes downstream notifications)
- Create: `packages/api/typescript/src/integration/handlers/IntegrationDisconnectedHandler.ts` (in-process — handles `wipeData=true` → raises `StoreIntegrationDataWipeRequested`)
- Create: `packages/api/typescript/src/integration/handlers/ReintegrationBatchHandler.ts` (in-process — iterates and dispatches per-integration reintegration)
- Create: `packages/api/typescript/src/integration/handlers/internal.ts`
- Create: `packages/api/typescript/src/integration/handlers/external.ts`

**Skills:** /handler
**Depends on:** Tasks 5, 7, 8, 10

External handlers (Redis Stream subscribers) re-export from
`external.ts`. They consume the Go-published events and apply the
read-side state per the event docstrings:

- **HandshakeSucceeded** → look up `StoreIntegration` by
  `findByExternalId(platform, providerExternalId)` (NOT
  `findByDeterministicId` — at handshake-success time TS has not yet
  written the deterministic-id row IF the connect happened on a different
  TS replica; the Go worker is the broadcasting authority). Activate it
  (`active=true, valid=true, lastHandshakeAt`), persist via
  `StoreIntegrationRepository.save`.
- **HandshakeFailed** → mark `valid=false`, leave `active=false`.
- **LastSyncUpdated** → set `lastSyncAt`.
- **ProgressUpdated** → forwarded to a future SSE/WS subsystem (`# QUESTION: SSE wiring lands in PE-E2E or earlier`); for now log + no-op.
- **MarketingAdAccountDiscovered** → `MarketingAdAccountRepository.upsertByExternalId(MarketingAdAccount.fromDiscoveredEvent(event, storeIntegrationId))`.

Internal handlers (`internal.ts`):
- **IntegrationActivatedHandler** — for now logs; P10 will subscribe.
- **IntegrationDisconnectedHandler** — if `wipeData=true` in the source
  domain event, raises `StoreIntegrationDataWipeRequested` for
  downstream BCs.
- **ReintegrationBatchHandler** — consumes
  `ReintegrationBatchRequested`, iterates and dispatches the internal
  `TriggerReintegration` handler per id, swallowing
  `REINTEGRATION_RATE_LIMITED` into the `skipped[]` accumulator (which
  is read back by C24's use case).

Test (`IntegrationHandshakeSucceededExternalHandler.test.ts`) per the
`feedback_givenevent_scope` memory: instantiate the event class
directly and call `handler.handle(event)`; do NOT seed events.

- [ ] Commit — `feat(integration): internal + external handlers — consumes 5 contracts/wire events, publishes in-process domain events (P4 Task 13)`.

---

## Task 14: `ConnectIntegration` use case + controller (C21)

**Files:**
- Create: `packages/api/typescript/src/integration/usecases/ConnectIntegration.ts`
- Create: `packages/api/typescript/src/integration/usecases/ConnectIntegration.test.ts`
- Create: `packages/api/typescript/src/integration/controllers/ConnectIntegration.ts`
- Create: `packages/api/typescript/src/integration/controllers/schemas.ts` (shared by all controllers — one place for the `ConnectIntegrationInput` discriminated union + every other I/O schema in this sub-plan).
- Create: `packages/api/typescript/src/integration/controllers/index.ts`

**Skills:** /usecase, /controller, /schema, /test
**Depends on:** Tasks 5, 6, 9, 10, 12, 13

Use case orchestration per spec §4 BC3 C21 + §7.3:

1. Look up `PlatformCredentialSchemas[type:platform]` — throw
   `PLATFORM_NOT_SUPPORTED` if missing.
2. If `mode === 'OAUTH'` → call
   `OAuthCodeExchanger.exchange({platform, code, redirectUri})` →
   `credentials`. Else validate `credentialFields` against the
   platform's Zod schema (throw `INVALID_CREDENTIAL_FIELDS`).
3. Call `HandshakeService.handshake({platform, credentials})` →
   `{externalId, displayName, discoveredAdAccountExternalIds?}`. On
   failure, raise `IntegrationHandshakeFailed` domain event and throw
   `INTEGRATION_HANDSHAKE_FAILED`.
4. Inside `UnitOfWork`:
   - `vault.seal(credentials)` → `{encryptionAlgorithm, encryptedPayload}`
   - `secret = IntegrationCredentialSecret.create({storeIntegrationId: TBD, ...})`
   - `integration = StoreIntegration.create({storeId, platform, externalId, displayName, ownerId})`
   - `integration.attachCredentialSecret(secret.id)` →
     `integration.markHandshakeSucceeded()` →
     `storeIntegrationRepository.save(integration)` →
     `integrationCredentialSecretRepository.save(secret)`
   - Persist all `integration.pullDomainEvents()` via
     `domainEventRepository.save(event, tx)` — `IntegrationConnectionInitiated`,
     `IntegrationHandshakeSucceeded`, `IntegrationActivated`.
5. Return `{ storeIntegrationId, externalId,
   marketingAdAccountsDiscovered: discoveredAdAccountExternalIds?.length ?? 0 }`.

`INTEGRATION_QUOTA_EXCEEDED` is gated by P3-BILLING's `PLAN_QUOTAS`
lookup against active-integration count for the owner's plan — leave a
`# QUESTION: depends on P3 — placeholder always passes` comment if P3
has not landed.

Controller mirrors `auth/controllers/GetSession.ts`:
`@injectable() class extends Controller<typeof ConnectIntegrationInputSchema,
typeof ConnectIntegrationOutputSchema>`, `path: '/connect' as
\`/${string}\``, `method: 'post'`, middlewares include
`AuthAccountMiddleware` + (if P2) `IntegrationStoreMembershipMiddleware`.

```typescript
// controllers/schemas.ts excerpt
export const ConnectIntegrationInputSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('OAUTH'),
    type: StoreIntegrationTypeSchema,
    platform: z.string(),
    displayName: z.string().optional(),
    oauthCode: z.string(),
    oauthRedirectUri: z.string().url(),
  }),
  z.object({
    mode: z.literal('DIRECT_CREDENTIALS'),
    type: StoreIntegrationTypeSchema,
    platform: z.string(),
    displayName: z.string().optional(),
    credentialFields: z.record(z.string(), z.string()),
  }),
])

export const ConnectIntegrationOutputSchema = z.object({
  storeIntegrationId: z.string().uuid(),
  externalId: z.string(),
  marketingAdAccountsDiscovered: z.number().int().nonnegative().optional(),
})
```

Use case test (`integration` driver): given a store, when
`connectIntegration` runs with valid Shopify direct credentials (and the
mock handshaker returns `externalId='foo.myshopify.com'`) → asserts a
`store_integrations` row, a `integration_credentials` row with non-empty
`encrypted_payload`, and three domain events on the outbox.

- [ ] Commit — `feat(integration): C21 ConnectIntegration usecase + controller (P4 Task 14)`.

---

## Task 15: `DisconnectIntegration` + `ToggleIntegrationActive` (C22, C25)

**Files:**
- Create: `packages/api/typescript/src/integration/usecases/DisconnectIntegration.ts`
- Create: `packages/api/typescript/src/integration/usecases/DisconnectIntegration.test.ts`
- Create: `packages/api/typescript/src/integration/usecases/ToggleIntegrationActive.ts`
- Create: `packages/api/typescript/src/integration/usecases/ToggleIntegrationActive.test.ts`
- Create: `packages/api/typescript/src/integration/controllers/DisconnectIntegration.ts`
- Create: `packages/api/typescript/src/integration/controllers/ToggleIntegrationActive.ts`
- Extend: `packages/api/typescript/src/integration/controllers/schemas.ts`

**Skills:** /usecase, /controller
**Depends on:** Task 14

**C22**: load → `.disconnect()` (throws
`STORE_INTEGRATION_ALREADY_DISCONNECTED` if applicable) → persist +
emit `IntegrationDisconnected` + `IntegrationDeactivated`. If
`wipeData=true`, also emit `StoreIntegrationDataWipeRequested` (handled
by Task 13's internal handler).

**C25**: load → `.toggleActive(active)` → persist + emit
`IntegrationActiveToggled`.

- [ ] Tests assert row updated + events on outbox + cascade-wipe event
  only when `wipeData=true`.
- [ ] Commit — `feat(integration): C22 Disconnect + C25 ToggleIntegrationActive (P4 Task 15)`.

---

## Task 16: `TriggerReintegration` + `TriggerReintegrationAll` (C23, C24) + rate limiter

**Files:**
- Create: `packages/api/typescript/src/integration/usecases/TriggerReintegration.ts`
- Create: `packages/api/typescript/src/integration/usecases/TriggerReintegration.test.ts`
- Create: `packages/api/typescript/src/integration/usecases/TriggerReintegrationAll.ts`
- Create: `packages/api/typescript/src/integration/usecases/TriggerReintegrationAll.test.ts`
- Create: `packages/api/typescript/src/integration/controllers/TriggerReintegration.ts`
- Create: `packages/api/typescript/src/integration/controllers/TriggerReintegrationAll.ts`
- Create: `packages/api/typescript/src/integration/services/ReintegrationRateLimiter/ReintegrationRateLimiter.ts` (abstract — in-memory `Map<storeIntegrationId, lastTriggeredAt>` with `windowMs=5min`)
- Create: `packages/api/typescript/src/integration/services/ReintegrationRateLimiter/InMemoryReintegrationRateLimiter.ts`
- Create: `packages/api/typescript/src/integration/services/ReintegrationRateLimiter/MockReintegrationRateLimiter.ts`

**Skills:** /usecase, /controller, /service
**Depends on:** Tasks 5, 6, 10, 12

**Note**: the rate limiter is **in-memory** (single replica). A future
iteration can swap in a Redis-backed implementation by adding a binding
to `INSTANCE_REGISTRY` — interface stays the same. This avoids
introducing a new DB table not present in `contracts/db/schema/`.

**C23**:
1. Load `StoreIntegration` (`STORE_INTEGRATION_NOT_FOUND`); throw
   `STORE_INTEGRATION_INACTIVE` if `active=false`.
2. `rateLimiter.checkAndStamp(storeIntegrationId, windowMs=5*60*1000)`
   → throws `REINTEGRATION_RATE_LIMITED` if last < 5min ago.
3. Load `IntegrationCredentialSecret` by `findByStoreIntegrationId`
   (throw `STORE_INTEGRATION_CREDENTIAL_NOT_FOUND`); decrypt via
   `CredentialVault.open(...)` (throws
   `STORE_INTEGRATION_CREDENTIAL_DECRYPT_FAILED` on AEAD failure).
4. `goWorkerClient.requestSync({...})`.
5. `integration.markReintegrationTriggered()` → persist + emit
   `ReintegrationTriggered`. Return void (202 Accepted).

**C24**:
1. Load all active `StoreIntegration`s for the current `storeId`.
2. Emit `ReintegrationBatchRequested { storeId, integrationIds[] }`.
3. **Inline** iteration over each id (per spec note in §7.3 + the prior
   plan's Decision): call `TriggerReintegration` per id, catch
   `REINTEGRATION_RATE_LIMITED` into the `skipped[]` accumulator.
4. Return `{ triggered, skipped }`.

The `ReintegrationBatchHandler` from Task 13 stays for audit
symmetry but does not duplicate the iteration — only the domain event
is fanned.

- [ ] Tests cover success + rate-limit + decrypt-fail + go-worker-5xx
  paths.
- [ ] Commit — `feat(integration): C23 TriggerReintegration + C24 TriggerReintegrationAll + in-memory rate limiter (P4 Task 16)`.

---

## Task 17: `IntegrationsList` + `IntegrationDetail` reads (T11, T12) + `CredentialFieldMasker`

**Files:**
- Create: `packages/api/typescript/src/integration/usecases/IntegrationsListQuery.ts`
- Create: `packages/api/typescript/src/integration/usecases/IntegrationsListQuery.test.ts`
- Create: `packages/api/typescript/src/integration/usecases/IntegrationDetailQuery.ts`
- Create: `packages/api/typescript/src/integration/usecases/IntegrationDetailQuery.test.ts`
- Create: `packages/api/typescript/src/integration/controllers/IntegrationsList.ts`
- Create: `packages/api/typescript/src/integration/controllers/IntegrationDetail.ts`
- Create: `packages/api/typescript/src/integration/services/CredentialFieldMasker.ts`
- Create: `packages/api/typescript/src/integration/services/CredentialFieldMasker.test.ts`

**Skills:** /query, /controller
**Depends on:** Tasks 9, 10, 11

**T11**: BFF-style direct Drizzle SELECT joining `store_integrations`
filtered by current `storeId` (+ optional `type`), ordered by
`connected_at DESC`. Returns the items shape from spec §7.3 T11.

**T12**: loads `StoreIntegration` + `IntegrationCredentialSecret`,
decrypts via `CredentialVault.open`, runs through
`CredentialFieldMasker.mask(credentials, fields)` to mask
`PASSWORD`/`OAUTH_TOKEN` fields (`"sk_live_••••4f2a"` — last 4 chars
preserved) while keeping `TEXT` fields visible. Loads
`MarketingAdAccount[]` when `type=MARKETING_PLATFORM`. Returns the full
DTO per spec §7.3 T12.

`CredentialFieldMasker` consults `PlatformCredentialSchemas[...].fields`
(from Task 9) to know which keys to mask.

- [ ] Tests assert filter by type, ordering, masking irreversibility,
  and that marketing accounts are only attached when type matches.
- [ ] Commit — `feat(integration): T11 IntegrationsList + T12 IntegrationDetail queries + CredentialFieldMasker (P4 Task 17)`.

---

## Task 18: BC3 wiring (registry + index + middleware + main router)

**Files:**
- Create: `packages/api/typescript/src/integration/registry.ts`
- Create: `packages/api/typescript/src/integration/index.ts`
- Create: `packages/api/typescript/src/integration/middlewares/IntegrationStoreMembershipMiddleware.ts`
- Create: `packages/api/typescript/src/integration/middlewares/index.ts`
- Modify: `packages/api/typescript/src/index.ts` — import + register
  `IntegrationRouter` alongside `AuthRouter`, `NotificationsRouter`,
  `UIRouter`.

**Skills:** /bounded-context, /middleware
**Depends on:** Tasks 1–17

`registry.ts` follows
`packages/api/typescript/src/auth/registry.ts` shape — side-effect import
of `./errors` at top, three bindings (`mock` | `integration` | `real`)
for each repository + service. `CredentialVault` is `MockCredentialVault`
for `mock` / `integration`, `AesCredentialVault` for `real`.
`HandshakeService`, `OAuthCodeExchanger`, `GoWorkerClient`, and
`ReintegrationRateLimiter` are mock-bound for `mock` / `integration`,
HTTP/in-memory-bound for `real`.

`index.ts`:

```typescript
import { BoundedContext } from '@template/core-typescript'
import * as controllers from './controllers'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'
import { INSTANCE_REGISTRY } from './registry'

const ctx = await BoundedContext.create({
  name: 'integration',
  controllers,
  internalHandlers,
  externalHandlers,
  registry: INSTANCE_REGISTRY,
})

export default ctx.router
```

`IntegrationStoreMembershipMiddleware`:
`@singleton() class implements Middleware` — reads
`ctx.session.userId` (set by `AuthAccountMiddleware`), resolves
`storeId` from request URL params or body, calls
`StoreMembershipRepository.findByUserIdAndStoreId(...)`, throws
`FORBIDDEN` if no membership. **If P2-TENANCY has not landed**, the
middleware is a no-op stub with a `# QUESTION: depends on P2` comment.

- [ ] Commit — `feat(integration): bounded context wiring + registry + membership middleware (P4 Task 18)`.

---

## Task 19: SDK regen + OpenAPI emit + BC3 lifecycle flow test

**Files:**
- Regen: `packages/api/typescript/public/docs/openapi.json` (or
  whichever path `emit-openapi` writes to — verify with the existing
  `bun emit-openapi` output).
- Regen: `packages/client/dist/**` (or the SDK generator's output dir).
- Create: `packages/api/typescript/tests/flows/integration-shopify-lifecycle.test.ts`

**Skills:** /sdk, /test
**Depends on:** Task 18

Steps:

- [ ] `bun emit-openapi` — expect 7 new endpoints under
  `/v1/integration/*` (connect, disconnect, trigger-reintegration,
  trigger-reintegration-all, toggle-active, list, detail).
- [ ] `bun sdk` — frontend `bun tsc` stays green.
- [ ] Write the flow test (`mock` driver):
  1. Given a `User` + `Store` (use P1/P2 `given.*` helpers — if absent,
     stub manually with `# QUESTION: depends on P1/P2 fixtures`).
  2. `connectIntegration({mode:'DIRECT_CREDENTIALS', type:'SALES_CHANNEL',
     platform:'SHOPIFY', credentialFields:{shopDomain:'foo.myshopify.com',
     accessToken:'shpat_dummytoken'}})` — `MockHandshakeService` returns
     `externalId='foo.myshopify.com', displayName='Foo Store'`.
  3. Assert `IntegrationsListQuery` returns 1 item with `valid=true,
     active=true`.
  4. Assert `domainEventRepository` outbox contains
     `IntegrationConnectionInitiated`,
     `IntegrationHandshakeSucceeded`, `IntegrationActivated`.
  5. `disconnectIntegration({storeIntegrationId, wipeData:true})`.
  6. Assert outbox contains `IntegrationDisconnected`,
     `IntegrationDeactivated`, `StoreIntegrationDataWipeRequested`.
  7. Assert `IntegrationsListQuery` row has `disconnectedAt != null`.
- [ ] Commit — `feat(integration): SDK regen + BC3 lifecycle flow test (P4 Task 19)`.

---

## Final Validation

- [ ] `bun tsc` — 0 errors across all workspaces.
- [ ] `bun lint` — 0 errors.
- [ ] `bun test affected --base=dev` — every BC3 test green; 0 skipped.
- [ ] `bun emit-openapi` produces 7 BC3 endpoints under
  `/v1/integration/*`; `bun sdk` regenerates cleanly.
- [ ] AC mapping (every spec §7.3 command/read → ≥1 test):
  - **C21 ConnectIntegration** →
    `usecases/ConnectIntegration.test.ts` (happy path + each error
    code: `PLATFORM_NOT_SUPPORTED`, `INVALID_CREDENTIAL_FIELDS`,
    `OAUTH_CODE_INVALID`, `INTEGRATION_HANDSHAKE_FAILED`) +
    `tests/flows/integration-shopify-lifecycle.test.ts`.
  - **C22 DisconnectIntegration** →
    `usecases/DisconnectIntegration.test.ts` + flow.
  - **C23 TriggerReintegration** →
    `usecases/TriggerReintegration.test.ts` (happy +
    `STORE_INTEGRATION_INACTIVE` + `REINTEGRATION_RATE_LIMITED` +
    `STORE_INTEGRATION_CREDENTIAL_DECRYPT_FAILED` +
    `STORE_INTEGRATION_GO_WORKER_UNREACHABLE`).
  - **C24 TriggerReintegrationAll** →
    `usecases/TriggerReintegrationAll.test.ts` (triggered + skipped
    populated correctly).
  - **C25 ToggleIntegrationActive** →
    `usecases/ToggleIntegrationActive.test.ts` (both true/false
    transitions).
  - **T11 IntegrationsList** →
    `usecases/IntegrationsListQuery.test.ts` (filter by type + ordering).
  - **T12 IntegrationDetail** →
    `usecases/IntegrationDetailQuery.test.ts` (marketing accounts
    attached when MARKETING_PLATFORM only, masking applied).
- [ ] Per spec BC3 published-events checklist (all 10 in-process domain
  events raised at least once across the suite):
  - `IntegrationConnectionInitiated` ✓ (C21)
  - `IntegrationHandshakeSucceeded` ✓ (C21 success)
  - `IntegrationHandshakeFailed` ✓ (C21 failure)
  - `IntegrationActivated` ✓ (C21)
  - `IntegrationDeactivated` ✓ (C22, C25-off)
  - `IntegrationDisconnected` ✓ (C22)
  - `IntegrationActiveToggled` ✓ (C25)
  - `ReintegrationTriggered` ✓ (C23, per-id in C24)
  - `ReintegrationBatchRequested` ✓ (C24)
  - `StoreIntegrationDataWipeRequested` ✓ (C22 + wipeData=true)
- [ ] Cross-service integration events consumed (verified via mocked
  external handlers in `IntegrationHandshakeSucceededExternalHandler.test.ts`):
  - `integration.shared.integration.handshake_succeeded`
  - `integration.shared.integration.handshake_failed`
  - `integration.shared.integration.last_sync_updated`
  - `integration.shared.integration.progress_updated` (forwarded /
    no-op for now)
  - `integration.shared.marketing_ad_account.discovered`

---

## Dependencies & coordination footer

**Upstream sub-plans this depends on:**
- **iter 41 / contracts/wire** — `StoreIntegrationType`, `SalesPlatform`,
  `CheckoutPlatform`, `PaymentGatewayPlatform`, `MarketingPlatform`,
  `IntegrationCredentialFieldType` enums; the 5 integration events
  consumed in Task 13. ✅ landed.
- **iter 42 / contracts/db** — `integration.store_integrations`,
  `integration.integration_credentials`,
  `integration.marketing_ad_accounts` tables. ✅ landed.
- **P1-IDENTITY** — `AuthAccountMiddleware` providing
  `ctx.session.userId`; `User` entity for tests.
- **P2-TENANCY** — `Store` entity, `StoreMembershipRepository`,
  `given.store(...)` fixtures. If absent: membership middleware no-ops
  + tests stub manually.
- **P3-BILLING** — soft for `INTEGRATION_QUOTA_EXCEEDED`. If absent:
  gate is open.

**Downstream consumers:**
- **PG-GO-WORKER** — receives Task 12's `POST /sync` HTTP calls
  (plaintext credentials in request body); publishes the 5
  `integration.shared.*` events consumed in Task 13.
- **P5-CATALOG / P6-SALES / P7-MARKETING / P8-TRACKING** — subscribe to
  the in-process `StoreIntegrationDataWipeRequested` domain event for
  cascade-delete of their canonical projections.
- **P10-NOTIFICATIONS** — subscribes to
  `integration.shared.integration.handshake_failed` (contracts/wire,
  already authored) for user notifications.
- **P11-ANALYTICS** — reads `IntegrationsListQuery` (T11) for the
  integrations health dashboard.

**Coordination notes:**
- TS owns credentials end-to-end. Plaintext NEVER leaves TS except in
  the request body of the server-to-server `POST /sync` to the Go
  worker (Task 12), which is mTLS / private-network gated by
  `Config.env.GO_WORKER_AUTH_TOKEN`.
- The Go worker MUST NOT receive credentials over Redis Streams — the 5
  cross-service `integration.shared.*` events carry `providerExternalId` /
  `storeIntegrationExternalId` only, never credential fields.
- The Go worker's previous `/integrations/handshake` endpoint is
  REMOVED; TS performs the connection-test itself (Task 9).
- The 5 contracts/wire integration events catalogued in iter 41 are
  Go-published / TS-consumed. This sub-plan publishes them on the
  Go side (covered by PG-GO-WORKER) and consumes them via the external
  handlers in Task 13.
- `StoreIntegrationDataWipeRequested` is published as an **in-process**
  domain event (handled by internal subscribers in P5..P8); it is NOT
  added to the contracts/wire catalog (see QUESTION above) — if a
  cross-service consumer ever needs it, iter 41 owners promote it to a
  TypeSpec event and this sub-plan's internal handler is upgraded to
  also publish via `ExternalMediator`.

---

## Notes

- **Folder caveat (resolved)**: this sub-plan lands BC3 flat under
  `packages/api/typescript/src/integration/` — matching the polyglot
  template's existing `packages/api/typescript/src/{auth,notifications,ui}/`
  layout. The previous iteration's `src/contexts/integration/` path
  (inherited from the medscall fork) is dropped.
- **Per-platform extensibility**: spec §"Provider Extensibility" promises
  "mapper + schema + enum value — no domain change". Adding a new
  platform after this sub-plan requires: (a) add the entry to
  `PlatformCredentialSchemas.ts` (Task 9), (b) add a
  `<Platform>Handshaker.ts` + `<Platform>OAuthCodeExchanger.ts` to
  `services/`, (c) wire them in `registry.ts`. No new entity, no new use
  case, no new controller, no new event. (Per-platform Go sync mapper +
  webhook verifier lives on PG-GO-WORKER, out of scope here.)
- **TriggerReintegrationAll design**: spec C24 says "a handler iterates"
  — implementation inlines the iteration in the use case (Task 16) so
  the controller returns accurate `triggered`/`skipped` counts
  synchronously. The `ReintegrationBatchHandler` (Task 13) is kept for
  audit / symmetry but only fans the domain event.
- **Rate limiter scope**: in-memory single-replica (Task 16). A
  multi-replica deployment needs a Redis-backed implementation — swap
  by adding a binding in `INSTANCE_REGISTRY`. Interface unchanged.
- **Cross-language testing**: Task 1's TS golden assertion against the
  Go-computed UUIDv5 is the contract enforcement. If the Go side's
  implementation drifts (e.g. someone reverts to SHA-256), the TS test
  fails — and vice versa.
- **`/task-breakdown` overlay**: this sub-plan crosses 1 BC + 2
  core-typescript additions + 1 Go-side correction + 5 consumed
  contracts/wire events + ~30 files. Phase + Wave annotation at the top
  satisfies the overlay.
- **Graph CLI** (`bun scripts/graph/cli/index.ts validate-plan`) is
  broken per master-plan caveat #2 — skip for this sub-plan and rely on
  per-task TDD cycles + the BC3 lifecycle flow test (Task 19) as the
  validation harness.
- **`bun review` cascade** at the end will report CASCADE wins because
  TestBed-driven test files share the same `given.*` helpers. Defer
  those cleanups to PR-REVIEW unless they're HIGH severity.
