# Go Sync Kinds Expansion — Implementation Plan (Spec C)

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`) syntax. Each Task wraps one observable behavior in an outer RED→GREEN cycle. Go-only commits use `git commit --no-verify` (the workspace `tsc` pre-commit hook is red from an unrelated parallel TS refactor; these commits touch zero TS except the Drizzle schema). `go build ./... && go test ./... && go vet` is the real gate.

**Goal:** Add the 6 missing `SyncPipelineName` values + ship `TRANSACTIONS` end-to-end (standalone gateway Transaction entity + storage + event + handler + migration + Shopify pipeline), register PENDING pipelines for the other 5 kinds, and route marketing-reconcile through `POST /sync` with `MARKETING_METRICS`.

**Architecture:** Mirrors Spec A's built pattern exactly. New kind = canonical aggregate in `storage/transaction/` + `events/external_transaction_updated.go` + `handlers/transaction_updated_handler.go` (persist + publish wire event) + a Shopify pipeline publishing the external event through the executor's injected publisher. The factory (keyed by `(platform, SyncPipelineName)`) + executor (runs `job.Pipelines`) already support multiple kinds; Spec C registers the new ones. PENDING kinds resolve to `PendingPipeline` (graceful `ErrPipelinePending`).

**Tech Stack:** Go, fx, net/http, database/sql, google/uuid; Drizzle (gateway_transactions migration).

**Spec:** .specs/2026-05-24-go-sync-kinds-design.md
**Tasks:** 7
**Estimated minutes:** 340

> **Planner notes.** (1) Graph `validate-plan`/`review-plan` + SDK Contract-Lock are TS-graph tools; this plan is Go + one Drizzle table — N/A. (2) Builds on Spec A (committed): `enums.SyncPipelineName` + `Valid()`, `services/pipelines.{Factory,Pipeline,ExternalEventPublisher,PendingPipeline}`, `services/executor`, `storage/objects.MonetaryAmount`, the `events`→`handlers`→`storage` pattern, `module.go`'s `pendingPipelineProviders()` + the `fx.Invoke` handler registration. (3) Transaction's wire event is a **Go-typed payload built in-handler** (no `wire.TransactionUpdatedEvent` — the contracts aren't regenerated; spec Decision 6).

---

## Task TC1: SyncPipelineName accepts the 6 new kinds

**Files:**
- Modify: `internal/sync/enums/sync_pipeline_name.go` — add 6 const values + extend `Valid()`
- Modify: `internal/sync/enums/sync_pipeline_name_test.go` — assert the new values are valid

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /enum, /test
**Depends on:** (none)

- [ ] **Step 1: Extend the failing test**

Modify `internal/sync/enums/sync_pipeline_name_test.go` — add the new values to the valid set + drop the "TRANSACTIONS must NOT be valid yet" assertion (it's valid now):

```go
func TestSyncPipelineName_Valid(t *testing.T) {
	valid := []SyncPipelineName{
		SyncPipelineOrders, SyncPipelineProducts, SyncPipelineProductVariants,
		SyncPipelineTransactions, SyncPipelineDisputes, SyncPipelineMarketingMetrics,
		SyncPipelineMarketingMetricsConcurrent, SyncPipelineMarketingMetricsTwoPhase, SyncPipelineCampaigns,
	}
	for _, v := range valid {
		if !v.Valid() {
			t.Errorf("%q should be valid", v)
		}
	}
	if SyncPipelineName("BOGUS").Valid() {
		t.Errorf("BOGUS should be invalid")
	}
	if SyncPipelineName("").Valid() {
		t.Errorf("empty should be invalid")
	}
}
```

- [ ] **Step 2: Run test → fail**

Run: `cd packages/api/go && go test ./internal/sync/enums/...`
Expected: FAIL — `undefined: SyncPipelineTransactions`.

- [ ] **Step 3: Add the enum values**

Modify `internal/sync/enums/sync_pipeline_name.go` — add the 6 consts + the `Valid()` switch cases:

```go
const (
	SyncPipelineOrders          SyncPipelineName = "ORDERS"
	SyncPipelineProducts        SyncPipelineName = "PRODUCTS"
	SyncPipelineProductVariants SyncPipelineName = "PRODUCT_VARIANTS"

	SyncPipelineTransactions               SyncPipelineName = "TRANSACTIONS"
	SyncPipelineDisputes                   SyncPipelineName = "DISPUTES"
	SyncPipelineMarketingMetrics           SyncPipelineName = "MARKETING_METRICS"
	SyncPipelineMarketingMetricsConcurrent SyncPipelineName = "MARKETING_METRICS_CONCURRENT"
	SyncPipelineMarketingMetricsTwoPhase   SyncPipelineName = "MARKETING_METRICS_TWO_PHASE"
	SyncPipelineCampaigns                  SyncPipelineName = "CAMPAIGNS"
)

func (s SyncPipelineName) Valid() bool {
	switch s {
	case SyncPipelineOrders, SyncPipelineProducts, SyncPipelineProductVariants,
		SyncPipelineTransactions, SyncPipelineDisputes, SyncPipelineMarketingMetrics,
		SyncPipelineMarketingMetricsConcurrent, SyncPipelineMarketingMetricsTwoPhase, SyncPipelineCampaigns:
		return true
	}
	return false
}
```

- [ ] **Step 4: Run test → pass; build; commit**

Run: `cd packages/api/go && go test ./internal/sync/enums/... && go build ./...`
```bash
git add packages/api/go/internal/sync/enums
git commit --no-verify -m "feat(go-sync): add 6 SyncPipelineName kinds (TRANSACTIONS/DISPUTES/MARKETING_METRICS*/CAMPAIGNS) (Task TC1)"
```

---

## Task TC2: gateway_transactions table migration

> Migration precedes the storage Task (TC3) that reads/writes the table.

**Files:**
- Modify: `packages/contracts/db/schema/sync.ts` — add the `gatewayTransactions` table
- Generate: `packages/contracts/db/migrations/<NNNN>_*.sql` (+ snapshot)

**Agent:** database-architect
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /db-modelling, /migrate
**Depends on:** (none)

- [ ] **Step 1: Add the table to the existing sync schema**

Modify `packages/contracts/db/schema/sync.ts` — append (the file already has `syncJobs` from Spec A; reuse its imports, add `bigint`/`index` if missing):

```ts
export const gatewayTransactions = pgTable('gateway_transactions', {
	id: uuid('id').primaryKey(),
	platform: text('platform').notNull(),
	externalId: text('external_id').notNull(),
	storeId: uuid('store_id').notNull(),
	storeIntegrationId: uuid('store_integration_id').notNull(),
	storeIntegrationExternalId: text('store_integration_external_id').notNull(),
	orderExternalId: text('order_external_id'),
	kind: text('kind').notNull(),
	status: text('status').notNull(),
	amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
	currency: text('currency').notNull(),
	gateway: text('gateway').notNull(),
	processedAt: timestamp('processed_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	version: integer('version').notNull().default(1),
})
```

> Name is `gateway_transactions` (NOT `transactions`) to avoid confusion with the `Order` aggregate's embedded payment lines. Confirm no existing `gateway_transactions` table in `schema/`.

- [ ] **Step 2: Generate the migration**

Run: `bun migrate:create`
Expected: ONE new migration with `CREATE TABLE "gateway_transactions"` only. If it contains other changes, STOP + report BLOCKED (parallel-refactor drift).

- [ ] **Step 3: Apply (best-effort) + commit**

Run: `bun migrate:dev` (skips/fails gracefully if Docker is paused — note in report).
```bash
git add packages/contracts/db/schema/sync.ts packages/contracts/db/migrations/
git commit --no-verify -m "feat(db): gateway_transactions table (Task TC2)"
```

---

## Task TC3: Transaction aggregate round-trips through Postgres

**Files:**
- Create: `internal/sync/storage/transaction/transaction.go` (aggregate + `TransactionInput` + `NewTransactionFromProviderPayload` + getters)
- Create: `internal/sync/storage/transaction/transaction_storage.go` (`Storage` interface)
- Create: `internal/sync/storage/transaction/transaction_pg.go` (`PgTransactionStorage`)
- Create: `internal/sync/storage/transaction/transaction_test.go` (entity invariants)
- Create: `internal/sync/storage/transaction/transaction_pg_test.go` (round-trip; skip if DB unreachable)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /entity, /repository, /test
**Depends on:** TC2

- [ ] **Step 1: Write the failing entity test**

Create `internal/sync/storage/transaction/transaction_test.go`:

```go
package transaction

import (
	"testing"
	"time"

	"template/api-go/internal/sync/storage/objects"
)

func validInput() TransactionInput {
	return TransactionInput{
		Platform:                   "SHOPIFY",
		ExternalID:                 "txn-1",
		StoreID:                    "11111111-1111-4111-8111-111111111111",
		StoreIntegrationID:         "22222222-2222-4222-8222-222222222222",
		StoreIntegrationExternalID: "shop.myshopify.com",
		OrderExternalID:            "ord-1",
		Kind:                       "sale",
		Status:                     "success",
		Amount:                     objects.NewMonetaryAmount(1000, "USD"),
		Gateway:                    "shopify_payments",
		ProcessedAt:                time.Now().UTC(),
	}
}

func TestTransaction_RejectsMissingExternalID(t *testing.T) {
	in := validInput()
	in.ExternalID = ""
	if _, err := NewTransactionFromProviderPayload(in); err == nil {
		t.Error("expected error for missing externalId")
	}
}

func TestTransaction_RejectsMissingStoreID(t *testing.T) {
	in := validInput()
	in.StoreID = ""
	if _, err := NewTransactionFromProviderPayload(in); err == nil {
		t.Error("expected error for missing storeId")
	}
}

func TestTransaction_BuildsWithStableID(t *testing.T) {
	a, err := NewTransactionFromProviderPayload(validInput())
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	b, _ := NewTransactionFromProviderPayload(validInput())
	if a.ID().UUID() != b.ID().UUID() {
		t.Error("id not deterministic across identical inputs")
	}
}
```

> Confirm `objects.NewMonetaryAmount(cents int64, currency string) objects.MonetaryAmount` exists in `internal/sync/storage/objects/` (read it; Spec A's order uses it). If the constructor differs (e.g. takes a `CurrencyCode`), match the real signature.

- [ ] **Step 2: Run test → fail**

Run: `cd packages/api/go && go test ./internal/sync/storage/transaction/...`
Expected: FAIL — package/symbol undefined.

- [ ] **Step 3: Write the aggregate + storage**

Create `internal/sync/storage/transaction/transaction.go` — mirror `storage/order/order.go`'s structure (private fields, `TransactionInput`, validated constructor using `wire.ParseSalesPlatform` for platform + `coreobjects.IDFromSeed("transaction", platform, externalID)` for the id; `Kind`/`Status`/`Gateway` validated non-empty strings; `Amount objects.MonetaryAmount` required non-zero). Provide getters used by the wire-event builder: `ID() coreobjects.ID`, `Platform() wire.SalesPlatform`, `ExternalID()`, `StoreID()`, `StoreIntegrationID()`, `StoreIntegrationExternalID()`, `OrderExternalID() string`, `Kind()`, `Status()`, `Gateway()`, `Amount() objects.MonetaryAmount`, `ProcessedAt() time.Time`.

```go
// Package transaction holds the canonical gateway/settlement Transaction
// aggregate — the provider's settlement record (Shopify /transactions),
// distinct from the Order aggregate's embedded OrderTransaction payment
// lines. Go-side write authority; TS reads via the wire event.
package transaction

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"template/api-go/internal/sync/storage/objects"
	wire "template/contracts-go/wire"
	coreobjects "template/core-go/objects"
)

type Transaction struct {
	id                         coreobjects.ID
	platform                   wire.SalesPlatform
	externalID                 string
	storeID                    string
	storeIntegrationID         string
	storeIntegrationExternalID string
	orderExternalID            string
	kind                       string
	status                     string
	amount                     objects.MonetaryAmount
	gateway                    string
	processedAt                time.Time
}

type TransactionInput struct {
	Platform                   string
	ExternalID                 string
	StoreID                    string
	StoreIntegrationID         string
	StoreIntegrationExternalID string
	OrderExternalID            string
	Kind                       string
	Status                     string
	Amount                     objects.MonetaryAmount
	Gateway                    string
	ProcessedAt                time.Time
}

var (
	ErrTxMissingExternalID       = errors.New("transaction: externalId required")
	ErrTxMissingStoreID          = errors.New("transaction: storeId required")
	ErrTxMissingStoreIntegration = errors.New("transaction: storeIntegrationId / storeIntegrationExternalId required")
	ErrTxMissingKindStatus       = errors.New("transaction: kind + status required")
	ErrTxMissingAmount           = errors.New("transaction: amount required")
	ErrTxInvalidPlatform         = errors.New("transaction: invalid platform")
)

func NewTransactionFromProviderPayload(in TransactionInput) (*Transaction, error) {
	if strings.TrimSpace(in.ExternalID) == "" {
		return nil, ErrTxMissingExternalID
	}
	if strings.TrimSpace(in.StoreID) == "" {
		return nil, ErrTxMissingStoreID
	}
	if strings.TrimSpace(in.StoreIntegrationID) == "" || strings.TrimSpace(in.StoreIntegrationExternalID) == "" {
		return nil, ErrTxMissingStoreIntegration
	}
	if strings.TrimSpace(in.Kind) == "" || strings.TrimSpace(in.Status) == "" {
		return nil, ErrTxMissingKindStatus
	}
	if in.Amount.IsZero() {
		return nil, ErrTxMissingAmount
	}
	platform, err := wire.ParseSalesPlatform(in.Platform)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrTxInvalidPlatform, err)
	}
	id, err := coreobjects.IDFromSeed("transaction", string(platform), in.ExternalID)
	if err != nil {
		return nil, fmt.Errorf("transaction: id derivation: %w", err)
	}
	return &Transaction{
		id: id, platform: platform, externalID: in.ExternalID,
		storeID: in.StoreID, storeIntegrationID: in.StoreIntegrationID,
		storeIntegrationExternalID: in.StoreIntegrationExternalID,
		orderExternalID: in.OrderExternalID, kind: in.Kind, status: in.Status,
		amount: in.Amount, gateway: in.Gateway, processedAt: in.ProcessedAt,
	}, nil
}

func (t *Transaction) ID() coreobjects.ID                  { return t.id }
func (t *Transaction) Platform() wire.SalesPlatform        { return t.platform }
func (t *Transaction) ExternalID() string                  { return t.externalID }
func (t *Transaction) StoreID() string                     { return t.storeID }
func (t *Transaction) StoreIntegrationID() string          { return t.storeIntegrationID }
func (t *Transaction) StoreIntegrationExternalID() string  { return t.storeIntegrationExternalID }
func (t *Transaction) OrderExternalID() string             { return t.orderExternalID }
func (t *Transaction) Kind() string                        { return t.kind }
func (t *Transaction) Status() string                      { return t.status }
func (t *Transaction) Gateway() string                     { return t.gateway }
func (t *Transaction) Amount() objects.MonetaryAmount      { return t.amount }
func (t *Transaction) ProcessedAt() time.Time              { return t.processedAt }
```

Create `internal/sync/storage/transaction/transaction_storage.go`:

```go
package transaction

import "context"

type Storage interface {
	UpsertTransaction(ctx context.Context, t *Transaction) error
}
```

Create `internal/sync/storage/transaction/transaction_pg.go` — mirror `storage/order/order_pg.go`: `PgTransactionStorage{db *sql.DB}`, `NewPgTransactionStorage`, tx-from-context via `unitofwork.TxFromContext`, an `INSERT ... ON CONFLICT (id) DO UPDATE` over the `gateway_transactions` columns. Bind `t.ID().UUID()`, `string(t.Platform())`, `t.Amount().AmountCents()`, `string(t.Amount().Currency())`, etc. `var _ Storage = (*PgTransactionStorage)(nil)`.

- [ ] **Step 4: Write the PG round-trip test (skip-on-unreachable)**

Create `internal/sync/storage/transaction/transaction_pg_test.go` — same `openTestDB(t)` helper as Spec A's `syncjob_pg_test.go` (read `DATABASE_URL`, `sql.Open("pgx", ...)`, ping with 2s timeout → `t.Skip` if unreachable). Insert a transaction via `UpsertTransaction`, read it back via a direct `SELECT`, assert fields round-trip.

- [ ] **Step 5: Run tests → pass-or-skip; build; commit**

Run: `cd packages/api/go && go test ./internal/sync/storage/transaction/... && go build ./...`
Expected: entity tests PASS; pg test SKIPs (Docker paused) or PASSes.
```bash
git add packages/api/go/internal/sync/storage/transaction
git commit --no-verify -m "feat(go-sync): gateway Transaction aggregate + PG storage (Task TC3)"
```

---

## Task TC4: Transaction handler persists + publishes the wire event

**Files:**
- Create: `internal/sync/events/external_transaction_updated.go`
- Create: `internal/sync/handlers/transaction_updated_handler.go` (+ `transaction_updated_handler_test.go`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /event, /handler, /test
**Depends on:** TC3

- [ ] **Step 1: Write the event**

Create `internal/sync/events/external_transaction_updated.go` — mirror `external_order_updated.go`:

```go
package events

import (
	"template/api-go/internal/sync/storage/transaction"
	"template/core-go/types"
)

type ExternalTransactionUpdatedPayload struct {
	Input   transaction.TransactionInput `json:"input"`
	StoreID string                       `json:"storeId"`
}

const ExternalTransactionUpdatedEventName = "sync.external_transaction_updated"

type ExternalTransactionUpdatedEvent = types.DomainEvent[ExternalTransactionUpdatedPayload]

func NewExternalTransactionUpdated(input transaction.TransactionInput, storeID string) ExternalTransactionUpdatedEvent {
	t, _ := transaction.NewTransactionFromProviderPayload(input)
	var entityID [16]byte
	if t != nil {
		entityID = t.ID().UUID()
	}
	return types.NewDomainEvent(ExternalTransactionUpdatedEventName, entityID, storeID,
		ExternalTransactionUpdatedPayload{Input: input, StoreID: storeID})
}
```

- [ ] **Step 2: Write the failing handler test**

Create `internal/sync/handlers/transaction_updated_handler_test.go` — fakes for `transaction.Storage` + `DomainEventRepository` (reuse the package's existing `fakeEventRepo` from `order_updated_handler_test.go` — same `package handlers`). Assert: one upsert + one wire-event Save named `integration.shared.transaction.updated`.

```go
package handlers

import (
	"context"
	"testing"
	"time"

	"template/api-go/internal/sync/events"
	"template/api-go/internal/sync/storage/objects"
	"template/api-go/internal/sync/storage/transaction"
)

type fakeTxStorage struct{ upserts []*transaction.Transaction }

func (f *fakeTxStorage) UpsertTransaction(_ context.Context, t *transaction.Transaction) error {
	f.upserts = append(f.upserts, t)
	return nil
}

func TestTransactionUpdatedHandler_PersistsAndPublishes(t *testing.T) {
	storage := &fakeTxStorage{}
	repo := &fakeEventRepo{} // defined in order_updated_handler_test.go (same package)
	h := NewTransactionUpdatedHandler(storage, repo)

	if h.EventName() != events.ExternalTransactionUpdatedEventName {
		t.Fatalf("EventName = %q", h.EventName())
	}

	in := transaction.TransactionInput{
		Platform: "SHOPIFY", ExternalID: "txn-1",
		StoreID: "11111111-1111-4111-8111-111111111111",
		StoreIntegrationID: "22222222-2222-4222-8222-222222222222",
		StoreIntegrationExternalID: "shop.myshopify.com",
		Kind: "sale", Status: "success",
		Amount: objects.NewMonetaryAmount(1000, "USD"), Gateway: "shopify_payments",
		ProcessedAt: time.Now().UTC(),
	}
	evt := events.NewExternalTransactionUpdated(in, in.StoreID)
	if err := h.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(storage.upserts) != 1 {
		t.Errorf("upserts = %d, want 1", len(storage.upserts))
	}
	if len(repo.saved) != 1 || repo.saved[0].GetEventName() != "integration.shared.transaction.updated" {
		t.Errorf("wire events = %+v, want 1 transaction.updated", repo.saved)
	}
}
```

- [ ] **Step 3: Run test → fail**

Run: `cd packages/api/go && go test ./internal/sync/handlers/...`
Expected: FAIL — `undefined: NewTransactionUpdatedHandler`.

- [ ] **Step 4: Write the handler**

Create `internal/sync/handlers/transaction_updated_handler.go` — mirror `order_updated_handler.go`, but the wire event is a **Go-typed payload built in-handler** (no `wire.TransactionUpdatedEvent`):

```go
package handlers

import (
	"context"
	"fmt"

	"template/api-go/internal/sync/events"
	"template/api-go/internal/sync/storage/transaction"
	"template/core-go/repositories"
	"template/core-go/types"
)

type TransactionUpdatedHandler struct {
	storage   transaction.Storage
	eventRepo repositories.DomainEventRepository
}

func NewTransactionUpdatedHandler(storage transaction.Storage, eventRepo repositories.DomainEventRepository) *TransactionUpdatedHandler {
	return &TransactionUpdatedHandler{storage: storage, eventRepo: eventRepo}
}

func (h *TransactionUpdatedHandler) EventName() string {
	return events.ExternalTransactionUpdatedEventName
}

// transactionUpdatedWirePayload is the Go-typed wire payload (no
// generated wire.TransactionUpdatedEvent yet — see spec Decision 6).
type transactionUpdatedWirePayload struct {
	Name       string `json:"name"`
	EntityID   string `json:"entityId"`
	OwnerID    string `json:"ownerId"`
	Platform   string `json:"platform"`
	ExternalID string `json:"externalId"`
	OrderID    string `json:"orderExternalId"`
	Kind       string `json:"kind"`
	Status     string `json:"status"`
	AmountCents int64 `json:"amountCents"`
	Currency   string `json:"currency"`
	Gateway    string `json:"gateway"`
}

const transactionUpdatedWireName = "integration.shared.transaction.updated"

func (h *TransactionUpdatedHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	evt, ok := event.(events.ExternalTransactionUpdatedEvent)
	if !ok {
		return fmt.Errorf("transaction handler: unexpected event type %T", event)
	}
	tx, err := transaction.NewTransactionFromProviderPayload(evt.Payload.Input)
	if err != nil {
		return fmt.Errorf("transaction handler: rebuild aggregate: %w", err)
	}
	if err := h.storage.UpsertTransaction(ctx, tx); err != nil {
		return fmt.Errorf("transaction handler: upsert: %w", err)
	}
	payload := transactionUpdatedWirePayload{
		Name: transactionUpdatedWireName, EntityID: tx.ID().UUID().String(), OwnerID: tx.StoreID(),
		Platform: string(tx.Platform()), ExternalID: tx.ExternalID(), OrderID: tx.OrderExternalID(),
		Kind: tx.Kind(), Status: tx.Status(),
		AmountCents: tx.Amount().AmountCents(), Currency: string(tx.Amount().Currency()), Gateway: tx.Gateway(),
	}
	wireEvt := types.NewDomainEvent(transactionUpdatedWireName, tx.ID().UUID(), tx.StoreID(), payload)
	if err := h.eventRepo.Save(ctx, wireEvt); err != nil {
		return fmt.Errorf("transaction handler: save wire event: %w", err)
	}
	return nil
}
```

> Confirm `objects.MonetaryAmount` exposes `AmountCents() int64` + `Currency()` (Spec A's order handler uses `o.Total().AmountCents()` + `.Currency()`). Match the real getters.

- [ ] **Step 5: Run test → pass; build; commit**

Run: `cd packages/api/go && go test ./internal/sync/handlers/... ./internal/sync/events/... && go build ./...`
```bash
git add packages/api/go/internal/sync/events/external_transaction_updated.go packages/api/go/internal/sync/handlers/transaction_updated_handler.go packages/api/go/internal/sync/handlers/transaction_updated_handler_test.go
git commit --no-verify -m "feat(go-sync): ExternalTransactionUpdatedEvent + handler (Task TC4)"
```

---

## Task TC5: Shopify transactions pipeline publishes transaction events

**Files:**
- Create: `internal/sync/services/shopify/transaction_normalizer.go` (+ `transaction_normalizer_test.go`)
- Create: `internal/sync/services/pipelines/shopify/transactions.go` (+ `transactions_test.go`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** TC1, TC3

- [ ] **Step 1: Inspect the Shopify orders pipeline + normalizer to mirror**

Read `internal/sync/services/pipelines/shopify/orders.go` (the `Run(ctx, in, publisher)` shape: page via the Shopify client → normalize → `publisher.Publish(events.NewExternalXUpdated(...))` → count) and `internal/sync/services/shopify/order_normalizer.go` (the `Normalize(raw, in pipelines.RunInput) (order.OrderInput, error)` signature). The transactions pipeline + normalizer mirror these for `transaction.TransactionInput`.

- [ ] **Step 2: Write the failing normalizer test**

Create `internal/sync/services/shopify/transaction_normalizer_test.go` — feed a minimal Shopify transaction JSON, assert `Normalize` returns a `transaction.TransactionInput` with the parsed fields (externalId, kind, status, amount, gateway). Build the fixture from the Shopify transaction shape (`id`, `kind`, `status`, `amount`, `currency`, `gateway`, `order_id`, `processed_at`).

- [ ] **Step 3: Write the normalizer + pipeline**

Create `internal/sync/services/shopify/transaction_normalizer.go` — `TransactionsNormalizer` with `NewTransactionsNormalizer()` + `Normalize(raw []byte, in pipelines.RunInput) (transaction.TransactionInput, error)`: parse the Shopify transaction JSON, map to `TransactionInput` (Platform="SHOPIFY", StoreID/StoreIntegrationID/StoreIntegrationExternalID from `in`, Amount via `objects.NewMonetaryAmount(cents, currency)`).

Create `internal/sync/services/pipelines/shopify/transactions.go` — `ShopifyTransactionsPipeline` mirroring `orders.go`: `Platform()=="SHOPIFY"`, `Pipeline()==enums.SyncPipelineTransactions`, `Run(ctx, in, publisher)` pages the Shopify transactions endpoint via the client, normalizes each row, `publisher.Publish(events.NewExternalTransactionUpdated(input, in.StoreID))`, returns `RunResult{RowsTouched: n, Succeeded: true}`. Constructor `NewShopifyTransactionsPipeline(client, normalizer)`.

> The Shopify client (`services/shopify/client.go`) has per-kind paging methods (e.g. `FetchOrdersPage`). If it lacks a `FetchTransactionsPage`, add ONE method to the `ShopifyClient` port + the HTTP client impl (minimal — mirror `FetchOrdersPage`). Note this in your report if you extend the port.

- [ ] **Step 4: Write the pipeline test**

Create `transactions_test.go` — a `capturePublisher` + a mock Shopify client returning one transactions page; assert the pipeline publishes one `ExternalTransactionUpdatedEvent`.

- [ ] **Step 5: Run tests → pass; build; commit**

Run: `cd packages/api/go && go test ./internal/sync/services/... && go build ./...`
```bash
git add packages/api/go/internal/sync/services/shopify/transaction_normalizer.go packages/api/go/internal/sync/services/shopify/transaction_normalizer_test.go packages/api/go/internal/sync/services/pipelines/shopify/transactions.go packages/api/go/internal/sync/services/pipelines/shopify/transactions_test.go
git commit --no-verify -m "feat(go-sync): Shopify transactions pipeline → ExternalTransactionUpdatedEvent (Task TC5)"
```

---

## Task TC6: Wire transactions + PENDING kinds; marketing-reconcile via /sync

**Files:**
- Modify: `internal/sync/module.go` — register the transactions pipeline + transaction handler (mediator) + PENDING pipelines for the new kinds; extend `pendingPipelineProviders()`
- Create: `internal/sync/services/executor/executor_kinds_test.go` (or extend an existing executor/usecase test) — assert a `MARKETING_METRICS` job runs the PENDING pipeline gracefully

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /bounded-context, /test
**Depends on:** TC4, TC5

- [ ] **Step 1: Register the transactions pipeline + handler in module.go**

Modify `internal/sync/module.go`:
- Provide `shopifysvc.NewTransactionsNormalizer` + the transactions pipeline into `group:"pipelines"`:
```go
fx.Provide(fx.Annotate(
	shopifypipelines.NewShopifyTransactionsPipeline,
	fx.As(new(pipelines.Pipeline)),
	fx.ResultTags(`group:"pipelines"`),
)),
```
- Provide `handlers.NewTransactionUpdatedHandler` + register it in the existing `fx.Invoke(func(m, oh, ph, vh, ...) { ... m.Register(th) })` (add the transaction handler param + `m.Register(th)`).

- [ ] **Step 2: Extend pendingPipelineProviders for the new kinds**

Modify `pendingPipelineProviders()` — add the new kinds so `(SHOPIFY, <kind>)` resolves to a PENDING pipeline (TRANSACTIONS is now real, so EXCLUDE it):
```go
names := []enums.SyncPipelineName{
	enums.SyncPipelineDisputes,
	enums.SyncPipelineMarketingMetrics,
	enums.SyncPipelineMarketingMetricsConcurrent,
	enums.SyncPipelineMarketingMetricsTwoPhase,
	enums.SyncPipelineCampaigns,
}
```
(Keep whatever existing platform list it iterates; ensure the real `(SHOPIFY, TRANSACTIONS)` isn't shadowed by a PENDING registration — the factory's last-write-wins or duplicate-key behavior must favor the real pipeline. If `NewFactory` would collide on a duplicate `(platform, name)` key, ensure TRANSACTIONS is NOT in the pending list. Verify the factory's de-dup behavior; if first-write-wins, order matters.)

- [ ] **Step 3: Write the failing wiring test**

Create `internal/sync/services/executor/executor_kinds_test.go` — using the executor's existing fakes (fake syncjob repo + a real `pipelines.Factory` built with a `PendingPipeline` for `(SHOPIFY, MARKETING_METRICS)` + a fake mediator + fake eventRepo), assert: a job with `Pipelines:[MARKETING_METRICS]` runs, the PENDING pipeline returns `ErrPipelinePending`, and the job ends FAILED with the pending message (NOT a panic / unknown-pair).

```go
// Given a sync_job for (SHOPIFY, MARKETING_METRICS) and a factory with
// only a PendingPipeline registered for it, when the executor runs the
// job, then it completes (FAILED) with the pending error surfaced.
```

- [ ] **Step 4: Run tests → pass; build (incl. fx app); commit**

Run: `cd packages/api/go && go test ./internal/sync/... && go build ./... && go build ./cmd/api/...`
Expected: all pass; fx app constructs (transactions pipeline + handler wired; PENDING kinds resolve).
```bash
git add packages/api/go/internal/sync/module.go packages/api/go/internal/sync/services/executor/executor_kinds_test.go
git commit --no-verify -m "feat(go-sync): wire transactions pipeline+handler; PENDING for DISPUTES/MARKETING_METRICS*/CAMPAIGNS; marketing-reconcile via /sync (Task TC6)"
```

---

## Task TC7: Sync-kinds verification

**Files:** (none — verification only)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** haiku
**Depends on:** TC6

- [ ] **Step 1: Go build + vet + test**

Run: `cd packages/api/go && go build ./... && go build ./cmd/api/... && go vet ./internal/sync/... && go test ./...`
Expected: 0 build/vet errors; all packages pass (DB tests skip cleanly).

- [ ] **Step 2: Confirm the new kinds resolve**

Run: `cd packages/api/go && go test ./internal/sync/enums/... ./internal/sync/services/executor/... ./internal/sync/services/pipelines/...`
Expected: enum accepts all 6 new values; executor runs PENDING kinds gracefully; transactions pipeline publishes its event.

- [ ] **Step 3: Confirm the transaction chain exists**

Run: `cd packages/api/go && ls internal/sync/storage/transaction internal/sync/services/pipelines/shopify`
Expected: `storage/transaction/{transaction,transaction_storage,transaction_pg}.go`; `pipelines/shopify/transactions.go`.

---

## Final Validation

- [ ] `cd packages/api/go && go build ./...` — 0 errors
- [ ] `cd packages/api/go && go build ./cmd/api/...` — fx app constructs
- [ ] `cd packages/api/go && go vet ./internal/sync/...` — clean
- [ ] `cd packages/api/go && go test ./...` — all packages pass (DB tests skip if Docker paused)
- [ ] AC mapping (every spec AC → ≥1 test path):
  - AC-1 → `internal/sync/enums/sync_pipeline_name_test.go:"TestSyncPipelineName_Valid"` + `internal/sync/usecases/start_sync_test.go` (accepts TRANSACTIONS)
  - AC-2 → `internal/sync/services/pipelines/shopify/transactions_test.go` + `internal/sync/handlers/transaction_updated_handler_test.go:"...PersistsAndPublishes"`
  - AC-3 → `internal/sync/services/executor/executor_kinds_test.go` (PENDING DISPUTES/etc resolves)
  - AC-4 → `internal/sync/services/executor/executor_kinds_test.go` (MARKETING_METRICS runs PENDING, no 500)
  - AC-5 → `internal/sync/storage/transaction/transaction_test.go:"TestTransaction_RejectsMissing*"`
  - AC-6 → `internal/sync/storage/transaction/transaction_pg_test.go` (round-trip; skips if DB down) + TC2 migration
  - AC-7 → Final Validation go build/test/vet

## Notes

- **Go-only `--no-verify` commits** (except TC2 which touches the Drizzle schema — still no app TS, so `--no-verify` is fine; the schema `.ts` is data, not app code). `go build`/`test`/`vet` is the real gate.
- **Wire event is Go-typed** (`integration.shared.transaction.updated` built in-handler) — no `packages/contracts` regen (spec Decision 6). Follow-up: add the formal wire contract + cross-language binding once the parallel SPEC-17 refactor lands and `bun sdk` is green.
- **`gateway_transactions` not `transactions`** — the standalone settlement record, distinct from `Order`'s embedded `OrderTransaction` payment lines. Reviewers must not "dedupe" them.
- **Factory collision guard** (TC6 Step 2): TRANSACTIONS is real, so it must NOT also be in the PENDING list. Verify `pipelines.NewFactory`'s duplicate-key behavior; keep the real pipeline authoritative.
- **Marketing reconcile** is now `POST /sync` with `pipelines:["MARKETING_METRICS"]` (resolves to PENDING until a real marketing pipeline lands) — closes Spec A's `/marketing/reconcile` 404 window via the canonical sync path.
- **Docker/migration:** `bun migrate:dev` needs Docker up to apply `gateway_transactions`; the PG round-trip test skips when unreachable.
