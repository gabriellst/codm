package objects

import (
	"net/mail"
	"strings"

	"template/api-go/internal/shared/errors"
)

type Email struct {
	value string
}

func NewEmail(raw string) (Email, error) {
	normalized := strings.TrimSpace(strings.ToLower(raw))
	if _, err := mail.ParseAddress(normalized); err != nil {
		return Email{}, errors.NewBaseError(errors.CodeInvalidEmail, "invalid email: "+raw)
	}
	return Email{value: normalized}, nil
}

func (e Email) Value() string       { return e.value }
func (e Email) String() string      { return e.value }
func (e Email) Equals(other Email) bool { return e.value == other.value }
func (e Email) IsZero() bool { return e.value == "" }

