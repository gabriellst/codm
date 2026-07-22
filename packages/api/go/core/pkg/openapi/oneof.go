package openapi

import (
	"go/types"
	"regexp"
	"strings"
)

var oneofLineRE = regexp.MustCompile(`@oneof\s+values=(.+)`)

// parseOneofAnnotation extracts the member enum type names from a
// `@oneof values=A,B,C` line in a type's doc comment. The values are enum TYPE
// names (each becomes a `$ref`), not literal enum string values. Returns nil
// when no annotation is present.
func parseOneofAnnotation(text string) []string {
	for _, line := range strings.Split(text, "\n") {
		m := oneofLineRE.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		members := make([]string, 0)
		for _, raw := range strings.Split(m[1], ",") {
			if v := strings.TrimSpace(raw); v != "" {
				members = append(members, v)
			}
		}
		return members
	}
	return nil
}

// emitOneofComponent registers a named oneOf component referencing each member by $ref.
func emitOneofComponent(spec *Spec, name string, members []string) {
	variants := make([]map[string]any, 0, len(members))
	for _, m := range members {
		variants = append(variants, ref(m))
	}
	spec.putSchema(name, map[string]any{"oneOf": variants})
}

// registerOneofUnions scans owned source packages for type declarations carrying a
// `@oneof` doc-comment annotation and registers each as a named oneOf component.
// Member enum components are expected to already be registered by registerEnums.
func registerOneofUnions(spec *Spec, w *walker) error {
	for _, ppath := range w.sortedPkgPaths() {
		if !ownsSchemaSource(ppath) {
			continue
		}
		pkg := w.byPath[ppath]
		if pkg.Types == nil {
			continue
		}
		scope := pkg.Types.Scope()
		for _, name := range scope.Names() {
			obj := scope.Lookup(name)
			tn, ok := obj.(*types.TypeName)
			if !ok {
				continue
			}
			if _, ok := tn.Type().(*types.Named); !ok {
				continue
			}
			cg := w.findTypeDeclComment(pkg, name)
			if cg == nil {
				continue
			}
			members := parseOneofAnnotation(cg.Text())
			if len(members) == 0 {
				continue
			}
			emitOneofComponent(spec, name, members)
		}
	}
	return nil
}
