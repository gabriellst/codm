// HAND-WRITTEN conformance test — intentionally authored, NOT emitted by codegen.
// emit-wire-go.ts does not generate or overwrite this file. Do not add an AUTO-GENERATED header.
//
// Round-trip rail over the SHARED wire fixtures (packages/contracts/fixtures/events) —
// the same bytes the Rust (generated/rust/tests/roundtrip.rs) and TS binding tests parse.
// Every fixture is the canonical transport envelope {id, ownerId, time, name, payload};
// UnmarshalPayload is the typed door from that envelope into <Model>Payload. Re-marshaling
// and comparing decoded JSON (order-agnostic) proves nothing is lost or renamed.
package tests

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	wire "template/contracts-go/wire"
)

type transportEnvelope struct {
	ID      string          `json:"id"`
	OwnerID string          `json:"ownerId"`
	Time    time.Time       `json:"time"`
	Name    string          `json:"name"`
	Payload json.RawMessage `json:"payload"`
}

const fixturesDir = "../../../fixtures/events"

func fixtureFiles(t *testing.T) []string {
	t.Helper()
	entries, err := os.ReadDir(fixturesDir)
	if err != nil {
		t.Fatalf("fixtures/events must exist — run `bun run codegen:fixtures` in packages/contracts: %v", err)
	}
	var files []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".json") {
			files = append(files, filepath.Join(fixturesDir, e.Name()))
		}
	}
	return files
}

func TestEveryEventFixtureDecodesAndRoundtrips(t *testing.T) {
	seen := 0
	for _, path := range fixtureFiles(t) {
		if strings.HasPrefix(filepath.Base(path), "_") {
			continue
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("%s: read: %v", path, err)
		}
		var env transportEnvelope
		if err := json.Unmarshal(raw, &env); err != nil {
			t.Fatalf("%s: envelope decode: %v", path, err)
		}
		if env.OwnerID == "" || env.Name == "" || env.Time.IsZero() {
			t.Fatalf("%s: envelope fields lost (ownerId=%q name=%q time=%v)", path, env.OwnerID, env.Name, env.Time)
		}
		payload, err := wire.UnmarshalPayload(env.Name, env.Payload)
		if err != nil {
			t.Fatalf("%s: payload decode: %v", path, err)
		}
		back, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("%s: re-marshal: %v", path, err)
		}
		var origAny, backAny any
		if err := json.Unmarshal(env.Payload, &origAny); err != nil {
			t.Fatalf("%s: fixture payload is not valid JSON: %v", path, err)
		}
		if err := json.Unmarshal(back, &backAny); err != nil {
			t.Fatalf("%s: re-marshaled payload is not valid JSON: %v", path, err)
		}
		if !reflect.DeepEqual(origAny, backAny) {
			t.Fatalf("%s: roundtrip diverged\n  orig: %s\n  back: %s", path, env.Payload, back)
		}
		seen++
	}
	if seen == 0 {
		t.Fatal("no event fixtures found — run `bun run codegen:fixtures` in packages/contracts")
	}
}

func TestUnknownEventNameErrsFromUnmarshalPayload(t *testing.T) {
	// Go semantics: UnmarshalPayload returns an error for an unknown name; the passthrough
	// policy for unknown events lives with the CONSUMER (mirror: Rust lands in Opaque).
	raw, err := os.ReadFile(filepath.Join(fixturesDir, "_unknown-event.json"))
	if err != nil {
		t.Fatalf("unknown-event probe fixture: %v", err)
	}
	var env transportEnvelope
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatalf("envelope of unknown event must still decode (forward-compat): %v", err)
	}
	if _, err := wire.UnmarshalPayload(env.Name, env.Payload); err == nil {
		t.Fatal("expected an error for an unknown event name")
	}
}
