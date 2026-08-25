package whatsapp

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestResolveMediaBytesReadsFromMediaPathInsideStore(t *testing.T) {
	store := &MediaStore{dir: t.TempDir()}
	path := filepath.Join(store.dir, "abc123.png")
	want := []byte("staged artifact bytes")
	if err := os.WriteFile(path, want, 0o644); err != nil {
		t.Fatalf("seed file: %v", err)
	}

	c := &WhatsmeowChannel{mediaStore: store}

	got, err := c.resolveMediaBytes(context.Background(), "", path)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if string(got) != string(want) {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestResolveMediaBytesRejectsMediaPathOutsideStore(t *testing.T) {
	store := &MediaStore{dir: t.TempDir()}
	outsideDir := t.TempDir()
	outside := filepath.Join(outsideDir, "secret.txt")
	if err := os.WriteFile(outside, []byte("nope"), 0o644); err != nil {
		t.Fatalf("seed file: %v", err)
	}

	c := &WhatsmeowChannel{mediaStore: store}

	_, err := c.resolveMediaBytes(context.Background(), "", outside)
	if !errors.Is(err, ErrMediaPathNotAllowed) {
		t.Fatalf("expected ErrMediaPathNotAllowed, got %v", err)
	}
}

func TestResolveMediaBytesRejectsMediaPathWithoutMediaStore(t *testing.T) {
	c := &WhatsmeowChannel{} // mediaStore is nil — channel never wired to inbound media.

	_, err := c.resolveMediaBytes(context.Background(), "", "/whatever/path.png")
	if !errors.Is(err, ErrMediaPathNotAllowed) {
		t.Fatalf("expected ErrMediaPathNotAllowed, got %v", err)
	}
}
