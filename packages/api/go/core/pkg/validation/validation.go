package validation

import (
	"template/core-go/errors"

	"github.com/go-playground/validator/v10"
)

var validate = validator.New(validator.WithRequiredStructEnabled())

// RegisterValidation registers a custom validation tag on the shared validator.
// Downstream modules call this at startup to add domain-specific rules.
func RegisterValidation(tag string, fn validator.Func) error {
	return validate.RegisterValidation(tag, fn)
}

type FieldError struct {
	Field   string `json:"field"`
	Tag     string `json:"tag"`
	Value   string `json:"value,omitempty"`
	Message string `json:"message"`
}

// Validate validates a struct using validator/v10 tags.
// Returns an *AppError with CodeValidationFailed if validation fails.
func Validate(s any) error {
	return ValidateWithCode(s, errors.CodeValidationFailed)
}

// ValidateWithCode validates a struct using validator/v10 tags.
// Returns an *AppError with the given error code if validation fails.
// Use this in value objects and entities to return domain-specific error codes.
func ValidateWithCode(s any, code errors.ErrorCode) error {
	err := validate.Struct(s)
	if err == nil {
		return nil
	}

	validationErrors, ok := err.(validator.ValidationErrors)
	if !ok {
		return errors.NewBaseError(code, err.Error())
	}

	fields := make([]FieldError, 0, len(validationErrors))
	for _, e := range validationErrors {
		fields = append(fields, FieldError{
			Field:   e.Field(),
			Tag:     e.Tag(),
			Value:   e.Param(),
			Message: e.Error(),
		})
	}

	return &errors.AppError{
		Code:    code,
		Message: "validation failed",
		Details: fields,
	}
}
