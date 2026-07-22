# Strip & reshape sales-order write-side fields + widen transaction kinds — Design Spec

**Date:** 2026-05-26
**Status:** Draft
**Bounded Context:** cross-context — `packages/contracts` (wire source of truth) + `packages/api/go` (sync write-side)
**Kind:** chore
**Story Points:** 5 — one service (Go sync) end-to-end + contract regen across 3 contract files, 3 entities, 1 storage snapshot, 2 normalizer functions, ~4 test files; no migration, no new live cross-service contract.

## Context

The Go sync service owns the canonical sales-order aggregate as write-authority (memory `canonical-aggregate-strategy`): the order, its nested `OrderLine[]`, `OrderTransaction[]`, and each transaction's `OrderTransactionFee[]` are constructed in `packages/api/go/internal/sync/entities/` (`order.go`, `order_line.go`, `order_transaction.go`, `order_transaction_fee.go`) and persisted as JSONB on the `orders` table (`packages/contracts/db/schema/sales.ts:72-73` — `lines` and `transactions` are `jsonb`; there are no per-field columns). The wire enums these entities validate against (`TransactionKind`, `DisputeStatus`, `OrderTransactionFeeType`) are defined in TypeSpec under `packages/contracts/wire/enums/*.tsp` and regenerated into `packages/contracts/generated/{go,typescript}/`.

The only live per-platform normalizer is Shopify: `packages/api/go/internal/sync/services/shopify/transaction_normalizer.go` (`mapTransactionKind`, line 92) maps Shopify's lowercase transaction kinds onto the wire catalog, and `order_normalizer.go` (`mapLineItem`, line 224) maps Shopify line items onto `OrderLineInput`. The storage snapshot at `packages/api/go/internal/sync/storage/order/snapshot.go` mirrors each entity into a `*JSON` struct for the JSONB column.

Disputes are currently modeled two ways at once: a `disputeStatus *wire.DisputeStatus` field on `OrderTransaction` (`order_transaction.go:27`) plus a dedicated `OrderTransactionDisputedEvent` wire event (`packages/contracts/wire/events/order-transaction-disputed.tsp`). No TypeScript code consumes that event, and `CHARGEBACK` exists as a third overlapping representation in `TransactionKind`.

On the read side, `packages/api/typescript/src/sales/usecases/GetOrderDetail.ts:18` returns `lineItems`/`transactions` as `z.array(z.unknown())` — raw JSONB passthrough, no typed schema. The client SDK has no typed `OrderLine`/`OrderTransaction`.

## Problem

1. **Transaction kinds are both redundant and too coarse.** `CAPTURE` and `SALE` represent the same canonical event (a successful charge); `CHARGEBACK` overlaps with the separate `disputeStatus` field; and there is no representation for partial charges/refunds or for the distinct dispute lifecycle stages.
2. **Disputes are modeled twice** — as a `disputeStatus` field *and* as a `CHARGEBACK` kind *and* via a dedicated `OrderTransactionDisputedEvent` — none of which the TS side reads. Two of the three are dead weight on the contract surface.
3. **`OrderLine` carries denormalized display fields** (`title`, `variantTitle`) and a duplicated tax field (`allocatedTax`, which the Shopify normalizer sets equal to `tax`) that don't belong on the lean canonical write-side aggregate; and it lacks a gross line subtotal.
4. **`OrderTransactionFee.rate`** is a derived/redundant value alongside `fixed` + `variable`.

## Goal

The canonical write-side aggregate carries exactly the fields the domain needs: a single dispute representation (transaction kinds), a charge/refund vocabulary that admits partials, lean line items without denormalized display strings, a gross `subtotalPrice` on each line, and fees described only by `fixed` + `variable`. The wire contract loses its dead dispute event and enum.

## Decisions

1. **`TransactionKind`** (`packages/contracts/wire/enums/transaction-kind.tsp`) becomes, in order: `AUTHORIZATION`, `CHARGE`, `PARTIAL_CHARGE`, `REFUND`, `PARTIAL_REFUND`, `VOID`, `DISPUTE_OPEN`, `DISPUTE_UNDER_REVIEW`, `DISPUTE_WON`, `DISPUTE_LOST`, `DISPUTE_ACCEPTED`. Removed: `CAPTURE`, `SALE`, `CHARGEBACK`. `CHARGE` subsumes `CAPTURE` + `SALE`; the `DISPUTE_*` family subsumes `CHARGEBACK` and the old `DisputeStatus` values (NONE has no kind — absence of a dispute kind is "no dispute").
2. **Delete** `packages/contracts/wire/enums/dispute-status.tsp` (the `DisputeStatus` enum) and `packages/contracts/wire/events/order-transaction-disputed.tsp` (`OrderTransactionDisputedEvent`) entirely, plus their entries in the wire enum/event barrels (`packages/contracts/wire/main.tsp` and any index). Disputes now ride `OrderTransactionRecordedEvent` as a `DISPUTE_*` kind. Update the `order-transaction-recorded.tsp` `@doc` that enumerates old kinds (`SALE/AUTHORIZATION/CAPTURE/REFUND/VOID/CHARGEBACK`).
3. **`OrderTransaction` entity** (`order_transaction.go`) loses `disputeStatus`: the struct field, the `OrderTransactionInput.DisputeStatus *string`, the `ErrOrderTxInvalidDisputeStatus` error, the `ParseDisputeStatus` parse block, and the `DisputeStatus()` accessor. Update the spec doc comment.
4. **`OrderLine` entity** (`order_line.go`) loses `title`, `variantTitle`, `allocatedTax` (fields, `OrderLineInput` members, accessors, the `ErrLineMissingTitle` error, and its required-guard) and gains **`subtotalPrice objects.MonetaryAmount`** (field, input, accessor), defined as `unitPrice × quantity` — gross, before discount and tax, such that `totalPrice = subtotalPrice − discount`. `subtotalPrice` is present-but-zero-allowed and not separately validated, consistent with how `tax`/`discount` are treated. Update the spec doc comment.
5. **`OrderTransactionFee` entity** (`order_transaction_fee.go`) loses `rate`: the struct field, `OrderTransactionFeeInput.Rate`, and the `Rate()` accessor. Update the spec doc comment.
6. **Shopify normalizer:** `mapTransactionKind` (`transaction_normalizer.go`) maps `CAPTURE` and `SALE` → `CHARGE` via an explicit `case`, and drops the `CHARGEBACK` case (`AUTHORIZATION`/`REFUND`/`VOID` unchanged). This is required because the function's `default` branch passes the upper-cased string straight to `ParseTransactionKind`, which would now reject `SALE`/`CAPTURE`. `PARTIAL_CHARGE`, `PARTIAL_REFUND`, and the `DISPUTE_*` kinds get **no Shopify mapping** in this change (enum-only stubs — Shopify partials/disputes arrive via separate resources, deferred). `mapLineItem` (`order_normalizer.go`) drops the `allocatedTax` variable and the `Title`/`VariantTitle` inputs, and sets `SubtotalPrice` from `unitPrice × quantity` (the `unitPriceCents*int64(raw.Quantity)` value already computed at line 241).
7. **Storage snapshot** (`storage/order/snapshot.go`) `*JSON` structs and builders mirror the entity changes: drop `Title`/`VariantTitle`/`AllocatedTax` and add `SubtotalPrice` on the line struct; drop `DisputeStatus` on the transaction struct; drop `Rate` on the fee struct.
8. **Read-side title join is out of scope.** `GetOrderDetail` returns raw JSONB as `z.unknown()`, so removing `title`/`variantTitle` causes no TS compile break; line display names simply won't be present in the response until a Product/Variant join is added in a follow-up.

## User Stories

- **Story 1:** As a developer maintaining the sync service, I want `TransactionKind` to express charge/refund/dispute lifecycle without overlapping representations, so that one transaction has exactly one canonical kind and disputes aren't modeled three ways.
  - Given a Shopify transaction with kind `sale` or `capture`, when the normalizer runs, then the canonical `OrderTransaction.Kind()` is `CHARGE`.
  - Given a Shopify transaction with kind `authorization`, `refund`, or `void`, when the normalizer runs, then the kind is unchanged (`AUTHORIZATION`/`REFUND`/`VOID`).
  - Given the wire catalog after this change, when an entity is constructed with kind `CHARGEBACK`, `SALE`, or `CAPTURE`, then construction fails with `ErrOrderTxInvalidKind` (the value no longer exists).

- **Story 2:** As a developer constructing the order aggregate, I want lean line items with a gross subtotal, so the write-side carries no denormalized display strings and each line is monetarily self-consistent.
  - Given a Shopify line item with unit price P, quantity Q, and discount D, when `mapLineItem` runs, then `SubtotalPrice = P × Q` and `TotalPrice = (P × Q) − D`.
  - Given any caller, when they construct an `OrderLine`, then `title`, `variantTitle`, and `allocatedTax` are no longer accepted or exposed.

## Acceptance Criteria

- [ ] AC-1: `TransactionKind` in `transaction-kind.tsp` contains exactly `AUTHORIZATION, CHARGE, PARTIAL_CHARGE, REFUND, PARTIAL_REFUND, VOID, DISPUTE_OPEN, DISPUTE_UNDER_REVIEW, DISPUTE_WON, DISPUTE_LOST, DISPUTE_ACCEPTED` and no longer contains `CAPTURE`, `SALE`, or `CHARGEBACK`; the generated Go (`ParseTransactionKind`) and TS enums reflect this after regen.
- [ ] AC-2: `dispute-status.tsp` and `order-transaction-disputed.tsp` are deleted, removed from their barrels, and the repo contains no remaining reference to `DisputeStatus`, `ParseDisputeStatus`, `OrderTransactionDisputedEvent`, or `order_transaction.disputed` (verified by grep) after regen.
- [ ] AC-3: `OrderTransaction` has no `disputeStatus` field, input, accessor, error, or parse block; `OrderTransactionFee` has no `rate` field, input, or accessor.
- [ ] AC-4: `OrderLine` has no `title`, `variantTitle`, `allocatedTax`, or `ErrLineMissingTitle`; it has a `subtotalPrice` field, `SubtotalPrice` input, and `SubtotalPrice()` accessor.
- [ ] AC-5: `mapTransactionKind` returns `CHARGE` for `sale` and `capture` and has no `CHARGEBACK` case; constructing the canonical transaction from a Shopify `sale`/`capture` payload yields kind `CHARGE`.
- [ ] AC-6: `mapLineItem` sets `SubtotalPrice = unitPrice × quantity` and passes no `Title`/`VariantTitle`/`AllocatedTax`.
- [ ] AC-7: The storage snapshot serializes lines with `subtotalPrice` and without `title`/`variantTitle`/`allocatedTax`; transactions without `disputeStatus`; fees without `rate`.
- [ ] AC-8: `go build ./...` and the Go sync test suites (`internal/sync/entities`, `internal/sync/services/shopify`, `internal/sync/storage/order`) pass; `bun tsc` passes (no TS source change expected; SDK regenerated).

## Risks & Migration

- **Existing JSONB rows.** Old `orders.lines`/`orders.transactions` rows hold `title`/`variantTitle`/`allocatedTax`/`disputeStatus`/`rate` and kinds `SALE`/`CAPTURE`/`CHARGEBACK`. This is a template with no production data, so no backfill is in scope; the read-side `z.unknown()` passthrough tolerates extra/missing keys. Called out so the omission is explicit.
- **Frontend line display.** Any consumer reading `.title` off the raw line JSON gets `undefined` after this change. Acceptable per Decision 8; the read-side Product/Variant join is the follow-up that restores names.

## Open Questions

None.

## Follow-ups

- Read-side join from `OrderLine` (via `productExternalId`/`variantExternalId`) to Product/Variant so `GetOrderDetail` can surface display names.
- Per-platform normalizer logic to emit `PARTIAL_CHARGE`/`PARTIAL_REFUND` and the `DISPUTE_*` kinds (Shopify disputes/partials arrive via separate resources).
