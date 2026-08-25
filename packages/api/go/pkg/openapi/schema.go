package openapi

import (
	"fmt"
	"go/types"
	"reflect"
	"strings"
)

// schemaCtx captures state needed for recursive schema emission.
type schemaCtx struct {
	spec   *Spec
	w      *walker
	unions map[string][]UnionAnnotation // key: named.Obj().Name() — ALL stamped slots, declaration order
}

// ensureComponent emits a named schema for the given named struct (or enum)
// once, and returns a $ref to it. Primitive wrappers (e.g. uuid.UUID, time.Time)
// are inlined instead of being promoted.
func (c *schemaCtx) ensureComponent(named *types.Named) map[string]any {
	name := named.Obj().Name()

	// Avoid re-registering.
	if _, ok := c.spec.schemas()[name]; ok {
		return ref(name)
	}

	// Insert a placeholder to break recursion.
	c.spec.schemas()[name] = map[string]any{}

	// Struct → object. Enum handled separately via registerEnums.
	underlying := named.Underlying()
	switch u := underlying.(type) {
	case *types.Struct:
		schema := c.structSchema(named, u)
		c.spec.schemas()[name] = schema
	case *types.Basic:
		// If it's a typed string that wasn't caught as an enum (no constants),
		// emit as plain string.
		schema := c.basicSchema(u)
		c.spec.schemas()[name] = schema
	default:
		c.spec.schemas()[name] = c.typeSchema(named.Underlying())
	}

	return ref(name)
}

// structSchema emits a struct as an object schema, applying @union handling when present.
func (c *schemaCtx) structSchema(named *types.Named, st *types.Struct) map[string]any {
	structName := named.Obj().Name()

	// If this struct has @union annotations, emit a oneOf + discriminator instead.
	// The slot with the most variants drives the top-level oneOf; every OTHER
	// stamped slot is materialized inside each variant (narrowed by the pinned
	// discriminator values) — see unionSchema/secondarySlotSchema.
	if slots := c.unions[structName]; len(slots) > 0 {
		primary := &slots[0]
		for i := range slots {
			if len(slots[i].Variants) > len(primary.Variants) {
				primary = &slots[i]
			}
		}
		return c.unionSchema(structName, st, primary, slots)
	}

	props := map[string]any{}
	required := []string{}

	for i := 0; i < st.NumFields(); i++ {
		f := st.Field(i)
		if !f.Exported() {
			continue
		}
		tag := reflect.StructTag(st.Tag(i))
		jsonTag := tag.Get("json")
		// Respect swaggerignore (consistent with existing codebase).
		if tag.Get("swaggerignore") == "true" {
			continue
		}
		name, omitempty := parseJSONTag(jsonTag, f.Name())
		if name == "-" {
			continue
		}

		fieldSchema := c.typeSchema(f.Type())

		// description from `example:"..."` tag → keep `example` as OpenAPI example.
		if ex := tag.Get("example"); ex != "" {
			fieldSchema["example"] = ex
		}
		if fmtTag := tag.Get("format"); fmtTag != "" {
			fieldSchema["format"] = fmtTag
		}

		props[name] = fieldSchema

		// "required" is derived from validator tags (validate:"required...") and/or the
		// absence of omitempty on the json tag for primitive-typed fields.
		validate := tag.Get("validate")
		isRequired := hasRequiredValidateTag(validate) || (!omitempty && validate == "")
		if isRequired {
			required = append(required, name)
		}
	}

	schema := map[string]any{
		"type":       "object",
		"properties": props,
	}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}

// unionSchema emits the oneOf + discriminator + mapping form.
// Per design §3.5: single-property discriminator uses `discriminator`; multi-property
// falls back to `oneOf` with `const` on each discriminator field (no `discriminator` block).
// `slots` carries EVERY @union annotation stamped on the struct: `u` (the primary,
// most variants) drives the top-level oneOf, and each remaining slot materializes
// inside every variant via secondarySlotSchema — no stamped slot is ever dropped.
func (c *schemaCtx) unionSchema(structName string, st *types.Struct, u *UnionAnnotation, slots []UnionAnnotation) map[string]any {
	// For each variant, synthesize a named component `<structName>_<Values...>`.
	variantRefs := make([]map[string]any, 0, len(u.Variants))
	mapping := map[string]any{}

	for _, v := range u.Variants {
		// Build suffix for the variant name.
		parts := make([]string, 0, len(v.DiscriminatorValues))
		for _, k := range u.Discriminators {
			if val, ok := v.DiscriminatorValues[k]; ok {
				parts = append(parts, pascal(val))
			}
		}
		variantName := structName + "_" + strings.Join(parts, "_")

		// Build variant schema by cloning parent fields, overriding discriminators with const,
		// and overriding the union field with the variant type ref.
		props := map[string]any{}
		required := []string{}

		for i := 0; i < st.NumFields(); i++ {
			f := st.Field(i)
			if !f.Exported() {
				continue
			}
			tag := reflect.StructTag(st.Tag(i))
			if tag.Get("swaggerignore") == "true" {
				continue
			}
			jsonName, omitempty := parseJSONTag(tag.Get("json"), f.Name())
			if jsonName == "-" {
				continue
			}

			var fieldSchema map[string]any
			// Discriminator override?
			if dv, ok := v.DiscriminatorValues[f.Name()]; ok && contains(u.Discriminators, f.Name()) {
				fieldSchema = map[string]any{"type": "string", "const": dv}
			} else if f.Name() == u.Field {
				// Union field → reference the variant type.
				if variantNamed := c.w.findTypeByName(v.TypeName); variantNamed != nil {
					fieldSchema = c.ensureComponent(variantNamed)
				} else {
					// Fallback: leave as unknown marker with a clear hint.
					fieldSchema = map[string]any{"x-unknown": true, "x-union-variant-missing": v.TypeName}
				}
			} else if sec := slotForField(slots, u, f.Name()); sec != nil {
				// A NON-primary union slot → materialize it, narrowed by the pinned
				// discriminator values of this variant (union-slots: every stamped
				// slot reaches every emitting surface, never an opaque x-unknown).
				fieldSchema = c.secondarySlotSchema(st, sec, v)
			} else {
				fieldSchema = c.typeSchema(f.Type())
			}

			if ex := tag.Get("example"); ex != "" {
				fieldSchema["example"] = ex
			}

			props[jsonName] = fieldSchema
			validate := tag.Get("validate")
			if hasRequiredValidateTag(validate) || !omitempty {
				required = append(required, jsonName)
			}
		}

		variantSchema := map[string]any{
			"type":       "object",
			"properties": props,
		}
		if len(required) > 0 {
			variantSchema["required"] = required
		}
		c.spec.schemas()[variantName] = variantSchema

		variantRefs = append(variantRefs, ref(variantName))

		// Build mapping key (single-discriminator) or skip (multi-discriminator).
		if len(u.Discriminators) == 1 {
			dkey := v.DiscriminatorValues[u.Discriminators[0]]
			mapping[dkey] = "#/components/schemas/" + variantName
		}
	}

	out := map[string]any{
		"oneOf": variantRefs,
	}

	// Build x-discriminators: JSON field names for all discriminator fields.
	// This uniform extension is consumed by the SDK plugin to generate variant accessors.
	xDiscriminators := make([]any, 0, len(u.Discriminators))
	for _, goFieldName := range u.Discriminators {
		xDiscriminators = append(xDiscriminators, jsonNameForField(st, goFieldName))
	}
	out["x-discriminators"] = xDiscriminators

	if len(u.Discriminators) == 1 && len(mapping) > 0 {
		// Find the JSON name for the discriminator field.
		discJSON := jsonNameForField(st, u.Discriminators[0])
		out["discriminator"] = map[string]any{
			"propertyName": discJSON,
			"mapping":      mapping,
		}
	}
	return out
}

// slotForField returns the non-primary union slot whose union field matches the
// given Go field name, or nil when the field belongs to no other stamped slot.
func slotForField(slots []UnionAnnotation, primary *UnionAnnotation, field string) *UnionAnnotation {
	for i := range slots {
		if slots[i].Field == field && slots[i].Field != primary.Field {
			return &slots[i]
		}
	}
	return nil
}

// secondarySlotSchema materializes a NON-primary union slot inside a primary
// variant. The primary variant pins const values for its discriminators, so any
// secondary variant whose discriminator values contradict a pinned value is
// excluded. Exactly one variant left → a direct $ref (fully narrowed, mirroring
// how the primary slot's variant field refs its type); several → the complete
// oneOf with x-discriminators metadata (+ a discriminator mapping when the slot
// has a single discriminator).
func (c *schemaCtx) secondarySlotSchema(st *types.Struct, sec *UnionAnnotation, pinned UnionVariant) map[string]any {
	var matching []UnionVariant
	for _, sv := range sec.Variants {
		ok := true
		for dk, dv := range sv.DiscriminatorValues {
			if pv, has := pinned.DiscriminatorValues[dk]; has && pv != dv {
				ok = false
				break
			}
		}
		if ok {
			matching = append(matching, sv)
		}
	}
	if len(matching) == 0 {
		// No shared discriminators narrowed anything away — emit the full slot union.
		matching = sec.Variants
	}

	resolve := func(v UnionVariant) map[string]any {
		if named := c.w.findTypeByName(v.TypeName); named != nil {
			return c.ensureComponent(named)
		}
		return map[string]any{"x-unknown": true, "x-union-variant-missing": v.TypeName}
	}

	if len(matching) == 1 {
		return resolve(matching[0])
	}

	oneOf := make([]map[string]any, 0, len(matching))
	mapping := map[string]any{}
	for _, sv := range matching {
		r := resolve(sv)
		oneOf = append(oneOf, r)
		if len(sec.Discriminators) == 1 {
			if refStr, ok := r["$ref"].(string); ok {
				mapping[sv.DiscriminatorValues[sec.Discriminators[0]]] = refStr
			}
		}
	}
	out := map[string]any{"oneOf": oneOf}
	xDiscriminators := make([]any, 0, len(sec.Discriminators))
	for _, goField := range sec.Discriminators {
		xDiscriminators = append(xDiscriminators, jsonNameForField(st, goField))
	}
	out["x-discriminators"] = xDiscriminators
	if len(sec.Discriminators) == 1 && len(mapping) == len(matching) {
		out["discriminator"] = map[string]any{
			"propertyName": jsonNameForField(st, sec.Discriminators[0]),
			"mapping":      mapping,
		}
	}
	return out
}

// typeSchema converts a Go type into an OpenAPI 3.1 schema fragment (inline).
// Named structs promote to $ref via ensureComponent.
func (c *schemaCtx) typeSchema(t types.Type) map[string]any {
	// Unalias: `type X = wire.X` swaps (union-slots bindings) surface as *types.Alias.
	t = types.Unalias(t)
	switch tt := t.(type) {
	case *types.Pointer:
		inner := c.typeSchema(tt.Elem())
		return makeNullable(inner)
	case *types.Named:
		return c.namedSchema(tt)
	case *types.Basic:
		return c.basicSchema(tt)
	case *types.Slice:
		return map[string]any{
			"type":  "array",
			"items": c.typeSchema(tt.Elem()),
		}
	case *types.Array:
		return map[string]any{
			"type":  "array",
			"items": c.typeSchema(tt.Elem()),
		}
	case *types.Map:
		return map[string]any{
			"type":                 "object",
			"additionalProperties": c.typeSchema(tt.Elem()),
		}
	case *types.Interface:
		return map[string]any{"x-unknown": true}
	case *types.Struct:
		// Anonymous struct — inline object.
		schema := map[string]any{"type": "object"}
		props := map[string]any{}
		for i := 0; i < tt.NumFields(); i++ {
			f := tt.Field(i)
			if !f.Exported() {
				continue
			}
			tag := reflect.StructTag(tt.Tag(i))
			jsonName, _ := parseJSONTag(tag.Get("json"), f.Name())
			if jsonName == "-" {
				continue
			}
			props[jsonName] = c.typeSchema(f.Type())
		}
		if len(props) > 0 {
			schema["properties"] = props
		}
		return schema
	default:
		return map[string]any{"x-unknown": true, "x-go-kind": fmt.Sprintf("%T", t)}
	}
}

// namedSchema handles special-cased named types (uuid.UUID, time.Time, json.RawMessage).
func (c *schemaCtx) namedSchema(t *types.Named) map[string]any {
	name := t.Obj().Name()
	pkgPath := ""
	if pkg := t.Obj().Pkg(); pkg != nil {
		pkgPath = pkg.Path()
	}

	// Well-known replacements.
	switch {
	case pkgPath == "time" && name == "Time":
		return map[string]any{"type": "string", "format": "date-time"}
	case pkgPath == "github.com/google/uuid" && name == "UUID":
		return map[string]any{"type": "string", "format": "uuid"}
	case pkgPath == "encoding/json" && name == "RawMessage":
		// When a parent struct has a @union annotation, the containing struct's
		// union field is already replaced in unionSchema. Remaining RawMessages
		// are truly unknown.
		return map[string]any{"x-unknown": true}
	}

	// If the underlying is a string and we have registered it as an enum, $ref it.
	if _, isBasic := t.Underlying().(*types.Basic); isBasic {
		if _, ok := c.spec.schemas()[name]; ok {
			return ref(name)
		}
		return c.basicSchema(t.Underlying().(*types.Basic))
	}

	// Struct → ensureComponent.
	if _, ok := t.Underlying().(*types.Struct); ok {
		return c.ensureComponent(t)
	}

	// Fallback.
	return c.typeSchema(t.Underlying())
}

func (c *schemaCtx) basicSchema(b *types.Basic) map[string]any {
	switch b.Kind() {
	case types.Bool:
		return map[string]any{"type": "boolean"}
	case types.Int, types.Int8, types.Int16, types.Int32, types.Int64,
		types.Uint, types.Uint8, types.Uint16, types.Uint32, types.Uint64:
		return map[string]any{"type": "integer"}
	case types.Float32, types.Float64:
		return map[string]any{"type": "number"}
	case types.String:
		return map[string]any{"type": "string"}
	default:
		return map[string]any{"x-unknown": true, "x-basic-kind": b.Name()}
	}
}

// makeNullable converts a schema to its OpenAPI 3.0 nullable form.
//
// OpenAPI 3.0 has no `type: "null"`; nullability is the `nullable: true`
// keyword. The codm SDK pipeline enforces this (preprocess.ts R-05 rejects
// 3.1 type-array / anyOf-null forms), so the emitter is responsible for
// producing 3.0-compliant output.
func makeNullable(schema map[string]any) map[string]any {
	// A `$ref` cannot carry sibling keywords in 3.0 — wrap it so `nullable`
	// has somewhere legal to live: `{ allOf: [ref], nullable: true }`.
	if _, hasRef := schema["$ref"]; hasRef {
		return map[string]any{
			"allOf":    []map[string]any{schema},
			"nullable": true,
		}
	}
	if t, ok := schema["type"].([]string); ok {
		// Re-entrant call left a 3.1 array form behind — strip "null", keep the
		// concrete type(s), and mark nullable the 3.0 way.
		rest := make([]string, 0, len(t))
		for _, s := range t {
			if s != "null" {
				rest = append(rest, s)
			}
		}
		switch len(rest) {
		case 0:
			delete(schema, "type")
		case 1:
			schema["type"] = rest[0]
		default:
			schema["type"] = rest
		}
		schema["nullable"] = true
		return schema
	}
	// `type: string` (the common case) or a typeless composed schema
	// (oneOf/x-unknown): nullability rides alongside as the `nullable` keyword.
	schema["nullable"] = true
	return schema
}

// hasRequiredValidateTag reports whether a validator/v10 `validate` tag carries
// an *unconditional* `required` rule. Conditional variants — required_if,
// required_unless, required_with, required_with_all, required_without,
// required_without_all — only make the field required in some circumstances
// (e.g. "exactly one of mediaUrl/mediaPath" pairs `required_without=X` on both
// sides), so a naive substring match on "required" would wrongly mark every
// side of a mutually-exclusive group as OpenAPI-required. Only the literal
// "required" token (no suffix) counts.
func hasRequiredValidateTag(validate string) bool {
	for _, part := range strings.Split(validate, ",") {
		tag, _, _ := strings.Cut(part, "=")
		if strings.TrimSpace(tag) == "required" {
			return true
		}
	}
	return false
}

// parseJSONTag extracts the name and omitempty flag from a Go json tag.
func parseJSONTag(tag, fallback string) (string, bool) {
	if tag == "" {
		return fallback, false
	}
	parts := strings.Split(tag, ",")
	name := parts[0]
	if name == "" {
		name = fallback
	}
	omitempty := false
	for _, p := range parts[1:] {
		if p == "omitempty" {
			omitempty = true
		}
	}
	return name, omitempty
}

func jsonNameForField(st *types.Struct, fieldName string) string {
	for i := 0; i < st.NumFields(); i++ {
		if st.Field(i).Name() == fieldName {
			tag := reflect.StructTag(st.Tag(i))
			name, _ := parseJSONTag(tag.Get("json"), fieldName)
			return name
		}
	}
	// Fallback: lowercase first letter.
	if fieldName == "" {
		return fieldName
	}
	return strings.ToLower(fieldName[:1]) + fieldName[1:]
}

func contains(ss []string, s string) bool {
	for _, x := range ss {
		if x == s {
			return true
		}
	}
	return false
}

func pascal(s string) string {
	// Split on `.` first (dotted discriminator values like event names),
	// then on `_`, and capitalize each resulting word.
	var parts []string
	for _, seg := range strings.Split(s, ".") {
		for _, w := range strings.Split(seg, "_") {
			if w == "" {
				continue
			}
			parts = append(parts, strings.ToUpper(w[:1])+strings.ToLower(w[1:]))
		}
	}
	return strings.Join(parts, "")
}

// findTypeByName searches all loaded packages for a named type matching the given name.
// Used to resolve @variant type names (which are bare identifiers in annotations).
// Scoped to packages under the current module to avoid stdlib collisions
// (e.g. regexp/syntax.ErrorCode).
func (w *walker) findTypeByName(name string) *types.Named {
	for _, ppath := range w.sortedPkgPaths() {
		if !strings.HasPrefix(ppath, "template/api-go/") {
			continue
		}
		pkg := w.byPath[ppath]
		if pkg.Types == nil {
			continue
		}
		obj := pkg.Types.Scope().Lookup(name)
		if obj == nil {
			continue
		}
		if tn, ok := obj.(*types.TypeName); ok {
			// Unalias: a variant name may resolve through an alias to a generated
			// wire struct (union-slots binding swap).
			if n, ok := types.Unalias(tn.Type()).(*types.Named); ok {
				return n
			}
		}
	}
	return nil
}
