# Go Backend Typing Hardening + Storage-Owned Channel Persistence — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`) syntax. Each Task wraps one observable behavior in an outer RED→GREEN cycle.
>
> **Toolchain note — this is a Go plan.** The repo's `/plan` defaults (Bun/Drizzle/tsyringe/TestBed, the TS code-graph CLI, `validate-plan`/`review-plan`) are TypeScript-only and do **not** apply. Use the Go toolchain throughout: `go build ./...`, `go test ./internal/...`, `go vet ./internal/...`. Working dir for all Go commands: `packages/api/go`. Integration tests that need Postgres follow the existing pattern (`transaction_pg_test.go`): acquire the DB, `t.Skip` if unreachable. The only `bun` commands are the SDK contract lock (`bun emit-openapi && bun sdk`).

**Goal:** Bring the Go service onto its own primitives (httputil decode/validate/respond, wire enums) and the reference's persistence pattern — typed webhook routing, a single canonical platform spelling, and wire events emitted as typed snapshots transactionally post-save from inside a storage-owned channel + batching pipeline, for all four canonical entities.

**Architecture:** Three phases gated by dependency. Phase 0 locks the type contract (enums + aggregate validation). Phase 1 converts controllers to `httputil`. Phase 2 types the webhook intake end-to-end + SDK contract lock. Phase 3 first **extracts the aggregates + value objects out of `/storage` into a flat `entities` package (+ `objects`)** so `storage/<entity>/` becomes purely the persistence port + impl (Task 12), then replaces synchronous per-row upserts with a storage-owned `chan<- []*entities.Entity` + generic `Accumulator`; `Storage.Save(batch)` does the bulk upsert **and** inserts the typed wire `*UpdatedEvent` into the outbox in **one `UnitOfWork` transaction**; handlers become construct-once-and-enqueue; the executor keeps sync (flush-barrier) and async (fire-and-flush) job modes.

**Tech Stack:** Go, `net/http`, `database/sql` + Postgres, `go.uber.org/fx`, `go-playground/validator/v10`, the in-repo `contracts-go/wire` enum catalog, stdlib `testing`.

**Spec:** .specs/2026-05-25-go-typing-and-storage-channel-design.md
**Tasks:** 17
**Estimated minutes:** 620

**Resolved spec Open Questions (adopted):** (1) Pipeline + webhook both publish `ExternalXUpdatedEvent`; the handler is the single entity-construction site. (2) Per-entity `*UpdatedEvent` only — no coarse batch event. (3) `EventName` + `WebhookPlatform` enums live in `internal/sync/enums`. (4) Sync flush barrier = a per-`Save` done signal the executor waits on (see Task 17). (5, D9) Aggregates move to a flat `internal/sync/entities` package and VOs to `internal/sync/objects`; `storage/<entity>/` keeps only the `Storage` interface + pg impl + `snapshot.go` (Task 12).

---

## File Structure

**Phase 0 — types & enums**
```
Create: internal/sync/enums/event_name.go
  Owns: typed EventName (the 4 sync.external_* names) + Valid() + ParseEventName
Modify: internal/sync/events/*.go — event-name consts reference enums.EventName* (one source)
Create: internal/sync/enums/webhook_platform.go
  Owns: typed WebhookPlatform (underscore spelling) + ParseWebhookPlatform
Modify: internal/sync/enums/sync_status.go — add Valid()
Modify: internal/sync/repositories/syncjob/syncjob_pg.go — scan guards status via Valid()
Modify: internal/sync/usecases/{start_sync,execute_sync,get_sync_status,list_sync_jobs}.go — Output.Status typed enums.SyncStatus
Modify: internal/sync/storage/transaction/transaction.go — kind/status/gateway → wire enums, validated in ctor
Modify: internal/sync/services/shopify/transaction_normalizer.go — map provider strings → wire enum values
Modify: internal/sync/entities/sync_job.go — Platform → wire.SalesPlatform, validated in NewSyncJob
Modify: internal/sync/usecases/start_sync.go — handle NewSyncJob error
Modify: internal/sync/storage/{order,product,product_variant}/*.go + order_line/order_transaction/order_transaction_fee — *Input enum fields → wire types
Modify: internal/sync/services/pipelines/pipeline.go + factory.go — Pipeline.Platform() → wire.SalesPlatform; factory key typed
Modify: internal/sync/services/pipelines/{shopify/*,pending_pipeline.go} — return typed platform
```

**Phase 1 — controllers → httputil**
```
Modify: internal/sync/controllers/{start_sync,list_sync_jobs,get_sync_status,cancel_sync,execute_sync,async_execute_sync,sync_controller}.go — typed request structs + DecodeRequest + RespondError/RespondJSON
Delete: internal/sync/controllers/response.go (writeJSON/writeErr/writeAppErr)
Delete: internal/sync/controllers/{extractJobID, extractLastPathSegment, errStr, errMissingJobID} (inline in the above files)
Modify: internal/integrations/controllers/handshake.go — DecodeRequest + typed Platform + Metadata Request/Response/Errors
```

**Phase 2 — webhook intake typed + contract lock**
```
Modify: internal/webhooks/mappers/{mapper,factory,pending}.go — interface returns + factory key on (WebhookPlatform, EventName)
Modify: internal/webhooks/mappers/shopify/order_updated.go — return typed Platform()/Event()
Modify: internal/webhooks/services/{webhook_verifier,webhook_factory,hmac_verifier,*_verifier}.go — Platform() → WebhookPlatform; factory key typed
Modify: internal/webhooks/module.go — verifier/mapper wiring + pendingMapperProviders use enum constants (underscore spelling)
Modify: internal/webhooks/services/webhook_received_event.go — Platform/Event typed; remove WebhookEventType
Modify: internal/webhooks/controllers/webhook.go — DecodeRequest typed request (platform+event oneof) + RespondError/RespondJSON
Modify: internal/webhooks/handlers/webhook_received_handler.go — factory.Get typed
Delete: internal/webhooks/controllers/response.go (writeError/writeAccepted)
Regen: public/openapi.json + packages/client/dist/** (SDK contract lock)
```

**Phase 3 — entity extraction, then storage-owned channel persistence**
```
Move:   internal/sync/storage/order/{order,order_line,order_transaction,order_transaction_fee}.go (+ tests) → internal/sync/entities/ (package entities)
Move:   internal/sync/storage/product/product.go, product_variant/product_variant.go, transaction/transaction.go (+ tests) → internal/sync/entities/
Move:   internal/sync/storage/objects/* → internal/sync/objects/ (package objects)
  Result: storage/<entity>/ keeps ONLY the Storage interface + pg impl (+ snapshot.go after Task 14)
Modify: internal/sync/{events,services/shopify,services/pipelines,handlers}/**, controllers, registry — imports order.X/product.X/... → entities.X; storage/objects → objects
Create: core/types/accumulator.go — generic Accumulator[T] + Saver[T]
Create: core/types/accumulator_test.go
Create: internal/sync/storage/order/snapshot.go — typed orderEntitySnapshot + JSONB line/transaction structs
Modify: internal/sync/storage/order/order_storage.go — Storage = InputChannel/Start/Close
Modify: internal/sync/storage/order/order_pg.go — channel + Accumulator + Save(batch) transactional upsert+outbox; typed serialise
Modify: internal/sync/handlers/order_updated_handler.go — construct once, enqueue; drop upsert + wire-event build
Modify: internal/sync/services/pipelines/shopify/orders.go — drop validate-then-discard pre-construction
Create: internal/sync/storage/{transaction,product,product_variant}/snapshot.go — typed snapshots
Modify: internal/sync/storage/{transaction,product,product_variant}/*_storage.go + *_pg.go — same channel model
Modify: internal/sync/handlers/{transaction,product,product_variant}_updated_handler.go — enqueue
Modify: internal/sync/module.go — fx Lifecycle OnStart→Start, OnStop→Close for the 4 storages; construct storages with UnitOfWork + DomainEventRepository
Modify: internal/sync/services/executor/executor.go — sync Execute flush-barrier; async ExecuteAsync fire-and-flush
```

---

## Task 1: The canonical event-name set is a typed enum

**Files:**
- Create: `internal/sync/enums/event_name.go`
- Modify: `internal/sync/events/external_order_updated.go` — name const references `enums.EventNameExternalOrderUpdated`
- Modify: `internal/sync/events/external_product_updated.go` — same
- Modify: `internal/sync/events/external_product_variant_updated.go` — same
- Modify: `internal/sync/events/external_transaction_updated.go` — same
- Test: `internal/sync/enums/event_name_test.go`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum (go)
**Depends on:** (none)

- [ ] **Step 1: Write the failing test**

```go
package enums

import "testing"

func TestParseEventName(t *testing.T) {
	cases := []struct {
		in      string
		want    EventName
		wantErr bool
	}{
		{"sync.external_order_updated", EventNameExternalOrderUpdated, false},
		{"sync.external_product_updated", EventNameExternalProductUpdated, false},
		{"sync.external_product_variant_updated", EventNameExternalProductVariantUpdated, false},
		{"sync.external_transaction_updated", EventNameExternalTransactionUpdated, false},
		{"orders/updated", "", true},
		{"", "", true},
	}
	for _, c := range cases {
		got, err := ParseEventName(c.in)
		if c.wantErr {
			if err == nil {
				t.Errorf("ParseEventName(%q) expected error, got %v", c.in, got)
			}
			continue
		}
		if err != nil || got != c.want {
			t.Errorf("ParseEventName(%q) = %v, %v; want %v", c.in, got, err, c.want)
		}
	}
}

func TestEventNameValid(t *testing.T) {
	if !EventNameExternalOrderUpdated.Valid() {
		t.Error("EventNameExternalOrderUpdated should be Valid")
	}
	if EventName("nope").Valid() {
		t.Error("unknown EventName should be invalid")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/sync/enums/ -run EventName`
Expected: FAIL — `undefined: EventName` / `undefined: ParseEventName`.

- [ ] **Step 3: Write minimal implementation**

```go
package enums

import "fmt"

// EventName is the closed set of canonical sync domain-event names.
// These are the names ExternalXUpdatedEvent are published under, and the
// values the webhook intake accepts in its ?event= query param — we own
// the registered webhook URL, so the param carries our canonical name,
// not the provider's topic.
type EventName string

const (
	EventNameExternalOrderUpdated          EventName = "sync.external_order_updated"
	EventNameExternalProductUpdated        EventName = "sync.external_product_updated"
	EventNameExternalProductVariantUpdated EventName = "sync.external_product_variant_updated"
	EventNameExternalTransactionUpdated    EventName = "sync.external_transaction_updated"
)

func (e EventName) Valid() bool {
	switch e {
	case EventNameExternalOrderUpdated, EventNameExternalProductUpdated,
		EventNameExternalProductVariantUpdated, EventNameExternalTransactionUpdated:
		return true
	}
	return false
}

func ParseEventName(s string) (EventName, error) {
	e := EventName(s)
	if !e.Valid() {
		return "", fmt.Errorf("invalid EventName: %q", s)
	}
	return e, nil
}
```

- [ ] **Step 4: Point the events package at the enum (single source)**

Modify each `internal/sync/events/external_*_updated.go` — change the local string literal to the enum constant. Example for `external_order_updated.go`:

```diff
- const ExternalOrderUpdatedEventName = "sync.external_order_updated"
+ const ExternalOrderUpdatedEventName = string(enums.EventNameExternalOrderUpdated)
```

Add `"template/api-go/internal/sync/enums"` to each file's imports. Repeat for product / product_variant / transaction with the matching `EventName*` constant.

- [ ] **Step 5: Run tests + build**

Run: `go test ./internal/sync/enums/ ./internal/sync/events/ && go build ./...`
Expected: PASS, build clean.

- [ ] **Step 6: Commit**

```bash
git add internal/sync/enums/event_name.go internal/sync/enums/event_name_test.go internal/sync/events/
git commit -m "feat(sync): typed EventName enum sourcing event names (Task 1)"
```

---

## Task 2: Webhook platform is a typed enum with one canonical spelling

**Files:**
- Create: `internal/sync/enums/webhook_platform.go`
- Test: `internal/sync/enums/webhook_platform_test.go`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum (go)
**Depends on:** (none)

- [ ] **Step 1: Write the failing test**

```go
package enums

import "testing"

func TestParseWebhookPlatform(t *testing.T) {
	ok := []struct {
		in   string
		want WebhookPlatform
	}{
		{"SHOPIFY", WebhookPlatformShopify},
		{"NUVEM_SHOP", WebhookPlatformNuvemShop},
		{"CART_PANDA", WebhookPlatformCartPanda},
		{"STRIPE", WebhookPlatformStripe},
		{"GOOGLE_ADS", WebhookPlatformGoogleAds},
	}
	for _, c := range ok {
		got, err := ParseWebhookPlatform(c.in)
		if err != nil || got != c.want {
			t.Errorf("ParseWebhookPlatform(%q) = %v, %v; want %v", c.in, got, err, c.want)
		}
	}
	// The old non-canonical spellings must be rejected (P3 regression guard).
	for _, bad := range []string{"NUVEMSHOP", "CARTPANDA", "", "shopify"} {
		if _, err := ParseWebhookPlatform(bad); err == nil {
			t.Errorf("ParseWebhookPlatform(%q) should error", bad)
		}
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/sync/enums/ -run WebhookPlatform`
Expected: FAIL — `undefined: WebhookPlatform`.

- [ ] **Step 3: Write minimal implementation**

```go
package enums

import "fmt"

// WebhookPlatform is the closed set of providers the webhook intake accepts.
// Canonical spelling is the underscore form, matching wire.SalesPlatform /
// wire.CheckoutPlatform — this is the single source resolving the previous
// NUVEMSHOP/NUVEM_SHOP and CARTPANDA/CART_PANDA split between the sync and
// webhooks modules.
type WebhookPlatform string

const (
	WebhookPlatformShopify   WebhookPlatform = "SHOPIFY"
	WebhookPlatformNuvemShop WebhookPlatform = "NUVEM_SHOP"
	WebhookPlatformCartPanda WebhookPlatform = "CART_PANDA"
	WebhookPlatformYampi     WebhookPlatform = "YAMPI"
	WebhookPlatformKiwify    WebhookPlatform = "KIWIFY"
	WebhookPlatformStripe    WebhookPlatform = "STRIPE"
	WebhookPlatformMeta      WebhookPlatform = "META"
	WebhookPlatformTikTok    WebhookPlatform = "TIKTOK"
	WebhookPlatformGoogleAds WebhookPlatform = "GOOGLE_ADS"
)

func (p WebhookPlatform) Valid() bool {
	switch p {
	case WebhookPlatformShopify, WebhookPlatformNuvemShop, WebhookPlatformCartPanda,
		WebhookPlatformYampi, WebhookPlatformKiwify, WebhookPlatformStripe,
		WebhookPlatformMeta, WebhookPlatformTikTok, WebhookPlatformGoogleAds:
		return true
	}
	return false
}

func ParseWebhookPlatform(s string) (WebhookPlatform, error) {
	p := WebhookPlatform(s)
	if !p.Valid() {
		return "", fmt.Errorf("invalid WebhookPlatform: %q", s)
	}
	return p, nil
}

// OneofTag is the space-separated value list for validator/v10 `oneof=`.
const WebhookPlatformOneof = "SHOPIFY NUVEM_SHOP CART_PANDA YAMPI KIWIFY STRIPE META TIKTOK GOOGLE_ADS"
```

- [ ] **Step 4: Run test + build**

Run: `go test ./internal/sync/enums/ && go build ./...`
Expected: PASS, build clean.

- [ ] **Step 5: Commit**

```bash
git add internal/sync/enums/webhook_platform.go internal/sync/enums/webhook_platform_test.go
git commit -m "feat(sync): typed WebhookPlatform enum, canonical underscore spelling (Task 2)"
```

---

## Task 3: A SyncJob with a corrupt status can't hydrate

**Files:**
- Modify: `internal/sync/enums/sync_status.go` — add `Valid()`
- Modify: `internal/sync/repositories/syncjob/syncjob_pg.go` — scan guards status via `Valid()`; replace hardcoded `'RUNNING'` literal
- Modify: `internal/sync/usecases/start_sync.go` — `StartSyncOutput.Status` → `enums.SyncStatus`
- Modify: `internal/sync/usecases/execute_sync.go` — `ExecuteSyncOutput.Status` → `enums.SyncStatus`
- Modify: `internal/sync/usecases/get_sync_status.go` — `GetSyncStatusOutput.Status` → `enums.SyncStatus`
- Modify: `internal/sync/usecases/list_sync_jobs.go` — `SyncJobSummary.Status` → `enums.SyncStatus`
- Test: `internal/sync/enums/sync_status_test.go`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum (go), /repository (go)
**Depends on:** (none)

- [ ] **Step 1: Write the failing test**

```go
package enums

import "testing"

func TestSyncStatusValid(t *testing.T) {
	for _, s := range []SyncStatus{
		SyncStatusPending, SyncStatusRunning, SyncStatusCompleted,
		SyncStatusFailed, SyncStatusCancelled,
	} {
		if !s.Valid() {
			t.Errorf("%q should be Valid", s)
		}
	}
	if SyncStatus("BOGUS").Valid() {
		t.Error("unknown SyncStatus should be invalid")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/sync/enums/ -run SyncStatusValid`
Expected: FAIL — `s.Valid undefined`.

- [ ] **Step 3: Add `Valid()`**

Modify `internal/sync/enums/sync_status.go` — append:

```go
func (s SyncStatus) Valid() bool {
	switch s {
	case SyncStatusPending, SyncStatusRunning, SyncStatusCompleted,
		SyncStatusFailed, SyncStatusCancelled:
		return true
	}
	return false
}
```

- [ ] **Step 4: Guard the scan path + kill the literal**

Modify `internal/sync/repositories/syncjob/syncjob_pg.go`:
- In `scanInto` (the row→entity hydration), after reading the raw `status` string:

```go
st := enums.SyncStatus(statusStr)
if !st.Valid() {
    return nil, fmt.Errorf("syncjob: unknown status %q", statusStr)
}
```
- Replace the hardcoded `status = 'RUNNING'` in the `FindRunning` query with a parameter bound to `string(enums.SyncStatusRunning)` (use the existing `$n` placeholder convention in that file).

- [ ] **Step 5: Type the output DTOs**

In each of the four use-case files, change `Status string` → `Status enums.SyncStatus` on the `*Output` / `SyncJobSummary` struct, and the assignment site reads `job.Status` (already typed `enums.SyncStatus` on the entity). JSON output is unchanged (named string type marshals to the same string).

- [ ] **Step 6: Run tests + build + vet**

Run: `go test ./internal/sync/... && go build ./... && go vet ./internal/sync/...`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add internal/sync/enums/sync_status.go internal/sync/enums/sync_status_test.go internal/sync/repositories/syncjob/ internal/sync/usecases/
git commit -m "feat(sync): SyncStatus.Valid() guards hydration + typed status DTOs (Task 3)"
```

---

## Task 4: A Transaction rejects an invalid kind/status/gateway

**Files:**
- Modify: `internal/sync/storage/transaction/transaction.go` — `kind`/`status`/`gateway` fields + `TransactionInput` + ctor validation + accessors → wire enums
- Modify: `internal/sync/storage/transaction/transaction_pg.go` — accessor casts (`string(t.Kind())` etc.) at the SQL bind sites
- Modify: `internal/sync/services/shopify/transaction_normalizer.go` — map provider strings → wire enum values
- Modify: `internal/sync/handlers/transaction_updated_handler.go` — `transactionUpdatedWirePayload` fields → wire enums (drop `string()` casts at build site; JSON marshals identically)
- Test: `internal/sync/storage/transaction/transaction_test.go` — invalid-enum cases

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity (go), /service (go)
**Depends on:** (none)

- [ ] **Step 1: Write the failing test**

Add to `internal/sync/storage/transaction/transaction_test.go`:

```go
func TestNewTransaction_RejectsInvalidEnums(t *testing.T) {
	base := validTransactionInput() // existing helper; uses canonical UPPERCASE values
	bad := base
	bad.Kind = "not-a-kind"
	if _, err := NewTransactionFromProviderPayload(bad); err == nil {
		t.Error("expected error for invalid kind")
	}
	bad = base
	bad.Status = "weird"
	if _, err := NewTransactionFromProviderPayload(bad); err == nil {
		t.Error("expected error for invalid status")
	}
	bad = base
	bad.Gateway = "???"
	if _, err := NewTransactionFromProviderPayload(bad); err == nil {
		t.Error("expected error for invalid gateway")
	}
}
```

> If the existing tests pass lowercase `"sale"`/`"success"`, update those fixtures to the canonical wire values (`string(wire.TransactionKindSALE)`, `string(wire.TransactionStatusSUCCESS)`, a valid `wire.PaymentGateway`). The normalizer (Step 4) is what maps provider casing → canonical, so the aggregate only ever receives canonical input.

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/sync/storage/transaction/ -run RejectsInvalidEnums`
Expected: FAIL — constructor currently accepts any non-empty string.

- [ ] **Step 3: Type + validate the aggregate**

Modify `internal/sync/storage/transaction/transaction.go`:
- Struct fields: `kind wire.TransactionKind`, `status wire.TransactionStatus`, `gateway wire.PaymentGateway`.
- `TransactionInput`: keep `Kind/Status/Gateway string` (raw boundary).
- In `NewTransactionFromProviderPayload`, replace the combined non-empty check with:

```go
kind, err := wire.ParseTransactionKind(in.Kind)
if err != nil {
	return nil, fmt.Errorf("%w: %v", ErrTxInvalidKind, err)
}
status, err := wire.ParseTransactionStatus(in.Status)
if err != nil {
	return nil, fmt.Errorf("%w: %v", ErrTxInvalidStatus, err)
}
gateway, err := wire.ParsePaymentGateway(in.Gateway)
if err != nil {
	return nil, fmt.Errorf("%w: %v", ErrTxInvalidGateway, err)
}
```
- Add error sentinels `ErrTxInvalidKind`, `ErrTxInvalidStatus`, `ErrTxInvalidGateway` (replace `ErrTxMissingKindStatus`).
- Accessors: `Kind() wire.TransactionKind`, `Status() wire.TransactionStatus`, `Gateway() wire.PaymentGateway`.

- [ ] **Step 4: Map provider strings in the normalizer**

Modify `internal/sync/services/shopify/transaction_normalizer.go` — where it currently passes `Kind: rt.Kind, Status: rt.Status, Gateway: rt.Gateway`, route through small mapping helpers that uppercase/normalize Shopify's values to the canonical wire strings (mirror `order_normalizer.mapGateway` / `mapFinancialStatus`). Output stays `TransactionInput` with canonical strings.

- [ ] **Step 5: Fix the bind sites + wire payload**

- `transaction_pg.go`: at the SQL bind, use `string(t.Kind())`, `string(t.Status())`, `string(t.Gateway())`.
- `transaction_updated_handler.go`: change `transactionUpdatedWirePayload` fields `Platform/Kind/Status/Gateway/Currency` to their wire enum types; at the build site assign the typed accessors directly (drop `string(...)`).

- [ ] **Step 6: Run tests + build + vet**

Run: `go test ./internal/sync/storage/transaction/ ./internal/sync/services/shopify/ ./internal/sync/handlers/ && go build ./... && go vet ./internal/sync/...`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add internal/sync/storage/transaction/ internal/sync/services/shopify/transaction_normalizer.go internal/sync/handlers/transaction_updated_handler.go
git commit -m "feat(sync): Transaction validates kind/status/gateway via wire enums (Task 4)"
```

---

## Task 5: A SyncJob rejects an invalid platform at construction

**Files:**
- Modify: `internal/sync/entities/sync_job.go` — `Platform` field → `wire.SalesPlatform`; `NewSyncJob` parses + returns error; `ReconstructSyncJob` takes the typed value
- Modify: `internal/sync/usecases/start_sync.go` — handle the `NewSyncJob` error
- Modify: `internal/sync/repositories/syncjob/syncjob_pg.go` — reconstruct with parsed platform
- Test: `internal/sync/entities/sync_job_test.go`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity (go)
**Depends on:** (none)

- [ ] **Step 1: Write the failing test**

```go
func TestNewSyncJob_RejectsInvalidPlatform(t *testing.T) {
	p := validNewSyncJobParams()
	p.Platform = "NOT_A_PLATFORM"
	if _, err := NewSyncJob(p); err == nil {
		t.Error("expected error for invalid platform")
	}
}
```

(Update the existing happy-path fixture so `Platform` is `"SHOPIFY"` / `"NUVEM_SHOP"`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/sync/entities/ -run RejectsInvalidPlatform`
Expected: FAIL — `NewSyncJob` doesn't validate platform.

- [ ] **Step 3: Type + validate**

Modify `internal/sync/entities/sync_job.go`:
- `SyncJob.Platform wire.SalesPlatform`.
- `NewSyncJobParams.Platform string` (boundary); in `NewSyncJob`:

```go
platform, err := wire.ParseSalesPlatform(p.Platform)
if err != nil {
	return nil, coreerrors.NewBaseError(ctxerrors.CodeInvalidPlatform, "invalid platform: "+p.Platform)
}
```
Add `CodeInvalidPlatform` to `internal/sync/errors` if absent.
- `ReconstructSyncJobParams.Platform wire.SalesPlatform` (already validated when first persisted).

- [ ] **Step 4: Fix callers**

- `usecases/start_sync.go`: `NewSyncJob` now returns `(*SyncJob, error)` — propagate the error.
- `repositories/syncjob/syncjob_pg.go`: parse the scanned platform string into `wire.SalesPlatform` (guard with the parse error) before `ReconstructSyncJob`.

- [ ] **Step 5: Run tests + build**

Run: `go test ./internal/sync/entities/ ./internal/sync/usecases/ ./internal/sync/repositories/... && go build ./...`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add internal/sync/entities/sync_job.go internal/sync/usecases/start_sync.go internal/sync/repositories/syncjob/ internal/sync/errors/
git commit -m "feat(sync): SyncJob validates platform via wire.SalesPlatform (Task 5)"
```

---

## Task 6: Pipeline + Input platform/enum fields are typed

**Files:**
- Modify: `internal/sync/services/pipelines/pipeline.go` — `Platform() wire.SalesPlatform`
- Modify: `internal/sync/services/pipelines/factory.go` — key on `wire.SalesPlatform`
- Modify: `internal/sync/services/pipelines/pending_pipeline.go` — typed platform field/return
- Modify: `internal/sync/services/pipelines/shopify/*.go` — `Platform()` returns `wire.SalesPlatformSHOPIFY`
- Modify: `internal/sync/services/executor/executor.go` — `factory.Get(job.Platform, name)` now passes the typed `wire.SalesPlatform`
- Modify: `internal/sync/storage/order/order.go`, `order_line.go`, `order_transaction.go`, `order_transaction_fee.go`, `product/product.go`, `product_variant/product_variant.go` — `*Input` enum fields → wire types
- Test: covered by existing aggregate construction tests + `go build` (typing change)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service (go), /entity (go)
**Depends on:** (none)

- [ ] **Step 1: Type the pipeline interface + factory**

Modify `internal/sync/services/pipelines/pipeline.go`:
```diff
- Platform() string
+ Platform() wire.SalesPlatform
```
Add the `wire` import. Modify `factory.go` so its internal key uses `wire.SalesPlatform` (e.g. `key(platform wire.SalesPlatform, name enums.SyncPipelineName) string`); `Get(platform wire.SalesPlatform, name enums.SyncPipelineName)`. Update `pending_pipeline.go` to store/return `wire.SalesPlatform`. Update each `shopify/*.go` pipeline's `Platform()` to `return wire.SalesPlatformSHOPIFY`.

- [ ] **Step 2: Type the `*Input` enum fields**

Apply, per struct (the constructor already calls `wire.Parse*`, so only the field type + the parse-input plumbing changes — keep the *raw provider* fields `string` where the normalizer fills them; type the *post-parse* aggregate fields. Where the spec's D4 lists `*Input.Platform` etc., type them to the wire enum and have the normalizer emit the typed value):

- `OrderInput.Platform → wire.SalesPlatform`, `PaymentStatus → wire.PaymentStatus`, `PaymentMethod → wire.PaymentMethod`, `PaymentGateway → wire.PaymentGateway`
- `OrderLineInput.Platform → wire.SalesPlatform`
- `OrderTransactionInput.Kind → wire.TransactionKind`, `Status → wire.TransactionStatus`, `DisputeStatus → *wire.DisputeStatus`
- `OrderTransactionFeeInput.Type → wire.OrderTransactionFeeType`
- `ProductInput.Platform → wire.SalesPlatform`, `Status → wire.ProductStatus`
- `ProductVariantInput.Platform → wire.SalesPlatform`

> The normalizers (`order_normalizer.go`, etc.) build these Inputs — update them to emit typed values (they already compute the canonical string via `mapGateway`/`mapFinancialStatus`; wrap those returns in the wire `Parse*`/typed value). Keep `mapGateway` returning `wire.PaymentGateway` (Agent-flagged GAP-6).

- [ ] **Step 3: Run the aggregate tests + build + vet**

Run: `go test ./internal/sync/storage/... ./internal/sync/services/... && go build ./... && go vet ./internal/sync/...`
Expected: PASS, clean.

- [ ] **Step 4: Commit**

```bash
git add internal/sync/services/pipelines/ internal/sync/services/executor/executor.go internal/sync/services/shopify/ internal/sync/storage/order/ internal/sync/storage/product/ internal/sync/storage/product_variant/
git commit -m "feat(sync): typed Pipeline.Platform + typed *Input enum fields (Task 6)"
```

---

## Task 7: Sync controllers validate + respond through httputil

**Files:**
- Modify: `internal/sync/controllers/start_sync.go`, `list_sync_jobs.go`, `get_sync_status.go`, `cancel_sync.go`, `execute_sync.go`, `async_execute_sync.go`, `sync_controller.go` — typed request structs + `DecodeRequest` + `RespondError`/`RespondJSON`
- Delete: `internal/sync/controllers/response.go`
- Test: `internal/sync/controllers/sync_controller_test.go` — updated; add a validation-rejection test

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /controller (go), /schema (go)
**Depends on:** 3, 6

- [ ] **Step 1: Write the failing test (path-param + validation behavior)**

Add to `sync_controller_test.go`:

```go
func TestGetSyncStatus_InvalidIDReturns400(t *testing.T) {
	ctrl := NewGetSyncStatusController(/* nil usecase ok — validation fails before use */ nil)
	req := httptest.NewRequest(http.MethodGet, "/sync/jobs/not-a-uuid", nil)
	req.SetPathValue("id", "not-a-uuid")
	w := httptest.NewRecorder()
	ctrl.Handle(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/sync/controllers/ -run InvalidIDReturns400`
Expected: FAIL — controller currently parses the path by hand and doesn't validate UUID at the boundary.

- [ ] **Step 3: Convert each controller (inner cycle per controller)**

For the path-param controllers (`get_sync_status`, `cancel_sync`, `execute_sync`, `async_execute_sync`) define:

```go
type <Name>Request struct {
	JobID string `from:"param" name:"id" validate:"required,uuid"`
}
```
and replace the body of `Handle` with:
```go
req, err := httputil.DecodeRequest[<Name>Request](r)
if err != nil {
	httputil.RespondError(w, err)
	return
}
// ... uc.Execute(r.Context(), usecases.<Input>{JobID: req.JobID})
// success: httputil.RespondJSON(w, <status>, out)   // or w.WriteHeader for 204
```
Set `Metadata().Request = <Name>Request{}`.

For `start_sync` (body):
```go
type StartSyncRequest struct {
	StoreID            string                   `from:"body" json:"storeId"            validate:"required,uuid"`
	StoreIntegrationID string                   `from:"body" json:"storeIntegrationId" validate:"required,uuid"`
	Platform           string                   `from:"body" json:"platform"           validate:"required,oneof=SHOPIFY NUVEM_SHOP"`
	Pipelines          []enums.SyncPipelineName  `from:"body" json:"pipelines"          validate:"omitempty,dive,oneof=ORDERS PRODUCTS PRODUCT_VARIANTS TRANSACTIONS DISPUTES MARKETING_METRICS MARKETING_METRICS_CONCURRENT MARKETING_METRICS_TWO_PHASE CAMPAIGNS"`
}
```

For `list_sync_jobs` (query):
```go
type ListSyncJobsRequest struct {
	StoreID string `from:"query" name:"storeId" validate:"required,uuid"`
	Limit   int    `from:"query" name:"limit"   validate:"omitempty,min=0,max=100"`
}
```

For `sync_controller.go` (back-compat `POST /sync`): the body has `map[string]string` Credentials + `*int` WindowDays — `DecodeRequest` body-decodes each field via `json.Unmarshal`, which handles maps and pointers, so the typed struct works. Replace every hand-rolled `w.WriteHeader + json.NewEncoder` with `RespondError`/`RespondJSON`; type `Platform` with `oneof`; add `Errors` to `Metadata`. Replace the `execOut.Status == string(enums.SyncStatusCompleted)` comparison with `execOut.Status == enums.SyncStatusCompleted` (Output.Status is now typed from Task 3).

Delete the `extractJobID`/`extractLastPathSegment`/`errStr`/`errMissingJobID` helpers from wherever they're defined.

- [ ] **Step 4: Delete the local response helpers**

```bash
git rm internal/sync/controllers/response.go
```
Fix any remaining references (there should be none after Step 3).

- [ ] **Step 5: Run tests + build + vet**

Run: `go test ./internal/sync/controllers/ && go build ./... && go vet ./internal/sync/...`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add internal/sync/controllers/
git commit -m "refactor(sync): controllers use httputil DecodeRequest + RespondError/JSON (Task 7)"
```

---

## Task 8: Handshake controller validates a typed platform

**Files:**
- Modify: `internal/integrations/controllers/handshake.go` — `DecodeRequest` + typed `Platform` (wire.SalesPlatform) + `oneof` + `Metadata` Request/Response/Errors
- Test: `internal/integrations/controllers/handshake_test.go` — invalid platform → 400

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /controller (go), /schema (go)
**Depends on:** (none)

- [ ] **Step 1: Write the failing test**

```go
func TestHandshake_InvalidPlatform400(t *testing.T) {
	ctrl := NewHandshakeController()
	body := `{"platform":"FOOBAR","credentials":{"k":"v"}}`
	req := httptest.NewRequest(http.MethodPost, "/integrations/handshake", strings.NewReader(body))
	w := httptest.NewRecorder()
	ctrl.Handle(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/integrations/controllers/ -run InvalidPlatform400`
Expected: FAIL — `"FOOBAR"` is currently accepted and hashed.

- [ ] **Step 3: Convert to DecodeRequest + typed request**

```go
type HandshakeRequest struct {
	Platform    wire.SalesPlatform `from:"body" json:"platform"    validate:"required,oneof=SHOPIFY NUVEM_SHOP"`
	Credentials map[string]string  `from:"body" json:"credentials" validate:"required"`
}

type HandshakeResponse struct {
	Succeeded           bool                        `json:"succeeded"`
	ExternalID          string                      `json:"externalId"`
	MarketingAdAccounts []marketingAdAccountSummary `json:"marketingAdAccounts"`
}
```
`Handle`: `DecodeRequest[HandshakeRequest]` → on success `RespondJSON(w, 200, HandshakeResponse{...ExternalID: deterministicExternalID(string(req.Platform), req.Credentials)...})`. `Metadata()` sets `Request: HandshakeRequest{}`, `Response: HandshakeResponse{}`, `Status: 200`, `Errors: [...]`.

- [ ] **Step 4: Run tests + build**

Run: `go test ./internal/integrations/controllers/ && go build ./...`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add internal/integrations/controllers/handshake.go internal/integrations/controllers/handshake_test.go
git commit -m "refactor(integrations): handshake uses DecodeRequest + typed platform (Task 8)"
```

---

## Task 9: Webhook routing is keyed on typed (platform, event)

**Files:**
- Modify: `internal/webhooks/mappers/mapper.go` — `Platform() enums.WebhookPlatform`, `Event() enums.EventName`
- Modify: `internal/webhooks/mappers/factory.go` — `Get(p WebhookPlatform, e EventName)`; typed key
- Modify: `internal/webhooks/mappers/pending.go` — typed fields/ctor
- Modify: `internal/webhooks/mappers/shopify/order_updated.go` — `Platform()`/`Event()` typed (returns `EventNameExternalOrderUpdated`)
- Modify: `internal/webhooks/services/webhook_verifier.go`, `webhook_factory.go`, `hmac_verifier.go`, `shopify_verifier.go`, `stripe_verifier.go`, `meta_verifier.go`, `tiktok_verifier.go`, `google_ads_verifier.go` — `Platform() enums.WebhookPlatform`; factory keyed on it
- Modify: `internal/webhooks/module.go` — verifier ctors + `pendingMapperProviders` use enum constants
- Test: `internal/webhooks/mappers/factory_test.go` — typed lookups; assert `NUVEM_SHOP` spelling

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service (go), /event (go)
**Depends on:** 1, 2

- [ ] **Step 1: Update the failing test**

In `factory_test.go`, register a fake mapper with `Platform()==enums.WebhookPlatformShopify`, `Event()==enums.EventNameExternalOrderUpdated`, and assert `Get(WebhookPlatformShopify, EventNameExternalOrderUpdated)` resolves it and `Get(WebhookPlatformNuvemShop, ...)` returns the pending error. Add an assertion that no `"NUVEMSHOP"`/`"CARTPANDA"` literal is used (the pending pairs now use `enums.WebhookPlatformNuvemShop`).

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/webhooks/mappers/`
Expected: FAIL — interfaces still `string`.

- [ ] **Step 3: Type the interfaces, factories, pending pairs**

- `mapper.go`: `Platform() enums.WebhookPlatform`, `Event() enums.EventName`.
- `factory.go`: `mappers map[string]WebhookMapper`; `key(p enums.WebhookPlatform, e enums.EventName) string { return string(p)+":"+string(e) }`; `Get(p enums.WebhookPlatform, e enums.EventName) (WebhookMapper, error)`.
- `pending.go`: `PendingMapper{platform enums.WebhookPlatform; event enums.EventName}`; `NewPendingMapper(p enums.WebhookPlatform, e enums.EventName)`.
- `shopify/order_updated.go`: `Platform() { return enums.WebhookPlatformShopify }`, `Event() { return enums.EventNameExternalOrderUpdated }`.
- `services/webhook_verifier.go`: `Platform() enums.WebhookPlatform`. Each concrete verifier returns the typed constant; `HMACVerifier` stores `enums.WebhookPlatform` and `NewHMACVerifier(platform enums.WebhookPlatform, ...)`.
- `webhook_factory.go`: `verifiers map[enums.WebhookPlatform]WebhookVerifier`; `Get(p enums.WebhookPlatform)`.
- `module.go`: replace string literals `"NUVEMSHOP"`/`"CARTPANDA"`/etc. with enum constants (underscore spelling); rewrite `pendingMapperProviders` `[][2]string` as `[]struct{Platform enums.WebhookPlatform; Event enums.EventName}` and map provider topics to canonical event names (e.g. Shopify `products/update` registration → `enums.EventNameExternalProductUpdated`).

- [ ] **Step 4: Run tests + build + vet**

Run: `go test ./internal/webhooks/... && go build ./... && go vet ./internal/webhooks/...`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add internal/webhooks/mappers/ internal/webhooks/services/ internal/webhooks/module.go
git commit -m "refactor(webhooks): typed (WebhookPlatform, EventName) routing; kill spelling split (Task 9)"
```

---

## Task 10: Webhook intake validates platform+event and stores a typed payload

**Files:**
- Modify: `internal/webhooks/services/webhook_received_event.go` — `Platform enums.WebhookPlatform`, `Event enums.EventName`; remove `WebhookEventType`
- Modify: `internal/webhooks/controllers/webhook.go` — `DecodeRequest` typed request (`oneof` platform+event) + `RespondError`/`RespondJSON`
- Modify: `internal/webhooks/handlers/webhook_received_handler.go` — `factory.Get(evt.Payload.Platform, evt.Payload.Event)` typed
- Delete: `internal/webhooks/controllers/response.go`
- Test: `internal/webhooks/controllers/webhook_test.go` — typed assertions; new invalid-platform / invalid-event 400 tests

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /controller (go), /schema (go), /event (go)
**Depends on:** 9

- [ ] **Step 1: Update + extend the failing tests**

In `webhook_test.go`: change the verified-event assertions to the typed enum (`evt.Payload.Platform != enums.WebhookPlatformShopify`); the query strings now use `event=sync.external_order_updated` (canonical name, not `orders/updated`); `fakeVerifier.Platform()` returns `enums.WebhookPlatformShopify`. Add:

```go
func TestWebhook_InvalidEvent400(t *testing.T) {
	ctrl, repo := buildController(true)
	w := fireRequest(ctrl, "platform=SHOPIFY&event=bogus&integrationId=int-1&storeId=store-1", "{}")
	if w.Code != http.StatusBadRequest { t.Errorf("status=%d want 400", w.Code) }
	if len(repo.saved) != 0 { t.Errorf("saved=%d want 0", len(repo.saved)) }
}
```
(and an analogous `TestWebhook_InvalidPlatform400`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/webhooks/controllers/`
Expected: FAIL — payload still `string`, no `oneof` validation.

- [ ] **Step 3: Typed payload (remove dead field)**

Modify `webhook_received_event.go`:
```go
type WebhookReceivedPayload struct {
	Platform        enums.WebhookPlatform `json:"platform"`
	Event           enums.EventName       `json:"event"`
	IntegrationID   string                `json:"integrationId"`
	ExternalEventID string                `json:"externalEventId"`
	RawBody         string                `json:"rawBody"`
	StoreID         string                `json:"storeId"`
}
```
(`WebhookEventType` removed.)

- [ ] **Step 4: Controller → DecodeRequest**

```go
type WebhookRequest struct {
	Platform      enums.WebhookPlatform `from:"query" name:"platform"      validate:"required,oneof=SHOPIFY NUVEM_SHOP CART_PANDA YAMPI KIWIFY STRIPE META TIKTOK GOOGLE_ADS"`
	Event         enums.EventName       `from:"query" name:"event"         validate:"required,oneof=sync.external_order_updated sync.external_product_updated sync.external_product_variant_updated sync.external_transaction_updated"`
	IntegrationID string                `from:"query" name:"integrationId" validate:"required"`
	StoreID       string                `from:"query" name:"storeId"       validate:"required"`
}
```
`Handle`: `DecodeRequest[WebhookRequest]` → `verifiers.Get(req.Platform)` (typed) → read body → verify → build `WebhookReceivedPayload{Platform: req.Platform, Event: req.Event, ...}` (drop the `WebhookEventType` assignment) → `events.Save` → `RespondJSON(w, http.StatusAccepted, WebhookAcceptedResponse{...})`. On unknown platform from the factory, `RespondError(w, coreerrors.NewBaseError(ctxerrors.CodeUnknownPlatform, "unknown platform"))`. Set `Metadata().Request = WebhookRequest{}` + `Errors`.

- [ ] **Step 5: Handler + delete response.go**

`webhook_received_handler.go`: `h.factory.Get(evt.Payload.Platform, evt.Payload.Event)` (both typed now). Then `git rm internal/webhooks/controllers/response.go` and define a small `WebhookAcceptedResponse` struct in `webhook.go` for the 202 body.

- [ ] **Step 6: Run tests + build + vet**

Run: `go test ./internal/webhooks/... && go build ./... && go vet ./internal/webhooks/...`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add internal/webhooks/
git commit -m "refactor(webhooks): typed intake via DecodeRequest; drop dead WebhookEventType (Task 10)"
```

---

## Task 11: Contract Lock — regenerate OpenAPI + SDK

**Files:**
- Regen: `packages/api/go/public/openapi.json`
- Regen: `packages/client/dist/**`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** 7, 8, 10

- [ ] **Step 1: Regenerate**

From repo root: `bun emit-openapi && bun sdk`
Expected: completes without error.

- [ ] **Step 2: Verify regen touched the changed endpoints**

Run: `git diff --stat packages/api/go/public/openapi.json packages/client/`
Expected: openapi.json changed (webhook query params, handshake request/response, sync request schemas); client dist changed.

- [ ] **Step 3: Type-check the TS consumers**

From repo root: `bun tsc`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add packages/api/go/public/openapi.json packages/client/
git commit -m "chore(sdk): regenerate openapi+sdk for typed Go controllers (Task 11)"
```

---

## Task 12: Extract aggregates + value objects out of /storage into /entities and /objects

> Pure structural refactor (no behavior change) — the seam that makes `storage/<entity>/` "just the port + impl." Verification is build + full test suite green (the moved tests carry over), not a new RED→GREEN cycle.

**Files:**
- Move: `internal/sync/storage/order/{order,order_line,order_transaction,order_transaction_fee}.go` (+ `*_test.go`) → `internal/sync/entities/`
- Move: `internal/sync/storage/product/product.go` (+ test) → `internal/sync/entities/product.go`
- Move: `internal/sync/storage/product_variant/product_variant.go` (+ test) → `internal/sync/entities/product_variant.go`
- Move: `internal/sync/storage/transaction/transaction.go` (+ test) → `internal/sync/entities/transaction.go`
- Move: `internal/sync/storage/objects/*` → `internal/sync/objects/`
- Modify: all importers — `events/`, `services/shopify/`, `services/pipelines/`, `handlers/`, `controllers/`, `registry`/`module.go`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity (go), /value-object (go)
**Depends on:** 3, 4, 5, 6

- [ ] **Step 1: Move the aggregate files (git mv, preserve history)**

```bash
cd packages/api/go
git mv internal/sync/storage/order/order.go                 internal/sync/entities/order.go
git mv internal/sync/storage/order/order_test.go            internal/sync/entities/order_test.go
git mv internal/sync/storage/order/order_line.go            internal/sync/entities/order_line.go
git mv internal/sync/storage/order/order_line_test.go       internal/sync/entities/order_line_test.go
git mv internal/sync/storage/order/order_transaction.go     internal/sync/entities/order_transaction.go
git mv internal/sync/storage/order/order_transaction_test.go internal/sync/entities/order_transaction_test.go
git mv internal/sync/storage/order/order_transaction_fee.go internal/sync/entities/order_transaction_fee.go
git mv internal/sync/storage/product/product.go             internal/sync/entities/product.go
git mv internal/sync/storage/product_variant/product_variant.go internal/sync/entities/product_variant.go
git mv internal/sync/storage/transaction/transaction.go     internal/sync/entities/transaction.go
# value objects
mkdir -p internal/sync/objects
git mv internal/sync/storage/objects/*.go                   internal/sync/objects/
```

(Move any `*_test.go` siblings for product/variant/transaction/objects the same way; `serialise_test.go` stays in `storage/order/` — it tests the pg serialisation, which stays.)

- [ ] **Step 2: Rename the package declarations**

In every moved aggregate file, change the package clause to `package entities` (joining `sync_job.go`). In every moved VO file, change it to `package objects`. Resolve any identifier collisions inside the merged `entities` package by keeping the existing prefixed names (e.g. `ErrTxInvalidKind`, `ErrOrderMissingPlatform`); if two files declared the same unprefixed sentinel, prefix the colliding one.

- [ ] **Step 3: Fix all references across the codebase**

The aggregates were `order.Order` / `product.Product` / `productvariant.ProductVariant` / `transaction.Transaction` (+ their `New*FromProviderPayload`, `*Input`, error sentinels); they are now `entities.Order` / `entities.Product` / `entities.ProductVariant` / `entities.Transaction`. The VOs were `objects.MonetaryAmount` etc. under `storage/objects`; the import path is now `internal/sync/objects` (same `objects.` qualifier, new path).

Update importers — change the import path from `.../storage/<entity>` to `.../internal/sync/entities` and the qualifier from `<entity>.` to `entities.`:
- `internal/sync/events/external_*_updated.go` (payloads embed `entities.OrderInput`, etc.)
- `internal/sync/services/shopify/*_normalizer.go` (produce `entities.*Input`)
- `internal/sync/services/pipelines/**` (construct/validate aggregates)
- `internal/sync/handlers/*_updated_handler.go`
- `internal/sync/storage/<entity>/*_pg.go` + `*_storage.go` (the impl imports `entities`)
- any controller / registry / `module.go` references

`go build` will enumerate every remaining mismatch — fix until it compiles.

- [ ] **Step 4: Verify build + full test suite + vet (no behavior change)**

```bash
go build ./... && go vet ./internal/... ./core/... && go test ./internal/... ./core/...
```
Expected: all green, identical test outcomes to pre-move (pure relocation). No import cycle (`entities` must not import `storage`).

- [ ] **Step 5: Confirm /storage holds no domain types**

```bash
ls internal/sync/storage/order internal/sync/storage/product internal/sync/storage/product_variant internal/sync/storage/transaction
```
Expected: each contains only `*_storage.go` (the port) + `*_pg.go` (+ `serialise_test.go` for order) — no `order.go`/`product.go`/etc. `internal/sync/storage/objects/` is gone.

- [ ] **Step 6: Commit**

```bash
git add -A internal/sync/
git commit -m "refactor(sync): extract aggregates to /entities, VOs to /objects; storage = port+impl (Task 12)"
```

---

## Task 13: A generic batching Accumulator lives in core

**Files:**
- Create: `core/types/accumulator.go`
- Test: `core/types/accumulator_test.go`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none — core primitive)
**Depends on:** (none)

- [ ] **Step 1: Write the failing test**

```go
package types

import "testing"

type recordingSaver[T any] struct{ batches [][]T }

func (r *recordingSaver[T]) Save(items []T) { r.batches = append(r.batches, append([]T(nil), items...)) }

func TestAccumulator_FlushesAtBatchSize(t *testing.T) {
	s := &recordingSaver[int]{}
	a := NewAccumulator[int](2, s)
	a.Add([]int{1, 2, 3})
	if len(s.batches) != 1 || len(s.batches[0]) != 2 {
		t.Fatalf("expected one full batch of 2, got %v", s.batches)
	}
	a.Flush()
	if len(s.batches) != 2 || len(s.batches[1]) != 1 {
		t.Fatalf("expected remainder batch of 1, got %v", s.batches)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./core/types/ -run Accumulator`
Expected: FAIL — `undefined: NewAccumulator`.

- [ ] **Step 3: Implement (ported from the reference)**

```go
package types

// Saver receives a ready batch from an Accumulator.
type Saver[T any] interface{ Save(items []T) }

// Accumulator buffers items and calls Save when batchSize is reached or Flush is called.
type Accumulator[T any] struct {
	batchSize int
	buffer    []T
	saver     Saver[T]
}

func NewAccumulator[T any](batchSize int, saver Saver[T]) *Accumulator[T] {
	return &Accumulator[T]{batchSize: batchSize, buffer: make([]T, 0, batchSize), saver: saver}
}

func (a *Accumulator[T]) Add(items []T) {
	a.buffer = append(a.buffer, items...)
	for len(a.buffer) >= a.batchSize {
		batch := a.buffer[:a.batchSize]
		a.saver.Save(batch)
		remaining := a.buffer[a.batchSize:]
		a.buffer = make([]T, len(remaining), max(len(remaining), a.batchSize))
		copy(a.buffer, remaining)
	}
}

func (a *Accumulator[T]) Flush() {
	if len(a.buffer) == 0 {
		return
	}
	a.saver.Save(a.buffer)
	a.buffer = make([]T, 0, a.batchSize)
}
```

- [ ] **Step 4: Run test + build**

Run: `go test ./core/types/ && go build ./...`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add core/types/accumulator.go core/types/accumulator_test.go
git commit -m "feat(core): generic batching Accumulator[T] (Task 13)"
```

---

## Task 14: Orders flow through a storage channel and are saved + published in one transaction

**Files:**
- Create: `internal/sync/storage/order/snapshot.go` — typed `orderEntitySnapshot` + JSONB `orderLineJSON`/`orderTransactionJSON`/`moneyJSON`
- Modify: `internal/sync/storage/order/order_storage.go` — `Storage` = `InputChannel()`, `Start(ctx)`, `Close()`
- Modify: `internal/sync/storage/order/order_pg.go` — channel + `Accumulator`; `Save(batch)` does bulk upsert + per-entity wire event in one `UnitOfWork.Execute`; typed `serialise*`
- Modify: `internal/sync/handlers/order_updated_handler.go` — construct once, enqueue; drop `UpsertOrder` + `buildOrderUpdatedWireEvent`
- Modify: `internal/sync/services/pipelines/shopify/orders.go` — drop the validate-then-discard `NewOrderFromProviderPayload`
- Test: `internal/sync/storage/order/order_pg_test.go` — batch upsert + outbox event committed together (skip if no DB); `internal/sync/handlers/order_updated_handler_test.go` — enqueues, no upsert

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository (go), /handler (go), /projection (go)
**Depends on:** 6, 12, 13

> Post-Task-12, the aggregate is `entities.Order` (package `entities`); the `Storage` interface stays in `storage/order` (`package order`) and imports `entities`.

- [ ] **Step 1: Write the failing handler test (enqueue, not upsert)**

```go
func TestOrderHandler_EnqueuesConstructedOrder(t *testing.T) {
	ch := make(chan []*entities.Order, 1)
	h := NewOrderUpdatedHandler(fakeChannelStorage{ch: ch})
	evt := events.NewExternalOrderUpdated(validOrderInput(), "store-1") // validOrderInput() returns entities.OrderInput
	if err := h.Handle(context.Background(), evt); err != nil {
		t.Fatalf("handle: %v", err)
	}
	select {
	case batch := <-ch:
		if len(batch) != 1 || batch[0].StoreID() != "store-1" {
			t.Fatalf("unexpected enqueue: %+v", batch)
		}
	default:
		t.Fatal("handler did not enqueue")
	}
}
```
(`fakeChannelStorage` implements the `order.Storage` port with `InputChannel() chan<- []*entities.Order`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/sync/handlers/ -run EnqueuesConstructedOrder`
Expected: FAIL — handler still upserts; `InputChannel` undefined.

- [ ] **Step 3: Reshape the Storage port**

`order_storage.go` (`package order`, imports `entities`):
```go
type Storage interface {
	InputChannel() chan<- []*entities.Order
	Start(ctx context.Context) error
	Close()
}
```

- [ ] **Step 4: Typed snapshot + JSONB structs**

`snapshot.go` — define `orderEntitySnapshot` with typed `wire.*` fields (full entity: id, storeId, storeIntegrationId, storeIntegrationExternalId, platform, externalId, externalCreatedAt, paymentStatus, paymentMethod, paymentGateway, subtotalCents/currency, totalCents/currency, cartToken, isDraft), plus `orderLineJSON`/`orderTransactionJSON`/`moneyJSON` for the JSONB columns. A `newOrderEntitySnapshot(o *Order) orderEntitySnapshot` builder assigns the typed accessors directly (no `string(...)`, no `map[string]any`).

- [ ] **Step 5: Channel + transactional Save**

`order_pg.go` — `PgOrderStorage` gains `inputCh chan []*entities.Order`, `accumulator *types.Accumulator[*entities.Order]`, `uow unitofwork.UnitOfWork`, `events repositories.DomainEventRepository`. Constructor wires them (batch 1000 / flush 1s consts). Implement `InputChannel`/`Start`/`Close` mirroring the reference (`Start` selects ctx/ticker/inputCh → `accumulator.Add`). Implement `Save(batch []*entities.Order)`:

```go
func (r *PgOrderStorage) Save(batch []*entities.Order) {
	if len(batch) == 0 { return }
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	err := r.uow.Execute(ctx, func(ctx context.Context) error {
		for _, o := range batch {
			if err := r.upsert(ctx, o); err != nil { return err }       // participates via TxFromContext
			evt, err := buildOrderUpdatedWireEvent(o)                    // typed snapshot (moved here)
			if err != nil { return err }
			if err := r.events.Save(ctx, evt); err != nil { return err } // same tx → transactional outbox
		}
		return nil
	})
	if err != nil { slog.Error("order batch save", "error", err) }
}
```
Refactor the existing INSERT…ON CONFLICT body into a private `upsert(ctx, o *entities.Order)` that uses `TxFromContext(ctx)` for its statement. Move `buildOrderUpdatedWireEvent` from the handler into this package as `buildOrderUpdatedWireEvent(o *entities.Order)`, rebuilt on the typed snapshot (Step 4). Replace the `map[string]any` `serialiseLines`/`serialiseTransactions`/`money` with the typed JSONB structs.

- [ ] **Step 6: Handler enqueues; pipeline stops pre-validating**

`order_updated_handler.go`: drop `eventRepo`; `Handle` = `entities.NewOrderFromProviderPayload(evt.Payload.Input)` once → `h.storage.InputChannel() <- []*entities.Order{o}` (with a `ctx.Done()` select guard). `shopify/orders.go`: remove the `entities.NewOrderFromProviderPayload(input)`-then-discard call; just publish `events.NewExternalOrderUpdated(input, ...)`.

- [ ] **Step 7: Write the integration test (skip if no DB)**

`order_pg_test.go` — acquire DB (existing helper pattern); `t.Skip` if unreachable. Construct `PgOrderStorage` with a real `pg_unit_of_work` + the pg `DomainEventRepository`; call `Save([]*entities.Order{a, b})`; assert both rows exist in `sales.orders` AND two `order.updated` wire-event rows exist in the outbox table, committed together.

- [ ] **Step 8: Run tests + build + vet**

Run: `go test ./internal/sync/storage/order/ ./internal/sync/handlers/ ./internal/sync/services/pipelines/... && go build ./... && go vet ./internal/sync/...`
Expected: PASS (integration test may Skip without DB), clean.

- [ ] **Step 9: Commit**

```bash
git add internal/sync/storage/order/ internal/sync/handlers/order_updated_handler.go internal/sync/services/pipelines/shopify/orders.go
git commit -m "feat(sync): order channel persistence + transactional typed wire event (Task 14)"
```

---

## Task 15: Product, Variant, and Transaction flow through the same channel model

**Files:**
- Create: `internal/sync/storage/transaction/snapshot.go`, `product/snapshot.go`, `product_variant/snapshot.go`
- Modify: `internal/sync/storage/{transaction,product,product_variant}/*_storage.go` + `*_pg.go` — channel + Accumulator + transactional Save (same shape as Task 14)
- Modify: `internal/sync/handlers/{transaction,product,product_variant}_updated_handler.go` — construct once, enqueue
- Test: each storage's `*_pg_test.go` (skip if no DB) + each handler test (enqueue)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository (go), /handler (go), /projection (go)
**Depends on:** 14

> Aggregates are `entities.Product` / `entities.ProductVariant` / `entities.Transaction` (post-Task-12); the `Storage` ports stay in `storage/<entity>` and import `entities`.

- [ ] **Step 1: Write the failing handler tests**

For each of transaction / product / product_variant, mirror Task 14 Step 1: a `fakeChannelStorage` (`InputChannel() chan<- []*entities.<Entity>`) and a `Test<Entity>Handler_Enqueues` asserting the constructed entity lands on the channel and no upsert is called.

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/sync/handlers/ -run Enqueues`
Expected: FAIL.

- [ ] **Step 3: Reshape each storage + typed snapshot + transactional Save**

Apply the Task 14 shape to each package:
- `Storage` interface → `InputChannel()`/`Start`/`Close`.
- `snapshot.go` with the full typed snapshot for that entity (Product: id, storeId, storeIntegrationId, platform, externalId, title, handle, status, externalCreatedAt; Variant: id, productId, storeIntegrationId, platform, externalId, title, unitPriceCents/currency, externalCreatedAt; Transaction: the existing `transactionUpdatedWirePayload` becomes the typed snapshot, now with `Entity` raw JSON included).
- `*_pg.go`: channel + Accumulator + `Save(batch)` doing upsert + typed wire event in one `uow.Execute`.
- Replace any remaining `map[string]any` / `string(enum)` casts with the typed snapshot.

- [ ] **Step 4: Handlers enqueue**

Each `*_updated_handler.go`: construct once → enqueue. Drop `eventRepo` from the handlers (the wire event now emits from storage).

- [ ] **Step 5: Integration tests (skip if no DB)**

One `*_pg_test.go` per entity, mirroring Task 14 Step 7.

- [ ] **Step 6: Run tests + build + vet**

Run: `go test ./internal/sync/storage/... ./internal/sync/handlers/ && go build ./... && go vet ./internal/sync/...`
Expected: PASS (integration may Skip), clean.

- [ ] **Step 7: Commit**

```bash
git add internal/sync/storage/transaction/ internal/sync/storage/product/ internal/sync/storage/product_variant/ internal/sync/handlers/
git commit -m "feat(sync): product/variant/transaction channel persistence + typed wire events (Task 15)"
```

---

## Task 16: The four storages start and stop with the app

**Files:**
- Modify: `internal/sync/module.go` — construct each storage with `UnitOfWork` + `DomainEventRepository`; register fx `Lifecycle` `OnStart`→`Start` (goroutine), `OnStop`→`Close` for order/product/product_variant/transaction
- Test: `go build` + a module wiring smoke (fx provides resolve)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /bounded-context
**Depends on:** 14, 15

- [ ] **Step 1: Wire the lifecycle**

Modify `internal/sync/module.go` — add a `fx.Invoke` (or params-struct lifecycle hook, mirroring the reference `module.go:150`) that, for each storage, launches `go s.Start(context.Background())` on `OnStart` and `s.Close()` on `OnStop`. Update the storage constructors in the module to pass the `unitofwork.UnitOfWork` + `repositories.DomainEventRepository` dependencies.

- [ ] **Step 2: Build + vet + app smoke**

Run: `go build ./... && go vet ./internal/sync/... && go test ./internal/sync/...`
Expected: clean. If a DI smoke test exists (e.g. `fx.ValidateApp`), run it; otherwise `go build ./cmd/api` must succeed.

- [ ] **Step 3: Commit**

```bash
git add internal/sync/module.go
git commit -m "feat(sync): fx lifecycle starts/stops storage channel goroutines (Task 16)"
```

---

## Task 17: Sync execute reports COMPLETED only after the batch is saved

**Files:**
- Modify: `internal/sync/services/executor/executor.go` — sync `Execute` flush-barrier (wait for the batch to drain+save before `Complete`); async `ExecuteAsync` enqueues + marks RUNNING + a background flush completes it
- Test: `internal/sync/services/executor/executor_test.go` — sync waits, async returns early

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service (go)
**Depends on:** 14, 16

- [ ] **Step 1: Decide the flush-barrier mechanism (per-job done signal)**

The pipeline pushes entities to the storage channel; `Save` runs on the storage goroutine. For **sync** `Execute`, after running all pipelines, the executor must block until the entities it enqueued are durably saved. Mechanism: each `Save` invocation, after its `uow.Execute` commits, signals completion; the executor's sync path issues a `Flush()` + waits on a per-run done channel before calling `job.Complete`. Concretely: add a `Flush(ctx) error` method to the `Storage` interface that synchronously drains the accumulator and returns after the commit; the sync executor calls `storage.Flush(ctx)` for each storage touched by the job's pipelines, then `Complete`. Async path skips the flush (the 1s ticker drains it; a background goroutine marks `Complete`).

- [ ] **Step 2: Write the failing test**

```go
func TestExecutor_SyncWaitsForSave(t *testing.T) {
	saved := make(chan struct{}, 1)
	storage := &flushSignalStorage{onFlush: func() { saved <- struct{}{} }}
	ex := newExecutorWith(storage /*, fakes */)
	job, _ := ex.Execute(context.Background(), jobID)
	if job.Status != enums.SyncStatusCompleted {
		t.Fatalf("status=%v want COMPLETED", job.Status)
	}
	select {
	case <-saved:
	default:
		t.Fatal("Execute returned COMPLETED before Flush")
	}
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `go test ./internal/sync/services/executor/ -run SyncWaitsForSave`
Expected: FAIL — no flush barrier; `Flush` undefined.

- [ ] **Step 4: Implement**

Add `Flush(ctx context.Context) error` to each `Storage` interface + impl (synchronous accumulator drain + a final `Save` of the remainder, blocking until the `uow.Execute` returns). In `executor.go`: sync `Execute` runs the pipelines (which enqueue), then calls `Flush` on the storages for the job's pipeline kinds, then `job.Complete`. `ExecuteAsync` runs the pipelines and returns with the job `RUNNING`; a deferred/background flush advances it to `Complete` (or leave the 1s ticker to drain and a lightweight completion goroutine to mark it — keep it simple: async marks `Complete` after enqueue, documenting that delivery is via the outbox dispatcher, consistent with the current async semantics).

- [ ] **Step 5: Run tests + build + vet**

Run: `go test ./internal/sync/... && go build ./... && go vet ./internal/sync/...`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add internal/sync/services/executor/executor.go internal/sync/storage/
git commit -m "feat(sync): sync execute flush-barrier; async fire-and-flush (Task 17)"
```

---

## Final Validation

- [ ] `cd packages/api/go && go build ./...` — full build clean
- [ ] `go vet ./internal/... ./core/...` — vet clean
- [ ] `go test ./internal/... ./core/...` — unit + use-case tests pass (integration tests Skip without DB)
- [ ] With Postgres up (`bun docker:compose && bun migrate:dev`): `go test ./internal/sync/storage/...` — the channel/transactional-outbox integration tests run and pass
- [ ] From root: `bun tsc` — TS consumers type-check against the regenerated SDK
- [ ] AC mapping (every spec AC → ≥1 test path):
  - AC-1 → `internal/sync/controllers/sync_controller_test.go:"TestGetSyncStatus_InvalidIDReturns400"` + `go build` (response.go deleted)
  - AC-2 → `internal/webhooks/controllers/webhook_test.go:"TestWebhook_InvalidEvent400"` / `"TestWebhook_InvalidPlatform400"`
  - AC-3 → `internal/sync/enums/webhook_platform_test.go:"TestParseWebhookPlatform"` (rejects `NUVEMSHOP`/`CARTPANDA`) + `internal/webhooks/mappers/factory_test.go`
  - AC-4 → `internal/sync/entities/transaction_test.go:"TestNewTransaction_RejectsInvalidEnums"` (moved from storage in Task 12); `internal/sync/entities/sync_job_test.go:"TestNewSyncJob_RejectsInvalidPlatform"`; `internal/sync/enums/sync_status_test.go:"TestSyncStatusValid"`
  - AC-5 → `go build` (Storage interfaces = InputChannel/Start/Close) + `internal/sync/handlers/order_updated_handler_test.go:"TestOrderHandler_EnqueuesConstructedOrder"`
  - AC-6 → `internal/sync/storage/order/order_pg_test.go` (batch upsert + outbox committed together) + `core/types/accumulator_test.go`
  - AC-7 → `internal/sync/services/executor/executor_test.go:"TestExecutor_SyncWaitsForSave"`
  - AC-8 → Final Validation build/vet/test rows + Task 11 contract lock (`bun emit-openapi && bun sdk`, `bun tsc`)
  - AC-9 → `go build ./...` after Task 12 (no aggregate/VO type under `internal/sync/storage/**`; flat `package entities`; no import cycle) + Task 12 Step 5 directory check

## Notes

- **Wire enum catalog:** `contracts-go/wire/enums.go` already defines `SalesPlatform`, `PaymentStatus`, `PaymentMethod`, `PaymentGateway`, `TransactionKind`, `TransactionStatus`, `ProductStatus`, `CurrencyCode`, `OrderTransactionFeeType`, `DisputeStatus` with `Parse*` — do **not** create new wire enums; only `EventName` + `WebhookPlatform` are new (and live in `internal/sync/enums`).
- **`DecodeRequest` body decoding** handles `map[string]string` and `*int` body fields (it `json.Unmarshal`s each field), so `sync_controller.go`'s `Credentials`/`WindowDays` and handshake's `Credentials` work without changes to `DecodeRequest`.
- **Webhook registration change:** registering `?event=` now uses the canonical name (`sync.external_order_updated`), not the provider topic. Update any webhook-registration scripts/docs. The provider's own topic header is no longer used for routing.
- **Batch/flush consts:** start at 1000 / 1s (reference values); tune if the transactional batch (upserts + outbox rows in one tx) proves too large.
- **DB for integration tests:** `bun docker:compose && bun migrate:dev` before `go test ./internal/sync/storage/...`; tests `t.Skip` when the DB is unreachable.
