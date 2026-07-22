package objects

import (
	"strings"

	"template/api-go/internal/shared/errors"
	"template/api-go/pkg/validation"
)

type PersonName struct {
	value string
}

type NewPersonNameParams struct {
	FirstName string `validate:"required"`
	LastName  string `validate:"required"`
}


func NewPersonName(data NewPersonNameParams) (PersonName, error) {
	trimmed := NewPersonNameParams{
		FirstName: strings.TrimSpace(data.FirstName),
		LastName:  strings.TrimSpace(data.LastName),
	}
	if err := validation.ValidateWithCode(trimmed, errors.CodeInvalidName); err != nil {
		return PersonName{}, err
	}

	fullName := trimmed.FirstName + " " + trimmed.LastName
	return PersonName{value: fullName}, nil
}


func (n PersonName) Value() string                    { return n.value }

func (n PersonName) String() string                   { return n.value }

func (n PersonName) Equals(other PersonName) bool     { return n.value == other.value }

func (n PersonName) IsZero() bool                     { return n.value == "" }


func (n PersonName) FirstName() string {
	parts := strings.Fields(n.value)
	if len(parts) > 0 {
		return parts[0]
	}
	return ""
}


func (n PersonName) LastName() string {
	parts := strings.Fields(n.value)
	if len(parts) > 1 {
		return parts[len(parts)-1]
	}
	return ""
}
