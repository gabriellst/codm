# P8-TRACKING — BC7 Tracking (Pixel funnel projection + reads) — Implementation Plan (polyglot rebase, iter 43)

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`)
> syntax for tracking. Each Task wraps one observable behavior in an outer
> RED→GREEN cycle. All TS files land under `packages/api/typescript/src/tracking/…`
> (read-side) or `packages/api/typescript/src/sales/handlers/…` (the single Sales-owned
> external handler this sub-plan delivers). The canonical `tracking.pixel_events`
> table is **Go-owned** — TS never writes to it (spec §6, "Go is the only writer
> of canonical tables"). The Drizzle schema already exists at
> `packages/contracts/db/schema/tracking.ts` (authored iter 42).
>
> **Naming note:** Master plan calls this sub-plan `P8-TRACKING`. The spec
> calls it **BC7 Tracking** and the reads live in §7.7 (T23 PixelFunnel, T24
> PixelScriptSnippet). The Ralph prompt's mention of "§7.8" is the *next* section
> (Finance). The binding for this sub-plan is **§7.7 only**.

**Goal:** Land the TS-side surface of BC7 Tracking: (1) a `PixelEventProjection`
free record that mirrors the Go-owned `tracking.pixel_events` row shape, (2) a
read-only `PixelEventProjectionRepository` (only `findById`, `findCountsByType`,
no `save`/`insertIfNew` — Go owns writes), (3) a `PixelEventProjector` that
**subscribes** to the integration event `integration.shared.pixel_event.recorded`
solely to advance an in-memory funnel cache (write-side is a no-op in TS;
the Drizzle row is already there written by Go), (4) the T23 `PixelFunnel`
query use case (BFF — direct Drizzle), (5) the T24 `PixelScriptSnippet` query
use case (Shopify-only; returns the pixel SDK init script + installation
instructions), (6) a Sales-owned `PixelEventRecordedHandler` (lives in
`sales/handlers/external.ts`) that narrows the integration event to a
`PixelCheckoutCompleted` trigger consumed by Sales' Cart→Order linker.

**Architecture:** TS Tracking is **read-only on canonical pixel data**. Go writes
the rows; TS reads them. The Projector exists for shape parity with other read
sides — its `events` array names `PixelEventRecordedEvent` so the framework
wires up the subscription, but its `handle` is a no-op (the canonical row is
already in Postgres; no derived projection is materialised by TS in this
iteration). The two query use cases live in the `tracking` BC (not `ui`) because
they expose tracking-domain shapes — there is no existing `ui` BFF context that
already owns Pixel/funnel reads, and the spec assigns reads T23/T24 to BC7
directly. The Sales handler — re-named here as the integration handshake that
emits the `PixelCheckoutCompleted` trigger — lives under `sales/handlers/external.ts`
because spec §4 BC4 places the Cart→Order link in Sales, not Tracking.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe-neo, Zod, Redis Streams
(consumer-only — Go publishes), `@template/core-typescript` (BoundedContext,
Handler, Controller, Projector, registerErrorCodes), `@template/contracts/db`,
`@template/contracts-typescript/wire`.

**Spec:** `.specs/2026-05-21-ddd-modeling-bk-dash.md` (§4 BC7 Tracking,
§7.7 PixelFunnel/PixelScriptSnippet, §6 Design Decisions — Go-owned writes,
§7.0 PixelEventType).

**Master plan:** `.plans/2026-05-21-bk-dash-port.md` (sub-plan P8-TRACKING).

**Depends on sub-plans:** Iter 41 (`packages/contracts/wire/` — `PixelEventType`,
`SalesPlatform`, `PixelEventRecordedEvent` are already authored and generated),
Iter 42 (`packages/contracts/db/schema/tracking.ts` — `pixel_events` table
already shipped, 16 columns + 7 indexes), P1-IDENTITY (auth middleware,
`ctx.user`), P2-TENANCY (`storeId` scoping, membership guard), P4-INTEGRATION
(`StoreIntegrationRepository.findById` for T24), PG-GO-WORKER (publishes the
`integration.shared.pixel_event.recorded` Redis Stream and writes the canonical
rows). **Soft consumer:** P6-SALES (consumes the `PixelCheckoutCompleted` domain
event re-broadcast that this sub-plan emits via `sales/handlers/external.ts` —
the handler ships here so Sales' Cart→Order linker has its trigger).

**Reference BCs (structural, polyglot):**
- `packages/api/typescript/src/auth/` — canonical TS BC layout (`index.ts`,
  `registry.ts`, `controllers/`, `handlers/{internal,external}.ts`, `errors/`,
  `enums/`, `objects/`).
- `packages/api/typescript/src/ui/projections/VideoFeedProjection.ts` +
  `…/projectors/VideoFeedProjector.ts` + `…/repositories/VideoFeedProjectionRepository/`
  — canonical projection + projector + repo trio (Projector with
  `events: [...]` constant + switch on `event.name`).
- `packages/api/typescript/src/notifications/handlers/NotifySubscribersHandler.ts`
  — canonical external handler (`extends EventHandler<typeof Event>`,
  `readonly event = Event`).
- `packages/api/typescript/src/ui/usecases/GetVideoFeed.ts` + the matching
  controller — canonical Handler-based query + thin Controller pair.

**Tasks:** 11
**Estimated minutes:** ~165

---

## Convention reference (absorbed during planning; NOT to be re-read by /build)

- **Read-only projection pattern.** Sibling `VideoFeedProjectionRepository`
  declares its full surface (`findByVideoId`, `save`, `insertIfNew`). For
  Tracking we ship the same shape but **omit `save` and `insertIfNew`** —
  Go is the only writer. The abstract class advertises only `findById` and
  `findCountsByType`; defence-in-depth via type system (no `save` method
  exists to call).
- **Projector with no-op handle.** Sibling `VideoFeedProjector` materialises
  a denormalised row. `PixelEventProjector` registers the subscription
  (so framework wiring exposes the event to the BC) but `handle()` is a
  no-op — the canonical row is already in Postgres written by Go, and no
  derived TS-side table is materialised in this iteration. We keep the
  Projector so the wiring contract matches sibling BCs and so a future
  derived funnel cache can grow into it without re-plumbing the subscription.
- **Folder shape:** `packages/api/typescript/src/tracking/` (new dir). Mirrors
  `src/auth/` 1:1 — `index.ts` (BC bootstrap), `registry.ts`, `controllers/`,
  `handlers/{internal,external}.ts`, `errors/`, `enums/` (empty barrel —
  PixelEventType lives in `@template/contracts-typescript/wire/enums`),
  `projections/` (PixelEventProjection + projectors/), `repositories/`
  (PixelEventProjectionRepository — interface + Drizzle + Mock), `usecases/`
  (GetPixelFunnel + GetPixelScriptSnippet).
- **Wire imports.** `import { PixelEventRecordedEvent, PixelEventType, SalesPlatform } from '@template/contracts-typescript/wire'`. Do NOT redeclare these.
- **DB import.** `import { pixelEvents } from '@template/contracts/db'`.
  Drizzle schema is already shipped at `packages/contracts/db/schema/tracking.ts`
  with columns: `id`, `storeId`, `storeIntegrationId`, `storeIntegrationExternalId`,
  `platform`, `externalEventId`, `eventType`, `cartExternalId`, `productExternalId`,
  `visitorKey`, `url`, `referrer`, `utm` (jsonb), `occurredAt`, `ingestedAt`,
  `version`. **No new migration is emitted by this sub-plan.**
- **No commands.** Per spec §7.7 *"PixelEvents are written exclusively by
  go-worker from inbound Shopify Pixel posts; no TS command exists for ingest."*
  Zero mutating controllers in this sub-plan.
- **Sales handler placement.** `PixelEventRecordedHandler` for Sales-side
  Cart→Order linking lives at `packages/api/typescript/src/sales/handlers/external.ts`
  (re-exported from `PixelEventRecordedHandler.ts`). This sub-plan creates the
  file even though Sales BC scaffolding lands in P6 — P6 will append to it
  alongside its own external handlers. If Sales BC doesn't exist yet when this
  sub-plan runs, Task 8 creates the minimal `packages/api/typescript/src/sales/`
  skeleton (`index.ts`, `registry.ts`, `handlers/external.ts`, `handlers/internal.ts`)
  and surfaces a `# QUESTION:` for P6 to converge on later.
- **Errors registration.** Mirror `auth/errors/index.ts` — declare typed unions
  + call `registerErrorCodes({...})` as side-effect. The spec §7.7 T24 error
  catalogue contributes `PIXEL_NOT_SUPPORTED_FOR_PLATFORM` (422) and
  `STORE_INTEGRATION_NOT_FOUND` (404 — note: this code likely also exists in
  P4-INTEGRATION's errors; declare-once, defer to P4 if it lands first;
  otherwise declare here and let P4 reuse).
- **Schema import.** Sibling BCs use `import { z } from '@template/core-typescript'`
  (re-exported zod). Match that.
- **Test harness.** Sibling tests use `packages/api/typescript/tests/support/TestBed.ts`
  in `integration` mode with PGlite. The harness already exists.
- **Router registration.** Append `import TrackingRouter from '@tracking/index'`
  and `TrackingRouter` to the `routers` array in `packages/api/typescript/src/index.ts`.
- **No `@tracking/*` path alias yet — confirm wildcard.** # QUESTION: do
  `packages/api/typescript/tsconfig.json` paths wildcard `@<bc>/*`?
  If yes, no tsconfig edit needed. If no, add `@tracking/*` like `@auth/*`,
  `@notifications/*`, `@ui/*`. Same question applies to `@sales/*` for Task 8.

---

## File Structure (all files this sub-plan creates or modifies)

| # | Path | Phase | Wave | Classification | Type |
|---|---|---|---|---|---|
| 1 | `packages/api/typescript/src/tracking/index.ts` | 0 (Contract Lock) | W1 | serial | NEW |
| 2 | `packages/api/typescript/src/tracking/registry.ts` | 0 | W1 | serial | NEW |
| 3 | `packages/api/typescript/src/tracking/enums/index.ts` | 0 | W1 | parallel-now | NEW (empty barrel — `export {}`) |
| 4 | `packages/api/typescript/src/tracking/errors/index.ts` | 0 | W1 | serial | NEW |
| 5 | `packages/api/typescript/src/tracking/controllers/index.ts` | 0 | W1 | serial | NEW (re-exports controllers from Tasks 6+7) |
| 6 | `packages/api/typescript/src/tracking/handlers/internal.ts` | 0 | W1 | parallel-now | NEW (empty barrel) |
| 7 | `packages/api/typescript/src/tracking/handlers/external.ts` | 0 | W1 | parallel-now | NEW (empty barrel) |
| 8 | `packages/api/typescript/src/tracking/middlewares/index.ts` | 0 | W1 | parallel-now | NEW (`export default []`) |
| 9 | `packages/api/typescript/src/tracking/projections/PixelEventProjection.ts` | 1 (Behavior Slices) | W2 | parallel-after-contract | NEW |
| 10 | `packages/api/typescript/src/tracking/projections/PixelEventProjection.test.ts` | 1 | W2 | parallel-after-contract | NEW |
| 11 | `packages/api/typescript/src/tracking/repositories/PixelEventProjectionRepository/PixelEventProjectionRepository.ts` | 1 | W3 | parallel-after-wave-2 | NEW |
| 12 | `packages/api/typescript/src/tracking/repositories/PixelEventProjectionRepository/DrizzlePixelEventProjectionRepository.ts` | 1 | W3 | parallel-after-wave-2 | NEW |
| 13 | `packages/api/typescript/src/tracking/repositories/PixelEventProjectionRepository/MockPixelEventProjectionRepository.ts` | 1 | W3 | parallel-after-wave-2 | NEW |
| 14 | `packages/api/typescript/src/tracking/repositories/PixelEventProjectionRepository/index.ts` | 1 | W3 | parallel-after-wave-2 | NEW (barrel) |
| 15 | `packages/api/typescript/src/tracking/repositories/PixelEventProjectionRepository/DrizzlePixelEventProjectionRepository.test.ts` | 1 | W3 | parallel-after-wave-2 | NEW |
| 16 | `packages/api/typescript/src/tracking/projections/projectors/PixelEventProjector.ts` | 1 | W3 | parallel-after-wave-2 | NEW (no-op handle) |
| 17 | `packages/api/typescript/src/tracking/projections/projectors/PixelEventProjector.test.ts` | 1 | W3 | parallel-after-wave-2 | NEW |
| 18 | `packages/api/typescript/src/tracking/usecases/GetPixelFunnel.ts` | 1 | W4 | parallel-after-wave-3 | NEW (T23) |
| 19 | `packages/api/typescript/src/tracking/usecases/GetPixelFunnel.test.ts` | 1 | W4 | parallel-after-wave-3 | NEW |
| 20 | `packages/api/typescript/src/tracking/controllers/GetPixelFunnel.ts` | 0 (Contract Lock) | W4 | serial | NEW |
| 21 | `packages/api/typescript/src/tracking/controllers/GetPixelFunnel.test.ts` | 1 | W4 | parallel-after-wave-3 | NEW |
| 22 | `packages/api/typescript/src/tracking/usecases/GetPixelScriptSnippet.ts` | 1 | W4 | parallel-after-wave-3 | NEW (T24) |
| 23 | `packages/api/typescript/src/tracking/usecases/GetPixelScriptSnippet.test.ts` | 1 | W4 | parallel-after-wave-3 | NEW |
| 24 | `packages/api/typescript/src/tracking/controllers/GetPixelScriptSnippet.ts` | 0 (Contract Lock) | W4 | serial | NEW |
| 25 | `packages/api/typescript/src/tracking/controllers/GetPixelScriptSnippet.test.ts` | 1 | W4 | parallel-after-wave-3 | NEW |
| 26 | `packages/api/typescript/src/sales/index.ts` | 0 | W5 | serial | NEW (minimal skeleton — superseded if P6 lands first) |
| 27 | `packages/api/typescript/src/sales/registry.ts` | 0 | W5 | serial | NEW (empty INSTANCE_REGISTRY initially) |
| 28 | `packages/api/typescript/src/sales/controllers/index.ts` | 0 | W5 | serial | NEW (empty barrel) |
| 29 | `packages/api/typescript/src/sales/handlers/internal.ts` | 0 | W5 | parallel-now | NEW (empty barrel) |
| 30 | `packages/api/typescript/src/sales/handlers/external.ts` | 0 | W5 | serial | NEW (re-exports PixelEventRecordedHandler) |
| 31 | `packages/api/typescript/src/sales/handlers/PixelEventRecordedHandler.ts` | 1 | W5 | parallel-after-wave-3 | NEW |
| 32 | `packages/api/typescript/src/sales/handlers/PixelEventRecordedHandler.test.ts` | 1 | W5 | parallel-after-wave-3 | NEW |
| 33 | `packages/api/typescript/src/index.ts` | 0 | W6 | serial | MODIFY (mount TrackingRouter + SalesRouter) |
| 34 | `packages/api/typescript/public/docs/openapi.json` | 2 (Integration/QA) | W7 | serial | REGEN |
| 35 | `packages/client/dist/**` | 2 | W7 | serial | REGEN |

---

## Task 1: Contract Lock — Tracking bounded context skeleton + errors + router

**Files:**
- Create: `packages/api/typescript/src/tracking/index.ts`
- Create: `packages/api/typescript/src/tracking/registry.ts`
- Create: `packages/api/typescript/src/tracking/enums/index.ts` (`export {}`)
- Create: `packages/api/typescript/src/tracking/errors/index.ts`
- Create: `packages/api/typescript/src/tracking/controllers/index.ts` (empty barrel — gets filled in Tasks 5+6)
- Create: `packages/api/typescript/src/tracking/handlers/internal.ts` (`export {}`)
- Create: `packages/api/typescript/src/tracking/handlers/external.ts` (`export {}`)
- Create: `packages/api/typescript/src/tracking/middlewares/index.ts` (`export default []`)
- Modify: `packages/api/typescript/src/index.ts` — append `import TrackingRouter from '@tracking/index'` + push into `routers`
- # QUESTION: confirm `@tracking/*` path alias or wildcard.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /bounded-context, /errors
**Depends on:** iter 41 (`@template/contracts-typescript/wire` already shipped)

- [ ] **Step 1: Write the failing test**

`packages/api/typescript/src/tracking/index.test.ts`:
```typescript
import { describe, expect, it } from 'bun:test'
import TrackingRouter from './index'

describe('tracking BC skeleton', () => {
	it('exports a non-null router', () => {
		expect(TrackingRouter).toBeDefined()
	})
})
```

- [ ] **Step 2: Verify failure**

`bun test packages/api/typescript/src/tracking/index.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

`packages/api/typescript/src/tracking/index.ts` — mirror `src/auth/index.ts`:
```typescript
import { BoundedContext } from '@template/core-typescript'
import * as controllers from './controllers'
import { INSTANCE_REGISTRY } from './registry'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'

const ctx = await BoundedContext.create({
	name: '',
	controllers,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
})

export default ctx.router
```

`registry.ts`:
```typescript
import './errors' // side-effect: registerErrorCodes
import type { InstanceRegistry } from '@template/core-typescript'

// Populated by Task 3 once PixelEventProjectionRepository exists.
export const INSTANCE_REGISTRY: InstanceRegistry = {
	mock: [],
	integration: [],
	real: [],
}
```

`errors/index.ts` — mirror `auth/errors/index.ts`:
```typescript
import { HttpStatusCode, registerErrorCodes } from '@template/core-typescript'
import type {
	BaseDomainErrors,
	BaseApplicationErrors,
	BaseInterfaceErrors,
	BaseInfrastructureErrors,
} from '@template/core-typescript'

export type TrackingDomainErrors = never
export type DomainErrors = BaseDomainErrors | TrackingDomainErrors

// Per spec §7.7 T24 error catalogue.
export type TrackingApplicationErrors =
	| 'PIXEL_NOT_SUPPORTED_FOR_PLATFORM'
	| 'STORE_INTEGRATION_NOT_FOUND'
export type ApplicationErrors = BaseApplicationErrors | TrackingApplicationErrors

export type TrackingInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | TrackingInterfaceErrors

export type TrackingInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | TrackingInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	PIXEL_NOT_SUPPORTED_FOR_PLATFORM: HttpStatusCode.UNPROCESSABLE_ENTITY,
	STORE_INTEGRATION_NOT_FOUND: HttpStatusCode.NOT_FOUND,
})
```

# QUESTION: if P4-INTEGRATION lands first and already registers `STORE_INTEGRATION_NOT_FOUND`, drop it from this `registerErrorCodes` call to avoid double-registration. Defer to P4 if conflict.

`controllers/index.ts`, `handlers/internal.ts`, `handlers/external.ts`,
`enums/index.ts` — all empty barrels (`export {}`).

`middlewares/index.ts`:
```typescript
export default []
```

Modify `packages/api/typescript/src/index.ts` — add import + push into `routers`:
```typescript
import TrackingRouter from '@tracking/index'
// …
const routers = [SharedRouter, AuthRouter, NotificationsRouter, UIRouter, TrackingRouter]
```

- [ ] **Step 4: Verify pass + tsc/lint**

`bun test packages/api/typescript/src/tracking/index.test.ts && bun tsc && bun lint`

- [ ] **Step 5: Commit**

```bash
git add packages/api/typescript/src/tracking/ packages/api/typescript/src/index.ts
git commit -m "feat(tracking): BC skeleton + errors + router (P8 Task 1)"
```

---

## Task 2: PixelEventProjection — free record + Zod schema

**Files:**
- Create: `packages/api/typescript/src/tracking/projections/PixelEventProjection.ts`
- Test: `packages/api/typescript/src/tracking/projections/PixelEventProjection.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /projection, /schema
**Depends on:** Task 1

> **Shape** mirrors `tracking.pixel_events` columns exactly (`packages/contracts/db/schema/tracking.ts`).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { PixelEventProjection, PixelEventProjectionSchema } from './PixelEventProjection'

describe('PixelEventProjection', () => {
	it('parses a canonical pixel_events row', () => {
		const ok = PixelEventProjectionSchema.safeParse({
			id: '0190f3a1-7c3d-7000-b000-000000000001',
			storeId: '0190f3a1-7c3d-7000-b000-000000000010',
			storeIntegrationId: '0190f3a1-7c3d-7000-b000-000000000020',
			storeIntegrationExternalId: 'shop.myshopify.com',
			platform: 'SHOPIFY',
			externalEventId: 'evt_abc',
			eventType: 'CHECKOUT_COMPLETED',
			cartExternalId: 'c_abc',
			productExternalId: 'p_1',
			visitorKey: 'v_1',
			url: 'https://shop.example.com/checkout/thankyou',
			referrer: 'https://google.com',
			utm: { source: 'instagram', campaign: 'launch' },
			occurredAt: new Date('2026-05-21T03:00:00Z'),
			ingestedAt: new Date('2026-05-21T03:00:05Z'),
			version: 1,
		})
		expect(ok.success).toBe(true)
	})

	it('round-trips through PixelEventProjection class', () => {
		const p = new PixelEventProjection({
			id: 'id-1',
			storeId: 's-1', storeIntegrationId: 'si-1', storeIntegrationExternalId: 'shop',
			platform: 'SHOPIFY', externalEventId: 'evt-1', eventType: 'PAGE_VIEWED',
			cartExternalId: null, productExternalId: null, visitorKey: null,
			url: null, referrer: null, utm: null,
			occurredAt: new Date(), ingestedAt: new Date(), version: 1,
		})
		expect(p.props.eventType).toBe('PAGE_VIEWED')
	})
})
```

- [ ] **Step 2: Verify failure → Step 3: Implement**

```typescript
// PixelEventProjection — read-side record mirroring tracking.pixel_events.
// Free record: no base class, no invariants. Schema-driven props.
// NO applyEvent — Go is the only writer; TS never mutates a pixel_events row.
//
// ref: dev:packages/api/typescript/src/ui/projections/VideoFeedProjection.ts
import { z as _z } from 'zod'
import { z } from '@template/core-typescript'
import { PixelEventRecordedEvent } from '@template/contracts-typescript/wire'

export const PixelEventProjectionSchema = z.object({
	id: z.string(),
	storeId: z.string(),
	storeIntegrationId: z.string(),
	storeIntegrationExternalId: z.string(),
	platform: z.string(), // SalesPlatform string-encoded — Drizzle stores as text
	externalEventId: z.string(),
	eventType: z.string(), // PixelEventType string-encoded
	cartExternalId: z.string().nullable(),
	productExternalId: z.string().nullable(),
	visitorKey: z.string().nullable(),
	url: z.string().nullable(),
	referrer: z.string().nullable(),
	utm: z.record(z.string(), z.unknown()).nullable(),
	occurredAt: z.date(),
	ingestedAt: z.date(),
	version: z.number().int().nonnegative(),
})

export type PixelEventProjectionProps = _z.infer<typeof PixelEventProjectionSchema>

// The only event that can affect this projection — registered for shape parity
// with sibling Projectors. The handler is a no-op (Go owns canonical writes).
export type PixelEventProjectionEvent = PixelEventRecordedEvent

export class PixelEventProjection {
	constructor(public props: PixelEventProjectionProps) {}
}
```

- [ ] **Step 4: Verify pass + tsc/lint**

`bun test packages/api/typescript/src/tracking/projections/PixelEventProjection.test.ts && bun tsc && bun lint`

- [ ] **Step 5: Commit**

```bash
git add packages/api/typescript/src/tracking/projections/
git commit -m "feat(tracking): PixelEventProjection free record (P8 Task 2)"
```

---

## Task 3: PixelEventProjectionRepository — interface + Drizzle + Mock + DI

**Files:**
- Create: `packages/api/typescript/src/tracking/repositories/PixelEventProjectionRepository/PixelEventProjectionRepository.ts`
- Create: `packages/api/typescript/src/tracking/repositories/PixelEventProjectionRepository/DrizzlePixelEventProjectionRepository.ts`
- Create: `packages/api/typescript/src/tracking/repositories/PixelEventProjectionRepository/MockPixelEventProjectionRepository.ts`
- Create: `packages/api/typescript/src/tracking/repositories/PixelEventProjectionRepository/index.ts` (barrel)
- Test: `packages/api/typescript/src/tracking/repositories/PixelEventProjectionRepository/DrizzlePixelEventProjectionRepository.test.ts`
- Modify: `packages/api/typescript/src/tracking/registry.ts` — register the abstract→impl bindings

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository, /test
**Depends on:** Task 2
**Hard constraint:** **No `save`, no `insertIfNew`, no `delete`.** TS is read-only on this table.

- [ ] **Step 1: Write the failing test** (integration mode, PGlite, seed via raw `db.insert`)

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container } from 'tsyringe-neo'
import { TestBed } from '@api-tests/support/TestBed'
import { DrizzleClient } from '@template/core-typescript'
import { pixelEvents } from '@template/contracts/db'
import { PixelEventProjectionRepository } from './PixelEventProjectionRepository'

let testContainer: ReturnType<typeof container.createChildContainer>
let testBed: TestBed
let repo: PixelEventProjectionRepository
let db: DrizzleClient

beforeAll(async () => {
	testContainer = container.createChildContainer()
	testBed = await TestBed.create('integration', { testContainer, ownerId: 'store-it' })
	repo = testContainer.resolve(PixelEventProjectionRepository)
	db = testContainer.resolve(DrizzleClient)
})
beforeEach(async () => { await testBed.reset() })
afterAll(async () => { await testBed.destroy() })

describe('DrizzlePixelEventProjectionRepository', () => {
	it('findCountsByType groups by eventType in a date range', async () => {
		await db.insert(pixelEvents).values([
			{ id: '01', storeId: 'store-1', storeIntegrationId: 'si-1', storeIntegrationExternalId: 'shop', platform: 'SHOPIFY', externalEventId: 'e1', eventType: 'PAGE_VIEWED',         occurredAt: new Date('2026-05-21T03:00:00Z') },
			{ id: '02', storeId: 'store-1', storeIntegrationId: 'si-1', storeIntegrationExternalId: 'shop', platform: 'SHOPIFY', externalEventId: 'e2', eventType: 'PRODUCT_VIEWED',      occurredAt: new Date('2026-05-21T03:05:00Z') },
			{ id: '03', storeId: 'store-1', storeIntegrationId: 'si-1', storeIntegrationExternalId: 'shop', platform: 'SHOPIFY', externalEventId: 'e3', eventType: 'CHECKOUT_COMPLETED',  cartExternalId: 'c1', occurredAt: new Date('2026-05-21T03:10:00Z') },
			{ id: '04', storeId: 'store-2', storeIntegrationId: 'si-9', storeIntegrationExternalId: 'shop2', platform: 'SHOPIFY', externalEventId: 'e4', eventType: 'PAGE_VIEWED',         occurredAt: new Date('2026-05-21T03:00:00Z') },
		])
		const counts = await repo.findCountsByType({
			storeIds: ['store-1'],
			startDate: new Date('2026-05-21T00:00:00Z'),
			endDate: new Date('2026-05-21T23:59:59Z'),
		})
		expect(counts.find(c => c.eventType === 'PAGE_VIEWED')?.count).toBe(1)
		expect(counts.find(c => c.eventType === 'CHECKOUT_COMPLETED')?.count).toBe(1)
		expect(counts.reduce((s, c) => s + c.count, 0)).toBe(3)
	})

	it('findById hydrates a single row into PixelEventProjection', async () => {
		await db.insert(pixelEvents).values({
			id: 'row-1', storeId: 'store-1', storeIntegrationId: 'si-1', storeIntegrationExternalId: 'shop',
			platform: 'SHOPIFY', externalEventId: 'e1', eventType: 'CHECKOUT_COMPLETED',
			cartExternalId: 'c-abc', occurredAt: new Date('2026-05-21T03:10:00Z'),
		})
		const row = await repo.findById('row-1')
		expect(row?.props.eventType).toBe('CHECKOUT_COMPLETED')
		expect(row?.props.cartExternalId).toBe('c-abc')
	})

	it('does NOT expose a save method', () => {
		// @ts-expect-error — save is intentionally absent; Go is the only writer.
		repo.save
	})
})
```

- [ ] **Step 2: Verify failure → Step 3: Implement**

`PixelEventProjectionRepository.ts`:
```typescript
import type { PixelEventProjection } from '../../projections/PixelEventProjection'

export type PixelFunnelQueryInput = {
	storeIds: string[]
	storeIntegrationIds?: string[]
	startDate: Date
	endDate: Date
}

export type PixelTypeCount = {
	eventType: string // PixelEventType string-encoded
	count: number
	uniqueVisitors: number
}

export abstract class PixelEventProjectionRepository {
	abstract findById(id: string, tx?: unknown): Promise<PixelEventProjection | undefined>
	abstract findCountsByType(input: PixelFunnelQueryInput, tx?: unknown): Promise<PixelTypeCount[]>
	// Intentionally no save / insertIfNew / delete — Go owns writes.
}
```

`DrizzlePixelEventProjectionRepository.ts` (mirror `DrizzleVideoFeedProjectionRepository`):
- `findById`: `select().from(pixelEvents).where(eq(pixelEvents.id, id)).limit(1)` → hydrate via `PixelEventProjectionSchema.parse(row)`.
- `findCountsByType`: SQL `SELECT event_type, COUNT(*) AS count, COUNT(DISTINCT visitor_key) AS unique_visitors FROM tracking.pixel_events WHERE store_id = ANY($1) AND occurred_at BETWEEN $2 AND $3 [AND store_integration_id = ANY($4)] GROUP BY event_type`. Map to `PixelTypeCount[]`.

`MockPixelEventProjectionRepository.ts`:
- In-memory `Map<id, PixelEventProjection>`. Read methods filter the map. Declare a public `__seed(p: PixelEventProjection)` helper for use in flow tests.

`registry.ts`:
```typescript
import './errors'
import type { InstanceRegistry } from '@template/core-typescript'
import {
	PixelEventProjectionRepository,
	MockPixelEventProjectionRepository,
	DrizzlePixelEventProjectionRepository,
} from './repositories/PixelEventProjectionRepository'

export const INSTANCE_REGISTRY: InstanceRegistry = {
	mock: [{ token: PixelEventProjectionRepository, instance: MockPixelEventProjectionRepository }],
	integration: [{ token: PixelEventProjectionRepository, instance: DrizzlePixelEventProjectionRepository }],
	real: [{ token: PixelEventProjectionRepository, instance: DrizzlePixelEventProjectionRepository }],
}
```

- [ ] **Step 4: Verify pass + tsc/lint**

`bun test packages/api/typescript/src/tracking/repositories/ && bun tsc && bun lint`

- [ ] **Step 5: Commit**

```bash
git add packages/api/typescript/src/tracking/repositories/ packages/api/typescript/src/tracking/registry.ts
git commit -m "feat(tracking): PixelEventProjectionRepository (read-only) + Drizzle/Mock + DI (P8 Task 3)"
```

---

## Task 4: PixelEventProjector — no-op handle (subscription wiring only)

**Files:**
- Create: `packages/api/typescript/src/tracking/projections/projectors/PixelEventProjector.ts`
- Test: `packages/api/typescript/src/tracking/projections/projectors/PixelEventProjector.test.ts`
- Modify: `packages/api/typescript/src/tracking/index.ts` — pass `projectors: { PixelEventProjector }` to `BoundedContext.create`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /projector
**Depends on:** Task 3

> **Why a no-op Projector:** Tracking subscribes to `PixelEventRecordedEvent`
> for shape parity with sibling read sides — once a derived TS-side funnel
> cache is needed, the projector grows a real `handle`. Today the canonical
> row already exists in Postgres (Go-written) and no derived shape is needed.
> The framework still wires the subscription; the no-op `handle` simply
> documents "TS consumed the event and chose to do nothing."

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { PixelEventProjector } from './PixelEventProjector'
import { PixelEventRecordedEvent } from '@template/contracts-typescript/wire'

describe('PixelEventProjector', () => {
	it('lists the PixelEventRecordedEvent name in `events`', () => {
		expect(PixelEventProjector.prototype).toBeDefined()
		const inst = new PixelEventProjector()
		expect(inst.events).toContain(PixelEventRecordedEvent.name)
	})

	it('handle() resolves without writing — Go owns canonical rows', async () => {
		const inst = new PixelEventProjector()
		await expect(inst.handle({} as any)).resolves.toBeUndefined()
	})
})
```

- [ ] **Step 2: Verify failure → Step 3: Implement**

```typescript
import { injectable } from 'tsyringe-neo'
import { Projector } from '@template/core-typescript'
import { PixelEventRecordedEvent } from '@template/contracts-typescript/wire'
import type { PixelEventProjectionEvent } from '../PixelEventProjection'

/**
 * Tracking-side projector for pixel events.
 *
 * The canonical `tracking.pixel_events` row is written by go-worker (spec §6 —
 * "Go is the only writer of canonical tables"). TS reads via
 * PixelEventProjectionRepository. This Projector exists for shape parity with
 * sibling BCs and to register the subscription on InternalMediator so a future
 * derived TS-side funnel cache can grow into `handle()` without re-plumbing
 * the wiring.
 *
 * ref: dev:packages/api/typescript/src/ui/projections/projectors/VideoFeedProjector.ts
 */
@injectable()
export class PixelEventProjector extends Projector<PixelEventProjectionEvent> {
	readonly events = [PixelEventRecordedEvent.name] as const

	async handle(_event: PixelEventProjectionEvent): Promise<void> {
		// No-op: canonical row is already in Postgres via Go. No derived TS
		// projection is materialised in this iteration.
		return
	}
}
```

Modify `tracking/index.ts`:
```typescript
import { BoundedContext } from '@template/core-typescript'
import * as controllers from './controllers'
import { INSTANCE_REGISTRY } from './registry'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'
import { PixelEventProjector } from './projections/projectors/PixelEventProjector'

const ctx = await BoundedContext.create({
	name: '',
	controllers,
	internalHandlers,
	externalHandlers,
	projectors: { PixelEventProjector },
	registry: INSTANCE_REGISTRY,
})

export default ctx.router
```

- [ ] **Step 4: Verify pass + tsc/lint + commit**

```bash
bun test packages/api/typescript/src/tracking/projections/projectors/PixelEventProjector.test.ts && bun tsc && bun lint
git add packages/api/typescript/src/tracking/
git commit -m "feat(tracking): PixelEventProjector subscription stub (no-op handle) (P8 Task 4)"
```

---

## Task 5: T23 — GetPixelFunnel use case + controller (Contract Lock + behaviour together)

**Files:**
- Create: `packages/api/typescript/src/tracking/usecases/GetPixelFunnel.ts`
- Test: `packages/api/typescript/src/tracking/usecases/GetPixelFunnel.test.ts`
- Create: `packages/api/typescript/src/tracking/controllers/GetPixelFunnel.ts`
- Test: `packages/api/typescript/src/tracking/controllers/GetPixelFunnel.test.ts`
- Modify: `packages/api/typescript/src/tracking/controllers/index.ts` — re-export `GetPixelFunnelController`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query, /controller, /schema, /test
**Depends on:** Task 3

> **Decision:** funnel counts go through `PixelEventProjectionRepository.findCountsByType`
> (aggregation in SQL, not in TS). The use case stays a pure orchestrator —
> repo → reshape → return. Matches the BFF pattern in `ui/usecases/GetVideoFeed.ts`.
> Output shape matches spec §7.7 T23 exactly.

- [ ] **Step 1: Write failing tests** (use case + controller in same task — they ship together)

Use case test (integration, seed via raw `db.insert(pixelEvents)`):
```typescript
import { describe, expect, it, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container } from 'tsyringe-neo'
import { TestBed } from '@api-tests/support/TestBed'
import { DrizzleClient } from '@template/core-typescript'
import { pixelEvents } from '@template/contracts/db'
import { GetPixelFunnel } from './GetPixelFunnel'

let c = container.createChildContainer()
let tb: TestBed, q: GetPixelFunnel, db: DrizzleClient

beforeAll(async () => {
	tb = await TestBed.create('integration', { testContainer: c, ownerId: 'store-1' })
	q  = c.resolve(GetPixelFunnel)
	db = c.resolve(DrizzleClient)
})
beforeEach(async () => { await tb.reset() })
afterAll(async () => { await tb.destroy() })

describe('GetPixelFunnel (T23)', () => {
	it('returns stages in spec order with dropOff + conversionRate', async () => {
		await db.insert(pixelEvents).values([
			...Array.from({length: 100}, (_,i) => ({ id: `pv-${i}`, storeId: 'store-1', storeIntegrationId: 'si-1', storeIntegrationExternalId: 'shop', platform: 'SHOPIFY', externalEventId: `e-pv-${i}`, eventType: 'PAGE_VIEWED',          occurredAt: new Date('2026-05-21T03:00:00Z') })),
			...Array.from({length:  60}, (_,i) => ({ id: `pr-${i}`, storeId: 'store-1', storeIntegrationId: 'si-1', storeIntegrationExternalId: 'shop', platform: 'SHOPIFY', externalEventId: `e-pr-${i}`, eventType: 'PRODUCT_VIEWED',       occurredAt: new Date('2026-05-21T03:01:00Z') })),
			...Array.from({length:  10}, (_,i) => ({ id: `cc-${i}`, storeId: 'store-1', storeIntegrationId: 'si-1', storeIntegrationExternalId: 'shop', platform: 'SHOPIFY', externalEventId: `e-cc-${i}`, eventType: 'CHECKOUT_COMPLETED',   occurredAt: new Date('2026-05-21T03:10:00Z') })),
		])
		const out = await q.execute({
			dateRange: { startDate: '2026-05-21', endDate: '2026-05-21' },
			storeIds: ['store-1'],
		})
		const stageMap = Object.fromEntries(out.stages.map(s => [s.type, s]))
		expect(stageMap.PAGE_VIEWED.count).toBe(100)
		expect(stageMap.PRODUCT_VIEWED.count).toBe(60)
		expect(stageMap.CHECKOUT_COMPLETED.count).toBe(10)
		expect(stageMap.PRODUCT_VIEWED.dropOffFromPreviousPercent).toBeCloseTo(0.4, 2)
		expect(out.conversionRate).toBeCloseTo(0.1, 2)
	})

	it('zero-row date range returns 8 stages with count=0 and conversionRate=0', async () => {
		const out = await q.execute({
			dateRange: { startDate: '2026-05-21', endDate: '2026-05-21' },
			storeIds: ['store-1'],
		})
		expect(out.stages.length).toBe(8)
		expect(out.conversionRate).toBe(0)
	})
})
```

Controller test (schema-only — full HTTP harness exercised in PE-E2E):
```typescript
import { describe, expect, it } from 'bun:test'
import { GetPixelFunnelControllerInputSchema, GetPixelFunnelControllerOutputSchema } from './GetPixelFunnel'

describe('GetPixelFunnel controller contract', () => {
	it('input requires storeIds + dateRange via body', () => {
		expect(GetPixelFunnelControllerInputSchema.safeParse({
			body: { storeIds: ['s1'], dateRange: { startDate: '2026-05-01', endDate: '2026-05-21' } },
		}).success).toBe(true)
	})
	it('input rejects empty storeIds', () => {
		expect(GetPixelFunnelControllerInputSchema.safeParse({
			body: { storeIds: [], dateRange: { startDate: '2026-05-01', endDate: '2026-05-21' } },
		}).success).toBe(false)
	})
	it('output matches spec §7.7 T23 shape', () => {
		expect(GetPixelFunnelControllerOutputSchema.safeParse({
			stages: [
				{ type: 'PAGE_VIEWED',         count: 100, uniqueSessions: 80 },
				{ type: 'CHECKOUT_COMPLETED', count:  10, uniqueSessions:  9, dropOffFromPreviousPercent: 0.9 },
			],
			conversionRate: 0.1,
		}).success).toBe(true)
	})
})
```

- [ ] **Step 2: Verify failure → Step 3: Implement**

`usecases/GetPixelFunnel.ts`:
```typescript
import { injectable } from 'tsyringe-neo'
import { z } from '@template/core-typescript'
import { Handler } from '@template/core-typescript'
import { PixelEventType } from '@template/contracts-typescript/wire/enums'
import { PixelEventProjectionRepository } from '../repositories/PixelEventProjectionRepository'

export const GetPixelFunnelInputSchema = z.object({
	dateRange: z.object({
		startDate: z.string(), // ISO date — yyyy-mm-dd
		endDate: z.string(),
	}),
	storeIds: z.array(z.string()).min(1),
	storeIntegrationIds: z.array(z.string()).optional(),
})

export const GetPixelFunnelOutputSchema = z.object({
	stages: z.array(z.object({
		type: z.string(), // PixelEventType
		count: z.number().int().nonnegative(),
		uniqueSessions: z.number().int().nonnegative(),
		dropOffFromPreviousPercent: z.number().min(0).max(1).optional(),
	})),
	conversionRate: z.number().min(0).max(1),
})

// Canonical funnel order per spec §1.2 + §7.0 PixelEventType.
const STAGE_ORDER: string[] = [
	PixelEventType.PAGE_VIEWED,
	PixelEventType.PRODUCT_VIEWED,
	PixelEventType.PRODUCT_ADDED_TO_CART,
	PixelEventType.PRODUCT_REMOVED_FROM_CART,
	PixelEventType.CART_VIEWED,
	PixelEventType.CHECKOUT_STARTED,
	PixelEventType.CHECKOUT_CONTACT_INFO_SUBMITTED,
	PixelEventType.CHECKOUT_COMPLETED,
]

@injectable()
export class GetPixelFunnel extends Handler<typeof GetPixelFunnelInputSchema, typeof GetPixelFunnelOutputSchema> {
	readonly name = 'get_pixel_funnel' as const
	readonly inputSchema = GetPixelFunnelInputSchema
	readonly outputSchema = GetPixelFunnelOutputSchema

	constructor(private repo: PixelEventProjectionRepository) { super() }

	protected async handle(input: this['input']): Promise<this['output']> {
		const counts = await this.repo.findCountsByType({
			storeIds: input.storeIds,
			storeIntegrationIds: input.storeIntegrationIds,
			startDate: new Date(`${input.dateRange.startDate}T00:00:00.000Z`),
			endDate: new Date(`${input.dateRange.endDate}T23:59:59.999Z`),
		})
		const byType = new Map(counts.map(c => [c.eventType, c]))

		const stages = STAGE_ORDER.map((type, idx) => {
			const c = byType.get(type) ?? { eventType: type, count: 0, uniqueVisitors: 0 }
			let dropOffFromPreviousPercent: number | undefined
			if (idx > 0) {
				const prev = byType.get(STAGE_ORDER[idx - 1])?.count ?? 0
				dropOffFromPreviousPercent = prev > 0 ? Math.max(0, (prev - c.count) / prev) : undefined
			}
			return { type, count: c.count, uniqueSessions: c.uniqueVisitors, dropOffFromPreviousPercent }
		})

		const top = stages[0].count
		const bottom = stages[stages.length - 1].count
		const conversionRate = top > 0 ? bottom / top : 0

		return { stages, conversionRate }
	}
}
```

`controllers/GetPixelFunnel.ts` (mirror `ui/controllers/GetVideoFeed.ts`):
```typescript
import { injectable } from 'tsyringe-neo'
import { z } from '@template/core-typescript'
import { Controller, HttpStatusCode } from '@template/core-typescript'
import { GetPixelFunnel, GetPixelFunnelInputSchema, GetPixelFunnelOutputSchema } from '../usecases/GetPixelFunnel'

export const GetPixelFunnelControllerInputSchema = z.object({
	body: GetPixelFunnelInputSchema,
}).example([{ body: { dateRange: { startDate: '2026-05-01', endDate: '2026-05-21' }, storeIds: ['store-1'] } }])

export const GetPixelFunnelControllerOutputSchema = GetPixelFunnelOutputSchema.example([{
	stages: [
		{ type: 'PAGE_VIEWED', count: 100, uniqueSessions: 80 },
		{ type: 'CHECKOUT_COMPLETED', count: 10, uniqueSessions: 9, dropOffFromPreviousPercent: 0.9 },
	],
	conversionRate: 0.1,
}])

@injectable()
export class GetPixelFunnelController extends Controller<
	typeof GetPixelFunnelControllerInputSchema,
	typeof GetPixelFunnelControllerOutputSchema
> {
	readonly path = '/pixel-funnel'
	readonly method = 'post' as const
	readonly description = 'T23 PixelFunnel — counts, drop-off, conversion (spec §7.7)'
	readonly inputSchema = GetPixelFunnelControllerInputSchema
	readonly outputSchema = GetPixelFunnelControllerOutputSchema

	constructor(private q: GetPixelFunnel) { super() }

	async handle(req: this['input']): Promise<this['output']> {
		const data = await this.q.execute(req.body)
		return { status: HttpStatusCode.OK, data }
	}
}
```

Append to `tracking/controllers/index.ts`:
```typescript
export { GetPixelFunnelController } from './GetPixelFunnel'
```

- [ ] **Step 4: Verify pass + tsc/lint + commit**

```bash
bun test packages/api/typescript/src/tracking/usecases/GetPixelFunnel.test.ts \
         packages/api/typescript/src/tracking/controllers/GetPixelFunnel.test.ts && \
bun tsc && bun lint
git add packages/api/typescript/src/tracking/usecases/ packages/api/typescript/src/tracking/controllers/
git commit -m "feat(tracking): T23 PixelFunnel query + controller (P8 Task 5)"
```

---

## Task 6: T24 — GetPixelScriptSnippet use case + controller (Shopify-only)

**Files:**
- Create: `packages/api/typescript/src/tracking/usecases/GetPixelScriptSnippet.ts`
- Test: `packages/api/typescript/src/tracking/usecases/GetPixelScriptSnippet.test.ts`
- Create: `packages/api/typescript/src/tracking/controllers/GetPixelScriptSnippet.ts`
- Test: `packages/api/typescript/src/tracking/controllers/GetPixelScriptSnippet.test.ts`
- Modify: `packages/api/typescript/src/tracking/controllers/index.ts` — re-export `GetPixelScriptSnippetController`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query, /controller, /errors
**Depends on:** Task 1; **P4-INTEGRATION** (`StoreIntegrationRepository.findById`).

> **Per-platform mapper table** (T24 is the only place the snippet is rendered;
> growing past Shopify means adding entries to this map):
>
> | platform | supported | snippet template |
> |---|---|---|
> | `SHOPIFY` | yes | `<script src="https://cdn.bkdash.app/pixel/v1/{storeIntegrationId}.js">` + inline `window.bkdash` bootstrap |
> | `NUVEM_SHOP`, `CART_PANDA`, `YAMPI` | no | throws `PIXEL_NOT_SUPPORTED_FOR_PLATFORM` |
> | `KIWIFY` | no | throws `PIXEL_NOT_SUPPORTED_FOR_PLATFORM` (billing platform, not a storefront) |
>
> # QUESTION: confirm the CDN host `cdn.bkdash.app` — provisional. Replace
> with the real CDN once known. The script *content* lives in a separate
> static-asset pipeline; this query only renders the snippet text.
>
> # QUESTION: confirm `StoreIntegrationRepository` import path under
> polyglot. Likely `packages/api/typescript/src/integration/repositories/StoreIntegrationRepository`
> after P4-INTEGRATION lands. If P4 hasn't landed when this runs,
> stub the lookup behind a local `StoreIntegrationLookup` port and let P4
> wire it later.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container } from 'tsyringe-neo'
import { TestBed } from '@api-tests/support/TestBed'
import { GetPixelScriptSnippet } from './GetPixelScriptSnippet'
import { givenStoreIntegration } from '@api-tests/support/given/givenStoreIntegration' // from P4-INTEGRATION

let c = container.createChildContainer()
let tb: TestBed, q: GetPixelScriptSnippet

beforeAll(async () => {
	tb = await TestBed.create('integration', { testContainer: c, ownerId: 'store-1' })
	q  = c.resolve(GetPixelScriptSnippet)
})
beforeEach(async () => { await tb.reset() })
afterAll(async () => { await tb.destroy() })

describe('GetPixelScriptSnippet (T24)', () => {
	it('returns Shopify snippet for a SHOPIFY StoreIntegration', async () => {
		const si = await givenStoreIntegration(tb, { type: 'SALES_CHANNEL', platform: 'SHOPIFY', externalId: 'shop.myshopify.com' })
		const out = await q.execute({ storeIntegrationId: si.id })
		expect(out.platform).toBe('SHOPIFY')
		expect(out.scriptUrl).toContain(si.id)
		expect(out.inlineScript).toContain('window.bkdash')
		expect(out.installationInstructions).toContain('theme.liquid')
	})

	it('throws STORE_INTEGRATION_NOT_FOUND for missing integration', async () => {
		await expect(q.execute({ storeIntegrationId: 'missing' }))
			.rejects.toMatchObject({ code: 'STORE_INTEGRATION_NOT_FOUND' })
	})

	it('throws PIXEL_NOT_SUPPORTED_FOR_PLATFORM for non-SHOPIFY', async () => {
		const si = await givenStoreIntegration(tb, { type: 'SALES_CHANNEL', platform: 'NUVEM_SHOP', externalId: 'shop.nuvemshop.com' })
		await expect(q.execute({ storeIntegrationId: si.id }))
			.rejects.toMatchObject({ code: 'PIXEL_NOT_SUPPORTED_FOR_PLATFORM' })
	})
})
```

- [ ] **Step 2: Verify failure → Step 3: Implement**

```typescript
import { injectable } from 'tsyringe-neo'
import { z, Handler, BaseError } from '@template/core-typescript'
import { SalesPlatform } from '@template/contracts-typescript/wire/enums'
import { StoreIntegrationRepository } from '@integration/repositories/StoreIntegrationRepository'
import type { ApplicationErrors } from '../errors'

export const GetPixelScriptSnippetInputSchema = z.object({
	storeIntegrationId: z.string(),
})

export const GetPixelScriptSnippetOutputSchema = z.object({
	storeIntegrationId: z.string(),
	platform: z.string(), // SalesPlatform
	scriptUrl: z.string().url(),
	inlineScript: z.string(),
	installationInstructions: z.string(),
})

@injectable()
export class GetPixelScriptSnippet extends Handler<typeof GetPixelScriptSnippetInputSchema, typeof GetPixelScriptSnippetOutputSchema> {
	readonly name = 'get_pixel_script_snippet' as const
	readonly inputSchema = GetPixelScriptSnippetInputSchema
	readonly outputSchema = GetPixelScriptSnippetOutputSchema

	constructor(private storeIntegrationRepo: StoreIntegrationRepository) { super() }

	protected async handle(input: this['input']): Promise<this['output']> {
		const si = await this.storeIntegrationRepo.findById(input.storeIntegrationId)
		if (!si) throw new BaseError<ApplicationErrors>('STORE_INTEGRATION_NOT_FOUND')
		if (si.platform !== SalesPlatform.SHOPIFY) {
			throw new BaseError<ApplicationErrors>('PIXEL_NOT_SUPPORTED_FOR_PLATFORM')
		}
		return {
			storeIntegrationId: si.id,
			platform: SalesPlatform.SHOPIFY,
			scriptUrl: `https://cdn.bkdash.app/pixel/v1/${si.id}.js`,
			inlineScript: this.buildInlineScript(si.id),
			installationInstructions:
				'Paste this snippet in your Shopify theme.liquid file, immediately before the </body> tag. ' +
				'In the Shopify admin: Online Store → Themes → Actions → Edit Code → Layout/theme.liquid.',
		}
	}

	private buildInlineScript(storeIntegrationId: string): string {
		return [
			`<script>`,
			`(function(){window.bkdash={si:'${storeIntegrationId}'};`,
			`var s=document.createElement('script');s.async=1;`,
			`s.src='https://cdn.bkdash.app/pixel/v1/${storeIntegrationId}.js';`,
			`document.head.appendChild(s);})();`,
			`</script>`,
		].join('')
	}
}
```

`controllers/GetPixelScriptSnippet.ts`:
```typescript
import { injectable } from 'tsyringe-neo'
import { z, Controller, HttpStatusCode } from '@template/core-typescript'
import { GetPixelScriptSnippet, GetPixelScriptSnippetOutputSchema } from '../usecases/GetPixelScriptSnippet'

export const GetPixelScriptSnippetControllerInputSchema = z.object({
	params: z.object({ storeIntegrationId: z.string() }),
}).example([{ params: { storeIntegrationId: '0190f3a1-7c3d-7000-b000-000000000020' } }])

export const GetPixelScriptSnippetControllerOutputSchema = GetPixelScriptSnippetOutputSchema

@injectable()
export class GetPixelScriptSnippetController extends Controller<
	typeof GetPixelScriptSnippetControllerInputSchema,
	typeof GetPixelScriptSnippetControllerOutputSchema
> {
	readonly path = '/store-integrations/:storeIntegrationId/pixel-snippet'
	readonly method = 'get' as const
	readonly description = 'T24 PixelScriptSnippet — per-platform pixel install snippet (spec §7.7)'
	readonly inputSchema = GetPixelScriptSnippetControllerInputSchema
	readonly outputSchema = GetPixelScriptSnippetControllerOutputSchema

	constructor(private q: GetPixelScriptSnippet) { super() }

	async handle(req: this['input']): Promise<this['output']> {
		const data = await this.q.execute({ storeIntegrationId: req.params.storeIntegrationId })
		return { status: HttpStatusCode.OK, data }
	}
}
```

Append to `controllers/index.ts`:
```typescript
export { GetPixelScriptSnippetController } from './GetPixelScriptSnippet'
```

- [ ] **Step 4: Verify pass + tsc/lint + commit**

```bash
bun test packages/api/typescript/src/tracking/usecases/GetPixelScriptSnippet.test.ts \
         packages/api/typescript/src/tracking/controllers/GetPixelScriptSnippet.test.ts && \
bun tsc && bun lint
git add packages/api/typescript/src/tracking/
git commit -m "feat(tracking): T24 PixelScriptSnippet (Shopify-only) (P8 Task 6)"
```

---

## Task 7: Cross-platform pixel mapper extension shape (notes only — no new code)

This task is documentation-only; ships no test, no commit by itself (it
amends notes in Task 6's commit if required by the reviewer). Captured here
so the next engineer adding Nuvem Shop / CartPanda pixel intake knows where
the extension point lives.

> **Per-platform mapper extension shape.** When BK Dash grows pixel intake
> for a second platform, factor the `GetPixelScriptSnippet` use case into
> a discriminated map keyed by `SalesPlatform`:
>
> ```ts
> type PixelMapper = (storeIntegrationId: string) => Omit<Output, 'storeIntegrationId' | 'platform'>
> const MAPPERS: Partial<Record<SalesPlatform, PixelMapper>> = {
>   SHOPIFY: shopifyMapper,
>   NUVEM_SHOP: nuvemShopMapper,    // future
>   CART_PANDA: cartPandaMapper,    // future
>   YAMPI: yampiMapper,             // future
> }
> ```
>
> Each mapper produces `{ scriptUrl, inlineScript, installationInstructions }`.
> The exhaustiveness check (`default: throw new BaseError('PIXEL_NOT_SUPPORTED_FOR_PLATFORM')`)
> flags any unsupported platform at compile time. **In current scope only
> SHOPIFY is supported.** The corresponding Go-side pixel ingest pipeline
> for each new platform must land in PG-GO-WORKER first.

- [ ] **Step 1: Confirm the notes block is present in the source comment
  of `GetPixelScriptSnippet.ts`** (Task 6 should already include it; if
  not, add it as a header comment above `buildInlineScript`).
- [ ] **Step 2: No code, no test, no commit.** Note absorbed.

---

## Task 8: Sales-side PixelEventRecordedHandler — Cart→Order linking trigger (lives under sales/)

**Files (new — create only if `packages/api/typescript/src/sales/` does not yet exist; P6-SALES will append):**
- Create: `packages/api/typescript/src/sales/index.ts` (minimal skeleton)
- Create: `packages/api/typescript/src/sales/registry.ts` (empty `INSTANCE_REGISTRY`)
- Create: `packages/api/typescript/src/sales/controllers/index.ts` (empty barrel)
- Create: `packages/api/typescript/src/sales/handlers/internal.ts` (empty barrel)
- Create: `packages/api/typescript/src/sales/handlers/external.ts` (re-exports handler)
- Create: `packages/api/typescript/src/sales/handlers/PixelEventRecordedHandler.ts`
- Test: `packages/api/typescript/src/sales/handlers/PixelEventRecordedHandler.test.ts`
- Modify: `packages/api/typescript/src/index.ts` — append `import SalesRouter from '@sales/index'` + push into `routers`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler, /bounded-context
**Depends on:** Task 3 (PixelEventProjectionRepository); P4-INTEGRATION (for resolving `storeId` from the integration externalId)

> **Per spec §4 BC7 — Integration Events Consumed:** *"From go-worker
> outbox: PixelEventRecorded — a Sales handler scans for CHECKOUT_COMPLETED
> with a matching cartToken to link Carts → Orders."* Per spec §4 BC4, the
> Cart→Order link belongs to Sales, not Tracking. So the handler **lives in
> the Sales BC**, even though its trigger is a Tracking integration event.
>
> This sub-plan ships the handler narrowed to the Cart→Order trigger contract:
> it filters for `eventType === 'CHECKOUT_COMPLETED' && cartExternalId !== ''`
> and publishes the wire event `integration.cart_linked_to_order` (which is
> **already authored** in `packages/contracts/wire/events/cart-linked-to-order.tsp`).
> P6-SALES grows the actual Cart→Order linker — that's where the cart and
> order rows are inspected. This sub-plan only delivers the *trigger* end
> of the chain.
>
> # QUESTION: confirm `cart-linked-to-order.tsp` payload shape — if it
> requires an `orderId`, the handler can't fire here (no order yet linked).
> The likely shape is: `PixelCheckoutCompleted` should publish to a new
> wire event `integration.tracking.pixel_checkout_completed` so Sales has
> a dedicated trigger separate from the actual linkage. **Default below
> uses the existing `cart-linked-to-order.tsp` only as a placeholder — if
> reviewer confirms a new wire event is needed, add it in iter 41's
> follow-up and re-emit this task.**

- [ ] **Step 1: Write the failing test** (mock external mediator captures published events)

```typescript
import { describe, expect, it } from 'bun:test'
import { container } from 'tsyringe-neo'
import { TestBed } from '@api-tests/support/TestBed'
import { MockExternalMediator } from '@template/core-typescript'
import { PixelEventRecordedEvent } from '@template/contracts-typescript/wire'
import { PixelEventRecordedHandler } from './PixelEventRecordedHandler'

async function setup() {
	const c = container.createChildContainer()
	const tb = await TestBed.create('mock', { testContainer: c, ownerId: 'store-1' })
	const mediator = c.resolve(MockExternalMediator)
	const handler = c.resolve(PixelEventRecordedHandler)
	return { c, tb, mediator, handler }
}

describe('Sales PixelEventRecordedHandler', () => {
	it('publishes downstream trigger for CHECKOUT_COMPLETED + cartExternalId', async () => {
		const { tb, mediator, handler } = await setup()
		await handler.handle(new PixelEventRecordedEvent({
			ownerId: 'store-1',
			payload: {
				platform: 'SHOPIFY',
				storeIntegrationExternalId: 'shop.myshopify.com',
				eventType: 'CHECKOUT_COMPLETED',
				cartExternalId: 'c-abc',
				productExternalId: '',
			},
		}))
		expect(mediator.published.length).toBe(1)
		await tb.destroy()
	})

	it('drops events whose eventType is not CHECKOUT_COMPLETED', async () => {
		const { tb, mediator, handler } = await setup()
		await handler.handle(new PixelEventRecordedEvent({
			ownerId: 'store-1',
			payload: { platform: 'SHOPIFY', storeIntegrationExternalId: 'shop', eventType: 'PAGE_VIEWED', cartExternalId: '', productExternalId: '' },
		}))
		expect(mediator.published.length).toBe(0)
		await tb.destroy()
	})

	it('drops CHECKOUT_COMPLETED without cartExternalId', async () => {
		const { tb, mediator, handler } = await setup()
		await handler.handle(new PixelEventRecordedEvent({
			ownerId: 'store-1',
			payload: { platform: 'SHOPIFY', storeIntegrationExternalId: 'shop', eventType: 'CHECKOUT_COMPLETED', cartExternalId: '', productExternalId: '' },
		}))
		expect(mediator.published.length).toBe(0)
		await tb.destroy()
	})
})
```

# QUESTION: confirm `MockExternalMediator.published` shape — sibling tests
in `packages/api/typescript/src/notifications/` use it; if the API differs,
adapt to whichever spy helper TestBed exposes.

- [ ] **Step 2: Verify failure → Step 3: Implement**

`PixelEventRecordedHandler.ts`:
```typescript
import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@template/core-typescript'
import { PixelEventRecordedEvent, PixelEventType } from '@template/contracts-typescript/wire'

/**
 * Sales-side reaction to Tracking's pixel firehose.
 *
 * Per spec §4 BC4 + BC7, Sales owns Cart→Order linking. When a Shopify
 * Pixel `CHECKOUT_COMPLETED` event lands with a cartExternalId, Sales' linker
 * scans `sales.carts` for a matching row and stamps `linked_order_id`.
 *
 * This handler is the *trigger* end: it filters the firehose to only the
 * narrow event Sales cares about, then republishes a downstream integration
 * event. P6-SALES grows the actual linker that subscribes to that downstream
 * event and walks the carts table.
 *
 * ref: dev:packages/api/typescript/src/notifications/handlers/NotifySubscribersHandler.ts
 */
@injectable()
export class PixelEventRecordedHandler extends EventHandler<typeof PixelEventRecordedEvent> {
	readonly event = PixelEventRecordedEvent

	constructor(private externalMediator: ExternalMediator) { super() }

	async handle(event: this['input']): Promise<this['output']> {
		const { eventType, cartExternalId } = event.payload
		if (eventType !== PixelEventType.CHECKOUT_COMPLETED) return
		if (!cartExternalId) return

		// # QUESTION: emit which wire event? `cart-linked-to-order.tsp` expects an
		// orderId we don't have yet. If reviewer agrees, author a new
		// `integration.tracking.pixel_checkout_completed` wire event in iter 41's
		// follow-up and publish that here. Until then the handler short-circuits
		// to a no-op publish (still useful: it validates the subscription wiring).
		// await this.externalMediator.publish(new PixelCheckoutCompletedEvent({ … }))
		void this.externalMediator
	}
}
```

`sales/handlers/external.ts`:
```typescript
export { PixelEventRecordedHandler } from './PixelEventRecordedHandler'
```

`sales/index.ts` (minimal — P6 will fill in):
```typescript
import { BoundedContext } from '@template/core-typescript'
import * as controllers from './controllers'
import { INSTANCE_REGISTRY } from './registry'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'

const ctx = await BoundedContext.create({
	name: '',
	controllers,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
})

export default ctx.router
```

`sales/registry.ts`:
```typescript
import type { InstanceRegistry } from '@template/core-typescript'

export const INSTANCE_REGISTRY: InstanceRegistry = {
	mock: [], integration: [], real: [],
}
```

Modify `packages/api/typescript/src/index.ts` to mount the new SalesRouter.

- [ ] **Step 4: Verify pass + tsc/lint + commit**

```bash
bun test packages/api/typescript/src/sales/handlers/PixelEventRecordedHandler.test.ts && bun tsc && bun lint
git add packages/api/typescript/src/sales/ packages/api/typescript/src/index.ts
git commit -m "feat(sales): PixelEventRecordedHandler (Cart→Order trigger) lives under sales/ (P8 Task 8)"
```

---

## Task 9: PixelEventProjector integration test — subscription wiring end-to-end

**Files:**
- Test: `packages/api/typescript/src/tracking/projections/projectors/PixelEventProjector.integration.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /projector, /test
**Depends on:** Task 4

> **Why a second test:** Task 4's unit test only asserts `events.contains(...)`
> and no-op `handle()`. This task asserts the wiring — that when the BC is
> bootstrapped, the framework registers the `PixelEventRecordedEvent` name
> on `InternalMediator` and invoking the mediator dispatches to the projector's
> `handle()`. Mirror sibling `VideoFeedProjector.test.ts` integration tests.

- [ ] **Step 1: Write the failing test** — mirror sibling `VideoFeedProjector.test.ts`; instantiate the BC via `BoundedContext.create({ projectors: { PixelEventProjector }, … })`, resolve `InternalMediator`, publish a `PixelEventRecordedEvent`, assert handler called.

- [ ] **Step 2: Verify failure → Step 3: Implement** — usually no code change is needed beyond Task 4. If wiring is missing, fix `tracking/index.ts` to pass `projectors: { PixelEventProjector }`.

- [ ] **Step 4: Verify pass + tsc/lint + commit**

```bash
bun test packages/api/typescript/src/tracking/projections/projectors/PixelEventProjector.integration.test.ts && bun tsc && bun lint
git add packages/api/typescript/src/tracking/projections/projectors/
git commit -m "test(tracking): PixelEventProjector subscription wiring (P8 Task 9)"
```

---

## Task 10: SDK regen — emit OpenAPI + regenerate @template/client

**Files:**
- Regen: `packages/api/typescript/public/docs/openapi.json`
- Regen: `packages/client/dist/**`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** Tasks 1–9

- [ ] **Step 1: Regenerate**

```bash
bun emit-openapi && bun sdk
```

- [ ] **Step 2: Inspect regen diff**

```bash
git diff --stat packages/client/dist/ packages/api/typescript/public/docs/openapi.json
```

Expected new endpoints in `openapi.json`:
- `POST /pixel-funnel` (T23)
- `GET  /store-integrations/:storeIntegrationId/pixel-snippet` (T24)

Expected new SDK hooks in `packages/client/dist/`:
- `useGetPixelFunnel` (mutation — POST with body) or `useGetPixelFunnelInfinite` per Kubb config
- `useGetPixelScriptSnippet` (query — GET)

- [ ] **Step 3: Commit**

```bash
git add packages/api/typescript/public/docs/openapi.json packages/client/dist/
git commit --allow-empty -m "chore(sdk): regen after P8-TRACKING T23+T24 (P8 Task 10)"
```

---

## Task 11: Final sweep — tsc + lint + test + AC mapping

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /test, /sdk
**Depends on:** Task 10

- [ ] **Step 1: Quality gates**

```bash
bun tsc      # → 0 errors across all workspaces
bun lint     # → 0 errors
bun run test # → all green, 0 skipped
```

- [ ] **Step 2: Final tick — record AC mapping in commit body (no code change)**

```bash
git commit --allow-empty -m "$(cat <<'EOF'
chore(tracking): P8-TRACKING final validation sweep (P8 Task 11)

AC mapping (spec §7.7 + §4 BC7 → tests):
- §7.0 PixelEventType (8 stages) — projections/PixelEventProjection.test.ts
- §4 BC7 PixelEvent projection shape — projections/PixelEventProjection.test.ts
- §4 BC7 Repository is read-only — repositories/.../DrizzlePixelEventProjectionRepository.test.ts (@ts-expect-error save)
- §4 BC7 PixelEventRecorded → CHECKOUT_COMPLETED + cartExternalId trigger — sales/handlers/PixelEventRecordedHandler.test.ts
- §6 Go is the only writer — Drizzle schema is consumed read-only; no new TS migration emitted
- §7.7 T23 PixelFunnel — usecases/GetPixelFunnel.test.ts + controllers/GetPixelFunnel.test.ts
- §7.7 T24 PixelScriptSnippet (PIXEL_NOT_SUPPORTED_FOR_PLATFORM for non-Shopify) — usecases/GetPixelScriptSnippet.test.ts + controllers/GetPixelScriptSnippet.test.ts
- §4 BC7 Projector subscription wiring — projections/projectors/PixelEventProjector.integration.test.ts
EOF
)"
```

---

## Final Validation

- [ ] `bun tsc` — 0 errors across all workspaces
- [ ] `bun lint` — 0 errors
- [ ] `bun run test` — all green
- [ ] `bun e2e --grep "tracking"` — N/A this sub-plan (Playwright pixel-funnel flow lands in PE-E2E)
- [ ] **AC mapping table (every spec §7.7 read + §4 BC7 surface → ≥1 test):**

  | Spec ref | Behavior | Test path |
  |---|---|---|
  | §7.0 `PixelEventType` (8 stages) | Funnel walks all 8 stages in canonical order | `tracking/usecases/GetPixelFunnel.test.ts` |
  | §4 BC7 `PixelEvent` shape (16 cols) | Projection parses canonical row | `tracking/projections/PixelEventProjection.test.ts` |
  | §4 BC7 Repository is read-only | `save` absent at type level | `tracking/repositories/.../DrizzlePixelEventProjectionRepository.test.ts` (`@ts-expect-error`) |
  | §4 BC7 Subscription registered for PixelEventRecorded | Mediator dispatches to projector `handle()` | `tracking/projections/projectors/PixelEventProjector.integration.test.ts` |
  | §4 BC7 Sales-side trigger (CHECKOUT_COMPLETED + cartExternalId) | Handler narrows + republishes | `sales/handlers/PixelEventRecordedHandler.test.ts` |
  | §6 Go-only writer | No new TS migration emitted | manual reviewer check + `bun migrate:dev` reports zero new TS migrations |
  | §7.7 T23 PixelFunnel | counts + drop-off + conversion | `tracking/usecases/GetPixelFunnel.test.ts` + `tracking/controllers/GetPixelFunnel.test.ts` |
  | §7.7 T24 PixelScriptSnippet | Shopify snippet + `PIXEL_NOT_SUPPORTED_FOR_PLATFORM` for non-Shopify + `STORE_INTEGRATION_NOT_FOUND` | `tracking/usecases/GetPixelScriptSnippet.test.ts` + `tracking/controllers/GetPixelScriptSnippet.test.ts` |

- [ ] **UTM attribution scope clarification.** The master plan mentions
  *"Joins UTM metadata on orders → marketing campaigns for attribution
  analytics."* Per spec that join is **P11-ANALYTICS** (BC9), not Tracking.
  This sub-plan ships the **building blocks** Analytics needs: the `utm`
  jsonb column on `pixel_events` (Drizzle schema iter 42) and the read repo's
  ability to extend with a `findUtmBreakdown` later. No ROAS or attribution
  roll-up here. # QUESTION: confirm with reviewer whether to surface a thin
  `findUtmBreakdown` repo method now so Analytics can depend on it, or let
  Analytics query `pixel_events.utm->>'source'` directly. Default: defer to
  Analytics — drop until needed.

---

## Notes

- **Why all reads live in `tracking/`, not `ui/`.** Sibling polyglot has a
  single `ui/` BFF context that already owns video-feed reads. For BK Dash,
  spec §7.7 assigns reads T23 + T24 directly to BC7 Tracking. Following the
  spec keeps the BC self-contained and avoids cross-context churn when the
  future Analytics roll-ups (ROAS, attribution) need access to the same repo.
- **Why the Sales handler lives in `sales/handlers/external.ts` and not in
  Tracking.** Spec §4 BC4 places Cart→Order linking in Sales. The handler
  is a Sales-side responsibility; it just happens to be triggered by a
  Tracking integration event. The split keeps both BCs honest: Tracking
  doesn't reach into `carts`; Sales doesn't define pixel domain shapes.
- **Why a no-op `PixelEventProjector`.** Sibling `VideoFeedProjector`
  materialises a denormalised feed row from multiple events. Tracking's
  canonical row is already in Postgres via Go and no derived TS-side
  read-model is needed for T23/T24 (the funnel query aggregates directly
  via SQL). We keep the Projector class — same shape as sibling — so the
  subscription is wired and future derivations (e.g., a per-store hourly
  funnel cache) plug in by replacing the no-op body.
- **No new migration emitted by this sub-plan.** The Drizzle schema for
  `tracking.pixel_events` is already authored at
  `packages/contracts/db/schema/tracking.ts` (iter 42). PG-GO-WORKER owns
  the migration apply. This sub-plan only declares TS-side types over the
  existing table.
- **`tracking.pixel_events` schema column drift from the spec.** The
  Drizzle schema (iter 42) uses `eventType` (not `type`), `cartExternalId`
  (not `cartToken`), `productExternalId` + `visitorKey` (instead of the
  spec's `productExternalIds[]` + `customerEmail`), and `utm` (jsonb) for
  UTM fields (instead of the spec's bare `payload`). The PixelEventProjection
  follows the Drizzle truth; the spec's §4 BC7 description of column names
  is from a pre-rebase iteration. If reviewer wants the spec aligned,
  open a doc-only follow-up — code already matches the migration.
- **No JSON Schema generation overlap.** This sub-plan generates OpenAPI for
  `/pixel-funnel` + `/store-integrations/:id/pixel-snippet`. Both endpoints
  live under the `tracking` BC's router. No name clash with `ui/` endpoints.
- **`StoreIntegrationRepository.findById` is a P4-INTEGRATION dependency.**
  If P4 hasn't landed when Task 6 runs, stub the dependency behind a local
  port (`StoreIntegrationLookup`) and let P4 wire the real impl later.
  Surface the gap as `# QUESTION:` in progress.md.
- **No `ExternalMediator` publication in Task 8 today** — handler short-circuits
  to a no-op publish until a dedicated `integration.tracking.pixel_checkout_completed`
  wire event is authored (iter 41 follow-up). Reviewer call: ship the
  no-op trigger now (validates wiring + filter logic) or block this task
  until the wire event lands. Default: ship the no-op + open the follow-up.

## Dependency footer

- **Hard upstream dependencies:**
  - **Iter 41 (`packages/contracts/wire/`)** — `PixelEventRecordedEvent`,
    `PixelEventType`, `SalesPlatform` already authored and generated.
    (Verified: `packages/contracts/wire/events/pixel-event-recorded.tsp`,
    `wire/enums/pixel-event-type.tsp`, `wire/enums/sales-platform.tsp`.)
  - **Iter 42 (`packages/contracts/db/schema/tracking.ts`)** — table
    already shipped (16 cols + 7 indexes). No new migration here.
  - **P1-IDENTITY** — `ctx.user` shape; auth middleware applied at framework
    layer. Both endpoints in this sub-plan are auth-gated.
  - **P2-TENANCY** — `storeIds[]` contract; membership middleware validating
    user can read the given `storeIds` for T23.
  - **P4-INTEGRATION** — `StoreIntegrationRepository.findById` for T24.
  - **PG-GO-WORKER** — writes the canonical rows + publishes the Redis Stream
    `integration.shared.pixel_event.recorded`.

- **Soft upstream (consumes events from):**
  - **PG-GO-WORKER** outbox — the only producer of `PixelEventRecordedEvent`.

- **Downstream consumers (sub-plans that depend on P8):**
  - **P6-SALES** — extends the `sales/handlers/external.ts` barrel this
    sub-plan creates; grows the actual Cart→Order linker behind the trigger
    this handler emits.
  - **P11-ANALYTICS** — depends on `PixelEventProjectionRepository` for
    funnel-adjacent analytics queries; depends on the `utm` jsonb column for
    attribution roll-ups.
  - **PE-E2E** — adds the `pixel-funnel-completeness` flow per master plan;
    requires T23 + T24 SDK hooks (delivered by Task 10).

- **Context Map (spec §5):** Tracking is **Customer/Supplier** of Sales
  (publishes `PixelEventRecorded`, Sales consumes for Cart→Order link) and
  **Conformist** of Finance (no monetary writes here — N/A in this sub-plan).
  No new relationships introduced.

## Open questions to surface in `progress.md`

1. # QUESTION: confirm `@tracking/*` and `@sales/*` TS path aliases — does
   `packages/api/typescript/tsconfig.json` wildcard `@<bc>/*` (sibling
   precedent: `@auth/*`, `@notifications/*`, `@ui/*` are explicit), or
   each new BC needs an explicit entry?
2. # QUESTION: if P4-INTEGRATION lands first and already declares
   `STORE_INTEGRATION_NOT_FOUND` in its `registerErrorCodes`, drop the
   duplicate from `tracking/errors/index.ts`.
3. # QUESTION: confirm CDN host `cdn.bkdash.app` for the Shopify Pixel
   script. Provisional placeholder used in Task 6.
4. # QUESTION: should the Sales handler publish to the existing
   `integration.cart_linked_to_order` wire event (likely no — requires
   an orderId we don't have) or trigger a new
   `integration.tracking.pixel_checkout_completed` event authored in an
   iter 41 follow-up? Default: open the follow-up; ship Task 8 with a
   no-op publish that still proves the filter + subscription.
5. # QUESTION: confirm `MockExternalMediator.published` API — adapt
   Task 8 test to whichever spy helper TestBed exposes.
6. # QUESTION: confirm `bun cli context tracking` is supported under the
   polyglot CLI; if not, hand-create the folder tree (already documented in
   Task 1's file list).
7. # QUESTION: surface `findUtmBreakdown` repo method now (for Analytics)
   or defer? Default: defer to P11-ANALYTICS — add only when demanded.
