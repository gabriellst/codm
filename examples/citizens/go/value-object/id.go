// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/shared/objects/id.go
// Harvested verbatim for the value-object skill exemplar set — do not edit; re-harvest instead.
package objects

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"monorepo/api/internal/shared/errors"
)

// ID is a value object wrapping a UUID. It supports:
// - Random generation: NewID()
// - Pre-set value: IDFromString(s), IDFromUUID(u)
// - Hashed from values: HashedID(values...) — deterministic UUID from input strings
type ID struct {
	value uuid.UUID
}

// NewID generates a new random UUID.

func NewID() ID {
	return ID{value: uuid.New()}
}

// IDFromUUID wraps an existing uuid.UUID.

func IDFromUUID(u uuid.UUID) ID {
	return ID{value: u}
}

// IDFromString parses a string into an ID.

func IDFromString(s string) (ID, error) {
	u, err := uuid.Parse(s)
	if err != nil {
		return ID{}, errors.NewBaseError(errors.CodeInvalidID, "invalid ID format: "+s)
	}
	return ID{value: u}, nil
}

// HashedID creates a deterministic UUID by hashing the provided values.
// Useful for creating idempotent IDs from business keys.

func HashedID(values ...string) (ID, error) {
	if len(values) == 0 {
		return ID{}, errors.NewBaseError(errors.CodeInvalidID, "at least one value is required for hashed ID")
	}

	combined := strings.Join(values, "-")
	hash := sha256.Sum256([]byte(combined))
	hex := hex.EncodeToString(hash[:16])

	// Format as UUID: 8-4-4-4-12
	uuidStr := fmt.Sprintf("%s-%s-%s-%s-%s", hex[0:8], hex[8:12], hex[12:16], hex[16:20], hex[20:32])
	u, err := uuid.Parse(uuidStr)
	if err != nil {
		return ID{}, errors.NewBaseError(errors.CodeInvalidID, "failed to generate hashed ID")
	}

	return ID{value: u}, nil
}


func (id ID) UUID() uuid.UUID { return id.value }


func (id ID) Value() string { return id.value.String() }

func (id ID) String() string       { return id.value.String() }

func (id ID) Equals(other ID) bool { return id.value == other.value }

func (id ID) IsZero() bool         { return id.value == uuid.Nil }

// Bytes returns the raw 16 bytes of the underlying UUID.

func (id ID) Bytes() [16]byte { return id.value }
