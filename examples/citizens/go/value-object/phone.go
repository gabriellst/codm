// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/shared/objects/phone.go
// Harvested verbatim for the value-object skill exemplar set — do not edit; re-harvest instead.
package objects

import (
	"fmt"
	"regexp"
	"strings"

	"monorepo/api/internal/shared/errors"
	"monorepo/api/pkg/validation"
)

var phoneDigitsRegex = regexp.MustCompile(`\D`)

type Phone struct {
	countryCode string `validate:"required"`
	areaCode    string `validate:"required"`
	number      string `validate:"required"`
}

type NewPhoneParams struct {
	CountryCode string
	AreaCode    string
	Number      string
}


func NewPhone(data NewPhoneParams) (Phone, error) {
	p := Phone{
		countryCode: strings.TrimLeft(data.CountryCode, "+"),
		areaCode:    data.AreaCode,
		number:      data.Number,
	}

	if err := validation.ValidateWithCode(&p, errors.CodeInvalidPhone); err != nil {
		return Phone{}, err
	}

	return p, nil
}

// ParsePhone parses a raw phone string like "+5511999999999" into parts.

func ParsePhone(raw string) (Phone, error) {
	digits := phoneDigitsRegex.ReplaceAllString(raw, "")
	if len(digits) < 10 || len(digits) > 15 {
		return Phone{}, errors.NewBaseError(errors.CodeInvalidPhone, "invalid phone: "+raw)
	}

	// Assume Brazilian format if starts with 55 and has 12-13 digits
	if strings.HasPrefix(digits, "55") && len(digits) >= 12 {
		return Phone{
			countryCode: digits[:2],
			areaCode:    digits[2:4],
			number:      digits[4:],
		}, nil
	}

	// Generic: first 1-3 digits as country code, next 2 as area code, rest as number
	if len(digits) >= 10 {
		ccLen := len(digits) - 10
		if ccLen < 1 {
			ccLen = 1
		}
		if ccLen > 3 {
			ccLen = 3
		}
		return Phone{
			countryCode: digits[:ccLen],
			areaCode:    digits[ccLen : ccLen+2],
			number:      digits[ccLen+2:],
		}, nil
	}

	return Phone{}, errors.NewBaseError(errors.CodeInvalidPhone, "invalid phone: "+raw)
}


func (p Phone) CountryCode() string { return p.countryCode }

func (p Phone) AreaCode() string    { return p.areaCode }

func (p Phone) Number() string      { return p.number }


func (p Phone) Value() string { return p.E164() }

func (p Phone) String() string { return p.Format() }


func (p Phone) Format() string {
	return fmt.Sprintf("+%s (%s) %s", p.countryCode, p.areaCode, p.number)
}


func (p Phone) E164() string {
	return fmt.Sprintf("+%s%s%s", p.countryCode, p.areaCode, p.number)
}


func (p Phone) IsZero() bool {
	return p.countryCode == "" && p.areaCode == "" && p.number == ""
}


func (p Phone) Equals(other Phone) bool {
	return p.countryCode == other.countryCode && p.areaCode == other.areaCode && p.number == other.number
}
