# Go Webhook Flow Rewrite — Implementation Plan (Spec B)

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`) syntax. Each Task wraps one observable behavior in an outer RED→GREEN cycle. Go-only commits use `git commit --no-verify` (the workspace `tsc` pre-commit hook is red from an unrelated parallel TS refactor; these commits touch zero TS). `go build ./... && go test ./... && go vet` is the real gate.

**Goal:** Collapse the 9 per-platform webhook controllers into one `POST /webhooks?platform&event&integrationId` controller that verifies + publishes `WebhookReceivedEvent`; a new handler routes it through a `(platform,event)` mapper factory into Spec A's `ExternalXUpdatedEvent`, reusing Spec A's per-entity handlers for persistence.

**Architecture:** Two-layer event indirection. Controller (verify → publish `WebhookReceivedEvent`) → `WebhookReceivedEventHandler` (mediator-registered) → `mappers.Factory.Get(platform,event)` → mapper produces `sync/events.ExternalXUpdatedEvent` → published via `mediator.Dispatch` → Spec A's `OrderUpdatedHandler` etc persist canonical + publish the `integration.shared.<entity>.updated` wire event. Dedupe = `HashedID("webhook", platform, sha256(rawBody))`. Only `SHOPIFY`/`orders/updated` ships real; other `(platform,event)` pairs register as PENDING mappers.

**Tech Stack:** Go, fx, net/http, database/sql, google/uuid, crypto/sha256.

**Spec:** .specs/2026-05-24-go-webhook-flow-design.md
**Tasks:** 6
**Estimated minutes:** 300

> **Planner notes.** (1) Graph `validate-plan`/`review-plan` + SDK Contract-Lock are TS-graph tools; this plan is all Go (webhook controllers aren't in the SDK) — N/A. (2) Depends on Spec A (built): `internal/sync/events.ExternalOrderUpdatedEvent` + `NewExternalOrderUpdated(order.OrderInput, ownerID)`, the sync per-entity handlers registered with `mediator.InternalMediator`, and `internal/sync/services/shopify` normalizers. (3) Cross-BC import note: `webhooks` importing `sync/events` + `sync/storage/order` (the `OrderInput` type) is the intentional shared contract per the spec — the external event IS the contract between ingest and persistence.

---

## Task TB1: WebhookReceivedEvent carries event+integrationId; verifiers expose their signature header

**Files:**
- Modify: `internal/webhooks/services/webhook_received_event.go` — add `Event` + `IntegrationID` to `WebhookReceivedPayload`
- Modify: `internal/webhooks/services/webhook_verifier.go` — add `SignatureHeader() string` to the interface
- Modify: `internal/webhooks/services/hmac_verifier.go` — add a `header` field + `SignatureHeader()`; thread header through `NewHMACVerifier`
- Modify: `internal/webhooks/services/shopify_verifier.go`, `stripe_verifier.go`, `tiktok_verifier.go`, `meta_verifier.go` — add `SignatureHeader()` returning each platform's header
- Modify: `internal/webhooks/module.go` — pass the header arg to the per-platform HMAC verifier constructors
- Create: `internal/webhooks/errors/errors.go`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /event, /errors
**Depends on:** (none)

- [ ] **Step 1: Add error codes**

Create `internal/webhooks/errors/errors.go`:

```go
// Package errors holds the webhooks bounded context's typed error codes.
package errors

import "template/core-go/errors"

const (
	CodeWebhookMapperPending errors.ErrorCode = "WEBHOOK_MAPPER_PENDING"
	CodeUnknownPlatform      errors.ErrorCode = "UNKNOWN_PLATFORM"
	CodeMissingWebhookParams errors.ErrorCode = "MISSING_WEBHOOK_PARAMS"
	CodeInvalidSignature     errors.ErrorCode = "INVALID_WEBHOOK_SIGNATURE"
)
```

- [ ] **Step 2: Extend the WebhookReceivedEvent payload**

Modify `internal/webhooks/services/webhook_received_event.go` — add two fields to `WebhookReceivedPayload`:

```diff
 type WebhookReceivedPayload struct {
 	Platform         string `json:"platform"`
+	Event            string `json:"event"`
+	IntegrationID    string `json:"integrationId"`
 	ExternalEventID  string `json:"externalEventId"`
 	WebhookEventType string `json:"webhookEventType"`
 	RawBody          string `json:"rawBody"`
 }
```

- [ ] **Step 3: Add SignatureHeader() to the verifier interface + impls**

Modify `internal/webhooks/services/webhook_verifier.go`:

```diff
 type WebhookVerifier interface {
 	Platform() string
+	SignatureHeader() string
 	Verify(rawBody []byte, signature string) (bool, error)
 }
```

Modify `internal/webhooks/services/hmac_verifier.go` — add a `header string` field to `HMACVerifier`, accept it in `NewHMACVerifier(platform string, header string, alg HMACAlg, encoding HMACEncoding, secret string)`, and add:

```go
func (v *HMACVerifier) SignatureHeader() string { return v.header }
```

Modify `shopify_verifier.go` / `stripe_verifier.go` / `tiktok_verifier.go` / `meta_verifier.go` — add `SignatureHeader()` returning the platform's header (`X-Shopify-Hmac-Sha256`, `Stripe-Signature`, `X-TikTok-Signature` / the existing TikTok header, `X-Hub-Signature-256` respectively — use the exact header strings the deleted per-platform controllers passed; recover them from git if needed via `git show HEAD:internal/webhooks/controllers/<platform>_webhook.go`).

- [ ] **Step 4: Thread the header through module.go HMAC constructors**

Modify `internal/webhooks/module.go` — the `nuvemShopVerifierFromEnv` / `yampiVerifierFromEnv` / `kiwifyVerifierFromEnv` / `cartPandaVerifierFromEnv` helpers gain the header arg:

```diff
 func nuvemShopVerifierFromEnv() *services.HMACVerifier {
-	return services.NewHMACVerifier("NUVEMSHOP", services.HMACSHA256, services.HexLower, os.Getenv("NUVEMSHOP_WEBHOOK_SECRET"))
+	return services.NewHMACVerifier("NUVEMSHOP", "X-NuvemShop-Hmac-Sha256", services.HMACSHA256, services.HexLower, os.Getenv("NUVEMSHOP_WEBHOOK_SECRET"))
 }
```

Use the exact headers from the deleted controllers for NuvemShop/Yampi/Kiwify/CartPanda (recover via `git show HEAD:internal/webhooks/controllers/<p>_webhook.go` — each calls `dispatcher.Dispatch(ctx, "<P>", "<HEADER>", r)`).

- [ ] **Step 5: Build + test**

Run: `cd packages/api/go && go build ./... && go test ./internal/webhooks/...`
Expected: 0 build errors; existing verifier tests still pass (they may need the new `header` arg in `NewHMACVerifier` calls — update the test constructors).

- [ ] **Step 6: Commit**

```bash
git add packages/api/go/internal/webhooks/services packages/api/go/internal/webhooks/errors packages/api/go/internal/webhooks/module.go
git commit --no-verify -m "feat(webhooks): WebhookReceivedEvent gains event+integrationId; verifiers expose SignatureHeader (Task TB1)"
```

---

## Task TB2: Mapper factory routes by (platform, event)

**Files:**
- Create: `internal/webhooks/mappers/mapper.go` (interface)
- Create: `internal/webhooks/mappers/factory.go` (+ `factory_test.go`)
- Create: `internal/webhooks/mappers/pending.go`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** TB1

- [ ] **Step 1: Write the failing factory test**

Create `internal/webhooks/mappers/factory_test.go`:

```go
package mappers

import (
	"context"
	"testing"

	coreerrors "template/core-go/errors"
	"template/core-go/types"
)

type fakeMapper struct{ platform, event string }

func (m fakeMapper) Platform() string { return m.platform }
func (m fakeMapper) Event() string    { return m.event }
func (m fakeMapper) Map(_ context.Context, _ []byte) ([]types.DomainEventI, error) { return nil, nil }

func TestFactory_GetRegistered(t *testing.T) {
	f := NewFactory([]WebhookMapper{fakeMapper{"SHOPIFY", "orders/updated"}})
	m, err := f.Get("SHOPIFY", "orders/updated")
	if err != nil || m == nil {
		t.Fatalf("Get registered = (%v, %v), want a mapper", m, err)
	}
}

func TestFactory_GetUnregisteredReturnsTypedError(t *testing.T) {
	f := NewFactory(nil)
	_, err := f.Get("SHOPIFY", "orders/updated")
	if ae, ok := err.(*coreerrors.AppError); !ok || ae.Code != "WEBHOOK_MAPPER_PENDING" {
		t.Errorf("Get unregistered err = %v, want WEBHOOK_MAPPER_PENDING", err)
	}
}

func TestFactory_KeyedByPlatformAndEvent(t *testing.T) {
	f := NewFactory([]WebhookMapper{
		fakeMapper{"SHOPIFY", "orders/updated"},
		fakeMapper{"SHOPIFY", "products/update"},
	})
	if _, err := f.Get("SHOPIFY", "products/update"); err != nil {
		t.Errorf("distinct event not resolved: %v", err)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api/go && go test ./internal/webhooks/mappers/...`
Expected: FAIL — `undefined: NewFactory` / `WebhookMapper`.

- [ ] **Step 3: Write the interface, factory, pending mapper**

Create `internal/webhooks/mappers/mapper.go`:

```go
// Package mappers turns a verified provider webhook body into the
// canonical sync.ExternalXUpdatedEvent(s) the sync handlers persist.
// One impl per (platform, event); the factory resolves by that pair.
package mappers

import (
	"context"

	"template/core-go/types"
)

type WebhookMapper interface {
	Platform() string
	Event() string
	Map(ctx context.Context, rawBody []byte) ([]types.DomainEventI, error)
}
```

Create `internal/webhooks/mappers/factory.go`:

```go
package mappers

import (
	"fmt"

	ctxerrors "template/api-go/internal/webhooks/errors"
	coreerrors "template/core-go/errors"
)

type Factory struct {
	mappers map[string]WebhookMapper
}

func NewFactory(ms []WebhookMapper) *Factory {
	idx := make(map[string]WebhookMapper, len(ms))
	for _, m := range ms {
		idx[key(m.Platform(), m.Event())] = m
	}
	return &Factory{mappers: idx}
}

func (f *Factory) Get(platform, event string) (WebhookMapper, error) {
	m, ok := f.mappers[key(platform, event)]
	if !ok {
		return nil, coreerrors.NewBaseError(ctxerrors.CodeWebhookMapperPending,
			fmt.Sprintf("no webhook mapper for (%s, %s)", platform, event))
	}
	return m, nil
}

func key(platform, event string) string { return platform + ":" + event }
```

Create `internal/webhooks/mappers/pending.go`:

```go
package mappers

import (
	"context"

	ctxerrors "template/api-go/internal/webhooks/errors"
	coreerrors "template/core-go/errors"
	"template/core-go/types"
)

// PendingMapper registers a (platform, event) pair whose real mapper
// hasn't landed. Map returns WEBHOOK_MAPPER_PENDING so the handler
// surfaces a graceful "not implemented" rather than a 500.
type PendingMapper struct{ platform, event string }

func NewPendingMapper(platform, event string) *PendingMapper {
	return &PendingMapper{platform: platform, event: event}
}
func (m *PendingMapper) Platform() string { return m.platform }
func (m *PendingMapper) Event() string    { return m.event }
func (m *PendingMapper) Map(_ context.Context, _ []byte) ([]types.DomainEventI, error) {
	return nil, coreerrors.NewBaseError(ctxerrors.CodeWebhookMapperPending,
		"webhook mapper pending for "+m.platform+"/"+m.event)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api/go && go test ./internal/webhooks/mappers/...`
Expected: PASS — 3 tests.

- [ ] **Step 5: Build + commit**

Run: `cd packages/api/go && go build ./...`
```bash
git add packages/api/go/internal/webhooks/mappers
git commit --no-verify -m "feat(webhooks): (platform,event) mapper factory + pending mapper (Task TB2)"
```

---

## Task TB3: Shopify orders/updated webhook maps to ExternalOrderUpdatedEvent

**Files:**
- Create: `internal/webhooks/mappers/shopify/order_updated.go` (+ `order_updated_test.go`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** TB2

- [ ] **Step 1: Inspect the reusable sync normalizer**

Read `internal/sync/services/shopify/order_normalizer.go` (Spec A) — it already converts a raw Shopify order payload into `internal/sync/storage/order.OrderInput`. The webhook mapper REUSES this normalizer (don't re-parse Shopify JSON from scratch). Confirm its exact constructor + method signature (e.g. `NewOrdersNormalizer()` + `Normalize(raw []byte) (order.OrderInput, error)` or similar) before writing the mapper.

- [ ] **Step 2: Write the failing test**

Create `internal/webhooks/mappers/shopify/order_updated_test.go`:

```go
package shopify

import (
	"context"
	"testing"

	syncevents "template/api-go/internal/sync/events"
)

func TestShopifyOrderUpdatedMapper_PlatformEvent(t *testing.T) {
	m := NewOrderUpdatedMapper(/* sync shopify orders normalizer */)
	if m.Platform() != "SHOPIFY" || m.Event() != "orders/updated" {
		t.Errorf("(%q,%q), want (SHOPIFY, orders/updated)", m.Platform(), m.Event())
	}
}

func TestShopifyOrderUpdatedMapper_ProducesExternalOrderUpdated(t *testing.T) {
	m := NewOrderUpdatedMapper(/* normalizer */)
	raw := []byte(shopifyOrderFixtureJSON) // a minimal valid Shopify order payload
	events, err := m.Map(context.Background(), raw)
	if err != nil {
		t.Fatalf("Map: %v", err)
	}
	if len(events) != 1 || events[0].GetEventName() != syncevents.ExternalOrderUpdatedEventName {
		t.Errorf("events = %+v, want 1 ExternalOrderUpdatedEvent", events)
	}
}
```

> Build `shopifyOrderFixtureJSON` from the fixture the sync normalizer's own test uses (read `internal/sync/services/shopify/order_normalizer_test.go` for a valid payload) so the normalizer accepts it.

- [ ] **Step 3: Run test → fail**

Run: `cd packages/api/go && go test ./internal/webhooks/mappers/shopify/...`
Expected: FAIL — `undefined: NewOrderUpdatedMapper`.

- [ ] **Step 4: Write the mapper**

Create `internal/webhooks/mappers/shopify/order_updated.go`. It wraps the sync Shopify orders normalizer: normalize the raw body → `order.OrderInput`, then build `syncevents.NewExternalOrderUpdated(input, ownerID)`. Use the storeId/ownerId from the normalized input (or empty string if the event constructor derives the entity id from the input — match Spec A's `NewExternalOrderUpdated` signature exactly).

```go
// Package shopify holds Shopify per-event webhook mappers.
package shopify

import (
	"context"

	syncevents "template/api-go/internal/sync/events"
	syncshopify "template/api-go/internal/sync/services/shopify"
	"template/core-go/types"
)

type OrderUpdatedMapper struct {
	normalizer *syncshopify.OrdersNormalizer // exact type from Step 1
}

func NewOrderUpdatedMapper(n *syncshopify.OrdersNormalizer) *OrderUpdatedMapper {
	return &OrderUpdatedMapper{normalizer: n}
}

func (m *OrderUpdatedMapper) Platform() string { return "SHOPIFY" }
func (m *OrderUpdatedMapper) Event() string    { return "orders/updated" }

func (m *OrderUpdatedMapper) Map(_ context.Context, rawBody []byte) ([]types.DomainEventI, error) {
	input, err := m.normalizer.Normalize(rawBody) // exact signature from Step 1
	if err != nil {
		return nil, err
	}
	evt := syncevents.NewExternalOrderUpdated(input, input.StoreID) // match NewExternalOrderUpdated arg shape
	return []types.DomainEventI{evt}, nil
}
```

> The normalizer type name, `Normalize` signature, and `NewExternalOrderUpdated` arg shape MUST be read from Spec A's code in Step 1 and matched exactly. The skeleton above marks where each plugs in.

- [ ] **Step 5: Run test → pass; build; commit**

Run: `cd packages/api/go && go test ./internal/webhooks/mappers/shopify/... && go build ./...`
```bash
git add packages/api/go/internal/webhooks/mappers/shopify
git commit --no-verify -m "feat(webhooks): ShopifyOrderUpdatedWebhookMapper → ExternalOrderUpdatedEvent (Task TB3)"
```

---

## Task TB4: WebhookReceivedEventHandler routes raw webhooks into external events

**Files:**
- Create: `internal/webhooks/handlers/webhook_received_handler.go` (+ `webhook_received_handler_test.go`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /handler, /test
**Depends on:** TB2

- [ ] **Step 1: Write the failing test**

Create `internal/webhooks/handlers/webhook_received_handler_test.go`. Fakes: a factory returning a capture mapper; a capture publisher. Assert: handler resolves the `(platform,event)` mapper, runs it, and publishes the returned external events.

```go
package handlers

import (
	"context"
	"testing"

	"template/api-go/internal/webhooks/mappers"
	"template/api-go/internal/webhooks/services"
	"template/core-go/types"
)

type capturePublisher struct{ events []types.DomainEventI }

func (c *capturePublisher) Publish(_ context.Context, e types.DomainEventI) error {
	c.events = append(c.events, e)
	return nil
}

type stubExternalEvent struct{ name string }

func (s stubExternalEvent) GetEventName() string { return s.name }
func (s stubExternalEvent) GetEntityID() [16]byte { return [16]byte{} } // match types.DomainEventI (uuid.UUID)
func (s stubExternalEvent) GetOwnerID() string    { return "" }

func TestWebhookReceivedHandler_RoutesToMapperAndPublishes(t *testing.T) {
	pub := &capturePublisher{}
	factory := mappers.NewFactory([]mappers.WebhookMapper{
		captureMapper{platform: "SHOPIFY", event: "orders/updated", out: []types.DomainEventI{stubExternalEvent{"sync.external_order_updated"}}},
	})
	h := NewWebhookReceivedHandler(factory, pub)

	if h.EventName() != services.WebhookReceivedEventName {
		t.Fatalf("EventName = %q", h.EventName())
	}

	evt := types.NewDomainEvent(services.WebhookReceivedEventName, [16]byte{}, "", services.WebhookReceivedPayload{
		Platform: "SHOPIFY", Event: "orders/updated", IntegrationID: "i", RawBody: "{}",
	})
	if err := h.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(pub.events) != 1 || pub.events[0].GetEventName() != "sync.external_order_updated" {
		t.Errorf("published = %+v, want 1 external event", pub.events)
	}
}

func TestWebhookReceivedHandler_PendingMapperReturnsError(t *testing.T) {
	h := NewWebhookReceivedHandler(mappers.NewFactory(nil), &capturePublisher{})
	evt := types.NewDomainEvent(services.WebhookReceivedEventName, [16]byte{}, "", services.WebhookReceivedPayload{
		Platform: "SHOPIFY", Event: "orders/updated", RawBody: "{}",
	})
	if err := h.Handle(context.Background(), evt); err == nil {
		t.Error("expected WEBHOOK_MAPPER_PENDING error for unregistered pair")
	}
}
```

> `captureMapper` is a tiny test double implementing `mappers.WebhookMapper` returning its `out`. Adjust `stubExternalEvent`'s `GetEntityID()` return type to match `types.DomainEventI` exactly (it's `uuid.UUID`) — read `core/types/events.go`.

- [ ] **Step 2: Run test → fail**

Run: `cd packages/api/go && go test ./internal/webhooks/handlers/...`
Expected: FAIL — `undefined: NewWebhookReceivedHandler`.

- [ ] **Step 3: Write the handler**

Create `internal/webhooks/handlers/webhook_received_handler.go`:

```go
// Package handlers bridges a raw WebhookReceivedEvent into the
// canonical sync.ExternalXUpdatedEvent(s) via the (platform,event)
// mapper factory, then publishes them for the sync handlers to persist.
package handlers

import (
	"context"
	"fmt"

	"template/api-go/internal/webhooks/mappers"
	"template/api-go/internal/webhooks/services"
	"template/core-go/types"
)

// ExternalEventPublisher publishes the mapper's output. Backed by
// mediator.Dispatch in prod (inline — the sync ExternalXUpdatedHandler
// runs synchronously and persists).
type ExternalEventPublisher interface {
	Publish(ctx context.Context, event types.DomainEventI) error
}

type WebhookReceivedHandler struct {
	factory   *mappers.Factory
	publisher ExternalEventPublisher
}

func NewWebhookReceivedHandler(factory *mappers.Factory, publisher ExternalEventPublisher) *WebhookReceivedHandler {
	return &WebhookReceivedHandler{factory: factory, publisher: publisher}
}

func (h *WebhookReceivedHandler) EventName() string { return services.WebhookReceivedEventName }

func (h *WebhookReceivedHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	evt, ok := event.(services.WebhookReceivedEvent)
	if !ok {
		return fmt.Errorf("webhook handler: unexpected event type %T", event)
	}
	mapper, err := h.factory.Get(evt.Payload.Platform, evt.Payload.Event)
	if err != nil {
		return err // WEBHOOK_MAPPER_PENDING — surfaced, not a panic
	}
	externals, err := mapper.Map(ctx, []byte(evt.Payload.RawBody))
	if err != nil {
		return err
	}
	for _, ext := range externals {
		if err := h.publisher.Publish(ctx, ext); err != nil {
			return err
		}
	}
	return nil
}
```

- [ ] **Step 4: Run test → pass; build; commit**

Run: `cd packages/api/go && go test ./internal/webhooks/handlers/... && go build ./...`
```bash
git add packages/api/go/internal/webhooks/handlers
git commit --no-verify -m "feat(webhooks): WebhookReceivedEventHandler routes to (platform,event) mapper (Task TB4)"
```

---

## Task TB5: Single webhook controller + cutover (delete 9 controllers, dispatcher, old mappers; rewrite module)

**Files:**
- Create: `internal/webhooks/controllers/webhook.go`
- Modify: `internal/webhooks/controllers/response.go` — drop `services.DispatchResult`; new accepted/error shape
- Modify: `internal/webhooks/controllers/webhook_test.go` (new test for the single controller)
- Delete: `internal/webhooks/controllers/{shopify,cartpanda,google_ads,kiwify,meta,nuvemshop,stripe,tiktok,yampi}_webhook.go`
- Delete: `internal/webhooks/services/webhook_dispatcher.go` (+ test)
- Delete: `internal/webhooks/services/webhook_mapper.go` (old `MappedWebhook` + interface, + factory_test for the mapper part)
- Delete: `internal/webhooks/services/envelope_mapper.go` (+ test)
- Modify: `internal/webhooks/services/webhook_factory.go` — drop `WebhookMapperFactory`; keep `WebhookVerifierFactory`
- Rewrite: `internal/webhooks/module.go`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /controller, /handler, /test
**Depends on:** TB1, TB3, TB4

- [ ] **Step 1: Write the failing controller test**

Create `internal/webhooks/controllers/webhook_test.go`. Use a real `WebhookVerifierFactory` with a fake always-pass / always-fail verifier + a fake `DomainEventRepository` recording saves. Assert:
- missing `platform`/`event`/`integrationId` → 400, no event saved
- unknown platform → 400
- invalid signature → 401, no event saved
- verified → 202 + exactly one `WebhookReceivedEvent` saved with `Event`+`IntegrationID`+a deterministic dedupe id over `sha256(body)`

```go
package controllers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"template/api-go/internal/webhooks/services"
	"template/core-go/types"
)

type fakeVerifier struct{ valid bool }

func (f fakeVerifier) Platform() string        { return "SHOPIFY" }
func (f fakeVerifier) SignatureHeader() string { return "X-Sig" }
func (f fakeVerifier) Verify(_ []byte, _ string) (bool, error) { return f.valid, nil }

type fakeEventRepo struct{ saved []types.DomainEventI }

func (r *fakeEventRepo) Save(_ any, e types.DomainEventI) error { r.saved = append(r.saved, e); return nil } // match DomainEventRepository signature (ctx)
func (r *fakeEventRepo) SaveAll(_ any, es []types.DomainEventI) error { r.saved = append(r.saved, es...); return nil }

// ... build controller with NewWebhookController(verifierFactory, repo), fire httptest requests, assert codes + saved count.
```

> Match the `fakeEventRepo` method signatures to `core/repositories.DomainEventRepository` exactly (`Save(ctx context.Context, e types.DomainEventI) error`). Build the verifier factory via `services.NewWebhookVerifierFactory([]services.WebhookVerifier{fakeVerifier{...}})`.

- [ ] **Step 2: Run test → fail**

Run: `cd packages/api/go && go test ./internal/webhooks/controllers/...`
Expected: FAIL — `undefined: NewWebhookController`.

- [ ] **Step 3: Write the single controller**

Create `internal/webhooks/controllers/webhook.go`:

```go
package controllers

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"

	"template/api-go/internal/webhooks/services"
	corerepos "template/core-go/repositories"
	"template/core-go/objects"
	"template/core-go/types"
)

// WebhookController is the single inbound webhook endpoint. It verifies
// the per-platform signature, then publishes a WebhookReceivedEvent
// (deduped by sha256(rawBody)). The WebhookReceivedEventHandler maps it
// into sync.ExternalXUpdatedEvent(s) downstream.
type WebhookController struct {
	verifiers *services.WebhookVerifierFactory
	events    corerepos.DomainEventRepository
}

func NewWebhookController(verifiers *services.WebhookVerifierFactory, events corerepos.DomainEventRepository) *WebhookController {
	return &WebhookController{verifiers: verifiers, events: events}
}

func (c *WebhookController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context: "webhooks", Path: "/webhooks", Method: http.MethodPost,
		Description: "Inbound provider webhook intake — verify + publish WebhookReceivedEvent. ?platform&event&integrationId",
		Tags:        []string{"webhooks"},
	}
}

func (c *WebhookController) Handle(w http.ResponseWriter, r *http.Request) {
	platform := r.URL.Query().Get("platform")
	event := r.URL.Query().Get("event")
	integrationID := r.URL.Query().Get("integrationId")
	if platform == "" || event == "" || integrationID == "" {
		writeError(w, http.StatusBadRequest, "platform, event, integrationId required")
		return
	}
	verifier, ok := c.verifiers.Get(platform)
	if !ok {
		writeError(w, http.StatusBadRequest, "unknown platform")
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	defer r.Body.Close()

	valid, err := verifier.Verify(body, r.Header.Get(verifier.SignatureHeader()))
	if err != nil || !valid {
		writeError(w, http.StatusUnauthorized, "invalid signature")
		return
	}

	externalEventID := hex.EncodeToString(sha256Sum(body))
	id, err := objects.IDFromSeed("webhook", platform, externalEventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	received := types.NewDomainEvent(
		services.WebhookReceivedEventName, id.UUID(), "",
		services.WebhookReceivedPayload{
			Platform: platform, Event: event, IntegrationID: integrationID,
			ExternalEventID: externalEventID, WebhookEventType: event, RawBody: string(body),
		},
	)
	if err := c.events.Save(r.Context(), received); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeAccepted(w, externalEventID, event)
}

func sha256Sum(b []byte) []byte { s := sha256.Sum256(b); return s[:] }
```

> `objects.IDFromSeed(parts ...string)` exists in `core/objects/id.go` (deterministic UUIDv5 over the parts) — this replaces the old `HashedID("webhook", platform, externalEventId)`. Confirm its signature; if it differs, use the existing `HashedID` helper the deleted dispatcher used (recover via `git show HEAD:internal/webhooks/services/webhook_dispatcher.go`).

- [ ] **Step 4: Rewrite response.go**

Modify `internal/webhooks/controllers/response.go` — drop `writeWebhookResponse(... services.DispatchResult ...)`; add:

```go
package controllers

import (
	"encoding/json"
	"net/http"
)

func writeAccepted(w http.ResponseWriter, externalEventID, event string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]any{"status": "accepted", "externalEventId": externalEventID, "event": event})
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "error", "error": msg})
}
```

- [ ] **Step 5: Delete the old controllers + services**

```bash
cd packages/api/go
git rm internal/webhooks/controllers/{shopify,cartpanda,google_ads,kiwify,meta,nuvemshop,stripe,tiktok,yampi}_webhook.go
git rm internal/webhooks/services/webhook_dispatcher.go internal/webhooks/services/webhook_dispatcher_test.go 2>/dev/null || true
git rm internal/webhooks/services/webhook_mapper.go internal/webhooks/services/envelope_mapper.go 2>/dev/null || true
```
Modify `internal/webhooks/services/webhook_factory.go` — delete the `WebhookMapperFactory` struct + `NewWebhookMapperFactory` + `Get`; keep `WebhookVerifierFactory`. Update `webhook_factory_test.go` to drop the mapper-factory cases. If `webhook_received_event.go` referenced `MappedWebhook`, it doesn't — leave it.

- [ ] **Step 6: Rewrite module.go**

Rewrite `internal/webhooks/module.go` to provide:
- the per-platform `WebhookVerifier`s (now with headers from TB1) into `group:"webhook_verifiers"` + the `WebhookVerifierFactory` (`fx.Annotate(NewWebhookVerifierFactory, fx.ParamTags(\`group:"webhook_verifiers"\`))`)
- the `(platform,event)` mappers into `group:"webhook_mappers"`: the real `shopify.NewOrderUpdatedMapper` + `PendingMapper`s for the other known `(platform,event)` pairs; + the `mappers.Factory` (`fx.Annotate(mappers.NewFactory, fx.ParamTags(\`group:"webhook_mappers"\`))`)
- a `handlers.ExternalEventPublisher` backed by `mediator.Dispatch` (define a small concrete `mediatorPublisher{m}` in module.go, same shape as Spec A's executor `syncPublisher`)
- `handlers.NewWebhookReceivedHandler` + an `fx.Invoke(func(m mediator.InternalMediator, h *handlers.WebhookReceivedHandler){ m.Register(h) })` to register it
- the single `controllers.NewWebhookController` into `group:"controllers"`
- DROP all 9 per-platform controller providers + the dispatcher provider + the old mapper-factory + envelope-mapper providers.

Drop the now-unused envelope-mapper helper funcs (`nuvemShopMapper`, etc.).

- [ ] **Step 7: Build + test**

Run: `cd packages/api/go && go build ./... && go build ./cmd/api/... && go test ./internal/webhooks/...`
Expected: 0 build errors; fx app constructs; controller + mapper + handler tests pass.

- [ ] **Step 8: Commit**

```bash
git add -A packages/api/go/internal/webhooks
git commit --no-verify -m "feat(webhooks): single /webhooks controller + handler cutover; drop 9 controllers+dispatcher (Task TB5)"
```

---

## Task TB6: Full webhook-flow verification

**Files:** (none — verification only)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** haiku
**Depends on:** TB5

- [ ] **Step 1: Go build + vet + test**

Run: `cd packages/api/go && go build ./... && go vet ./internal/webhooks/... && go test ./...`
Expected: 0 build/vet errors; all packages pass (DB tests skip cleanly).

- [ ] **Step 2: Confirm the route surface**

Run: `cd packages/api/go && ls internal/webhooks/controllers internal/webhooks/mappers internal/webhooks/handlers`
Expected: `controllers/` has `webhook.go` + `response.go` only (no per-platform files); `mappers/` has `mapper.go factory.go pending.go shopify/`; `handlers/` has `webhook_received_handler.go`.

- [ ] **Step 3: Confirm the cutover removed the old surface**

Run: `cd packages/api/go && ls internal/webhooks/services/webhook_dispatcher.go internal/webhooks/services/envelope_mapper.go 2>&1 | head`
Expected: both "No such file or directory".

---

## Final Validation

- [ ] `cd packages/api/go && go build ./...` — 0 errors
- [ ] `cd packages/api/go && go test ./...` — all packages pass
- [ ] `cd packages/api/go && go vet ./internal/webhooks/...` — clean
- [ ] `cd packages/api/go && go build ./cmd/api/...` — fx app constructs
- [ ] AC mapping (every spec AC → ≥1 test path):
  - AC-1 → `internal/webhooks/controllers/webhook_test.go` (single endpoint) + TB6 Step 2 (9 controllers gone)
  - AC-2 → `internal/webhooks/mappers/shopify/order_updated_test.go:"...ProducesExternalOrderUpdated"` + (Spec A) `internal/sync/handlers/order_updated_handler_test.go` (the consuming handler)
  - AC-3 → `internal/webhooks/mappers/factory_test.go:"TestFactory_GetUnregisteredReturnsTypedError"` + `...GetRegistered`
  - AC-4 → `internal/webhooks/handlers/webhook_received_handler_test.go:"...RoutesToMapperAndPublishes"`
  - AC-5 → `internal/webhooks/controllers/webhook_test.go` (invalid signature → 401, no save)
  - AC-6 → `internal/webhooks/controllers/webhook_test.go` (deterministic dedupe id) + payload carries Event+IntegrationID
  - AC-7 → Final Validation go build/test/vet

## Notes

- **Commits are Go-only `--no-verify`** — the workspace `tsc` pre-commit hook is red from an unrelated parallel TS refactor; these commits touch zero TS. `go build`/`test`/`vet` is the real gate (authorized by the user for Go-only commits).
- **Cross-BC contract:** `webhooks` imports `sync/events` (the `ExternalXUpdatedEvent` contract) + `sync/storage/order` (the `OrderInput` payload type) + `sync/services/shopify` (the orders normalizer, reused). This is the intentional shared contract per the spec — the external event is the seam between ingest (webhook OR sync pipeline) and persistence (sync handlers).
- **Inline dispatch:** the `WebhookReceivedHandler` publishes external events via `mediator.Dispatch` (inline). Since the handler itself runs inside the dispatcher's `Dispatch` of the `WebhookReceivedEvent`, this is a nested synchronous dispatch — the `ChannelMediator.Dispatch` is re-entrant-safe (lookup + call). The sync `ExternalXUpdatedHandler` then persists within the same chain.
- **PENDING coverage:** only `SHOPIFY`/`orders/updated` is real. Register `PendingMapper`s for the other known `(platform, event)` pairs as they're identified; live webhooks for them verify + log a `WebhookReceivedEvent` but the handler returns `WEBHOOK_MAPPER_PENDING` (surfaced, not a 500).
- **Provider URL dependency:** providers must preserve the `?platform&event&integrationId` query string on the registered webhook URL (spec Risks). Confirm the TS Integration handshake emits the new URL before real non-Shopify mappers ship.
