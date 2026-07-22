# Strip & reshape sales-order write-side fields + widen transaction kinds — Implementation Plan

> **For agentic workers:** Execute via `/build`. Each Task is one coherent, green-at-commit slice of the contract/Go refactor.

**Goal:** Reshape the canonical sales-order write-side: one charge/refund/dispute transaction-kind vocabulary (disputes as kinds, not a field), lean order lines with a gross `subtotalPrice`, and fees described only by `fixed`+`variable`.

**Architecture:** Contract-first. The transaction-kind enum and the dispute enum/event are TypeSpec wire contracts (`packages/contracts/wire/`) regenerated into Go + TS — Task T1 edits the source then regenerates and fixes the Go consumers in the same commit. Order lines and fees are NOT in the wire contract (internal Go structs serialized to JSONB), so Task T2 is Go-only with no regen. No SQL migration — `orders.lines`/`orders.transactions` are JSONB and `kind` is text.

**Tech Stack:** TypeSpec (contracts), Go (`go test`, stdlib `testing`, no testify), Bun/Nx (regen orchestration), Drizzle (unchanged).

**Spec:** .specs/2026-05-26-sales-order-field-strip-and-kinds-design.md
**Tasks:** 1
**Estimated minutes:** 70

---

## Task T1: Reshape the sales-order write-side (transaction vocabulary + lean lines)

One coherent change, two phases that share `snapshot.go` / `serialise_test.go` / `order_transaction_test.go` (hence one Task, not two). **Phase A (steps T1.1–T1.10):** CHARGE replaces CAPTURE/SALE; add PARTIAL_CHARGE, PARTIAL_REFUND, and all five DISPUTE_* kinds; remove CAPTURE, SALE, CHARGEBACK; delete the `DisputeStatus` enum + `OrderTransactionDisputedEvent`; strip the `disputeStatus` field. **Phase B (steps T1.11–T1.16):** OrderLine drops `title`/`variantTitle`/`allocatedTax`, gains `subtotalPrice`; OrderTransactionFee drops `rate`. Phase A is a wire-contract change (regen); Phase B is Go-only.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Skills:** /enum, /event, /entity, /test, /sdk
**Depends on:** (none)

**Files to write:**
- `packages/contracts/wire/enums/transaction-kind.tsp`
- `packages/contracts/wire/enums/dispute-status.tsp`
- `packages/contracts/wire/events/order-transaction-disputed.tsp`
- `packages/contracts/wire/main.tsp`
- `packages/contracts/wire/events/index.tsp`
- `packages/contracts/wire/events/order-transaction-recorded.tsp`
- `packages/api/go/internal/sync/services/shopify/transaction_normalizer.go`
- `packages/api/go/internal/sync/services/shopify/order_normalizer.go`
- `packages/api/go/internal/sync/entities/order_transaction.go`
- `packages/api/go/internal/sync/entities/order_transaction_fee.go`
- `packages/api/go/internal/sync/entities/order_line.go`
- `packages/api/go/internal/sync/storage/order/snapshot.go`
- `packages/api/go/internal/sync/entities/order_transaction_test.go`
- `packages/api/go/internal/sync/entities/transaction_test.go`
- `packages/api/go/internal/sync/entities/order_line_test.go`
- `packages/api/go/internal/sync/entities/order_test.go`
- `packages/api/go/internal/sync/storage/order/serialise_test.go`
- `packages/api/go/internal/sync/storage/order/order_pg_test.go`
- `packages/api/go/internal/sync/storage/transaction/transaction_pg_test.go`
- `packages/api/go/internal/sync/handlers/transaction_updated_handler_test.go`
- `packages/api/go/internal/sync/handlers/order_updated_handler_test.go`
- `packages/api/go/internal/sync/services/shopify/transaction_normalizer_test.go`
- `packages/api/go/internal/sync/services/shopify/order_normalizer_test.go`

**Files to read:**
- `packages/contracts/wire/enums/dispute-status.tsp`
- `packages/contracts/generated/go/wire/enums.go`

### Step T1.1 — Rewrite the transaction-kind enum

Replace the whole body of `packages/contracts/wire/enums/transaction-kind.tsp` with:

```tsp
namespace TemplateContracts;

@doc("Direction + lifecycle stage of an OrderTransaction (one Order may have N).")
enum TransactionKind {
  AUTHORIZATION: "AUTHORIZATION",
  CHARGE: "CHARGE",
  PARTIAL_CHARGE: "PARTIAL_CHARGE",
  REFUND: "REFUND",
  PARTIAL_REFUND: "PARTIAL_REFUND",
  VOID: "VOID",
  DISPUTE_OPEN: "DISPUTE_OPEN",
  DISPUTE_UNDER_REVIEW: "DISPUTE_UNDER_REVIEW",
  DISPUTE_WON: "DISPUTE_WON",
  DISPUTE_LOST: "DISPUTE_LOST",
  DISPUTE_ACCEPTED: "DISPUTE_ACCEPTED",
}
```

- [ ] transaction-kind.tsp has exactly the 11 members above

### Step T1.2 — Delete the dispute enum + event and unwire the barrels

```bash
git rm packages/contracts/wire/enums/dispute-status.tsp \
       packages/contracts/wire/events/order-transaction-disputed.tsp
```

Modify `packages/contracts/wire/main.tsp` — delete the line `import "./enums/dispute-status.tsp";`

Modify `packages/contracts/wire/events/index.tsp` — delete the line `import "./order-transaction-disputed.tsp";`

Modify `packages/contracts/wire/events/order-transaction-recorded.tsp` — the model `@doc` lists the old kinds:

```diff
-@doc("Published by go-worker when a new OrderTransaction lands on a canonical Order (any kind: SALE/AUTHORIZATION/CAPTURE/REFUND/VOID/CHARGEBACK). TS Sales applies it under the Order projection; Notifications fans out per-Store opt-in.")
+@doc("Published by go-worker when a new OrderTransaction lands on a canonical Order (any kind: AUTHORIZATION/CHARGE/PARTIAL_CHARGE/REFUND/PARTIAL_REFUND/VOID/DISPUTE_*). TS Sales applies it under the Order projection; Notifications fans out per-Store opt-in.")
```

- [ ] both tsp files deleted; both barrel imports removed; recorded-event doc updated

### Step T1.3 — Regenerate contracts + SDK

```bash
bun contracts && bun emit-openapi && bun sdk
```

Expected: `tsp compile` succeeds; `codegen:wire:{typescript,go}` rewrite the generated wire; `drizzle:generate` is a no-op (no schema change).

- [ ] regen ran without error

### Step T1.4 — Verify the regen reflects the contract change

```bash
grep -c 'TransactionKindCHARGE\|TransactionKindDISPUTE_OPEN' packages/contracts/generated/go/wire/enums.go
grep -c 'TransactionKindCAPTURE\|TransactionKindSALE\|TransactionKindCHARGEBACK\|DisputeStatus' packages/contracts/generated/go/wire/enums.go
git status --short packages/contracts/db/migrations/
```

Expected: first grep ≥ 2; second grep prints `0`; migrations status empty.

- [ ] new values present, old values + DisputeStatus gone, no new migration

### Step T1.5 — Confirm the consumers now fail (RED)

```bash
cd packages/api/go && go build ./... ; cd -
```

Expected: FAIL — `order_transaction.go` and tests reference `wire.DisputeStatus` / `wire.ParseDisputeStatus` / `wire.TransactionKindSALE` which no longer exist. This is the RED for the consumer fixes below.

- [ ] go build fails on the removed symbols (expected RED)

### Step T1.6 — Fix the Shopify transaction-kind mapping

Modify `packages/api/go/internal/sync/services/shopify/transaction_normalizer.go` — replace the `mapTransactionKind` switch body:

```diff
 	switch strings.ToUpper(s) {
 	case string(wire.TransactionKindAUTHORIZATION):
 		return string(wire.TransactionKindAUTHORIZATION)
-	case string(wire.TransactionKindCAPTURE):
-		return string(wire.TransactionKindCAPTURE)
-	case string(wire.TransactionKindSALE):
-		return string(wire.TransactionKindSALE)
+	case "CAPTURE", "SALE":
+		return string(wire.TransactionKindCHARGE)
 	case string(wire.TransactionKindREFUND):
 		return string(wire.TransactionKindREFUND)
 	case string(wire.TransactionKindVOID):
 		return string(wire.TransactionKindVOID)
-	case string(wire.TransactionKindCHARGEBACK):
-		return string(wire.TransactionKindCHARGEBACK)
 	default:
 		return strings.ToUpper(s)
 	}
```

- [ ] CAPTURE/SALE → CHARGE; CHARGEBACK case removed

### Step T1.7 — Strip `disputeStatus` from the OrderTransaction entity

Modify `packages/api/go/internal/sync/entities/order_transaction.go`.

Doc comment — drop `disputeStatus?` from the field list:
```diff
-// Order. Spec § BC4: `id, externalId, kind, status, amount,
-// processedAt, disputeStatus?, fees`.
+// Order. Spec § BC4: `id, externalId, kind, status, amount,
+// processedAt, fees`.
```

Struct field (remove):
```diff
 	processedAt   time.Time
-	disputeStatus *wire.DisputeStatus
 	fees          []OrderTransactionFee
```

Input field (remove):
```diff
 	ProcessedAt   time.Time
-	DisputeStatus *string
 	Fees          []OrderTransactionFee
```

Error var (remove):
```diff
 	ErrOrderTxInvalidStatus        = errors.New("orderTransaction: invalid status")
-	ErrOrderTxInvalidDisputeStatus = errors.New("orderTransaction: invalid disputeStatus")
 )
```

Parse block (remove the whole `var disputeStatus` block):
```diff
 	status, err := wire.ParseTransactionStatus(in.Status)
 	if err != nil {
 		return OrderTransaction{}, fmt.Errorf("%w: %v", ErrOrderTxInvalidStatus, err)
 	}
-	var disputeStatus *wire.DisputeStatus
-	if in.DisputeStatus != nil {
-		ds, err := wire.ParseDisputeStatus(*in.DisputeStatus)
-		if err != nil {
-			return OrderTransaction{}, fmt.Errorf("%w: %v", ErrOrderTxInvalidDisputeStatus, err)
-		}
-		disputeStatus = &ds
-	}
 	id, err := coreobjects.IDFromSeed("order_transaction", string(platform), in.ExternalID)
```

Struct literal (remove the field):
```diff
 		processedAt:   in.ProcessedAt,
-		disputeStatus: disputeStatus,
 		fees:          feesCopy,
```

Accessor (remove the line):
```diff
 func (t OrderTransaction) ProcessedAt() time.Time            { return t.processedAt }
-func (t OrderTransaction) DisputeStatus() *wire.DisputeStatus { return t.disputeStatus }
 func (t OrderTransaction) Fees() []OrderTransactionFee {
```

- [ ] no disputeStatus field/input/error/parse/accessor remains

### Step T1.8 — Drop `DisputeStatus` from the storage snapshot

Modify `packages/api/go/internal/sync/storage/order/snapshot.go`:

```diff
 	ProcessedAt   time.Time                 `json:"processedAt"`
-	DisputeStatus *wire.DisputeStatus       `json:"disputeStatus,omitempty"`
 	Fees          []orderTransactionFeeJSON `json:"fees"`
```

```diff
 		ProcessedAt:   t.ProcessedAt(),
-		DisputeStatus: t.DisputeStatus(),
 		Fees:          fees,
```

- [ ] orderTransactionJSON has no DisputeStatus

### Step T1.9 — Fix the tests to the new vocabulary

`packages/api/go/internal/sync/entities/order_transaction_test.go`:

`validTxInput` — change the kind:
```diff
-		Kind:        string(wire.TransactionKindSALE),
+		Kind:        string(wire.TransactionKindCHARGE),
```

`TestOrderTransaction_Happy` — fix the kind assertion and remove the dispute assertion:
```diff
-	if tx.Kind() != wire.TransactionKindSALE {
+	if tx.Kind() != wire.TransactionKindCHARGE {
 		t.Errorf("Kind = %q", tx.Kind())
 	}
@@
 	if tx.ID().Value() == "" {
 		t.Error("ID empty")
 	}
-	if tx.DisputeStatus() != nil {
-		t.Errorf("DisputeStatus should be nil when omitted, got %v", tx.DisputeStatus())
-	}
 }
```

Delete the two dispute tests entirely — the full `TestOrderTransaction_DisputeStatus_Valid` and `TestOrderTransaction_DisputeStatus_Invalid` functions.

`packages/api/go/internal/sync/entities/transaction_test.go` — gateway transaction input:
```diff
-		Kind:                       string(wire.TransactionKindSALE),
+		Kind:                       string(wire.TransactionKindCHARGE),
```

`packages/api/go/internal/sync/storage/order/serialise_test.go` — both transaction inputs (line ~94 and ~143):
```diff
-		Kind:        string(wire.TransactionKindSALE),
+		Kind:        string(wire.TransactionKindCHARGE),
```

`TestSerialiseTransactions_PreservesFeesAndOptionalDispute` — rename, fix kind assertion, remove dispute-absent assertion:
```diff
-func TestSerialiseTransactions_PreservesFeesAndOptionalDispute(t *testing.T) {
+func TestSerialiseTransactions_PreservesFees(t *testing.T) {
@@
-	if rows[0]["kind"] != "SALE" {
+	if rows[0]["kind"] != "CHARGE" {
 		t.Errorf("kind = %v", rows[0]["kind"])
 	}
 	if rows[0]["status"] != "SUCCESS" {
 		t.Errorf("status = %v", rows[0]["status"])
 	}
-	// disputeStatus key omitted when nil
-	if _, present := rows[0]["disputeStatus"]; present {
-		t.Errorf("disputeStatus key should be absent when nil")
-	}
 	fees := rows[0]["fees"].([]any)
```

Delete the whole `TestSerialiseTransactions_IncludesDisputeStatusWhenSet` function.

`packages/api/go/internal/sync/storage/transaction/transaction_pg_test.go` — the import-keep-alive blank:
```diff
-var _ = wire.TransactionKindSALE
+var _ = wire.TransactionKindCHARGE
```

`packages/api/go/internal/sync/handlers/transaction_updated_handler_test.go`:
```diff
-		Kind:                       string(wire.TransactionKindSALE),
+		Kind:                       string(wire.TransactionKindCHARGE),
```

`packages/api/go/internal/sync/services/shopify/transaction_normalizer_test.go` — the JSON input kind is `"sale"`, now normalizing to CHARGE:
```diff
-	if in.Kind != string(wire.TransactionKindSALE) {
-		t.Errorf("Kind = %q, want %q", in.Kind, wire.TransactionKindSALE)
+	if in.Kind != string(wire.TransactionKindCHARGE) {
+		t.Errorf("Kind = %q, want %q", in.Kind, wire.TransactionKindCHARGE)
 	}
```

- [ ] all SALE references → CHARGE; dispute tests deleted

### Step T1.10 — Build + test green (GREEN)

```bash
cd packages/api/go && go build ./... && go test ./internal/sync/... ; cd -
bun tsc
```

Expected: `go build` clean; `go test` PASS for entities, storage/order, storage/transaction, handlers, services/shopify; `bun tsc` 0 errors.

- [ ] go build + go test + bun tsc all green (end of Phase A — tree is green on its own)

---

### Step T1.11 — Reshape the OrderLine entity

Modify `packages/api/go/internal/sync/entities/order_line.go`.

Doc comment field list:
```diff
-// § BC4: `id, productExternalId, variantExternalId, productId?,
-// variantId?, title, variantTitle?, quantity, unitPrice, discount,
-// tax, allocatedTax, totalPrice`.
+// § BC4: `id, productExternalId, variantExternalId, productId?,
+// variantId?, quantity, unitPrice, subtotalPrice, discount,
+// tax, totalPrice`.
```

Struct fields:
```diff
 	productID         *string
 	variantID         *string
-	title             string
-	variantTitle      *string
 	quantity          int
 	unitPrice         objects.MonetaryAmount
+	subtotalPrice     objects.MonetaryAmount
 	discount          objects.MonetaryAmount
 	tax               objects.MonetaryAmount
-	allocatedTax      objects.MonetaryAmount
 	totalPrice        objects.MonetaryAmount
 }
```

Input fields:
```diff
 	ProductID *string
 	VariantID *string

-	Title        string
-	VariantTitle *string
-
 	Quantity int

 	UnitPrice    objects.MonetaryAmount
+	SubtotalPrice objects.MonetaryAmount
 	Discount     objects.MonetaryAmount
 	Tax          objects.MonetaryAmount
-	AllocatedTax objects.MonetaryAmount
 	TotalPrice   objects.MonetaryAmount
 }
```

Error var:
```diff
 	ErrLineMissingVariantExternalID = errors.New("orderLine: variantExternalId required")
-	ErrLineMissingTitle             = errors.New("orderLine: title required")
 	ErrLineQuantityNegative         = errors.New("orderLine: quantity must be ≥ 0 (use 0 for refunded/voided lines)")
```

Constructor — remove the title guard:
```diff
 	if strings.TrimSpace(in.VariantExternalID) == "" {
 		return OrderLine{}, ErrLineMissingVariantExternalID
 	}
-	if strings.TrimSpace(in.Title) == "" {
-		return OrderLine{}, ErrLineMissingTitle
-	}
 	if in.Quantity < 0 {
```

Constructor struct literal:
```diff
 		productID:         in.ProductID,
 		variantID:         in.VariantID,
-		title:             in.Title,
-		variantTitle:      in.VariantTitle,
 		quantity:          in.Quantity,
 		unitPrice:         in.UnitPrice,
+		subtotalPrice:     in.SubtotalPrice,
 		discount:          in.Discount,
 		tax:               in.Tax,
-		allocatedTax:      in.AllocatedTax,
 		totalPrice:        in.TotalPrice,
 	}, nil
```

Accessors:
```diff
 func (l OrderLine) VariantID() *string                   { return l.variantID }
-func (l OrderLine) Title() string                        { return l.title }
-func (l OrderLine) VariantTitle() *string                { return l.variantTitle }
 func (l OrderLine) Quantity() int                        { return l.quantity }
 func (l OrderLine) UnitPrice() objects.MonetaryAmount    { return l.unitPrice }
+func (l OrderLine) SubtotalPrice() objects.MonetaryAmount { return l.subtotalPrice }
 func (l OrderLine) Discount() objects.MonetaryAmount     { return l.discount }
 func (l OrderLine) Tax() objects.MonetaryAmount          { return l.tax }
-func (l OrderLine) AllocatedTax() objects.MonetaryAmount { return l.allocatedTax }
 func (l OrderLine) TotalPrice() objects.MonetaryAmount   { return l.totalPrice }
```

- [ ] OrderLine: no title/variantTitle/allocatedTax/ErrLineMissingTitle; has subtotalPrice (field/input/accessor)

### Step T1.12 — Drop `rate` from OrderTransactionFee

Modify `packages/api/go/internal/sync/entities/order_transaction_fee.go`:

```diff
-// OrderTransactionFee. Spec § BC4: `externalId, type, rate, fixed,
-// variable`.
+// OrderTransactionFee. Spec § BC4: `externalId, type, fixed, variable`.
 type OrderTransactionFee struct {
 	externalID string
 	feeType    wire.OrderTransactionFeeType
-	rate       float64
 	fixed      objects.MonetaryAmount
 	variable   objects.MonetaryAmount
 }
```

```diff
 	ExternalID string
 	Type       string
-	Rate       float64
 	Fixed      objects.MonetaryAmount
 	Variable   objects.MonetaryAmount
 }
```

```diff
 		externalID: in.ExternalID,
 		feeType:    feeType,
-		rate:       in.Rate,
 		fixed:      in.Fixed,
 		variable:   in.Variable,
 	}, nil
```

```diff
 func (f OrderTransactionFee) Type() wire.OrderTransactionFeeType { return f.feeType }
-func (f OrderTransactionFee) Rate() float64                      { return f.rate }
 func (f OrderTransactionFee) Fixed() objects.MonetaryAmount      { return f.fixed }
```

- [ ] OrderTransactionFee has no rate field/input/accessor

### Step T1.13 — Update the Shopify line normalizer

Modify `packages/api/go/internal/sync/services/shopify/order_normalizer.go`.

Trim the raw struct:
```diff
 	ID           int64   `json:"id"`
 	ProductID    *int64  `json:"product_id,omitempty"`
 	VariantID    *int64  `json:"variant_id,omitempty"`
-	Title        string  `json:"title"`
-	VariantTitle *string `json:"variant_title,omitempty"`
 	Quantity     int     `json:"quantity"`
 	Price        string  `json:"price"` // unit price
```

`mapLineItem` — compute the gross subtotal, drop allocatedTax, update the constructed input:
```diff
-	totalCents := unitPriceCents*int64(raw.Quantity) - discountCents
+	subtotalCents := unitPriceCents * int64(raw.Quantity)
+	totalCents := subtotalCents - discountCents
 	unitPrice, _ := objects.NewMonetaryAmount(unitPriceCents, currency)
+	subtotalPrice, _ := objects.NewMonetaryAmount(subtotalCents, currency)
 	discount, _ := objects.NewMonetaryAmount(discountCents, currency)
 	tax, _ := objects.NewMonetaryAmount(taxCents, currency)
-	allocatedTax, _ := objects.NewMonetaryAmount(taxCents, currency)
 	total, _ := objects.NewMonetaryAmount(totalCents, currency)
```

```diff
 		ProductExternalID: productExt,
 		VariantExternalID: variantExt,
-		Title:             raw.Title,
-		VariantTitle:      raw.VariantTitle,
 		Quantity:          raw.Quantity,
 		UnitPrice:         unitPrice,
+		SubtotalPrice:     subtotalPrice,
 		Discount:          discount,
 		Tax:               tax,
-		AllocatedTax:      allocatedTax,
 		TotalPrice:        total,
 	})
```

- [ ] mapLineItem sets SubtotalPrice = unitPrice×qty; no Title/VariantTitle/AllocatedTax

### Step T1.14 — Update the storage snapshot

Modify `packages/api/go/internal/sync/storage/order/snapshot.go`.

`orderLineJSON`:
```diff
 	ProductID         *string        `json:"productId,omitempty"`
 	VariantID         *string        `json:"variantId,omitempty"`
-	Title             string         `json:"title"`
-	VariantTitle      *string        `json:"variantTitle,omitempty"`
 	Quantity          int            `json:"quantity"`
 	UnitPrice         orderMoneyJSON `json:"unitPrice"`
+	SubtotalPrice     orderMoneyJSON `json:"subtotalPrice"`
 	Discount          orderMoneyJSON `json:"discount"`
 	Tax               orderMoneyJSON `json:"tax"`
-	AllocatedTax      orderMoneyJSON `json:"allocatedTax"`
 	TotalPrice        orderMoneyJSON `json:"totalPrice"`
 }
```

`newOrderLineJSON`:
```diff
 		ProductID:         l.ProductID(),
 		VariantID:         l.VariantID(),
-		Title:             l.Title(),
-		VariantTitle:      l.VariantTitle(),
 		Quantity:          l.Quantity(),
 		UnitPrice:         orderMoneyJSON{AmountCents: l.UnitPrice().AmountCents(), Currency: l.UnitPrice().Currency()},
+		SubtotalPrice:     orderMoneyJSON{AmountCents: l.SubtotalPrice().AmountCents(), Currency: l.SubtotalPrice().Currency()},
 		Discount:          orderMoneyJSON{AmountCents: l.Discount().AmountCents(), Currency: l.Discount().Currency()},
 		Tax:               orderMoneyJSON{AmountCents: l.Tax().AmountCents(), Currency: l.Tax().Currency()},
-		AllocatedTax:      orderMoneyJSON{AmountCents: l.AllocatedTax().AmountCents(), Currency: l.AllocatedTax().Currency()},
 		TotalPrice:        orderMoneyJSON{AmountCents: l.TotalPrice().AmountCents(), Currency: l.TotalPrice().Currency()},
 	}
```

`orderTransactionFeeJSON`:
```diff
 	ExternalID string                    `json:"externalId"`
 	Type       wire.OrderTransactionFeeType `json:"type"`
-	Rate       float64                   `json:"rate"`
 	Fixed      orderMoneyJSON            `json:"fixed"`
 	Variable   orderMoneyJSON            `json:"variable"`
```

`newOrderTransactionJSON` fee loop:
```diff
 			ExternalID: f.ExternalID(),
 			Type:       f.Type(),
-			Rate:       f.Rate(),
 			Fixed:      orderMoneyJSON{AmountCents: f.Fixed().AmountCents(), Currency: f.Fixed().Currency()},
```

- [ ] orderLineJSON: +subtotalPrice −title/variantTitle/allocatedTax; fee JSON: −rate

### Step T1.15 — Update the tests

`packages/api/go/internal/sync/entities/order_line_test.go`:

`validLineInput` — drop Title/AllocatedTax, add SubtotalPrice (unitPrice 1500 × qty 2 = 3000):
```diff
 		VariantExternalID: "shopify_var_1",
-		Title:             "Coffee Mug",
 		Quantity:          2,
 		UnitPrice:         mustMoney(t, 1500, wire.CurrencyCodeUSD),
+		SubtotalPrice:     mustMoney(t, 3000, wire.CurrencyCodeUSD),
 		Discount:          mustMoney(t, 0, wire.CurrencyCodeUSD),
 		Tax:               mustMoney(t, 240, wire.CurrencyCodeUSD),
-		AllocatedTax:      mustMoney(t, 240, wire.CurrencyCodeUSD),
 		TotalPrice:        mustMoney(t, 3000, wire.CurrencyCodeUSD),
 	}
```

`TestOrderLine_Happy` — assert the new field instead of Title:
```diff
-	if l.Title() != "Coffee Mug" {
-		t.Errorf("Title = %q", l.Title())
+	if l.SubtotalPrice().AmountCents() != 3000 {
+		t.Errorf("SubtotalPrice = %d", l.SubtotalPrice().AmountCents())
 	}
```

Delete the whole `TestOrderLine_MissingTitle` function.

`TestOrderLine_OptionalIDs` — drop the VariantTitle parts:
```diff
 	pid := "00000000-0000-7000-8000-000000000001"
 	vid := "00000000-0000-7000-8000-000000000002"
-	vt := "Red / Large"
 	in.ProductID = &pid
 	in.VariantID = &vid
-	in.VariantTitle = &vt

 	l, err := NewOrderLine(in)
@@
 	if l.VariantID() == nil || *l.VariantID() != vid {
 		t.Errorf("VariantID = %v", l.VariantID())
 	}
-	if l.VariantTitle() == nil || *l.VariantTitle() != vt {
-		t.Errorf("VariantTitle = %v", l.VariantTitle())
-	}
 }
```

`packages/api/go/internal/sync/entities/order_transaction_test.go` — `validFeeInput` drops Rate; `TestOrderTransactionFee_Happy` drops the Rate assertion:
```diff
 		ExternalID: "shopify_fee_1",
 		Type:       string(wire.OrderTransactionFeeTypePROCESSING),
-		Rate:       0.029,
 		Fixed:      mustMoney(t, 30, wire.CurrencyCodeUSD),
```
```diff
 	if f.Type() != wire.OrderTransactionFeeTypePROCESSING {
 		t.Errorf("Type = %q", f.Type())
 	}
-	if f.Rate() != 0.029 {
-		t.Errorf("Rate = %f", f.Rate())
-	}
 }
```

`packages/api/go/internal/sync/entities/order_test.go` — the slice-isolation assertion uses the removed `Title()`; switch to a still-present field:
```diff
-	if o.Lines()[0].Title() == "" {
+	if o.Lines()[0].ExternalLineID() == "" {
 		t.Error("Lines() returned a live slice; caller mutation leaked into aggregate state")
```
(`order_test.go` builds its line via `validLineInput`, fixed above — no other change here.)

`packages/api/go/internal/sync/storage/order/serialise_test.go` — `TestSerialiseLines_PreservesAllFields` input + assertion, and the fee input Rate:
```diff
 		VariantExternalID: "shopify_var_1",
-		Title:             "Coffee Mug",
 		Quantity:          2,
 		UnitPrice:         mustMoneyTest(t, 1500, wire.CurrencyCodeUSD),
+		SubtotalPrice:     mustMoneyTest(t, 3000, wire.CurrencyCodeUSD),
 		Discount:          mustMoneyTest(t, 0, wire.CurrencyCodeUSD),
 		Tax:               mustMoneyTest(t, 240, wire.CurrencyCodeUSD),
-		AllocatedTax:      mustMoneyTest(t, 240, wire.CurrencyCodeUSD),
 		TotalPrice:        mustMoneyTest(t, 3000, wire.CurrencyCodeUSD),
 	})
```
```diff
-	if rows[0]["title"] != "Coffee Mug" {
-		t.Errorf("title = %v", rows[0]["title"])
+	subtotal := rows[0]["subtotalPrice"].(map[string]any)
+	if subtotal["amountCents"] != float64(3000) {
+		t.Errorf("subtotalPrice.amountCents = %v", subtotal["amountCents"])
 	}
```
```diff
 		ExternalID: "shopify_fee_1",
 		Type:       string(wire.OrderTransactionFeeTypePROCESSING),
-		Rate:       0.029,
 		Fixed:      mustMoneyTest(t, 30, wire.CurrencyCodeUSD),
```

`packages/api/go/internal/sync/storage/order/order_pg_test.go` — the inline line input:
```diff
 		VariantExternalID: "shopify_var_1",
-		Title:             "Test Widget",
 		Quantity:          1,
 		UnitPrice:         usd(5000),
+		SubtotalPrice:     usd(5000),
 		Discount:          usd(0),
 		Tax:               usd(400),
-		AllocatedTax:      usd(400),
 		TotalPrice:        usd(5400),
 	})
```

`packages/api/go/internal/sync/handlers/order_updated_handler_test.go` — same inline line input:
```diff
 		VariantExternalID: "shopify_var_1",
-		Title:             "Test Widget",
 		Quantity:          1,
 		UnitPrice:         usd(5000),
+		SubtotalPrice:     usd(5000),
 		Discount:          usd(0),
 		Tax:               usd(400),
-		AllocatedTax:      usd(400),
 		TotalPrice:        usd(5400),
 	})
```

`packages/api/go/internal/sync/services/shopify/order_normalizer_test.go` — `TestShopifyOrdersNormalizer_Happy` proves `mapLineItem` sets the gross subtotal (line: unit 5000 × qty 2 = 10000). After the `UnitPrice` line assertion, add:
```diff
 	if in.Lines[0].UnitPrice().AmountCents() != 5000 {
 		t.Errorf("line unit price cents = %d", in.Lines[0].UnitPrice().AmountCents())
 	}
+	if in.Lines[0].SubtotalPrice().AmountCents() != 10000 {
+		t.Errorf("line subtotal price cents = %d, want 10000", in.Lines[0].SubtotalPrice().AmountCents())
+	}
 }
```
(The `title`/`variant_title` keys in `shopifyOrderJSON` are now unmapped — `encoding/json` ignores them, so the fixture needs no edit.)

- [ ] all line tests drop title/allocatedTax + add subtotalPrice; fee tests drop rate; normalizer asserts subtotalPrice

### Step T1.16 — Build + test green (final)

```bash
cd packages/api/go && go build ./... && go test ./internal/sync/... ; cd -
bun tsc
```

Expected: `go build` clean; `go test` PASS across entities, storage/order, storage/transaction, handlers, services/shopify; `bun tsc` 0 errors.

- [ ] go build + go test + bun tsc all green

---

## Final Validation

- [ ] `cd packages/api/go && go build ./...` — Go compiles clean
- [ ] `cd packages/api/go && go test ./internal/sync/...` — Go sync suites pass
- [ ] `bun tsc` — full TS type check clean (contracts + api + client)
- [ ] No new file under `packages/contracts/db/migrations/` (no schema change)
- [ ] AC mapping (every spec AC → ≥1 verification):
  - AC-1 → Task T1.4 grep + `packages/contracts/generated/go/wire/enums.go` (`ParseTransactionKind` cases)
  - AC-2 → Task T1.4 grep prints `0` for `DisputeStatus`; `git rm` of the two tsp files; barrels unwired
  - AC-3 → `order_transaction.go` has no disputeStatus (T1.7); `order_transaction_fee.go` has no rate (T1.12)
  - AC-4 → `order_line.go` shape (T1.11); `order_line_test.go:"TestOrderLine_Happy"` asserts `SubtotalPrice`
  - AC-5 → `transaction_normalizer_test.go:"TestTransactionsNormalizer_Happy"` asserts kind `CHARGE` from `"sale"`
  - AC-6 → `order_normalizer.go` `mapLineItem` (T1.13); `order_normalizer_test.go:"TestShopifyOrdersNormalizer_Happy"` asserts line `subtotalPrice` == 10000
  - AC-7 → `serialise_test.go:"TestSerialiseLines_PreservesAllFields"` + `"TestSerialiseTransactions_PreservesFees"`
  - AC-8 → Final Validation `go build` + `go test` + `bun tsc`

## Notes

- **Regen pipeline:** `bun contracts` = `tsp compile` → `codegen:wire:{ts,go}` → `drizzle:generate` (no-op here). `bun emit-openapi` + `bun sdk` run for coherence (likely little/no diff — transaction kind is only surfaced as raw JSONB via `GetOrderDetail`'s `z.unknown()`). The orchestrator stages the regenerated `packages/contracts/generated`, `packages/client/dist`, and `packages/api/typescript/public/docs/openapi.json` into the Task T1 commit.
- **Go module root:** `packages/api/go` (module `template/api-go`); generated wire imported as `template/contracts-go/wire`, rebuilt by `codegen:wire:go`.
- **Out of scope (per spec):** read-side Product/Variant title join; per-platform mapping for `PARTIAL_*` and `DISPUTE_*` kinds (enum-only stubs).
- **No JSONB backfill** — template, no production data.
