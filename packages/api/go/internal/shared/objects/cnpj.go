package objects

import (
	"regexp"
	"strconv"

	"template/api-go/internal/shared/errors"
)

var cnpjCleanRegex = regexp.MustCompile(`\D`)

type CNPJ struct {
	value string // clean 14 digits
}

func NewCNPJ(raw string) (CNPJ, error) {
	clean := cnpjCleanRegex.ReplaceAllString(raw, "")
	if !IsValidCNPJ(clean) {
		return CNPJ{}, errors.NewBaseError(errors.CodeInvalidCNPJ, "invalid CNPJ: "+raw)
	}
	return CNPJ{value: clean}, nil
}

func IsValidCNPJ(cnpj string) bool {
	clean := cnpjCleanRegex.ReplaceAllString(cnpj, "")
	if len(clean) != 14 {
		return false
	}

	allSame := true
	for i := 1; i < 14; i++ {
		if clean[i] != clean[0] {
			allSame = false
			break
		}
	}
	if allSame {
		return false
	}

	weights1 := []int{5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2}
	sum := 0
	for i := 0; i < 12; i++ {
		d, _ := strconv.Atoi(string(clean[i]))
		sum += d * weights1[i]
	}
	remainder := sum % 11
	check1 := 0
	if remainder >= 2 {
		check1 = 11 - remainder
	}
	d12, _ := strconv.Atoi(string(clean[12]))
	if check1 != d12 {
		return false
	}

	weights2 := []int{6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2}
	sum = 0
	for i := 0; i < 13; i++ {
		d, _ := strconv.Atoi(string(clean[i]))
		sum += d * weights2[i]
	}
	remainder = sum % 11
	check2 := 0
	if remainder >= 2 {
		check2 = 11 - remainder
	}
	d13, _ := strconv.Atoi(string(clean[13]))
	return check2 == d13
}

func (e CNPJ) Value() string       { return e.value }
func (e CNPJ) String() string      { return e.value }
func (c CNPJ) Equals(other CNPJ) bool { return c.value == other.value }
func (c CNPJ) IsZero() bool { return c.value == "" }

