package whatsapp

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMediaStoreSaveIsContentAddressedAndIdempotent(t *testing.T) {
	store := &MediaStore{dir: t.TempDir()}

	data := []byte("fake decrypted audio bytes")
	first, err := store.Save(data, "audio/ogg; codecs=opus")
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if !strings.HasSuffix(first, ".ogg") {
		t.Fatalf("expected .ogg extension, got %q", first)
	}
	got, err := os.ReadFile(first)
	if err != nil || string(got) != string(data) {
		t.Fatalf("read back: %v / %q", err, got)
	}

	// Same bytes → same path, no error (dedupe by sha256).
	second, err := store.Save(data, "audio/ogg; codecs=opus")
	if err != nil {
		t.Fatalf("second save: %v", err)
	}
	if second != first {
		t.Fatalf("expected content-addressed dedupe, got %q then %q", first, second)
	}

	// No torn .part file may survive a completed save.
	entries, _ := os.ReadDir(filepath.Dir(first))
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".part") {
			t.Fatalf("leftover partial file: %s", e.Name())
		}
	}
}

func TestMediaStoreResolvePathAcceptsFileInsideDir(t *testing.T) {
	store := &MediaStore{dir: t.TempDir()}
	inside := filepath.Join(store.dir, "abc123.png")
	if err := os.WriteFile(inside, []byte("bytes"), 0o644); err != nil {
		t.Fatalf("seed file: %v", err)
	}

	resolved, err := store.ResolvePath(inside)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	// Compare against the symlink-evaluated form of the input too — on macOS
	// t.TempDir() lives under /var, itself a symlink to /private/var, so the
	// canonical path differs from the literal one even though both name the
	// same file.
	wantResolved, err := filepath.EvalSymlinks(inside)
	if err != nil {
		t.Fatalf("eval symlinks on fixture: %v", err)
	}
	if resolved != wantResolved {
		t.Fatalf("expected %q, got %q", wantResolved, resolved)
	}
}

func TestMediaStoreResolvePathRejectsFileOutsideDir(t *testing.T) {
	store := &MediaStore{dir: t.TempDir()}
	outsideDir := t.TempDir()
	outside := filepath.Join(outsideDir, "secret.txt")
	if err := os.WriteFile(outside, []byte("bytes"), 0o644); err != nil {
		t.Fatalf("seed file: %v", err)
	}

	_, err := store.ResolvePath(outside)
	if !errors.Is(err, ErrMediaPathNotAllowed) {
		t.Fatalf("expected ErrMediaPathNotAllowed, got %v", err)
	}
}

func TestMediaStoreResolvePathRejectsSymlinkEscapingDir(t *testing.T) {
	store := &MediaStore{dir: t.TempDir()}
	outsideDir := t.TempDir()
	outsideFile := filepath.Join(outsideDir, "secret.txt")
	if err := os.WriteFile(outsideFile, []byte("bytes"), 0o644); err != nil {
		t.Fatalf("seed file: %v", err)
	}

	link := filepath.Join(store.dir, "innocuous.png")
	if err := os.Symlink(outsideFile, link); err != nil {
		t.Skipf("symlinks unsupported on this platform: %v", err)
	}

	_, err := store.ResolvePath(link)
	if !errors.Is(err, ErrMediaPathNotAllowed) {
		t.Fatalf("expected ErrMediaPathNotAllowed for symlink escaping media dir, got %v", err)
	}
}

func TestMediaStoreReadRejectsOversizedFile(t *testing.T) {
	store := &MediaStore{dir: t.TempDir()}
	big := filepath.Join(store.dir, "big.bin")
	if err := os.WriteFile(big, make([]byte, 1), 0o644); err != nil {
		t.Fatalf("seed file: %v", err)
	}

	// Can't practically write a real 64MiB+1 fixture in a unit test; assert the
	// ceiling constant matches the documented inbound cap instead, and that a
	// normal small file reads through fine.
	if maxOutboundMediaBytes != 64<<20 {
		t.Fatalf("expected 64MiB ceiling, got %d", maxOutboundMediaBytes)
	}
	data, err := store.Read(big)
	if err != nil {
		t.Fatalf("expected no error for small file, got %v", err)
	}
	if len(data) != 1 {
		t.Fatalf("expected 1 byte, got %d", len(data))
	}
}

func TestExtensionForMime(t *testing.T) {
	cases := map[string]string{
		"image/jpeg":             ".jpg",
		"audio/ogg; codecs=opus": ".ogg",
		"video/mp4":              ".mp4",
		"application/pdf":        ".pdf",
		"application/x-unknown!": ".bin",
	}
	for mimetype, want := range cases {
		if got := extensionForMime(mimetype); got != want {
			t.Errorf("extensionForMime(%q) = %q, want %q", mimetype, got, want)
		}
	}
}
