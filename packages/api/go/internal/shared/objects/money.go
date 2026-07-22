package objects

import (
	"fmt"

	"template/api-go/internal/shared/enums"
	"template/api-go/internal/shared/errors"
	"template/api-go/pkg/validation"
)

// Money represents a monetary value in cents with a currency.
type Money struct {
	amount   int64
	currency enums.Currency `validate:"required,oneof=BRL USD EUR"`
}

type NewMoneyParams struct {
	Amount   int64
	Currency enums.Currency
}


func NewMoney(data NewMoneyParams) (Money, error) {
	m := Money{amount: data.Amount, currency: data.Currency}

	if err := validation.ValidateWithCode(&m, errors.CodeInvalidMoney); err != nil {
		return Money{}, err
	}

	return m, nil
}


func (m Money) Amount() int64          { return m.amount }

func (m Money) Currency() enums.Currency { return m.currency }

func (m Money) Value() string          { return m.String() }


func (m Money) Add(other Money) (Money, error) {
	if m.currency != other.currency {
		return Money{}, errors.NewBaseError(errors.CodeInvalidMoney,
			fmt.Sprintf("cannot add %s to %s", other.currency, m.currency))
	}
	return Money{amount: m.amount + other.amount, currency: m.currency}, nil
}


func (m Money) Subtract(other Money) (Money, error) {
	if m.currency != other.currency {
		return Money{}, errors.NewBaseError(errors.CodeInvalidMoney,
			fmt.Sprintf("cannot subtract %s from %s", other.currency, m.currency))
	}
	return Money{amount: m.amount - other.amount, currency: m.currency}, nil
}


func (m Money) Equals(other Money) bool {
	return m.amount == other.amount && m.currency == other.currency
}


func (m Money) IsZero() bool    { return m.amount == 0 }

func (m Money) IsPositive() bool { return m.amount > 0 }

func (m Money) IsNegative() bool { return m.amount < 0 }


func (m Money) String() string {
	return fmt.Sprintf("%d %s", m.amount, m.currency)
}
