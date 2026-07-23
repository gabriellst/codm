package objects

import (
	"github.com/google/uuid"

	"template/api-go/internal/shared/errors"
)

// ID is a value object wrapping a UUID. It supports:
// - Random generation: NewID()
// - Pre-set value: IDFromString(s), IDFromUUID(u)
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

func (id ID) UUID() uuid.UUID { return id.value }

func (id ID) Value() string { return id.value.String() }

func (id ID) String() string { return id.value.String() }

func (id ID) Equals(other ID) bool { return id.value == other.value }

func (id ID) IsZero() bool { return id.value == uuid.Nil }

// Bytes returns the raw 16 bytes of the underlying UUID.

func (id ID) Bytes() [16]byte { return id.value }
