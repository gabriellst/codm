// Package openapi is the Go OpenAPI emitter for the gateway backend.
//
// It reads Go source (controllers, events, enums, @union/@variant annotations)
// and produces an openapi.json file that drives SDK generation via Kubb.
//
// Design: .specs/2026-04-15-sdk-spec-first-design.md §5.
package openapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

// Generate walks the channel module rooted at `root` and writes an OpenAPI 3.1
// spec to `outPath`. Both paths may be relative to cwd.
func Generate(root, outPath string) error {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return fmt.Errorf("resolve root: %w", err)
	}

	spec := newSpec()

	w, err := newWalker(absRoot)
	if err != nil {
		return fmt.Errorf("walker: %w", err)
	}

	// Enums (typed string-const blocks) across internal/.
	if err := registerEnums(spec, w); err != nil {
		return fmt.Errorf("enums: %w", err)
	}

	// Union annotations across internal/.
	unions, err := collectUnions(w)
	if err != nil {
		return fmt.Errorf("unions: %w", err)
	}

	// Error response component (from shared/errors).
	registerErrors(spec)

	// Event wrapper + ServerEvent oneOf + ServerEventName.
	if err := registerEvents(spec, w, unions); err != nil {
		return fmt.Errorf("events: %w", err)
	}

	// Controllers → operations + request/response components.
	if err := registerControllers(spec, w, unions); err != nil {
		return fmt.Errorf("controllers: %w", err)
	}

	if err := validateSpec(spec); err != nil {
		return fmt.Errorf("validate: %w", err)
	}

	// Ensure output directory exists.
	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
		return err
	}

	body, err := marshalStable(spec)
	if err != nil {
		return err
	}
	return os.WriteFile(outPath, body, 0o644)
}

// marshalStable produces deterministic, indented JSON. Keys inside maps
// are sorted; slices preserve insertion order.
func marshalStable(spec *Spec) ([]byte, error) {
	// encoding/json on maps writes keys in sorted order already.
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	if err := enc.Encode(spec); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// Spec is the minimal OpenAPI 3.1 document shape we emit.
// Schemas are modeled as `Schema` (map-like with ordering) but for simplicity
// we use raw maps keyed by strings since the emitter is append-only and we
// don't rely on key ordering for correctness — `encoding/json` sorts maps.
type Spec struct {
	OpenAPI    string           `json:"openapi"`
	Info       map[string]any   `json:"info"`
	Paths      map[string]any   `json:"paths"`
	Components map[string]any   `json:"components"`
	Tags       []map[string]any `json:"tags,omitempty"`
}

func newSpec() *Spec {
	return &Spec{
		// OpenAPI 3.0.3, not 3.1: the codm SDK pipeline (packages/client
		// lib/preprocess.ts, COMPLIANCE.md R-01/R-05) validates a 3.0-flavored
		// spec — version must start with "3.0" and nullability must use the
		// `nullable: true` keyword, never 3.1 `type: "null"` forms (see makeNullable).
		OpenAPI: "3.0.3",
		Info: map[string]any{
			"title":       "Gateway API",
			"description": "Gateway service API — emitted by api-go/pkg/openapi",
			"version":     "1.0.0",
		},
		Paths: map[string]any{},
		Components: map[string]any{
			"schemas": map[string]any{},
		},
	}
}

func (s *Spec) schemas() map[string]any {
	return s.Components["schemas"].(map[string]any)
}

// putSchema registers a component schema, skipping if already present.
// Returns true if inserted.
func (s *Spec) putSchema(name string, schema map[string]any) bool {
	m := s.schemas()
	if _, ok := m[name]; ok {
		return false
	}
	m[name] = schema
	return true
}

// ref returns a `$ref` pointer to a component.
func ref(name string) map[string]any {
	return map[string]any{"$ref": "#/components/schemas/" + name}
}

// validateSpec enforces invariants mirrored from the TS emitter:
//  1. No inline enums outside components.schemas (every `enum` array must be on a
//     named component; other locations must use `$ref`).
//  2. Every `discriminator.mapping` value resolves to an existing component.
func validateSpec(s *Spec) error {
	// Walk every schema-like node; collect violations.
	var violations []string
	var walk func(path string, v any, atComponent bool)
	walk = func(path string, v any, atComponent bool) {
		switch node := v.(type) {
		case map[string]any:
			// If this node has an `enum` field and we are not at the root of a named component, flag it.
			if _, hasEnum := node["enum"]; hasEnum && !atComponent {
				violations = append(violations, fmt.Sprintf("inline enum at %s — must be a named $ref component", path))
			}
			// Discriminator mapping validation.
			if d, ok := node["discriminator"].(map[string]any); ok {
				if mapping, ok := d["mapping"].(map[string]any); ok {
					for k, v := range mapping {
						s2, _ := v.(string)
						name := trimPrefix(s2, "#/components/schemas/")
						if _, exists := s.schemas()[name]; !exists {
							violations = append(violations, fmt.Sprintf("discriminator mapping %s -> %s: component %q not registered", path, k, name))
						}
					}
				}
			}
			// Recurse.
			keys := make([]string, 0, len(node))
			for k := range node {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for _, k := range keys {
				walk(path+"."+k, node[k], false)
			}
		case []any:
			for i, item := range node {
				walk(fmt.Sprintf("%s[%d]", path, i), item, false)
			}
		}
	}
	// Walk schemas with the component-root flag set on direct children.
	for name, schema := range s.schemas() {
		walk("components.schemas."+name, schema, true)
	}
	// Walk paths too.
	walk("paths", s.Paths, false)

	if len(violations) > 0 {
		out := "\n"
		for _, v := range violations {
			out += "  - " + v + "\n"
		}
		return fmt.Errorf("spec validation failed:%s", out)
	}
	return nil
}

func trimPrefix(s, prefix string) string {
	if len(s) >= len(prefix) && s[:len(prefix)] == prefix {
		return s[len(prefix):]
	}
	return s
}
