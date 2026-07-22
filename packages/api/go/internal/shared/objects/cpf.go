package objects

import (
	"regexp"
	"strconv"

	"template/api-go/internal/shared/errors"
)

var cpfCleanRegex = regexp.MustCompile(`\D`)

type CPF struct {
	value string // clean 11 digits
}

func NewCPF(raw string) (CPF, error) {
	clean := cpfCleanRegex.ReplaceAllString(raw, "")
	if !IsValidCPF(clean) {
		return CPF{}, errors.NewBaseError(errors.CodeInvalidCPF, "invalid CPF: "+raw)
	}
	return CPF{value: clean}, nil
}

func IsValidCPF(cpf string) bool {
	clean := cpfCleanRegex.ReplaceAllString(cpf, "")
	if len(clean) != 11 {
		return false
	}

	// Check for all same digits
	allSame := true
	for i := 1; i < 11; i++ {
		if clean[i] != clean[0] {
			allSame = false
			break
		}
	}
	if allSame {
		return false
	}

	// First check digit
	sum := 0
	for i := 0; i < 9; i++ {
		d, _ := strconv.Atoi(string(clean[i]))
		sum += d * (10 - i)
	}
	remainder := (sum * 10) % 11
	if remainder == 10 {
		remainder = 0
	}
	d9, _ := strconv.Atoi(string(clean[9]))
	if remainder != d9 {
		return false
	}

	// Second check digit
	sum = 0
	for i := 0; i < 10; i++ {
		d, _ := strconv.Atoi(string(clean[i]))
		sum += d * (11 - i)
	}
	remainder = (sum * 10) % 11
	if remainder == 10 {
		remainder = 0
	}
	d10, _ := strconv.Atoi(string(clean[10]))
	return remainder == d10
}

func (e CPF) Value() string       { return e.value }
func (e CPF) String() string      { return e.value }
func (c CPF) Equals(other CPF) bool { return c.value == other.value }
func (c CPF) IsZero() bool { return c.value == "" }

