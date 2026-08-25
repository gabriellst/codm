package openapi

import (
	"go/types"
	"regexp"
	"strings"
)

// UnionAnnotation mirrors client/scripts/channel/unions.ts :: UnionAnnotation
// but is built by walking AST doc comments (authoritative Go-side).
type UnionAnnotation struct {
	StructName     string
	Field          string   // Go field name
	JSONField      string   // JSON name of the union field
	Discriminators []string // Go discriminator field names (in original case)
	Variants       []UnionVariant
}

// UnionVariant mirrors client/scripts/channel/unions.ts :: UnionVariant.
type UnionVariant struct {
	DiscriminatorValues map[string]string // key: Go discriminator field name
	TypeName            string
}

var (
	unionLineRE   = regexp.MustCompile(`@union\s+field=(\w+)\s+discriminatedBy=([\w,]+)`)
	variantLineRE = regexp.MustCompile(`@variant\s+(.+)`)
	kvRE          = regexp.MustCompile(`(\w+)=(\S+)`)
)

// collectUnions walks every named struct in the loaded packages and returns
// EVERY @union annotation stamped on it, in declaration order. A struct may
// declare several union slots (e.g. ChannelMessageReceivedPayload stamps both
// `content` and `platformData`); all of them must materialize in the emitted
// spec — the emitter picks the slot with the most variants as the top-level
// oneOf driver and narrows the remaining slots inside each variant (schema.go).
func collectUnions(w *walker) (map[string][]UnionAnnotation, error) {
	all := map[string][]UnionAnnotation{}

	for _, ppath := range w.sortedPkgPaths() {
		// Own module + the generated contracts bindings: union annotations are STAMPED
		// onto the generated payload structs (template/contracts-go/wire) by the wire
		// codegen — the scanner must find them there (union-slots spec §2.2).
		if !strings.HasPrefix(ppath, "template/api-go/") && !strings.HasPrefix(ppath, "template/contracts-go/") {
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
			unions := parseUnionBlock(name, cg.Text())
			var kept []UnionAnnotation
			for _, u := range unions {
				if len(u.Variants) > 0 {
					kept = append(kept, u)
				}
			}
			if len(kept) > 0 {
				all[name] = kept
			}
		}
	}

	return all, nil
}

// parseUnionBlock parses a comment block into UnionAnnotations.
// Mirrors client/scripts/channel/unions.ts (multiple @union blocks supported;
// @variant lines belong to the most recently declared @union).
func parseUnionBlock(structName, text string) []UnionAnnotation {
	var out []UnionAnnotation
	var current *UnionAnnotation

	for _, line := range strings.Split(text, "\n") {
		if m := unionLineRE.FindStringSubmatch(line); m != nil {
			if current != nil {
				out = append(out, *current)
			}
			goField := m[1]
			discs := strings.Split(m[2], ",")
			current = &UnionAnnotation{
				StructName:     structName,
				Field:          goField,
				JSONField:      lcFirst(goField),
				Discriminators: discs,
			}
			continue
		}
		if m := variantLineRE.FindStringSubmatch(line); m != nil && current != nil {
			kvs := kvRE.FindAllStringSubmatch(m[1], -1)
			v := UnionVariant{DiscriminatorValues: map[string]string{}}
			for _, kv := range kvs {
				key, val := kv[1], kv[2]
				if key == "type" {
					v.TypeName = val
				} else {
					v.DiscriminatorValues[key] = val
				}
			}
			if v.TypeName != "" {
				current.Variants = append(current.Variants, v)
			}
		}
	}
	if current != nil {
		out = append(out, *current)
	}
	return out
}

func lcFirst(s string) string {
	if s == "" {
		return s
	}
	return strings.ToLower(s[:1]) + s[1:]
}
