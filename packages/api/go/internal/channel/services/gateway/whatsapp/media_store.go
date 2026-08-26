package whatsapp

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"mime"
	"os"
	"path/filepath"
	"strings"

	"template/core-go/db/sqlite"
)

// ErrMediaPathNotAllowed is returned when a caller-supplied mediaPath (for an
// outbound send) resolves outside the media store's own directory — including
// via a symlink. The gateway only ever reads back files it wrote itself
// (inbound downloads, or files staged there by the TS daemon for outbound
// delivery); an arbitrary filesystem path is refused.
var ErrMediaPathNotAllowed = errors.New("media path not allowed")

// maxOutboundMediaBytes caps what a local mediaPath send is willing to read —
// mirrors maxInboundMediaBytes (whatsmeow_channel.go), WhatsApp's own ceiling.
const maxOutboundMediaBytes = 64 << 20

// MediaStore persists downloaded (already decrypted) inbound media as
// content-addressed files under <dataDir>/media — sibling of the SQLite file,
// so the TS daemon and the agent CLI on the same host read the path directly.
// Content addressing (sha256 of the bytes) makes re-delivered and forwarded
// media dedupe for free; files are written atomically (.part → rename) so a
// crashed write never leaves a torn file behind a stable name.
type MediaStore struct {
	dir string
}

// NewMediaStore anchors the media dir next to the SQLite store file — the
// SqliteStore is the single owner of the filesystem layout (see WhatsmeowStore).
func NewMediaStore(store *sqlite.SqliteStore) (*MediaStore, error) {
	dir := filepath.Join(filepath.Dir(store.Path()), "media")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("media store: mkdir %q: %w", dir, err)
	}
	return &MediaStore{dir: dir}, nil
}

// Dir is the absolute media directory.
func (s *MediaStore) Dir() string { return s.dir }

// Save writes data under its sha256 name and returns the absolute path.
// An already-present file is reused without rewriting.
func (s *MediaStore) Save(data []byte, mimetype string) (string, error) {
	sum := sha256.Sum256(data)
	path := filepath.Join(s.dir, hex.EncodeToString(sum[:])+extensionForMime(mimetype))
	if _, err := os.Stat(path); err == nil {
		return path, nil
	}
	tmp := path + ".part"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return "", fmt.Errorf("media store: write %q: %w", tmp, err)
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return "", fmt.Errorf("media store: rename %q: %w", path, err)
	}
	return path, nil
}

// ResolvePath canonicalizes path (absolute + symlinks resolved) and verifies
// it falls under the store's own directory. Returns the canonical absolute
// path, or ErrMediaPathNotAllowed if it resolves outside.
func (s *MediaStore) ResolvePath(path string) (string, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrMediaPathNotAllowed, err)
	}
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrMediaPathNotAllowed, err)
	}
	dir, err := filepath.EvalSymlinks(s.dir)
	if err != nil {
		return "", fmt.Errorf("media store dir: %w", err)
	}
	rel, err := filepath.Rel(dir, resolved)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", ErrMediaPathNotAllowed
	}
	return resolved, nil
}

// Read reads the file at path after verifying (via ResolvePath) it lives
// under the store's own directory, capped at maxOutboundMediaBytes.
func (s *MediaStore) Read(path string) ([]byte, error) {
	resolved, err := s.ResolvePath(path)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return nil, fmt.Errorf("media path stat: %w", err)
	}
	if info.Size() > maxOutboundMediaBytes {
		return nil, fmt.Errorf("media file too large: %d bytes", info.Size())
	}
	return os.ReadFile(resolved)
}

// preferredExtensions pins the common WhatsApp mimetypes to conventional
// extensions — mime.ExtensionsByType is platform-dependent and can pick
// oddballs like ".jpe".
var preferredExtensions = map[string]string{
	"image/jpeg":      ".jpg",
	"image/png":       ".png",
	"image/webp":      ".webp",
	"image/gif":       ".gif",
	"audio/ogg":       ".ogg",
	"audio/mpeg":      ".mp3",
	"audio/mp4":       ".m4a",
	"audio/aac":       ".aac",
	"audio/amr":       ".amr",
	"audio/wav":       ".wav",
	"video/mp4":       ".mp4",
	"video/3gpp":      ".3gp",
	"video/quicktime": ".mov",
	"application/pdf": ".pdf",
}

// extensionForMime resolves a file extension for a (possibly parameterised)
// mimetype like "audio/ogg; codecs=opus". Falls back to ".bin".
func extensionForMime(mimetype string) string {
	base := mimetype
	if parsed, _, err := mime.ParseMediaType(mimetype); err == nil {
		base = parsed
	}
	base = strings.ToLower(strings.TrimSpace(base))
	if ext, ok := preferredExtensions[base]; ok {
		return ext
	}
	if exts, err := mime.ExtensionsByType(base); err == nil && len(exts) > 0 {
		return exts[0]
	}
	return ".bin"
}
