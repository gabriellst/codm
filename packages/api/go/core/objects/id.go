package objects

import (
	"strings"

	"github.com/google/uuid"

	"template/core-go/errors"
)

// idNamespace is the UUIDv5 namespace for every canonical entity ingested
// from external systems. Locked byte-for-byte per spec §"Deterministic IDs".
// Mirrored on the TS side as the BK_DASH_NAMESPACE constant in
// packages/api/typescript/core/src/objects/Id.ts — any change here MUST be
// reflected there and vice versa, otherwise previously-ingested entities
// orphan across the polyglot boundary. Not exported — callers go through
// IDFromSeed.
var idNamespace = uuid.MustParse("f63cfbe6-7d8e-4d1d-9c5d-9d8a8b1b0c5e")

// ID is a value object wrapping a UUID. It supports:
// - Random generation: NewID()
// - Pre-set value: IDFromString(s), IDFromUUID(u)
// - Deterministic from seed parts: IDFromSeed(parts...) — UUIDv5 from input strings
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

// IDFromSeed creates a deterministic UUIDv5 from the provided parts, scoped
// to idNamespace. Parts are joined by `:` before hashing — same
// separator + namespace as the TS side (`Id.fromSeed(...)`), so identical
// inputs produce identical UUIDs across languages.
//
// Example: IDFromSeed("resource", "external-key") produces the same UUID on
// both TS + Go for identical inputs.
func IDFromSeed(parts ...string) (ID, error) {
	if len(parts) == 0 {
		return ID{}, errors.NewBaseError(errors.CodeInvalidID, "at least one part is required for IDFromSeed")
	}

	u := uuid.NewSHA1(idNamespace, []byte(strings.Join(parts, ":")))
	return ID{value: u}, nil
}


func (id ID) UUID() uuid.UUID { return id.value }


func (id ID) Value() string { return id.value.String() }

func (id ID) String() string       { return id.value.String() }

func (id ID) Equals(other ID) bool { return id.value == other.value }

func (id ID) IsZero() bool         { return id.value == uuid.Nil }

// Bytes returns the raw 16 bytes of the underlying UUID.

func (id ID) Bytes() [16]byte { return id.value }
