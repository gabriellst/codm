# Go Sync Restructure — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle. Move-only Tasks keep
> `go build ./... && go test ./...` green at every commit boundary.

**Goal:** Restructure the Go service so `internal/sync/` and `internal/integrations/` mirror `go-worker-monorepo`'s DDD layout, introduce the `sync_job` aggregate + 6-controller surface, and route persistence through an `ExternalXUpdatedEvent → handler → storage` layer that Spec B's webhook flow will reuse.

**Architecture:** Two atomic Go commits (integrations extraction; sync restructure) + one TS-side deletion commit. Pipelines stop writing storage directly — they publish `ExternalXUpdatedEvent` through an injected `ExternalEventPublisher`. The executor supplies a synchronous publisher (`mediator.Dispatch`, inline) for `POST /sync`/`execute_sync` and an async publisher (`DomainEventRepository.Save` → outbox) for `async_execute_sync`. Per-entity handlers consume the external event, upsert canonical to `storage/<entity>`, and publish the wire-event. The `sync_job` aggregate (PENDING→RUNNING→COMPLETED/FAILED/CANCELLED) tracks each run.

**Tech Stack:** Go, fx, net/http, database/sql, google/uuid; Drizzle (sync_jobs migration); TypeScript+Bun (marketing_reconcile deletion).

**Spec:** .specs/2026-05-24-go-sync-restructure-design.md
**Tasks:** 13
**Estimated minutes:** 560

> **Planner note — resolved Open Question (spec § Open Questions).** Decision 11 said "Pipeline `Execute()` publishes via `DomainEventRepository`." Refinement: the pipeline publishes through an injected `ExternalEventPublisher` *port* (preserving streaming + decoupling the sync/async choice). The executor injects the concrete publisher: synchronous (`mediator.Dispatch`) for `execute_sync`/`POST /sync`; async (`eventRepo.Save`→outbox) for `async_execute_sync`. This honors Decision 11's intent (pipeline never touches storage) and is symmetric with Spec B's webhook mapper (which returns events for the handler to persist).

> **Planner note — graph tooling N/A.** The `/plan` graph CLI (`validate-plan`, `review-plan.ts`) + SDK Contract-Lock indexes the TS/frontend codebase; the Go controllers here are consumed by `HttpGoSyncWorkerClient` via raw `fetch`, not the generated SDK. No SDK regen Task is needed. The `sync_jobs` Drizzle migration is the only TS-graph-relevant artifact.

---

## Task 1: Handshake serves from the new `integrations` BC

**Files:**
- Create: `packages/api/go/internal/integrations/controllers/handshake.go`
- Create: `packages/api/go/internal/integrations/controllers/handshake_test.go`
- Create: `packages/api/go/internal/integrations/module.go`
- Delete: `packages/api/go/internal/sync/controllers/integrations_handshake.go`
- Modify: `packages/api/go/internal/sync/module.go` — drop the `NewIntegrationsHandshakeController` provider
- Modify: `packages/api/go/cmd/api/main.go` — add `integrations.Module` to the fx app

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /bounded-context, /controller, /test
**Depends on:** (none)

- [ ] **Step 1: Write the failing test**

Create `packages/api/go/internal/integrations/controllers/handshake_test.go`:

```go
package controllers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandshakeController_DeterministicExternalID(t *testing.T) {
	c := NewHandshakeController()
	body := `{"platform":"SHOPIFY","credentials":{"shop":"acme","token":"abc"}}`

	run := func() handshakeResponse {
		req := httptest.NewRequest(http.MethodPost, "/integrations/handshake", strings.NewReader(body))
		rec := httptest.NewRecorder()
		c.Handle(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", rec.Code)
		}
		var resp handshakeResponse
		if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
			t.Fatalf("decode: %v", err)
		}
		return resp
	}

	first, second := run(), run()
	if !first.Succeeded {
		t.Errorf("succeeded = false, want true")
	}
	if first.ExternalID == "" {
		t.Errorf("externalId empty")
	}
	if first.ExternalID != second.ExternalID {
		t.Errorf("externalId not deterministic: %q != %q", first.ExternalID, second.ExternalID)
	}
}

func TestHandshakeController_MissingPlatform400(t *testing.T) {
	c := NewHandshakeController()
	req := httptest.NewRequest(http.MethodPost, "/integrations/handshake", strings.NewReader(`{"credentials":{}}`))
	rec := httptest.NewRecorder()
	c.Handle(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
}

func (c *HandshakeController) Metadata_ContextIsIntegrations(t *testing.T) {}
```

Also assert the BC name in a focused test:

```go
func TestHandshakeController_MetadataContext(t *testing.T) {
	if got := NewHandshakeController().Metadata().Context; got != "integrations" {
		t.Errorf("Context = %q, want %q", got, "integrations")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api/go && go test ./internal/integrations/...`
Expected: FAIL — `package .../integrations/controllers` does not exist / `undefined: NewHandshakeController`.

- [ ] **Step 3: Move the controller into the new BC**

Create `packages/api/go/internal/integrations/controllers/handshake.go` with the body of the current `sync/controllers/integrations_handshake.go`, renamed:
- type `IntegrationsHandshakeController` → `HandshakeController`; constructor `NewIntegrationsHandshakeController` → `NewHandshakeController`
- request/response type names `integrationsHandshakeRequest`/`integrationsHandshakeResponse` → `handshakeRequest`/`handshakeResponse`; `marketingAdAccountSummary` kept
- `Metadata()` `Context: "sync"` → `Context: "integrations"`; `Tags: []string{"sync", "integrations"}` → `Tags: []string{"integrations"}`; `Path` stays `/integrations/handshake`
- `deterministicExternalID` helper moves verbatim

```go
// Package controllers exposes HTTP endpoints for the integrations BC.
package controllers

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sort"
	"strings"

	"template/core-go/types"
)

// HandshakeController serves POST /integrations/handshake — validates
// platform credentials and returns a deterministic externalId.
// Extracted from the sync BC (was integrations_handshake.go); per
// spec § Outbound Commands the TS Integration BC's C21
// ConnectIntegration fans out here for the platform credential check.
type HandshakeController struct{}

func NewHandshakeController() *HandshakeController { return &HandshakeController{} }

func (c *HandshakeController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context: "integrations", Path: "/integrations/handshake", Method: http.MethodPost,
		Description: "Validate platform credentials + return discovered externalId (scaffold)",
		Tags:        []string{"integrations"},
	}
}

type handshakeRequest struct {
	Platform    string            `json:"platform"`
	Credentials map[string]string `json:"credentials"`
}

type marketingAdAccountSummary struct {
	ExternalID  string `json:"externalId"`
	DisplayName string `json:"displayName"`
}

type handshakeResponse struct {
	Succeeded           bool                        `json:"succeeded"`
	ExternalID          string                      `json:"externalId"`
	MarketingAdAccounts []marketingAdAccountSummary `json:"marketingAdAccounts"`
}

func (c *HandshakeController) Handle(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req handshakeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	if req.Platform == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "platform required"})
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(handshakeResponse{
		Succeeded:           true,
		ExternalID:          deterministicExternalID(req.Platform, req.Credentials),
		MarketingAdAccounts: []marketingAdAccountSummary{},
	})
}

func deterministicExternalID(platform string, credentials map[string]string) string {
	keys := make([]string, 0, len(credentials))
	for k := range credentials {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := []string{strings.ToUpper(platform)}
	for _, k := range keys {
		parts = append(parts, k+"="+credentials[k])
	}
	sum := sha256.Sum256([]byte(strings.Join(parts, "|")))
	return hex.EncodeToString(sum[:16])
}
```

Then delete `packages/api/go/internal/sync/controllers/integrations_handshake.go`.

- [ ] **Step 4: Create the integrations fx module**

Create `packages/api/go/internal/integrations/module.go`:

```go
// Package integrations wires the integrations bounded context — the
// connection lifecycle (handshake now; per-platform connection
// pipelines later). Sibling BC to sync.
package integrations

import (
	"template/api-go/internal/integrations/controllers"
	"template/core-go/types"

	"go.uber.org/fx"
)

var Module = fx.Module("integrations",
	fx.Provide(fx.Annotate(
		controllers.NewHandshakeController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
)
```

- [ ] **Step 5: Drop the handshake provider from sync; register integrations in the app**

Modify `packages/api/go/internal/sync/module.go`:
- Remove the `import "...sync/controllers"`-bound `NewIntegrationsHandshakeController` provider block:

```diff
-	fx.Provide(fx.Annotate(
-		controllers.NewIntegrationsHandshakeController,
-		fx.As(new(types.Controller)),
-		fx.ResultTags(`group:"controllers"`),
-	)),
```

Modify `packages/api/go/cmd/api/main.go`:

```diff
 	"template/api-go/internal/sync"
+	"template/api-go/internal/integrations"
```
```diff
 		sync.Module,
+		integrations.Module,
 		webhooks.Module,
```

- [ ] **Step 6: Run tests + build**

Run: `cd packages/api/go && go build ./... && go test ./internal/integrations/...`
Expected: build 0 errors; integrations tests PASS.

- [ ] **Step 7: Commit (Commit A)**

```bash
git add packages/api/go/internal/integrations/ packages/api/go/internal/sync/module.go \
        packages/api/go/cmd/api/main.go
git rm packages/api/go/internal/sync/controllers/integrations_handshake.go
git commit -m "refactor(go): extract integrations BC from sync (Task 1)"
```

---

## Task 2: Sync enums + error codes exist

**Files:**
- Create: `packages/api/go/internal/sync/enums/sync_pipeline_name.go`
- Create: `packages/api/go/internal/sync/enums/sync_status.go`
- Create: `packages/api/go/internal/sync/enums/sync_pipeline_name_test.go`
- Create: `packages/api/go/internal/sync/errors/errors.go`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum, /errors, /test
**Depends on:** (none)

- [ ] **Step 1: Write the failing test**

Create `packages/api/go/internal/sync/enums/sync_pipeline_name_test.go`:

```go
package enums

import "testing"

func TestSyncPipelineName_Valid(t *testing.T) {
	valid := []SyncPipelineName{SyncPipelineOrders, SyncPipelineProducts, SyncPipelineProductVariants}
	for _, v := range valid {
		if !v.Valid() {
			t.Errorf("%q should be valid", v)
		}
	}
	if SyncPipelineName("TRANSACTIONS").Valid() {
		t.Errorf("TRANSACTIONS is a Spec C kind; must NOT be valid yet")
	}
	if SyncPipelineName("").Valid() {
		t.Errorf("empty should be invalid")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api/go && go test ./internal/sync/enums/...`
Expected: FAIL — `undefined: SyncPipelineName`.

- [ ] **Step 3: Write the enums + errors**

Create `packages/api/go/internal/sync/enums/sync_pipeline_name.go`:

```go
package enums

// SyncPipelineName names a data-pull pipeline a sync run can execute.
// Spec A ships ORDERS / PRODUCTS / PRODUCT_VARIANTS; Spec C adds
// TRANSACTIONS / DISPUTES / MARKETING_METRICS / MARKETING_METRICS_CONCURRENT
// / MARKETING_METRICS_TWO_PHASE / CAMPAIGNS.
type SyncPipelineName string

const (
	SyncPipelineOrders          SyncPipelineName = "ORDERS"
	SyncPipelineProducts        SyncPipelineName = "PRODUCTS"
	SyncPipelineProductVariants SyncPipelineName = "PRODUCT_VARIANTS"
)

func (s SyncPipelineName) Valid() bool {
	switch s {
	case SyncPipelineOrders, SyncPipelineProducts, SyncPipelineProductVariants:
		return true
	}
	return false
}
```

Create `packages/api/go/internal/sync/enums/sync_status.go`:

```go
package enums

// SyncStatus is the lifecycle state of a sync_job.
type SyncStatus string

const (
	SyncStatusPending   SyncStatus = "PENDING"
	SyncStatusRunning   SyncStatus = "RUNNING"
	SyncStatusCompleted SyncStatus = "COMPLETED"
	SyncStatusFailed    SyncStatus = "FAILED"
	SyncStatusCancelled SyncStatus = "CANCELLED"
)
```

Create `packages/api/go/internal/sync/errors/errors.go`:

```go
// Package errors holds the sync bounded context's typed error codes.
package errors

import "template/core-go/errors"

const (
	CodeSyncAlreadyRunning    errors.ErrorCode = "SYNC_ALREADY_RUNNING"
	CodeSyncCannotBeCancelled errors.ErrorCode = "SYNC_CANNOT_BE_CANCELLED"
	CodeInvalidDateRange      errors.ErrorCode = "INVALID_DATE_RANGE"
	CodeSyncJobNotFound       errors.ErrorCode = "SYNC_JOB_NOT_FOUND"
	CodeUnknownPipeline       errors.ErrorCode = "UNKNOWN_PIPELINE"
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api/go && go test ./internal/sync/enums/...`
Expected: PASS.

- [ ] **Step 5: Build**

Run: `cd packages/api/go && go build ./...`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/api/go/internal/sync/enums/ packages/api/go/internal/sync/errors/
git commit -m "feat(go-sync): add SyncPipelineName/SyncStatus enums + error codes (Task 2)"
```

---

## Task 3: Canonical structs + repos relocate to `storage/<entity>/`

> Move-only Task — relocates working code; behavior unchanged. No new
> logic. The aggregates (`canonical/*.go`), shared objects
> (`canonical/objects/*.go`), and PG repos (`repositories/pg_*.go`)
> move into `storage/<entity>/` and `storage/objects/`. Every importer
> updates its import path in the same Task so build stays green.

**Files:**
- Move: `internal/sync/canonical/objects/*.go` → `internal/sync/storage/objects/*.go` (package `objects` → `storageobjects`? keep `objects`)
- Move: `internal/sync/canonical/order.go` `order_line.go` `order_transaction.go` → `internal/sync/storage/order/`
- Move: `internal/sync/canonical/product.go` → `internal/sync/storage/product/product.go`
- Move: `internal/sync/canonical/product_variant.go` → `internal/sync/storage/product_variant/product_variant.go`
- Move: `internal/sync/repositories/pg_order_repository.go` → `internal/sync/storage/order/order_pg.go`
- Move: `internal/sync/repositories/pg_product_repository.go` → `internal/sync/storage/product/product_pg.go`
- Move: `internal/sync/repositories/pg_product_variant_repository.go` → `internal/sync/storage/product_variant/product_variant_pg.go`
- Create: `internal/sync/storage/order/order_storage.go` (interface)
- Create: `internal/sync/storage/product/product_storage.go`
- Create: `internal/sync/storage/product_variant/product_variant_storage.go`
- Move: the canonical aggregate `*_test.go` siblings (`canonical/order_test.go`, `order_transaction_test.go`, `product_test.go`, `product_variant_test.go`) into their entity's new package. NOTE: the PG repos (`pg_*_repository.go`) have **no** test siblings today — there is nothing to move for them.
- Delete: `internal/sync/canonical/` `internal/sync/repositories/`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository, /db-modelling
**Depends on:** (none — independent of Task 2)

- [ ] **Step 1: Relocate the shared objects package**

`git mv internal/sync/canonical/objects internal/sync/storage/objects`. Keep `package objects`. Update the import in every file that referenced `.../sync/canonical/objects`:

```diff
- "template/api-go/internal/sync/canonical/objects"
+ "template/api-go/internal/sync/storage/objects"
```

(Importers today: `canonical/order.go`, `canonical/product.go`, `canonical/product_variant.go`.)

- [ ] **Step 2: Relocate the canonical aggregates into per-entity storage packages**

Each entity becomes its own package (`package order`, `package product`, `package productvariant`):
- `git mv internal/sync/canonical/order.go internal/sync/storage/order/order.go` (+ `order_line.go`, `order_transaction.go`, and their `_test.go` siblings)
- `git mv internal/sync/canonical/product.go internal/sync/storage/product/product.go`
- `git mv internal/sync/canonical/product_variant.go internal/sync/storage/product_variant/product_variant.go`

Change `package canonical` → the per-entity package name in each moved file. Update the `objects` import to the new path (Step 1).

Every external importer of `canonical.Order` / `canonical.Product` / `canonical.ProductVariant` (currently `pipelines/ports.go`, `outbox/pg_outbox_writer.go`, `repositories/pg_*.go`) now imports the per-entity package — e.g. `order.Order`. Update those import paths + qualifiers. (`outbox/` is deleted in Task 8; for now update it so the tree stays green.)

- [ ] **Step 3: Relocate the PG repositories as the storage impls + add the interface**

`git mv internal/sync/repositories/pg_order_repository.go internal/sync/storage/order/order_pg.go` (+ product, product_variant). Change package to `order`/`product`/`productvariant`. Rename the struct's constructor to `NewPgOrderStorage` (keeps the `Pg` prefix idiom). The UPSERT method `UpsertOrder` stays.

Create `internal/sync/storage/order/order_storage.go`:

```go
package order

import "context"

// Storage is the UPSERT-only persistence port for canonical orders.
// Insert-or-update keyed on the deterministic id, stable across
// re-ingests. The PG impl lives in order_pg.go.
type Storage interface {
	UpsertOrder(ctx context.Context, o *Order) error
}
```

Same shape for `product/product_storage.go` (`UpsertProduct(ctx, *Product)`) and `product_variant/product_variant_storage.go` (`UpsertProductVariant(ctx, *ProductVariant)`). Ensure the moved `*_pg.go` struct satisfies its package's `Storage` interface (add a `var _ Storage = (*PgOrderStorage)(nil)` assertion).

- [ ] **Step 4: Delete the emptied folders**

```bash
git rm -r internal/sync/canonical internal/sync/repositories
```

(`canonical/` and `repositories/` should now be empty of `.go` files.)

- [ ] **Step 5: Build + test (tree stays green)**

Run: `cd packages/api/go && go build ./... && go test ./internal/sync/...`
Expected: build 0 errors; the moved canonical aggregate tests PASS in their new packages (the PG repos have no dedicated tests today). If `pipelines/` or `outbox/` fail to compile, the import-path qualifiers from Step 2 were missed — fix them.

- [ ] **Step 6: Commit**

```bash
git add packages/api/go/internal/sync/storage/
git rm -r packages/api/go/internal/sync/canonical packages/api/go/internal/sync/repositories 2>/dev/null || true
git add -A packages/api/go/internal/sync/
git commit -m "refactor(go-sync): relocate canonical+repos to storage/<entity> (Task 3)"
```

---

## Task 4: Clients/normalizers/pipelines relocate to `services/`; `Kind`→`SyncPipelineName`

> Move-only + mechanical rename Task. `clients/`+`normalizers/` →
> `services/shopify/`; `syncio/` → `services/pipelines/types.go`;
> `pipelines/` → `services/pipelines/` (+ `services/pipelines/shopify/`);
> the `Kind` enum becomes `enums.SyncPipelineName`; the factory rekeys
> on `(platform, SyncPipelineName)`. Behavior unchanged.

**Files:**
- Move: `internal/sync/clients/shopify_http_client.go` (+ test) → `internal/sync/services/shopify/client.go`
- Move: `internal/sync/normalizers/shopify/*.go` → `internal/sync/services/shopify/{order,product,product_variant}_normalizer.go`
- Move: `internal/sync/syncio/types.go` → `internal/sync/services/pipelines/types.go`
- Move: `internal/sync/pipelines/{pipeline,ports,factory,pending_pipeline}.go` (+ tests) → `internal/sync/services/pipelines/`
- Move: `internal/sync/pipelines/shopify_orders_pipeline.go` `shopify_products_pipeline.go` (+ tests) → `internal/sync/services/pipelines/shopify/{orders,products}.go`
- Modify: `services/pipelines/pipeline.go` — `Kind` → `enums.SyncPipelineName`; constants `KindOrders`→`enums.SyncPipelineOrders` etc
- Modify: `services/pipelines/factory.go` — key on `(platform, enums.SyncPipelineName)`
- Modify: `internal/sync/orchestrator/orchestrator.go` + `controllers/sync_controller.go` — update import paths + `Kind` references
- Delete: `internal/sync/clients/` `internal/sync/normalizers/` `internal/sync/syncio/` `internal/sync/pipelines/`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /repository
**Depends on:** 2, 3

- [ ] **Step 1: Relocate client + normalizers under services/shopify**

```bash
git mv internal/sync/clients/shopify_http_client.go internal/sync/services/shopify/client.go
git mv internal/sync/clients/shopify_http_client_test.go internal/sync/services/shopify/client_test.go
```
Move each `normalizers/shopify/<x>.go` → `services/shopify/<entity>_normalizer.go`. Set all to `package shopify`. Update the canonical import qualifiers to the Task-3 per-entity packages (`order.Order`, etc).

- [ ] **Step 2: Relocate syncio + pipelines under services/pipelines**

```bash
git mv internal/sync/syncio/types.go internal/sync/services/pipelines/types.go
```
Change `package syncio` → `package pipelines`. Delete the `RunInput = syncio.RunInput` aliases in `pipeline.go` (the structs now live in the same package). Move `pipeline.go`/`ports.go`/`factory.go`/`pending_pipeline.go` (+ tests) into `services/pipelines/` (`package pipelines` unchanged). Move the two Shopify pipeline impls into `services/pipelines/shopify/` as `package shopify` (they import the parent `pipelines` package for the interface + types).

- [ ] **Step 3: Rename `Kind` → `enums.SyncPipelineName`**

Modify `services/pipelines/pipeline.go`:

```diff
- import (
- 	"context"
- 	"errors"
- 	"template/api-go/internal/sync/syncio"
- )
+ import (
+ 	"context"
+ 	"errors"
+ 	"template/api-go/internal/sync/enums"
+ )
-
- type Kind string
- const (
- 	KindOrders   Kind = "orders"
- 	KindProducts Kind = "products"
- 	KindVariants Kind = "variants"
- )
- type ( RunInput = syncio.RunInput; RunResult = syncio.RunResult )
```

`Pipeline` interface becomes:

```go
type Pipeline interface {
	Platform() string
	Pipeline() enums.SyncPipelineName
	Run(ctx context.Context, in RunInput, publisher ExternalEventPublisher) (RunResult, error)
}
```

> The `publisher ExternalEventPublisher` arg + the `ports.go` rewrite land in **Task 8** (behavioral change). For THIS move-only Task, keep the current `Run(ctx, in) (RunResult, error)` signature and only rename `Kind`→`enums.SyncPipelineName` + `Kind()`→`Pipeline()`. Update the two Shopify impls' `Kind()` methods → `Pipeline()` returning `enums.SyncPipelineOrders` / `enums.SyncPipelineProducts`.

- [ ] **Step 4: Rekey the factory**

Modify `services/pipelines/factory.go` — replace `Kind` with `enums.SyncPipelineName` throughout; `key(platform, name)` unchanged in spirit:

```diff
- func (f *Factory) Get(platform string, kind Kind) (Pipeline, bool) {
+ func (f *Factory) Get(platform string, name enums.SyncPipelineName) (Pipeline, bool) {
```

Update `Registered()` to return `enums.SyncPipelineName`. Update `orchestrator.go` + `sync_controller.go` references (`pipelines.Kind`→`enums.SyncPipelineName`, `KindOrders`→`SyncPipelineOrders`, import paths to `services/pipelines`). Update the pipeline tests' mocks (`Kind()`→`Pipeline()`).

- [ ] **Step 5: Delete emptied folders**

```bash
git rm -r internal/sync/clients internal/sync/normalizers internal/sync/syncio internal/sync/pipelines
```

- [ ] **Step 6: Build + test**

Run: `cd packages/api/go && go build ./... && go test ./internal/sync/...`
Expected: build 0 errors; relocated pipeline/client tests PASS. `orchestrator` + `sync_controller` still compile (they're deleted/rewritten in Task 10).

- [ ] **Step 7: Commit**

```bash
git add -A packages/api/go/internal/sync/
git commit -m "refactor(go-sync): relocate clients/normalizers/pipelines to services/; Kind→SyncPipelineName (Task 4)"
```

---

## Task 5: `sync_job` aggregate enforces its lifecycle invariants

**Files:**
- Create: `packages/api/go/internal/sync/entities/sync_job.go`
- Create: `packages/api/go/internal/sync/entities/sync_job_test.go`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /test
**Depends on:** 2

- [ ] **Step 1: Write the failing test**

Create `packages/api/go/internal/sync/entities/sync_job_test.go`:

```go
package entities

import (
	"testing"

	"template/api-go/internal/sync/enums"
	coreerrors "template/core-go/errors"
	"template/core-go/objects"
)

func newJob() *SyncJob {
	return NewSyncJob(NewSyncJobParams{
		StoreID:            objects.NewID(),
		StoreIntegrationID: objects.NewID(),
		Platform:           "SHOPIFY",
		Pipelines:          []enums.SyncPipelineName{enums.SyncPipelineOrders},
	})
}

func TestSyncJob_NewIsPending(t *testing.T) {
	if newJob().Status != enums.SyncStatusPending {
		t.Errorf("new job status = %q, want PENDING", newJob().Status)
	}
}

func TestSyncJob_StartFromPending(t *testing.T) {
	j := newJob()
	if err := j.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if j.Status != enums.SyncStatusRunning {
		t.Errorf("status = %q, want RUNNING", j.Status)
	}
}

func TestSyncJob_StartTwiceFails(t *testing.T) {
	j := newJob()
	_ = j.Start()
	err := j.Start()
	if err == nil {
		t.Fatal("expected error starting a RUNNING job")
	}
	if ae, ok := err.(*coreerrors.AppError); !ok || ae.Code != "SYNC_ALREADY_RUNNING" {
		t.Errorf("error code = %v, want SYNC_ALREADY_RUNNING", err)
	}
}

func TestSyncJob_CancelCompletedFails(t *testing.T) {
	j := newJob()
	_ = j.Start()
	j.Complete(42)
	err := j.Cancel()
	if err == nil {
		t.Fatal("expected error cancelling a COMPLETED job")
	}
	if ae, ok := err.(*coreerrors.AppError); !ok || ae.Code != "SYNC_CANNOT_BE_CANCELLED" {
		t.Errorf("error code = %v, want SYNC_CANNOT_BE_CANCELLED", err)
	}
	if j.Status != enums.SyncStatusCompleted {
		t.Errorf("status mutated to %q; cancel must be a no-op on failure", j.Status)
	}
}

func TestSyncJob_CompleteSetsProgressAndRecords(t *testing.T) {
	j := newJob()
	_ = j.Start()
	j.Complete(7)
	if j.Status != enums.SyncStatusCompleted || j.Progress != 100 || j.RecordsProcessed != 7 {
		t.Errorf("complete = {%q,%d,%d}, want {COMPLETED,100,7}", j.Status, j.Progress, j.RecordsProcessed)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api/go && go test ./internal/sync/entities/...`
Expected: FAIL — `undefined: NewSyncJob`.

- [ ] **Step 3: Write the aggregate**

Create `packages/api/go/internal/sync/entities/sync_job.go`:

```go
// Package entities holds the sync bounded context's aggregates.
package entities

import (
	"time"

	coreentities "template/core-go/entities"
	coreerrors "template/core-go/errors"
	"template/core-go/objects"

	"template/api-go/internal/sync/enums"
	ctxerrors "template/api-go/internal/sync/errors"
)

// SyncJob is the aggregate tracking one data-pull run's lifecycle.
// PENDING → RUNNING → COMPLETED | FAILED | CANCELLED.
type SyncJob struct {
	coreentities.BaseEntity
	StoreID            objects.ID
	StoreIntegrationID objects.ID
	Platform           string
	Pipelines          []enums.SyncPipelineName
	Status             enums.SyncStatus
	WindowStart        *time.Time
	WindowEnd          *time.Time
	Progress           int
	RecordsProcessed   int
	ErrorMessage       string
}

type NewSyncJobParams struct {
	StoreID            objects.ID
	StoreIntegrationID objects.ID
	Platform           string
	Pipelines          []enums.SyncPipelineName
	WindowStart        *time.Time
	WindowEnd          *time.Time
}

func NewSyncJob(p NewSyncJobParams) *SyncJob {
	return &SyncJob{
		BaseEntity:         coreentities.NewBaseEntity(),
		StoreID:            p.StoreID,
		StoreIntegrationID: p.StoreIntegrationID,
		Platform:           p.Platform,
		Pipelines:          p.Pipelines,
		Status:             enums.SyncStatusPending,
		WindowStart:        p.WindowStart,
		WindowEnd:          p.WindowEnd,
	}
}

type ReconstructSyncJobParams struct {
	Base               coreentities.BaseEntity
	StoreID            objects.ID
	StoreIntegrationID objects.ID
	Platform           string
	Pipelines          []enums.SyncPipelineName
	Status             enums.SyncStatus
	WindowStart        *time.Time
	WindowEnd          *time.Time
	Progress           int
	RecordsProcessed   int
	ErrorMessage       string
}

func Reconstruct(p ReconstructSyncJobParams) *SyncJob {
	return &SyncJob{
		BaseEntity:         p.Base,
		StoreID:            p.StoreID,
		StoreIntegrationID: p.StoreIntegrationID,
		Platform:           p.Platform,
		Pipelines:          p.Pipelines,
		Status:             p.Status,
		WindowStart:        p.WindowStart,
		WindowEnd:          p.WindowEnd,
		Progress:           p.Progress,
		RecordsProcessed:   p.RecordsProcessed,
		ErrorMessage:       p.ErrorMessage,
	}
}

func (j *SyncJob) Start() error {
	if j.Status != enums.SyncStatusPending {
		return coreerrors.NewBaseError(ctxerrors.CodeSyncAlreadyRunning, "sync job is not in pending state")
	}
	j.Status = enums.SyncStatusRunning
	_ = j.IncrementVersion()
	return nil
}

func (j *SyncJob) Complete(recordsProcessed int) {
	j.Status = enums.SyncStatusCompleted
	j.Progress = 100
	j.RecordsProcessed = recordsProcessed
	_ = j.IncrementVersion()
}

func (j *SyncJob) Fail(message string) {
	j.Status = enums.SyncStatusFailed
	j.ErrorMessage = message
	_ = j.IncrementVersion()
}

func (j *SyncJob) Cancel() error {
	if j.Status != enums.SyncStatusPending && j.Status != enums.SyncStatusRunning {
		return coreerrors.NewBaseError(ctxerrors.CodeSyncCannotBeCancelled, "can only cancel pending or running sync jobs")
	}
	j.Status = enums.SyncStatusCancelled
	_ = j.IncrementVersion()
	return nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api/go && go test ./internal/sync/entities/...`
Expected: PASS — 5 tests.

- [ ] **Step 5: Build + lint**

Run: `cd packages/api/go && go build ./... && go vet ./internal/sync/entities/...`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/api/go/internal/sync/entities/
git commit -m "feat(go-sync): sync_job aggregate with lifecycle invariants (Task 5)"
```

---

## Task 6: `sync_jobs` table migration

> Migration Task — must precede Task 7 (the repo reads/writes this
> table). The schema is defined in Drizzle (single Postgres, shared
> with TS); Go reads it via raw `database/sql`.

**Files:**
- Create: `packages/contracts/db/schema/sync.ts`
- Modify: `packages/contracts/db/schema/index.ts` — export the new table (if a barrel exists)
- Generate: `packages/contracts/db/migrations/<NNNN>_*.sql` (+ snapshot)

**Agent:** database-architect
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /db-modelling, /migrate
**Depends on:** (none)

- [ ] **Step 1: Define the Drizzle table**

Create `packages/contracts/db/schema/sync.ts` (mirror the column conventions in `schema/sales.ts` — `bigint` cents, `timestamp` with tz, `uuid` PKs):

```ts
import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const syncJobs = pgTable('sync_jobs', {
	id: uuid('id').primaryKey(),
	storeId: uuid('store_id').notNull(),
	storeIntegrationId: uuid('store_integration_id').notNull(),
	platform: text('platform').notNull(),
	pipelines: jsonb('pipelines').notNull(),
	status: text('status').notNull(),
	windowStart: timestamp('window_start', { withTimezone: true }),
	windowEnd: timestamp('window_end', { withTimezone: true }),
	progress: integer('progress').notNull().default(0),
	recordsProcessed: integer('records_processed').notNull().default(0),
	errorMessage: text('error_message').notNull().default(''),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	version: integer('version').notNull().default(1),
})
```

If `packages/contracts/db/schema/index.ts` re-exports per-domain schemas, add `export * from './sync'`.

- [ ] **Step 2: Generate the migration**

Run: `bun migrate:create`
Expected: a new `packages/contracts/db/migrations/<NNNN>_*.sql` with `CREATE TABLE "sync_jobs"` + a matching `meta/<NNNN>_snapshot.json`. This is a pure additive CREATE TABLE — no interactive rename prompts.

- [ ] **Step 3: Apply + verify**

Run: `bun migrate:dev`
Expected: migration applies clean. Verify the table exists:
```bash
psql "$DATABASE_URL" -c '\d sync_jobs'
```
Expected: 14 columns as defined.

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/db/schema/sync.ts packages/contracts/db/schema/index.ts \
        packages/contracts/db/migrations/
git commit -m "feat(db): sync_jobs table (Task 6)"
```

---

## Task 7: `SyncJob` round-trips through Postgres

**Files:**
- Create: `packages/api/go/internal/sync/repositories/syncjob/syncjob_repository.go` (interface)
- Create: `packages/api/go/internal/sync/repositories/syncjob/syncjob_pg.go` (impl)
- Create: `packages/api/go/internal/sync/repositories/syncjob/syncjob_pg_test.go`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository, /test
**Depends on:** 5, 6

- [ ] **Step 1: Write the interface**

Create `packages/api/go/internal/sync/repositories/syncjob/syncjob_repository.go`:

```go
// Package syncjob persists the SyncJob aggregate.
package syncjob

import (
	"context"

	"template/api-go/internal/sync/entities"
	"template/core-go/objects"
)

type SyncJobRepository interface {
	Save(ctx context.Context, job *entities.SyncJob) error
	FindByID(ctx context.Context, id objects.ID) (*entities.SyncJob, error)
	FindRunning(ctx context.Context, storeIntegrationID objects.ID) (*entities.SyncJob, error)
	ListByStore(ctx context.Context, storeID objects.ID, limit int) ([]*entities.SyncJob, error)
}
```

- [ ] **Step 2: Write the failing test**

Create `packages/api/go/internal/sync/repositories/syncjob/syncjob_pg_test.go`. The Go integration-test idiom (confirmed in `core/db/sql/embedded_test.go`) is: read `DATABASE_URL`, `t.Skip` when unset, `sql.Open("pgx", url)` directly — there is no shared `openTestDB` helper, so declare a local one. The `sync_jobs` table must already be migrated (`bun migrate:dev` before `go test`).

```go
package syncjob

import (
	"context"
	"database/sql"
	"os"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"

	"template/api-go/internal/sync/entities"
	"template/api-go/internal/sync/enums"
	"template/core-go/objects"
)

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set — skipping integration test")
	}
	db, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	return db
}

func TestSyncJobPg_SaveAndFindByID(t *testing.T) {
	db := openTestDB(t)
	defer db.Close()
	repo := NewPgSyncJobRepository(db)
	ctx := context.Background()

	job := entities.NewSyncJob(entities.NewSyncJobParams{
		StoreID:            objects.NewID(),
		StoreIntegrationID: objects.NewID(),
		Platform:           "SHOPIFY",
		Pipelines:          []enums.SyncPipelineName{enums.SyncPipelineOrders, enums.SyncPipelineProducts},
	})
	if err := repo.Save(ctx, job); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := repo.FindByID(ctx, job.ID)
	if err != nil {
		t.Fatalf("FindByID: %v", err)
	}
	if got == nil || got.Status != enums.SyncStatusPending || len(got.Pipelines) != 2 {
		t.Errorf("round-trip mismatch: %+v", got)
	}
}

func TestSyncJobPg_FindRunningScopesToIntegration(t *testing.T) {
	db := openTestDB(t)
	defer db.Close()
	repo := NewPgSyncJobRepository(db)
	ctx := context.Background()
	integ := objects.NewID()

	running := entities.NewSyncJob(entities.NewSyncJobParams{
		StoreID: objects.NewID(), StoreIntegrationID: integ, Platform: "SHOPIFY",
		Pipelines: []enums.SyncPipelineName{enums.SyncPipelineOrders},
	})
	_ = running.Start()
	if err := repo.Save(ctx, running); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := repo.FindRunning(ctx, integ)
	if err != nil {
		t.Fatalf("FindRunning: %v", err)
	}
	if got == nil || got.Status != enums.SyncStatusRunning {
		t.Errorf("FindRunning = %+v, want the RUNNING job", got)
	}

	none, _ := repo.FindRunning(ctx, objects.NewID())
	if none != nil {
		t.Errorf("FindRunning for unrelated integration = %+v, want nil", none)
	}
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/api/go && go test ./internal/sync/repositories/syncjob/...`
Expected: FAIL — `undefined: NewPgSyncJobRepository`.

- [ ] **Step 4: Write the PG impl**

Create `packages/api/go/internal/sync/repositories/syncjob/syncjob_pg.go`:

```go
package syncjob

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"

	"template/api-go/internal/sync/entities"
	"template/api-go/internal/sync/enums"
	coreentities "template/core-go/entities"
	"template/core-go/objects"
	"template/core-go/services/unitofwork"
)

type PgSyncJobRepository struct {
	db *sql.DB
}

func NewPgSyncJobRepository(db *sql.DB) *PgSyncJobRepository {
	return &PgSyncJobRepository{db: db}
}

var _ SyncJobRepository = (*PgSyncJobRepository)(nil)

// exec returns the tx from the UoW context when present, else the pool.
func (r *PgSyncJobRepository) querier(ctx context.Context) interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
} {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return tx
	}
	return r.db
}

const upsertSQL = `
INSERT INTO sync_jobs
  (id, store_id, store_integration_id, platform, pipelines, status,
   window_start, window_end, progress, records_processed, error_message,
   created_at, updated_at, version)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status, pipelines = EXCLUDED.pipelines,
  window_start = EXCLUDED.window_start, window_end = EXCLUDED.window_end,
  progress = EXCLUDED.progress, records_processed = EXCLUDED.records_processed,
  error_message = EXCLUDED.error_message, updated_at = EXCLUDED.updated_at,
  version = EXCLUDED.version`

func (r *PgSyncJobRepository) Save(ctx context.Context, j *entities.SyncJob) error {
	pipelines, err := json.Marshal(j.Pipelines)
	if err != nil {
		return err
	}
	_, err = r.querier(ctx).ExecContext(ctx, upsertSQL,
		j.ID.UUID(), j.StoreID.UUID(), j.StoreIntegrationID.UUID(), j.Platform,
		pipelines, string(j.Status), j.WindowStart, j.WindowEnd,
		j.Progress, j.RecordsProcessed, j.ErrorMessage,
		j.CreatedAt, j.UpdatedAt, j.Version,
	)
	return err
}

const selectCols = `id, store_id, store_integration_id, platform, pipelines, status,
  window_start, window_end, progress, records_processed, error_message,
  created_at, updated_at, version`

func (r *PgSyncJobRepository) FindByID(ctx context.Context, id objects.ID) (*entities.SyncJob, error) {
	row := r.querier(ctx).QueryRowContext(ctx, `SELECT `+selectCols+` FROM sync_jobs WHERE id = $1`, id.UUID())
	return scanJob(row)
}

func (r *PgSyncJobRepository) FindRunning(ctx context.Context, integrationID objects.ID) (*entities.SyncJob, error) {
	row := r.querier(ctx).QueryRowContext(ctx,
		`SELECT `+selectCols+` FROM sync_jobs WHERE store_integration_id = $1 AND status = 'RUNNING' ORDER BY created_at DESC LIMIT 1`,
		integrationID.UUID())
	job, err := scanJob(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return job, err
}

func (r *PgSyncJobRepository) ListByStore(ctx context.Context, storeID objects.ID, limit int) ([]*entities.SyncJob, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.querier(ctx).QueryContext(ctx,
		`SELECT `+selectCols+` FROM sync_jobs WHERE store_id = $1 ORDER BY created_at DESC LIMIT $2`,
		storeID.UUID(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*entities.SyncJob
	for rows.Next() {
		job, err := scanJobRows(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, job)
	}
	return out, rows.Err()
}

type scannable interface{ Scan(...any) error }

func scanJob(row *sql.Row) (*entities.SyncJob, error)      { return scanInto(row) }
func scanJobRows(rows *sql.Rows) (*entities.SyncJob, error) { return scanInto(rows) }

func scanInto(s scannable) (*entities.SyncJob, error) {
	// objects.ID is NOT a sql.Scanner (confirmed: core/objects/id.go has
	// only Value() string). Scan uuid columns into uuid.UUID (which DOES
	// implement sql.Scanner/driver.Valuer) and wrap via objects.IDFromUUID.
	var (
		idU, storeU, integU        uuid.UUID
		platform, status, errMsg   string
		pipelinesRaw               []byte
		windowStart, windowEnd     *time.Time
		progress, records, version int
		createdAt, updatedAt       time.Time
	)
	if err := s.Scan(&idU, &storeU, &integU, &platform, &pipelinesRaw, &status,
		&windowStart, &windowEnd, &progress, &records, &errMsg, &createdAt, &updatedAt, &version); err != nil {
		return nil, err
	}
	var pipelines []enums.SyncPipelineName
	if err := json.Unmarshal(pipelinesRaw, &pipelines); err != nil {
		return nil, err
	}
	return entities.Reconstruct(entities.ReconstructSyncJobParams{
		Base: coreentities.ReconstructBaseEntity(coreentities.ReconstructBaseEntityParams{
			ID: idU, CreatedAt: createdAt, UpdatedAt: updatedAt, Version: version,
		}),
		StoreID:            objects.IDFromUUID(storeU),
		StoreIntegrationID: objects.IDFromUUID(integU),
		Platform:           platform,
		Pipelines:          pipelines,
		Status:             enums.SyncStatus(status),
		WindowStart:        windowStart,
		WindowEnd:          windowEnd,
		Progress:           progress,
		RecordsProcessed:   records,
		ErrorMessage:       errMsg,
	}), nil
}
```

> Implementer note: the upsert binds `j.ID.UUID()` etc (already a `uuid.UUID`, which `pgx` accepts as a Valuer) — correct. `*time.Time` handles the nullable `window_*` columns. `google/uuid.UUID` implements both `sql.Scanner` and `driver.Valuer`, so no wrapper needed on the scan targets — only the `objects.IDFromUUID` wrap when building the entity.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/api/go && go test ./internal/sync/repositories/syncjob/...`
Expected: PASS — 2 tests (requires the migrated test DB).

- [ ] **Step 6: Build + commit**

Run: `cd packages/api/go && go build ./...`
```bash
git add packages/api/go/internal/sync/repositories/syncjob/
git commit -m "feat(go-sync): SyncJob Postgres repository (Task 7)"
```

---

## Task 8: Pipelines publish `ExternalXUpdatedEvent` instead of writing storage

> Behavioral change (Decision 11). The `ports.go` OrderRepository /
> ProductRepository / ProductVariantRepository / OutboxWriter are
> replaced by a single `ExternalEventPublisher` port. The pipeline
> calls `publisher.Publish(ctx, event)` per normalized entity as it
> streams. The `outbox/` folder + `PgOutboxWriter` are deleted (their
> canonical→wire translation moves to handlers in Task 9).

**Files:**
- Create: `packages/api/go/internal/sync/events/external_order_updated.go`
- Create: `packages/api/go/internal/sync/events/external_product_updated.go`
- Create: `packages/api/go/internal/sync/events/external_product_variant_updated.go`
- Modify: `internal/sync/services/pipelines/ports.go` — drop repo/outbox ports; add `ExternalEventPublisher`
- Modify: `internal/sync/services/pipelines/pipeline.go` — `Run(ctx, in, publisher)` signature
- Modify: `internal/sync/services/pipelines/shopify/{orders,products}.go` — publish events instead of upsert+enqueue
- Modify: `internal/sync/services/pipelines/*_test.go` — assert published events, not upserts
- Delete: `internal/sync/outbox/` (`pg_outbox_writer.go` + test)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /event, /service, /test
**Depends on:** 3, 4

- [ ] **Step 1: Write the event payloads**

Create `packages/api/go/internal/sync/events/external_order_updated.go`:

```go
// Package events holds the sync BC's domain events. The ExternalX
// events are the indirection layer between an ingest source (sync
// pipeline now; webhook in Spec B) and the per-entity handler that
// persists the canonical entity + publishes the wire event.
package events

import (
	"template/api-go/internal/sync/storage/order"
	"template/core-go/types"
)

type ExternalOrderUpdatedPayload struct {
	Order *order.Order `json:"order"`
}

const ExternalOrderUpdatedEventName = "sync.external_order_updated"

type ExternalOrderUpdatedEvent = types.DomainEvent[ExternalOrderUpdatedPayload]

func NewExternalOrderUpdated(o *order.Order, ownerID string) ExternalOrderUpdatedEvent {
	return types.NewDomainEvent(ExternalOrderUpdatedEventName, o.ID().UUID(), ownerID,
		ExternalOrderUpdatedPayload{Order: o})
}
```

> If `order.Order`'s fields are unexported (Task 3 kept them private), the payload can't JSON-serialize the order through the outbox for the async path. Two options the implementer picks based on `order.Order`'s shape: (a) add a `MarshalJSON`/exported snapshot accessor on `order.Order`, or (b) carry the normalized provider input (`order.OrderInput`) in the payload instead of the built aggregate, and have the handler rebuild via the existing constructor. Prefer (b) — it keeps the wire event payload aligned with what the webhook mapper (Spec B) will produce. Adjust the payload to `OrderInput order.OrderInput` if so.

Repeat for `external_product_updated.go` + `external_product_variant_updated.go` (payloads + names `sync.external_product_updated` / `sync.external_product_variant_updated`).

- [ ] **Step 2: Rewrite ports + pipeline signature**

Replace `internal/sync/services/pipelines/ports.go` contents:

```go
package pipelines

import (
	"context"

	"template/core-go/types"
)

// ExternalEventPublisher is what a Pipeline calls per normalized
// entity. The executor injects a synchronous impl (mediator.Dispatch)
// for /sync + execute_sync, or an async impl (DomainEventRepository
// .Save → outbox) for async_execute_sync. The Pipeline neither
// persists nor knows which mode it runs in.
type ExternalEventPublisher interface {
	Publish(ctx context.Context, event types.DomainEventI) error
}

// ShopifyClient stays as-is (paging port) — copy the existing
// ShopifyClient interface block here unchanged.
```

> Keep the existing `ShopifyClient` interface (the paging port) in `ports.go` — only the repository/outbox ports are removed. The `ShopifyClient` block moved here in Task 4; leave it intact.

Modify `pipeline.go` `Run` signature (from Task 4's placeholder) to take the publisher:

```go
type Pipeline interface {
	Platform() string
	Pipeline() enums.SyncPipelineName
	Run(ctx context.Context, in RunInput, publisher ExternalEventPublisher) (RunResult, error)
}
```

- [ ] **Step 3: Rewrite the failing pipeline test (RED)**

Modify `internal/sync/services/pipelines/shopify/orders_test.go` — replace the `mockOrderRepo` + `mockOutbox` with a `capturePublisher` that records published events, and assert the pipeline publishes one `ExternalOrderUpdatedEvent` per page row:

```go
type capturePublisher struct{ events []types.DomainEventI }

func (c *capturePublisher) Publish(_ context.Context, e types.DomainEventI) error {
	c.events = append(c.events, e)
	return nil
}

func TestShopifyOrdersPipeline_PublishesExternalEvents(t *testing.T) {
	client := &mockShopifyClient{pages: [][][]byte{{rawOrderJSON}}}
	pub := &capturePublisher{}
	p := NewShopifyOrdersPipeline(client /* + normalizer dep */)

	res, err := p.Run(context.Background(), pipelines.RunInput{StoreID: "s", StoreIntegrationID: "si"}, pub)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.RowsTouched != 1 || len(pub.events) != 1 {
		t.Errorf("rows=%d events=%d, want 1/1", res.RowsTouched, len(pub.events))
	}
	if pub.events[0].GetEventName() != events.ExternalOrderUpdatedEventName {
		t.Errorf("event = %q, want %q", pub.events[0].GetEventName(), events.ExternalOrderUpdatedEventName)
	}
}
```

Run: `cd packages/api/go && go test ./internal/sync/services/pipelines/...`
Expected: FAIL (pipeline still upserts; publisher unused).

- [ ] **Step 4: Rewrite the pipelines to publish (GREEN)**

In `shopify/orders.go`: drop the `OrderRepository` + `OutboxWriter` fields; the `Run` loop, after building the canonical `order.Order`, calls:

```go
ownerID := in.StoreID
if err := publisher.Publish(ctx, events.NewExternalOrderUpdated(built, ownerID)); err != nil {
	return RunResult{}, err
}
rows++
```

(Same shape for `products.go` + the variant extraction.) Remove the now-unused repo/outbox constructor params; update `NewShopifyOrdersPipeline` / `NewShopifyProductsPipeline` signatures.

- [ ] **Step 5: Delete the outbox folder**

```bash
git rm -r internal/sync/outbox
```

- [ ] **Step 6: Run tests + build**

Run: `cd packages/api/go && go test ./internal/sync/services/... && go build ./...`
Expected: pipeline tests PASS. Build may fail in `module.go` (still provides outbox/repos) — that's rewired in Task 10; if Task 8 must build standalone, temporarily comment the outbox/repo providers in `module.go` (Task 10 rewrites it fully).

- [ ] **Step 7: Commit**

```bash
git add -A packages/api/go/internal/sync/services/pipelines/ packages/api/go/internal/sync/events/
git rm -r packages/api/go/internal/sync/outbox 2>/dev/null || true
git commit -m "feat(go-sync): pipelines publish ExternalXUpdatedEvent via injected publisher (Task 8)"
```

---

## Task 9: Handlers persist canonical + publish the wire event

> The per-entity handler is the shared persistence site (Decision 11):
> it consumes `ExternalXUpdatedEvent`, upserts to `storage/<entity>`,
> and saves the wire event via `DomainEventRepository`. This absorbs
> the deleted `PgOutboxWriter`'s canonical→wire translation. Spec B's
> webhook flow registers the SAME handlers.

**Files:**
- Create: `packages/api/go/internal/sync/handlers/order_updated_handler.go`
- Create: `packages/api/go/internal/sync/handlers/order_updated_handler_test.go`
- Create: `packages/api/go/internal/sync/handlers/product_updated_handler.go` (+ test)
- Create: `packages/api/go/internal/sync/handlers/product_variant_updated_handler.go` (+ test)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler, /test
**Depends on:** 8

- [ ] **Step 1: Write the failing test**

Create `packages/api/go/internal/sync/handlers/order_updated_handler_test.go`. Use fakes for `order.Storage` + `DomainEventRepository`; assert one upsert + one wire-event Save:

```go
package handlers

import (
	"context"
	"testing"

	"template/api-go/internal/sync/events"
	"template/api-go/internal/sync/storage/order"
	"template/core-go/types"
)

type fakeOrderStorage struct{ upserts []*order.Order }

func (f *fakeOrderStorage) UpsertOrder(_ context.Context, o *order.Order) error {
	f.upserts = append(f.upserts, o)
	return nil
}

type fakeEventRepo struct{ saved []types.DomainEventI }

func (f *fakeEventRepo) Save(_ context.Context, e types.DomainEventI) error {
	f.saved = append(f.saved, e)
	return nil
}
func (f *fakeEventRepo) SaveAll(_ context.Context, es []types.DomainEventI) error {
	f.saved = append(f.saved, es...)
	return nil
}

func TestOrderUpdatedHandler_PersistsAndPublishes(t *testing.T) {
	storage := &fakeOrderStorage{}
	repo := &fakeEventRepo{}
	h := NewOrderUpdatedHandler(storage, repo)

	if h.EventName() != events.ExternalOrderUpdatedEventName {
		t.Fatalf("EventName = %q", h.EventName())
	}

	built := buildTestOrder(t) // helper builds a valid canonical order
	evt := events.NewExternalOrderUpdated(built, "store-1")
	if err := h.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(storage.upserts) != 1 {
		t.Errorf("upserts = %d, want 1", len(storage.upserts))
	}
	if len(repo.saved) != 1 || repo.saved[0].GetEventName() != "integration.shared.order.updated" {
		t.Errorf("wire events = %+v, want 1 order.updated", repo.saved)
	}
}
```

> The wire event name (`integration.shared.order.updated`) must match what the deleted `PgOutboxWriter.EnqueueOrderUpdated` produced — copy the exact name + payload shape from the (pre-deletion) `outbox/pg_outbox_writer.go` so downstream TS consumers see no contract change.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api/go && go test ./internal/sync/handlers/...`
Expected: FAIL — `undefined: NewOrderUpdatedHandler`.

- [ ] **Step 3: Write the handler**

Create `packages/api/go/internal/sync/handlers/order_updated_handler.go`:

```go
// Package handlers persists canonical entities + publishes wire
// events in reaction to ExternalXUpdatedEvent. Shared by sync
// pipelines (Task 8) and Spec B's webhook flow.
package handlers

import (
	"context"
	"fmt"

	"template/api-go/internal/sync/events"
	"template/api-go/internal/sync/storage/order"
	corerepos "template/core-go/repositories"
	"template/core-go/types"
	wire "template/contracts-go/wire"
)

type OrderUpdatedHandler struct {
	storage   order.Storage
	eventRepo corerepos.DomainEventRepository
}

func NewOrderUpdatedHandler(storage order.Storage, eventRepo corerepos.DomainEventRepository) *OrderUpdatedHandler {
	return &OrderUpdatedHandler{storage: storage, eventRepo: eventRepo}
}

func (h *OrderUpdatedHandler) EventName() string { return events.ExternalOrderUpdatedEventName }

func (h *OrderUpdatedHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	evt, ok := event.(events.ExternalOrderUpdatedEvent)
	if !ok {
		return fmt.Errorf("order handler: unexpected event type %T", event)
	}
	o := evt.Payload.Order
	if err := h.storage.UpsertOrder(ctx, o); err != nil {
		return err
	}
	// Translate canonical → wire event (logic lifted from the deleted
	// PgOutboxWriter.EnqueueOrderUpdated; preserve the exact wire shape).
	wireEvt := buildOrderUpdatedWireEvent(o) // copy translation from old pg_outbox_writer.go
	return h.eventRepo.Save(ctx, wireEvt)
}
```

> `buildOrderUpdatedWireEvent` is the canonical→`wire.OrderUpdated` translation copied from the deleted `pg_outbox_writer.go` (`EnqueueOrderUpdated`). Inline it as an unexported func in this file — same field mapping, same event name, same `ownerID = storeId`. Repeat the whole handler shape for product + product_variant.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api/go && go test ./internal/sync/handlers/...`
Expected: PASS.

- [ ] **Step 5: Build + commit**

Run: `cd packages/api/go && go build ./...` (may still fail in module.go — rewired in Task 10).
```bash
git add packages/api/go/internal/sync/handlers/
git commit -m "feat(go-sync): per-entity handlers persist canonical + publish wire event (Task 9)"
```

---

## Task 10: Executor runs a job; controllers expose start/execute + back-compat /sync

> The behavior cluster around running a job. The executor loads the
> job → RUNNING → runs each pipeline with a sync publisher
> (mediator.Dispatch, inline) → Complete/Fail. `start_sync` creates
> the job; `execute_sync` runs it; `POST /sync` delegates to
> start→execute for back-compat. `marketing_reconcile.go` +
> `orchestrator/` are deleted; `module.go` is rewritten.

**Files:**
- Create: `internal/sync/services/executor/executor.go` (+ test)
- Create: `internal/sync/usecases/start_sync.go` `execute_sync.go` (+ tests)
- Create: `internal/sync/controllers/start_sync.go` `execute_sync.go`
- Modify: `internal/sync/controllers/sync_controller.go` — delegate to start→execute
- Delete: `internal/sync/controllers/marketing_reconcile.go`
- Delete: `internal/sync/orchestrator/`
- Rewrite: `internal/sync/module.go` — full fx wiring for the new shape

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /usecase, /controller, /test
**Depends on:** 7, 9

- [ ] **Step 1: Write the failing executor test**

Create `internal/sync/services/executor/executor_test.go`. Fake the syncjob repo + pipeline factory + a recording mediator; assert: job goes RUNNING then COMPLETED, and each pipeline's published events were dispatched to the (registered) handler synchronously:

```go
package executor

import (
	"context"
	"testing"

	"template/api-go/internal/sync/enums"
	// fakes for syncjob repo, factory, mediator
)

func TestExecutor_RunsPipelinesAndCompletesJob(t *testing.T) {
	// Given a PENDING job with [ORDERS], a factory returning a fake
	// orders pipeline that publishes 3 events, and a recording mediator.
	// When Execute(jobID) runs synchronously,
	// Then job.Status == COMPLETED, records == 3, and the mediator
	// dispatched 3 ExternalOrderUpdatedEvents inline.
}

func TestExecutor_PipelineErrorFailsJob(t *testing.T) {
	// Given a pipeline that returns an error,
	// When Execute runs,
	// Then job.Status == FAILED with the error message.
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api/go && go test ./internal/sync/services/executor/...`
Expected: FAIL — package/symbol undefined.

- [ ] **Step 3: Write the executor**

Create `internal/sync/services/executor/executor.go`:

```go
// Package executor runs a SyncJob through its pipelines. Replaces the
// former orchestrator/. For synchronous runs it dispatches each
// ExternalXUpdatedEvent inline through the mediator (handlers persist
// before the caller's response); the async path (Task 11
// async_execute_sync) swaps in an outbox-backed publisher.
package executor

import (
	"context"

	"template/api-go/internal/sync/entities"
	"template/api-go/internal/sync/repositories/syncjob"
	"template/api-go/internal/sync/services/pipelines"
	"template/core-go/objects"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// syncPublisher dispatches events inline through the mediator so the
// handler's storage write completes before the HTTP response.
type syncPublisher struct{ m mediator.InternalMediator }

func (p syncPublisher) Publish(ctx context.Context, e types.DomainEventI) error {
	return p.m.Dispatch(ctx, e)
}

type Executor struct {
	jobs     syncjob.SyncJobRepository
	factory  *pipelines.Factory
	mediator mediator.InternalMediator
}

func NewExecutor(jobs syncjob.SyncJobRepository, factory *pipelines.Factory, m mediator.InternalMediator) *Executor {
	return &Executor{jobs: jobs, factory: factory, mediator: m}
}

// Execute runs the job's pipelines synchronously. Returns the terminal
// job. Caller persists the job (or the executor saves it — see Save
// calls). Inline-dispatch publisher means handlers run before return.
func (e *Executor) Execute(ctx context.Context, jobID string) (*entities.SyncJob, error) {
	id, err := objects.IDFromString(jobID)
	if err != nil {
		return nil, err
	}
	job, err := e.jobs.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := job.Start(); err != nil {
		return job, err
	}
	if err := e.jobs.Save(ctx, job); err != nil {
		return job, err
	}

	pub := syncPublisher{m: e.mediator}
	in := pipelines.RunInput{
		StoreID:            job.StoreID.String(),
		StoreIntegrationID: job.StoreIntegrationID.String(),
	}
	total := 0
	for _, name := range job.Pipelines {
		p, ok := e.factory.Get(job.Platform, name)
		if !ok {
			job.Fail("unknown pipeline: " + string(name))
			_ = e.jobs.Save(ctx, job)
			return job, nil
		}
		res, err := p.Run(ctx, in, pub)
		if err != nil {
			job.Fail(err.Error())
			_ = e.jobs.Save(ctx, job)
			return job, nil
		}
		total += res.RowsTouched
	}
	job.Complete(total)
	if err := e.jobs.Save(ctx, job); err != nil {
		return job, err
	}
	return job, nil
}
```

- [ ] **Step 4: Run executor test → PASS**

Run: `cd packages/api/go && go test ./internal/sync/services/executor/...`
Expected: PASS — 2 tests.

- [ ] **Step 5: Write start_sync + execute_sync usecases (failing test first)**

Create `internal/sync/usecases/start_sync_test.go` asserting: rejects when a RUNNING job exists for the integration (`SYNC_ALREADY_RUNNING`); creates a PENDING job otherwise. Then `start_sync.go`:

```go
package usecases

import (
	"context"

	"template/api-go/internal/sync/entities"
	"template/api-go/internal/sync/enums"
	ctxerrors "template/api-go/internal/sync/errors"
	"template/api-go/internal/sync/repositories/syncjob"
	coreerrors "template/core-go/errors"
	"template/core-go/objects"
	"template/core-go/services/unitofwork"
)

type StartSyncInput struct {
	StoreID            string                   `validate:"required,uuid"`
	StoreIntegrationID string                   `validate:"required,uuid"`
	Platform           string                   `validate:"required"`
	Pipelines          []enums.SyncPipelineName `validate:"required,min=1"`
}

type StartSyncOutput struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

type StartSync struct {
	jobs syncjob.SyncJobRepository
	uow  unitofwork.UnitOfWork
}

func NewStartSync(jobs syncjob.SyncJobRepository, uow unitofwork.UnitOfWork) *StartSync {
	return &StartSync{jobs: jobs, uow: uow}
}

func (u *StartSync) Name() string { return "StartSync" }

func (u *StartSync) Execute(ctx context.Context, in StartSyncInput) (StartSyncOutput, error) {
	integID, err := objects.IDFromString(in.StoreIntegrationID)
	if err != nil {
		return StartSyncOutput{}, coreerrors.NewBaseError(coreerrors.CodeInvalidID, "invalid integration id")
	}
	running, err := u.jobs.FindRunning(ctx, integID)
	if err != nil {
		return StartSyncOutput{}, err
	}
	if running != nil {
		return StartSyncOutput{}, coreerrors.NewBaseError(ctxerrors.CodeSyncAlreadyRunning, "a sync is already running for this integration")
	}
	storeID, _ := objects.IDFromString(in.StoreID)
	job := entities.NewSyncJob(entities.NewSyncJobParams{
		StoreID: storeID, StoreIntegrationID: integID, Platform: in.Platform, Pipelines: in.Pipelines,
	})
	if err := u.uow.Execute(ctx, func(txCtx context.Context) error {
		return u.jobs.Save(txCtx, job)
	}); err != nil {
		return StartSyncOutput{}, err
	}
	return StartSyncOutput{ID: job.ID.String(), Status: string(job.Status)}, nil
}
```

`execute_sync.go` wraps the executor: `NewExecuteSync(executor)` → `Execute(ctx, ExecuteSyncInput{JobID}) (ExecuteSyncOutput, error)` returning `{ID, Status, RecordsProcessed}` from `executor.Execute`.

- [ ] **Step 6: Write the controllers + back-compat /sync**

Create `internal/sync/controllers/start_sync.go`:

```go
package controllers

import (
	"encoding/json"
	"net/http"

	"template/api-go/internal/sync/usecases"
	"template/core-go/errors"
	"template/core-go/types"
)

type StartSyncController struct{ uc *usecases.StartSync }

func NewStartSyncController(uc *usecases.StartSync) *StartSyncController { return &StartSyncController{uc: uc} }

func (c *StartSyncController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context: "sync", Path: "/sync/jobs", Method: http.MethodPost,
		Description: "Create a sync job (PENDING)",
		Tags:        []string{"sync"},
		Request:     usecases.StartSyncInput{}, Response: usecases.StartSyncOutput{}, Status: http.StatusCreated,
		Errors: []errors.ErrorCode{"SYNC_ALREADY_RUNNING", "INVALID_ID"},
	}
}

func (c *StartSyncController) Handle(w http.ResponseWriter, r *http.Request) {
	var in usecases.StartSyncInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, err); return
	}
	out, err := c.uc.Execute(r.Context(), in)
	if err != nil {
		writeAppErr(w, err); return
	}
	writeJSON(w, http.StatusCreated, out)
}
```

> Use the same `writeJSON`/`writeErr`/`writeAppErr` helpers the existing sync controllers use; if none exist, add a small `response.go` in the controllers package mirroring the webhooks BC's `controllers/response.go`. `execute_sync.go` controller is the same shape (`POST /sync/jobs/{id}/execute`).

Modify `internal/sync/controllers/sync_controller.go` — `POST /sync` keeps its body shape but now: builds a `StartSyncInput` from the request, calls `StartSync.Execute` then `ExecuteSync.Execute(jobID)`, and maps the terminal job to the existing `syncResponse{Succeeded,RowsTouched,...}` for back-compat (the `HttpGoSyncWorkerClient.triggerSync` contract is unchanged). Swap the `orchestrator` field for the two usecases.

- [ ] **Step 7: Delete marketing_reconcile + orchestrator; rewrite module.go**

```bash
git rm internal/sync/controllers/marketing_reconcile.go
git rm -r internal/sync/orchestrator
```

Rewrite `internal/sync/module.go` providing: the Shopify client + normalizers; the pipelines (into `group:"pipelines"`); the factory; the syncjob repo (→ `syncjob.SyncJobRepository`); the executor; the start/execute usecases; the handlers (registered with the mediator via an `fx.Invoke` that calls `mediator.Register(h)` for each); the controllers (start_sync, execute_sync, sync_controller, async_execute/list/get_status/cancel from Task 11) into `group:"controllers"`. Keep the `pendingPipelineProviders()` helper but update it to the new `enums.SyncPipelineName` + `(platform, name)` registration.

> Handler registration: add `fx.Invoke(func(m mediator.InternalMediator, oh *handlers.OrderUpdatedHandler, ph *handlers.ProductUpdatedHandler, vh *handlers.ProductVariantUpdatedHandler) { m.Register(oh); m.Register(ph); m.Register(vh) })`. This wires the sync path's inline dispatch + leaves the handlers ready for Spec B's webhook flow.

- [ ] **Step 8: Run tests + build**

Run: `cd packages/api/go && go build ./... && go test ./internal/sync/...`
Expected: build 0 errors; all sync tests PASS (entities, repo, pipelines, handlers, executor, usecases).

- [ ] **Step 9: Smoke the back-compat path**

Run: `cd packages/api/go && go test ./internal/sync/controllers/...`
Expected: the existing `sync_controller_test.go` (updated for the new internals) still asserts `POST /sync` → 200 with `syncResponse`.

- [ ] **Step 10: Commit (completes Commit B)**

```bash
git add -A packages/api/go/internal/sync/
git rm internal/sync/controllers/marketing_reconcile.go 2>/dev/null || true
git rm -r internal/sync/orchestrator 2>/dev/null || true
git commit -m "feat(go-sync): executor + start/execute controllers + back-compat /sync; drop orchestrator+marketing_reconcile (Task 10)"
```

---

## Task 11: Status reads + cancel + async trigger

> The remaining 4 controllers: list_sync_jobs + get_sync_status
> (reads), cancel_sync (lifecycle), async_execute_sync (background
> trigger using the async/outbox publisher).

**Files:**
- Create: `internal/sync/usecases/{list_sync_jobs,get_sync_status,cancel_sync,async_execute_sync}.go` (+ tests)
- Create: `internal/sync/controllers/{list_sync_jobs,get_sync_status,cancel_sync,async_execute_sync}.go`
- Modify: `internal/sync/services/executor/executor.go` — add `ExecuteAsync` using an outbox-backed publisher
- Modify: `internal/sync/module.go` — register the 4 new controllers

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller, /test
**Depends on:** 10

- [ ] **Step 1: Write failing tests**

`get_sync_status_test.go`: returns the job's status; `SYNC_JOB_NOT_FOUND` when missing. `cancel_sync_test.go`: cancels a RUNNING job; returns `SYNC_CANNOT_BE_CANCELLED` for a COMPLETED one (asserts the typed code). `list_sync_jobs_test.go`: returns jobs for a store, newest first. `async_execute_sync_test.go`: publishes via the outbox-backed publisher (asserts `eventRepo.Save` called, mediator NOT dispatched inline).

- [ ] **Step 2: Run → fail**

Run: `cd packages/api/go && go test ./internal/sync/usecases/...`
Expected: FAIL — symbols undefined.

- [ ] **Step 3: Add the async publisher to the executor**

Modify `executor.go`:

```go
// asyncPublisher saves events to the outbox; the dispatcher delivers
// them to the same handlers out-of-band.
type asyncPublisher struct{ repo corerepos.DomainEventRepository }

func (p asyncPublisher) Publish(ctx context.Context, e types.DomainEventI) error {
	return p.repo.Save(ctx, e)
}

func (e *Executor) ExecuteAsync(ctx context.Context, jobID string) error {
	// same loop as Execute but pub := asyncPublisher{repo: e.eventRepo}
	// and it returns immediately after the pipelines enqueue (job marked
	// RUNNING; a downstream completion signal moves it terminal — for
	// Spec A, mark COMPLETED after enqueue since pipelines are synchronous fetch).
}
```

Add `eventRepo corerepos.DomainEventRepository` to the `Executor` struct + `NewExecutor` params; update `module.go` provider.

- [ ] **Step 4: Write the 4 usecases + controllers**

- `GetSyncStatus`: `FindByID` → `{id,status,progress,recordsProcessed,errorMessage}`; not found → `SYNC_JOB_NOT_FOUND`. Controller `GET /sync/jobs/{id}`.
- `ListSyncJobs`: `ListByStore(storeID, limit)` → array. Controller `GET /sync/jobs?storeId=&limit=`.
- `CancelSync`: load → `job.Cancel()` (propagates typed error) → save. Controller `POST /sync/jobs/{id}/cancel`.
- `AsyncExecuteSync`: wraps `executor.ExecuteAsync`. Controller `POST /sync/jobs/{id}/execute-async`.

Each controller mirrors the Task-10 controller shape (Metadata with Request/Response/Errors; decode; call usecase; map AppError). Full bodies — do not abbreviate; each declares its own `Request`/`Response` structs.

- [ ] **Step 5: Register in module.go**

Add the 4 controllers to `group:"controllers"` in `internal/sync/module.go` + provide the 4 usecases.

- [ ] **Step 6: Run tests + build**

Run: `cd packages/api/go && go build ./... && go test ./internal/sync/...`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add -A packages/api/go/internal/sync/
git commit -m "feat(go-sync): list/get-status/cancel/async-execute controllers (Task 11)"
```

---

## Task 12: TS-side drops `triggerMarketingReconcile`

> Decision 13 cross-language coordination. The Go `/marketing/reconcile`
> is gone (Task 10); remove the TS client method + types + callers so
> `bun tsc` stays clean.

**Files:**
- Modify: `packages/api/typescript/src/integration/services/GoSyncWorkerClient/GoSyncWorkerClient.ts` — drop `triggerMarketingReconcile` abstract + `MarketingReconcileRequest`/`MarketingReconcileResponse`
- Modify: `.../HttpGoSyncWorkerClient.ts` — drop the impl
- Modify: `.../MockGoSyncWorkerClient.ts` — drop the impl + `reconcileRequests`/`nextReconcileResponse`
- Modify: any caller (grep `triggerMarketingReconcile`) — remove the call site

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service
**Depends on:** 10

- [ ] **Step 1: Find every reference**

Run: `cd packages/api/typescript && grep -rn "triggerMarketingReconcile\|MarketingReconcileRequest\|MarketingReconcileResponse" src`
Expected: the 3 client files + any use-case caller. Enumerate them.

- [ ] **Step 2: Remove the method + types + callers**

In `GoSyncWorkerClient.ts`: delete the `abstract triggerMarketingReconcile(...)` line + the two exported `type` declarations. In `HttpGoSyncWorkerClient.ts` + `MockGoSyncWorkerClient.ts`: delete the method bodies + the mock's reconcile state fields + the now-unused imports. For each caller found in Step 1, remove the call (if a whole use case existed only to call it, confirm with the spec's Risks note — Spec C reintroduces marketing reconcile via `POST /sync`; for now delete the dead call path).

- [ ] **Step 3: Type-check**

Run: `cd packages/api/typescript && bun tsc`
Expected: 0 errors. (If a use case is left empty, remove it + its registry binding + its test.)

- [ ] **Step 4: Test + commit**

Run: `cd packages/api/typescript && bun test src/integration/`
Expected: PASS (no reconcile assertions remain).
```bash
git add packages/api/typescript/src/integration/
git commit -m "refactor(integration): drop triggerMarketingReconcile (Go route removed) (Task 12)"
```

---

## Task 13: Full-stack verification

**Files:** (none — verification only)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** haiku
**Skills:** (none)
**Depends on:** 11, 12

- [ ] **Step 1: Go build + test**

Run: `cd packages/api/go && go build ./... && go test ./...`
Expected: 0 build errors; all packages PASS.

- [ ] **Step 2: TS type-check**

Run: `cd packages/api/typescript && bun tsc`
Expected: 0 errors.

- [ ] **Step 3: Verify the new route surface**

Run: `cd packages/api/go && go test ./internal/sync/controllers/... ./internal/integrations/controllers/...`
Expected: PASS — `/sync`, `/sync/jobs[...]`, `/integrations/handshake` served; `/marketing/reconcile` gone.

- [ ] **Step 4: Confirm folder shape matches the spec tree**

Run: `cd packages/api/go && ls internal/sync internal/integrations`
Expected: `sync/{enums,entities,errors,events,handlers,controllers,usecases,repositories,storage,services,module.go}`; no `canonical/ clients/ normalizers/ orchestrator/ outbox/ pipelines/ syncio/`; `integrations/{controllers,module.go}`.

---

## Final Validation

- [ ] `cd packages/api/go && go build ./...` — 0 errors
- [ ] `cd packages/api/go && go test ./...` — all packages pass
- [ ] `cd packages/api/go && go vet ./internal/sync/... ./internal/integrations/...` — clean
- [ ] `cd packages/api/typescript && bun tsc` — 0 errors
- [ ] `cd packages/api/typescript && bun test src/integration/` — pass
- [ ] AC mapping (every spec AC → ≥1 test path):
  - AC-1 → `internal/integrations/controllers/handshake_test.go:"TestHandshakeController_MetadataContext"` + `..._DeterministicExternalID`
  - AC-2 → `Task 13 Step 4` folder-shape assertion + `go build ./...`
  - AC-3 → `internal/sync/entities/sync_job_test.go:"TestSyncJob_CancelCompletedFails"`
  - AC-4 → `internal/sync/controllers/*_test.go` (start/execute/async_execute/list/get_status/cancel) + module registration
  - AC-5 → `internal/sync/controllers/sync_controller_test.go:"TestSyncController_HappyPath"` (back-compat) + `bun tsc`
  - AC-6 → `internal/sync/handlers/order_updated_handler_test.go:"TestOrderUpdatedHandler_PersistsAndPublishes"` + `internal/sync/services/executor/executor_test.go:"TestExecutor_RunsPipelinesAndCompletesJob"`
  - AC-7 → `internal/sync/services/pipelines/factory_test.go` ((platform, SyncPipelineName) keying) + `enums/sync_pipeline_name_test.go`
  - AC-8 → `Task 12 Step 3` (`bun tsc` after deletion) + absence of `/marketing/reconcile` route (Task 13 Step 3)
  - AC-9 → absence of `internal/sync/outbox/` (Task 8 delete) + `order_updated_handler_test.go` asserting the wire-event Save
  - AC-10 → Final Validation `go build`/`go test`/`bun tsc`

## Notes

- **Resolved Open Question** (header note): pipeline publishes via injected `ExternalEventPublisher`; executor picks sync (`mediator.Dispatch`) vs async (`eventRepo.Save`→outbox). The handler is identical for both and is what Spec B reuses.
- **Wire-event contract preservation:** Task 9 handlers must reproduce the exact event names + payloads the deleted `PgOutboxWriter` produced (`integration.shared.order.updated` etc) so TS-side consumers see no change. Copy the translation from `outbox/pg_outbox_writer.go` BEFORE deleting it in Task 8 (read it during Task 8, inline it in Task 9).
- **`order.Order` JSON-serializability:** if the canonical aggregate's fields are unexported, the async/outbox path can't round-trip the event payload. Prefer carrying the normalized `OrderInput` (provider-shaped, exported) in the `ExternalXUpdatedPayload` and rebuilding via the constructor in the handler — this also matches what Spec B's webhook mapper will produce.
- **Test DB bootstrap:** `syncjob_pg_test.go` is the only DB-touching Go test added (the storage PG repos remain untested — same as today). The Go idiom is per-test `sql.Open("pgx", os.Getenv("DATABASE_URL"))` + `t.Skip` when unset (see `core/db/sql/embedded_test.go`); `core/repositories/testmain_test.go` is package-scoped and NOT reusable from `syncjob`. Run `bun migrate:dev` so `sync_jobs` exists before `go test`.
- **`/marketing/reconcile` 404 window** (spec Risks): Spec C reintroduces it as `SyncPipelineName.MARKETING_METRICS` via `POST /sync`. Confirm no production scheduler hits the route before Task 10 deletes it.
- **Commit boundaries:** Task 1 = Commit A. Tasks 2–10 = Commit B (per Decision 15 the restructure is one logical commit; the plan commits incrementally to keep build green at each step — acceptable since each step builds). Tasks 11–12 = follow-ups. If strict two-commit shape is required, squash 2–11 before merge.
