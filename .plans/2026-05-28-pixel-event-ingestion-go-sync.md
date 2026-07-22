# Pixel Event Ingestion (Go Sync External Event) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** Add a high-concurrency, browser-origin pixel ingest path to the Go worker so each Shopify pixel event is accepted at `/webhooks?type=PIXEL_EVENT`, normalized, persisted to `tracking.pixel_events`, and published as `integration.shared.pixel_event.recorded` — reusing the existing webhooks→sync pipeline with pixel as a new `sync.external_*` event.

**Architecture:** Pixel becomes a member of the `SyncEventName` union. The `webhooks` controller gains a `type=PIXEL_EVENT` branch (no HMAC) that saves the existing `WebhookReceivedEvent` with `event=sync.external_pixel_event_recorded`; the existing `WebhookReceivedHandler` resolves a new Shopify pixel mapper → `ExternalPixelEventRecordedEvent`; a new `sync` `PixelEventRecordedHandler` resolves the sales-channel record (cached) for `storeId`+`externalId`, throttles per-visitor (Redis), synthesizes missing funnel stages, and enqueues canonical `PixelEvent`s on a channel-drain storage that bulk-UPSERTs `tracking.pixel_events` + writes the wire event in one UnitOfWork tx — mirroring `storage/order`.

**Tech Stack:** Go, fx, net/http, pgx, Postgres, Redis (go-redis/v9), TypeSpec contracts; TypeScript/Bun for the contracts codegen.

**Spec:** .specs/2026-05-28-pixel-event-ingestion-go-sync-design.md
**Tasks:** 8
**Estimated minutes:** 250

---

## Task T1: Pixel joins the SyncEventName union (contract lock)

**Files to write:**
- Modify: `packages/contracts/wire/enums/sync-event-name.tsp` — add `EXTERNAL_PIXEL_EVENT_RECORDED`
- Regen: `packages/contracts/generated/go/wire/enums.go` + `packages/contracts/generated/typescript/**` (via `bun contracts` codegen)

**Files to read:**
- `packages/contracts/wire/enums/sync-event-name.tsp`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** (none)

### Step T1.1 — Add the enum value

Modify `packages/contracts/wire/enums/sync-event-name.tsp` — add one member after `EXTERNAL_AD_SPEND_RECORDED`:

```diff
   EXTERNAL_AD_SPEND_RECORDED: "sync.external_ad_spend_recorded",
+  EXTERNAL_PIXEL_EVENT_RECORDED: "sync.external_pixel_event_recorded",
 }
```

### Step T1.2 — Regenerate wire bindings (Go + TS)

Run: `cd packages/contracts && bun run tsp:compile && bun run codegen:wire`
Expected: no errors; `generated/go/wire/enums.go` rewritten.

### Step T1.3 — Verify the Go constant exists

Run: `grep -n "SyncEventNameEXTERNAL_PIXEL_EVENT_RECORDED" packages/contracts/generated/go/wire/enums.go`
Expected: a line defining `SyncEventNameEXTERNAL_PIXEL_EVENT_RECORDED SyncEventName = "sync.external_pixel_event_recorded"` and its inclusion in the `ParseSyncEventName` switch.

### Step T1.4 — Build Go to confirm nothing broke

Run: `cd packages/api/go && go build ./...`
Expected: exit 0.

### Step T1.5 — Commit

```bash
git add packages/contracts/wire/enums/sync-event-name.tsp packages/contracts/generated/
git commit -m "feat(contracts): add EXTERNAL_PIXEL_EVENT_RECORDED to SyncEventName (Task T1)"
```

---

## Task T2: PixelEvent aggregate validates input and derives a deterministic id

**Files to write:**
- Create: `packages/api/go/internal/sync/entities/pixel_event.go`
- Test: `packages/api/go/internal/sync/entities/pixel_event_test.go`
- Create: `packages/api/go/internal/sync/events/external_pixel_event_recorded.go`

**Files to read:**
- `packages/api/go/internal/sync/entities/business_account.go`
- `packages/api/go/internal/sync/events/external_order_updated.go`
- `packages/api/go/internal/sync/objects/utm_tags.go`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /event, /test
**Depends on:** T1

### Step T2.1 — Write the failing test

Create `packages/api/go/internal/sync/entities/pixel_event_test.go`:

```go
package entities

import (
	"testing"
	"time"

	wire "template/contracts-go/wire"
)

func validPixelInput() PixelEventInput {
	return PixelEventInput{
		Platform:           string(wire.SalesPlatformSHOPIFY),
		StoreIntegrationID: "11111111-1111-1111-1111-111111111111",
		EventType:          string(wire.PixelEventTypeCHECKOUT_COMPLETED),
		ExternalEventID:    "evt-123",
		VisitorKey:         "visitor-abc",
		OccurredAt:         time.Unix(1700000000, 0).UTC(),
	}
}

func TestNewPixelEvent_Valid(t *testing.T) {
	pe, err := NewPixelEventFromProviderInput(validPixelInput(), "22222222-2222-2222-2222-222222222222", "shop.myshopify.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pe.StoreID() != "22222222-2222-2222-2222-222222222222" {
		t.Errorf("StoreID = %q", pe.StoreID())
	}
	if pe.StoreIntegrationExternalID() != "shop.myshopify.com" {
		t.Errorf("StoreIntegrationExternalID = %q", pe.StoreIntegrationExternalID())
	}
	if pe.EventType() != wire.PixelEventTypeCHECKOUT_COMPLETED {
		t.Errorf("EventType = %q", pe.EventType())
	}
	if pe.Platform() != wire.SalesPlatformSHOPIFY {
		t.Errorf("Platform = %q", pe.Platform())
	}
}

func TestNewPixelEvent_DeterministicID(t *testing.T) {
	a, _ := NewPixelEventFromProviderInput(validPixelInput(), "store", "ext")
	b, _ := NewPixelEventFromProviderInput(validPixelInput(), "store", "ext")
	if a.ID().Value() != b.ID().Value() {
		t.Errorf("id not deterministic: %s != %s", a.ID().Value(), b.ID().Value())
	}
}

func TestNewPixelEvent_MissingFields(t *testing.T) {
	cases := map[string]func(*PixelEventInput){
		"platform":           func(in *PixelEventInput) { in.Platform = "" },
		"eventType":          func(in *PixelEventInput) { in.EventType = "" },
		"externalEventId":    func(in *PixelEventInput) { in.ExternalEventID = "" },
		"storeIntegrationId": func(in *PixelEventInput) { in.StoreIntegrationID = "" },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			in := validPixelInput()
			mutate(&in)
			if _, err := NewPixelEventFromProviderInput(in, "store", "ext"); err == nil {
				t.Errorf("expected error for missing %s", name)
			}
		})
	}
}

func TestNewPixelEvent_InvalidEventType(t *testing.T) {
	in := validPixelInput()
	in.EventType = "BOGUS"
	if _, err := NewPixelEventFromProviderInput(in, "store", "ext"); err == nil {
		t.Error("expected error for invalid event type")
	}
}
```

### Step T2.2 — Run test to verify it fails

Run: `cd packages/api/go && go test ./internal/sync/entities/ -run TestNewPixelEvent`
Expected: FAIL — `undefined: PixelEventInput` / `undefined: NewPixelEventFromProviderInput`.

### Step T2.3 — Write the entity

Create `packages/api/go/internal/sync/entities/pixel_event.go`:

```go
package entities

import (
	"errors"
	"fmt"
	"strings"
	"time"

	wire "template/contracts-go/wire"
	"template/api-go/internal/sync/objects"
	coreobjects "template/core-go/objects"
)

// PixelEvent is the canonical tracking pixel event row. It is a read-model
// projection (append-only, no invariants beyond required fields) persisted
// to tracking.pixel_events and announced via wire.PixelEventRecordedEvent.
type PixelEvent struct {
	id                         coreobjects.ID
	platform                   wire.SalesPlatform
	storeID                    string
	storeIntegrationID         string
	storeIntegrationExternalID string
	externalEventID            string
	eventType                  wire.PixelEventType
	visitorKey                 string
	cartExternalID             string
	productExternalID          string
	url                        string
	referrer                   string
	utm                        *objects.UtmTags
	occurredAt                 time.Time
}

// PixelEventInput is the normalised pixel payload the mapper produces. It is
// scoped by storeIntegrationId — NOT storeId. The handler resolves storeId +
// storeIntegrationExternalId from the sales-channel record and passes them to
// NewPixelEventFromProviderInput.
type PixelEventInput struct {
	Platform           string           `json:"platform"`
	StoreIntegrationID string           `json:"storeIntegrationId"`
	EventType          string           `json:"eventType"`
	ExternalEventID    string           `json:"externalEventId"`
	VisitorKey         string           `json:"visitorKey"`
	CartExternalID     string           `json:"cartExternalId"`
	ProductExternalID  string           `json:"productExternalId"`
	URL                string           `json:"url"`
	Referrer           string           `json:"referrer"`
	Utm                *objects.UtmTags `json:"utm"`
	OccurredAt         time.Time        `json:"occurredAt"`
}

var (
	ErrPixelMissingPlatform           = errors.New("pixel_event: platform required")
	ErrPixelMissingEventType          = errors.New("pixel_event: eventType required")
	ErrPixelMissingExternalEventID    = errors.New("pixel_event: externalEventId required")
	ErrPixelMissingStoreIntegrationID = errors.New("pixel_event: storeIntegrationId required")
	ErrPixelInvalidPlatform           = errors.New("pixel_event: invalid platform")
	ErrPixelInvalidEventType          = errors.New("pixel_event: invalid eventType")
)

// CanonicalPixelStageOrder is the funnel order used for retroactive backfill,
// matching the TS GetPixelFunnel FUNNEL_STAGE_ORDER. PRODUCT_REMOVED_FROM_CART
// is intentionally absent — it is a valid event type but not a funnel stage.
var CanonicalPixelStageOrder = []wire.PixelEventType{
	wire.PixelEventTypePAGE_VIEWED,
	wire.PixelEventTypePRODUCT_VIEWED,
	wire.PixelEventTypePRODUCT_ADDED_TO_CART,
	wire.PixelEventTypeCART_VIEWED,
	wire.PixelEventTypeCHECKOUT_STARTED,
	wire.PixelEventTypeCHECKOUT_CONTACT_INFO_SUBMITTED,
	wire.PixelEventTypeCHECKOUT_COMPLETED,
}

// NewPixelEventFromProviderInput validates + constructs the canonical PixelEvent.
// storeID + storeIntegrationExternalID are resolved by the caller (handler) from
// the sales-channel record. The row id is a deterministic UUIDv5 of
// (platform, externalEventId), matching the unique(platform, external_event_id)
// constraint so re-deliveries collapse on UPSERT.
func NewPixelEventFromProviderInput(in PixelEventInput, storeID, storeIntegrationExternalID string) (*PixelEvent, error) {
	if strings.TrimSpace(in.Platform) == "" {
		return nil, ErrPixelMissingPlatform
	}
	if strings.TrimSpace(in.EventType) == "" {
		return nil, ErrPixelMissingEventType
	}
	if strings.TrimSpace(in.ExternalEventID) == "" {
		return nil, ErrPixelMissingExternalEventID
	}
	if strings.TrimSpace(in.StoreIntegrationID) == "" {
		return nil, ErrPixelMissingStoreIntegrationID
	}

	platform, err := wire.ParseSalesPlatform(in.Platform)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrPixelInvalidPlatform, err)
	}
	eventType, err := wire.ParsePixelEventType(in.EventType)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrPixelInvalidEventType, err)
	}

	id, err := coreobjects.IDFromSeed(string(platform), in.ExternalEventID)
	if err != nil {
		return nil, fmt.Errorf("pixel_event: id derivation: %w", err)
	}

	return &PixelEvent{
		id:                         id,
		platform:                   platform,
		storeID:                    storeID,
		storeIntegrationID:         in.StoreIntegrationID,
		storeIntegrationExternalID: storeIntegrationExternalID,
		externalEventID:            in.ExternalEventID,
		eventType:                  eventType,
		visitorKey:                 in.VisitorKey,
		cartExternalID:             in.CartExternalID,
		productExternalID:          in.ProductExternalID,
		url:                        in.URL,
		referrer:                   in.Referrer,
		utm:                        in.Utm,
		occurredAt:                 in.OccurredAt,
	}, nil
}

// Accessors
func (p *PixelEvent) ID() coreobjects.ID               { return p.id }
func (p *PixelEvent) Platform() wire.SalesPlatform     { return p.platform }
func (p *PixelEvent) StoreID() string                  { return p.storeID }
func (p *PixelEvent) StoreIntegrationID() string       { return p.storeIntegrationID }
func (p *PixelEvent) StoreIntegrationExternalID() string { return p.storeIntegrationExternalID }
func (p *PixelEvent) ExternalEventID() string          { return p.externalEventID }
func (p *PixelEvent) EventType() wire.PixelEventType   { return p.eventType }
func (p *PixelEvent) VisitorKey() string               { return p.visitorKey }
func (p *PixelEvent) CartExternalID() string           { return p.cartExternalID }
func (p *PixelEvent) ProductExternalID() string        { return p.productExternalID }
func (p *PixelEvent) URL() string                      { return p.url }
func (p *PixelEvent) Referrer() string                 { return p.referrer }
func (p *PixelEvent) Utm() *objects.UtmTags            { return p.utm }
func (p *PixelEvent) OccurredAt() time.Time            { return p.occurredAt }
```

### Step T2.4 — Write the internal event

Create `packages/api/go/internal/sync/events/external_pixel_event_recorded.go`:

```go
package events

import (
	wire "template/contracts-go/wire"
	"template/api-go/internal/sync/entities"
	coreobjects "template/core-go/objects"
	"template/core-go/types"
)

// ExternalPixelEventRecordedPayload carries the normalised PixelEventInput.
// The handler rebuilds the canonical PixelEvent via
// entities.NewPixelEventFromProviderInput(payload.Input, storeID, externalID)
// after resolving the sales-channel record.
type ExternalPixelEventRecordedPayload struct {
	Input entities.PixelEventInput `json:"input"`
}

const ExternalPixelEventRecordedEventName = string(wire.SyncEventNameEXTERNAL_PIXEL_EVENT_RECORDED)

// ExternalPixelEventRecordedEvent is a type alias so callers can use the
// concrete type directly in switch-case type assertions.
type ExternalPixelEventRecordedEvent = types.DomainEvent[ExternalPixelEventRecordedPayload]

// NewExternalPixelEventRecorded constructs the domain event. The entityID is
// derived from (platform, externalEventId) — the same seed the PixelEvent row
// id uses — and ownerID is the storeIntegrationId (scoping; storeId is never
// carried on the event).
func NewExternalPixelEventRecorded(input entities.PixelEventInput) ExternalPixelEventRecordedEvent {
	id, _ := coreobjects.IDFromSeed(input.Platform, input.ExternalEventID)
	return types.NewDomainEvent(
		ExternalPixelEventRecordedEventName,
		id.UUID(),
		input.StoreIntegrationID,
		ExternalPixelEventRecordedPayload{Input: input},
	)
}
```

### Step T2.5 — Run test to verify it passes

Run: `cd packages/api/go && go test ./internal/sync/entities/ -run TestNewPixelEvent`
Expected: PASS.

### Step T2.6 — Build + vet

Run: `cd packages/api/go && go build ./... && go vet ./internal/sync/entities/ ./internal/sync/events/`
Expected: exit 0.

### Step T2.7 — Commit

```bash
git add packages/api/go/internal/sync/entities/pixel_event.go \
        packages/api/go/internal/sync/entities/pixel_event_test.go \
        packages/api/go/internal/sync/events/external_pixel_event_recorded.go
git commit -m "feat(sync): PixelEvent aggregate + ExternalPixelEventRecordedEvent (Task T2)"
```

---

## Task T3: Sales-channel resolver returns storeId + externalId, cached

**Files to write:**
- Create: `packages/api/go/internal/sync/services/saleschannel/resolver.go`
- Test: `packages/api/go/internal/sync/services/saleschannel/resolver_test.go`
- Modify: `packages/api/go/internal/sync/errors/errors.go` — add `CodePixelUnknownStoreIntegration`

**Files to read:**
- `packages/api/go/internal/sync/services/credentials/exchanger.go`
- `packages/api/go/internal/sync/errors/errors.go`
- `packages/contracts/db/schema/integration.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** (none)

### Step T3.1 — Add the error code

Modify `packages/api/go/internal/sync/errors/errors.go`:
- Add to the const block: `CodePixelUnknownStoreIntegration errors.ErrorCode = "PIXEL_UNKNOWN_STORE_INTEGRATION"`
- Add to the `RegisterErrorCodes` map: `CodePixelUnknownStoreIntegration: http.StatusBadRequest,`

### Step T3.2 — Write the failing test

Create `packages/api/go/internal/sync/services/saleschannel/resolver_test.go`:

```go
package saleschannel

import (
	"context"
	"errors"
	"testing"
)

// fakeReader is an in-memory store_integrations reader; counts calls to prove caching.
type fakeReader struct {
	rows  map[string]SalesChannel
	calls int
}

func (f *fakeReader) read(_ context.Context, storeIntegrationID string) (SalesChannel, bool, error) {
	f.calls++
	sc, ok := f.rows[storeIntegrationID]
	return sc, ok, nil
}

func TestResolver_ResolvesAndCaches(t *testing.T) {
	reader := &fakeReader{rows: map[string]SalesChannel{
		"si-1": {StoreID: "store-1", ExternalID: "shop.myshopify.com", Platform: "SHOPIFY"},
	}}
	r := NewResolver(reader.read)

	for i := 0; i < 3; i++ {
		sc, err := r.Resolve(context.Background(), "si-1")
		if err != nil {
			t.Fatalf("resolve: %v", err)
		}
		if sc.StoreID != "store-1" || sc.ExternalID != "shop.myshopify.com" {
			t.Fatalf("unexpected: %+v", sc)
		}
	}
	if reader.calls != 1 {
		t.Errorf("reader called %d times, want 1 (cached)", reader.calls)
	}
}

func TestResolver_UnknownReturnsTypedError(t *testing.T) {
	reader := &fakeReader{rows: map[string]SalesChannel{}}
	r := NewResolver(reader.read)
	_, err := r.Resolve(context.Background(), "nope")
	if err == nil {
		t.Fatal("expected error for unknown storeIntegrationId")
	}
	if !errors.Is(err, ErrUnknownStoreIntegration) {
		t.Errorf("error = %v, want ErrUnknownStoreIntegration", err)
	}
}
```

### Step T3.3 — Run test to verify it fails

Run: `cd packages/api/go && go test ./internal/sync/services/saleschannel/`
Expected: FAIL — package/symbols undefined.

### Step T3.4 — Write the resolver

Create `packages/api/go/internal/sync/services/saleschannel/resolver.go`:

```go
// Package saleschannel resolves a storeIntegrationId to its sales-channel
// record (storeId + provider externalId) from integration.store_integrations.
// The (storeIntegrationId → storeId, externalId) mapping is immutable, so the
// resolver memoizes in-process: a cold miss does one indexed SELECT, every
// repeat is served from the cache. This keeps the high-concurrency pixel path
// off a per-event DB round-trip.
package saleschannel

import (
	"context"
	"database/sql"
	stderrors "errors"
	"fmt"
	"sync"

	syncerrors "template/api-go/internal/sync/errors"
	coreerrors "template/core-go/errors"
)

// SalesChannel is the resolved record the pixel handler needs.
type SalesChannel struct {
	StoreID    string
	ExternalID string
	Platform   string
}

// ErrUnknownStoreIntegration is returned when no active sales-channel row matches.
var ErrUnknownStoreIntegration = stderrors.New("saleschannel: unknown store integration")

// readFunc reads one sales-channel row. Returns (row, found, err).
type readFunc func(ctx context.Context, storeIntegrationID string) (SalesChannel, bool, error)

// Resolver memoizes sales-channel lookups behind a readFunc.
type Resolver struct {
	read  readFunc
	mu    sync.RWMutex
	cache map[string]SalesChannel
}

// NewResolver builds a resolver over a readFunc (real pg read or a test fake).
func NewResolver(read readFunc) *Resolver {
	return &Resolver{read: read, cache: make(map[string]SalesChannel)}
}

// Resolve returns the sales-channel record for storeIntegrationID, caching
// hits forever. An unknown id yields a typed PIXEL_UNKNOWN_STORE_INTEGRATION.
func (r *Resolver) Resolve(ctx context.Context, storeIntegrationID string) (SalesChannel, error) {
	r.mu.RLock()
	if sc, ok := r.cache[storeIntegrationID]; ok {
		r.mu.RUnlock()
		return sc, nil
	}
	r.mu.RUnlock()

	sc, found, err := r.read(ctx, storeIntegrationID)
	if err != nil {
		return SalesChannel{}, fmt.Errorf("saleschannel: read: %w", err)
	}
	if !found {
		return SalesChannel{}, coreerrors.NewBaseError(syncerrors.CodePixelUnknownStoreIntegration,
			fmt.Sprintf("%v: %s", ErrUnknownStoreIntegration, storeIntegrationID))
	}

	r.mu.Lock()
	r.cache[storeIntegrationID] = sc
	r.mu.Unlock()
	return sc, nil
}

// NewPgReader returns a readFunc backed by integration.store_integrations.
// Only SALES_CHANNEL, active rows are eligible.
func NewPgReader(db *sql.DB) readFunc {
	const stmt = `
		SELECT store_id, external_id, platform
		FROM integration.store_integrations
		WHERE id = $1 AND type = 'SALES_CHANNEL' AND active = true`
	return func(ctx context.Context, storeIntegrationID string) (SalesChannel, bool, error) {
		var sc SalesChannel
		err := db.QueryRowContext(ctx, stmt, storeIntegrationID).Scan(&sc.StoreID, &sc.ExternalID, &sc.Platform)
		if stderrors.Is(err, sql.ErrNoRows) {
			return SalesChannel{}, false, nil
		}
		if err != nil {
			return SalesChannel{}, false, err
		}
		return sc, true, nil
	}
}
```

### Step T3.5 — Run test to verify it passes

Run: `cd packages/api/go && go test ./internal/sync/services/saleschannel/`
Expected: PASS — both tests pass.

### Step T3.6 — Build + vet

Run: `cd packages/api/go && go build ./... && go vet ./internal/sync/services/saleschannel/ ./internal/sync/errors/`
Expected: exit 0.

### Step T3.7 — Commit

```bash
git add packages/api/go/internal/sync/services/saleschannel/ packages/api/go/internal/sync/errors/errors.go
git commit -m "feat(sync): cached sales-channel resolver + PIXEL_UNKNOWN_STORE_INTEGRATION (Task T3)"
```

---

## Task T4: Shopify pixel body maps to a canonical pixel event; unbuilt platforms fail soft

**Files to write:**
- Create: `packages/api/go/internal/webhooks/mappers/shopify/pixel_event_recorded.go`
- Test: `packages/api/go/internal/webhooks/mappers/shopify/pixel_event_recorded_test.go`
- Modify: `packages/api/go/internal/webhooks/module.go` — register real Shopify pixel mapper + pending pixel mappers for other SalesPlatforms

**Files to read:**
- `packages/api/go/internal/webhooks/mappers/shopify/order_updated.go`
- `packages/api/go/internal/webhooks/mappers/mapper.go`
- `packages/api/go/internal/webhooks/mappers/pending.go`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** T1, T2

### Step T4.1 — Write the failing test

Create `packages/api/go/internal/webhooks/mappers/shopify/pixel_event_recorded_test.go`:

```go
package shopify

import (
	"context"
	"testing"

	syncevents "template/api-go/internal/sync/events"
	"template/api-go/internal/webhooks/mappers"
	wire "template/contracts-go/wire"
)

const checkoutCompletedBody = `{
  "name": "checkout_completed",
  "id": "evt-987",
  "clientId": "visitor-xyz",
  "timestamp": "2026-05-28T10:00:00Z",
  "context": { "document": { "location": { "href": "https://shop.com/c?utm_source=google&utm_medium=cpc" }, "referrer": "https://google.com" } },
  "data": { "checkout": { "token": "cart-tok-1", "lineItems": [ { "variant": { "product": { "id": "prod-1" } } } ] } }
}`

func TestPixelMapper_MapsCheckoutCompleted(t *testing.T) {
	m := NewPixelEventRecordedMapper()
	out, err := m.Map(context.Background(), []byte(checkoutCompletedBody), mappers.MapContext{StoreIntegrationID: "si-1"})
	if err != nil {
		t.Fatalf("map: %v", err)
	}
	if len(out) != 1 {
		t.Fatalf("got %d events, want 1", len(out))
	}
	evt, ok := out[0].(syncevents.ExternalPixelEventRecordedEvent)
	if !ok {
		t.Fatalf("event type = %T", out[0])
	}
	in := evt.Payload.Input
	if in.EventType != string(wire.PixelEventTypeCHECKOUT_COMPLETED) {
		t.Errorf("EventType = %q", in.EventType)
	}
	if in.ExternalEventID != "evt-987" {
		t.Errorf("ExternalEventID = %q", in.ExternalEventID)
	}
	if in.VisitorKey != "visitor-xyz" {
		t.Errorf("VisitorKey = %q", in.VisitorKey)
	}
	if in.StoreIntegrationID != "si-1" {
		t.Errorf("StoreIntegrationID = %q", in.StoreIntegrationID)
	}
	if in.CartExternalID != "cart-tok-1" {
		t.Errorf("CartExternalID = %q", in.CartExternalID)
	}
	if in.ProductExternalID != "prod-1" {
		t.Errorf("ProductExternalID = %q", in.ProductExternalID)
	}
	if in.Utm == nil || in.Utm.Source == nil || *in.Utm.Source != "google" {
		t.Errorf("Utm.Source not extracted: %+v", in.Utm)
	}
	if in.Platform != string(wire.SalesPlatformSHOPIFY) {
		t.Errorf("Platform = %q", in.Platform)
	}
}

func TestPixelMapper_PageViewedHasNoCartOrProduct(t *testing.T) {
	body := `{"name":"page_viewed","id":"e1","clientId":"v1","timestamp":"2026-05-28T10:00:00Z","context":{"document":{"location":{"href":"https://shop.com/"}}}}`
	m := NewPixelEventRecordedMapper()
	out, err := m.Map(context.Background(), []byte(body), mappers.MapContext{StoreIntegrationID: "si-1"})
	if err != nil || len(out) != 1 {
		t.Fatalf("map: %v len=%d", err, len(out))
	}
	in := out[0].(syncevents.ExternalPixelEventRecordedEvent).Payload.Input
	if in.CartExternalID != "" || in.ProductExternalID != "" {
		t.Errorf("page_viewed should have empty cart/product: %+v", in)
	}
}

func TestPixelMapper_UnknownNameYieldsEmpty(t *testing.T) {
	body := `{"name":"some_unknown_event","id":"e1","clientId":"v1"}`
	m := NewPixelEventRecordedMapper()
	out, err := m.Map(context.Background(), []byte(body), mappers.MapContext{StoreIntegrationID: "si-1"})
	if err != nil {
		t.Fatalf("map: %v", err)
	}
	if len(out) != 0 {
		t.Errorf("unknown name should yield empty, got %d", len(out))
	}
}

func TestPixelMapper_Keys(t *testing.T) {
	m := NewPixelEventRecordedMapper()
	if m.Event() != wire.SyncEventNameEXTERNAL_PIXEL_EVENT_RECORDED {
		t.Errorf("Event = %q", m.Event())
	}
}
```

### Step T4.2 — Run test to verify it fails

Run: `cd packages/api/go && go test ./internal/webhooks/mappers/shopify/ -run TestPixelMapper`
Expected: FAIL — `undefined: NewPixelEventRecordedMapper`.

### Step T4.3 — Write the mapper

Create `packages/api/go/internal/webhooks/mappers/shopify/pixel_event_recorded.go`:

```go
package shopify

import (
	"context"
	"encoding/json"
	"net/url"
	"time"

	syncentities "template/api-go/internal/sync/entities"
	syncevents "template/api-go/internal/sync/events"
	"template/api-go/internal/sync/enums"
	syncobjects "template/api-go/internal/sync/objects"
	"template/api-go/internal/webhooks/mappers"
	wire "template/contracts-go/wire"
	"template/core-go/types"
)

// PixelEventRecordedMapper maps a Shopify Web Pixel SDK event body into a
// sync.ExternalPixelEventRecordedEvent. It is pure: storeId + externalId are
// resolved downstream by the sync handler (sales-channel resolution), not here.
type PixelEventRecordedMapper struct{}

func NewPixelEventRecordedMapper() *PixelEventRecordedMapper { return &PixelEventRecordedMapper{} }

func (m *PixelEventRecordedMapper) Platform() enums.WebhookPlatform { return enums.WebhookPlatformShopify }
func (m *PixelEventRecordedMapper) Event() wire.SyncEventName {
	return wire.SyncEventNameEXTERNAL_PIXEL_EVENT_RECORDED
}

// shopifyPixelBody is the common Shopify Web Pixel envelope. Per-event detail
// lives in data; cart/product ids are extracted best-effort.
type shopifyPixelBody struct {
	Name      string `json:"name"`
	ID        string `json:"id"`
	ClientID  string `json:"clientId"`
	Timestamp string `json:"timestamp"`
	Context   struct {
		Document struct {
			Location struct {
				Href string `json:"href"`
			} `json:"location"`
			Referrer string `json:"referrer"`
		} `json:"document"`
	} `json:"context"`
	Data struct {
		Checkout struct {
			Token     string `json:"token"`
			LineItems []struct {
				Variant struct {
					Product struct {
						ID string `json:"id"`
					} `json:"product"`
				} `json:"variant"`
			} `json:"lineItems"`
		} `json:"checkout"`
		Cart struct {
			ID string `json:"id"`
		} `json:"cart"`
		ProductVariant struct {
			Product struct {
				ID string `json:"id"`
			} `json:"product"`
		} `json:"productVariant"`
	} `json:"data"`
}

// nameToType maps the Shopify pixel event name to the canonical PixelEventType.
var nameToType = map[string]wire.PixelEventType{
	"page_viewed":                     wire.PixelEventTypePAGE_VIEWED,
	"product_viewed":                  wire.PixelEventTypePRODUCT_VIEWED,
	"product_added_to_cart":           wire.PixelEventTypePRODUCT_ADDED_TO_CART,
	"product_removed_from_cart":       wire.PixelEventTypePRODUCT_REMOVED_FROM_CART,
	"cart_viewed":                     wire.PixelEventTypeCART_VIEWED,
	"checkout_started":                wire.PixelEventTypeCHECKOUT_STARTED,
	"checkout_contact_info_submitted": wire.PixelEventTypeCHECKOUT_CONTACT_INFO_SUBMITTED,
	"checkout_completed":              wire.PixelEventTypeCHECKOUT_COMPLETED,
}

func (m *PixelEventRecordedMapper) Map(_ context.Context, rawBody []byte, mc mappers.MapContext) ([]types.DomainEventI, error) {
	var body shopifyPixelBody
	if err := json.Unmarshal(rawBody, &body); err != nil {
		return nil, err
	}
	eventType, ok := nameToType[body.Name]
	if !ok {
		return nil, nil // unrecognized event name → no event (mirrors reference)
	}

	occurredAt := time.Now().UTC()
	if t, err := time.Parse(time.RFC3339, body.Timestamp); err == nil {
		occurredAt = t.UTC()
	}

	input := syncentities.PixelEventInput{
		Platform:           string(wire.SalesPlatformSHOPIFY),
		StoreIntegrationID: mc.StoreIntegrationID,
		EventType:          string(eventType),
		ExternalEventID:    body.ID,
		VisitorKey:         body.ClientID,
		CartExternalID:     pixelCartID(body),
		ProductExternalID:  pixelProductID(body),
		URL:                body.Context.Document.Location.Href,
		Referrer:           body.Context.Document.Referrer,
		Utm:                extractUTM(body.Context.Document.Location.Href),
		OccurredAt:         occurredAt,
	}
	return []types.DomainEventI{syncevents.NewExternalPixelEventRecorded(input)}, nil
}

func pixelCartID(b shopifyPixelBody) string {
	if b.Data.Checkout.Token != "" {
		return b.Data.Checkout.Token
	}
	return b.Data.Cart.ID
}

func pixelProductID(b shopifyPixelBody) string {
	if b.Data.ProductVariant.Product.ID != "" {
		return b.Data.ProductVariant.Product.ID
	}
	if len(b.Data.Checkout.LineItems) > 0 {
		return b.Data.Checkout.LineItems[0].Variant.Product.ID
	}
	return ""
}

func extractUTM(href string) *syncobjects.UtmTags {
	u, err := url.Parse(href)
	if err != nil {
		return nil
	}
	q := u.Query()
	get := func(k string) *string {
		if v := q.Get(k); v != "" {
			return &v
		}
		return nil
	}
	tags := &syncobjects.UtmTags{
		Source:   get("utm_source"),
		Medium:   get("utm_medium"),
		Campaign: get("utm_campaign"),
		Term:     get("utm_term"),
		Content:  get("utm_content"),
	}
	if tags.Source == nil && tags.Medium == nil && tags.Campaign == nil && tags.Term == nil && tags.Content == nil {
		return nil
	}
	return tags
}
```

### Step T4.4 — Run test to verify it passes

Run: `cd packages/api/go && go test ./internal/webhooks/mappers/shopify/ -run TestPixelMapper`
Expected: PASS — 4 tests pass.

### Step T4.5 — Register the mapper + pending pixel mappers

Modify `packages/api/go/internal/webhooks/module.go`:

Add the real Shopify pixel mapper next to the other `provideMapper` lines (after the Shopify product mapper):

```go
	provideMapper[*mapshopify.PixelEventRecordedMapper](mapshopify.NewPixelEventRecordedMapper),
```

In `pendingMapperProviders()`, append pixel pairs for the non-Shopify SalesPlatforms (so an unbuilt platform fails soft with `WEBHOOK_MAPPER_PENDING`) to the `pairs` slice:

```go
		{enums.WebhookPlatformNuvemShop, wire.SyncEventNameEXTERNAL_PIXEL_EVENT_RECORDED},
		{enums.WebhookPlatformCartPanda, wire.SyncEventNameEXTERNAL_PIXEL_EVENT_RECORDED},
		{enums.WebhookPlatformYampi, wire.SyncEventNameEXTERNAL_PIXEL_EVENT_RECORDED},
		{enums.WebhookPlatformKiwify, wire.SyncEventNameEXTERNAL_PIXEL_EVENT_RECORDED},
```

### Step T4.6 — Build + vet

Run: `cd packages/api/go && go build ./... && go vet ./internal/webhooks/...`
Expected: exit 0.

### Step T4.7 — Commit

```bash
git add packages/api/go/internal/webhooks/mappers/shopify/pixel_event_recorded.go \
        packages/api/go/internal/webhooks/mappers/shopify/pixel_event_recorded_test.go \
        packages/api/go/internal/webhooks/module.go
git commit -m "feat(webhooks): Shopify pixel mapper + pending pixel mappers (Task T4)"
```

---

## Task T5: Unsigned pixel events are accepted at /webhooks?type=PIXEL_EVENT

**Files to write:**
- Modify: `packages/api/go/internal/webhooks/controllers/webhook.go` — `type=PIXEL_EVENT` branch
- Test: `packages/api/go/internal/webhooks/controllers/webhook_test.go` — add pixel intake cases

**Files to read:**
- `packages/api/go/internal/webhooks/controllers/webhook.go`
- `packages/api/go/internal/webhooks/controllers/webhook_test.go`
- `packages/api/go/internal/webhooks/services/webhook_received_event.go`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /controller, /test
**Depends on:** T1

### Step T5.1 — Write the failing tests

Add to `packages/api/go/internal/webhooks/controllers/webhook_test.go`:

```go
// TestWebhook_PixelEvent_Accepted — type=PIXEL_EVENT, no signature, returns 202 + saves
// a WebhookReceivedEvent with event=sync.external_pixel_event_recorded.
func TestWebhook_PixelEvent_Accepted(t *testing.T) {
	ctrl, repo := buildController(false) // verifier returns !valid — must be bypassed for pixel
	w := fireRequest(ctrl, "type=PIXEL_EVENT&platform=SHOPIFY&storeIntegrationId=si-1", `{"name":"page_viewed","id":"e1"}`)
	if w.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202", w.Code)
	}
	if len(repo.saved) != 1 {
		t.Fatalf("saved = %d, want 1", len(repo.saved))
	}
	evt, ok := repo.saved[0].(services.WebhookReceivedEvent)
	if !ok {
		t.Fatalf("type = %T", repo.saved[0])
	}
	if evt.Payload.Event != wire.SyncEventNameEXTERNAL_PIXEL_EVENT_RECORDED {
		t.Errorf("Event = %q", evt.Payload.Event)
	}
	if evt.Payload.IntegrationID != "si-1" {
		t.Errorf("IntegrationID = %q, want si-1", evt.Payload.IntegrationID)
	}
}

// TestWebhook_PixelEvent_MissingStoreIntegrationId — 400, no save.
func TestWebhook_PixelEvent_MissingStoreIntegrationId(t *testing.T) {
	ctrl, repo := buildController(true)
	w := fireRequest(ctrl, "type=PIXEL_EVENT&platform=SHOPIFY", `{"name":"page_viewed","id":"e1"}`)
	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
	if len(repo.saved) != 0 {
		t.Errorf("saved = %d, want 0", len(repo.saved))
	}
}

// TestWebhook_PixelEvent_MissingPlatform — 400, no save.
func TestWebhook_PixelEvent_MissingPlatform(t *testing.T) {
	ctrl, repo := buildController(true)
	w := fireRequest(ctrl, "type=PIXEL_EVENT&storeIntegrationId=si-1", `{"name":"page_viewed","id":"e1"}`)
	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
	if len(repo.saved) != 0 {
		t.Errorf("saved = %d, want 0", len(repo.saved))
	}
}
```

### Step T5.2 — Run test to verify it fails

Run: `cd packages/api/go && go test ./internal/webhooks/controllers/ -run TestWebhook_PixelEvent`
Expected: FAIL — pixel branch not implemented (currently the strict `WebhookRequest` decode rejects these and there is no 202 path).

### Step T5.3 — Add the pixel branch

Modify `packages/api/go/internal/webhooks/controllers/webhook.go`.

At the very top of `Handle`, before `DecodeRequest`, add the branch:

```go
func (c *WebhookController) Handle(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("type") == "PIXEL_EVENT" {
		c.handlePixel(w, r)
		return
	}
	// ... existing signed-webhook flow unchanged ...
```

Add the new method (uses the same `events` repo + `sha256` + `objects.IDFromSeed` already imported):

```go
// handlePixel accepts browser-origin Shopify Web Pixel events. Unlike provider
// webhooks these are UNSIGNED (no HMAC). The browser asserts only platform +
// storeIntegrationId (the sales-channel id the pixel bundle embeds); storeId is
// resolved server-side downstream (never client-supplied). The event is fixed to
// sync.external_pixel_event_recorded; the body's pixel sub-type is read by the mapper.
func (c *WebhookController) handlePixel(w http.ResponseWriter, r *http.Request) {
	platform := r.URL.Query().Get("platform")
	storeIntegrationID := r.URL.Query().Get("storeIntegrationId")
	if platform == "" || storeIntegrationID == "" {
		httputil.RespondError(w, coreerrors.NewBaseError(ctxerrors.CodeMissingWebhookParams,
			"pixel intake requires platform + storeIntegrationId"))
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		httputil.RespondError(w, coreerrors.NewBaseError(coreerrors.CodeBadRequest, err.Error()))
		return
	}
	defer r.Body.Close()

	sum := sha256.Sum256(body)
	externalEventID := hex.EncodeToString(sum[:])

	id, err := objects.IDFromSeed("pixel-intake", platform, externalEventID)
	if err != nil {
		httputil.RespondError(w, coreerrors.NewBaseError(coreerrors.CodeDatabaseError, err.Error()))
		return
	}

	received := types.NewDomainEvent(
		services.WebhookReceivedEventName,
		id.UUID(),
		"", // ownerID resolved downstream by the pixel handler
		services.WebhookReceivedPayload{
			Platform:        enums.WebhookPlatform(platform),
			Event:           wire.SyncEventNameEXTERNAL_PIXEL_EVENT_RECORDED,
			IntegrationID:   storeIntegrationID,
			StoreID:         "", // never trusted from the client; resolved server-side
			ExternalEventID: externalEventID,
			RawBody:         string(body),
		},
	)

	if err := c.events.Save(r.Context(), received); err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusAccepted, WebhookAcceptedResponse{
		Status:          "accepted",
		ExternalEventID: externalEventID,
		Event:           wire.SyncEventNameEXTERNAL_PIXEL_EVENT_RECORDED,
	})
}
```

### Step T5.4 — Run tests to verify they pass

Run: `cd packages/api/go && go test ./internal/webhooks/controllers/`
Expected: PASS — new pixel tests pass AND all pre-existing controller tests still pass (signed flow unchanged).

### Step T5.5 — Build + vet

Run: `cd packages/api/go && go build ./... && go vet ./internal/webhooks/controllers/`
Expected: exit 0.

### Step T5.6 — Commit

```bash
git add packages/api/go/internal/webhooks/controllers/webhook.go \
        packages/api/go/internal/webhooks/controllers/webhook_test.go
git commit -m "feat(webhooks): unsigned pixel intake branch (type=PIXEL_EVENT) (Task T5)"
```

---

## Task T6: Pixel events persist to tracking.pixel_events and publish the wire event

**Files to write:**
- Create: `packages/api/go/internal/sync/storage/pixel/pixel_storage.go`
- Create: `packages/api/go/internal/sync/storage/pixel/pixel_pg.go`
- Test: `packages/api/go/internal/sync/storage/pixel/pixel_pg_test.go`
- Create: `packages/api/go/internal/sync/handlers/pixel_event_recorded_handler.go`
- Test: `packages/api/go/internal/sync/handlers/pixel_event_recorded_handler_test.go`
- Modify: `packages/api/go/internal/sync/module.go` — provide resolver/storage/handler, register handler, add pixel to drain loops

**Files to read:**
- `packages/api/go/internal/sync/storage/order/order_pg.go`
- `packages/api/go/internal/sync/storage/order/order_storage.go`
- `packages/api/go/internal/sync/handlers/order_updated_handler.go`
- `packages/api/go/internal/sync/storage/order/order_pg_test.go`
- `packages/contracts/generated/go/wire/events.go` (PixelEventRecordedEvent shape)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository, /handler, /test
**Depends on:** T2, T3, T4, T5

### Step T6.1 — Write the failing handler test

Create `packages/api/go/internal/sync/handlers/pixel_event_recorded_handler_test.go`:

```go
package handlers

import (
	"context"
	"testing"
	"time"

	"template/api-go/internal/sync/entities"
	"template/api-go/internal/sync/events"
	"template/api-go/internal/sync/services/saleschannel"
	wire "template/contracts-go/wire"
)

// fakePixelStorage captures enqueued batches via InputChannel.
type fakePixelStorage struct{ ch chan []*entities.PixelEvent }

func newFakePixelStorage() *fakePixelStorage { return &fakePixelStorage{ch: make(chan []*entities.PixelEvent, 8)} }
func (f *fakePixelStorage) InputChannel() chan<- []*entities.PixelEvent { return f.ch }

func fakeResolver(store, ext string) *saleschannel.Resolver {
	return saleschannel.NewResolver(func(_ context.Context, _ string) (saleschannel.SalesChannel, bool, error) {
		return saleschannel.SalesChannel{StoreID: store, ExternalID: ext, Platform: "SHOPIFY"}, true, nil
	})
}

func pixelInput() entities.PixelEventInput {
	return entities.PixelEventInput{
		Platform:           string(wire.SalesPlatformSHOPIFY),
		StoreIntegrationID: "si-1",
		EventType:          string(wire.PixelEventTypeCHECKOUT_COMPLETED),
		ExternalEventID:    "evt-1",
		VisitorKey:         "v-1",
		OccurredAt:         time.Unix(1700000000, 0).UTC(),
	}
}

func TestPixelHandler_ResolvesAndEnqueues(t *testing.T) {
	storage := newFakePixelStorage()
	h := NewPixelEventRecordedHandler(storage, fakeResolver("store-9", "shop.myshopify.com"))

	if err := h.Handle(context.Background(), events.NewExternalPixelEventRecorded(pixelInput())); err != nil {
		t.Fatalf("handle: %v", err)
	}
	select {
	case batch := <-storage.ch:
		if len(batch) != 1 {
			t.Fatalf("batch len = %d, want 1", len(batch))
		}
		pe := batch[0]
		if pe.StoreID() != "store-9" {
			t.Errorf("StoreID = %q, want store-9 (resolved)", pe.StoreID())
		}
		if pe.StoreIntegrationExternalID() != "shop.myshopify.com" {
			t.Errorf("StoreIntegrationExternalID = %q", pe.StoreIntegrationExternalID())
		}
	default:
		t.Fatal("nothing enqueued")
	}
}

func TestPixelHandler_UnknownStoreIntegration_Errors(t *testing.T) {
	storage := newFakePixelStorage()
	resolver := saleschannel.NewResolver(func(_ context.Context, _ string) (saleschannel.SalesChannel, bool, error) {
		return saleschannel.SalesChannel{}, false, nil
	})
	h := NewPixelEventRecordedHandler(storage, resolver)
	if err := h.Handle(context.Background(), events.NewExternalPixelEventRecorded(pixelInput())); err == nil {
		t.Error("expected error for unknown store integration")
	}
	select {
	case <-storage.ch:
		t.Error("nothing should be enqueued when resolution fails")
	default:
	}
}

func TestPixelHandler_EventName(t *testing.T) {
	h := NewPixelEventRecordedHandler(newFakePixelStorage(), fakeResolver("s", "e"))
	if h.EventName() != events.ExternalPixelEventRecordedEventName {
		t.Errorf("EventName = %q", h.EventName())
	}
}
```

### Step T6.2 — Run test to verify it fails

Run: `cd packages/api/go && go test ./internal/sync/handlers/ -run TestPixelHandler`
Expected: FAIL — `undefined: NewPixelEventRecordedHandler`.

### Step T6.3 — Write the storage port + pg impl

Create `packages/api/go/internal/sync/storage/pixel/pixel_storage.go`:

```go
package pixel

import (
	"context"

	"template/api-go/internal/sync/entities"
)

// Storage is the channel-based persistence port for canonical pixel events.
// The handler enqueues batches via InputChannel; the background Start loop
// accumulates and bulk-upserts tracking.pixel_events with dual-write to the
// outbox in one UnitOfWork transaction. The PG impl lives in pixel_pg.go.
type Storage interface {
	InputChannel() chan<- []*entities.PixelEvent
	Start(ctx context.Context) error
	Close()
}
```

Create `packages/api/go/internal/sync/storage/pixel/pixel_pg.go`:

```go
// Package pixel implements the pg-backed channel storage for the canonical
// PixelEvent projection (tracking.pixel_events). Mirrors storage/order: the
// handler enqueues []*entities.PixelEvent batches via InputChannel(); the Start
// loop accumulates and flushes via the Accumulator; Save() bulk-upserts AND
// inserts one PixelEventRecordedEvent per row into the outbox in ONE
// UnitOfWork transaction. UPSERT keyed on the deterministic id collapses
// provider re-deliveries.
package pixel

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"template/api-go/internal/sync/entities"
	wire "template/contracts-go/wire"
	corerepos "template/core-go/repositories"
	"template/core-go/services/unitofwork"
	"template/core-go/types"
)

const (
	batchSize     = 1000
	flushInterval = time.Second
)

type execContext interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

// PgPixelStorage is the channel-based, UoW-aware UPSERT storage for pixel events.
type PgPixelStorage struct {
	db          *sql.DB
	inputCh     chan []*entities.PixelEvent
	accumulator *types.Accumulator[*entities.PixelEvent]
	uow         unitofwork.UnitOfWork
	events      corerepos.DomainEventRepository
}

func NewPgPixelStorage(db *sql.DB, uow unitofwork.UnitOfWork, events corerepos.DomainEventRepository) *PgPixelStorage {
	s := &PgPixelStorage{db: db, inputCh: make(chan []*entities.PixelEvent, 8), uow: uow, events: events}
	s.accumulator = types.NewAccumulator[*entities.PixelEvent](batchSize, s)
	return s
}

var _ Storage = (*PgPixelStorage)(nil)

func (s *PgPixelStorage) InputChannel() chan<- []*entities.PixelEvent { return s.inputCh }
func (s *PgPixelStorage) Close()                                      { close(s.inputCh) }

func (s *PgPixelStorage) Start(ctx context.Context) error {
	ticker := time.NewTicker(flushInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			s.accumulator.Flush()
			return ctx.Err()
		case <-ticker.C:
			s.accumulator.Flush()
		case batch, ok := <-s.inputCh:
			if !ok {
				s.accumulator.Flush()
				return nil
			}
			s.accumulator.Add(batch)
			ticker.Reset(flushInterval)
		}
	}
}

// Save bulk-upserts the batch and writes one PixelEventRecordedEvent per row,
// all in one UnitOfWork transaction.
func (s *PgPixelStorage) Save(batch []*entities.PixelEvent) {
	if len(batch) == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	err := s.uow.Execute(ctx, func(ctx context.Context) error {
		for _, pe := range batch {
			if err := s.upsert(ctx, pe); err != nil {
				return fmt.Errorf("pixel upsert id=%s: %w", pe.ID().Value(), err)
			}
			if err := s.events.Save(ctx, buildPixelEventRecordedWireEvent(pe)); err != nil {
				return fmt.Errorf("pixel wire event id=%s: %w", pe.ID().Value(), err)
			}
		}
		return nil
	})
	if err != nil {
		slog.Error("pixel storage Save failed", "batch_size", len(batch), "error", err)
	}
}

func (s *PgPixelStorage) upsert(ctx context.Context, pe *entities.PixelEvent) error {
	const stmt = `
		INSERT INTO tracking.pixel_events (
			id, store_id, store_integration_id, store_integration_external_id,
			platform, external_event_id, event_type,
			cart_external_id, product_external_id, visitor_key,
			url, referrer, utm, occurred_at, ingested_at, version
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7,
			$8, $9, $10,
			$11, $12, $13, $14, NOW(), 1
		)
		ON CONFLICT (id) DO UPDATE SET
			store_id = EXCLUDED.store_id,
			store_integration_id = EXCLUDED.store_integration_id,
			store_integration_external_id = EXCLUDED.store_integration_external_id,
			platform = EXCLUDED.platform,
			event_type = EXCLUDED.event_type,
			cart_external_id = EXCLUDED.cart_external_id,
			product_external_id = EXCLUDED.product_external_id,
			visitor_key = EXCLUDED.visitor_key,
			url = EXCLUDED.url,
			referrer = EXCLUDED.referrer,
			utm = EXCLUDED.utm,
			occurred_at = EXCLUDED.occurred_at,
			version = tracking.pixel_events.version + 1`

	db := s.txOrDB(ctx)
	_, err := db.ExecContext(ctx, stmt,
		pe.ID().Value(), pe.StoreID(), pe.StoreIntegrationID(), pe.StoreIntegrationExternalID(),
		string(pe.Platform()), pe.ExternalEventID(), string(pe.EventType()),
		nullable(pe.CartExternalID()), nullable(pe.ProductExternalID()), nullable(pe.VisitorKey()),
		nullable(pe.URL()), nullable(pe.Referrer()), utmJSON(pe), pe.OccurredAt(),
	)
	return err
}

func (s *PgPixelStorage) txOrDB(ctx context.Context) execContext {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return tx
	}
	return s.db
}

func nullable(v string) any {
	if v == "" {
		return nil
	}
	return v
}

func utmJSON(pe *entities.PixelEvent) any {
	if pe.Utm() == nil {
		return nil
	}
	b, err := json.Marshal(pe.Utm())
	if err != nil {
		return nil
	}
	return b
}

// buildPixelEventRecordedWireEvent translates a canonical PixelEvent into the
// integration.shared.pixel_event.recorded wire event. ownerID = storeIntegrationId.
func buildPixelEventRecordedWireEvent(pe *entities.PixelEvent) types.DomainEventI {
	payload := wire.PixelEventRecordedEvent{
		Name:                       wire.PixelEventRecordedEventName,
		EntityID:                   pe.ID().UUID().String(),
		OwnerID:                    pe.StoreIntegrationID(),
		Platform:                   pe.Platform(),
		StoreIntegrationExternalID: pe.StoreIntegrationExternalID(),
		EventType:                  pe.EventType(),
		CartExternalID:             pe.CartExternalID(),
		ProductExternalID:          pe.ProductExternalID(),
	}
	return types.NewDomainEvent(wire.PixelEventRecordedEventName, pe.ID().UUID(), pe.StoreIntegrationID(), payload)
}
```

### Step T6.4 — Write the handler

Create `packages/api/go/internal/sync/handlers/pixel_event_recorded_handler.go`:

```go
package handlers

import (
	"context"
	"fmt"

	"template/api-go/internal/sync/entities"
	"template/api-go/internal/sync/events"
	"template/api-go/internal/sync/services/saleschannel"
	"template/core-go/types"
)

// pixelStorage is the minimal channel interface the handler needs.
// Satisfied by storage/pixel.PgPixelStorage (and the test fake).
type pixelStorage interface {
	InputChannel() chan<- []*entities.PixelEvent
}

// PixelEventRecordedHandler consumes ExternalPixelEventRecordedEvent, resolves
// the sales-channel record (storeId + externalId) by storeIntegrationId, builds
// the canonical PixelEvent, and enqueues it on the storage channel for async
// dual-write. storeId is resolved server-side here — never carried on the event.
type PixelEventRecordedHandler struct {
	storage  pixelStorage
	resolver *saleschannel.Resolver
}

func NewPixelEventRecordedHandler(storage pixelStorage, resolver *saleschannel.Resolver) *PixelEventRecordedHandler {
	return &PixelEventRecordedHandler{storage: storage, resolver: resolver}
}

func (h *PixelEventRecordedHandler) EventName() string { return events.ExternalPixelEventRecordedEventName }

func (h *PixelEventRecordedHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	evt, ok := event.(events.ExternalPixelEventRecordedEvent)
	if !ok {
		return fmt.Errorf("pixel handler: unexpected event type %T (want ExternalPixelEventRecordedEvent)", event)
	}
	in := evt.Payload.Input

	sc, err := h.resolver.Resolve(ctx, in.StoreIntegrationID)
	if err != nil {
		return fmt.Errorf("pixel handler: resolve sales channel: %w", err)
	}

	pe, err := entities.NewPixelEventFromProviderInput(in, sc.StoreID, sc.ExternalID)
	if err != nil {
		return fmt.Errorf("pixel handler: build aggregate: %w", err)
	}

	select {
	case h.storage.InputChannel() <- []*entities.PixelEvent{pe}:
	case <-ctx.Done():
		return ctx.Err()
	}
	return nil
}
```

### Step T6.5 — Write the storage pg integration test

Create `packages/api/go/internal/sync/storage/pixel/pixel_pg_test.go`:

```go
package pixel

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"template/api-go/internal/sync/entities"
	wire "template/contracts-go/wire"
	corerepos "template/core-go/repositories"
	"template/core-go/services/unitofwork"
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
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		t.Skipf("DB unreachable (Docker paused?) — skipping: %v", err)
	}
	return db
}

func mustPixel(t *testing.T, externalEventID string) *entities.PixelEvent {
	t.Helper()
	pe, err := entities.NewPixelEventFromProviderInput(entities.PixelEventInput{
		Platform:           string(wire.SalesPlatformSHOPIFY),
		StoreIntegrationID: "11111111-1111-1111-1111-111111111111",
		EventType:          string(wire.PixelEventTypeCHECKOUT_COMPLETED),
		ExternalEventID:    externalEventID,
		VisitorKey:         "v-1",
		OccurredAt:         time.Unix(1700000000, 0).UTC(),
	}, "22222222-2222-2222-2222-222222222222", "shop.myshopify.com")
	if err != nil {
		t.Fatalf("build pixel: %v", err)
	}
	return pe
}

func TestPgPixelStorage_UpsertAndOutbox(t *testing.T) {
	db := openTestDB(t)
	defer db.Close()
	uow := unitofwork.NewSQLUnitOfWork(db)
	events := corerepos.NewPgDomainEventRepository(db)
	s := NewPgPixelStorage(db, uow, events)

	pe := mustPixel(t, "evt-pg-1")
	s.Save([]*entities.PixelEvent{pe})

	var count int
	if err := db.QueryRow(`SELECT count(*) FROM tracking.pixel_events WHERE id = $1`, pe.ID().Value()).Scan(&count); err != nil {
		t.Fatalf("query: %v", err)
	}
	if count != 1 {
		t.Errorf("row count = %d, want 1", count)
	}

	// Idempotency: same id again → still exactly one row.
	s.Save([]*entities.PixelEvent{mustPixel(t, "evt-pg-1")})
	if err := db.QueryRow(`SELECT count(*) FROM tracking.pixel_events WHERE id = $1`, pe.ID().Value()).Scan(&count); err != nil {
		t.Fatalf("query: %v", err)
	}
	if count != 1 {
		t.Errorf("after re-save row count = %d, want 1 (ON CONFLICT)", count)
	}

	// Cleanup.
	_, _ = db.Exec(`DELETE FROM tracking.pixel_events WHERE id = $1`, pe.ID().Value())
}
```

> Note: confirm `unitofwork.NewSQLUnitOfWork` and `corerepos.NewPgDomainEventRepository` constructor names against `order_pg_test.go` at build time; reuse whatever that test imports — the pixel storage takes the exact same `(uow, events)` types as `order.NewPgOrderStorage`.

### Step T6.6 — Wire into the sync module

Modify `packages/api/go/internal/sync/module.go`:

Add the storage import alongside the others: `storagepixel "template/api-go/internal/sync/storage/pixel"`, the resolver import `"template/api-go/internal/sync/services/saleschannel"`, and `"database/sql"` is already imported.

Provide the resolver (reads store_integrations via pg):

```go
	fx.Provide(func(db *sql.DB) *saleschannel.Resolver {
		return saleschannel.NewResolver(saleschannel.NewPgReader(db))
	}),
```

Provide the pixel storage (same shape as order):

```go
	fx.Provide(func(db *sql.DB, uow unitofwork.UnitOfWork, eventRepo corerepos.DomainEventRepository) *storagepixel.PgPixelStorage {
		return storagepixel.NewPgPixelStorage(db, uow, eventRepo)
	}),
```

Provide + register the handler (next to the other handler providers + the mediator `fx.Invoke`):

```go
	fx.Provide(func(s *storagepixel.PgPixelStorage, r *saleschannel.Resolver) *handlers.PixelEventRecordedHandler {
		return handlers.NewPixelEventRecordedHandler(s, r)
	}),
```

In the existing `fx.Invoke(func(m coremediator.InternalMediator, ...) {...})` that registers handlers, add the param `peh *handlers.PixelEventRecordedHandler` and the line `m.Register(peh)`.

Add a compile-time assertion next to the others:

```go
var _ coremediator.DomainEventHandler = (*handlers.PixelEventRecordedHandler)(nil)
```

Add the pixel storage to `storageParams` and `startStorageLoops`:
- Add field `Pixel *storagepixel.PgPixelStorage` to the `storageParams` struct.
- In `OnStart`, add a goroutine: `go func() { slog.Info("pixel storage started"); if err := p.Pixel.Start(context.Background()); err != nil { slog.Error("pixel storage stopped", "error", err) } }()`
- In `OnStop`, add `p.Pixel.Close()`.

### Step T6.7 — Run tests to verify they pass

Run: `cd packages/api/go && go test ./internal/sync/handlers/ -run TestPixelHandler && go test ./internal/sync/storage/pixel/`
Expected: handler tests PASS; pixel_pg test PASS (or SKIP if `DATABASE_URL` unset / DB unreachable).

### Step T6.8 — Build + vet (whole module boots)

Run: `cd packages/api/go && go build ./... && go vet ./...`
Expected: exit 0 (fx graph wiring compiles).

### Step T6.9 — Commit

```bash
git add packages/api/go/internal/sync/storage/pixel/ \
        packages/api/go/internal/sync/handlers/pixel_event_recorded_handler.go \
        packages/api/go/internal/sync/handlers/pixel_event_recorded_handler_test.go \
        packages/api/go/internal/sync/module.go
git commit -m "feat(sync): persist pixel events + publish wire event via channel-drain storage (Task T6)"
```

---

## Task T7: Rapid duplicate funnel steps from one visitor are throttled (Redis TTL)

**Files to write:**
- Create: `packages/api/go/internal/sync/services/pixelthrottle/throttle.go`
- Test: `packages/api/go/internal/sync/services/pixelthrottle/throttle_test.go`
- Modify: `packages/api/go/internal/sync/handlers/pixel_event_recorded_handler.go` — inject + apply throttle
- Modify: `packages/api/go/internal/sync/handlers/pixel_event_recorded_handler_test.go` — add throttle cases
- Modify: `packages/api/go/internal/sync/module.go` — provide `*redis.Client` + the Redis throttle

**Files to read:**
- `packages/api/go/core/services/mediator/redis_mediator.go`
- `packages/api/go/core/config/config.go`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /handler, /test
**Depends on:** T6

### Step T7.1 — Write the failing throttle test

Create `packages/api/go/internal/sync/services/pixelthrottle/throttle_test.go`:

```go
package pixelthrottle

import (
	"testing"

	wire "template/contracts-go/wire"
)

func TestTTLFor(t *testing.T) {
	cases := map[wire.PixelEventType]int{
		wire.PixelEventTypePAGE_VIEWED:                     60,
		wire.PixelEventTypePRODUCT_VIEWED:                  300,
		wire.PixelEventTypePRODUCT_ADDED_TO_CART:           1800,
		wire.PixelEventTypeCART_VIEWED:                     1800,
		wire.PixelEventTypeCHECKOUT_STARTED:                1800,
		wire.PixelEventTypeCHECKOUT_COMPLETED:              0, // never throttled
		wire.PixelEventTypeCHECKOUT_CONTACT_INFO_SUBMITTED: 0,
	}
	for et, want := range cases {
		if got := ttlSeconds(et); got != want {
			t.Errorf("ttlSeconds(%s) = %d, want %d", et, got, want)
		}
	}
}

func TestKey(t *testing.T) {
	k := throttleKey(wire.PixelEventTypePAGE_VIEWED, "v-1", "si-1")
	if k != "pixel:PAGE_VIEWED:v-1:si-1" {
		t.Errorf("key = %q", k)
	}
}
```

### Step T7.2 — Run test to verify it fails

Run: `cd packages/api/go && go test ./internal/sync/services/pixelthrottle/`
Expected: FAIL — package/symbols undefined.

### Step T7.3 — Write the throttle

Create `packages/api/go/internal/sync/services/pixelthrottle/throttle.go`:

```go
// Package pixelthrottle collapses rapid duplicate funnel steps from the same
// visitor using a per-(eventType, visitorKey, storeIntegrationId) Redis key
// with a per-type TTL. CHECKOUT_COMPLETED + CHECKOUT_CONTACT_INFO_SUBMITTED are
// never throttled (ttl 0).
package pixelthrottle

import (
	"context"
	"fmt"
	"time"

	wire "template/contracts-go/wire"

	"github.com/redis/go-redis/v9"
)

// Throttle decides whether a pixel event should be processed.
type Throttle interface {
	// Allow returns true the first time a (eventType, visitorKey, storeIntegrationId)
	// is seen within the type's TTL window; false for repeats inside the window.
	Allow(ctx context.Context, eventType wire.PixelEventType, visitorKey, storeIntegrationID string) (bool, error)
}

func ttlSeconds(t wire.PixelEventType) int {
	switch t {
	case wire.PixelEventTypePAGE_VIEWED:
		return 60
	case wire.PixelEventTypePRODUCT_VIEWED:
		return 300
	case wire.PixelEventTypePRODUCT_ADDED_TO_CART,
		wire.PixelEventTypePRODUCT_REMOVED_FROM_CART,
		wire.PixelEventTypeCART_VIEWED,
		wire.PixelEventTypeCHECKOUT_STARTED:
		return 1800
	default: // CHECKOUT_COMPLETED, CHECKOUT_CONTACT_INFO_SUBMITTED
		return 0
	}
}

func throttleKey(t wire.PixelEventType, visitorKey, storeIntegrationID string) string {
	return fmt.Sprintf("pixel:%s:%s:%s", t, visitorKey, storeIntegrationID)
}

// RedisThrottle is the production Throttle backed by Redis SETNX + TTL.
type RedisThrottle struct{ client *redis.Client }

func NewRedisThrottle(client *redis.Client) *RedisThrottle { return &RedisThrottle{client: client} }

var _ Throttle = (*RedisThrottle)(nil)

func (r *RedisThrottle) Allow(ctx context.Context, eventType wire.PixelEventType, visitorKey, storeIntegrationID string) (bool, error) {
	ttl := ttlSeconds(eventType)
	if ttl == 0 || visitorKey == "" {
		return true, nil // never throttled (or no visitor key to dedupe on)
	}
	ok, err := r.client.SetNX(ctx, throttleKey(eventType, visitorKey, storeIntegrationID), 1, time.Duration(ttl)*time.Second).Result()
	if err != nil {
		return false, err
	}
	return ok, nil
}

// AllowAllThrottle is a no-op Throttle (used by tests / when throttling is off).
type AllowAllThrottle struct{}

func (AllowAllThrottle) Allow(context.Context, wire.PixelEventType, string, string) (bool, error) {
	return true, nil
}
```

### Step T7.4 — Run throttle test to verify it passes

Run: `cd packages/api/go && go test ./internal/sync/services/pixelthrottle/`
Expected: PASS.

### Step T7.5 — Apply throttle in the handler

Modify `packages/api/go/internal/sync/handlers/pixel_event_recorded_handler.go`:
- Add import `"template/api-go/internal/sync/services/pixelthrottle"`.
- Add `throttle pixelthrottle.Throttle` field to the struct.
- Change `NewPixelEventRecordedHandler` signature to `(storage pixelStorage, resolver *saleschannel.Resolver, throttle pixelthrottle.Throttle)` and store it.
- In `Handle`, after the type-assert and before resolving, add the gate:

```go
	allow, err := h.throttle.Allow(ctx, wire.PixelEventType(in.EventType), in.VisitorKey, in.StoreIntegrationID)
	if err != nil {
		return fmt.Errorf("pixel handler: throttle: %w", err)
	}
	if !allow {
		return nil // duplicate within TTL — drop silently
	}
```

(Add the `wire "template/contracts-go/wire"` import.)

### Step T7.6 — Update handler tests for the new signature + throttle behavior

Modify `packages/api/go/internal/sync/handlers/pixel_event_recorded_handler_test.go`:
- Update all `NewPixelEventRecordedHandler(...)` calls to pass `pixelthrottle.AllowAllThrottle{}` as the third arg.
- Add a programmable throttle + a drop test:

```go
type fakeThrottle struct{ allow bool }

func (f fakeThrottle) Allow(context.Context, wire.PixelEventType, string, string) (bool, error) {
	return f.allow, nil
}

func TestPixelHandler_ThrottledEventDropped(t *testing.T) {
	storage := newFakePixelStorage()
	h := NewPixelEventRecordedHandler(storage, fakeResolver("s", "e"), fakeThrottle{allow: false})
	if err := h.Handle(context.Background(), events.NewExternalPixelEventRecorded(pixelInput())); err != nil {
		t.Fatalf("handle: %v", err)
	}
	select {
	case <-storage.ch:
		t.Error("throttled event should not be enqueued")
	default:
	}
}
```

(Add `"template/api-go/internal/sync/services/pixelthrottle"` + `wire` imports to the test.)

### Step T7.7 — Wire Redis + throttle into the module

Modify `packages/api/go/internal/sync/module.go`:
- Add imports: `"template/api-go/internal/sync/services/pixelthrottle"`, `"template/core-go/config"`, `"github.com/redis/go-redis/v9"`.
- Provide a shared Redis client + the throttle:

```go
	fx.Provide(func(cfg *config.Config) (*redis.Client, error) {
		opts, err := redis.ParseURL(cfg.RedisURL)
		if err != nil {
			return nil, err
		}
		return redis.NewClient(opts), nil
	}),
	fx.Provide(func(c *redis.Client) pixelthrottle.Throttle { return pixelthrottle.NewRedisThrottle(c) }),
```

- Update the pixel handler provider to take the throttle:

```go
	fx.Provide(func(s *storagepixel.PgPixelStorage, r *saleschannel.Resolver, th pixelthrottle.Throttle) *handlers.PixelEventRecordedHandler {
		return handlers.NewPixelEventRecordedHandler(s, r, th)
	}),
```

### Step T7.8 — Run tests + build

Run: `cd packages/api/go && go test ./internal/sync/handlers/ -run TestPixelHandler && go build ./... && go vet ./...`
Expected: PASS + exit 0.

### Step T7.9 — Commit

```bash
git add packages/api/go/internal/sync/services/pixelthrottle/ \
        packages/api/go/internal/sync/handlers/pixel_event_recorded_handler.go \
        packages/api/go/internal/sync/handlers/pixel_event_recorded_handler_test.go \
        packages/api/go/internal/sync/module.go
git commit -m "feat(sync): Redis per-visitor TTL throttle for pixel events (Task T7)"
```

---

## Task T8: Missing earlier funnel stages are retroactively synthesized

**Files to write:**
- Create: `packages/api/go/internal/sync/repositories/pixel/pixel_read.go`
- Create: `packages/api/go/internal/sync/repositories/pixel/pixel_read_pg.go`
- Create: `packages/api/go/internal/sync/services/pixelbackfill/backfill.go`
- Test: `packages/api/go/internal/sync/services/pixelbackfill/backfill_test.go`
- Modify: `packages/api/go/internal/sync/handlers/pixel_event_recorded_handler.go` — enqueue current + synthesized
- Modify: `packages/api/go/internal/sync/handlers/pixel_event_recorded_handler_test.go` — backfill case
- Modify: `packages/api/go/internal/sync/module.go` — provide read repo + backfill, inject into handler

**Files to read:**
- `packages/api/go/internal/sync/entities/pixel_event.go` (CanonicalPixelStageOrder)
- `packages/api/go/internal/sync/repositories/businessaccount/` (pg repo shape)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository, /service, /handler, /test
**Depends on:** T6

### Step T8.1 — Write the failing backfill test

Create `packages/api/go/internal/sync/services/pixelbackfill/backfill_test.go`:

```go
package pixelbackfill

import (
	"testing"
	"time"

	"template/api-go/internal/sync/entities"
	wire "template/contracts-go/wire"
)

func currentInput(et wire.PixelEventType) entities.PixelEventInput {
	return entities.PixelEventInput{
		Platform:           string(wire.SalesPlatformSHOPIFY),
		StoreIntegrationID: "si-1",
		EventType:          string(et),
		ExternalEventID:    "evt-real",
		VisitorKey:         "v-1",
		OccurredAt:         time.Unix(1700000000, 0).UTC(),
	}
}

func TestSynthesizeMissingStages_FillsEarlier(t *testing.T) {
	// Current = CHECKOUT_STARTED; nothing exists yet → synth PAGE_VIEWED,
	// PRODUCT_VIEWED, PRODUCT_ADDED_TO_CART, CART_VIEWED (every stage before it).
	out := SynthesizeMissingStages(currentInput(wire.PixelEventTypeCHECKOUT_STARTED), nil)
	wantTypes := []wire.PixelEventType{
		wire.PixelEventTypePAGE_VIEWED,
		wire.PixelEventTypePRODUCT_VIEWED,
		wire.PixelEventTypePRODUCT_ADDED_TO_CART,
		wire.PixelEventTypeCART_VIEWED,
	}
	if len(out) != len(wantTypes) {
		t.Fatalf("got %d synth, want %d", len(out), len(wantTypes))
	}
	for i, w := range wantTypes {
		if out[i].EventType != string(w) {
			t.Errorf("synth[%d] = %q, want %q", i, out[i].EventType, w)
		}
		if out[i].ExternalEventID != "synthetic:v-1:"+string(w)+":2023-11-14" {
			t.Errorf("synth[%d] externalEventId = %q", i, out[i].ExternalEventID)
		}
		if out[i].VisitorKey != "v-1" {
			t.Errorf("synth[%d] visitor = %q", i, out[i].VisitorKey)
		}
	}
}

func TestSynthesizeMissingStages_SkipsExisting(t *testing.T) {
	existing := []wire.PixelEventType{wire.PixelEventTypePAGE_VIEWED, wire.PixelEventTypePRODUCT_VIEWED}
	out := SynthesizeMissingStages(currentInput(wire.PixelEventTypePRODUCT_ADDED_TO_CART), existing)
	if len(out) != 0 {
		t.Fatalf("got %d synth, want 0 (all earlier stages exist)", len(out))
	}
}

func TestSynthesizeMissingStages_PageViewedHasNone(t *testing.T) {
	out := SynthesizeMissingStages(currentInput(wire.PixelEventTypePAGE_VIEWED), nil)
	if len(out) != 0 {
		t.Fatalf("PAGE_VIEWED is first stage — no earlier stages, got %d", len(out))
	}
}

func TestSynthesizeMissingStages_NonFunnelTypeNoBackfill(t *testing.T) {
	out := SynthesizeMissingStages(currentInput(wire.PixelEventTypePRODUCT_REMOVED_FROM_CART), nil)
	if len(out) != 0 {
		t.Fatalf("non-funnel stage → no backfill, got %d", len(out))
	}
}
```

### Step T8.2 — Run test to verify it fails

Run: `cd packages/api/go && go test ./internal/sync/services/pixelbackfill/`
Expected: FAIL — package/symbols undefined.

### Step T8.3 — Write the backfill service

Create `packages/api/go/internal/sync/services/pixelbackfill/backfill.go`:

```go
// Package pixelbackfill synthesizes the funnel stages that precede an arriving
// pixel event but were never recorded for the same visitor, so funnel math stays
// consistent for visitors who only emit a late stage. Synthetic rows use a
// deterministic externalEventId (synthetic:{visitorKey}:{stage}:{windowDay}) so
// repeat backfills collapse on UPSERT. There is no `retroactive` flag (the table
// has none); uniqueSessions is the funnel's robust metric.
package pixelbackfill

import (
	"fmt"

	"template/api-go/internal/sync/entities"
	wire "template/contracts-go/wire"
)

// SynthesizeMissingStages returns PixelEventInputs for every canonical funnel
// stage strictly before the current event's stage that is not already present in
// `existing`. If the current event type is not a funnel stage, returns nil.
func SynthesizeMissingStages(current entities.PixelEventInput, existing []wire.PixelEventType) []entities.PixelEventInput {
	currentIdx := stageIndex(wire.PixelEventType(current.EventType))
	if currentIdx <= 0 {
		return nil // first stage or non-funnel type → nothing earlier to fill
	}

	have := make(map[wire.PixelEventType]bool, len(existing))
	for _, e := range existing {
		have[e] = true
	}

	day := current.OccurredAt.UTC().Format("2006-01-02")
	out := make([]entities.PixelEventInput, 0, currentIdx)
	for i := 0; i < currentIdx; i++ {
		stage := entities.CanonicalPixelStageOrder[i]
		if have[stage] {
			continue
		}
		synth := current // copy scalar fields (visitor, store, platform, occurredAt, utm...)
		synth.EventType = string(stage)
		synth.ExternalEventID = fmt.Sprintf("synthetic:%s:%s:%s", current.VisitorKey, stage, day)
		synth.CartExternalID = ""
		synth.ProductExternalID = ""
		out = append(out, synth)
	}
	return out
}

func stageIndex(t wire.PixelEventType) int {
	for i, s := range entities.CanonicalPixelStageOrder {
		if s == t {
			return i
		}
	}
	return -1
}
```

### Step T8.4 — Run backfill test to verify it passes

Run: `cd packages/api/go && go test ./internal/sync/services/pixelbackfill/`
Expected: PASS.

### Step T8.5 — Write the read repository (port + pg impl)

Create `packages/api/go/internal/sync/repositories/pixel/pixel_read.go`:

```go
package pixel

import (
	"context"
	"time"

	wire "template/contracts-go/wire"
)

// ReadRepository reads tracking.pixel_events for funnel backfill.
type ReadRepository interface {
	// DistinctStagesForVisitor returns the distinct event types already recorded
	// for (storeIntegrationID, visitorKey) at or after `since`.
	DistinctStagesForVisitor(ctx context.Context, storeIntegrationID, visitorKey string, since time.Time) ([]wire.PixelEventType, error)
}
```

Create `packages/api/go/internal/sync/repositories/pixel/pixel_read_pg.go`:

```go
package pixel

import (
	"context"
	"database/sql"
	"time"

	wire "template/contracts-go/wire"
)

type PgReadRepository struct{ db *sql.DB }

func NewPgReadRepository(db *sql.DB) *PgReadRepository { return &PgReadRepository{db: db} }

var _ ReadRepository = (*PgReadRepository)(nil)

func (r *PgReadRepository) DistinctStagesForVisitor(ctx context.Context, storeIntegrationID, visitorKey string, since time.Time) ([]wire.PixelEventType, error) {
	const stmt = `
		SELECT DISTINCT event_type
		FROM tracking.pixel_events
		WHERE store_integration_id = $1 AND visitor_key = $2 AND occurred_at >= $3`
	rows, err := r.db.QueryContext(ctx, stmt, storeIntegrationID, visitorKey, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []wire.PixelEventType
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		out = append(out, wire.PixelEventType(s))
	}
	return out, rows.Err()
}
```

### Step T8.6 — Apply backfill in the handler

Modify `packages/api/go/internal/sync/handlers/pixel_event_recorded_handler.go`:
- Add imports: `"time"`, `pixelrepo "template/api-go/internal/sync/repositories/pixel"`, `"template/api-go/internal/sync/services/pixelbackfill"`.
- Add fields `readRepo pixelrepo.ReadRepository` to the struct; extend `NewPixelEventRecordedHandler(storage, resolver, throttle, readRepo)` to store it.
- After building the current `pe` and before enqueueing, query existing stages + synthesize, building one batch:

```go
	since := in.OccurredAt.Add(-24 * time.Hour)
	existing, err := h.readRepo.DistinctStagesForVisitor(ctx, in.StoreIntegrationID, in.VisitorKey, since)
	if err != nil {
		return fmt.Errorf("pixel handler: read existing stages: %w", err)
	}

	batch := []*entities.PixelEvent{pe}
	for _, synthIn := range pixelbackfill.SynthesizeMissingStages(in, existing) {
		synthPe, err := entities.NewPixelEventFromProviderInput(synthIn, sc.StoreID, sc.ExternalID)
		if err != nil {
			return fmt.Errorf("pixel handler: build synthetic: %w", err)
		}
		batch = append(batch, synthPe)
	}

	select {
	case h.storage.InputChannel() <- batch:
	case <-ctx.Done():
		return ctx.Err()
	}
	return nil
```

(Remove the previous single-event `select` enqueue — replaced by the `batch` enqueue above.)

### Step T8.7 — Update handler tests for backfill

Modify `packages/api/go/internal/sync/handlers/pixel_event_recorded_handler_test.go`:
- Add a fake read repo and pass it as the 4th arg to every `NewPixelEventRecordedHandler(...)` call:

```go
type fakeReadRepo struct{ stages []wire.PixelEventType }

func (f fakeReadRepo) DistinctStagesForVisitor(context.Context, string, string, time.Time) ([]wire.PixelEventType, error) {
	return f.stages, nil
}
```

- Default the existing tests to `fakeReadRepo{}` (no existing stages → for a CHECKOUT_COMPLETED current event, backfill will synthesize earlier stages, so update `TestPixelHandler_ResolvesAndEnqueues` to assert `len(batch) >= 1` and that the first element is the real event, OR switch its `pixelInput()` to `PAGE_VIEWED` so no synth occurs and `len(batch) == 1`). Use `PAGE_VIEWED` in `pixelInput()` to keep that test's count exact.
- Add a backfill assertion test:

```go
func TestPixelHandler_BackfillsMissingStages(t *testing.T) {
	storage := newFakePixelStorage()
	in := pixelInput()
	in.EventType = string(wire.PixelEventTypeCHECKOUT_STARTED)
	h := NewPixelEventRecordedHandler(storage, fakeResolver("s", "e"), pixelthrottle.AllowAllThrottle{}, fakeReadRepo{})
	if err := h.Handle(context.Background(), events.NewExternalPixelEventRecorded(in)); err != nil {
		t.Fatalf("handle: %v", err)
	}
	batch := <-storage.ch
	// 1 real (CHECKOUT_STARTED) + 4 synthesized earlier stages.
	if len(batch) != 5 {
		t.Fatalf("batch len = %d, want 5", len(batch))
	}
}
```

(Add `"time"` import to the test.)

### Step T8.8 — Wire read repo + backfill into the module

Modify `packages/api/go/internal/sync/module.go`:
- Add import `pixelrepo "template/api-go/internal/sync/repositories/pixel"`.
- Provide the read repo: `fx.Provide(func(db *sql.DB) pixelrepo.ReadRepository { return pixelrepo.NewPgReadRepository(db) }),`
- Update the pixel handler provider to take the read repo as the 4th arg:

```go
	fx.Provide(func(s *storagepixel.PgPixelStorage, r *saleschannel.Resolver, th pixelthrottle.Throttle, rr pixelrepo.ReadRepository) *handlers.PixelEventRecordedHandler {
		return handlers.NewPixelEventRecordedHandler(s, r, th, rr)
	}),
```

### Step T8.9 — Run tests + build

Run: `cd packages/api/go && go test ./internal/sync/... && go build ./... && go vet ./...`
Expected: PASS (pg tests SKIP without DATABASE_URL) + exit 0.

### Step T8.10 — Commit

```bash
git add packages/api/go/internal/sync/repositories/pixel/ \
        packages/api/go/internal/sync/services/pixelbackfill/ \
        packages/api/go/internal/sync/handlers/pixel_event_recorded_handler.go \
        packages/api/go/internal/sync/handlers/pixel_event_recorded_handler_test.go \
        packages/api/go/internal/sync/module.go
git commit -m "feat(sync): retroactive funnel backfill for pixel events (Task T8)"
```

---

## Final Validation

- [ ] `cd packages/api/go && go build ./...` — Go builds clean (fx graph wires)
- [ ] `cd packages/api/go && go vet ./...` — vet clean
- [ ] `bun x nx run api-go:test` (or `cd packages/api/go && go test ./...`) — Go suite passes; `*_pg_test.go` pass against a migrated `DATABASE_URL` (run `bun migrate:dev` first) or SKIP if DB unreachable
- [ ] `bun tsc` — TS workspaces type-check (contracts regen consumed cleanly)
- [ ] `bun lint` — lint clean
- [ ] Manual smoke (optional, DB + Redis up): `curl -X POST 'http://localhost:3032/webhooks?type=PIXEL_EVENT&platform=SHOPIFY&storeIntegrationId=<known-si>' -d '{"name":"checkout_completed","id":"evt-1","clientId":"v1","timestamp":"2026-05-28T10:00:00Z","context":{"document":{"location":{"href":"https://x?utm_source=g"}}},"data":{"checkout":{"token":"c1"}}}'` → 202; row appears in `tracking.pixel_events`
- [ ] AC mapping (every spec AC → ≥1 test path):
  - AC-1 → `packages/contracts/generated/go/wire/enums.go` (grep `SyncEventNameEXTERNAL_PIXEL_EVENT_RECORDED`, Step T1.3) + `go build`
  - AC-2 → `packages/api/go/internal/webhooks/controllers/webhook_test.go:"TestWebhook_PixelEvent_Accepted"` / `"…_MissingStoreIntegrationId"` / `"…_MissingPlatform"`
  - AC-3 → `packages/api/go/internal/webhooks/mappers/shopify/pixel_event_recorded_test.go:"TestPixelMapper_MapsCheckoutCompleted"` / `"…_PageViewedHasNoCartOrProduct"` / `"…_UnknownNameYieldsEmpty"`
  - AC-4 → `packages/api/go/internal/sync/storage/pixel/pixel_pg_test.go:"TestPgPixelStorage_UpsertAndOutbox"` + `packages/api/go/internal/sync/handlers/pixel_event_recorded_handler_test.go:"TestPixelHandler_ResolvesAndEnqueues"`
  - AC-5 → `packages/api/go/internal/sync/services/pixelbackfill/backfill_test.go:"TestSynthesizeMissingStages_FillsEarlier"` / `"…_SkipsExisting"` + handler `"TestPixelHandler_BackfillsMissingStages"`
  - AC-6 → `packages/api/go/internal/sync/services/pixelthrottle/throttle_test.go:"TestTTLFor"` + handler `"TestPixelHandler_ThrottledEventDropped"`
  - AC-7 → `packages/api/go/internal/webhooks/mappers/factory_test.go` (pending pair resolution) + `"TestPixelMapper_Keys"` (real Shopify pair registered)
  - AC-8 → this Final Validation block (`go test ./...` + `bun tsc` + `bun lint`)
  - AC-9 → `packages/api/go/internal/sync/services/saleschannel/resolver_test.go:"TestResolver_ResolvesAndCaches"` / `"TestResolver_UnknownReturnsTypedError"`

## Notes

- **Contract regen first.** T1 must land before any Go task that references `wire.SyncEventNameEXTERNAL_PIXEL_EVENT_RECORDED`. Run `cd packages/contracts && bun run tsp:compile && bun run codegen:wire`.
- **Env vars:** `REDIS_URL` (already used by the Redis mediator; defaults to `redis://localhost:6379`) is required for the throttle in `real`; `DATABASE_URL` for `*_pg_test.go` (run `bun migrate:dev` to apply migrations first — the `tracking.pixel_events` + `integration.store_integrations` tables already exist in the schema).
- **No new dependency:** `github.com/redis/go-redis/v9` and `github.com/jackc/pgx/v5/stdlib` are already in `go.mod` (used by the Redis mediator + sync pg tests).
- **No migration:** `tracking.pixel_events` already exists (Drizzle schema `packages/contracts/db/schema/tracking.ts`). This plan adds no Drizzle change.
- **Graph note:** the repo code-graph is TypeScript-only; Go paths are verified by direct file reads, and `validate-plan`/`review-plan` (TS-oriented) do not cover these Go files. Parse-sanity (`parse-plan`) still applies to the Task grammar.
- **UoW/event-repo constructors:** the pixel storage takes the identical `(uow unitofwork.UnitOfWork, events corerepos.DomainEventRepository)` types as `order.NewPgOrderStorage`; if the `pixel_pg_test.go` constructor names differ from this draft, copy the exact ones `order_pg_test.go` uses.
