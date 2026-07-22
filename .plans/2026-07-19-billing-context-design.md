# Billing context — generic Tier-2, ported from medscall — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`)
> syntax for tracking. Each Task wraps one observable behavior (or one faithful
> port slice) in an outer RED→GREEN cycle. **This is a PORT** from
> `medscall@f04e8a0f`, not a re-implementation — adapt layout + brand, never
> redesign. Layout map: medscall `packages/api/src/billing/<x>` → template
> `packages/api/typescript/src/billing/<x>`; medscall core → template
> `packages/api/typescript/core`; contracts stay in `packages/contracts`. Read
> the pinned source with `git -C /Users/work/Desktop/Projetos/medscall/software/monorepo show f04e8a0f:<path>`
> (READ-ONLY — never write there). Every Task names its exact pin source files
> and the invariants to preserve verbatim.

**Goal:** Land a generic `billing` bounded context under
`packages/api/typescript/src/billing` — the native Phase-D money ledger
(subscription, invoice, charge, credit note, dispute, payment-method wallet,
checkout session, billing profile) with access + invoice status **derived**;
the write-side saga (charge → settle → reconcile); dunning; refund/dispute; the
four-layer reconciliation program behind its mechanical rail; a generic
`PaymentProvider` port with **Stripe + Sandbox** reference adapters;
`PlanRegistry`/`QuotaKey` as product plugs; and `docs/BILLING.md` — coupled to
the quota context through exactly one declared bidirectional import exception.

**Architecture:** Extend the existing `pgSchema('billing')` in
`packages/contracts/db/schema/billing.ts` additively with the `billing_*`
native tables (never a second schema; the Kiwify placeholder tables stay).
Aggregates own invariants; **derivers** (`InvoiceStatusDeriver`,
`SubscriptionAccessDeriver`) compute status/access at read time from immutable
ledger facts — no load-bearing read trusts a stored status column. Every money
transition claims through the L-1 `IdempotencyGuard` on `shared.idempotency_keys`
(claim-before / call-outside-tx / persist-after; no gateway call inside a tx).
Settlement is webhook-driven; a four-layer reconciliation program (per-object
alarm via L-0.5 `PostgresCommandQueue`, window sweep, checkout accelerator,
detect-and-alert drift) closes every delayed/dropped/never-sent webhook window,
policed by `reconciliation-coverage.test.ts`.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe-neo, Zod,
`@berzerk/core-typescript` framework, `@berzerk/contracts-typescript` (Drizzle db
schema + wire integration events), bun:test + PGlite for integration, Kubb (SDK).

**Spec:** .specs/2026-07-19-billing-context-design.md
**Program item:** L-10 (billing half) of `.plans/2026-07-11-ecosystem-sync-up.md`
**Extraction pin:** `medscall@f04e8a0f`
**Tasks:** 17
**Estimated minutes:** 2400

**Depends on (external, must land first):**
- **L-1** — `IdempotencyGuard` (`claim`/`release` + `IdempotencyScope` enum on the
  dormant `shared.idempotency_keys` table). Gates T8/T9/T11/T14/T15.
- **L-0.5** — merged `CommandQueue` port + `PostgresCommandQueue` driver
  (`scheduled_commands`). Gates T15's transactional per-object alarms.
- **L-13** — `tests/architecture/` rails home + base `context-boundary.test.ts` +
  `tx-discipline.test.ts` derived from the `contexts.ts` manifest. Gates T16.
- **Quota spec** (`2026-07-XX-quota-context-design.md`) — the coupled sibling;
  co-lands for T16's boundary exception + the AC16 coupling. Ships the shared
  `QuotaKey` placeholder enum and the `@quota/*` surface billing imports.

---

## Task T1: Freeze the billing ledger schema + cross-context event (Contract Lock)

**Files to write:**
- Modify: `packages/contracts/db/schema/billing.ts` — add the 10 native `billing_*` tables to the existing `billingSchema = pgSchema('billing')` object; leave the placeholder `subscriptions`/`subscription_events` untouched
- Create: `packages/contracts/wire/events/billing-subscription-changed.tsp` — `SubscriptionChangedEvent { ownerId }` integration event (thin trigger)
- Modify: `packages/contracts/wire/main.tsp` — register the new event
- Regen: `packages/contracts/generated/typescript/**`
- Regen: `packages/contracts/generated/go/**`
- Create: `packages/api/typescript/migrations/<next>_billing_native_ledger.sql` — Drizzle migration for the 10 tables

**Files to read:**
- `packages/contracts/db/schema/billing.ts`
- `packages/contracts/wire/main.tsp`
- pin `f04e8a0f:packages/api/src/shared/db/drizzle/schema/billing.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /db-modelling, /migrate, /event, /sdk
**Depends on:** (none)

### Step T1.1 — Extend the billing pgSchema with the native ledger tables

Modify `packages/contracts/db/schema/billing.ts`: keep the existing
`billingSchema`, `billingSubscriptions` (placeholder), `subscriptionEvents`
exports; **append** the 10 native tables from Appendix A of the spec, extracting
every column shape from pin `f04e8a0f:packages/api/src/shared/db/drizzle/schema/billing.ts`
(HEAD source, never migration numbers). All tables `billing_`-prefixed; enum
columns use `text().$type<Enum>()` (never `pgEnum`); cross-context ids are plain
`text` with no FK. The tables:

- `billing_subscriptions` — PK `owner_id`; `engineSubscriptionId`, `planName`, `status`, `currentPeriodStart/End`, `trialEnd`, `canceledAt`, `cancelAtPeriodEnd`, `scheduledPlanName`, `version` (optimistic lock), `updatedAt`.
- `billing_invoices` — PK `invoice_id` (write-once); `ownerId`, `amountCents`, `currency`, `ourNumber` (unique, gap-free), `planName`, `periodStart/End`, `voidedAt`, `lineItems` jsonb (`InvoiceLine[]`); **no status column** (derived).
- `billing_invoice_sequences` — PK `prefix`; `nextNumber` bigint.
- `billing_charges` — PK `id`; `ownerId`, `invoiceId`, `platform`, `method`, `amountCents`, `attemptNo`, `status`, `gatewayTxId?`, `declineCode?`, `version`.
- `billing_credit_notes` — PK `id`; `ownerId`, `number` (unique), `invoiceId` (FK→`billing_invoices`), `amountCents`, `currency`, `reason`, `status`, `gatewayRef?`, `finalizedAt?`, `version`.
- `billing_payment_methods` — PK `id`; single-table projection of `PaymentInstrument`; `ownerId`, `platform`, `type`, `pmRef`, `supportsOffSession`, `captureOrigin?`, `originGatewayTxId?`, per-leaf card/wallet columns, mandate columns (acceptedAt + ip/ua/consentVersion), `status`, `isDefault`; partial unique index: exactly one DEFAULT among an owner's ACTIVE instruments.
- `billing_disputes` — PK `id`; unique `(gatewayDisputeRef, platform)`; `ownerId`, `gatewayTxId`, `invoiceId` (indexed), `amountCents`, `status`, `openedAt`, `closedAt?`, `version`.
- `billing_checkout_sessions` — PK `id`; `sessionRef` (unique), `ownerId`, `platform`, `intent`, `engineInvoiceId?`, `status`, `mintedAt`, `expiresAt?`, `version`.
- `billing_profiles` — PK `owner_id`; `name` (generic owner display name), `email`, `document`, `language`, `version`.
- `billing_usage_rollups` — PK `id`; `ownerId`, `meter`, `periodStart/End`, `quantity`; unique `(owner_id, meter, period_start)`.

The `$type<Enum>()` type imports resolve to `packages/api/typescript/src/billing/enums/*` (created in T2) — declare them as `import type` so the contracts file stays type-only-coupled; if a circular-build concern arises, inline the string-literal unions in the schema file with a `// mirrors billing/enums/<X>` comment (the medscall discipline).

### Step T1.2 — Author the `SubscriptionChangedEvent` integration event

Create `packages/contracts/wire/events/billing-subscription-changed.tsp` mirroring
the sibling event tsp shape in `packages/contracts/wire/` and the TypeSpec
envelope dialect (`entityId`/`occurredAt`, per plan T-10). Payload is the **thin
trigger** only: `{ ownerId: string }`. Register it in `main.tsp`. This is the
single cross-context event billing emits; quota's
`GovernResourcesOnSubscriptionChangedHandler` consumes it.

### Step T1.3 — Generate the Drizzle migration

Run: `bun migrate:create`
Expected: a new SQL file under `packages/api/typescript/migrations/` creating the
10 `billing_*` tables + indexes. Inspect it: every table present, the two partial
unique indexes present, no `pgEnum` types created (all `text`).

### Step T1.4 — Regenerate contracts bindings + SDK

```bash
bun contracts && bun emit-openapi && bun sdk
```

### Step T1.5 — Verify the freeze

Run: `bun tsc`
Expected: 0 errors. `git diff --stat packages/contracts/generated/` shows the new
`SubscriptionChangedEvent` binding in both `typescript/` and `go/`.

### Step T1.6 — Commit

```bash
git add packages/contracts/ packages/api/typescript/migrations/
git commit -m "feat(billing): freeze native ledger schema + SubscriptionChangedEvent (Task T1)"
```

---

## Task T2: Freeze the billing enum vocabulary + register the context

**Files to write:**
- Create: `packages/api/typescript/src/billing/enums/BillingPlatform.ts`
- Create: `packages/api/typescript/src/billing/enums/BillingWebhookSource.ts`
- Create: `packages/api/typescript/src/billing/enums/SubscriptionStatus.ts`
- Create: `packages/api/typescript/src/billing/enums/ChargeStatus.ts`
- Create: `packages/api/typescript/src/billing/enums/InvoiceStatus.ts`
- Create: `packages/api/typescript/src/billing/enums/CreditNoteReason.ts`
- Create: `packages/api/typescript/src/billing/enums/CreditNoteStatus.ts`
- Create: `packages/api/typescript/src/billing/enums/DisputeStatus.ts`
- Create: `packages/api/typescript/src/billing/enums/PaymentMethodStatus.ts`
- Create: `packages/api/typescript/src/billing/enums/PaymentMethodType.ts`
- Create: `packages/api/typescript/src/billing/enums/CheckoutSessionStatus.ts`
- Create: `packages/api/typescript/src/billing/enums/CheckoutIntent.ts`
- Create: `packages/api/typescript/src/billing/enums/DeclineReason.ts`
- Create: `packages/api/typescript/src/billing/enums/RefundBasis.ts`
- Create: `packages/api/typescript/src/billing/enums/RefundSource.ts`
- Create: `packages/api/typescript/src/billing/enums/PlanName.ts`
- Create: `packages/api/typescript/src/billing/index.ts`
- Create: `packages/api/typescript/src/billing/registry.ts`
- Modify: `packages/api/typescript/src/shared/contexts.ts` — add `billing` to `CONTEXTS`

**Files to read:**
- `packages/api/typescript/src/shared/enums/IdempotencyScope.ts` (L-1-owned — appended in Step T2.3)
- `packages/api/typescript/src/tenancy/index.ts`, `packages/api/typescript/src/tenancy/registry.ts` (sibling context wiring)
- pin `f04e8a0f:packages/api/src/billing/enums/*` and `f04e8a0f:packages/api/src/shared/enums/IdempotencyScope.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum, /bounded-context
**Depends on:** (none)

### Step T2.1 — Bootstrap the billing context skeleton

```bash
bun cli context billing
```

This creates `packages/api/typescript/src/billing/{index.ts,registry.ts}` and the
canonical subfolders. Register it: modify `packages/api/typescript/src/shared/contexts.ts`
to add a `billing` member to `CONTEXTS`, and wire `registry.ts` with the
`mock`/`integration`/`real` `INSTANCE_REGISTRY` keys per the sibling
`tenancy/registry.ts` shape (bindings filled by later Tasks).

### Step T2.2 — Scaffold the 16 billing enums

```bash
bun cli enum billing BillingPlatform
bun cli enum billing BillingWebhookSource
bun cli enum billing SubscriptionStatus
bun cli enum billing ChargeStatus
bun cli enum billing InvoiceStatus
bun cli enum billing CreditNoteReason
bun cli enum billing CreditNoteStatus
bun cli enum billing DisputeStatus
bun cli enum billing PaymentMethodStatus
bun cli enum billing PaymentMethodType
bun cli enum billing CheckoutSessionStatus
bun cli enum billing CheckoutIntent
bun cli enum billing DeclineReason
bun cli enum billing RefundBasis
bun cli enum billing RefundSource
bun cli enum billing PlanName
```

Then port each enum's values + helper sets verbatim from
`f04e8a0f:packages/api/src/billing/enums/<Name>.ts`, **trimming the platform
enums to the reference set**:
- `BillingPlatform` / `BillingWebhookSource` ship `STRIPE` + `SANDBOX` only, plus a documented extension-point comment (`// product gateways add their member here`). Do NOT port `PAGARME`/`ASAAS`/`MERCADOPAGO`/`PAGBANK` or the DECOMMISSIONED `GETNET`/`INFINITEPAY`/`REDE`.
- `SubscriptionStatus` = `{ TRIALING, INCOMPLETE, ACTIVE, PAST_DUE, CANCELED, INCOMPLETE_EXPIRED }` + `TERMINAL_*` / `ACCESS_GRANTING_*` sets + `nextSubscriptionStatus` — ported verbatim.
- `ChargeStatus` = `{ PENDING, SUCCEEDED, FAILED }`; `InvoiceStatus` = `{ PAID, OVERDUE, PENDING, REFUNDED, PARTIALLY_REFUNDED, VOID }`; `CreditNoteReason` = `{ REFUND, CHARGEBACK, CORRECTION }`; `CreditNoteStatus` = `{ ISSUED, SETTLED, REVERSED }`; `DisputeStatus` = `{ OPEN, WON, LOST }`; `PaymentMethodStatus` = `{ ACTIVE, EXPIRED, REMOVED }`; `PaymentMethodType` = `{ CARD, APPLE_PAY, GOOGLE_PAY, PIX, BOLETO }`; `CheckoutSessionStatus` = `{ PENDING, COMPLETED, EXPIRED }`; `CheckoutIntent` = `{ setup, payment }`; `DeclineReason` = `{ INSUFFICIENT_FUNDS, CARD_EXPIRED, AUTHENTICATION_REQUIRED, PROCESSING_ERROR, CARD_DECLINED }`; `RefundBasis` = `{ CDC_WINDOW, PRO_RATA, NONE }`; `RefundSource` = `{ operator, policy }`.
- `PlanName` = `{ FREE, STARTER, PRO }` (the generic default plug).

### Step T2.3 — Append billing scopes to the shared IdempotencyScope registry

Modify `packages/api/typescript/src/shared/enums/IdempotencyScope.ts` (the single
shared registry created by L-1): add the billing scopes (SCREAMING_SNAKE),
reference-adapter-trimmed per Appendix C — `WEBHOOK_STRIPE`, `WEBHOOK_SANDBOX`,
`SUBSCRIPTION_PER_OWNER`, `INVOICE_CHARGE`, `INVOICE_SETTLED`, `INVOICE_FAILED`,
`INVOICE_EVENT`, `INVOICE_DUNNING`, `INVOICE_DUNNING_STARTED`,
`INVOICE_DUNNING_ATTEMPT`, `INVOICE_DUNNING_SUCCEEDED`, `INVOICE_DUNNING_FAILED`,
`CHECKOUT_VAULT`, `RECONCILE_STALE_ALERT`, `CHARGE_SETTLER_ALERT`,
`REFUND_EXPECTATION`. **Do NOT create a billing-local dedup table.** (`QUOTA_OVERRIDE`
is quota-owned — the quota spec adds it.) This is an append to an L-1-owned file;
keep every existing member.

### Step T2.4 — Verify the vocabulary

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`
Expected: 0 errors; `billing` resolves in `CONTEXTS`; all 16 enum modules export.

### Step T2.5 — Commit

```bash
git add packages/api/typescript/src/billing/ packages/api/typescript/src/shared/
git commit -m "feat(billing): enum vocabulary + context registration + idempotency scopes (Task T2)"
```

---

## Task T3: Value objects + PlanRegistry product plug

**Files to write:**
- Create: `packages/api/typescript/src/billing/objects/InvoiceLine.ts`
- Create: `packages/api/typescript/src/billing/objects/PaymentInstrument.ts`
- Create: `packages/api/typescript/src/billing/objects/Mandate.ts`
- Create: `packages/api/typescript/src/billing/objects/PlanRegistry.ts`
- Test: `packages/api/typescript/src/billing/objects/PlanRegistry.test.ts`

**Files to read:**
- `packages/api/typescript/src/shared/objects/` (the existing `Money`/`SignedMoney`/`Metric`/`Tally` family — do-not-re-port trap; reference, never recreate)
- pin `f04e8a0f:packages/api/src/billing/objects/{InvoiceLine,PaymentInstrument,Mandate,PlanRegistry}.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /value-object, /test
**Depends on:** T2
**Consumes (frozen):** `PlanName`, `PaymentMethodType`, `QuotaKey` (shared placeholder from the quota half) enums; the shared `Money`/`MonetaryAmount` VO from `@shared/objects`.
**Scope fence:** DONE elsewhere — enums (T2), `Money` family (`@shared/objects`, reuse never recreate). OUT — the aggregates that embed these VOs (T4–T6).
**Gate:** `cd packages/api/typescript && bun test src/billing/objects/PlanRegistry.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T3.1 — Scaffold the value objects

```bash
bun cli value-object billing InvoiceLine
bun cli value-object billing PaymentInstrument
bun cli value-object billing Mandate
bun cli value-object billing PlanRegistry
```

### Step T3.2 — Port the VOs, generalizing the brand

Port from the pin, preserving shape exactly:
- `InvoiceLine` — Zod object: `kind ∈ {SUBSCRIPTION, PRORATION, OVERAGE, ADJUSTMENT}`, `meter?: QuotaKey`, coerced period dates, amount via `Money`.
- `PaymentInstrument` — discriminated union on `type`: `CARD` leaf carries brand/last4/exp; wallet leaves (`APPLE_PAY`/`GOOGLE_PAY`) carry network/last4.
- `Mandate` — `BaseValueObject`: `acceptedAt` + audit `ip`/`userAgent`/`consentVersion`.
- `PlanRegistry` — the FREE/STARTER/PRO default plug keyed `Record<PlanName, …>` with per-plan `Record<QuotaKey, …>` quotas + prices via `Money`; the concrete list is validated at boot. Code stays generic — **never names a specific `QuotaKey`**. Keep `amountCents` referencing `@shared/objects`.

### Step T3.3 — Port the PlanRegistry test

Port `f04e8a0f:packages/api/src/billing/objects/PlanRegistry.test.ts` (boot
validation: every `PlanName` has an entry; quotas cover every `QuotaKey`; prices
are non-negative `Money`).

### Step T3.4 — Verify + commit

Run the Gate. Then:
```bash
git add packages/api/typescript/src/billing/objects/
git commit -m "feat(billing): invoice-line / payment-instrument / mandate VOs + PlanRegistry plug (Task T3)"
```

---

## Task T4: Owner subscribes — Subscription aggregate with derived access

**Files to write:**
- Create: `packages/api/typescript/src/billing/entities/Subscription.ts`
- Create: `packages/api/typescript/src/billing/services/SubscriptionAccessDeriver.ts`
- Create: `packages/api/typescript/src/billing/repositories/SubscriptionRepository/SubscriptionRepository.ts`
- Create: `packages/api/typescript/src/billing/repositories/SubscriptionRepository/DrizzleSubscriptionRepository.ts`
- Test: `packages/api/typescript/src/billing/entities/Subscription.test.ts`
- Test: `packages/api/typescript/src/billing/repositories/SubscriptionRepository/DrizzleSubscriptionRepository.test.ts`

**Files to read:**
- pin `f04e8a0f:packages/api/src/billing/entities/Subscription.ts` + `Subscription.test.ts`
- pin `f04e8a0f:packages/api/src/billing/services/SubscriptionAccessDeriver/*`
- pin `f04e8a0f:packages/api/src/billing/repositories/SubscriptionRepository/*`
- `packages/api/typescript/src/tenancy/entities/Store.ts` (sibling aggregate idiom)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /service, /repository, /test
**Depends on:** T1, T2, T3
**Consumes (frozen):** `billingSubscriptions` table (T1), `SubscriptionStatus` (+ `TERMINAL_SUBSCRIPTION_STATUS` / `ACCESS_GRANTING_SUBSCRIPTION_STATUS` / `nextSubscriptionStatus`), `PlanName`, `PlanRegistry`, `Money`. `saveWithOptimisticLock` from core (L-0.5 kernel).
**Scope fence:** DONE — schema (T1), enums (T2), VOs (T3). OUT — `CreateSubscription`/`ChangePlan` use cases (T10), the charge saga (T8).
**Gate:** `cd packages/api/typescript && bun test src/billing/entities/Subscription.test.ts src/billing/repositories/SubscriptionRepository/ && bun x tsc -p tsconfig.build.json --noEmit`

### Step T4.1 — Write the failing entity test

Port `f04e8a0f:.../Subscription.test.ts`. It asserts (D13): `owner_id` is natural
identity (one subscription per owner forever; `resubscribe()` mutates the same row
preserving the lock `version`); `INCOMPLETE` grants no access; terminals
(`CANCELED`, `INCOMPLETE_EXPIRED`) are absorbing; reactivation clears the
cancellation facts (the "R3 regression" — never respect a stale `canceledAt` on
resubscribe); every writer bumps `version`.

### Step T4.2 — Run test to verify it fails

Run: `cd packages/api/typescript && bun test src/billing/entities/Subscription.test.ts`
Expected: FAIL with `Cannot find module './Subscription'`.

### Step T4.3 — Scaffold the aggregate, deriver, repository

```bash
bun cli entity billing Subscription --aggregate
bun cli service billing SubscriptionAccessDeriver
bun cli repository billing Subscription
```

### Step T4.4 — Port the Subscription aggregate

Port the entity verbatim (static Zod schema + declaration-merged interface). The
stored `status` is a **hint** only (used by `listRenewalDue` + the re-subscribe
guard). Behavior methods `activate` / `markPastDue` / `cancel` /
`finalizeCancellation` / `changePlan` / `setScheduledPlan` / `resubscribe` each
bump `version`. Keep the invariant guards that raise typed `DomainError`s
(absorbing terminals). No access logic lives here — that is the deriver's.

### Step T4.5 — Port SubscriptionAccessDeriver (the single access authority)

Port `computeAccess` + the single `isCanceledEffective` predicate **verbatim** —
it is never hand-copied (it drifted once losing the trial arm). Access derives
from `paidThrough` + `isCanceledEffective`, never from the stored `status`.

### Step T4.6 — Port the repository (optimistic-lock save + conditional updates)

Port the abstract `SubscriptionRepository` + `DrizzleSubscriptionRepository`. The
version-guarded find→save AND every targeted conditional update
(`activate`/`markPastDue`/`cancel`/`finalizeCancellation`/`changePlan`/
`setScheduledPlan`) bump `version`, so a stale find→save 409s. Include
`listRenewalDue` (reads the status hint). Port the repository test
(`save`/`findByOwnerId`/optimistic-lock conflict).

### Step T4.7 — Verify + commit

Run the Gate. Then:
```bash
git add packages/api/typescript/src/billing/entities/Subscription.ts \
  packages/api/typescript/src/billing/entities/Subscription.test.ts \
  packages/api/typescript/src/billing/services/SubscriptionAccessDeriver.ts \
  packages/api/typescript/src/billing/repositories/SubscriptionRepository/
git commit -m "feat(billing): subscription aggregate + derived access + optimistic-lock repo (Task T4)"
```

---

## Task T5: Append-only money ledger — Invoice / Charge / CreditNote + derivers

**Files to write:**
- Create: `packages/api/typescript/src/billing/entities/Invoice.ts`
- Create: `packages/api/typescript/src/billing/entities/Charge.ts`
- Create: `packages/api/typescript/src/billing/entities/CreditNote.ts`
- Create: `packages/api/typescript/src/billing/services/InvoiceStatusDeriver.ts`
- Create: `packages/api/typescript/src/billing/services/InvoiceNumberSequencer.ts`
- Create: `packages/api/typescript/src/billing/repositories/InvoiceRepository/InvoiceRepository.ts`
- Create: `packages/api/typescript/src/billing/repositories/InvoiceRepository/DrizzleInvoiceRepository.ts`
- Create: `packages/api/typescript/src/billing/repositories/ChargeRepository/ChargeRepository.ts`
- Create: `packages/api/typescript/src/billing/repositories/ChargeRepository/DrizzleChargeRepository.ts`
- Create: `packages/api/typescript/src/billing/repositories/CreditNoteRepository/CreditNoteRepository.ts`
- Create: `packages/api/typescript/src/billing/repositories/CreditNoteRepository/DrizzleCreditNoteRepository.ts`
- Test: `packages/api/typescript/src/billing/entities/Charge.test.ts`
- Test: `packages/api/typescript/src/billing/services/InvoiceStatusDeriver.test.ts`

**Files to read:**
- pin `f04e8a0f:packages/api/src/billing/entities/{Invoice,Charge,CreditNote}.ts` + `Charge.test.ts`
- pin `f04e8a0f:packages/api/src/billing/services/{InvoiceStatusDeriver,InvoiceNumberSequencer}/*`
- pin `f04e8a0f:packages/api/src/billing/repositories/{InvoiceRepository,ChargeRepository,CreditNoteRepository}/*`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /service, /repository, /test
**Depends on:** T1, T2, T3
**Consumes (frozen):** `billing_invoices`/`billing_charges`/`billing_credit_notes`/`billing_invoice_sequences` tables (T1), `ChargeStatus`, `InvoiceStatus`, `CreditNoteReason`, `CreditNoteStatus`, `DeclineReason` (T2), `InvoiceLine`, `Money` (T3).
**Scope fence:** DONE — schema, enums, VOs. OUT — settlement/charging saga (T8), refund/credit-note write use cases (T11), dunning phase derivation (T14).
**Gate:** `cd packages/api/typescript && bun test src/billing/entities/Charge.test.ts src/billing/services/InvoiceStatusDeriver.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T5.1 — Write the failing tests

Port `Charge.test.ts` (charge only transitions into absorbing terminal states —
`SUCCEEDED`/`FAILED` never leave; PENDING→terminal only) and
`InvoiceStatusDeriver.test.ts` (evaluates in the fixed order
REFUNDED→PARTIALLY_REFUNDED→PAID→VOID→OVERDUE→PENDING from immutable facts:
`SUCCEEDED` charge, non-reversed credit notes, period dates — never a stored
column; AC6).

### Step T5.2 — Run to verify failure

Run: `cd packages/api/typescript && bun test src/billing/entities/Charge.test.ts`
Expected: FAIL with `Cannot find module './Charge'`.

### Step T5.3 — Scaffold entities, derivers, repositories

```bash
bun cli entity billing Invoice --aggregate
bun cli entity billing Charge --aggregate
bun cli entity billing CreditNote --aggregate
bun cli service billing InvoiceStatusDeriver
bun cli service billing InvoiceNumberSequencer
bun cli repository billing Invoice
bun cli repository billing Charge
bun cli repository billing CreditNote
```

### Step T5.4 — Port the ledger aggregates (append-only doctrine)

Port verbatim, preserving Principle 2:
- `Invoice` — write-once (PK conflict = no-op at the repo); `lineItems: InvoiceLine[]`; no status field (derived); `void()` sets `voidedAt`.
- `Charge` — absorbing terminal states; `attemptNo`; `declineCode` on FAILED; `version`. The unconditional terminalization layer (loop-freedom, AC5) lives here.
- `CreditNote` — only gains rows; its single mutation is `reverse()`; `amountCents` positive (credit semantics); `reason`/`status`.

### Step T5.5 — Port the derivers + sequencer

`InvoiceStatusDeriver.deriveStatus` (fixed evaluation order above).
`InvoiceNumberSequencer` — gap-free `ourNumber` allocator via `billing_invoice_sequences`
(atomic `nextNumber` increment inside the tx).

### Step T5.6 — Port the repositories (append-only writes)

Port the three repos: `InvoiceRepository.insertIfNew` (write-once via
`onConflictDoNothing`), `ChargeRepository` (version-guarded + conditional
terminalization + `listStalePending` reads), `CreditNoteRepository` (append +
`findActiveByGatewayRef`). Port their `.test.ts` where present.

### Step T5.7 — Verify + commit

Run the Gate. Then:
```bash
git add packages/api/typescript/src/billing/entities/{Invoice,Charge,CreditNote}.ts \
  packages/api/typescript/src/billing/entities/Charge.test.ts \
  packages/api/typescript/src/billing/services/{InvoiceStatusDeriver,InvoiceNumberSequencer}.ts \
  packages/api/typescript/src/billing/services/InvoiceStatusDeriver.test.ts \
  packages/api/typescript/src/billing/repositories/{InvoiceRepository,ChargeRepository,CreditNoteRepository}/
git commit -m "feat(billing): append-only ledger + invoice-status/number derivers + repos (Task T5)"
```

---

## Task T6: Wallet, checkout, dispute & profile aggregates

**Files to write:**
- Create: `packages/api/typescript/src/billing/entities/PaymentMethod.ts`
- Create: `packages/api/typescript/src/billing/entities/CheckoutSession.ts`
- Create: `packages/api/typescript/src/billing/entities/Dispute.ts`
- Create: `packages/api/typescript/src/billing/entities/BillingProfile.ts`
- Create: `packages/api/typescript/src/billing/repositories/PaymentMethodRepository/PaymentMethodRepository.ts`
- Create: `packages/api/typescript/src/billing/repositories/PaymentMethodRepository/DrizzlePaymentMethodRepository.ts`
- Create: `packages/api/typescript/src/billing/repositories/CheckoutSessionRepository/CheckoutSessionRepository.ts`
- Create: `packages/api/typescript/src/billing/repositories/CheckoutSessionRepository/DrizzleCheckoutSessionRepository.ts`
- Create: `packages/api/typescript/src/billing/repositories/DisputeRepository/DisputeRepository.ts`
- Create: `packages/api/typescript/src/billing/repositories/DisputeRepository/DrizzleDisputeRepository.ts`
- Create: `packages/api/typescript/src/billing/repositories/BillingProfileRepository/BillingProfileRepository.ts`
- Create: `packages/api/typescript/src/billing/repositories/BillingProfileRepository/DrizzleBillingProfileRepository.ts`
- Test: `packages/api/typescript/src/billing/entities/Dispute.test.ts`
- Test: `packages/api/typescript/src/billing/entities/CheckoutSession.test.ts`

**Files to read:**
- pin `f04e8a0f:packages/api/src/billing/entities/{PaymentMethod,CheckoutSession,Dispute,BillingProfile}.ts` + `Dispute.test.ts` + `CheckoutSession.test.ts`
- pin `f04e8a0f:packages/api/src/billing/repositories/{PaymentMethodRepository,CheckoutSessionRepository,DisputeRepository,BillingProfileRepository}/*`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /repository, /test
**Depends on:** T1, T2, T3
**Consumes (frozen):** `billing_payment_methods`/`billing_checkout_sessions`/`billing_disputes`/`billing_profiles` tables (T1), `PaymentMethodStatus`/`PaymentMethodType`/`CheckoutSessionStatus`/`CheckoutIntent`/`DisputeStatus`/`BillingPlatform` (T2), `PaymentInstrument`/`Mandate` (T3).
**Scope fence:** DONE — schema, enums, VOs. OUT — `ExternalChargeDisputedHandler`/WON-reversal wiring (T14), checkout-vault use case (T11), reconcilers (T15). The `Dispute` here owns only the OPEN→WON|LOST process transitions; the money stays on `CreditNote`.
**Gate:** `cd packages/api/typescript && bun test src/billing/entities/Dispute.test.ts src/billing/entities/CheckoutSession.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T6.1 — Write the failing tests

Port `Dispute.test.ts` (natural key `(gatewayDisputeRef, platform)` unique;
OPEN→WON and OPEN→LOST allowed; both terminals absorbing → re-transition raises
`INVALID_DISPUTE_TRANSITION`) and `CheckoutSession.test.ts` (`sessionRef` unique;
PENDING→COMPLETED / PENDING→EXPIRED; `intent ∈ {setup, payment}`).

### Step T6.2 — Run to verify failure

Run: `cd packages/api/typescript && bun test src/billing/entities/Dispute.test.ts`
Expected: FAIL with `Cannot find module './Dispute'`.

### Step T6.3 — Scaffold the aggregates + repositories

```bash
bun cli entity billing PaymentMethod --aggregate
bun cli entity billing CheckoutSession --aggregate
bun cli entity billing Dispute --aggregate
bun cli entity billing BillingProfile --aggregate
bun cli repository billing PaymentMethod
bun cli repository billing CheckoutSession
bun cli repository billing Dispute
bun cli repository billing BillingProfile
```

### Step T6.4 — Port the aggregates, generalizing BillingProfile brand

- `PaymentMethod` — single-table projection of `PaymentInstrument`; `status`, `isDefault`, `supportsOffSession`, capture-origin fields.
- `CheckoutSession` — `sessionRef`, `intent`, `status`, `mintedAt`/`expiresAt`.
- `Dispute` — process aggregate, absorbing WON/LOST terminals.
- `BillingProfile` — **generalize the brand**: drop the "clinic name for CLINIC tenants" doc-copy; `name` is the generic owner display name captured at onboarding. Preserve the editable-copy policy (issued invoices never change retroactively).

### Step T6.5 — Port the repositories

Port all four (+ their `.test.ts` where present). `PaymentMethodRepository` enforces
the partial unique DEFAULT index (exactly one DEFAULT among ACTIVE);
`DisputeRepository.insertIfNew` (`onConflictDoNothing`) + `findActiveByGatewayRef`;
`CheckoutSessionRepository.findBySessionRef`; `BillingProfileRepository` keyed by `owner_id`.

### Step T6.6 — Verify + commit

Run the Gate. Then:
```bash
git add packages/api/typescript/src/billing/entities/{PaymentMethod,CheckoutSession,Dispute,BillingProfile}.ts \
  packages/api/typescript/src/billing/entities/{Dispute,CheckoutSession}.test.ts \
  packages/api/typescript/src/billing/repositories/{PaymentMethodRepository,CheckoutSessionRepository,DisputeRepository,BillingProfileRepository}/
git commit -m "feat(billing): wallet / checkout / dispute / profile aggregates + repos (Task T6)"
```

---

## Task T7: PaymentProvider port + Stripe & Sandbox reference adapters

**Files to write:**
- Create: `packages/api/typescript/src/billing/services/PaymentProvider/PaymentProvider.ts`
- Create: `packages/api/typescript/src/billing/services/PaymentProvider/StripePaymentProvider.ts`
- Create: `packages/api/typescript/src/billing/services/PaymentProvider/SandboxPaymentProvider.ts`
- Create: `packages/api/typescript/src/billing/services/PaymentProvider/PaymentProviderFactory.ts`
- Create: `packages/api/typescript/src/billing/services/PaymentProvider/parseGatewayResponse.ts`
- Create: `packages/api/typescript/src/billing/services/BillingWebhookVerifier.ts`
- Create: `packages/api/typescript/src/billing/services/BillingWebhookMapper.ts`
- Test: `packages/api/typescript/src/billing/services/PaymentProvider/PaymentProviderFactory.test.ts`

**Files to read:**
- pin `f04e8a0f:packages/api/src/billing/services/PaymentProvider/{PaymentProvider,StripePaymentProvider,SandboxPaymentProvider,PaymentProviderFactory,parseGatewayResponse}.ts` + `PaymentProviderFactory.test.ts`
- pin `f04e8a0f:packages/api/src/billing/services/{BillingWebhookVerifier,BillingWebhookMapper}/*`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** T2, T3
**Consumes (frozen):** `BillingPlatform`/`BillingWebhookSource` (STRIPE/SANDBOX only), `PaymentMethodType`, `DeclineReason` (T2), `PaymentInstrument`/`Money` (T3). Result types: `ChargeResult` (`pending?`), `RefundStatus`, `ChargebackStatus`, `CheckoutSessionStatusResult`.
**Scope fence:** DONE — enums, VOs. OUT — Brazilian gateways (product plugs — NOT ported), the saga that calls the port (T8), `GatewayEventSource` (T15). The reconcile-capability methods default-throw `PROVIDER_CAPABILITY_UNSUPPORTED` on the base class; only Stripe overrides them all.
**Gate:** `cd packages/api/typescript && bun test src/billing/services/PaymentProvider/PaymentProviderFactory.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T7.1 — Scaffold the port + adapters + webhook services

```bash
bun cli service billing PaymentProvider
bun cli service billing StripePaymentProvider
bun cli service billing SandboxPaymentProvider
bun cli service billing PaymentProviderFactory
bun cli service billing BillingWebhookVerifier
bun cli service billing BillingWebhookMapper
```

Move the port + adapters + factory + `parseGatewayResponse` under a
`services/PaymentProvider/` folder to mirror the pin layout.

### Step T7.2 — Port the abstract PaymentProvider

Port `platform`, `capabilities { hostedCardCheckout, cardVaulting, pix }`;
`ensureCustomer`, `createCheckoutSession`, `chargeOffSession`,
`chargeStoredOnSession`, `cancelCharge`, `createPix`. The reconcile capabilities
(`getChargeStatus`, `getRefundStatus`, `getChargebackStatus` (`disputeRefs?`),
`getCheckoutSessionStatus`) **default-throw `PROVIDER_CAPABILITY_UNSUPPORTED`** on
the base — a new platform is born without them until it overrides (D8 capability-default).

### Step T7.3 — Port Stripe (full capability reference)

`hostedCardCheckout + cardVaulting + pix:false`; implements every reconcile
capability (`getChargeStatus`, `getRefundStatus`, `getChargebackStatus` via
`disputes.list` → identity regime, `getCheckoutSessionStatus`, window replay via
`/v1/events`). Secrets from `STRIPE_*` env. Keep the gateway idemKey passthrough
so a retry returns the same result.

### Step T7.4 — Port Sandbox (choreography-real dev provider)

Fake money, real choreography: auto-POSTs gateway-shaped webhooks back into the
pipeline; magic card `…0002` = synchronous decline. Bound only when
`BILLING_SANDBOX=true`; `assertRequiredSecrets` rejects it in production
(triple-fenced). Do NOT port Brazilian gateways — `PaymentProviderFactory` ships
STRIPE + SANDBOX branches plus a documented extension point.

### Step T7.5 — Port verifier + mapper + factory test

`BillingWebhookVerifier` (HMAC per source; skipped on our authenticated outbound
replay). `BillingWebhookMapper` (vendor payload → `External*` event, keyed by
source). Port `PaymentProviderFactory.test.ts` (STRIPE + SANDBOX resolve; unknown
platform rejects).

### Step T7.6 — Verify + commit

Run the Gate. Then:
```bash
git add packages/api/typescript/src/billing/services/PaymentProvider/ \
  packages/api/typescript/src/billing/services/BillingWebhookVerifier.ts \
  packages/api/typescript/src/billing/services/BillingWebhookMapper.ts
git commit -m "feat(billing): PaymentProvider port + Stripe & Sandbox adapters + webhook verifier/mapper (Task T7)"
```

---

## Task T8: Charge saga — SubscriptionCharger, ChargeSettler, settlement events

**Files to write:**
- Create: `packages/api/typescript/src/billing/services/SubscriptionCharger.ts`
- Create: `packages/api/typescript/src/billing/services/ChargeSettler.ts`
- Create: `packages/api/typescript/src/billing/services/InvoicePayment.ts`
- Create: `packages/api/typescript/src/billing/services/InvoiceService.ts`
- Create: `packages/api/typescript/src/billing/events/InvoicePaidEvent.ts`
- Create: `packages/api/typescript/src/billing/events/InvoicePaymentFailedEvent.ts`
- Create: `packages/api/typescript/src/billing/events/InvoiceRefundedEvent.ts`
- Create: `packages/api/typescript/src/billing/events/SubscriptionCreatedEvent.ts`
- Create: `packages/api/typescript/src/billing/events/PaymentMethodVaultedEvent.ts`
- Test: `packages/api/typescript/tests/flows/billing-settlement-exactly-once.flow.test.ts`

**Files to read:**
- pin `f04e8a0f:packages/api/src/billing/services/{SubscriptionCharger,ChargeSettler,InvoicePayment,InvoiceService}/*`
- pin `f04e8a0f:packages/api/src/billing/events/{InvoicePaidEvent,InvoicePaymentFailedEvent,InvoiceRefundedEvent,SubscriptionCreatedEvent,PaymentMethodVaultedEvent}.ts`
- `packages/api/typescript/src/shared/services/idempotency/IdempotencyGuard.ts` (L-1)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /event, /test
**Depends on:** T4, T5, T6, T7
**Consumes (frozen):** `IdempotencyGuard.claim/release` + `IdempotencyScope.INVOICE_CHARGE`/`INVOICE_SETTLED`/`INVOICE_FAILED` (T2/L-1), `PaymentProvider` (T7), `Invoice`/`Charge`/`Subscription` aggregates + repos (T4/T5), `InvoiceStatusDeriver` (T5).
**Scope fence:** DONE — aggregates, repos, provider port, idempotency scopes. OUT — webhook ingest (T9), the commands that trigger charging (T10/T11), reconcilers (T15), dunning (T14). Gateway idemKeys: saga = `{invoiceId}:{attemptNo}`.
**Gate:** `cd packages/api/typescript && bun test tests/flows/billing-settlement-exactly-once.flow.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T8.1 — Write the failing exactly-once settlement flow test

Port the pin's settlement flow test. Assert AC7: the `INVOICE_SETTLED:{invoiceId}`
claim dedups card × Pix × engine × checkout; the loser still marks `SUCCEEDED`
(loop-freedom, AC5); a distinct duplicate capture refunds exactly once
(`dup-refund:{txId}`). Also AC4 (never dun a payer — a `SUCCEEDED` charge blocks
markPastDue/placeholder-FAILED re-checked inside the claim tx) and AC13 (no
gateway call inside a tx).

### Step T8.2 — Run to verify failure

Run: `cd packages/api/typescript && bun test tests/flows/billing-settlement-exactly-once.flow.test.ts`
Expected: FAIL (services not found).

### Step T8.3 — Scaffold the saga services + settlement events

```bash
bun cli service billing SubscriptionCharger
bun cli service billing ChargeSettler
bun cli service billing InvoicePayment
bun cli service billing InvoiceService
bun cli event billing InvoicePaid
bun cli event billing InvoicePaymentFailed
bun cli event billing InvoiceRefunded
bun cli event billing SubscriptionCreated
bun cli event billing PaymentMethodVaulted
```

### Step T8.4 — Port the saga (claim-before / call-outside-tx / persist-after)

Port `SubscriptionCharger` + `ChargeSettler` + `InvoicePayment`/`InvoiceService`
verbatim, preserving Principle 4: **the gateway call NEVER runs inside a
transaction** — claim `INVOICE_CHARGE:{invoiceId}:{attemptNo}` before, call the
`PaymentProvider` outside the tx, persist after, RELEASE the claim on
provider/tx throw. `ChargeSettler` owns the `INVOICE_SETTLED` claim and the
`dup-refund:{txId}` exactly-once duplicate-capture refund. Settlement raises the
domain events. Keep the sanctioned "delegation to a claiming service" handler
idempotency strategy comment on `ChargeSettler`.

### Step T8.5 — Port the settlement/lifecycle domain events

Port the 5 events (thin domain events; same-context `InternalMediator`).

### Step T8.6 — Verify + commit

Run the Gate. Then:
```bash
git add packages/api/typescript/src/billing/services/{SubscriptionCharger,ChargeSettler,InvoicePayment,InvoiceService}.ts \
  packages/api/typescript/src/billing/events/ \
  packages/api/typescript/tests/flows/billing-settlement-exactly-once.flow.test.ts
git commit -m "feat(billing): charge saga (charger/settler) + settlement events, exactly-once (Task T8)"
```

---

## Task T9: Webhook ingest — HandleBillingWebhook + BillingEventIngest + External events

**Files to write:**
- Create: `packages/api/typescript/src/billing/usecases/HandleBillingWebhook.ts`
- Create: `packages/api/typescript/src/billing/controllers/HandleBillingWebhook.ts`
- Create: `packages/api/typescript/src/billing/services/BillingEventIngest.ts`
- Create: `packages/api/typescript/src/billing/events/ExternalInvoicePaidEvent.ts`
- Create: `packages/api/typescript/src/billing/events/ExternalInvoicePaymentFailedEvent.ts`
- Create: `packages/api/typescript/src/billing/events/ExternalInvoiceRefundedEvent.ts`
- Create: `packages/api/typescript/src/billing/events/ExternalInvoiceIssuedEvent.ts`
- Create: `packages/api/typescript/src/billing/events/ExternalCardChargeSucceededEvent.ts`
- Create: `packages/api/typescript/src/billing/events/ExternalChargeFailedEvent.ts`
- Create: `packages/api/typescript/src/billing/events/ExternalChargeRefundedEvent.ts`
- Create: `packages/api/typescript/src/billing/events/ExternalChargeDisputedEvent.ts`
- Create: `packages/api/typescript/src/billing/events/ExternalChargeDisputeWonEvent.ts`
- Create: `packages/api/typescript/src/billing/events/ExternalChargeDisputeLostEvent.ts`
- Create: `packages/api/typescript/src/billing/events/ExternalPixPaidEvent.ts`
- Create: `packages/api/typescript/src/billing/events/ExternalCheckoutCompletedEvent.ts`
- Create: `packages/api/typescript/src/billing/events/ExternalSubscriptionActivatedEvent.ts`
- Create: `packages/api/typescript/src/billing/events/ExternalSubscriptionCanceledEvent.ts`
- Test: `packages/api/typescript/src/billing/usecases/HandleBillingWebhook.test.ts`

**Files to read:**
- pin `f04e8a0f:packages/api/src/billing/usecases/HandleBillingWebhook.ts` + `.test.ts`
- pin `f04e8a0f:packages/api/src/billing/controllers/HandleBillingWebhook.ts`
- pin `f04e8a0f:packages/api/src/billing/services/BillingEventIngest/*`
- pin `f04e8a0f:packages/api/src/billing/events/External*.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller, /event, /service, /test
**Depends on:** T7, T8
**Consumes (frozen):** `BillingWebhookVerifier`/`BillingWebhookMapper`/`PaymentProviderFactory` (T7), `IdempotencyScope.WEBHOOK_STRIPE`/`WEBHOOK_SANDBOX`/`INVOICE_EVENT` + `IdempotencyGuard` (T2/L-1), the settlement events from T8.
**Scope fence:** DONE — provider/verifier/mapper, saga events. OUT — the External* HANDLERS (T14), reconcilers/window sweep that re-feed ingest (T15). The webhook controller is public (skips auth middleware); HMAC-verified.
**Gate:** `cd packages/api/typescript && bun test src/billing/usecases/HandleBillingWebhook.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T9.1 — Write the failing ingest test

Port `HandleBillingWebhook.test.ts`. Assert AC14: `WEBHOOK_<SOURCE>` claim keyed on
vendor `externalId` yields exactly 1 outbox event per delivered webhook (shared by
ingest + the window sweep); a redelivery is a no-op.

### Step T9.2 — Run to verify failure

Run: `cd packages/api/typescript && bun test src/billing/usecases/HandleBillingWebhook.test.ts`
Expected: FAIL (module not found).

### Step T9.3 — Scaffold usecase, controller, ingest service, External events

```bash
bun cli usecase billing HandleBillingWebhook
bun cli controller billing HandleBillingWebhook -m POST
bun cli service billing BillingEventIngest
bun cli event billing ExternalInvoicePaid
bun cli event billing ExternalInvoicePaymentFailed
bun cli event billing ExternalInvoiceRefunded
bun cli event billing ExternalInvoiceIssued
bun cli event billing ExternalCardChargeSucceeded
bun cli event billing ExternalChargeFailed
bun cli event billing ExternalChargeRefunded
bun cli event billing ExternalChargeDisputed
bun cli event billing ExternalChargeDisputeWon
bun cli event billing ExternalChargeDisputeLost
bun cli event billing ExternalPixPaid
bun cli event billing ExternalCheckoutCompleted
bun cli event billing ExternalSubscriptionActivated
bun cli event billing ExternalSubscriptionCanceled
```

### Step T9.4 — Port the ingest pipeline

Port the flow `Controller → verifier → PaymentProviderFactory → BillingWebhookMapper
→ External* event → BillingEventIngest → outbox`. `BillingEventIngest` claims
`WEBHOOK_<SOURCE>:{externalId}` (1 outbox event per delivery) and `INVOICE_EVENT`
(`event.id` or `verb:{externalId}`) for per-fact dedup. The controller is public
(no auth middleware), HMAC-verified, and returns 200 fast (work is async via
outbox). No new write path — the window sweep (T15) re-feeds the SAME ingest.

### Step T9.5 — Port the External* events

Port all 15 `External*` events (external integration facts consumed by T14 handlers).

### Step T9.6 — Verify + commit

Run the Gate. Then:
```bash
git add packages/api/typescript/src/billing/usecases/HandleBillingWebhook.ts \
  packages/api/typescript/src/billing/usecases/HandleBillingWebhook.test.ts \
  packages/api/typescript/src/billing/controllers/HandleBillingWebhook.ts \
  packages/api/typescript/src/billing/services/BillingEventIngest.ts \
  packages/api/typescript/src/billing/events/External*.ts
git commit -m "feat(billing): webhook ingest pipeline + External events (Task T9)"
```

---

## Task T10: Subscription commands — subscribe / change-plan / cancel / resume

**Files to write:**
- Create: `packages/api/typescript/src/billing/usecases/CreateSubscription.ts`
- Create: `packages/api/typescript/src/billing/usecases/ChangePlan.ts`
- Create: `packages/api/typescript/src/billing/usecases/PreviewPlanChange.ts`
- Create: `packages/api/typescript/src/billing/usecases/CancelSubscription.ts`
- Create: `packages/api/typescript/src/billing/usecases/ResumeSubscription.ts`
- Create: `packages/api/typescript/src/billing/usecases/CancelScheduledDowngrade.ts`
- Create: `packages/api/typescript/src/billing/controllers/CreateSubscription.ts`
- Create: `packages/api/typescript/src/billing/controllers/ChangePlan.ts`
- Create: `packages/api/typescript/src/billing/controllers/PreviewPlanChange.ts`
- Create: `packages/api/typescript/src/billing/controllers/CancelSubscription.ts`
- Create: `packages/api/typescript/src/billing/controllers/ResumeSubscription.ts`
- Create: `packages/api/typescript/src/billing/controllers/CancelScheduledDowngrade.ts`
- Create: `packages/api/typescript/src/billing/services/ProrationCalculator.ts`
- Create: `packages/api/typescript/src/billing/events/SubscriptionChangedEvent.ts`
- Test: `packages/api/typescript/src/billing/usecases/ChangePlan.test.ts`
- Test: `packages/api/typescript/src/billing/usecases/CreateSubscription.test.ts`

**Files to read:**
- pin `f04e8a0f:packages/api/src/billing/usecases/{CreateSubscription,ChangePlan,PreviewPlanChange,CancelSubscription,ResumeSubscription,CancelScheduledDowngrade}.ts` + colocated tests
- pin `f04e8a0f:packages/api/src/billing/controllers/{CreateSubscription,ChangePlan,PreviewPlanChange,CancelSubscription,ResumeSubscription,CancelScheduledDowngrade}.ts`
- pin `f04e8a0f:packages/api/src/billing/services/ProrationCalculator/*`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller, /service, /event, /schema, /test
**Depends on:** T4, T7, T8
**Consumes (frozen):** `Subscription` + repo + `SubscriptionAccessDeriver` (T4), `SubscriptionCharger` (T8), `PlanRegistry` (T3), `SubscriptionChangedEvent` wire binding (T1), `IdempotencyScope.SUBSCRIPTION_PER_OWNER` (T2).
**Scope fence:** DONE — subscription aggregate, charger, plan registry, the frozen `SubscriptionChangedEvent` contract. OUT — pay/refund/wallet commands (T11), the quota-side consumer of `SubscriptionChangedEvent` (quota spec). Upgrade-decline must revert the plan and void the proration (AC4 — never dun a rejected upgrade). `SubscriptionChangedEvent { ownerId }` fires in the SAME tx as every access-relevant change.
**Gate:** `cd packages/api/typescript && bun test src/billing/usecases/ChangePlan.test.ts src/billing/usecases/CreateSubscription.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T10.1 — Write the failing command tests

Port `CreateSubscription.test.ts` (card-on-file → immediate charge; else hosted
checkout that pays first invoice + vaults card) and `ChangePlan.test.ts`
(mid-period upgrade → prorated charge now; upgrade decline → plan reverts +
proration voids, never dunned; scheduled downgrade → new limits apply at next
renewal only).

### Step T10.2 — Run to verify failure

Run: `cd packages/api/typescript && bun test src/billing/usecases/ChangePlan.test.ts`
Expected: FAIL (module not found).

### Step T10.3 — Scaffold the commands, controllers, proration, event

```bash
bun cli usecase billing CreateSubscription
bun cli usecase billing ChangePlan
bun cli usecase billing PreviewPlanChange
bun cli usecase billing CancelSubscription
bun cli usecase billing ResumeSubscription
bun cli usecase billing CancelScheduledDowngrade
bun cli controller billing CreateSubscription -m POST
bun cli controller billing ChangePlan -m POST
bun cli controller billing PreviewPlanChange -m POST
bun cli controller billing CancelSubscription -m POST
bun cli controller billing ResumeSubscription -m POST
bun cli controller billing CancelScheduledDowngrade -m POST
bun cli service billing ProrationCalculator
bun cli event billing SubscriptionChanged --integration
```

### Step T10.4 — Port the commands + proration + event emission

Port each use case verbatim inside a `UnitOfWork`: load `Subscription`, mutate,
save, raise events. `ChangePlan` computes proration via `ProrationCalculator`,
charges via `SubscriptionCharger`, and on decline reverts the plan + voids the
proration (AC4). Every access-relevant change emits `SubscriptionChangedEvent {
ownerId }` in the same tx. `CreateSubscription` = `resubscribe()` in-place
(clears cancellation facts). Port the controllers with expressive Zod input
schemas (`body`/`query`/`params`/`ctx` keys only; `z.uuid()`/`z.enum(Enum)`, no
`z.instance`).

### Step T10.5 — Verify + commit

Run the Gate. Then:
```bash
git add packages/api/typescript/src/billing/usecases/{CreateSubscription,ChangePlan,PreviewPlanChange,CancelSubscription,ResumeSubscription,CancelScheduledDowngrade}.ts \
  packages/api/typescript/src/billing/usecases/{ChangePlan,CreateSubscription}.test.ts \
  packages/api/typescript/src/billing/controllers/{CreateSubscription,ChangePlan,PreviewPlanChange,CancelSubscription,ResumeSubscription,CancelScheduledDowngrade}.ts \
  packages/api/typescript/src/billing/services/ProrationCalculator.ts \
  packages/api/typescript/src/billing/events/SubscriptionChangedEvent.ts
git commit -m "feat(billing): subscription lifecycle commands + proration + change event (Task T10)"
```

---

## Task T11: Pay, refund, wallet & profile commands + refund doctrine

**Files to write:**
- Create: `packages/api/typescript/src/billing/usecases/PayInvoice.ts`
- Create: `packages/api/typescript/src/billing/usecases/RequestRefund.ts`
- Create: `packages/api/typescript/src/billing/usecases/RefundInvoice.ts`
- Create: `packages/api/typescript/src/billing/usecases/RegisterBillingProfile.ts`
- Create: `packages/api/typescript/src/billing/usecases/UpdateBillingProfile.ts`
- Create: `packages/api/typescript/src/billing/usecases/SetDefaultPaymentMethod.ts`
- Create: `packages/api/typescript/src/billing/usecases/RemovePaymentMethod.ts`
- Create: `packages/api/typescript/src/billing/controllers/PayInvoice.ts`
- Create: `packages/api/typescript/src/billing/controllers/RequestRefund.ts`
- Create: `packages/api/typescript/src/billing/controllers/RefundInvoice.ts`
- Create: `packages/api/typescript/src/billing/controllers/RegisterBillingProfile.ts`
- Create: `packages/api/typescript/src/billing/controllers/UpdateBillingProfile.ts`
- Create: `packages/api/typescript/src/billing/controllers/SetDefaultPaymentMethod.ts`
- Create: `packages/api/typescript/src/billing/controllers/RemovePaymentMethod.ts`
- Create: `packages/api/typescript/src/billing/controllers/SandboxCheckout.ts`
- Create: `packages/api/typescript/src/billing/services/RefundPolicy.ts`
- Create: `packages/api/typescript/src/billing/services/CreditNoteService.ts`
- Test: `packages/api/typescript/src/billing/usecases/RequestRefund.test.ts`
- Test: `packages/api/typescript/src/billing/usecases/PayInvoice.test.ts`

**Files to read:**
- pin `f04e8a0f:packages/api/src/billing/usecases/{PayInvoice,RequestRefund,RefundInvoice,RegisterBillingProfile,UpdateBillingProfile,SetDefaultPaymentMethod,RemovePaymentMethod}.ts` + colocated tests
- pin `f04e8a0f:packages/api/src/billing/controllers/{PayInvoice,RequestRefund,RefundInvoice,RegisterBillingProfile,UpdateBillingProfile,SetDefaultPaymentMethod,RemovePaymentMethod,SandboxCheckout}.ts`
- pin `f04e8a0f:packages/api/src/billing/services/{RefundPolicy,CreditNoteService}/*`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller, /service, /schema, /test
**Depends on:** T5, T6, T7, T8
**Consumes (frozen):** `Invoice`/`Charge`/`CreditNote` + repos (T5), `PaymentMethod`/`BillingProfile` + repos (T6), `PaymentProvider` (T7), `ChargeSettler`/`InvoicePayment` (T8), `IdempotencyScope.REFUND_EXPECTATION`/`CHECKOUT_VAULT` (T2), `RefundBasis`/`RefundSource` (T2).
**Scope fence:** DONE — ledger + wallet aggregates, provider, saga. OUT — dispute-won reversal handler (T14), reconcilers (T15). **Reverts doctrine (D11):** `RequestRefund` gateway idemKey = `refund:{invoiceId}` (per-invoice, NEVER by amount — a pro-rata amount shrinks with the clock → double-refund); `RefundInvoice` (operator) = `cancel:{txId}:{amount}`. Neither writes a credit note — the ledger only records a gateway-confirmed fact (webhook). `SandboxCheckout` is `BILLING_SANDBOX`-only.
**Gate:** `cd packages/api/typescript && bun test src/billing/usecases/RequestRefund.test.ts src/billing/usecases/PayInvoice.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T11.1 — Write the failing tests

Port `RequestRefund.test.ts` (AC9: a retried `RequestRefund` uses
`refund:{invoiceId}` and never double-refunds; a partial `RefundInvoice` uses
`cancel:{txId}:{amount}`; CDC-window full amount vs pro-rata slice past the
window) and `PayInvoice.test.ts` (retry / manual card / Pix restore access from
the paid invoice's period; never double-charged when a webhook races the payment).

### Step T11.2 — Run to verify failure

Run: `cd packages/api/typescript && bun test src/billing/usecases/RequestRefund.test.ts`
Expected: FAIL (module not found).

### Step T11.3 — Scaffold the commands, controllers, services

```bash
bun cli usecase billing PayInvoice
bun cli usecase billing RequestRefund
bun cli usecase billing RefundInvoice
bun cli usecase billing RegisterBillingProfile
bun cli usecase billing UpdateBillingProfile
bun cli usecase billing SetDefaultPaymentMethod
bun cli usecase billing RemovePaymentMethod
bun cli controller billing PayInvoice -m POST
bun cli controller billing RequestRefund -m POST
bun cli controller billing RefundInvoice -m POST
bun cli controller billing RegisterBillingProfile -m POST
bun cli controller billing UpdateBillingProfile -m PATCH
bun cli controller billing SetDefaultPaymentMethod -m POST
bun cli controller billing RemovePaymentMethod -m DELETE
bun cli controller billing SandboxCheckout -m POST
bun cli service billing RefundPolicy
bun cli service billing CreditNoteService
```

### Step T11.4 — Port the commands + refund doctrine + services

Port each use case verbatim. `RequestRefund` → `RefundPolicy` chooses
`RefundBasis` (CDC_WINDOW / PRO_RATA / NONE); gateway idemKey `refund:{invoiceId}`.
`RefundInvoice` (operator) → `cancel:{txId}:{amount}`. Neither writes a credit
note — the CHARGEBACK/REFUND credit note is minted only by the settlement handler
on a gateway-confirmed webhook. `CreditNoteService` centralizes credit-note
issuance/reversal (used by T14 handlers). Port controllers with `body`/`params`/`ctx`
Zod schemas.

### Step T11.5 — Verify + commit

Run the Gate. Then:
```bash
git add packages/api/typescript/src/billing/usecases/{PayInvoice,RequestRefund,RefundInvoice,RegisterBillingProfile,UpdateBillingProfile,SetDefaultPaymentMethod,RemovePaymentMethod}.ts \
  packages/api/typescript/src/billing/usecases/{RequestRefund,PayInvoice}.test.ts \
  packages/api/typescript/src/billing/controllers/{PayInvoice,RequestRefund,RefundInvoice,RegisterBillingProfile,UpdateBillingProfile,SetDefaultPaymentMethod,RemovePaymentMethod,SandboxCheckout}.ts \
  packages/api/typescript/src/billing/services/{RefundPolicy,CreditNoteService}.ts
git commit -m "feat(billing): pay/refund/wallet/profile commands + reverts doctrine (Task T11)"
```

---

## Task T12: BFF read side — subscription, invoices, usage (app gate)

**Files to write:**
- Create: `packages/api/typescript/src/ui/usecases/billing/GetSubscription.ts`
- Create: `packages/api/typescript/src/ui/usecases/billing/ListInvoices.ts`
- Create: `packages/api/typescript/src/ui/usecases/billing/GetUsage.ts`
- Create: `packages/api/typescript/src/ui/controllers/billing/GetSubscription.ts`
- Create: `packages/api/typescript/src/ui/controllers/billing/ListInvoices.ts`
- Create: `packages/api/typescript/src/ui/controllers/billing/GetUsage.ts`
- Test: `packages/api/typescript/src/ui/usecases/billing/GetSubscription.test.ts`

**Files to read:**
- pin `f04e8a0f:packages/api/src/ui/usecases/billing/*` (if present) — else derive the read DTOs directly from the derivers
- `packages/api/typescript/src/ui/usecases/` (sibling BFF query idiom)
- `packages/api/typescript/src/billing/services/{SubscriptionAccessDeriver,InvoiceStatusDeriver}.ts` (T4/T5 — read via repositories, never the SDK client)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query, /controller, /schema, /test
**Depends on:** T4, T5
**Consumes (frozen):** `SubscriptionAccessDeriver`/`SubscriptionRepository` (T4), `InvoiceStatusDeriver`/`InvoiceRepository` (T5), `billing_usage_rollups` table (T1), `PlanRegistry` (T3).
**Scope fence:** DONE — derivers + repos. OUT — the React billing screens (out of scope entirely). Reads use direct Drizzle/repository access (BFF pattern); never the SDK HTTP client (cycle). Access + invoice status come from the derivers, never a stored column (AC6).
**Gate:** `cd packages/api/typescript && bun test src/ui/usecases/billing/GetSubscription.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T12.1 — Write the failing read test

Port/author `GetSubscription.test.ts`: returns the derived access + plan + period
DTO the app gate needs; `INCOMPLETE` reports no access; a canceled-effective
subscription reports access through `paidThrough`.

### Step T12.2 — Run to verify failure

Run: `cd packages/api/typescript && bun test src/ui/usecases/billing/GetSubscription.test.ts`
Expected: FAIL (module not found).

### Step T12.3 — Scaffold the BFF queries + controllers

```bash
bun cli query GetSubscription
bun cli query ListInvoices
bun cli query GetUsage
bun cli controller ui GetSubscription -m GET
bun cli controller ui ListInvoices -m GET
bun cli controller ui GetUsage -m GET
```

Move the generated queries under `ui/usecases/billing/` and controllers under
`ui/controllers/billing/` to match the context convention.

### Step T12.4 — Port/author the reads

`GetSubscription` → `SubscriptionAccessDeriver.computeAccess` + `PlanRegistry`
quotas. `ListInvoices` → invoices with `InvoiceStatusDeriver`-derived status.
`GetUsage` → `billing_usage_rollups` per `QuotaKey` for the current period vs the
plan quota. All read via repositories/Drizzle directly.

### Step T12.5 — Verify + commit

Run the Gate. Then:
```bash
git add packages/api/typescript/src/ui/usecases/billing/ packages/api/typescript/src/ui/controllers/billing/
git commit -m "feat(ui): billing BFF reads — subscription/invoices/usage (Task T12)"
```

---

## Task T13: Contract Lock — SDK regen for all billing + BFF controllers

**Files to write:**
- Regen: `packages/api/typescript/src/api/openapi.json`
- Regen: `packages/client/dist/**`

**Files to read:**
- `packages/api/typescript/src/billing/controllers/` and `packages/api/typescript/src/ui/controllers/billing/` (the new endpoints)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** T9, T10, T11, T12
**Consumes (frozen):** every controller Zod schema authored in T9/T10/T11/T12 (`HandleBillingWebhook`, `CreateSubscription`, `ChangePlan`, `PreviewPlanChange`, `CancelSubscription`, `ResumeSubscription`, `CancelScheduledDowngrade`, `PayInvoice`, `RequestRefund`, `RefundInvoice`, `RegisterBillingProfile`, `UpdateBillingProfile`, `SetDefaultPaymentMethod`, `RemovePaymentMethod`, `SandboxCheckout`, `GetSubscription`, `ListInvoices`, `GetUsage`).
**Scope fence:** DONE — all billing + BFF controllers. OUT — no new endpoints here; regen only. This is the single SDK freeze downstream of every billing controller.
**Gate:** `bun tsc` (0 errors across all workspaces after regen)

### Step T13.1 — Regenerate OpenAPI + SDK

```bash
bun emit-openapi && bun sdk
```

### Step T13.2 — Verify regen produced expected artifacts

```bash
git diff --stat packages/client/dist/ packages/api/typescript/src/api/openapi.json
```
Expected: `openapi.json` changed; `packages/client/dist/**` gained the billing +
BFF hooks/schemas/query-keys (e.g. `useCreateSubscription`, `useListInvoices`).

### Step T13.3 — Type-check after regen

Run: `bun tsc`
Expected: 0 errors across all workspaces.

### Step T13.4 — Commit

```bash
git add packages/api/typescript/src/api/openapi.json packages/client/dist/
git commit -m "chore(sdk): regenerate openapi+sdk for billing (Task T13)"
```

---

## Task T14: Dunning matured + internal settlement handlers

**Files to write:**
- Create: `packages/api/typescript/src/billing/services/DunningLifecycle.ts`
- Create: `packages/api/typescript/src/billing/services/DunningRetryPolicy.ts`
- Create: `packages/api/typescript/src/billing/services/DeclineClassifier.ts`
- Create: `packages/api/typescript/src/billing/services/DunningNotifier.ts`
- Create: `packages/api/typescript/src/billing/services/MailSender.ts`
- Create: `packages/api/typescript/src/billing/events/DunningStartedEvent.ts`
- Create: `packages/api/typescript/src/billing/events/DunningAttemptFailedEvent.ts`
- Create: `packages/api/typescript/src/billing/events/DunningSucceededEvent.ts`
- Create: `packages/api/typescript/src/billing/events/DunningFailedEvent.ts`
- Create: `packages/api/typescript/src/billing/handlers/ExternalInvoicePaidHandler.ts`
- Create: `packages/api/typescript/src/billing/handlers/ExternalInvoicePaymentFailedHandler.ts`
- Create: `packages/api/typescript/src/billing/handlers/ExternalInvoiceRefundedHandler.ts`
- Create: `packages/api/typescript/src/billing/handlers/ExternalInvoiceIssuedHandler.ts`
- Create: `packages/api/typescript/src/billing/handlers/ExternalCardChargeSucceededHandler.ts`
- Create: `packages/api/typescript/src/billing/handlers/ExternalChargeFailedHandler.ts`
- Create: `packages/api/typescript/src/billing/handlers/ExternalChargeRefundedHandler.ts`
- Create: `packages/api/typescript/src/billing/handlers/ExternalChargeDisputedHandler.ts`
- Create: `packages/api/typescript/src/billing/handlers/ExternalChargeDisputeWonHandler.ts`
- Create: `packages/api/typescript/src/billing/handlers/ExternalChargeDisputeLostHandler.ts`
- Create: `packages/api/typescript/src/billing/handlers/ExternalPixPaidHandler.ts`
- Create: `packages/api/typescript/src/billing/handlers/ExternalCheckoutCompletedHandler.ts`
- Create: `packages/api/typescript/src/billing/handlers/InvoicePaidHandler.ts`
- Create: `packages/api/typescript/src/billing/handlers/InvoicePaymentFailedHandler.ts`
- Create: `packages/api/typescript/src/billing/handlers/DunningStartedHandler.ts`
- Create: `packages/api/typescript/src/billing/handlers/DunningAttemptFailedHandler.ts`
- Create: `packages/api/typescript/src/billing/handlers/DunningSucceededHandler.ts`
- Create: `packages/api/typescript/src/billing/handlers/DunningFailedHandler.ts`
- Test: `packages/api/typescript/src/billing/services/DunningLifecycle.test.ts`
- Test: `packages/api/typescript/tests/flows/billing-dunning-journey.flow.test.ts`

**Files to read:**
- pin `f04e8a0f:packages/api/src/billing/services/{DunningLifecycle,DunningRetryPolicy,DeclineClassifier,DunningNotifier,MailSender}/*`
- pin `f04e8a0f:packages/api/src/billing/events/Dunning*.ts`
- pin `f04e8a0f:packages/api/src/billing/handlers/{External*,Invoice*,Dunning*}.ts` + `internal.ts` + `external.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /event, /handler, /test
**Depends on:** T8, T9, T10, T11
**Consumes (frozen):** the External* events (T9), settlement events (T8), `Dispute` aggregate + `CreditNoteService` (T6/T11), `ChargeSettler` (T8), `IdempotencyScope.INVOICE_DUNNING*`/`INVOICE_FAILED`/`INVOICE_EVENT` + `IdempotencyGuard` (T2/L-1).
**Scope fence:** DONE — events, settler, credit-note service, dispute aggregate. OUT — the periodic jobs that TRIGGER dunning retries + the reconcilers (T15), the rails (T16). Each handler declares its idempotency strategy (explicit claim / delegation to `ChargeSettler` / convergent write) with the mechanism named in a comment (cc-bp-25). `ExternalChargeDisputedHandler` creates the `Dispute` via `insertIfNew` in the SAME tx as the CHARGEBACK credit note; WON reverses the CN found by `(invoice, gatewayRef)` best-effort after the money reversal; LOST only transitions the process.
**Gate:** `cd packages/api/typescript && bun test src/billing/services/DunningLifecycle.test.ts tests/flows/billing-dunning-journey.flow.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T14.1 — Write the failing dunning tests

Port `DunningLifecycle.test.ts` (AC: phase = `COUNT(FAILED)` on the invoice,
**derived never stored**; retry offsets 2/4/7 days from first failure anchored to
midnight in the configured tz; a hard decline via `DeclineClassifier` = no retry;
the intentional `- 1` off-by-one is ported WITH its "do not fix" comment) and the
`billing-dunning-journey.flow.test.ts` (subscribe → renewal fail → dunning
phases with per-phase events + emails, mail never blocks the state machine; AC4
never dun a payer re-checked inside the claim tx).

### Step T14.2 — Run to verify failure

Run: `cd packages/api/typescript && bun test src/billing/services/DunningLifecycle.test.ts`
Expected: FAIL (module not found).

### Step T14.3 — Scaffold dunning services, phase events, handlers

```bash
bun cli service billing DunningLifecycle
bun cli service billing DunningRetryPolicy
bun cli service billing DeclineClassifier
bun cli service billing DunningNotifier
bun cli service billing MailSender
bun cli event billing DunningStarted
bun cli event billing DunningAttemptFailed
bun cli event billing DunningSucceeded
bun cli event billing DunningFailed
bun cli handler billing ExternalInvoicePaid --external
bun cli handler billing ExternalInvoicePaymentFailed --external
bun cli handler billing ExternalInvoiceRefunded --external
bun cli handler billing ExternalInvoiceIssued --external
bun cli handler billing ExternalCardChargeSucceeded --external
bun cli handler billing ExternalChargeFailed --external
bun cli handler billing ExternalChargeRefunded --external
bun cli handler billing ExternalChargeDisputed --external
bun cli handler billing ExternalChargeDisputeWon --external
bun cli handler billing ExternalChargeDisputeLost --external
bun cli handler billing ExternalPixPaid --external
bun cli handler billing ExternalCheckoutCompleted --external
bun cli handler billing InvoicePaid
bun cli handler billing InvoicePaymentFailed
bun cli handler billing DunningStarted
bun cli handler billing DunningAttemptFailed
bun cli handler billing DunningSucceeded
bun cli handler billing DunningFailed
```

### Step T14.4 — Port the dunning state machine + notifier

Port `DunningLifecycle` (phase = derived `COUNT(FAILED)`), `DunningRetryPolicy`
(offsets 2/4/7, midnight-anchored), `DeclineClassifier` (hard decline = stop
early), `DunningNotifier`/`MailSender` (emails in separate handlers; mail never
blocks). Each phase event carries its own `INVOICE_DUNNING_*` claim; the email
carries `INVOICE_DUNNING:phase:{invoiceId}`. Preserve the ported "do not fix"
off-by-one comment.

### Step T14.5 — Port the settlement + dispute + dunning handlers

Port every handler (each subscribes to exactly one event; declares its
idempotency strategy in a comment). Wire `internal.ts` + `external.ts` fan-out.
`ExternalChargeDisputedHandler` and the WON/LOST handlers implement the D9
two-regime dispute behavior (money on `CreditNote`, process on `Dispute`).

### Step T14.6 — Verify + commit

Run the Gate. Then:
```bash
git add packages/api/typescript/src/billing/services/{DunningLifecycle,DunningRetryPolicy,DeclineClassifier,DunningNotifier,MailSender}.ts \
  packages/api/typescript/src/billing/services/DunningLifecycle.test.ts \
  packages/api/typescript/src/billing/events/Dunning*.ts \
  packages/api/typescript/src/billing/handlers/ \
  packages/api/typescript/tests/flows/billing-dunning-journey.flow.test.ts
git commit -m "feat(billing): dunning state machine + settlement/dispute handlers (Task T14)"
```

---

## Task T15: Four-layer reconciliation program + seams + jobs

**Files to write:**
- Create: `packages/api/typescript/src/billing/services/GatewayEventSource/GatewayEventSource.ts`
- Create: `packages/api/typescript/src/billing/services/GatewayEventSource/StripeEventSource.ts`
- Create: `packages/api/typescript/src/billing/services/GatewayEventSource/SandboxEventSource.ts`
- Create: `packages/api/typescript/src/billing/services/GatewayEventSource/GatewayEventSourceFactory.ts`
- Create: `packages/api/typescript/src/billing/services/OperatorAlert.ts`
- Create: `packages/api/typescript/src/billing/services/TwoTickDriftAlert.ts`
- Create: `packages/api/typescript/src/billing/services/ChargeReconciler.ts`
- Create: `packages/api/typescript/src/billing/services/CheckoutSessionReconciler.ts`
- Create: `packages/api/typescript/src/billing/services/CheckoutSessionRecorder.ts`
- Create: `packages/api/typescript/src/billing/services/BillingClock.ts`
- Create: `packages/api/typescript/src/billing/usecases/ReconcileCharge.ts`
- Create: `packages/api/typescript/src/billing/usecases/ReconcileCheckoutSession.ts`
- Create: `packages/api/typescript/src/billing/jobs/BillingClockJob.ts`
- Create: `packages/api/typescript/src/billing/jobs/DunningRetryJob.ts`
- Create: `packages/api/typescript/src/billing/jobs/ReconcilePendingChargesJob.ts`
- Create: `packages/api/typescript/src/billing/jobs/ReconcileCheckoutSessionsJob.ts`
- Create: `packages/api/typescript/src/billing/jobs/WindowReconcileJob.ts`
- Create: `packages/api/typescript/src/billing/jobs/RefundReconcileJob.ts`
- Create: `packages/api/typescript/src/billing/jobs/ChargebackReconcileJob.ts`
- Test: `packages/api/typescript/tests/flows/billing-window-reconcile.flow.test.ts`
- Test: `packages/api/typescript/tests/flows/billing-refund-drift-detect.flow.test.ts`

**Files to read:**
- pin `f04e8a0f:packages/api/src/billing/services/{GatewayEventSource,OperatorAlert,ReconcileAlert,ChargeReconciler,CheckoutSessionReconciler,CheckoutSessionRecorder,BillingClock}/*`
- pin `f04e8a0f:packages/api/src/billing/usecases/{ReconcileCharge,ReconcileCheckoutSession}.ts`
- pin `f04e8a0f:packages/api/src/billing/jobs/*`
- `packages/api/typescript/core/services/commandQueue/*` (L-0.5 `PostgresCommandQueue`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /usecase, /test
**Depends on:** T7, T14
**Consumes (frozen):** `PaymentProvider` reconcile capabilities + `BillingWebhookMapper` (T7), `ChargeReconciler` inputs = `Charge`/`Invoice` repos (T5), `IdempotencyScope.RECONCILE_STALE_ALERT`/`CHARGE_SETTLER_ALERT` (T2), `LoggingService` (core), `CommandQueue`/`PostgresCommandQueue` (L-0.5), the External* events re-fed via ingest (T9).
**Scope fence:** DONE — provider, ingest, handlers, idempotency scopes, command queue. OUT — the mechanical rail that POLICES this program (T16). **Alarm transactionality:** per-object alarms (`reconcile:{chargeId}` W4, `reconcile-checkout:{sessionRef}` W11) enqueue in the caller tx + cancel in the settlement tx ONLY under `COMMAND_QUEUE_DRIVER=postgres`; under BullMQ the periodic sweep is the backstop. **Detect jobs never write the ledger** (AC11): `RefundReconcileJob`/`ChargebackReconcileJob` have zero `.save(`, zero `CreditNoteService`, zero `new *Event(`; two-tick persistence via `TwoTickDriftAlert`; exactly-one `OperatorAlert` after a won `RECONCILE_STALE_ALERT` claim (AC12 — no `console.error`).
**Gate:** `cd packages/api/typescript && bun test tests/flows/billing-window-reconcile.flow.test.ts tests/flows/billing-refund-drift-detect.flow.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T15.1 — Write the failing reconciliation flow tests

Port the window-sweep flow (Layer 2: `WindowReconcileJob` + `GatewayEventSource`
replays vendor-shaped payloads through the REAL mapper → the same External*
events → re-feeds `BillingEventIngest` → outbox → existing handlers; AC: a dropped
webhook is recovered with no new write path, dedup via the shared
`WEBHOOK_<SOURCE>` claim) and the refund-drift detect flow (Layer 3:
`RefundReconcileJob` enumerates `listWithSucceededChargeSince`, in-flight brake via
`InvoiceRefundedEvent` expectation, emits exactly-one operator alert with runbook,
writes NOTHING to the ledger — assert `ledgerWrites()` / snapshot unchanged, AC11).

### Step T15.2 — Run to verify failure

Run: `cd packages/api/typescript && bun test tests/flows/billing-window-reconcile.flow.test.ts`
Expected: FAIL (services/jobs not found).

### Step T15.3 — Scaffold the seams, reconcilers, reconcile use cases

```bash
bun cli service billing GatewayEventSource
bun cli service billing StripeEventSource
bun cli service billing SandboxEventSource
bun cli service billing GatewayEventSourceFactory
bun cli service billing OperatorAlert
bun cli service billing TwoTickDriftAlert
bun cli service billing ChargeReconciler
bun cli service billing CheckoutSessionReconciler
bun cli service billing CheckoutSessionRecorder
bun cli service billing BillingClock
bun cli usecase billing ReconcileCharge
bun cli usecase billing ReconcileCheckoutSession
```

The 7 jobs under `billing/jobs/` are NOT `bun cli` artifacts (no job verb) —
hand-author them from the pin after scaffolding the services they call, moving the
event sources under a `services/GatewayEventSource/` folder to mirror the pin.

### Step T15.4 — Port the seams

`GatewayEventSource` (abstract): `source`, `requiresOpenInvoices`,
`collectMissedEvents`, `syntheticRequest` (reuse the real mapper; verifier does not
run on our authenticated outbound); default `{ listed:0, events:[] }` — never a
throw for an unconfigured platform. `OperatorAlert` → `LoggingService`
(`OtlpLoggingService` prod / `MockLoggingService` test): structured `kind`/`alertKey`/`runbook`
+ flat context, never an interpolated string; every `emit()` follows a won
`RECONCILE_STALE_ALERT` claim. `TwoTickDriftAlert` (shared two-tick persistence;
optional `pendingBucket` suffix for the monthly-bucket chargeback case).

### Step T15.5 — Port the reconcilers + reconcile use cases

`ChargeReconciler` (Layer 1, W4): poll `getChargeStatus` → settle / terminalize /
alert. `CheckoutSessionReconciler` + `CheckoutSessionRecorder` (Layer 2b, W11):
per-session object; Stripe resolves by poll, others alert at max-age
(capability-default). `ReconcileCharge`/`ReconcileCheckoutSession` use cases wrap
them. `BillingClock` (W6 renewal): chunked period-close sweep →
`ExternalInvoiceIssuedEvent` (deterministic id, re-tick no-op via write-once + claim).

### Step T15.6 — Port the 7 jobs

`BillingClockJob` (W6), `DunningRetryJob` (W5), `ReconcilePendingChargesJob` (W4),
`ReconcileCheckoutSessionsJob` (W11), `WindowReconcileJob` (W10),
`RefundReconcileJob` (W8 detect), `ChargebackReconcileJob` (W8 detect, two
regimes: identity set-difference for Stripe / boolean per-invoice with monthly
`pendingBucket`). The two `family:'detect'` jobs write nothing to the ledger.

### Step T15.7 — Verify + commit

Run the Gate. Then:
```bash
git add packages/api/typescript/src/billing/services/{GatewayEventSource,OperatorAlert,TwoTickDriftAlert,ChargeReconciler,CheckoutSessionReconciler,CheckoutSessionRecorder,BillingClock}* \
  packages/api/typescript/src/billing/usecases/{ReconcileCharge,ReconcileCheckoutSession}.ts \
  packages/api/typescript/src/billing/jobs/ \
  packages/api/typescript/tests/flows/billing-window-reconcile.flow.test.ts \
  packages/api/typescript/tests/flows/billing-refund-drift-detect.flow.test.ts
git commit -m "feat(billing): four-layer reconciliation program + seams + jobs (Task T15)"
```

---

## Task T16: Mechanical rails — reconciliation-coverage + tx-discipline + boundary exception

**Files to write:**
- Create: `packages/api/typescript/tests/architecture/reconciliation-coverage.test.ts`
- Modify: `packages/api/typescript/tests/architecture/context-boundary.test.ts` — add the single billing↔quota `CONTEXT_IMPORT_EXCEPTIONS` entry (one-line edit; L-13-owned file)
- Modify: `packages/api/typescript/tests/architecture/tx-discipline.test.ts` — ensure the no-gateway-call-in-tx scan covers `billing/` (L-13-owned file)

**Files to read:**
- pin `f04e8a0f:packages/api/tests/architecture/reconciliation-coverage.test.ts`
- pin `f04e8a0f:packages/api/tests/architecture/{context-boundary,tx-discipline}.test.ts`
- `packages/api/typescript/tests/architecture/README.md` + `probe-discipline.test.ts` (template rail idiom)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T15
**Consumes (frozen):** the job class names from T15 (`BillingClockJob`, `DunningRetryJob`, `ReconcilePendingChargesJob`, `ReconcileCheckoutSessionsJob`, `WindowReconcileJob`, `RefundReconcileJob`, `ChargebackReconcileJob`), `OperatorAlert` seam, the `RECONCILE_STALE_ALERT` claim-key prefixes (`unpollable:`, `checkout:`, `refund-drift:`, `refund-unmonitored:`, `chargeback-drift(-pending):`), the L-13 rails home + `contexts.ts` manifest.
**Scope fence:** DONE — the reconciliation program (T15) + L-13 base rails (`tests/architecture/` home, `context-boundary`, `tx-discipline`). OUT — the quota-side of the boundary exception (quota spec co-lands). This Task PORTS the MANIFEST + five checks and ADDS the billing↔quota exception; it does not redesign the L-13 rails.
**Gate:** `cd packages/api/typescript && bun test tests/architecture/reconciliation-coverage.test.ts tests/architecture/context-boundary.test.ts tests/architecture/tx-discipline.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T16.1 — Write the manifest + five checks

Port `reconciliation-coverage.test.ts` verbatim (adapting paths): the MANIFEST
(every reconcile job + its family/alert-prefix) plus the five checks — (a) every
`*ReconcileJob.ts`/`*Reconciler.ts` under `billing/` is declared; (b) every literal
`RECONCILE_STALE_ALERT` claim-key prefix belongs to a declared entry; (c) each
manifest job class is a registered sibling in `billing/index.ts`; (d)
`family:'detect'` jobs contain no `.save(` / `CreditNoteService` / `new *Event(` /
dispute writes; (e) no `console.error(` in any manifest job — all alerts route
through the single `OperatorAlert` seam (AC10/AC11/AC12).

### Step T16.2 — Add the billing↔quota boundary exception

Modify `context-boundary.test.ts`: add the single `CONTEXT_IMPORT_EXCEPTIONS`
entry declaring the bidirectional billing↔quota coupling (billing imports
`@quota/*`; quota's `DrizzleQuotaEntitlement` reads billing's `PlanRegistry` +
`SubscriptionAccessDeriver`; quota's `RequestDowngrade` drives billing's
`ChangePlan`). Any OTHER cross-context import fails (AC3). Ensure `tx-discipline`
scans `billing/` (AC13 — no gateway call inside a tx anywhere in `billing/`).

### Step T16.3 — Verify the rails catch violations

Run the Gate. Then a negative check: temporarily add a `*ReconcileJob.ts` outside
the manifest (or a `RECONCILE_STALE_ALERT` key with an undeclared prefix) and
confirm `reconciliation-coverage.test.ts` FAILS; revert.

### Step T16.4 — Commit

```bash
git add packages/api/typescript/tests/architecture/
git commit -m "test(billing): reconciliation-coverage rail + billing↔quota boundary exception (Task T16)"
```

---

## Task T17: BILLING.md workflow-doc + full-suite green

**Files to write:**
- Create: `docs/BILLING.md`
- Modify: `packages/api/typescript/src/billing/registry.ts` — final `mock`/`integration`/`real` bindings for every service/repo/provider authored T3–T15

**Files to read:**
- pin `f04e8a0f:docs/BILLING.md`
- `packages/api/typescript/src/tenancy/registry.ts` (three-environment binding idiom)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /bounded-context
**Depends on:** T13, T16
**Consumes (frozen):** the full billing surface (T1–T16) — every aggregate, deriver, service, provider, job, event, handler, and the reconciliation contract; the `contexts.ts` manifest entry for `billing` (T2).
**Scope fence:** DONE — all behavior + rails. OUT — the React billing screens; the Kiwify-placeholder retirement (downstream reconcile R-1/R-2). Generalize every clinic term; reference-adapter platform set only (STRIPE/SANDBOX).
**Gate:** `bun tsc && bun lint && bun run test`

### Step T17.1 — Port + generalize BILLING.md

Port `docs/BILLING.md` in the medscall workflow-doc format (context map, aggregate
state machines, W1–W11 workflows, the reconciliation contract 8-principle
doctrine verbatim, the idempotency map, the money rules, known traps — AC17).
Scrub all clinic vocabulary; trim the platform set to STRIPE + SANDBOX with a
documented product-plug extension point.

### Step T17.2 — Finalize the context registry bindings

Modify `billing/registry.ts` so every service/repo/provider resolves in all three
environments (`mock`/`integration`/`real`), mirroring `tenancy/registry.ts`.
Confirm `PaymentProviderFactory` binds STRIPE + SANDBOX; the Sandbox provider is
`BILLING_SANDBOX`-fenced and rejected in prod by `assertRequiredSecrets`.

### Step T17.3 — Full-suite green

```bash
bun tsc && bun lint && bun run test
```
Expected: 0 errors; all billing unit/repository/use-case/flow tests + the three
architecture rails pass.

### Step T17.4 — Commit

```bash
git add docs/BILLING.md packages/api/typescript/src/billing/registry.ts
git commit -m "docs(billing): BILLING.md workflow-doc + final registry bindings (Task T17)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean across all workspaces
- [ ] `bun lint` — lint clean
- [ ] `bun run test` — all TS tests pass (unit + repository + use case + handler + flow)
- [ ] `cd packages/api/typescript && bun test tests/architecture/` — `reconciliation-coverage`, `context-boundary` (single billing↔quota exception), `tx-discipline`, `probe-discipline` all green
- [ ] `bun sdk` end-to-end — openapi.json + `packages/client/dist/**` carry every billing + BFF endpoint
- [ ] AC mapping (every spec AC → ≥1 test path):
  - AC1 → `packages/api/typescript/src/billing/entities/Subscription.test.ts` (context registered + tsc clean) + `bun tsc`
  - AC2 → `packages/contracts/db/schema/billing.ts` (extended `pgSchema('billing')`, additive `billing_*`, placeholder untouched) — verified by the T1 migration + `bun tsc`
  - AC3 → `packages/api/typescript/tests/architecture/context-boundary.test.ts:"exactly one CONTEXT_IMPORT_EXCEPTIONS entry (billing↔quota)"`
  - AC4 → `packages/api/typescript/tests/flows/billing-settlement-exactly-once.flow.test.ts:"a SUCCEEDED charge blocks markPastDue / dunning / cancel / upgrade-revert"` + `packages/api/typescript/tests/flows/billing-dunning-journey.flow.test.ts`
  - AC5 → `packages/api/typescript/src/billing/entities/Charge.test.ts:"absorbing terminal states — nothing returns to listStalePending"`
  - AC6 → `packages/api/typescript/src/billing/services/InvoiceStatusDeriver.test.ts:"fixed derivation order"` + `packages/api/typescript/src/ui/usecases/billing/GetSubscription.test.ts:"access from paidThrough + isCanceledEffective"`
  - AC7 → `packages/api/typescript/tests/flows/billing-settlement-exactly-once.flow.test.ts:"INVOICE_SETTLED dedups card × Pix × engine × checkout; dup-refund exactly once"`
  - AC8 → `packages/api/typescript/tests/flows/billing-window-reconcile.flow.test.ts:"reconciler alerts on aged PENDING, never flips it"`
  - AC9 → `packages/api/typescript/src/billing/usecases/RequestRefund.test.ts:"retried RequestRefund uses refund:{invoiceId} and never double-refunds"`
  - AC10 → `packages/api/typescript/tests/architecture/reconciliation-coverage.test.ts:"all five checks + undeclared job/prefix fails"`
  - AC11 → `packages/api/typescript/tests/architecture/reconciliation-coverage.test.ts:"detect jobs: zero .save/CreditNoteService/new *Event"` + `packages/api/typescript/tests/flows/billing-refund-drift-detect.flow.test.ts:"ledger snapshot unchanged"`
  - AC12 → `packages/api/typescript/tests/architecture/reconciliation-coverage.test.ts:"no console.error in any manifest job; OperatorAlert structured fields after won claim"`
  - AC13 → `packages/api/typescript/tests/architecture/tx-discipline.test.ts:"no gateway call inside a transaction in billing/"`
  - AC14 → `packages/api/typescript/src/billing/usecases/HandleBillingWebhook.test.ts:"every billing IdempotencyScope claimed on shared.idempotency_keys"`
  - AC15 → `packages/api/typescript/tests/flows/billing-dunning-journey.flow.test.ts:"Sandbox drives subscribe → renew → dunning; no Brazilian gateway code ships"` + `packages/api/typescript/src/billing/services/PaymentProvider/PaymentProviderFactory.test.ts:"Stripe full capability set"`
  - AC16 → (jointly with the quota spec) quota's `DrizzleQuotaEntitlement.test.ts` reads billing `PlanRegistry` + `SubscriptionAccessDeriver`; `SubscriptionChangedEvent { ownerId }` fires in the same tx — asserted in `packages/api/typescript/src/billing/usecases/ChangePlan.test.ts:"emits SubscriptionChangedEvent in the access-change tx"`
  - AC17 → `docs/BILLING.md` (manual review — medscall workflow-doc format, no clinic vocabulary, reference-adapter platform set)

## Notes

- **External dependencies gate the build order:** L-1 (`IdempotencyGuard` +
  `IdempotencyScope`) must exist before T8/T9/T11/T14/T15; L-0.5
  (`PostgresCommandQueue`) before T15; L-13 (`tests/architecture/` home +
  `context-boundary`/`tx-discipline` base rails) before T16; the coupled quota
  spec co-lands for T16's boundary exception + AC16. Confirm each with
  `bun scripts/graph/cli/index.ts file <path>` before starting the dependent Task.
- **QuotaKey is a product plug** shipped as a minimal shared placeholder by the
  quota half; billing code stays `Record<QuotaKey, …>` and never names a specific
  key. If the placeholder is absent at T1, stub `packages/api/typescript/src/shared/enums/QuotaKey.ts`
  with a documented placeholder set (owned by the quota spec — do not expand here).
- **Env vars:** `STRIPE_*` (reference adapter secrets, real only),
  `BILLING_SANDBOX=true` (Sandbox provider; rejected in prod by
  `assertRequiredSecrets`, triple-fenced), `COMMAND_QUEUE_DRIVER=postgres`
  (transactional per-object alarms; BullMQ default falls back to the sweep
  backstop). Add secret guards to the boot `EnvSchema` superRefine.
- **Faithful-port discipline:** read every artifact from `medscall@f04e8a0f`
  HEAD source (never migration numbers — squashed post-`4729cb44`), preserve the
  state machines / idempotency map / reconciliation contract / mechanical rails
  verbatim, and change ONLY layout (`packages/api/src` → `packages/api/typescript/src`,
  core → `packages/api/typescript/core`) + brand (`BillingProfile.name`
  generalization; STRIPE/SANDBOX-only platform enums; `@berzerk/*` specifiers).
- **Kiwify placeholder stays:** the `subscriptions`/`subscription_events` tables
  (read by tenancy's `SubscriptionQueryService`) are untouched; retiring them +
  migrating tenancy onto `billing_subscriptions` is downstream reconcile R-1/R-2,
  out of scope.
