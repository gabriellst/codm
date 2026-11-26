package triage

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writeScopes(t *testing.T, path string, scopes []scopeFileEntry) {
	t.Helper()
	doc := scopeFile{Scopes: scopes}
	data, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestResolveKnownAndUnknownKeys(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "scopes.json")
	writeScopes(t, path, []scopeFileEntry{
		{Name: "whatsapp", Key: "wa-secret", JIDs: []string{"558500000009-1500000000@g.us"}},
		{Name: "bk-bots-supervisor", Key: "bk-secret", JIDs: []string{"120363000000000011@g.us"}},
	})
	s := NewScopeStore(path, "global-secret")

	wa, err := s.Resolve("wa-secret")
	if err != nil || wa.Name != "whatsapp" {
		t.Fatalf("whatsapp key: %+v %v", wa, err)
	}
	bk, err := s.Resolve("bk-secret")
	if err != nil || bk.Name != "bk-bots-supervisor" {
		t.Fatalf("bk key: %+v %v", bk, err)
	}
	if _, err := s.Resolve("nope"); !errors.Is(err, ErrUnknownKey) {
		t.Fatalf("unknown key: %v", err)
	}
	if _, err := s.Resolve(""); !errors.Is(err, ErrUnknownKey) {
		t.Fatalf("empty token: %v", err)
	}
	if _, err := s.Resolve("  wa-secret  "); err != nil {
		t.Fatalf("trimmed token should resolve: %v", err)
	}
}

func TestCrossScopeRejection(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "scopes.json")
	yo := "558500000009-1500000000@g.us"
	bk := "120363000000000011@g.us"
	writeScopes(t, path, []scopeFileEntry{
		{Name: "whatsapp", Key: "wa-secret", JIDs: []string{yo}},
		{Name: "bk-bots-supervisor", Key: "bk-secret", JIDs: []string{bk, "120363000000000013@g.us"}},
	})
	s := NewScopeStore(path, "global-secret")

	wa, _ := s.Resolve("wa-secret")
	if !wa.Allows(yo) {
		t.Fatal("whatsapp must allow YO")
	}
	if wa.Allows(bk) {
		t.Fatal("whatsapp must not allow a BK group")
	}
	sup, _ := s.Resolve("bk-secret")
	if !sup.Allows(bk) {
		t.Fatal("supervisor must allow its own group")
	}
	if sup.Allows(yo) {
		t.Fatal("supervisor must not allow YO")
	}
	// Normalization: device-suffixed or bare digits must still match.
	if !wa.Allows("558500000009-1500000000@g.us") || wa.Allows("558500000009@s.whatsapp.net") {
		t.Fatal("group JID normalization mismatch")
	}
	phoneScope := NewScopeStore(path, "")
	writeScopes(t, path, []scopeFileEntry{
		{Name: "whatsapp", Key: "wa-secret", JIDs: []string{"+55 85 0000-0009"}},
	})
	wa, err := phoneScope.Resolve("wa-secret")
	if err != nil || !wa.Allows("558500000009:12@s.whatsapp.net") {
		t.Fatalf("phone normalization: allows=%v err=%v", wa != nil && wa.Allows("558500000009:12@s.whatsapp.net"), err)
	}
}

func TestGlobalAPIKeyMapsToWhatsappOnly(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "scopes.json")
	yo := "558500000009-1500000000@g.us"
	bk := "120363000000000011@g.us"
	writeScopes(t, path, []scopeFileEntry{
		{Name: "whatsapp", Key: "wa-secret", JIDs: []string{yo}},
		{Name: "bk-bots-supervisor", Key: "bk-secret", JIDs: []string{bk}},
	})
	s := NewScopeStore(path, "global-secret")

	got, err := s.Resolve("global-secret")
	if err != nil || got.Name != "whatsapp" {
		t.Fatalf("GLOBAL_API_KEY must resolve to whatsapp: %+v %v", got, err)
	}
	if !got.Allows(yo) {
		t.Fatal("GLOBAL_API_KEY must allow YO (whatsapp scope)")
	}
	if got.Allows(bk) {
		t.Fatal("GLOBAL_API_KEY must not be a union of all scopes")
	}
	// A missing whatsapp scope still resolves, but allows nothing.
	writeScopes(t, path, []scopeFileEntry{
		{Name: "bk-bots-supervisor", Key: "bk-secret", JIDs: []string{bk}},
	})
	got, err = s.Resolve("global-secret")
	if err != nil || got.Name != "whatsapp" {
		t.Fatalf("GLOBAL_API_KEY with no whatsapp scope: %+v %v", got, err)
	}
	if got.Allows(yo) || got.Allows(bk) {
		t.Fatal("empty whatsapp scope must allow no chats")
	}
}

func TestReloadOnChange(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "scopes.json")
	yo := "558500000009-1500000000@g.us"
	bk := "120363000000000011@g.us"
	writeScopes(t, path, []scopeFileEntry{
		{Name: "whatsapp", Key: "wa-secret", JIDs: []string{yo}},
	})
	s := NewScopeStore(path, "global-secret")

	wa, err := s.Resolve("wa-secret")
	if err != nil || !wa.Allows(yo) || wa.Allows(bk) {
		t.Fatalf("before edit: %+v %v", wa, err)
	}

	// Ensure mtime actually moves even on coarse filesystems.
	time.Sleep(10 * time.Millisecond)
	writeScopes(t, path, []scopeFileEntry{
		{Name: "whatsapp", Key: "wa-secret", JIDs: []string{yo, bk}},
		{Name: "bk-bots-supervisor", Key: "bk-secret", JIDs: []string{bk}},
	})
	if err := os.Chtimes(path, time.Now(), time.Now()); err != nil {
		t.Fatal(err)
	}

	wa, err = s.Resolve("wa-secret")
	if err != nil || !wa.Allows(yo) || !wa.Allows(bk) {
		t.Fatalf("after adding BK to whatsapp: allows yo=%v bk=%v err=%v", wa != nil && wa.Allows(yo), wa != nil && wa.Allows(bk), err)
	}
	if _, err := s.Resolve("bk-secret"); err != nil {
		t.Fatalf("new supervisor key should resolve after reload: %v", err)
	}

	writeScopes(t, path, []scopeFileEntry{
		{Name: "whatsapp", Key: "wa-new", JIDs: []string{yo}},
	})
	if err := os.Chtimes(path, time.Now(), time.Now()); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Resolve("wa-secret"); !errors.Is(err, ErrUnknownKey) {
		t.Fatalf("old key must be rejected after reload: %v", err)
	}
	if _, err := s.Resolve("wa-new"); err != nil {
		t.Fatalf("rotated key must resolve: %v", err)
	}
}

func TestResolveNoAuthConfigured(t *testing.T) {
	s := NewScopeStore(filepath.Join(t.TempDir(), "missing.json"), "")
	if _, err := s.Resolve("anything"); !errors.Is(err, ErrNoAuth) {
		t.Fatalf("want ErrNoAuth, got %v", err)
	}
	if _, err := (*ScopeStore)(nil).Resolve("x"); !errors.Is(err, ErrNoAuth) {
		t.Fatalf("nil store: %v", err)
	}
}

func TestInvalidJSONKeepsLastSnapshot(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "scopes.json")
	writeScopes(t, path, []scopeFileEntry{
		{Name: "whatsapp", Key: "wa-secret", JIDs: []string{"558500000009-1500000000@g.us"}},
	})
	s := NewScopeStore(path, "")
	if _, err := s.Resolve("wa-secret"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, time.Now(), time.Now()); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Resolve("wa-secret"); err != nil {
		t.Fatalf("corrupt file must keep last good snapshot: %v", err)
	}
}
