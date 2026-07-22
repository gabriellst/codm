package objects

import (
	"fmt"

	"template/api-go/internal/shared/enums"
	"template/api-go/internal/shared/errors"
	"template/api-go/pkg/validation"
)

type Address struct {
	street       string        `validate:"required"`
	number       string        `validate:"required"`
	complement   string
	neighborhood string        `validate:"required"`
	city         string        `validate:"required"`
	state        string        `validate:"required,len=2"` // 2 chars: "SP", "RJ"
	zipCode      string        // 8 digits
	country      enums.Country `validate:"omitempty,oneof=BR US"`
}

type NewAddressParams struct {
	Street       string
	Number       string
	Complement   string
	Neighborhood string
	City         string
	State        string
	ZipCode      string
	Country      enums.Country
}


func NewAddress(data NewAddressParams) (Address, error) {
	a := Address{
		street:       data.Street,
		number:       data.Number,
		complement:   data.Complement,
		neighborhood: data.Neighborhood,
		city:         data.City,
		state:        data.State,
		zipCode:      data.ZipCode,
		country:      data.Country,
	}

	if err := validation.ValidateWithCode(&a, errors.CodeInvalidAddress); err != nil {
		return Address{}, err
	}

	return a, nil
}


func (a Address) Street() string        { return a.street }

func (a Address) Number() string        { return a.number }

func (a Address) Complement() string    { return a.complement }

func (a Address) Neighborhood() string  { return a.neighborhood }

func (a Address) City() string          { return a.city }

func (a Address) State() string         { return a.state }

func (a Address) ZipCode() string       { return a.zipCode }

func (a Address) Country() enums.Country { return a.country }


func (a Address) String() string {
	return fmt.Sprintf("%s, %s, %s/%s", a.street, a.number, a.city, a.state)
}


func (a Address) IsZero() bool {
	return a.street == "" && a.city == ""
}


func (a Address) Equals(other Address) bool {
	return a.street == other.street &&
		a.number == other.number &&
		a.city == other.city &&
		a.state == other.state &&
		a.zipCode == other.zipCode
}
