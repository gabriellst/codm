package controllers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"template/core-go/db/sqlite"
)

// newStore boots a real SqliteStore in a t.TempDir() — the same constructor
// production uses, so the migrations that create gateway_channels are applied and
// what passes here passes against the real shared store.
func newStore(t *testing.T) *sqlite.SqliteStore {
	t.Helper()
	store, err := sqlite.NewSqliteStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewSqliteStore: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) HealthOutput {
	t.Helper()
	var out HealthOutput
	if err := json.NewDecoder(rec.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return out
}

func TestHealthIs200WhenSelect1Works(t *testing.T) {
	store := newStore(t)
	rec := httptest.NewRecorder()
	NewHealthController(store.DB()).Handle(rec, httptest.NewRequest("GET", "/api/health", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("AC-6: got %d, want 200", rec.Code)
	}
	out := decode(t, rec)
	if out.Components["db"].Status != "up" || !out.Components["db"].Gate {
		t.Fatalf("componente db: %+v", out.Components["db"])
	}
}

// FALSEADOR AC-6: com a conexao fechada, SELECT 1 falha e o status MUDA.
func TestHealthIsNot200WhenSelect1Fails(t *testing.T) {
	store := newStore(t)
	db := store.DB()
	_ = db.Close()

	rec := httptest.NewRecorder()
	NewHealthController(db).Handle(rec, httptest.NewRequest("GET", "/api/health", nil))
	if rec.Code == http.StatusOK {
		t.Fatal("AC-6: SELECT 1 falhando nao pode responder 200")
	}
	if decode(t, rec).Components["db"].Status != "down" {
		t.Fatal("componente db deveria estar down")
	}
}

// FALSEADOR US-4/AC-6: o estado whatsmeow NUNCA influencia o codigo HTTP.
func TestChannelStatusNeverChangesTheHttpStatus(t *testing.T) {
	store := newStore(t)
	for _, status := range []string{"CONNECTED", "DISCONNECTED", "CREATED"} {
		if _, err := store.DB().Exec(
			`INSERT INTO gateway_channels (id, owner_id, platform, name, owner_remote_id, credentials, status, created_at, updated_at, version)
			 VALUES (?,?,?,?,?,?,?,?,?,0)
			 ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
			"ch-1", "local", "WHATSAPP", "e2e", "", "{}", status, 1, 1,
		); err != nil {
			t.Fatalf("seed %s: %v", status, err)
		}

		rec := httptest.NewRecorder()
		NewHealthController(store.DB()).Handle(rec, httptest.NewRequest("GET", "/api/health", nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("status de canal %s mudou o HTTP para %d — o gate nao pode ver o whatsmeow", status, rec.Code)
		}
		out := decode(t, rec)
		if out.Components["channel"].Gate {
			t.Fatal("componente channel nao pode ser gate")
		}
		if out.Components["channel"].Detail != status {
			t.Fatalf("diagnostico do canal: got %q, want %q", out.Components["channel"].Detail, status)
		}
	}
}
