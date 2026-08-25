package types

import "context"

// Handler represents a use case handler with typed input/output.
// Each use case defines its own Input/Output structs with validate tags
// and a concrete handler struct that implements this interface.
type Handler[I any, O any] interface {
	Name() string
	Execute(ctx context.Context, input I) (O, error)
}
