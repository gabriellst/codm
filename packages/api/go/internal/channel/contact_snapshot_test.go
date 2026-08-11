// T13 (.plans/2026-08-10-eixo-ambiente-go.md): contact snapshot projection
// moves out of the whatsmeow adapter into RemoteSnapshotProjector
// (projections/projectors/remote_snapshot_projector.go), reacting to
// channel.gateway.sync_complete instead of being called directly from
// WhatsmeowChannel.handleEvent. This proves the pipeline end to end with no
// phone involved: connect a channel, let the scenario auto-pair and fire the
// scripted sync-complete (mock/channel.go's runPairingClock, T13), and verify
// BOTH facts the design calls for land through the REAL
// mapper/outbox/handler/projector pipeline:
//
//  1. gateway_remotes carries a row per scripted contact (the projection this
//     task moved).
//  2. shared_outbox carries an integration.channel.remotes_synced row (the
//     completion signal channel.remotes_synced's pre-existing
//     RemotesSyncedIntegrationHandler republishes) — the contract
//     packages/api/typescript/src/ui/handlers/ConsumeChannelRemotesSynced.ts
//     depends on to invalidate the sidebar. Asserting this, not just the
//     trigger event, is what proves the two-event handoff (trigger vs.
//     completion) survived the refactor.
//
// Uses core/testenv (T5) — a real fx app, real HTTP, real SQLite. Reuses
// testOwnerID / gatewayBase / scriptedOverlays / fetchChannelStatus from
// qr_pairing_test.go (same package, same dir).
package channel_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"template/api-go/internal/channel/services/gateway/mock"
	"template/contracts-go/wire"
	"template/core-go/registry"
	"template/core-go/pkg/testenv"
)

func TestContactSnapshot(t *testing.T) {
	const (
		contact1ID   = "5511999990001@s.whatsapp.net"
		contact1Name = "Ada Lovelace"
		contact2ID   = "5511999990002@s.whatsapp.net"
		contact2Name = "Alan Turing"
	)

	// scenario: connect + auto-pair quickly. On pairing, the mock now also
	// fires AppStateSyncComplete(regular) through the real mapper (T13's mock
	// emit — mock/channel.go's runPairingClock), which is the trigger
	// RemoteSnapshotProjector subscribes to. It then streams scenario.Contacts
	// via StreamContactSnapshot — same names/IDs the e2e column's
	// defaultE2eScenario (overlay.go) seeds, reused here for a focused,
	// non-e2e test.
	overlays := scriptedOverlays(mock.Scenario{
		AutoPairAfter: 20 * time.Millisecond,
		Contacts: []mock.ContactSeed{
			{RemoteID: contact1ID, RemoteType: "USER", Name: contact1Name},
			{RemoteID: contact2ID, RemoteType: "USER", Name: contact2Name},
		},
	})

	backend := testenv.Start(t, registry.EnvIntegration, gatewayConfigPrefix, gatewayBase, overlays)
	client := &http.Client{Timeout: 5 * time.Second}

	// 1. Create the channel — real HTTP, real use case, real repository.
	createBody, _ := json.Marshal(map[string]string{"name": "contact-snapshot-test-channel"})
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

	// 2. Connect — drives the scripted MockChannel through Connect, which
	// starts the pairing clock (AutoPairAfter, then Connected +
	// AppStateSyncComplete) through the REAL mapper/DomainEventRepository.
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

	// 3. Poll (deadline, never a fixed sleep) until the remotes projection
	// (gateway_remotes, written by RemoteSnapshotProjector.handleSyncComplete)
	// carries both scripted contacts for this channel.
	deadline := time.Now().Add(5 * time.Second)
	var rows []gatewayRemoteRow
	for time.Now().Before(deadline) {
		rows, err = fetchGatewayRemotes(backend.DB, created.ID)
		if err != nil {
			t.Fatalf("query gateway_remotes: %v", err)
		}
		if len(rows) >= 2 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if len(rows) != 2 {
		t.Fatalf("gateway_remotes: expected 2 projected rows for channel %s before deadline, found %d", created.ID, len(rows))
	}

	gotByRemote := make(map[string]gatewayRemoteRow, len(rows))
	for _, r := range rows {
		gotByRemote[r.RemoteID] = r
	}
	for _, tc := range []struct {
		remoteID, name string
	}{
		{contact1ID, contact1Name},
		{contact2ID, contact2Name},
	} {
		row, ok := gotByRemote[tc.remoteID]
		if !ok {
			t.Fatalf("gateway_remotes: no row projected for remoteId %q", tc.remoteID)
		}
		if row.Name != tc.name {
			t.Fatalf("gateway_remotes: remoteId %q: expected name %q, got %q", tc.remoteID, tc.name, row.Name)
		}
		if row.Type != "USER" {
			t.Fatalf("gateway_remotes: remoteId %q: expected type USER, got %q", tc.remoteID, row.Type)
		}
	}

	// 4. Poll (deadline) until shared_outbox carries the
	// integration.channel.remotes_synced row RemotesSyncedIntegrationHandler
	// produced off the channel.remotes_synced domain event
	// RemoteSnapshotProjector raises once phase 1's rows have landed — the
	// completion signal the TS sidebar listener depends on (see file
	// docblock). Row-level assertion only: the mediator's own claim/dispatch
	// loop has its own tests.
	deadline = time.Now().Add(5 * time.Second)
	var outboxCount int
	for time.Now().Before(deadline) {
		row := backend.DB.QueryRowContext(context.Background(),
			`SELECT COUNT(*) FROM shared_outbox WHERE name = ? AND source = ? AND owner_id = ?`,
			wire.ChannelRemotesSyncedEventName, string(wire.OutboxSourceintegration), testOwnerID,
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
		t.Fatalf("shared_outbox: expected a %q row (source=%q, owner_id=%q) before deadline, found none",
			wire.ChannelRemotesSyncedEventName, string(wire.OutboxSourceintegration), testOwnerID)
	}
}

// gatewayRemoteRow is the sliver of the gateway_remotes projection this test
// asserts on.
type gatewayRemoteRow struct {
	RemoteID string
	Type     string
	Name     string
}

// fetchGatewayRemotes reads the projected rows for channelID directly (no
// query use case is exercised by this test).
func fetchGatewayRemotes(db *sql.DB, channelID string) ([]gatewayRemoteRow, error) {
	rows, err := db.QueryContext(context.Background(),
		`SELECT remote_id, type, name FROM gateway_remotes WHERE channel_id = ?`,
		channelID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []gatewayRemoteRow
	for rows.Next() {
		var row gatewayRemoteRow
		if err := rows.Scan(&row.RemoteID, &row.Type, &row.Name); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}
