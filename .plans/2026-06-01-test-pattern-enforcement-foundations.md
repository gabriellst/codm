# Test Pattern Enforcement — Foundations (Plan A) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`) syntax for tracking.
> Each Task wraps one observable behavior in an outer RED→GREEN cycle.

**Goal:** Build the canonical test primitives, given-helpers, skill/registry rules, and CLI test scaffold so every future backend test has one documented, scaffoldable, primitive-backed form — leaving no bad neighbour to copy.

**Architecture:** Three reusable primitives in `tests/support/` (`testId`, `givenDomainEvent`, `FakeFetch`) + new domain `given*` helpers (identity/billing/sales) remove the need for casts, inline seeds, and hardcoded UUIDs. The `/test` skill codifies 10 new rules (`bp-17..26`) + 2 patterns (`TST-17/18`). The `bun cli` scaffolder gains test snippets so `usecase`/`repository`/`handler`/`query` co-emit a canonical `.test.ts`, plus `bun cli test`/`bun cli given` verbs. No production code, no migrations, no SDK — this plan only builds the infra; the 168-file sweep is Plan B.

**Tech Stack:** TypeScript, Bun, bun:test, Drizzle (PGlite), tsyringe-neo, Zod

**Spec:** `.specs/2026-06-01-test-pattern-enforcement-design.md`
**Tasks:** 9
**Estimated minutes:** 300

---

## Task T1: Test author gets a collision-free identifier without hardcoding a UUID

Closes bp-18 by giving authors `testId()` instead of `'aaaaaaaa-0001-…'` literals.

**Files to write:**
- Create: `packages/api/typescript/tests/support/ids.ts`
- Test: `packages/api/typescript/tests/support/ids.test.ts`

**Files to read:**
- `packages/api/typescript/core/src/objects/Id.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** (none)

### Step T1.1 — Write the failing test

```typescript
// packages/api/typescript/tests/support/ids.test.ts
import { describe, expect, it } from 'bun:test'
import { testId } from './ids'

describe('testId', () => {
  it('is deterministic for the same segments', () => {
    expect(testId('store', 'a')).toBe(testId('store', 'a'))
  })

  it('differs for different segments', () => {
    expect(testId('store', 'a')).not.toBe(testId('store', 'b'))
  })

  it('returns a random UUID when called with no segments', () => {
    expect(testId()).not.toBe(testId())
  })

  it('produces a canonical UUID string', () => {
    expect(testId('order', '1')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})
```

### Step T1.2 — Run test to verify it fails

Run: `cd packages/api/typescript && bun test tests/support/ids.test.ts`
Expected: FAIL with `Cannot find module './ids'`

### Step T1.3 — Write minimal implementation

```typescript
// packages/api/typescript/tests/support/ids.ts
// Canonical test-identifier factory. Replaces hardcoded UUID literals (bp-18).
// Deterministic ids share the project's locked BK_DASH_NAMESPACE via Id.fromSeed,
// so a named fixture is stable across runs; pass no segments for a random id.
import { Id } from '@template/core-typescript'

/**
 * `testId('store', 'a')` → deterministic UUIDv5 for that tuple (stable across runs).
 * `testId()`             → fresh random UUIDv7 (for not-found / uniqueness cases).
 */
export function testId(...segments: string[]): string {
  return segments.length === 0 ? Id.value() : Id.fromSeed(...segments).value
}
```

### Step T1.4 — Run test to verify it passes

Run: `cd packages/api/typescript && bun test tests/support/ids.test.ts`
Expected: PASS — 4 tests pass

### Step T1.5 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors

### Step T1.6 — Commit

```bash
git add packages/api/typescript/tests/support/ids.ts packages/api/typescript/tests/support/ids.test.ts
git commit -m "test(support): add testId factory — canonical test identifiers (Task T1)"
```

---

## Task T2: Test author seeds a persisted domain event without an inline seed fn

Closes the event-as-data gap (the `seedCreated/seedPaid` shape in `ListSubscriptionEventHistory`). Distinct from `bp-16` `givenEvent` (outbox/cross-process) — this persists a real event row via the typed repository for query-over-events use cases.

**Files to write:**
- Create: `packages/api/typescript/tests/support/given/events.ts`
- Test: `packages/api/typescript/tests/support/given/events.test.ts`

**Files to read:**
- `packages/api/typescript/core/src/repositories/DomainEventRepository.ts`
- `packages/api/typescript/src/billing/events/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** (none)

### Step T2.1 — Write the failing test

```typescript
// packages/api/typescript/tests/support/given/events.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { DomainEventRepository } from '@template/core-typescript'
import { BillingPlatform, PlanPeriod, PlanTier } from '@template/contracts-typescript/wire/enums'
import { SubscriptionCreatedEvent } from '@billing/events'
import { TestBed } from '../TestBed'
import { givenDomainEvent } from './events'
import { testId } from '../ids'

describe('givenDomainEvent', () => {
  let testBed: TestBed
  let testContainer: DependencyContainer

  beforeAll(async () => {
    testContainer = container.createChildContainer()
    testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
  })
  beforeEach(async () => { await testBed.reset() })
  afterAll(async () => { await testBed.destroy() })

  it('persists a domain event readable via findByType', async () => {
    const ownerId = testId('user', '1')
    await givenDomainEvent(
      testBed,
      new SubscriptionCreatedEvent({
        entityId: testId('subscription', '1'),
        ownerId,
        payload: {
          externalId: 'ext-1',
          platform: BillingPlatform.KIWIFY,
          tier: PlanTier.BASIC,
          userId: ownerId,
          period: PlanPeriod.MONTHLY,
        },
      }),
    )

    const events = testBed.resolve(DomainEventRepository)
    const found = await events.findByType(SubscriptionCreatedEvent)
    expect(found).toHaveLength(1)
    expect(found[0]!.payload.platform).toBe(BillingPlatform.KIWIFY)
  })
})
```

### Step T2.2 — Run test to verify it fails

Run: `cd packages/api/typescript && bun test tests/support/given/events.test.ts`
Expected: FAIL with `Cannot find module './events'`

### Step T2.3 — Write minimal implementation

```typescript
// packages/api/typescript/tests/support/given/events.ts
// Seed a persisted domain event for query-over-events use cases (e.g. billing's
// ListSubscriptionEventHistory reads the events table as its read-model).
// This is repo-direct (never the outbox / givenEvent — that's bp-16, cross-process only).
// NOTE: events carry no createdAt; the table assigns it at insert. For ordering,
// assert set membership/count — do NOT setTimeout between saves (bp-22).
import type { BaseDomainEvent } from '@template/core-typescript'
import { DomainEventRepository } from '@template/core-typescript'
import type { TestBed } from '../TestBed'

export async function givenDomainEvent(testBed: TestBed, event: BaseDomainEvent): Promise<void> {
  await testBed.resolve(DomainEventRepository).save(event)
}
```

### Step T2.4 — Run test to verify it passes

Run: `cd packages/api/typescript && bun test tests/support/given/events.test.ts`
Expected: PASS — 1 test passes

### Step T2.5 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors

### Step T2.6 — Commit

```bash
git add packages/api/typescript/tests/support/given/events.ts packages/api/typescript/tests/support/given/events.test.ts
git commit -m "test(support): add givenDomainEvent — seed persisted events without inline seed fns (Task T2)"
```

---

## Task T3: Test author stubs an HTTP collaborator with a typed fake, not a cast

Closes bp-20. The single `as unknown as typeof fetch` cast lives once inside the fake (mirroring `TestBed.override`'s centralized `as any`); consumers get a `FetchStub`-typed value and never cast.

**Files to write:**
- Create: `packages/api/typescript/tests/support/fakes/FakeFetch.ts`
- Test: `packages/api/typescript/tests/support/fakes/FakeFetch.test.ts`

**Files to read:**
- `packages/api/typescript/src/integration/services/shopify/ShopifyHandshaker.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** (none)

### Step T3.1 — Write the failing test

```typescript
// packages/api/typescript/tests/support/fakes/FakeFetch.test.ts
import { describe, expect, it } from 'bun:test'
import { createFakeFetch, jsonResponse } from './FakeFetch'

describe('createFakeFetch', () => {
  it('routes by url fragment and captures calls', async () => {
    const { fetch, calls } = createFakeFetch({
      routes: { '/shop.json': () => jsonResponse({ shop: { myshopify_domain: 'foo.myshopify.com' } }) },
    })

    const res = await fetch('https://foo.myshopify.com/admin/api/2024-04/shop.json')
    const body = (await res.json()) as { shop: { myshopify_domain: string } }

    expect(body.shop.myshopify_domain).toBe('foo.myshopify.com')
    expect(calls[0]!.url).toContain('/shop.json')
  })

  it('falls back to default and supports non-2xx', async () => {
    const { fetch } = createFakeFetch({ default: () => jsonResponse({ errors: 'unauthorized' }, { status: 401 }) })
    const res = await fetch('https://x/y')
    expect(res.status).toBe(401)
  })
})
```

### Step T3.2 — Run test to verify it fails

Run: `cd packages/api/typescript && bun test tests/support/fakes/FakeFetch.test.ts`
Expected: FAIL with `Cannot find module './FakeFetch'`

### Step T3.3 — Write minimal implementation

```typescript
// packages/api/typescript/tests/support/fakes/FakeFetch.ts
// Typed fetch fake for services that take `fetchFn: typeof fetch` (bp-20).
// The ONE `as unknown as typeof fetch` cast (tsyringe-style centralization) lives
// here so test files never cast. Match a URL fragment to a Response factory.
export type FetchStub = typeof fetch

export interface FakeFetchCall {
  url: string
  init?: RequestInit
}

export interface FakeFetchOptions {
  /** url-substring → Response factory; first match wins */
  routes?: Record<string, () => Response>
  /** used when no route matches; defaults to an empty 200 JSON body */
  default?: () => Response
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

export function createFakeFetch(opts: FakeFetchOptions = {}): { fetch: FetchStub; calls: FakeFetchCall[] } {
  const calls: FakeFetchCall[] = []
  const impl = async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    calls.push({ url, init })
    for (const [fragment, make] of Object.entries(opts.routes ?? {})) {
      if (url.includes(fragment)) return make()
    }
    return (opts.default ?? (() => jsonResponse({})))()
  }
  // Centralized cast — the reason this fake exists (bp-20). Tests never cast.
  return { fetch: impl as unknown as FetchStub, calls }
}
```

### Step T3.4 — Run test to verify it passes

Run: `cd packages/api/typescript && bun test tests/support/fakes/FakeFetch.test.ts`
Expected: PASS — 2 tests pass

### Step T3.5 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors

### Step T3.6 — Commit

```bash
git add packages/api/typescript/tests/support/fakes/FakeFetch.ts packages/api/typescript/tests/support/fakes/FakeFetch.test.ts
git commit -m "test(support): add typed FakeFetch — kill as-unknown-as-typeof-fetch casts (Task T3)"
```

---

## Task T4: Identity tests seed users/profiles/tokens via shared given-helpers (kill seedAuthUser ×8)

Closes bp-17 for identity — the single biggest cluster (`seedAuthUser` copy-pasted across 8 files).

**Files to write:**
- Create: `packages/api/typescript/tests/support/given/identity.ts`
- Test: `packages/api/typescript/tests/support/given/identity.test.ts`

**Files to read:**
- `packages/api/typescript/tests/support/given/users.ts`
- `packages/api/typescript/src/identity/entities/UserProfile.ts`
- `packages/api/typescript/src/identity/entities/UserPreferences.ts`
- `packages/api/typescript/src/identity/entities/FcmRegistrationToken.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T1

### Step T4.1 — Write the failing test (smoke: each helper persists + is retrievable)

```typescript
// packages/api/typescript/tests/support/given/identity.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { FcmPlatform } from '@template/contracts-typescript/wire/enums'
import { UserProfileRepository } from '@identity/repositories/UserProfileRepository'
import { FcmRegistrationTokenRepository } from '@identity/repositories/FcmRegistrationTokenRepository'
import { TestBed } from '../TestBed'
import { givenUserProfile, givenFcmRegistrationToken } from './identity'

describe('identity given-helpers', () => {
  let testBed: TestBed
  let testContainer: DependencyContainer

  beforeAll(async () => {
    testContainer = container.createChildContainer()
    testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
  })
  beforeEach(async () => { await testBed.reset() })
  afterAll(async () => { await testBed.destroy() })

  it('givenUserProfile creates a user + profile retrievable by id', async () => {
    const profile = await givenUserProfile(testBed)
    const found = await testBed.resolve(UserProfileRepository).findByUserId(profile.userId.value)
    expect(found?.userId.value).toBe(profile.userId.value)
  })

  it('givenFcmRegistrationToken persists a token for a user', async () => {
    const { token } = await givenFcmRegistrationToken(testBed, { platform: FcmPlatform.IOS })
    const found = await testBed.resolve(FcmRegistrationTokenRepository).findByToken(token.token)
    expect(found?.platform).toBe(FcmPlatform.IOS)
  })
})
```

> **Note for implementer:** confirm the exact finder names on each repo (`findByUserId`, `findByToken`) from the repository port before finalizing the test; if a needed finder is missing, that is a repository gap to surface — do NOT resolve `DrizzleClient` to hand-query (bp-15).

### Step T4.2 — Run test to verify it fails

Run: `cd packages/api/typescript && bun test tests/support/given/identity.test.ts`
Expected: FAIL with `Cannot find module './identity'`

### Step T4.3 — Write minimal implementation

```typescript
// packages/api/typescript/tests/support/given/identity.ts
// Identity given-helpers — repo-direct, compose givenUser for FK satisfaction.
// Replaces the per-file `seedAuthUser` duplicated across 8 identity test files (bp-17).
import type { TestBed } from '../TestBed'
import { FcmPlatform } from '@template/contracts-typescript/wire/enums'
import { UserProfile } from '@identity/entities/UserProfile'
import { UserPreferences } from '@identity/entities/UserPreferences'
import { FcmRegistrationToken } from '@identity/entities/FcmRegistrationToken'
import { UserProfileRepository } from '@identity/repositories/UserProfileRepository'
import { UserPreferencesRepository } from '@identity/repositories/UserPreferencesRepository'
import { FcmRegistrationTokenRepository } from '@identity/repositories/FcmRegistrationTokenRepository'
import { givenUser } from './users'
import { uniqueId } from './sequence'

async function resolveUserId(testBed: TestBed, userId?: string): Promise<string> {
  if (userId) return userId
  const user = await givenUser(testBed)
  return user.id.value
}

export async function givenUserProfile(
  testBed: TestBed,
  overrides: Partial<{ userId: string; timezone: string; language: string; brazilianTaxId: string }> = {},
): Promise<UserProfile> {
  const userId = await resolveUserId(testBed, overrides.userId)
  const profile = UserProfile.create({
    userId,
    timezone: overrides.timezone,
    language: overrides.language,
    brazilianTaxId: overrides.brazilianTaxId,
  })
  return testBed.resolve(UserProfileRepository).save(profile)
}

export async function givenUserPreferences(
  testBed: TestBed,
  overrides: Partial<{ userId: string }> = {},
): Promise<UserPreferences> {
  const userId = await resolveUserId(testBed, overrides.userId)
  const prefs = UserPreferences.createDefault({ userId })
  return testBed.resolve(UserPreferencesRepository).save(prefs)
}

export async function givenFcmRegistrationToken(
  testBed: TestBed,
  overrides: Partial<{ userId: string; token: string; platform: FcmPlatform }> = {},
): Promise<{ token: FcmRegistrationToken; userId: string }> {
  const userId = await resolveUserId(testBed, overrides.userId)
  const token = FcmRegistrationToken.create({
    userId,
    token: overrides.token ?? `fcm-token-${uniqueId()}`,
    platform: overrides.platform ?? FcmPlatform.ANDROID,
  })
  const saved = await testBed.resolve(FcmRegistrationTokenRepository).save(token)
  return { token: saved, userId }
}
```

> **Note for implementer:** match each entity's actual `.create(...)` parameter object exactly (verified during planning: `UserProfile.create({userId, timezone?, language?, brazilianTaxId?, leadToken?})`, `UserPreferences.createDefault({userId})`, `FcmRegistrationToken.create({userId, token, platform})`). If a repo `save` returns `void` rather than the entity, return the local instance instead.

### Step T4.4 — Run test to verify it passes

Run: `cd packages/api/typescript && bun test tests/support/given/identity.test.ts`
Expected: PASS — 2 tests pass

### Step T4.5 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors

### Step T4.6 — Commit

```bash
git add packages/api/typescript/tests/support/given/identity.ts packages/api/typescript/tests/support/given/identity.test.ts
git commit -m "test(support): add identity given-helpers (Task T4)"
```

---

## Task T5: Billing tests seed subscriptions + subscription events via shared helpers

Closes bp-17 for billing; provides the helper `ListSubscriptionEventHistory` should use instead of inline `seedCreated/seedPaid`.

**Files to write:**
- Create: `packages/api/typescript/tests/support/given/billing.ts`
- Test: `packages/api/typescript/tests/support/given/billing.test.ts`

**Files to read:**
- `packages/api/typescript/src/billing/entities/Subscription.ts`
- `packages/api/typescript/src/billing/repositories/SubscriptionRepository/SubscriptionRepository.ts`
- `packages/api/typescript/tests/support/given/events.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T1, T2

### Step T5.1 — Write the failing test

```typescript
// packages/api/typescript/tests/support/given/billing.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { BillingPlatform, PlanTier } from '@template/contracts-typescript/wire/enums'
import { SubscriptionRepository } from '@billing/repositories/SubscriptionRepository'
import { TestBed } from '../TestBed'
import { givenSubscription } from './billing'

describe('billing given-helpers', () => {
  let testBed: TestBed
  let testContainer: DependencyContainer

  beforeAll(async () => {
    testContainer = container.createChildContainer()
    testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
  })
  beforeEach(async () => { await testBed.reset() })
  afterAll(async () => { await testBed.destroy() })

  it('givenSubscription persists a retrievable subscription', async () => {
    const sub = await givenSubscription(testBed, { tier: PlanTier.BASIC, platform: BillingPlatform.KIWIFY })
    const found = await testBed.resolve(SubscriptionRepository).findById(sub.id.value)
    expect(found?.tier).toBe(PlanTier.BASIC)
  })
})
```

### Step T5.2 — Run test to verify it fails

Run: `cd packages/api/typescript && bun test tests/support/given/billing.test.ts`
Expected: FAIL with `Cannot find module './billing'`

### Step T5.3 — Write minimal implementation

```typescript
// packages/api/typescript/tests/support/given/billing.ts
// Billing given-helpers — repo-direct. Compose givenUser for the subscription owner.
import type { TestBed } from '../TestBed'
import { BillingPlatform, PlanPeriod, PlanTier } from '@template/contracts-typescript/wire/enums'
import { Subscription } from '@billing/entities/Subscription'
import { SubscriptionRepository } from '@billing/repositories/SubscriptionRepository'
import { givenUser } from './users'
import { uniqueId } from './sequence'

export async function givenSubscription(
  testBed: TestBed,
  overrides: Partial<{
    userId: string
    platform: BillingPlatform
    externalSubscriptionId: string
    tier: PlanTier
    period: PlanPeriod
    occurredAt: Date
  }> = {},
): Promise<Subscription> {
  const userId = overrides.userId ?? (await givenUser(testBed)).id.value
  const sub = Subscription.create({
    userId,
    platform: overrides.platform ?? BillingPlatform.KIWIFY,
    externalSubscriptionId: overrides.externalSubscriptionId ?? `ext-sub-${uniqueId()}`,
    tier: overrides.tier ?? PlanTier.BASIC,
    period: overrides.period ?? PlanPeriod.MONTHLY,
    occurredAt: overrides.occurredAt,
  })
  return testBed.resolve(SubscriptionRepository).save(sub)
}
```

### Step T5.4 — Run test to verify it passes

Run: `cd packages/api/typescript && bun test tests/support/given/billing.test.ts`
Expected: PASS — 1 test passes

### Step T5.5 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors

### Step T5.6 — Commit

```bash
git add packages/api/typescript/tests/support/given/billing.ts packages/api/typescript/tests/support/given/billing.test.ts
git commit -m "test(support): add billing given-helpers (Task T5)"
```

---

## Task T6: Sales tests seed order overrides via a shared helper

Closes bp-17 for sales.

**Files to write:**
- Create: `packages/api/typescript/tests/support/given/sales.ts`
- Test: `packages/api/typescript/tests/support/given/sales.test.ts`

**Files to read:**
- `packages/api/typescript/src/sales/entities/OrderOverride.ts`
- `packages/api/typescript/src/sales/repositories/OrderOverrideRepository/OrderOverrideRepository.ts`
- `packages/api/typescript/tests/support/given/stores.ts`
- `packages/api/typescript/tests/support/given/integrations.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T1

### Step T6.1 — Write the failing test

```typescript
// packages/api/typescript/tests/support/given/sales.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { OrderOverrideRepository } from '@sales/repositories/OrderOverrideRepository'
import { TestBed } from '../TestBed'
import { givenOrderOverride } from './sales'

describe('sales given-helpers', () => {
  let testBed: TestBed
  let testContainer: DependencyContainer

  beforeAll(async () => {
    testContainer = container.createChildContainer()
    testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
  })
  beforeEach(async () => { await testBed.reset() })
  afterAll(async () => { await testBed.destroy() })

  it('givenOrderOverride persists a retrievable override', async () => {
    const override = await givenOrderOverride(testBed)
    const found = await testBed.resolve(OrderOverrideRepository).findById(override.id.value)
    expect(found?.id.value).toBe(override.id.value)
  })
})
```

### Step T6.2 — Run test to verify it fails

Run: `cd packages/api/typescript && bun test tests/support/given/sales.test.ts`
Expected: FAIL with `Cannot find module './sales'`

### Step T6.3 — Write minimal implementation

```typescript
// packages/api/typescript/tests/support/given/sales.ts
// Sales given-helpers — repo-direct. Composes givenStoreWithOwner + givenStoreIntegration
// for FK satisfaction (OrderOverride references store + integration external id).
import type { TestBed } from '../TestBed'
import { OrderOverride } from '@sales/entities/OrderOverride'
import { OrderOverrideRepository } from '@sales/repositories/OrderOverrideRepository'
import { givenStoreWithOwner } from './stores'
import { givenStoreIntegration } from './integrations'
import { testId } from '../ids'

export async function givenOrderOverride(
  testBed: TestBed,
  overrides: Partial<{
    storeId: string
    orderId: string
    storeIntegrationExternalId: string
    updatedByUserId: string
    fields: Parameters<typeof OrderOverride.create>[0]['fields']
  }> = {},
): Promise<OrderOverride> {
  const { store, user } = overrides.storeId
    ? { store: { id: { value: overrides.storeId } }, user: { id: { value: overrides.updatedByUserId ?? testId('user', 'sales') } } }
    : await givenStoreWithOwner(testBed)
  const integration = await givenStoreIntegration(testBed, { storeId: store.id.value, ownerId: user.id.value })
  const override = OrderOverride.create({
    storeId: store.id.value,
    orderId: overrides.orderId ?? testId('order', '1'),
    storeIntegrationExternalId: overrides.storeIntegrationExternalId ?? integration.externalId,
    fields: overrides.fields ?? {},
    updatedByUserId: overrides.updatedByUserId ?? user.id.value,
  })
  return testBed.resolve(OrderOverrideRepository).save(override)
}
```

> **Note for implementer:** the `overrides.storeId` branch above must produce a real store/integration; if reusing a caller-supplied `storeId` is needed, require the caller to also pass `storeIntegrationExternalId` rather than fabricating one. Simplify to always composing `givenStoreWithOwner` + `givenStoreIntegration` if the override branch proves awkward — the smoke test only needs the default path.

### Step T6.4 — Run test to verify it passes

Run: `cd packages/api/typescript && bun test tests/support/given/sales.test.ts`
Expected: PASS — 1 test passes

### Step T6.5 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors

### Step T6.6 — Commit

```bash
git add packages/api/typescript/tests/support/given/sales.ts packages/api/typescript/tests/support/given/sales.test.ts
git commit -m "test(support): add sales given-helpers (Task T6)"
```

---

## Task T7: `@test/support` exposes the new primitives + helpers as the one given-API

Wires the new modules into the barrel and demotes the dual `createGivenHelpers` facade to satisfy TST-18 (one given-API).

**Files to write:**
- Modify: `packages/api/typescript/tests/support/given/index.ts` — re-export ids/events/identity/billing/sales; demote facade
- Modify: `packages/api/typescript/tests/support/index.ts` — ensure new exports flow through `@test/support`

**Files to read:**
- `packages/api/typescript/tests/support/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T1, T2, T4, T5, T6

### Step T7.1 — Add re-exports to `given/index.ts`

Modify `packages/api/typescript/tests/support/given/index.ts`:

```diff
 export { givenStore, givenStoreMembership, givenStoreWithOwner } from './stores'
 export { givenStoreIntegration } from './integrations'
+export { givenDomainEvent } from './events'
+export { givenUserProfile, givenUserPreferences, givenFcmRegistrationToken } from './identity'
+export { givenSubscription } from './billing'
+export { givenOrderOverride } from './sales'
```

Add a deprecation note above `createGivenHelpers` (TST-18 — bare `givenX` is canonical):

```diff
-export function createGivenHelpers(testBed: TestBed) {
+/**
+ * @deprecated Prefer the bare `givenX(testBed, …)` helpers (TST-18). This facade
+ * is retained only for existing call sites and is not the documented path.
+ */
+export function createGivenHelpers(testBed: TestBed) {
```

### Step T7.2 — Confirm the support barrel re-exports `testId` + given helpers

Modify `packages/api/typescript/tests/support/index.ts`:
- Ensure it re-exports from `./ids` and `./given` (add `export * from './ids'` and `export * from './given'` if not already covered).

### Step T7.3 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors

### Step T7.4 — Verify the barrel resolves

Run: `cd packages/api/typescript && bun test tests/support/given/identity.test.ts tests/support/given/billing.test.ts tests/support/given/sales.test.ts`
Expected: PASS — all smoke tests still green via the barrel.

### Step T7.5 — Commit

```bash
git add packages/api/typescript/tests/support/given/index.ts packages/api/typescript/tests/support/index.ts
git commit -m "test(support): export new primitives/helpers; demote given facade (TST-18) (Task T7)"
```

---

## Task T8: The /test skill documents the 10 new rules + 2 patterns

Codifies bp-17..26 + TST-17/18 so `/review` + `bun review` flag violations and authors have the canonical reference.

**Files to write:**
- Modify: `.claude/skills/test/typescript/registry.yaml` — add `TST-17`, `TST-18` patterns + `bp-17..bp-26` bad_practices; update `canonical_snippet`
- Modify: `.claude/skills/test/typescript/SKILL.md` — add "Hard cases" section + given-helper index; add "tests use `expect().rejects`, not `tryCatchAsync`" note
- Modify: `.claude/projects/-Users-gabrielaraujo-Desktop-Projetos-pessoal-template-fullstack/memory/feedback_trycatch_over_raw.md` — scope to production code

**Files to read:**
- `.claude/skills/test/typescript/registry.yaml`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T7

### Step T8.1 — Add the two positive patterns under `patterns:` in `registry.yaml`

Append after `TST-16`:

```yaml
    - id: TST-17
      name: "Canonical error assertion — expect().toThrow / rejects.toMatchObject"
      when: "a test asserts a thrown domain/application error"
      reason: >
        bun:test already gives a typed, cast-free error API. Hand-rolling try/catch and
        casting the caught value (`(caught as BaseError).name`) is 5 lines of boilerplate
        that silently passes if the thrown value is not a BaseError. tryCatchAsync is a
        PRODUCTION convention — in tests use expect().rejects.
      rule: |
        // sync (entity / value object):
        expect(() => Store.create({ name: '' })).toThrow(BaseError)
        // async + assert the error CODE (not the message):
        await expect(useCase.execute({ ... })).rejects.toMatchObject({ name: 'STORE_NOT_FOUND' })
      wrong: |
        let caught: unknown = null
        try { await useCase.execute({ ... }) } catch (e) { caught = e }
        expect((caught as Error & { name: string }).name).toBe('STORE_NOT_FOUND')

    - id: TST-18
      name: "One given-API — bare givenX(testBed, …)"
      when: "a test sets up prerequisite state via given helpers"
      reason: >
        Two competing given-APIs (bare givenX vs the createGivenHelpers facade) means no
        canonical reference. The bare functions are the documented path.
      rule: "Call bare `givenX(testBed, overrides?)` imported from '@test/support'. The createGivenHelpers facade is deprecated."
```

### Step T8.2 — Add the ten bad practices under `bad_practices:` in `registry.yaml`

Append after `bp-16`:

```yaml
    - id: bp-17
      name: "Inline seed/build/make helpers instead of given/"
      severity: high
      reason: >
        A local `async function seedX/buildX/makeX` that creates or persists a domain
        entity duplicates per-file (seedAuthUser was copy-pasted across 8 identity files)
        and drifts when the entity schema changes.
      wrong: |
        async function seedAuthUser(email: string) { /* repo.save(User.create(...)) */ }
      right: |
        import { givenUser, givenUserProfile } from '@test/support'   // shared, repo-direct
        // A local fixture is allowed ONLY inside a single Drizzle*Repository.test.ts with
        // no cross-file reuse. Reused in 2+ files → promote to tests/support/given/.

    - id: bp-18
      name: "Hardcoded UUID literals as test ids"
      severity: medium
      reason: "Opaque hex literals bypass the Id factory, may not match UUIDv7 format, and collide when copy-pasted."
      wrong: "const USER_ID = '019e4d24-6524-7041-9e1c-8108180cddae'"
      right: |
        import { testId } from '@test/support'
        const userId = testId('user', '1')   // deterministic; testId() for random/not-found

    - id: bp-19
      name: "Hand-rolled try/catch + cast for error assertions"
      severity: medium
      reason: "See TST-17. The cast silently passes for non-BaseError throwables and spreads 5-line boilerplate."
      wrong: |
        let caught; try { await uc.execute(...) } catch (e) { caught = e }
        expect((caught as BaseError).name).toBe('CODE')
      right: |
        await expect(uc.execute(...)).rejects.toMatchObject({ name: 'CODE' })

    - id: bp-20
      name: "`as unknown as typeof fetch` stub cast"
      severity: high
      reason: "The double cast suppresses signature checks on the HTTP stub; all occurrences cluster in integration/services from copy-paste."
      wrong: "const fetchStub = (async () => jsonResponse({})) as unknown as typeof fetch"
      right: |
        import { createFakeFetch, jsonResponse } from '@test/support'
        const { fetch, calls } = createFakeFetch({ routes: { '/shop.json': () => jsonResponse({ shop: {} }) } })
        new ShopifyHandshaker(fetch)   // typed; the single cast is centralized in the fake

    - id: bp-21
      name: "TestBed.create('integration') without ownerId"
      severity: low
      reason: >
        The ownerId getter defaults to 'integration-tenant', so this is a CONSISTENCY rule,
        not a correctness bug — but every integration test should pass it explicitly to match
        the canonical snippet and make tenant scoping legible.
      wrong: "await TestBed.create('integration', { testContainer })"
      right: "await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })"

    - id: bp-22
      name: "setTimeout timing hacks for ordering"
      severity: medium
      reason: "Sleeping to force createdAt gaps is flaky and slow. Events carry no createdAt; the table assigns it at insert."
      wrong: "await givenDomainEvent(testBed, a); await new Promise(r => setTimeout(r, 5)); await givenDomainEvent(testBed, b)"
      right: |
        // assert set membership / count, not array order:
        const types = out.items.map(i => i.type)
        expect(types).toContain('billing.subscription.created')
        // if strict order is genuinely required, that is a read-side ordering concern — fix the query, not the test.

    - id: bp-23
      name: "Raw event-name string literals in assertions"
      severity: low
      reason: "Magic strings like 'billing.subscription.created' drift from the event class; the class carries the canonical name."
      wrong: "expect(countSaved('billing.subscription.created')).toBe(1)"
      right: "expect(countSaved(SubscriptionCreatedEvent.name)).toBe(1)"

    - id: bp-24
      name: "Weak/dead assertions on known-present values"
      severity: low
      reason: "toBeDefined/toBeTruthy/length>0 on a value the test just created proves nothing about behavior."
      wrong: "expect(result).toBeDefined()"
      right: "expect(result.reportingCurrency).toBe(CurrencyCode.BRL)"

    - id: bp-25
      name: "Resolving collaborators inside each test body"
      severity: low
      reason: "Resolving repos/use-cases in every it() repeats wiring and diverges; resolve once in beforeAll."
      wrong: "it('…', async () => { const repo = testBed.resolve(StoreRepository); /* … */ })"
      right: "// resolve in beforeAll into a suite-scoped let; test bodies use it"

    - id: bp-26
      name: "Private-field probing via `as any`"
      severity: medium
      reason: "Reaching into a private field (`uc['inputSchema' as never] as any`) tests implementation, not behavior."
      wrong: "const schema = uc['inputSchema' as never] as any"
      right: "// assert observable behavior; if a value must be inspected, expose a typed accessor"
```

### Step T8.3 — Update `canonical_snippet` + add the "Hard cases" section to `SKILL.md`

- In `registry.yaml`, update `canonical_snippet` so the use-case example uses `testId(...)` for ids and `await expect(...).rejects.toMatchObject({ name })` for the error case.
- In `SKILL.md`, add a `## Hard Cases` section documenting: the error idiom (TST-17), `createFakeFetch` for HTTP collaborators (bp-20), `givenDomainEvent` for event-as-data (vs bp-16), `testId` for identifiers (bp-18), and ordering guidance (bp-22). Add a `## Given Helpers Index` table listing the grown set (users, sessions, stores, integrations, identity, billing, sales, events). Add one line under the existing tryCatch guidance: "In tests, assert errors with `expect().rejects` (TST-17) — `tryCatchAsync` is a production-code convention."

### Step T8.4 — Scope the memory note to production code

Modify `…/memory/feedback_trycatch_over_raw.md`:
- Add a sentence: "Scope: production code. In **tests**, assert thrown errors with bun:test `expect().toThrow()` / `await expect().rejects.toMatchObject({ name })` (see /test TST-17), not `tryCatchAsync`."

### Step T8.5 — Validate the registry still parses

Run: `bun review --backend --context billing 2>&1 | head -5` (smoke — confirms the registry.yaml loads without a YAML error)
Expected: command runs without a YAML parse error (findings content is irrelevant here).

### Step T8.6 — Commit

```bash
git add .claude/skills/test/typescript/registry.yaml .claude/skills/test/typescript/SKILL.md
git add ".claude/projects/-Users-gabrielaraujo-Desktop-Projetos-pessoal-template-fullstack/memory/feedback_trycatch_over_raw.md"
git commit -m "docs(test): codify bp-17..26 + TST-17/18 in /test skill (Task T8)"
```

---

## Task T9: `bun cli` scaffolds canonical tests (co-emission + test/given verbs)

Makes the canonical test the default CLI output so new artifacts ship a correct `.test.ts` and authors never start from a bad neighbour.

**Files to write:**
- Modify: `.claude/skills/test/typescript/registry.yaml` — add a `snippet:` block with skeleton variants (`usecase`/`repository`/`handler`/`query`/`given`)
- Modify: `scripts/cli/backend/typescript/bindings.ts` — add `test` + `given` binding computers
- Modify: `scripts/cli/backend/typescript/templates.ts` — add adapters delegating to `renderArtifact('test'|'given', 'typescript', …)`
- Modify: `scripts/cli/backend/typescript/index.ts` — co-emit `X.test.ts` from usecase/repository/handler/query generators; add `test` + `given` command generators
- Modify: `scripts/cli/backend/typescript/templates.golden.test.ts` — golden coverage for the new snippets
- Modify: `docs/CLI.md` — document `bun cli test …` + `bun cli given …`

**Files to read:**
- `scripts/cli/snippet/render.ts`
- `scripts/cli/backend/typescript/index.ts`
- `scripts/cli/backend/typescript/templates.golden.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test, /sdk
**Depends on:** T8

### Step T9.1 — Add the `snippet:` block to the test skill `registry.yaml`

Add a top-level `snippet:` block (sibling of `patterns:`/`bad_practices:`) whose `skeletons` map carries one variant per kind. Each skeleton bakes in: the 3-hook lifecycle, `ownerId: 'integration-tenant'`, `testBed.resolve(...)` in `beforeAll`, `testId(...)` ids, given usage, and the TST-17 error idiom. Placeholders: `{{Name}}`, `{{contextName}}`, `{{camelName}}`. (Mirror the structure of an existing skill's `snippet:` block — skeleton + `_variant` selection, identical to how `controller` selects verb variants.)

Example `usecase` skeleton (abbreviated — write the full body):

```yaml
snippet:
  skeletons:
    usecase: |
      import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
      import { container, type DependencyContainer } from 'tsyringe-neo'
      import { TestBed } from '@test/support'
      import { {{Name}} } from './{{Name}}'

      describe('{{Name}}', () => {
        let testBed: TestBed
        let testContainer: DependencyContainer
        let useCase: {{Name}}

        beforeAll(async () => {
          testContainer = container.createChildContainer()
          testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
          useCase = testBed.resolve({{Name}})
        })
        beforeEach(async () => { await testBed.reset() })
        afterAll(async () => { await testBed.destroy() })

        it('TODO: orchestration behavior', async () => {
          // const { store } = await givenStoreWithOwner(testBed)
          // const result = await useCase.execute({ ... })
          // expect(result.x).toBe(y)
        })

        it('throws when the resource is missing', async () => {
          await expect(useCase.execute({ /* … */ })).rejects.toMatchObject({ name: 'NOT_FOUND' })
        })
      })
    given: |
      import type { TestBed } from '../TestBed'
      import { {{Name}} } from '@{{contextName}}/entities/{{Name}}'
      import { {{Name}}Repository } from '@{{contextName}}/repositories/{{Name}}Repository'

      export async function given{{Name}}(testBed: TestBed, overrides: Partial<{}> = {}): Promise<{{Name}}> {
        const entity = {{Name}}.create({ /* TODO: required fields, use testId(...) for ids */ })
        return testBed.resolve({{Name}}Repository).save(entity)
      }
    # + repository / handler / query skeletons (same lifecycle shape)
```

### Step T9.2 — Add binding computers in `bindings.ts`

```diff
   query: (name: string): Bindings => ({
     Name: toPascalCase(name),
     verbEntity: toVerbEntityFormat(name),
   }),
+
+  // Test scaffold: pick the skeleton variant by test kind.
+  test: (ctx: string, name: string, kind: string): Bindings => ({
+    _variant: kind, // 'usecase' | 'repository' | 'handler' | 'query'
+    Name: toPascalCase(name),
+    contextName: ctx,
+    camelName: toCamelCase(name),
+  }),
+
+  givenHelper: (ctx: string, name: string): Bindings => ({
+    _variant: 'given',
+    Name: toPascalCase(name),
+    contextName: ctx,
+    camelName: toCamelCase(name),
+  }),
 }
```

### Step T9.3 — Add adapters in `templates.ts`

```diff
   query: (name: string) => renderArtifact('query', 'typescript', backendBindings.query(name)),
+
+  test: (ctx: string, name: string, kind: string) => renderArtifact('test', 'typescript', backendBindings.test(ctx, name, kind)),
+
+  given: (ctx: string, name: string) => renderArtifact('test', 'typescript', backendBindings.givenHelper(ctx, name)),
 }
```

### Step T9.4 — Co-emit a `.test.ts` from the usecase generator (repeat for repository/handler/query)

Modify the `usecase` generator in `scripts/cli/backend/typescript/index.ts` to push a second file:

```diff
       return [
         {
           filePath: `packages/api/typescript/src/${ctx}/${subDir}/${pascal}.ts`,
           content: backendTemplates.usecase(ctx, name),
           exportLine: `export { ${pascal} } from './${isInternal ? `internal/${pascal}` : pascal}'`,
           exportTarget: `packages/api/typescript/src/${ctx}/usecases/index.ts`,
         },
+        {
+          filePath: `packages/api/typescript/src/${ctx}/${subDir}/${pascal}.test.ts`,
+          content: backendTemplates.test(ctx, name, 'usecase'),
+        },
       ]
```

Apply the analogous co-emission to `repository` (kind `'repository'`, colocated in the repo folder), `handler` (kind `'handler'`), and `query` (kind `'query'`, in `ui/usecases`).

### Step T9.5 — Add `test` + `given` command generators in `index.ts`

```diff
   projector: pos => { /* … */ },
+
+  test: (pos) => {
+    const [kind, ctx, name] = pos
+    requireArg(kind, 'test <usecase|repository|handler|query> <context> <name>')
+    requireArg(ctx, 'test <kind> <context> <name>')
+    requireArg(name, 'test <kind> <context> <name>')
+    const pascal = toPascalCase(name)
+    const dir = kind === 'query' ? 'ui/usecases' : kind === 'repository' ? `${ctx}/repositories/${pascal}Repository` : `${ctx}/usecases`
+    return [{ filePath: `packages/api/typescript/src/${dir}/${pascal}.test.ts`, content: backendTemplates.test(ctx, name, kind) }]
+  },
+
+  given: (pos) => {
+    const [ctx, name] = pos
+    requireArg(ctx, 'given <context> <name>')
+    requireArg(name, 'given <context> <name>')
+    const pascal = toPascalCase(name)
+    return [{
+      filePath: `packages/api/typescript/tests/support/given/${ctx}.ts`,
+      content: backendTemplates.given(ctx, name),
+      exportLine: `export { given${pascal} } from './${ctx}'`,
+      exportTarget: `packages/api/typescript/tests/support/given/index.ts`,
+    }]
+  },
 }
```

> **Note for implementer:** `toPascalCase` is already imported in this file. Confirm `kind` is validated against the allowed set; reject unknown kinds with a `requireArg`-style message.

### Step T9.6 — Add golden coverage + docs

- In `templates.golden.test.ts`, add cases asserting `backendTemplates.test(ctx, name, 'usecase')` and `backendTemplates.given(ctx, name)` render without unresolved `{{…}}` placeholders (the renderer throws on leftovers, so a smoke render + snapshot is enough).
- In `docs/CLI.md`, add `bun cli test <kind> <ctx> <name>` and `bun cli given <ctx> <name>` to the backend commands list with one example each.

### Step T9.7 — Verify the scaffold renders + co-emission works

```bash
bun cli test usecase billing CancelSubscription --print
bun cli given billing Coupon --print
bun cli usecase billing TmpCoemit --print   # should print TWO files: the usecase + its .test.ts
```
Expected: each prints valid TS with no `{{placeholder}}` left; the `usecase` print shows a `// FILE: …/TmpCoemit.test.ts` block.

### Step T9.8 — Type check + lint + golden test

Run: `bun tsc && bun lint && cd scripts && bun test cli/backend/typescript/templates.golden.test.ts`
Expected: 0 errors; golden tests pass.

### Step T9.9 — Commit

```bash
git add .claude/skills/test/typescript/registry.yaml scripts/cli/backend/typescript/ docs/CLI.md
git commit -m "feat(cli): scaffold canonical tests — co-emission + test/given verbs (Task T9)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `cd packages/api/typescript && bun test tests/support/` — all support primitive + given smoke tests pass
- [ ] `bun cli test usecase billing CancelSubscription --print` — renders a canonical test with no leftover placeholders
- [ ] `bun cli usecase <ctx> <name> --print` — co-emits a `.test.ts` block
- [ ] `bun review --backend` smoke — `registry.yaml` loads (no YAML error)
- [ ] AC mapping (spec ACs → test/verification):
  - AC-1 (primitives exist + exported) → `tests/support/ids.test.ts`, `tests/support/given/events.test.ts`, `tests/support/fakes/FakeFetch.test.ts`
  - AC-2 (given/ covers identity/billing/sales; seedAuthUser deletable) → `tests/support/given/{identity,billing,sales}.test.ts` (deletion of seedAuthUser is Plan B migration)
  - AC-3 (registry has bp-17..26 + TST-17/18; SKILL hard-cases) → Task T8 (manual verify in registry.yaml/SKILL.md)
  - AC-4 (CLI co-emits + test/given verbs in docs) → Task T9 Step T9.7 + golden test
  - AC-5 (168 migrated) → **Plan B** (out of scope here)
  - AC-6 (tsc+test green) → Final Validation rows 1–3

## Notes

- **Spec refinements discovered during planning (carry into Plan B + spec):**
  - bp-21 softened from "correctness bug" to a **consistency rule** — `TestBed.ownerId` getter already defaults to `'integration-tenant'`.
  - `givenDomainEvent` ships **without** a `createdAt` param — `BaseDomainEvent` has no `createdAt` and `Repository.save` takes no timestamp. bp-22 guidance is therefore "assert membership/count, not array order"; strict event ordering is a read-side concern to handle in Plan B (e.g. `ListSubscriptionEventHistory`).
- **Open questions resolved:** `testId(...segments)` variadic; co-emitted tests **written to disk** by default (with `--print`).
- **Given-helper smoke tests** verify FK satisfaction against PGlite; they follow the existing `users.ts`/`stores.ts` repo-direct pattern. If a repo's `save` returns `void`, return the local entity instance.
- **No SDK / migration / controller** work in this plan — the `/sdk` skill tag on T9 is only because the CLI touches scaffolder code, not because an endpoint changed; no `bun sdk` run is required.
- **Plan B (full sweep)** will be authored after this lands, as a workflow-driven migration in waves, migrating the 168 files onto these primitives/idioms.
