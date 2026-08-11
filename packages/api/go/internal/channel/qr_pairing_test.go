// AC-3 (.specs/2026-08-10-eixo-ambiente-go-design.md): the gateway's QR →
// pairing flow, end to end, with no phone involved — connect a channel, see
// the scripted QR frame, let the scenario auto-pair, and verify the fact
// traveled through the REAL mapper/outbox/handler pipeline: the channel
// projects CONNECTED and shared_outbox carries a channel.gateway_connected
// row. Uses core/testenv (T5) — a real fx app, real HTTP, real SQLite.
package channel_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"go.uber.org/fx"

	"template/api-go/internal/channel"
	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/gateway/mock"
	internalshared "template/api-go/internal/shared"
	core "template/core-go"
	"template/core-go/registry"
	"template/core-go/repositories"
	"template/core-go/pkg/testenv"
)

// testOwnerID is a fixed, valid UUID — the channel controllers require
// X-Owner-Id (validate:"required,uuid") and derive ownership from it
// directly, with no session needed (services/gateway request flow never
// touches better-auth in this test).
const testOwnerID = "11111111-1111-1111-1111-111111111111"

// scriptedOverlays composes THIS test's own registry.Overlays instead of
// reusing channel.Overlays: the production integration column plays a
// zero-value mock.Scenario (connects/pairs immediately, no QR frames — see
// internal/channel/overlay.go), but AC-3 needs QR frames to be visible before
// pairing completes. testenv.Start takes (base, overlays) as parameters
// precisely so the TEST can decide this composition (plan T5 handoff).
func scriptedOverlays(scenario mock.Scenario) registry.Overlays {
	return registry.Overlays{
		registry.EnvIntegration: fx.Decorate(func(domainEventRepo repositories.DomainEventRepository) gateway.ChannelFactory {
			return mock.NewMockChannelFactory(scenario, domainEventRepo)
		}),
	}
}

// gatewayBase mirrors cmd/api/main.go's unexported `base` var — the same
// three modules (core, api-go-local shared, channel), just reconstructed here
// because `main.base` is package-private to `main` and this test cannot
// import a main package. core.Module takes channel.ConfigService — the SAME
// declared prefix/defaults main.go composes against (spec T11 AC-1).
var gatewayBase = fx.Options(
	core.Module(channel.ConfigService),
	internalshared.Module,
	channel.Module,
)

// gatewayConfigPrefix is the config prefix testenv.Start needs to pin the
// SAME port env var config.Load will read — derived from channel.ConfigService
// rather than a raw literal, so this test file and cmd/api/main.go can never
// drift apart on what "this service's identity" means. Shared with
// inbound_emission_test.go (same package, same dir).
var gatewayConfigPrefix = channel.ConfigService.Prefix

func TestQRPairing(t *testing.T) {
	overlays := scriptedOverlays(mock.Scenario{
		QRFrames:      []string{"qr-frame-1", "qr-frame-2"},
		AutoPairAfter: 100 * time.Millisecond,
	})

	backend := testenv.Start(t, registry.EnvIntegration, gatewayConfigPrefix, gatewayBase, overlays)
	client := &http.Client{Timeout: 5 * time.Second}

	// 1. Create the channel — real HTTP, real use case, real repository.
	createBody, _ := json.Marshal(map[string]string{"name": "qr-pairing-test-channel"})
	createReq, err := http.NewRequest(http.MethodPost, backend.URL+"/api/channel/channels/whatsapp", bytes.NewReader(createBody))
	if err != nil {
		t.Fatalf("build create request: %v", err)
	}
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("X-Owner-Id", testOwnerID)

	createResp, err := client.Do(createReq)
	if err != nil {
		t.Fatalf("create channel: %v", err)
	}
	defer createResp.Body.Close()
	if createResp.StatusCode != http.StatusCreated {
		t.Fatalf("create channel: expected 201, got %d", createResp.StatusCode)
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(createResp.Body).Decode(&created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if created.ID == "" {
		t.Fatal("create channel: empty id in response")
	}

	// 2. Connect — real HTTP, real use case, drives the scripted MockChannel
	// through GetQRChannel (starts the pairing clock) and returns the first
	// QR frame.
	connectReq, err := http.NewRequest(http.MethodPost, backend.URL+"/api/channel/channels/"+created.ID+"/connect", nil)
	if err != nil {
		t.Fatalf("build connect request: %v", err)
	}
	connectReq.Header.Set("X-Owner-Id", testOwnerID)

	connectResp, err := client.Do(connectReq)
	if err != nil {
		t.Fatalf("connect channel: %v", err)
	}
	defer connectResp.Body.Close()
	if connectResp.StatusCode != http.StatusOK {
		t.Fatalf("connect channel: expected 200, got %d", connectResp.StatusCode)
	}
	var connected struct {
		State  string `json:"state"`
		QRCode string `json:"qrCode"`
	}
	if err := json.NewDecoder(connectResp.Body).Decode(&connected); err != nil {
		t.Fatalf("decode connect response: %v", err)
	}
	if connected.QRCode != "qr-frame-1" {
		t.Fatalf("connect channel: expected first scripted QR frame %q, got %q", "qr-frame-1", connected.QRCode)
	}
	if connected.State != "CONNECTING" {
		t.Fatalf("connect channel: expected state CONNECTING, got %q", connected.State)
	}

	// 3. Poll (deadline, never a fixed sleep) until the scenario has
	// auto-paired and the REAL pipeline (mapper.MapEvent → outbox →
	// OutboxDispatcher → ChannelConnectedHandler → repo.Save) has projected
	// the channel CONNECTED.
	deadline := time.Now().Add(5 * time.Second)
	var lastStatus string
	for time.Now().Before(deadline) {
		status, err := fetchChannelStatus(client, backend.URL, created.ID)
		if err != nil {
			t.Fatalf("get channel: %v", err)
		}
		lastStatus = status
		if status == "CONNECTED" {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if lastStatus != "CONNECTED" {
		t.Fatalf("channel did not reach CONNECTED before deadline, last status: %q", lastStatus)
	}

	// 4. shared_outbox carries the channel.gateway_connected row the real
	// mapper produced (regardless of whether the dispatcher has since marked
	// it processed).
	deadline = time.Now().Add(5 * time.Second)
	var outboxCount int
	for time.Now().Before(deadline) {
		row := backend.DB.QueryRowContext(context.Background(),
			`SELECT COUNT(*) FROM shared_outbox WHERE name = ? AND entity_id = ?`,
			"channel.gateway_connected", created.ID,
		)
		if err := row.Scan(&outboxCount); err != nil {
			t.Fatalf("query shared_outbox: %v", err)
		}
		if outboxCount > 0 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if outboxCount == 0 {
		t.Fatal("shared_outbox: expected a channel.gateway_connected row, found none before deadline")
	}
}

func fetchChannelStatus(client *http.Client, baseURL, channelID string) (string, error) {
	resp, err := client.Get(baseURL + "/api/channel/channels/" + channelID)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", nil
	}
	var out struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	return out.Status, nil
}
