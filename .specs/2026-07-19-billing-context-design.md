# Billing context design — generic Tier-2, extracted from medscall — spec

> **Date:** 2026-07-19 · **Status:** Draft
> **Program item:** L-10 (billing half) of `.plans/2026-07-11-ecosystem-sync-up.md` →
> "Delta review — REESCRITO 2026-07-18" → "Fronteira L-10 REDEFINIDA (billing↔quota)".
> **Extraction pin:** `medscall@f04e8a0f` (merge of PR #85 `feat/billing-idempotency`; working
> tree clean; 223 commits since `d9fef8bc`). Migrations were squashed after `4729cb44` — **extract
> every table shape from the pin's HEAD source, never by migration number.**
> **Source of truth read for this spec:** medscall `docs/BILLING.md` (the workflow-doc) +
> `packages/api/src/billing/**` + `packages/api/src/shared/db/drizzle/schema/billing.ts` +
> `packages/api/src/shared/enums/{IdempotencyScope,QuotaKey}.ts`.
> **Coupled sibling spec (hard dependency):** `2026-07-XX-quota-context-design.md` (the quota half).
> Per the Delta review, **billing is not portable without quota** — the two specs are born as a
> **coupled pair** with a declared bidirectional import exception. This document specs the *billing*
> half only and names the quota-owned pieces at the seam; it does not design quota internals.
> **Depends on (must land first):**
> - **L-0.5** — the merged `CommandQueue` port (`PostgresCommandQueue` driver: transactional
>   delayed/repeatable scheduling on `scheduled_commands`). Billing's per-object reconcile alarms
>   (W4/W11) enqueue/cancel *inside the caller's tx* only under this driver.
> - **L-1** — the `IdempotencyGuard` (`claim`/`release` primitive + `IdempotencyScope` enum, built on
>   the dormant `shared.idempotency_keys` table). Every money transition in this context is claim-gated.
> **Faithful-port rule:** this is a **port**, adapting layout + brand, **never a re-implementation**.
> - Layout: medscall `packages/api/src/<x>` → template `packages/api/typescript/src/<x>`; medscall
>   core → template `packages/api/typescript/core`; contracts stay in `packages/contracts`.
> - Brand: medscall is clinic-domain (`clinic`/`patient`/`doctor`). This context is already
>   ownerId-scoped and domain-neutral; the only brand leak is `BillingProfile.name = "clinic name for
>   CLINIC tenants"` → generalize to the generic owner display name (see Decision 12).

---

## Context

Billing is medscall's monetization bounded context (`packages/api/src/billing`, ~180 source files
across entities/objects/usecases/controllers/services/events/handlers/jobs/repositories). It is
**native (Phase D)**: there is no external subscription engine. The context owns the plan catalog
(code), the per-owner subscription record, the vaulted-card wallet, and an **append-only money
ledger** (invoices, charge attempts, credit notes, disputes). Settlement is always
**webhook-driven** from payment gateways, with a reconciliation program (four layers) closing every
window where a webhook is delayed, dropped, or never sent.

**Four principles explain the whole context** (from `docs/BILLING.md` → "Os 4 princípios"):

1. **Derive, don't flip.** Invoice status and subscription access are **derived at read time** from
   immutable ledger facts (charge `SUCCEEDED`, non-reversed credit notes, period dates) — never read
   from a stored status column. Status columns survive only as *hints* (the renewal sweep uses them);
   no load-bearing read trusts them. Codified by `InvoiceStatusDeriver` + `SubscriptionAccessDeriver`.
2. **Append-only ledger.** `billing_invoices` is write-once (PK conflict = no-op); `billing_charges`
   only transitions into absorbing terminal states; `billing_credit_notes` only gains rows (its one
   mutation is `reverse()`). A refund never "un-succeeds" a charge — it becomes a credit note.
3. **Every money transition is claim-gated.** The `IdempotencyGuard` (claim inside the tx) turns the
   at-least-once of outbox/webhooks into exactly-once *per effect*.
4. **A gateway call never runs inside a transaction.** The pattern is always *claim-before → call
   outside the tx → persist after* (with claim release on throw), plus a gateway idemKey so a retry
   returns the same result. Mechanically enforced by `tx-discipline.test.ts`.

**Template v1.9 today has no billing context in `src`.** A subscription lives ad-hoc inside
`tenancy/Store` (`ChangeStoreSubscription`). A **placeholder** billing pgSchema already exists at
`packages/contracts/db/schema/billing.ts` — the OLD external-engine (Kiwify-webhook) model:
`billing.subscriptions` (id-PK, per `userId`, `platform ∈ {KIWIFY|OTHER}`) + `billing.subscription_events`
(append-only webhook log). It is read only by tenancy's `SubscriptionQueryService`. The dormant
`shared.idempotency_keys` table exists (L-1 builds on it) and the outbox `source` column exists
(both are do-not-re-port traps already satisfied in v1.9). The `Money`/`SignedMoney`/`Metric`/`Tally`
value-object family already exists in shared (another do-not-re-port trap).

L-10 is the biggest lift of the Ecosystem Sync-Up program and a **COMMITTED GO** (user, 2026-07-11):
ledger + derivers + engine + webhook-ingest skeleton; the `PaymentProvider`/quota ports; PlanRegistry
+ QuotaKey as product plugs; keep 2–3 reference adapters (Stripe + sandbox).

---

## Problem

The template ships no reusable monetization context. A product built on the template that needs paid
plans has nowhere to put subscriptions, invoices, charges, dunning, refunds, or webhook ingest — it
would re-invent a payment ledger per product, re-discovering the same hard invariants (loop-freedom,
never-dun-a-payer, exactly-once settlement across racing webhooks, reconciliation of dropped events)
that medscall already paid for in blood across dozens of adversarial-review cycles.

Re-implementing from scratch is exactly how the drift this whole program heals was born (see the plan
header: "half-ports are how this drift happened"). The battle-tested medscall context must be
**ported faithfully** — its state machines, its idempotency map, its reconciliation contract, its
mechanical rails — and **generalized** at the seams (plans, quota keys, gateway set, tenant vocabulary)
so any template-based product plugs its own catalog in without touching the money machinery.

The complication that makes this a *coupled-pair* extraction, not a lone port: by explicit medscall
decision (spec `2026-07-06 §Amendments`, commits `a3a2766a`/`8cd69fef`) the quota-override ledger,
its read-port, and the `ApplyQuotaOverride` vertical **migrated billing → quota**, and the
billing↔quota coupling is now **bidirectional and accepted** — the only entry in the architecture
rail's `CONTEXT_IMPORT_EXCEPTIONS`. Billing imports `@quota/*`; quota's `DrizzleQuotaEntitlement`
reads billing's `PlanRegistry` + `SubscriptionAccessDeriver`; quota's `RequestDowngrade` drives
billing's `ChangePlan`. Extracting billing in isolation would either break the boundary rail or
silently drop the coupling.

---

## Goal

A generic `billing` bounded context under `packages/api/typescript/src/billing`, extending the
existing `packages/contracts/db/schema/billing.ts` pgSchema (never recreating it), that:

- Owns the native Phase-D money ledger (subscription, invoice, charge, credit note, dispute,
  payment-method wallet, checkout session, billing profile) with access + invoice status **derived**,
  not stored.
- Ships the full **write-side saga** (charge → settle → reconcile), **dunning** (classify → retry →
  cancel), **refund/dispute** handling, and the **four-layer reconciliation program** (per-object
  alarm, window sweep, checkout accelerator, detect-and-alert drift jobs) behind the mechanical
  reconciliation-contract rail.
- Exposes a generic `PaymentProvider` port (capabilities + reconcile capabilities) and ships **Stripe
  (full-featured reference) + Sandbox (choreography-real dev provider)** as the only bundled adapters;
  every Brazilian gateway (Pagar.me/Asaas/MercadoPago/PagBank) and the platform-specific enum members
  are **product plugs**, not part of the generic template.
- Treats `PlanRegistry`, `QuotaKey`, and the concrete plan list as **product plugs** (typed seams
  with a generic default), so a product swaps its catalog without editing money code.
- Is coupled to the quota context through exactly one declared bidirectional import exception, with
  `QuotaOverride`/`QuotaEntitlement`/`ApplyQuotaOverride` owned by quota.
- Passes the ported mechanical rails: `tx-discipline`, `reconciliation-coverage`, `context-boundary`
  (with the single billing↔quota exception), plus `tsc`/`lint`/`test`.
- Carries a `docs/BILLING.md` workflow-doc in the template, in the same format as the medscall source.

---

## Decisions

> Anti-invention rule: every decision below is grounded in a fact read from `medscall@f04e8a0f`
> (source path or `docs/BILLING.md` section cited inline) or in the Delta review's L-10 redefinition.
> Items flagged **[OPEN]** are genuine design questions for the `/brainstorm` grill before `/plan`.

### D1 — Faithful port at pin `f04e8a0f`; extract shapes from HEAD source
Port every artifact from the pin's HEAD source tree, not from migrations (squashed post-`4729cb44`)
and not from the lean placeholder in template contracts. The entity shapes come from
`billing/entities/*`, the table shapes from `shared/db/drizzle/schema/billing.ts`, the enum values
from `billing/enums/*`, the idempotency scopes from `shared/enums/IdempotencyScope.ts`.

### D2 — Layout + brand adaptation
`packages/api/src/billing` → `packages/api/typescript/src/billing`; `@billing/*`, `@shared/*` path
aliases map to the template's TS package. Core-framework pieces (`BoundedContext`, `BaseError`,
`BaseEntity`, `BaseValueObject`, `IdempotencyGuard`, `CommandQueue`, `LoggingService`) resolve from
`packages/api/typescript/core`. Brand: the context is already ownerId-scoped (Decision D3 of the
ownerId-scoping convention — new contexts use `ownerId`, not nutrition's `memberId` divergence). The
only clinic leak to scrub is `BillingProfile` doc-copy (Decision 12).

### D3 — Schema: **extend** `pgSchema('billing')`, add the native ledger tables additively
Reuse the existing `packages/contracts/db/schema/billing.ts` file and its `billingSchema =
pgSchema('billing')` object — **never a second billing schema** (the trap). The native tables from
`medscall@f04e8a0f` are all `billing_`-prefixed (`billing_subscriptions`, `billing_invoices`,
`billing_charges`, `billing_credit_notes`, `billing_payment_methods`, `billing_disputes`,
`billing_checkout_sessions`, `billing_profiles`, `billing_invoice_sequences`, `billing_usage_rollups`),
so they **do not collide** by table name with the placeholder `subscriptions`/`subscription_events`
(which stay `billing.subscriptions`/`billing.subscription_events`). Decision: **add the native
`billing_*` tables to the same file/schema**; leave the Kiwify placeholder tables untouched (still
read by tenancy's `SubscriptionQueryService`). Enum-valued columns use `text().$type<Enum>()` (never
`pgEnum`) — the repo-wide convention. Full table inventory in Appendix A.
- **[OPEN]** The placeholder `subscriptions`/`subscription_events` (external-engine model) and the
  native `billing_subscriptions` (ownerId-PK, Phase-D) model the *same concept two ways*. This
  extraction leaves both to avoid a tenancy break; **retiring the placeholder and migrating tenancy
  onto the native subscription is a downstream reconcile (R-1/R-2), out of scope here.** Grill:
  confirm we want both to coexist during the transition, or whether the placeholder should be
  deleted in this spec with tenancy adapted in the same PR.

### D4 — billing↔quota is a coupled pair with one declared bidirectional import exception
The extraction inherits medscall's post-`a3a2766a`/`8cd69fef` ownership split:
- **Quota-owned (specced in the sibling quota spec, NOT here):** `QuotaOverride` (append-only ledger,
  `UNIQUE(idem_key)`), `QuotaOverrideRepository`, `QuotaEntitlement` (read-port), the `ApplyQuotaOverride`
  vertical (route `/quota/overrides`; `X-Operator-Key` is the *only* gate — the subscription-existence
  guard was removed), the `quota_overrides` table in the quota schema, and the quota kernel
  (gate + ports + governors, `QuotaKey`).
- **Billing-owned (this spec):** `PlanRegistry`, `SubscriptionAccessDeriver`, `ChangePlan`, and the
  emission of `SubscriptionChangedEvent { ownerId }`.
- **The declared coupling** (the single `CONTEXT_IMPORT_EXCEPTIONS` entry, ported into L-13's
  `context-boundary` rail): billing imports `@quota/*`; quota's `DrizzleQuotaEntitlement` reads
  billing's `PlanRegistry` + `SubscriptionAccessDeriver`; quota's `RequestDowngrade` drives billing's
  `ChangePlan`. Both specs must land together; neither is independently mergeable.

### D5 — Reference adapters only: Stripe (full) + Sandbox (choreography-real)
Per L-10's committed scope ("keep 2–3 reference adapters (Stripe + sandbox)"), the generic template
ships the `PaymentProvider` port and exactly two implementations:
- **Stripe** — the full-capability reference (`hostedCardCheckout` + `cardVaulting` + `pix:false`;
  implements every reconcile capability: `getChargeStatus`, `getRefundStatus`, `getChargebackStatus`
  via `disputes.list`, `getCheckoutSessionStatus`). It is the one adapter that exercises every code
  path (vault, off-session MIT, window replay via `/v1/events`, identity-regime chargeback).
- **Sandbox** (`SandboxPaymentProvider`) — fake money, real choreography: auto-POSTs
  gateway-shaped webhooks back into the pipeline; magic card `…0002` = synchronous decline. Bound by
  `BILLING_SANDBOX=true` (rejected in production by `assertRequiredSecrets`, triple-fenced).
The Brazilian gateways (Pagar.me/Asaas/MercadoPago/PagBank) and the DECOMMISSIONED members
(Getnet/InfinitePay/Rede) are **NOT ported** — they are product plugs. `BillingPlatform` /
`BillingWebhookSource` ship trimmed to the reference set plus a documented extension point.
- **[OPEN]** Do we ship one *checkout-only* reference (no vault) to prove the capability-tier
  degradation path (`NO_PAYMENT_METHOD` → dunning), or is the Sandbox flag enough to exercise it?
  Grill: a mock checkout-only provider in tests may cover the tier without a third shipped adapter.

### D6 — Idempotency on `shared.idempotency_keys` via `IdempotencyGuard`; no new dedup table
Every exactly-once effect claims through the L-1 `IdempotencyGuard` on the shared table — **never a
billing-local dedup table** (trap). `IdempotencyScope` (the single shared registry, SCREAMING_SNAKE)
gains the billing scopes. Reference-adapter-trimmed set (Appendix C is the full map):
`WEBHOOK_STRIPE` (+ a generic `WEBHOOK_SANDBOX`; product gateways add their own member),
`SUBSCRIPTION_PER_OWNER`, `INVOICE_CHARGE`, `INVOICE_SETTLED`, `INVOICE_FAILED`, `INVOICE_EVENT`,
`INVOICE_DUNNING(+_STARTED/_ATTEMPT/_SUCCEEDED/_FAILED)`, `CHECKOUT_VAULT`, `RECONCILE_STALE_ALERT`,
`CHARGE_SETTLER_ALERT`, `REFUND_EXPECTATION`, and (owned by quota, referenced here) `QUOTA_OVERRIDE`.
Claim ordering is load-bearing both ways: validate **before** claim when a failure would burn the
claim (`DunningLifecycle`, dispute-won); claim **before** when the effect cannot duplicate. Sanctioned
handler idempotency strategies (cc-bp-23 → template cc-bp-25 per T-14): explicit claim; delegation to
a claiming service (`ChargeSettler`); convergent write (quota) — the last two require a comment naming
the mechanism.

### D7 — CommandQueue via L-0.5 `PostgresCommandQueue` for transactional per-object alarms
The per-object reconcile alarms (W4 `reconcile:{chargeId}`, W11 `reconcile-checkout:{sessionRef}`)
enqueue in the caller's tx and cancel in the settlement tx — the transactional enqueue/cancel
guarantee exists **only** under `COMMAND_QUEUE_DRIVER=postgres` (`PostgresCommandQueue`: INSERT in the
caller tx, lease + `SKIP LOCKED`, backoff/dead-letter). Under BullMQ (default) the enqueue is
best-effort and **the periodic sweep job is the correcting backstop**. Both drivers are exercised.

### D8 — Reconciliation-contract-as-code (C3): port the manifest rail + the doctrine + the seams
Port `docs/BILLING.md` → "O contrato de reconciliação" (the 8-principle doctrine) verbatim into the
template's BILLING.md, and port its mechanical half:
`packages/api/tests/architecture/reconciliation-coverage.test.ts` — the MANIFEST + five checks
(a: every `*ReconcileJob.ts`/`*Reconciler.ts` under `billing/` is declared; b: every literal
`RECONCILE_STALE_ALERT` claim-key prefix belongs to a declared entry; c: each manifest job class is a
registered sibling in `billing/index.ts`; d: `family:'detect'` jobs contain no `.save(` /
`CreditNoteService` / `new *Event(` / dispute writes; e: no `console.error(` in any manifest job — all
operator alerts route through the single `OperatorAlert` seam). Port the supporting seams:
- **`GatewayEventSource`** (per-platform reconciliation source: window vs probe via
  `requiresOpenInvoices`; replays vendor-shaped payloads through the *real* platform mapper via a
  synthetic `Request`; default `{listed:0, events:[]}` — never a throw for an unconfigured platform).
- **`OperatorAlert`** seam (`kind`/`alertKey`/`runbook` + flat context; delegates to `LoggingService`
  — `OtlpLoggingService` in prod → Loki, `MockLoggingService` in test — structured fields, never an
  interpolated string; every `emit()` follows a won `RECONCILE_STALE_ALERT` claim → exactly-once).
- **`TwoTickDriftAlert`** (shared two-tick persistence for both detect jobs; optional `pendingBucket`
  suffix for the monthly-bucket chargeback case).
- **Capability-default**: every poll capability (`getRefundStatus`/`getChargebackStatus`/
  `getCheckoutSessionStatus`/`getChargeStatus`) throws `PROVIDER_CAPABILITY_UNSUPPORTED` on the base
  `PaymentProvider` — a new platform is born without the capability until it overrides explicitly.

### D9 — Dispute aggregate (OPEN→WON|LOST) + the two-regime chargeback detector
Port the `Dispute` aggregate (`billing/entities/Dispute.ts`) that owns the chargeback *process*; the
`CreditNote` (reason `CHARGEBACK`) keeps owning the *money*. Natural key `(gatewayDisputeRef,
platform)`, unique; ref = the gateway's real dispute id where it exists (Stripe `dp_…`), else the
synthetic `evt:{externalId}` aligned to the `disputed:{externalId}` claim so a redelivery never
creates a second Dispute. `ExternalChargeDisputedHandler` creates it via `insertIfNew`
(`onConflictDoNothing`) in the SAME tx as the CHARGEBACK CN. WON reverses the CN found by
`(invoice, gatewayRef)` (`findActiveByGatewayRef`), best-effort, after the money reversal; LOST only
transitions the process (CN untouched). Both terminals are absorbing (`INVALID_DISPUTE_TRANSITION`
from the entity; handlers guard the call site to never throw inside the money tx). The
`ChargebackReconcileJob` runs two regimes off `ChargebackStatus.disputeRefs`: **identity** (present →
set-difference vs the ledger's known refs, per-ref claims, no monthly bucket — Stripe today) and
**boolean** (absent → per-invoice claim with monthly `pendingBucket`, the sticky-boolean limitation).
Only Stripe emits identity today in the reference set; the boolean regime + its known limitation are
ported as doctrine for product gateways.

### D10 — Dunning matured (classify → retry → cancel), phase-derived from the ledger
Port `DunningLifecycle` (phase = `COUNT(FAILED)` on the invoice, derived — never stored),
`DunningRetryPolicy` (offsets 2,4,7 days from the first failure, anchored to midnight in the configured
tz; `DeclineClassifier`: a hard decline = no retry), and the per-phase events
(`DunningStarted/AttemptFailed/Succeeded/Failed`) each with its own claim, plus `DunningNotifier`
emails in separate handlers (mail never blocks the state machine). The intentional off-by-one
(`candidate.attemptNo = COUNT(FAILED)` is already the next attempt; the policy wants the 0-based index
of the *last* failure → the `- 1`) is ported with its "do not fix" comment.

### D11 — Reverts doctrine: idemKey per-invoice, never by amount
Port the reverts doctrine (`a5361ba5`, `944c0e85`): `RequestRefund`'s gateway idemKey is
`refund:{invoiceId}` — **per invoice, never keyed by amount**, because a pro-rata amount shrinks with
the clock, so an amount-keyed retry would mint *different* keys and double-refund. `RefundInvoice`
(operator) keys `cancel:{txId}:{amount}` (two distinct partials are distinct operations). Neither use
case writes a credit note — the ledger only records a gateway-confirmed fact (webhook, or webhook
re-delivered after the drift alert). `dup-refund:{txId}` handles the exactly-once duplicate-capture
refund at settle time.

### D12 — Value objects: reuse shared `Money`; port `InvoiceLine`/`PaymentInstrument`/`Mandate`
`MonetaryAmount`/`Money` reuse the shared VO family already in the template (do-not-re-port trap) —
`PlanRegistry`, `Charge.amountCents`, etc. reference `@shared/objects`. Port into `billing/objects`:
`InvoiceLine` (Zod object: `kind ∈ {SUBSCRIPTION,PRORATION,OVERAGE,ADJUSTMENT}`, `meter?: QuotaKey`,
coerced period dates), `PaymentInstrument` (discriminated union on `type`: CARD leaf carries
brand/last4/exp; wallet leaves carry network/last4), `Mandate` (`BaseValueObject`: acceptedAt +
audit ip/userAgent/consentVersion). Generalize `BillingProfile.name`: drop the "clinic name for
CLINIC tenants" copy — `name` is the generic owner display name captured at onboarding; the
editable-copy policy (issued invoices never change retroactively) is preserved.

### D13 — Subscription: ownerId-PK aggregate, optimistic-lock, access DERIVED
Port `billing_subscriptions` keyed by **`owner_id`** (natural identity — one subscription per owner,
forever; re-subscribe mutates the same row via `resubscribe()`, preserving the lock version). The
stored `status` is a hint (used by `listRenewalDue` + the re-subscribe guard); real access comes from
`SubscriptionAccessDeriver.computeAccess` (the single `isCanceledEffective` predicate — **never
hand-copied**, it drifted once losing the trial arm). Every writer bumps `version` (both the
version-guarded find→save AND the targeted conditional updates activate/markPastDue/cancel/
finalizeCancellation/changePlan/setScheduledPlan) so a stale find→save 409s instead of clobbering.
`INCOMPLETE` (subscribed, never paid) grants no access; terminals (`CANCELED`,`INCOMPLETE_EXPIRED`)
are absorbing; reactivation goes through `CreateSubscription` (resubscribe in-place, clearing the
cancellation facts — the "R3 regression" the clock caused by respecting a stale `canceledAt`).

### D14 — Genericization edits (make the port a template, not a medscall copy)
- `PlanRegistry` FREE/STARTER/PRO (the medscall values already read as a generic default) ship as the
  **default plug**; the concrete plan list + prices are product-owned data, validated at boot.
- `QuotaKey` (medscall's `UNITS`/`COLLABORATORS`/`AGENT_MESSAGES`) is a **product plug** — the generic
  template ships a minimal placeholder set with a doc note; billing/quota code stays
  `Record<QuotaKey,…>` and never names a specific key (already the medscall discipline).
- `PersistenceProbe` (L-12, separate item) must drop the billing-specific `creditNoteRows` on
  extraction; `LedgerProbe` is superseded → not ported. Flagged here as a cross-item coordination
  note, not owned by this spec.
- Config env names keep the `BILLING_*` prefix; secret/credential envs (`STRIPE_*`) ship for the
  reference adapters only.

### D15 — Scope boundary (strip to the confirmed need)
**IN (this spec):** the eight aggregates; the four principles + derivers; the write-side saga
(`SubscriptionCharger`/`ChargeSettler`/`ChargeReconciler`); webhook ingest
(`HandleBillingWebhook`/verifier/mapper/`BillingEventIngest`); the ~18 use cases + controllers; the
domain/integration/external events; the internal handlers; dunning; refund/dispute; the seven jobs;
the four-layer reconciliation program + its mechanical rail; Stripe + Sandbox adapters; the
idempotency map; the BILLING.md workflow-doc.
**OUT / deferred / owned elsewhere:** the quota context (sibling spec); Brazilian gateway adapters
(product plugs); `ScaleBed`/`ScalePgDriver` + scale layer + flow-journey packages (Adotar-DEPOIS,
post-L-12); the React billing UI (the BFF `ui/usecases/billing` read side —
`GetSubscription`/`ListInvoices`/`GetUsage` — is IN as the app gate, but screens are out); retiring
the Kiwify placeholder + adapting tenancy (downstream reconcile R-1/R-2).
- Per the plan's scope-discipline rule, this spec already exceeds ~7 deliverables → it is
  **explicitly split** from the quota spec, and the Story-Points section proposes an internal wave
  split for `/plan` rather than one monolithic build.

---

## User stories

- **As an owner**, I subscribe to a paid plan and — if I have a card on file — I'm charged
  immediately; otherwise I'm redirected to a hosted checkout that both pays the first invoice and
  vaults my card.
- **As an owner**, I upgrade mid-period and pay only a prorated amount now; if the upgrade charge is
  declined, my plan reverts and the proration voids — I'm never dunned for a rejected upgrade.
- **As an owner**, I schedule a downgrade; my new (lower) limits apply only at the next renewal, not
  immediately.
- **As an owner**, when a renewal charge fails I keep access through a grace window while the system
  retries on a schedule, and I get emails per dunning phase; a hard decline stops the retries early.
- **As an owner**, I pay an overdue invoice at any time (retry, manual, or Pix) and access is restored
  from the paid invoice's period — never double-charged even if a webhook races the payment.
- **As an owner**, I request a refund and get the CDC-window full amount (or a pro-rata slice past the
  window); a retried request never double-refunds me.
- **As an operator**, I apply a quota override for an owner via `X-Operator-Key` (quota-owned vertical)
  even when they have no live subscription.
- **As the platform**, a gateway webhook settles the matching invoice exactly once across racing
  card/Pix/engine/checkout paths, and a dropped/delayed/never-sent webhook is recovered (or, when
  unrecoverable by poll, surfaced as exactly one operator alert) by the reconciliation program —
  never a silent stuck payment and never a duplicate ledger write.
- **As an operator**, when the gateway's refunded total or chargeback signal drifts from the ledger, I
  get exactly one structured alert with a runbook (re-deliver the webhook) — the detector never writes
  the ledger itself.

---

## Acceptance criteria

**Structure & boundary**
- AC1: `billing` context lives under `packages/api/typescript/src/billing`, registered via
  `BoundedContext.create({ name: CONTEXTS.billing, … })`, and `bun tsc` + `bun lint` are clean.
- AC2: `packages/contracts/db/schema/billing.ts` is **extended** (same `pgSchema('billing')` object,
  additive `billing_*` tables); no second billing schema is created; the placeholder
  `subscriptions`/`subscription_events` tables are untouched.
- AC3: the `context-boundary` rail (L-13) passes with **exactly one** `CONTEXT_IMPORT_EXCEPTIONS`
  entry — the declared billing↔quota bidirectional coupling; any other cross-context import fails.

**Money invariants (unit + flow tests port faithfully)**
- AC4: **Never dun a payer** — a `SUCCEEDED` charge on an invoice blocks markPastDue, placeholder
  FAILED, dunning retry, terminal cancel (re-checked *inside* the claim tx), and upgrade-revert.
- AC5: **Loop-freedom** — absorbing terminal charge states + the unconditional terminalization layer
  mean nothing returns to `listStalePending`/`listDunningCandidates`.
- AC6: **Derive-don't-flip** — `InvoiceStatusDeriver` evaluates in the fixed order
  (REFUNDED→PARTIALLY_REFUNDED→PAID→VOID→OVERDUE→PENDING); `SubscriptionAccessDeriver` computes access
  from paidThrough + the single `isCanceledEffective` predicate; no load-bearing read consults a
  status column.
- AC7: **Exactly-once settlement** — the `INVOICE_SETTLED:{invoiceId}` claim dedups card × Pix ×
  engine × checkout; the loser still marks SUCCEEDED (loop-freedom) and, on a distinct duplicate
  capture, refunds exactly once (`dup-refund:{txId}`).
- AC8: **Never auto-fail a PENDING** — the reconciler only alerts on an aged PENDING, never flips it.
- AC9: **Reverts** — a retried `RequestRefund` uses `refund:{invoiceId}` (per-invoice) and never
  double-refunds; a partial `RefundInvoice` uses `cancel:{txId}:{amount}`.

**Reconciliation contract (mechanical)**
- AC10: `reconciliation-coverage.test.ts` passes all five checks; adding a `*ReconcileJob.ts` outside
  the manifest, or a `RECONCILE_STALE_ALERT` key with an undeclared prefix, fails the build.
- AC11: every `family:'detect'` job (`RefundReconcileJob`, `ChargebackReconcileJob`) has zero entity
  `.save(`, zero `CreditNoteService`, zero event construction — statically (check d) and dynamically
  (`ledgerWrites()`/snapshot assertions in the flow tests).
- AC12: no `console.error(` in any manifest job; every operator alert routes through `OperatorAlert`
  → `LoggingService` with structured `alert`/`alertKey`/`runbook` fields, after a won claim.
- AC13: `tx-discipline.test.ts` passes — no gateway call inside a transaction anywhere in `billing/`.

**Idempotency map**
- AC14: every billing `IdempotencyScope` in Appendix C exists in the shared registry and is claimed on
  `shared.idempotency_keys` (no billing-local dedup table); the webhook ingest, the settlement paths,
  dunning, checkout vault, and the reconcile alerts each dedup as mapped.

**Adapters & sandbox**
- AC15: Stripe adapter implements the full capability + reconcile-capability set; the Sandbox provider
  (`BILLING_SANDBOX=true`, rejected in prod) auto-POSTs valid gateway-shaped webhooks and drives a full
  subscribe → renew → dunning journey in a flow test; no Brazilian gateway code ships.

**Coupling (jointly with the quota spec)**
- AC16: quota's `DrizzleQuotaEntitlement` reads billing's `PlanRegistry` + `SubscriptionAccessDeriver`;
  `RequestDowngrade` (quota) drives `ChangePlan` (billing); `SubscriptionChangedEvent { ownerId }`
  fires in the same tx as every access-relevant change and re-governs resources via the quota handler.

**Docs**
- AC17: `docs/BILLING.md` ships in the template in the medscall workflow-doc format (context map,
  aggregate state machines, W1–W11 workflows, the reconciliation contract, the idempotency map, the
  money rules, known traps), generalized (no clinic vocabulary; reference-adapter platform set).

---

## Story Points & proposed wave split for `/plan`

L-10 (billing half) is a **Large** item. Proposed internal breakdown (Fibonacci SP; the quota spec is
a separate SP budget). `/plan` should Phase-0-lock the contracts (enums + integration event + schema)
before the behavior slices, per the "modeling from another system" workflow.

| WP | Deliverable | SP | Phase / dependency |
|---|---|---|---|
| **B0** | **Contract Lock**: extend `billing.ts` pgSchema (all `billing_*` tables) + billing enums + `SubscriptionChangedEvent` integration event in contracts; regenerate bindings | 5 | Phase 0 — must freeze before any BC code; depends on nothing |
| **B1** | Aggregates + value objects: `Subscription`, `Charge`, `Invoice`, `CreditNote`, `PaymentMethod`, `Dispute`, `CheckoutSession`, `BillingProfile`; `InvoiceLine`/`PaymentInstrument`/`Mandate`; `PlanRegistry` plug | 8 | Phase 1 — after B0 |
| **B2** | Derivers + repositories: `InvoiceStatusDeriver`, `SubscriptionAccessDeriver`, all Drizzle repos (optimistic-lock save + atomic conditional updates) | 5 | Phase 1 — after B1 |
| **B3** | `PaymentProvider` port + capabilities + reconcile capabilities + **Stripe** + **Sandbox** adapters + verifiers/mappers | 8 | Phase 1 — after B0 (port), parallel-with B1/B2 |
| **B4** | Write-side saga + webhook ingest: `SubscriptionCharger`/`ChargeSettler`/`ChargeReconciler`, `HandleBillingWebhook`/`BillingEventIngest`, use cases (subscribe/change-plan/cancel/resume/pay/refund/wallet), controllers | 8 | Phase 1 — after B2/B3; depends on L-1 (IdempotencyGuard) |
| **B5** | Events + internal handlers + dunning (`DunningLifecycle`/`DunningRetryPolicy`/`DeclineClassifier`/`DunningNotifier` + phase events/emails) | 5 | Phase 1 — after B4 |
| **B6** | Reconciliation program: `GatewayEventSource`, `OperatorAlert`, `TwoTickDriftAlert`, seven jobs (clock/dunning-retry/pending-charge/checkout/window/refund-drift/chargeback-drift), reconcile use cases; depends on L-0.5 (PostgresCommandQueue) | 8 | Phase 1/2 — after B5; depends on L-0.5 |
| **B7** | Mechanical rails: `reconciliation-coverage.test.ts` (+ manifest), `tx-discipline`, `context-boundary` exception (L-13); BFF read side (`GetSubscription`/`ListInvoices`/`GetUsage`) | 5 | Phase 2 — after B6 |
| **B8** | `docs/BILLING.md` workflow-doc (generalized) + `bun sdk` end-to-end + full-suite green | 3 | Phase 2 — last |

**Total (billing half): ~55 SP** (Large, confirmed). Hard external deps: **L-0.5** (CommandQueue) and
**L-1** (IdempotencyGuard) before B4/B6; **quota spec** co-lands for B7's boundary exception + AC16.

---

## Appendix A — Native ledger tables (extend `pgSchema('billing')`)

Extracted from `medscall@f04e8a0f:packages/api/src/shared/db/drizzle/schema/billing.ts`. All
`billing_`-prefixed; all enum columns `text().$type<Enum>()`; cross-context ids are plain `text` (no FK).

- **`billing_subscriptions`** — PK `owner_id`; `engineSubscriptionId`, `planName`, `status`,
  `currentPeriodStart/End`, `trialEnd`, `canceledAt`, `cancelAtPeriodEnd`, `scheduledPlanName`,
  `version` (optimistic lock), `updatedAt`. Access DERIVED (Decision D13).
- **`billing_invoices`** — PK `invoice_id` (write-once ledger); `ownerId`, `amountCents`, `currency`,
  `ourNumber` (unique, gap-free), `planName`, `periodStart/End`, `voidedAt`, `lineItems` jsonb
  (`InvoiceLine[]`); **no status column** (migration 0023 dropped it — derived).
- **`billing_invoice_sequences`** — PK `prefix`; `nextNumber` bigint — gap-free `ourNumber` allocator.
- **`billing_charges`** — PK `id`; `ownerId`, `invoiceId`, `platform`, `method`, `amountCents`,
  `attemptNo`, `status ∈ ChargeStatus`, `gatewayTxId?`, `declineCode? ∈ DeclineReason`; `version`.
- **`billing_credit_notes`** — PK `id`; `ownerId`, `number` (unique), `invoiceId` (FK→invoices),
  `amountCents` (positive, credit semantics), `currency`, `reason ∈ CreditNoteReason`,
  `status ∈ CreditNoteStatus`, `gatewayRef?`, `finalizedAt?`, `version`.
- **`billing_payment_methods`** — PK `id`; single-table projection of the `PaymentInstrument` union;
  `ownerId`, `platform`, `type`, `pmRef`, `supportsOffSession`, `captureOrigin?`, `originGatewayTxId?`,
  per-leaf card/wallet columns, mandate columns (acceptedAt + audit ip/ua/consentVersion),
  `status ∈ PaymentMethodStatus`, `isDefault`. Partial unique index: exactly one DEFAULT among an
  owner's ACTIVE instruments.
- **`billing_disputes`** — PK `id`; natural key unique `(gatewayDisputeRef, platform)`; `ownerId`,
  `gatewayTxId`, `invoiceId` (indexed), `amountCents`, `status ∈ DisputeStatus`, `openedAt`,
  `closedAt?`, `version`.
- **`billing_checkout_sessions`** — PK `id`; `sessionRef` (unique), `ownerId`, `platform`,
  `intent ∈ CheckoutIntent`, `engineInvoiceId?`, `status ∈ CheckoutSessionStatus`, `mintedAt`,
  `expiresAt?`, `version`.
- **`billing_profiles`** — PK `owner_id`; `name` (generic owner display name — generalized from
  clinic-name), `email`, `document`, `language`, `version`.
- **`billing_usage_rollups`** — PK `id`; `ownerId`, `meter ∈ QuotaKey`, `periodStart/End`, `quantity`;
  unique `(owner_id, meter, period_start)`. (Metering seam; genericize the `QuotaKey` plug.)

## Appendix B — Enums (`billing/enums`)

`BillingPlatform` / `BillingWebhookSource` (**ship trimmed** to `STRIPE` + a `SANDBOX` reference set +
extension doc; medscall's PAGARME/ASAAS/MERCADOPAGO/PAGBANK + DECOMMISSIONED GETNET/INFINITEPAY/REDE
are product plugs), `SubscriptionStatus` {TRIALING, INCOMPLETE, ACTIVE, PAST_DUE, CANCELED,
INCOMPLETE_EXPIRED} (+ `TERMINAL_*`/`ACCESS_GRANTING_*` sets + `nextSubscriptionStatus`), `ChargeStatus`
{PENDING, SUCCEEDED, FAILED}, `InvoiceStatus` {PAID, OVERDUE, PENDING, REFUNDED, PARTIALLY_REFUNDED,
VOID}, `CreditNoteReason` {REFUND, CHARGEBACK, CORRECTION}, `CreditNoteStatus` {ISSUED, SETTLED,
REVERSED}, `DisputeStatus` {OPEN, WON, LOST}, `PaymentMethodStatus` {ACTIVE, EXPIRED, REMOVED},
`PaymentMethodType` {CARD, APPLE_PAY, GOOGLE_PAY, PIX, BOLETO}, `CheckoutSessionStatus` {PENDING,
COMPLETED, EXPIRED}, `CheckoutIntent` {setup, payment}, `DeclineReason` {INSUFFICIENT_FUNDS,
CARD_EXPIRED, AUTHENTICATION_REQUIRED, PROCESSING_ERROR, CARD_DECLINED}, `RefundBasis` {CDC_WINDOW,
PRO_RATA, NONE}, `RefundSource` {operator, policy}, `PlanName` {FREE, STARTER, PRO} (product plug).
Shared: `QuotaKey` (product plug), `IdempotencyScope`, `Currency`, `Language`.

## Appendix C — Idempotency claim map (`RECONCILE_STALE_ALERT` prefixes in **bold**)

| Scope | Key | Guarantees |
|---|---|---|
| `WEBHOOK_<SOURCE>` (reference: `_STRIPE`, `_SANDBOX`) | vendor `externalId` | 1 outbox event per delivered webhook (shared by ingest W3 + window sweep W10) |
| `INVOICE_CHARGE` | `{invoiceId}:{attemptNo}` | 1 gateway charge per attempt (RELEASED on provider/tx throw) |
| `INVOICE_SETTLED` | `{invoiceId}` | 1 settlement per invoice, cross-path |
| `INVOICE_FAILED` | `{invoiceId}` | 1 failure transition per invoice (RELEASED if nothing written) |
| `INVOICE_EVENT` | `event.id` or `verb:{externalId}` | redelivery + per-fact dedup (paid/failed/refund/dispute) |
| `INVOICE_DUNNING_STARTED/_ATTEMPT/_SUCCEEDED/_FAILED` | `{invoiceId}`(+`:n`) | 1 lifecycle event per phase |
| `INVOICE_DUNNING` | `phase:{invoiceId}` | 1 email per phase |
| `CHECKOUT_VAULT` | `sessionRef` | 1 card vault per checkout session |
| `RECONCILE_STALE_ALERT` | **`unpollable:`**`{chargeId}`, **`checkout:`**`{sessionRef}`, **`refund-drift:`**`{invoiceId}`, **`refund-unmonitored:`**`{invoiceId}`, **`chargeback-drift(-pending):`**`{invoiceId|disputeRef}` | 1 operator alert per stranded/aged/drift condition |
| `CHARGE_SETTLER_ALERT` | dup-refund context | 1 alert per failed dup-refund at settle time |
| `REFUND_EXPECTATION` | mirrors gateway idemKey | 1 in-flight expectation per refund op |
| `QUOTA_OVERRIDE` (quota-owned) | operator idempotencyKey | 1 override per grant (+ UNIQUE in store) |

Gateway idemKeys (retry returns same result, never charges twice): saga = `{invoiceId}:{attemptNo}`;
manual card = `{invoiceId}:{uuid}` (per-attempt); Pix = `pix:{invoiceId}`;
checkout = `checkout:{invoiceId}:{uuid}`; dup-refund = `dup-refund:{txId}`;
user refund = `refund:{invoiceId}` (per-invoice — D11); operator refund = `cancel:{txId}:{amount}`.

## Appendix D — Reconciliation program (four layers) & jobs

- **Layer 1 — per-object alarm (W4):** `ReconcilePendingChargesJob` + `ChargeReconciler` — a PENDING
  charge whose settlement webhook never arrives; `getChargeStatus` poll; settle / terminalize / alert.
  Transactional enqueue/cancel under `PostgresCommandQueue` (L-0.5), sweep backstop under BullMQ.
- **Layer 2 — window sweep (W10):** `WindowReconcileJob` + `GatewayEventSource` per platform (window
  vs probe); replays vendor-shaped payloads through the real mapper → the same External* events the
  webhook would; re-feeds `BillingEventIngest` → outbox → existing handlers (no new write path).
- **Layer 2b — checkout accelerator (W11):** `ReconcileCheckoutSessionsJob` + `CheckoutSessionReconciler`
  + `CheckoutSessionRecorder` — a dedicated per-session `CheckoutSession` object minted at checkout;
  Stripe resolves by poll; others alert at max-age (capability-default).
- **Layer 3 — detect-and-alert drift (W8):** `RefundReconcileJob` (ledger-derived enumeration
  `listWithSucceededChargeSince`, in-flight brake via `InvoiceRefundedEvent` expectation) and
  `ChargebackReconcileJob` (two regimes, identity/boolean) — **never write the ledger**; two-tick
  persistence; exactly-one operator alert with runbook.
- **Renewal (W6):** `BillingClockJob` — chunked period-close sweep → `ExternalInvoiceIssuedEvent`
  (deterministic id, re-tick = no-op via write-once + claim); dunning retry via `DunningRetryJob` (W5).

## Appendix E — Ports & seams (the generic surface)

- **`PaymentProvider`** (abstract): `platform`, `capabilities {hostedCardCheckout, cardVaulting, pix}`;
  `ensureCustomer`, `createCheckoutSession`, `chargeOffSession`, `chargeStoredOnSession`, `cancelCharge`,
  `createPix`; reconcile capabilities default-throwing `PROVIDER_CAPABILITY_UNSUPPORTED`:
  `getChargeStatus`, `getRefundStatus`, `getChargebackStatus` (`disputeRefs?`), `getCheckoutSessionStatus`.
  Result types: `ChargeResult` (`pending?` distinguishes settling-vs-settled), `RefundStatus`
  (cumulative total + canonical per-refund refs), `ChargebackStatus`, `CheckoutSessionStatusResult`.
- **`GatewayEventSource`** (abstract): `source`, `requiresOpenInvoices`, `collectMissedEvents`,
  `syntheticRequest` helper (reuse the real mapper; verifier does not run on our authenticated outbound).
- **`OperatorAlert`** seam → `LoggingService` (OTLP→Loki in prod, mock in test), structured fields.
- **Cross-context integration event:** `SubscriptionChangedEvent { ownerId }` (thin trigger) →
  quota's `GovernResourcesOnSubscriptionChangedHandler` → `ResourceLimitEnforcer.enforce(ownerId)`
  (convergent, lock/unlock, never delete — no claim needed).
