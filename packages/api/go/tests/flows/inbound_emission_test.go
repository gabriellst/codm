// AC-4 (.specs/2026-08-10-eixo-ambiente-go-design.md): a scripted inbound
// message traverses the REAL ingest — mock emits channel.message_received via
// the SAME ctxevents.NewMessageReceivedEvent constructor mapper.mapMessage
// uses, persisted through the real DomainEventRepository (dual-write into
// shared_events + the "gateway"-source shared_outbox slice) — and the fan-out
// on the OTHER end is what this test proves: the SqliteOutboxDispatcher drains
// that row to the InternalMediator, which delivers it to BOTH registered
// listeners (internal/channel/module.go's registerDomainEventHandlers):
//
//   - MessageProjector (projections/projectors/message_projector.go) inserts
//     the read-model row into gateway_messages — the projection end.
//   - MessageReceivedHandler (handlers/message_received_handler.go)
//     republishes the fact as an integration event via ExternalMediator
//     (core/services/mediator/sql_external_mediator.go): the row it inserts
//     carries name=wire.ChannelMessageReceivedEventName and
//     source=core.integrationOutboxSource ("integration",
//     packages/api/go/core/module.go:35, itself string(wire.OutboxSourceintegration)
//     — packages/contracts/generated/go/wire/enums.go:556) — the exact lane a
//     real sql_external_mediator on that source would claim (the mediator's
//     own claim/dispatch loop has its own tests; this asserts the ROW it
//     produced, per the plan's scope fence).
//
// Uses core/testenv (T5) — a real fx app, real HTTP, real SQLite. Reuses
// testOwnerID / gatewayBase / scriptedOverlays / fetchChannelStatus from
// qr_pairing_test.go (same package, same dir — trivially shareable, so no
// separate testhelpers_test.go: there is no real duplication to extract).
package flows_test

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
	"template/core-go/pkg/testenv"
	"template/core-go/registry"
)

func TestInboundEmission(t *testing.T) {
	const (
		remote1 = "5511999990001@s.whatsapp.net"
		remote2 = "5511999990002@s.whatsapp.net"
		text1   = "inbound emission test — message one"
		text2   = "inbound emission test — message two"
	)

	// scenario: connect + auto-pair quickly, then the mock plays 2 scripted
	// inbound messages right after pairing completes (mock/channel.go's
	// runPairingClock → emitInboundMessages — see scenario.go docblock).
	overlays := scriptedOverlays(mock.Scenario{
		AutoPairAfter: 20 * time.Millisecond,
		InboundMessages: []mock.InboundSeed{
			{RemoteID: remote1, Text: text1},
			{RemoteID: remote2, Text: text2},
		},
	})

	backend := testenv.Start(t, registry.EnvIntegration, gatewayConfigPrefix, gatewayBase, overlays)
	client := &http.Client{Timeout: 5 * time.Second}

	// 1. Create the channel — real HTTP, real use case, real repository.
	createBody, _ := json.Marshal(map[string]string{"name": "inbound-emission-test-channel"})
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
	// starts the pairing clock (AutoPairAfter, then Connected + the 2
	// scripted inbound messages) through the REAL mapper/DomainEventRepository.
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

	// 3. Poll (deadline, never a fixed sleep) until the message projection
	// (gateway_messages, written by MessageProjector.handleReceived) carries
	// both scripted rows for this channel, with the expected remote/content
	// fields.
	deadline := time.Now().Add(5 * time.Second)
	var rows []gatewayMessageRow
	for time.Now().Before(deadline) {
		rows, err = fetchGatewayMessages(backend.DB, created.ID)
		if err != nil {
			t.Fatalf("query gateway_messages: %v", err)
		}
		if len(rows) >= 2 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if len(rows) != 2 {
		t.Fatalf("gateway_messages: expected 2 projected rows for channel %s before deadline, found %d", created.ID, len(rows))
	}

	gotByRemote := make(map[string]gatewayMessageRow, len(rows))
	for _, r := range rows {
		gotByRemote[r.RemoteID] = r
	}
	for _, tc := range []struct {
		remoteID, text string
	}{
		{remote1, text1},
		{remote2, text2},
	} {
		row, ok := gotByRemote[tc.remoteID]
		if !ok {
			t.Fatalf("gateway_messages: no row projected for remoteId %q", tc.remoteID)
		}
		if row.Text != tc.text {
			t.Fatalf("gateway_messages: remoteId %q: expected content text %q, got %q", tc.remoteID, tc.text, row.Text)
		}
		if row.Direction != "RECEIVED" {
			t.Fatalf("gateway_messages: remoteId %q: expected direction RECEIVED, got %q", tc.remoteID, row.Direction)
		}
	}

	// 4. Poll (deadline) until shared_outbox carries the 2 integration-event
	// rows MessageReceivedHandler produced via ExternalMediator.Publish — the
	// lane/source contract a real sql_external_mediator on that source claims
	// (name=wire.ChannelMessageReceivedEventName, source=integration — see
	// file docblock). Row-level assertion only: the mediator's own
	// claim/dispatch loop has its own tests.
	deadline = time.Now().Add(5 * time.Second)
	var outboxCount int
	for time.Now().Before(deadline) {
		row := backend.DB.QueryRowContext(context.Background(),
			`SELECT COUNT(*) FROM shared_outbox WHERE name = ? AND source = ? AND owner_id = ?`,
			wire.ChannelMessageReceivedEventName, string(wire.OutboxSourceintegration), testOwnerID,
		)
		if err := row.Scan(&outboxCount); err != nil {
			t.Fatalf("query shared_outbox: %v", err)
		}
		if outboxCount >= 2 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if outboxCount != 2 {
		t.Fatalf("shared_outbox: expected 2 rows name=%q source=%q owner_id=%q before deadline, found %d",
			wire.ChannelMessageReceivedEventName, string(wire.OutboxSourceintegration), testOwnerID, outboxCount)
	}
}

// gatewayMessageRow is the sliver of the gateway_messages projection this
// test asserts on.
type gatewayMessageRow struct {
	RemoteID  string
	Direction string
	Text      string
}

// fetchGatewayMessages reads the projected rows for channelID directly (no
// query use case exists for this yet) and unmarshals the JSON content column
// down to the "text" field the mock's inbound seed produces
// (mock/channel.go's emitInboundMessages: content, _ :=
// json.Marshal(map[string]string{"text": seed.Text})).
func fetchGatewayMessages(db *sql.DB, channelID string) ([]gatewayMessageRow, error) {
	rows, err := db.QueryContext(context.Background(),
		`SELECT remote_id, direction, content FROM gateway_messages WHERE channel_id = ?`,
		channelID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []gatewayMessageRow
	for rows.Next() {
		var (
			remoteID, direction, content string
		)
		if err := rows.Scan(&remoteID, &direction, &content); err != nil {
			return nil, err
		}
		var decoded struct {
			Text string `json:"text"`
		}
		if err := json.Unmarshal([]byte(content), &decoded); err != nil {
			return nil, err
		}
		out = append(out, gatewayMessageRow{RemoteID: remoteID, Direction: direction, Text: decoded.Text})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}
