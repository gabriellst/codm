# Backend Architecture

> Full architectural reference for the TypeScript `api` (`packages/api/typescript`) and the Go
> worker (`packages/api/go`).
> The **why** behind the patterns. For **how** to implement each artifact, load the matching
> `.claude/skills/<name>/SKILL.md`.

The project is **DDD + Clean Architecture + CQRS + Event-Driven**. Every rule below exists to keep
bounded contexts independent so the system can evolve without rewrites.

The two backends share **one Postgres** and a **single source of truth** for cross-boundary
contracts — `packages/contracts` (TypeSpec wire enums + integration events, Drizzle DB schema),
codegen'd into per-language bindings (`@codm/contracts-typescript`, `template/core-go`
imports). Between the two services, transport is **Redis streams** (an `ExternalMediator` over an
outbox) — there is no Kafka.

---

## Bounded Contexts

### TypeScript (`packages/api/typescript/src`)

`auth`, `billing`, `owner`, `quota`, `notifications`, `ui`, `shared`.

| Context | Owns |
|---|---|
| **`auth`** | The user. BetterAuth session, `User` + `UserProfile` + `Account`, FCM registration tokens, `AuthAccountMiddleware`, `SessionSchema`. |
| **`billing`** | Subscriptions, invoices, charges, payment methods, checkout sessions, disputes, credit notes. Webhook ingest, payment-provider ports (Stripe / Pagar.me / PagBank / Mercado Pago / Asaas / Sandbox), dunning, reconciliation jobs. |
| **`owner`** | Tenant identity — the `Owner` aggregate (one `responsibleUserId`) and `RequireOwner`, the single-tenant authorization primitive. |
| **`quota`** | Resource governance — the entitlement port, quota gate, override ledger, and `ResourceLimitEnforcer`. Reacts to billing's cross-context `SubscriptionChangedEvent`. |
| **`notifications`** | `Notification` + `NotificationDelivery` and the FCM / mail delivery side-effects. |
| **`ui`** | The BFF — **query use cases** (read DTOs assembled with direct Drizzle access) plus the `ListenEvents` SSE stream. Owns no aggregates. |
| **`shared`** | The root context. Composes `ALL_REGISTRIES`, boots the outbox dispatcher + external mediator, and holds cross-cutting value objects (`Money`, `Phone`, `Timeline`), read atoms (`Metric`), the `IdempotencyScope` enum, `QuotaKeys`, and `OwnerDirectory`. |

Each domain context owns the same folder shape:

```
src/<context>/
├── controllers/     # HTTP endpoints + Zod schemas
├── entities/        # Aggregate roots + entities (rich behavior)
├── enums/           # Context-local closed vocabularies (paired with pgEnum in contracts)
├── errors/          # Domain / application / interface / infrastructure error codes + HTTP mapping
├── events/          # Domain events raised inside this context
├── handlers/
│   ├── internal.ts  # Barrel of domain-event handlers (InternalMediator)
│   └── external.ts  # Barrel of integration-event handlers (ExternalMediator)
├── jobs/            # (optional) repeatable commands — BillingClockJob, DunningRetryJob, …
├── middlewares/     # HTTP cross-cutting; default export = context defaults
├── objects/         # Value objects (immutable, self-validating)
├── repositories/    # <Name>Repository interface + Drizzle<Name>Repository + Mock<Name>Repository
├── services/        # Domain / application services
├── usecases/        # Application commands (one per business operation)
├── registry.ts      # Per-context DI bindings — INSTANCE_REGISTRY via expandBindings (envs as columns)
└── index.ts         # BoundedContext.create({...}) — wires the context
```

Two contexts are special:
- **`ui`** owns **query use cases** (BFF reads with direct Drizzle access). It does not own aggregates and it is the one place cross-context read shapes may be assembled.
- **`shared`** is the `root: true` context — base infra composition, the composed registry, and the integration-event / value-object vocabulary reused across contexts.

Context identity is declared **once** in `shared/contexts.ts` (`CONTEXTS`). The composition root
`routers.ts` wires every context's `Router` against that manifest with `satisfies
Record<ContextModule, Router>`, so adding a context without wiring it (or dropping one) is a
**compile error**, not a silent gap. Most contexts mount at the root prefix (`name: ''`) and carry
version-relative controller paths (`/subscriptions`, `/session`); only `ui` declares a path prefix.

### Go (`packages/api/go`)

The Go side is a **worker / indexer / scheduler** backend (module `template/api-go`), not a second
web app. `cmd/api/main.go` boots the shared infrastructure via `fx.New(shared.Module,
fx.Invoke(shared.StartHTTPServer))` — clean boilerplate with **no domain contexts yet**; a context
adds its own `fx.Module` here (e.g. `sync.Module`) as it is created.

`packages/api/go/core` (module `template/core-go`) mirrors the TypeScript core primitive-for-primitive:

| Layer | Go (`core/…`) | TS (`core/src/…`) |
|---|---|---|
| Entity base | `entities/base_entity.go` | `entities/BaseEntity.ts` |
| Repository | `repositories/*.go` | `repositories/Repository.ts` |
| Domain-event repo | `repositories/pg_domain_event_repository.go` | `repositories/DrizzleDomainEventRepository.ts` |
| Mediators | `services/mediator/{internal,memory,redis,log}_mediator.go` | `services/Mediator/*` |
| Outbox dispatcher | `services/outbox/outbox_dispatcher.go` | `services/OutboxDispatcher/*` |
| Unit of work | `services/unitofwork/` | `services/UnitOfWork/*` |
| Controller / Handler | `types/{controller,handler,events}.go` | `types/{Controller,Handler,BaseEvent}.ts` |
| Error mapper | `errors/{mapper,codes}.go` | `utils/GlobalErrorMapper.ts` + `errors/codes.ts` |
| SDK client to TS | `services/tsclient/provider.go` | (SDK `@codm/client-typescript`) |

DI is **uber-go/fx** modules (`core/module.go`) rather than tsyringe. The Go `redis_mediator.go` is
the mirror of `RedisExternalMediator` — the two services meet on the same Redis streams.

---

## First-Class Citizens

These are the building blocks the codebase is composed of. Each has a corresponding
`.claude/skills/<name>/SKILL.md` that is the authoritative playbook.

| Citizen | Lives in | Role | Relates to |
|---|---|---|---|
| **BoundedContext** | `<ctx>/index.ts` | `BoundedContext.create({...})` — wires controllers, handlers, projectors, jobs, and the context's DI child container | Aggregates everything below |
| **Entity / AggregateRoot** | `<ctx>/entities/` | Identity + behavior + invariants; `static schema` (Zod) validated by the constructor; raises domain events via `addDomainEvent` | Composed of value objects + enums; persisted by repository |
| **Value Object** | `<ctx>/objects/` (or `shared/objects/` when reused) | Immutable, self-validating concept without identity (`Money`, `Phone`, `Mandate`, `PaymentInstrument`) | Embedded in entities via `z.instance(VO)` |
| **Enum** | `<ctx>/enums/` (context-local) or `contracts/wire/enums` (cross-boundary) | Closed vocabulary — paired with `pgEnum` in the contracts DB schema | Used by entities + schemas |
| **Error** | `<ctx>/errors/index.ts` | Typed codes (`DomainErrors` / `ApplicationErrors` / `InterfaceErrors` / `InfrastructureErrors`) each with an HTTP status via `registerErrorCodes` | Thrown as `BaseError<T>('CODE')` |
| **Schema** | inline in controller / use case / entity | Zod shape at a validation edge; the controller's becomes the SDK contract | Compiled into SDK Zod schemas via OpenAPI |
| **Controller** | `<ctx>/controllers/` | HTTP boundary — `path` + `method` + `inputSchema`/`outputSchema` + `middlewares`; validates then delegates to a use case | Calls use cases; never touches repositories |
| **Use Case (command)** | `<ctx>/usecases/` | Extends core `Handler`; orchestrates aggregates inside `withTransaction`; persists via repositories; saves events through `domainEventRepository` | Called by controller; touches entities + repositories |
| **Query Use Case** | `ui/usecases/` | Read-only DTOs assembled with direct Drizzle queries (BFF) | Bypasses aggregate rehydration on purpose |
| **Repository** | `<ctx>/repositories/<Name>Repository/` | `<Name>Repository` interface + `Drizzle<Name>Repository` + `Mock<Name>Repository`; loads/saves aggregates, accepts a `tx` | Receives entity; returns entity |
| **Service** | `<ctx>/services/` | Logic that spans aggregates or fronts an external port (payment providers, webhook mappers/verifiers, derivers) | Composed by use cases + handlers |
| **Domain Event** | `<ctx>/events/` | Past-tense fact **within** this context; raised by entities / seeded by use cases; `name = '<ctx>.<fact>'` | Dispatched by `InternalMediator`; never crosses a service |
| **Integration Event** | `contracts/wire/events` → `@codm/contracts-typescript/wire/events` | Cross-context / cross-service contract; `name = 'integration.<ctx>.<fact>'` | Published via `saveIntegrationEvent`; consumed by `handlers/external.ts` |
| **Handler (internal)** | `<ctx>/handlers/internal.ts` | Reacts to **this** context's domain events; write-side side-effects; may publish integration events | Registered on the `InternalMediator` |
| **Handler (external)** | `<ctx>/handlers/external.ts` | Reacts to integration events from other contexts/services | Registered on the `ExternalMediator` |
| **Projector** | `<ctx>/projections/projectors/` | Read-side counterpart of a handler — one per projection, subscribes to an event union, mutates a read model via `find → applyEvent → save`. An **available core primitive** (`BoundedContext.create({ projectors })`); the stock contexts maintain read models with ordinary handlers + BFF queries instead | Only knows its `ProjectionRepository` |
| **Job** | `<ctx>/jobs/` | A repeatable command (`{ handler, repeat }`) enqueued through the `CommandQueue` at boot | `BillingClockJob`, `DunningRetryJob`, reconcilers |
| **Middleware** | `<ctx>/middlewares/` | HTTP cross-cutting (auth, tenancy); throws typed `BaseError` codes | Wired in `BoundedContext.create` |
| **Registry** | `<ctx>/registry.ts` | `INSTANCE_REGISTRY` — `expandBindings([{ token, mock, real, integration? }])`, expanded per env (`mock` / `integration` / `real`) | Composed via `CONTEXT_REGISTRIES` in `shared/registry.ts` into `ALL_REGISTRIES` |
| **UnitOfWorkFactory** | `@codm/core-typescript` | Transaction boundary; `Handler.withTransaction(tx, fn)` opens one when none is passed | Used inside command use cases + handlers |
| **InternalMediator** | `@codm/core-typescript` | In-process fan-out of domain events (EventEmitter2) | Drained by the `OutboxDispatcher` |
| **ExternalMediator** | `@codm/core-typescript` | Cross-service transport for integration events — Redis streams in prod, in-process otherwise | Consumed by external handlers |
| **OutboxDispatcher** | `@codm/core-typescript` | Polls `outbox`, fans out via `InternalMediator`, finalizes | `DrizzleOutboxDispatcher` in integration/real |
| **DomainEventRepository** | `@codm/core-typescript` | Persists events to `events` (audit) + `outbox` (dispatch) atomically; `save` / `saveMany` / `saveIntegrationEvent` / `saveIfNotExists` | Called by use cases + handlers |
| **IdempotencyGuard** | `@codm/core-typescript` | `claim(scope, key, tx)` — the at-least-once dedup used at every ingest / event boundary | `DrizzleIdempotencyGuard` in integration/real |
| **HealthCheck** | `@codm/core-typescript` | Abstract: `name`, `gate` (`true` fails readiness, `false` is diagnostic-only), `check(): Promise<HealthComponentReport>` | Multi-injected into `HealthService` via the `HEALTH_CHECKS` token; concrete checks (`DatabaseHealthCheck`, `MigrationsHealthCheck`, `PollingHealthCheck`) live beside `Controller`/`OutboxDispatcher` as core citizens |
| **HealthService** | `@codm/core-typescript` | Aggregates every registered `HealthCheck` into one `HealthReport` (`ready` + a `components` map); a check that throws becomes a `down` component, never an escaped exception | Consumed by `HealthController`/`GET /v1/health` (TS) and its Go twin `GET /api/health`; `ready` is `false` only when a `gate: true` component is `down` |

> Note: use cases and event handlers **both** extend the same core `Handler<Input, Output>` base —
> a use case is a `Handler` with a `name`, `inputSchema`, `outputSchema`, and a `handle(input, tx?)`;
> an `EventHandler<E>` is a `Handler` whose input is the event instance and whose `event` field
> declares the class(es) it subscribes to. The base supplies `withTransaction`, `domainEventRepository`,
> `unitOfWorkFactory`, and `internalMediator`, lazily resolved from the bound DI container.

> Note — `HealthCheck` is the repo's first use of tsyringe-neo **multi-inject**, and it shipped only
> after three findings were proven by an espiga (throwaway `bun -e` script, kept as
> `HealthService.test.ts`'s first `describe`):
> 1. **The token is the STRING `'HealthCheck'`, never the abstract class.** `resolveAll` on a token
>    that is a class does not throw when nothing is registered — it *constructs the abstract class*
>    and hands back a methodless instance, silently. The same string token, unregistered, throws
>    naming itself. A footgun this repo had already been bitten by once (`shared/registry.ts`
>    documents an unbound-abstract boot failure) — string tokens fail loud instead of quiet.
> 2. **A child container SHADOWS its parent on a multi-inject token, it does not merge.** `N`
>    registrations on the root plus `M` on a child container make `child.resolveAll(TOKEN)` return
>    only the child's `M` — the root's `N` never appear. Every `HealthCheck` must therefore land in
>    the SAME container; `BoundedContext.create` already sends every context's registry to the
>    single `rootContainer`, which is what makes this work across bounded contexts.
> 3. **`resolve()` (singular) on a multi-inject token returns the LAST registration, silently** —
>    another reason nothing resolves `HealthCheck` by single-instance injection; only `resolveAll`
>    (via the `healthChecksFrom(container)` guard, which returns `[]` when the token was never
>    registered — `mock`/`integration` declare absence on purpose) is a safe read of the token.



---

## Dependency Direction (the only diagram that matters)

```
            ┌────────────────────────────────────────────────────────┐
            │                     Controller                          │  HTTP boundary
            └────────────────────┬────────────────────────────────────┘
                                 │ calls .execute()
            ┌────────────────────▼────────────────────────────────────┐
            │            Use Case  (command)        Query Use Case     │  Application
            └────┬────────────────────┬──────────────────┬────────────┘
                 │ uses               │ persists         │ reads (Drizzle)
                 │                    │                  │
            ┌────▼──────┐    ┌────────▼────────┐    ┌────▼────────────┐
            │  Entity   │    │   Repository    │    │  Drizzle rows   │
            │  + VOs    │◄───┤  (write side —  │    │  (BFF DTOs)     │
            │  + Events │    │   aggregates)   │    └─────────────────┘
            └────┬──────┘    └─────────────────┘
                 │ raises / seeds
            ┌────▼─────────────────────────────────────────────────┐
            │  Domain / Integration Event  →  events + outbox       │  (one tx)
            └────┬─────────────────────────────────────────────────┘
                 │ poll (claim → dispatch → finalize)
            ┌────▼─────────────┐
            │ OutboxDispatcher ├─►  InternalMediator (in-process fan-out)
            └──────────────────┘        │
                                        ├─► Internal Handler  (write-side fx; may saveIntegrationEvent)
                                        └─► Projector         (read-side fx, optional)

            Integration event (contract) ──► ExternalMediator ──► External Handler
                                              (Redis streams)      (another context / the Go worker)
```

**Hard rules:**

- Controllers never touch repositories. They validate and call a use case's `.execute()`.
- Entities and value objects know **nothing** about HTTP, persistence, or DI.
- Cross-context calls happen via repository reads (synchronous, intra-process) or integration events (async, cross-service). Direct imports of another context's entities or domain events are forbidden.
- The SDK HTTP client is for the frontend — never call it from inside `api`. (The Go worker calls TS through `services/tsclient`, which is a different thing: a server-to-server SDK client.)
- Database schema lives in `packages/contracts` and is **derived from** the validated entity model — never the other way around.
- Integration events are the **only** legal channel to change another context's state or to cross the Go ↔ TS boundary.

---

## Event Architecture

Events are the backbone of cross-aggregate and cross-service communication. There are **two event
layers** and one durable spine underneath both.

### The two layers

| Layer | Base class | Name convention | Scope | Delivery |
|---|---|---|---|---|
| **Domain Event** | `BaseDomainEvent` | `'<ctx>.<fact>'` (e.g. `billing.subscription_created`) | Inside one bounded context | `events` + `outbox` → `OutboxDispatcher` → `InternalMediator` (in-process) |
| **Integration Event** | `BaseIntegrationEvent` (defined in `contracts/wire/events`) | `'integration.<ctx>.<fact>'` (e.g. `integration.billing.subscription_changed`) | Cross-context / cross-service contract | `events` + `outbox` (via `saveIntegrationEvent`) → `ExternalMediator` transport → external handlers |

Both layers ride the **same outbox**. That is the durable spine: a state change and the event that
announces it are written in one transaction, so no in-flight crash can drop the event.

### The canonical write path

```
Entity behavior method
    └─► entity.addDomainEvent(…)                          (invariant-guarded transition raises the fact)

Use case / Handler  (inside withTransaction)
    ├─► repository.save(entity, tx)
    ├─► domainEventRepository.save(domainEvent, tx)       (events + outbox, same tx)
    └─► domainEventRepository.saveIntegrationEvent(evt, tx)  (cross-context announcement, same tx)

OutboxDispatcher                                          (background poll — DrizzleOutboxDispatcher)
    ├─► claim   : SELECT … WHERE processed_at IS NULL FOR UPDATE SKIP LOCKED, group by ownerId
    ├─► process : internalMediator.dispatch(event)        (owner-sequential, parallel across owners)
    └─► finalize: delete succeeded / increment attempts / dead-letter at MAX_ATTEMPTS

InternalMediator (in-process fan-out)
    ├─► Internal Handler   (handlers/internal.ts — write-side effects; may saveIntegrationEvent)
    └─► Projector          (projections/projectors — read-model updates, when present)

ExternalMediator (cross-service transport)
    └─► External Handler   (handlers/external.ts of the consuming context / the Go worker)
```

Integration-event publishing goes through `saveIntegrationEvent` **on purpose** — it replaced a
post-commit `externalMediator.publish(...)` that a crash between commit and publish could drop.
Consumers subscribe by exporting an `EventHandler` from `handlers/external.ts`; `BoundedContext.create`
registers it on the `ExternalMediator`. In production that mediator is `RedisExternalMediator`
(Redis streams `events:<name>`, consumer groups, `:dead` dead-letter, up to `MAX_DELIVERIES`
redeliveries); the single-service template binds the in-process `EventEmitter2Mediator`; flow tests
bind `MockExternalMediator`, which captures without publishing.

### Who is allowed to do what

| Action | Allowed in | Forbidden in |
|---|---|---|
| Raise a domain event | Entity behavior methods (`addDomainEvent`) | Controllers, repositories |
| Save a domain event | Use cases + handlers (always via `domainEventRepository.save`) | Entities, controllers |
| Publish an integration event | Use cases, handlers, **and** jobs — via `domainEventRepository.saveIntegrationEvent` | Entities, controllers, value objects |
| Dispatch from the outbox | `OutboxDispatcher` only | Everywhere else |
| Handle a domain event | `handlers/internal.ts` of the **same** context (or a projector) | Other contexts (use an integration event) |
| Handle an integration event | `handlers/external.ts` of the consuming context | Anywhere it would couple to another context's domain types |

> The old "only handlers publish integration events, never use cases" rule no longer holds. Because
> publishing is now a **transactional outbox write** (`saveIntegrationEvent`) rather than a
> fire-and-forget network call, whichever command / handler / job owns the state change publishes the
> announcement in the same transaction. Billing does this from use cases (`CancelSubscription`,
> `ChangePlan`, `ResumeSubscription`), from handlers (`InvoicePaidHandler`,
> `InvoicePaymentFailedHandler`), and from jobs (`BillingClockJob`, `DunningRetryJob`).

### Idempotency at every boundary

Because the outbox is at-least-once, every consumer that has a side-effect claims first:
`idempotencyGuard.claim(scope, key, tx)` returns `false` on a replay and the handler returns a
no-op. Scopes live in `shared/enums/IdempotencyScope.ts` (`WEBHOOK_<SOURCE>`, `CHECKOUT_VAULT`,
`INVOICE_EVENT`, …). Webhook ingest additionally dedups on `(scope, externalId)` via
`saveIfNotExists`, so a redelivered vendor webhook produces the fact once.

### End-to-end walk-through — the billing subscription flow

A single business operation traverses every layer. This traces a subscribe from the controller down
to quota enforcement, offline (`BILLING_SANDBOX=true`, all externals stubbed). Every citizen named
below is a real file under `packages/api/typescript/src/billing` (or `/quota`).

```
1. CONTROLLER                            billing/controllers/CreateSubscription.ts
   POST /subscriptions   middlewares: [AuthAccountMiddleware, RequireOwner]
     ├─► validates body (planName, consentAccepted) + ctx.session.ownerId
     └─► createSubscription.execute({ ownerId, planName, consentAccepted })

2. USE CASE  (inside withTransaction)    billing/usecases/CreateSubscription.ts
     ├─► guards: paid plan, consent accepted, at most one live subscription per owner
     ├─► Subscription.create({ ownerId, planName, status: INCOMPLETE|TRIALING })   ◄── ENTITY
     ├─► subscriptionRepository.save(sub, tx)
     ├─► domainEventRepository.save(new SubscriptionCreatedEvent({...}), tx)
     └─► domainEventRepository.save(new ExternalInvoiceIssuedEvent({...}), tx)      (first invoice)
   ── outside the tx: no vaulted card → providerFactory.decide() → provider.createCheckoutSession(...)
      → checkoutSessionRecorder.record(...) → returns { subscriptionId, engineInvoiceId, checkoutUrl }

3. HOSTED CHECKOUT  (offline)            billing/controllers/SandboxCheckout.ts
   GET /sandbox/checkout   (skips AuthAccountMiddleware; BILLING_SANDBOX only)
     └─► saves the SAME fact a real StripeWebhookMapper would emit:
         domainEventRepository.save(new ExternalCheckoutCompletedEvent({...}), tx)  → 302 successUrl
   ── the real path instead: POST webhook → billing/usecases/HandleBillingWebhook.ts
        → verifierFactory.get(source).verify(request)         (authenticate raw request)
        → mapperFactory.get(source).map(request)              (vendor body → ExternalBillingEvent[])
        → billingEventIngest.ingest(source, events, tx)       billing/services/BillingEventIngest
            └─► idempotencyGuard.claim(WEBHOOK_<SOURCE>, externalId) then domainEventRepository.save

4. OUTBOX → INTERNAL HANDLERS            billing/handlers/*
   OutboxDispatcher dispatches ExternalCheckoutCompletedEvent (a billing DOMAIN event) →
     ExternalCheckoutCompletedHandler
       ├─► claim(CHECKOUT_VAULT, sessionRef)
       ├─► completes the local CheckoutSession, vaults the PaymentMethod
       └─► emits ExternalCardChargeSucceededEvent  (the "checkout paid the invoice" fact)
     → ExternalCardChargeSucceededHandler settles the charge → InvoicePaidEvent

5. SETTLEMENT → CROSS-CONTEXT ANNOUNCE   billing/handlers/InvoicePaidHandler.ts
     ├─► claim(INVOICE_EVENT, event.id)
     ├─► subscriptionRepository.activate(ownerId, nextPeriodEnd)          (INCOMPLETE → ACTIVE)
     └─► domainEventRepository.saveIntegrationEvent(
             new SubscriptionChangedEvent({ ownerId, payload: {} }), tx)  ◄── THE CONTRACT
         (a THIN trigger — no plan/limits payload; the owner rides on the envelope)

6. QUOTA REACTS                          quota/handlers/GovernResourcesOnSubscriptionChangedHandler.ts
   SubscriptionChangedEvent (integration.billing.subscription_changed) arrives on the ExternalMediator
     └─► resourceLimitEnforcer.enforce(event.ownerId)
           re-derives the owner's CURRENT entitlement (QuotaEntitlement) and applies / releases
           over-quota locks. Because the trigger carries no facts, a stale or reordered delivery can
           never apply stale limits.
```

The key idea: **no citizen knows about the next one directly.** The controller doesn't know there
is a handler; `InvoicePaidHandler` doesn't know quota consumes its announcement; quota re-derives
rather than trusting a payload. Adding a second consumer of `SubscriptionChangedEvent` — say a
`notifications` handler that emails "your plan is active" — means writing one `handlers/external.ts`
handler and registering it. No billing file changes.

---

## Read-Model Architecture

CQRS in this project is **logical**, not physical — the same Postgres holds write-side aggregates
and read-side reads. The split is at the type-system level: separate paths, separate
responsibilities.

The template's default read path is the **BFF query use case**: `ui/usecases/**` assemble DTOs with
direct Drizzle access (`GetSubscription`, `GetUsage`, `ListInvoices`, `ListPlans`,
`ListNotifications`, `GetMyAccount`). A query use case bypasses aggregate rehydration on purpose —
it speaks straight to the tables to build exactly the shape the screen wants, and it is the one
place a read may span contexts.

Where a read model must be **denormalized or materialized** (a counter, a cross-aggregate join
kept up to date by events), the core ships the **Projector** primitive:
`BoundedContext.create({ projectors })` registers a `Projector<E>` on the `InternalMediator`
alongside internal handlers, and it maintains a projection via the canonical `find → applyEvent →
save`. The stock contexts don't need one yet — `InvoicePaidHandler` shows the lighter path: an
ordinary internal handler advances the `Subscription` read state inline, and the BFF queries do the
rest. Reach for a projection only when denormalization or cross-context aggregation is actually
required; the decision framework lives in `.claude/skills/projection/SKILL.md` and
`.claude/skills/projector/SKILL.md`.

A field belongs on the **aggregate** only if a business rule reads it. Counters, denormalized joins,
last-event timestamps, and cached external fields are read-model concerns, not aggregate state.

---

## Schema Strategy

Validation happens at two edges, with a deliberately thin middle:

1. **Controller schemas** — expressive (regex, `.refine()`, `.example()`, cross-field rules). Face external input and become the SDK contract.
2. **Entity / Value Object `static schema`** — domain invariants, validated by the constructor. Trusted by use cases.

Use-case `inputSchema`s in the middle are **simple primitives**, because they trust the controller's
format checks and the entity's invariants.

```typescript
// Controller — expressive, and the shape the SDK is generated from
export const CreateSubscriptionControllerInput = z.object({
  body: z.object({
    planName: z.enum(PlanName),          // contracts wire enum
    consentAccepted: z.boolean(),
  }),
  ctx: z.object({ session: z.object({ ownerId: z.string() }) }),
})

// Use case — primitive; the entity + downstream guards enforce the rules
export const CreateSubscriptionInputSchema = z.object({
  ownerId: z.string().min(1),
  planName: z.enum(PlanName),
  consentAccepted: z.boolean(),
})

// Entity — owns invariants; identity/VO fields carry the class, not a primitive
export const SubscriptionSchema = z.object({
  planName: z.enum(PlanName),
  status: z.enum(SubscriptionStatus),
  currentPeriodEnd: z.date().nullable(),
  // …
})
export class Subscription extends AggregateRoot<typeof SubscriptionSchema> {
  static override schema = SubscriptionSchema
}
```

### The `z.instance` vs `z.uuid` boundary

The custom `z` (`@codm/core-typescript`) adds an `z.instance(VO)` builder. The rule is a **layer
boundary**:

- **Entity + Value Object schemas** carry `z.instance(Id)`, `z.instance(Money)`, `z.instance(Mandate)` — a VO field is a *constructed* value, so an invalid one can't exist (`billing/entities/Invoice.ts`: `ownerId: z.instance(Id)`; `auth/entities/UserProfile.ts`: `userId: z.instance(Id)`).
- **Everything on the wire** — events, use-case input/output, controllers, query DTOs — keeps `z.uuid()` / `z.string()`. Ids cross the boundary as primitives; the entity constructor lifts them into VOs.

### Other schema rules

- **Enums in Zod**: `z.enum(PlanName)` — never `z.union([z.literal(...), …])`. Cross-boundary enums come from `contracts/wire/enums`; context-local ones from `<ctx>/enums`.
- **Query params are strings**: use `z.stringToNumber()`, `z.stringToInteger()`, `z.stringToBoolean()`, `z.stringToDate()`, `z.stringToArray()` (or `z.coerce.*`).
- **Schema builders**: `z.paginatedQuery({...})`, `z.paginatedResponse({...})`, `z.domainEvent({...})`, `z.integrationEvent({...})`, `z.enumRecord(Enum, value)`.
- **Enum registration is centralized**: `shared/index.ts` spreads every context's enum barrel plus the wire enums into `openapi.registerEnums(...)`, so OpenAPI names them by context (`PlanName`, not `Status2`). Never call `openapi.registerEnums` inside a context.
- **Shared VOs** (`Money`, `Phone`, `Timeline`) live in `shared/objects` and are registered once as named `$ref` components; context VOs stay domain-internal and inline at their use-site.

---

## Cross-Context Communication (intra-process)

Inside `api`, synchronous cross-context validation uses **repository reads directly**:

```typescript
// ✅ Read another context's aggregate for a business rule
const owner = await this.owners.findByOwnerId(ownerId)
if (!owner) throw new BaseError<ApplicationErrors>('OWNER_NOT_FOUND')

// ❌ A pass-through use case just to check existence
// ❌ Importing another context's controller or entity
// ❌ Calling the SDK HTTP client from inside api
```

| Scenario | Approach |
|---|---|
| Validate an entity exists in another context | Repository read (`findByOwnerId`, `findById`, …) |
| Need synchronous data for a business rule | Repository read |
| Modify another context's state | Integration event + external handler |
| Cross the Go ↔ TS boundary | Integration event over Redis streams (`ExternalMediator`) |
| Need one transaction across contexts | Re-evaluate boundaries — usually accidental coupling |

---

## Error Handling

| Type | When | Example |
|---|---|---|
| **DomainErrors** | Business invariants (raised by aggregates / VOs) | `INVALID_MANDATE`, `INVALID_CHARGE_TRANSITION` |
| **ApplicationErrors** | Orchestration conditions (use cases / handlers) | `SUBSCRIPTION_ALREADY_EXISTS`, `OWNER_NOT_FOUND` |
| **InterfaceErrors** | Transport / boundary | `UNAUTHORIZED`, `FORBIDDEN`, `WEBHOOK_SIGNATURE_INVALID` |
| **InfrastructureErrors** | Below the domain | `INVALID_OUTBOX_PAYLOAD`, `NOT_IMPLEMENTED` |

Backend flow:

1. Declare the four unions in `<ctx>/errors/index.ts` — each is `Base*Errors | <Ctx>*Errors`, so every context inherits the framework codes and adds its own.
2. Call `registerErrorCodes({ CODE: HttpStatusCode.X, … })` in the same file. The status carries semantics the frontend reads:
   - `UNAUTHORIZED (401)` — no / invalid session
   - `FORBIDDEN (403)` — authenticated but not allowed in this flow
   - `NOT_FOUND (404)` — resource doesn't exist for this owner
   - `CONFLICT (409)` — state conflict (e.g. `SUBSCRIPTION_ALREADY_EXISTS`)
   - `UNPROCESSABLE_ENTITY (422)` — a well-formed request a business rule refuses (most domain invariants)
3. Throw `new BaseError<DomainErrors>('CODE')` from entities, `new BaseError<ApplicationErrors>('CODE')` from use cases / handlers / middlewares.
4. Run `bun sdk` so the code lands in the SDK's error enum and the frontend can match on it.

The `GlobalErrorMapper` (`core/utils/GlobalErrorMapper.ts`) aggregates every context's registrations
and the `Controller` base turns a thrown `BaseError` into the right status + `{ code, message }` body.

### The error name IS the contract

Every code that crosses the wire is a backend↔frontend contract — **the frontend can react with
custom routing or UI based on the code.** A middleware that throws a typed code turns it into a
redirect on the frontend without any per-component handling:

```
Backend (use case / handler / middleware)
    └─► throw new BaseError<...>('SOME_GATE_FAILED')
GlobalErrorMapper → 403 { code: 'SOME_GATE_FAILED' }
SDK (Kubb) → typed error to React Query
Frontend main.tsx → QueryCache/MutationCache onError → handleApiError
    └─► customErrorHandlers['SOME_GATE_FAILED'] ?? defaultErrorHandler
```

The frontend half is documented in `docs/FRONTEND.md` → "API Error Handling"; the middleware
contract in `.claude/skills/middleware/SKILL.md`.

---

## Authorization & Session Context

Authentication is a **layered middleware chain** on the `Middleware` primitive:

```
BetterAuth session
  → AuthAccountMiddleware   (auth/middlewares — validates session → ctx.user + ctx.session)
    → RequireOwner          (owner/middlewares — loads the Owner, asserts responsibleUserId, stamps ctx.ownerId)
      → Controller.handle()
```

**Key principle:** `ctx` is the single carrier for session and tenant data.

| Middleware | Lives in | Purpose | Throws |
|---|---|---|---|
| `AuthAccountMiddleware` | `auth/middlewares/` | Validates the BetterAuth session; attaches `ctx.user` (`{ id, email, name, emailVerified }`) + `ctx.session` (`{ id, userId, expiresAt, ownerId }`, where `ownerId` maps from better-auth's `activeOwnerId` additionalField) | `UNAUTHORIZED` |
| `RequireOwner` | `owner/middlewares/` | Parses `SessionSchema` off `ctx`, loads the `Owner` for `session.ownerId`, asserts `owner.responsibleUserId === user.id`, stamps `ctx.ownerId` | `FORBIDDEN` / `OWNER_NOT_FOUND` |

`RequireOwner` is the base template's **single-tenant** authorization primitive: one responsible
user per `Owner`, one `ownerId` tenancy axis, no member/role model. Products that need multi-user
tenants graft the exemplar under `examples/` (`RequireOwnerMember` + `RequireOwnerRole`) in its
place — the `ownerId` axis stays, a member axis is added on top.

### Context-level defaults

Each context declares default middlewares in `middlewares/index.ts` (default export). An owner-scoped
controller lists `[AuthAccountMiddleware, RequireOwner]`; a public one (`SandboxCheckout`,
`HandleBillingWebhook`) uses `override skipMiddlewares` to drop the account guard. Per-controller
`override middlewares` **add**; never duplicate a default.

### Extending session data

- **New session/user field** — declare in BetterAuth `additionalFields`, extend `SessionSchema`, add the column in `packages/contracts`.
- **New guard** — write a `<Name>Middleware`, declare its code in `<ctx>/errors/index.ts`, map a status via `registerErrorCodes`, and (optionally) register a frontend custom handler for routing-by-error.
- **Consuming `ctx`** — declare `ctx: z.object({ session: z.object({ ownerId: z.string() }) })` in the controller `inputSchema`; the chain provides it.

---

## Dependency Injection & Registries

The container is **tsyringe-neo**. Every binding is keyed by environment.

```
ALL_REGISTRIES = merge(CONTEXT_REGISTRIES) = shared(CORE_REGISTRY) ⊕ auth ⊕ billing ⊕ quota ⊕ owner ⊕ notifications ⊕ ui
```

Each context authors its bindings in `<ctx>/registry.ts` with `expandBindings([...])` — **one
declaration per token, envs as columns**: `{ token, mock, real, integration? }`. `integration`
omitted mirrors `real` (integration is production-against-PGlite by convention); `null` is a
**declared absence** — the token is intentionally unbound in that env. `expandBindings` expands the
declarations into the runtime `InstanceRegistry` shape (`{ mock, integration, real }` arrays), where
a binding is either `{ token, instance }` (class → singleton) or `{ token, useFactory }`.

`shared/registry.ts` composes every context's `INSTANCE_REGISTRY` into `CONTEXT_REGISTRIES`
(`satisfies Record<ContextModule, InstanceRegistry>` against the `CONTEXTS` manifest — forgetting a
context is a **tsc error**, not a runtime DI hole; `shared` maps to the framework `CORE_REGISTRY`).
A mechanical merge then flatMaps the per-env arrays into `ALL_REGISTRIES.mock` / `.integration` /
`.real` — never hand-spread the env arrays.

Environment intent (`CORE_REGISTRY`; the mock `DomainEventRepository` is a declared `null` in the
registry — flow tests wire `OutboxAwareMockDomainEventRepository` per-suite via TestBed):

| Env | Driver | InternalMediator | ExternalMediator | Outbox | DomainEventRepo | IdempotencyGuard | Used by |
|---|---|---|---|---|---|---|---|
| **mock** | `PGliteDriver` | `EventEmitter2Mediator` | `MockExternalMediator` | `MockOutboxDispatcher` | `OutboxAwareMockDomainEventRepository` | `MockIdempotencyGuard` | flow tests |
| **integration** | `PGliteDriver` | `EventEmitter2Mediator` | `EventEmitter2Mediator` | `DrizzleOutboxDispatcher` | `DrizzleDomainEventRepository` | `DrizzleIdempotencyGuard` | repository / use case / handler tests |
| **real** | `NodePgDriver` | `EventEmitter2Mediator` | `EventEmitter2Mediator` | `DrizzleOutboxDispatcher` | `DrizzleDomainEventRepository` | `DrizzleIdempotencyGuard` | production (single-service) |

The stock `real` config is single-process, so it binds the in-process `EventEmitter2Mediator` for
both mediator roles. Splitting billing and the Go worker into separate deployments is a one-line
registry change: bind `ExternalMediator → RedisExternalMediator` (already in core) and the same
integration events cross Redis streams instead of a local emitter. Boot (`shared/index.ts`) resolves
the `ExternalMediator` and `OutboxDispatcher` and starts them; the concrete impls self-bootstrap
inside `.start()`.

Every new context **must**:
1. Export `INSTANCE_REGISTRY` from `<ctx>/registry.ts` via `expandBindings([...])`.
2. Be added to `CONTEXT_REGISTRIES` in `shared/registry.ts` and wired into `routers.ts` — both `satisfies`-checked against the `CONTEXTS` manifest.
3. Provide a mock **and** a concrete binding for each context-scoped repository / service.

Tests **always resolve from a child container** (`container.createChildContainer()`), never the root.

> **The product-plug seam.** `shared/registry.ts` is also the merge root where a downstream product
> overrides quota's two placeholder bindings (`QuotaUsageSource`, `ResourceGovernorRegistry`) with
> its real per-key counter/governor maps. The template ships **zero** product keys — a stock build
> resolves quota with empty defaults. Append overrides after the `...quotaRegistry.*` spread so
> `registerAll`'s last-write-wins takes effect.

---

## Database Drivers

- `DrizzleClient` — the query client.
- `DrizzleDatabaseDriver` — the environment wrapper exposing `db`, `unitOfWorkFactory`, `reset()`, `runMigrations()`, `readMigrations()`, `close()`.
- Every environment uses `LibsqlDriver` (`@libsql/client` + `drizzle-orm/libsql`). Production opens the shared file at `$CODM_DATA_DIR/codm.db`; integration + flow tests open `:memory:` and run the **same** migrations as production (from `@codm/contracts/db/migrations`), so what passes in a test passes against the real store.
- There is **no Postgres**. The TS daemon and the Go gateway open **one** SQLite file, and each applies the migrations at boot, idempotently, over the same `_sqlite_migrations` ledger — whoever boots first applies, the second no-ops.

The schema itself is owned by `packages/contracts` (`db/schema/` + its migrations) — the directory
name carries no dialect suffix: dialect is a property of `drizzle.config.ts`, not of the folder, so
swapping SQLite for Postgres means editing the config, not moving files. Both backends consume it —
TS via `@codm/contracts/db`, Go via sqlc bindings over a byte-identical `//go:embed` copy of the
same SQL.

---

## SDK Generation

Both backends emit an OpenAPI spec (TS: 3.1, Go: 3.0.3 — the Kubb pipeline validates a 3.0-flavored spec); the SDK is regenerated from those specs:

- **TS api** — `packages/api/typescript/public/docs/openapi.json` (built by the boot path when `EMIT_OPENAPI=true`).
- **Go worker** — `packages/api/go/public/docs/openapi.json` (via `nx run api-go:emit-openapi`, `cmd/openapi`).

Pipeline: `bun sdk` (`nx run client:generate`) depends on both `emit-openapi` targets, then runs
the generators in `packages/client` (`generators/typescript.ts` + `generators/go.ts`, Kubb-based)
to produce the committed `@codm/client-typescript` at `packages/client/dist/typescript`. Wire
enums + integration events flow through the **separate** contracts codegen (`bun contracts`) into
`@codm/contracts-typescript` / `template/core-go`.

What the SDK exports to the frontend: React Query hooks, Zod schemas for TanStack Form, TS types,
the error-code enum, and query keys.

Spec contract conventions:

- Enums emitted as `$ref` components (generated Zod reuses the enum definition).
- Single-value discriminators emitted as `const`; discriminated unions as `oneOf + discriminator + mapping`.
- Cross-field validations carried as `x-zod-refinements` on the schema that owns the fields (usually the request body).
- `z.unknown()` fields tagged `x-unknown: true`.

After changing controllers/routes: `bun sdk`. After changing TanStack Router routes: `cd packages/app/react && bun tsr generate`.

---

## Testing Quick Reference

Source of truth: `.claude/skills/test/SKILL.md`.

| Kind | Location | Mode | Notes |
|---|---|---|---|
| Unit (Entity / VO) | `src/**/{Entity,ValueObject}.test.ts` | none | Direct instantiation, no `TestBed`. Covers invariants. |
| Repository | `src/**/Drizzle*Repository.test.ts` | `integration` | `save` / `findBy*` / `delete` + complex queries + concurrency |
| Use case / handler | colocated `*.test.ts` | `integration` | Given/When/Then via given helpers |
| Flow | `packages/api/typescript/tests/flows/` | `mock` | Choreographies across use cases; `MockExternalMediator` captures integration events |
| Bounded-context smoke | e.g. `quota/quota.smoke.test.ts` | `integration` | Resolves every registered token through the real DI path |

The `TestBed` (`tests/support/TestBed.ts`) installs a `SpyMediator` over both mediators (so tests
can assert emitted events), wires the outbox + `DomainEventRepository`, and runs the production
migrations against PGlite. Given helpers (`tests/support/given/`) compose state by calling
repositories **directly** — never use cases — so a `CancelSubscription` test doesn't depend on
`CreateSubscription` being correct.

Lifecycle (non-unit tests):

```ts
beforeAll(async () => {
  testContainer = container.createChildContainer()
  testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
})
beforeEach(async () => { await testBed.reset() })
afterAll(async () => { await testBed.destroy() })
```

Use-case tests **do not** repeat `VALIDATION_ERROR` cases — entity tests cover those. Run `bun test`
from `packages/api/typescript` so the `bunfig.toml` reflect-metadata preload applies.

---

## References

- `docs/FRONTEND.md` — Frontend architecture
- `docs/COMPONENTS.md` — UI primitive documentation
- `.claude/skills/<name>/SKILL.md` — Per-artifact implementation playbook
- `.claude/registry.yaml` — Cross-cutting bad practices
- `packages/contracts` — TypeSpec wire contracts + Drizzle schema (the cross-boundary source of truth)
</content>
</invoke>
