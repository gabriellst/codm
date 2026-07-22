package openapi

// registerErrors inserts a single `ErrorResponse` component mirroring
// shared/errors.AppError. Every controller's failure responses `$ref` this.
func registerErrors(spec *Spec) {
	spec.putSchema("ErrorResponse", map[string]any{
		"type": "object",
		"required": []string{"code", "message"},
		"properties": map[string]any{
			"code":    map[string]any{"type": "string"},
			"message": map[string]any{"type": "string"},
			"details": map[string]any{"x-tpl-unknown": true},
		},
	})
}
