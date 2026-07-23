package openapi

import (
	"go/ast"
	"go/token"
	"go/types"
	"slices"
	"sort"
	"strconv"
	"strings"

	"golang.org/x/tools/go/packages"
)

// registerEnums scans every loaded package for typed-string constant blocks and
// registers them as named components with x-enum-varnames.
//
// Rule: a type `type Foo string` with `const (Bar Foo = "BAR"; Baz Foo = "BAZ")`
// is promoted to a component named `Foo`. Untyped constants are ignored.
func registerEnums(spec *Spec, w *walker) error {
	// collectedByType: enum name → { varnames, values }
	type enumEntry struct {
		varNames []string
		values   []string
	}
	collected := map[string]*enumEntry{}

	// Deterministic package order, in two tiers: the own module FIRST, then the generated
	// contracts bindings (template/contracts-go/wire), where contract enums referenced by
	// stamped payload structs are declared (union-slots spec §2.2). Per enum NAME the first
	// tier that declares it wins outright — an own-module enum (e.g. the gateway-local
	// ChannelStatus) is never merged with a same-named contracts enum whose value set
	// differs, and an aliased enum (`type X = wire.X` + alias consts) keeps the exact
	// component it had before the bindings were scanned.
	tierPaths := func(prefix string) []string {
		paths := make([]string, 0, len(w.byPath))
		for p := range w.byPath {
			if strings.HasPrefix(p, prefix) {
				paths = append(paths, p)
			}
		}
		sort.Strings(paths)
		return paths
	}

	tierOwn := append(tierPaths("template/api-go/"), tierPaths("template/core-go/")...)
	for _, tier := range [][]string{tierOwn, tierPaths("template/contracts-go/")} {
		ownedByEarlierTier := map[string]bool{}
		for n := range collected {
			ownedByEarlierTier[n] = true
		}
		for _, ppath := range tier {
			pkg := w.byPath[ppath]
			if pkg.Types == nil {
				continue
			}
			for _, f := range pkg.Syntax {
				for _, decl := range f.Decls {
					gen, ok := decl.(*ast.GenDecl)
					if !ok || gen.Tok != token.CONST {
						continue
					}
					for _, spec := range gen.Specs {
						vs, ok := spec.(*ast.ValueSpec)
						if !ok {
							continue
						}
						enumName := resolveTypedStringType(pkg, vs)
						if enumName == "" {
							continue
						}
						if ownedByEarlierTier[enumName] {
							continue
						}
						for i, n := range vs.Names {
							if i >= len(vs.Values) {
								continue
							}
							val, ok := constStringValue(pkg, vs.Values[i])
							if !ok {
								continue
							}
							e := collected[enumName]
							if e == nil {
								e = &enumEntry{}
								collected[enumName] = e
							}
							// Within a tier, first declaration wins per (enum, value) —
							// split const blocks for one type stay a single component.
							if slices.Contains(e.values, val) {
								continue
							}
							e.varNames = append(e.varNames, n.Name)
							e.values = append(e.values, val)
						}
					}
				}
			}
		}
	}

	// Emit components in name order for determinism.
	names := make([]string, 0, len(collected))
	for n := range collected {
		names = append(names, n)
	}
	sort.Strings(names)
	for _, n := range names {
		e := collected[n]
		if len(e.values) < 2 {
			// Not an enum; a single-value const just becomes a literal if needed elsewhere.
			continue
		}
		spec.putSchema(n, map[string]any{
			"type":            "string",
			"enum":            toAnySlice(e.values),
			"x-enum-varnames": toAnySlice(e.varNames),
		})
	}
	return nil
}

// resolveTypedStringType returns the named type of a `const X Foo = "y"` spec if
// its declared type is a typed string. Returns "" otherwise.
func resolveTypedStringType(pkg *packages.Package, vs *ast.ValueSpec) string {
	// Explicit type: const X Foo = "y"
	if vs.Type != nil {
		return namedStringType(pkg, vs.Type)
	}
	// Type inferred from the first name's object.
	if len(vs.Names) == 0 {
		return ""
	}
	obj := pkg.TypesInfo.Defs[vs.Names[0]]
	if obj == nil {
		return ""
	}
	named, ok := obj.Type().(*types.Named)
	if !ok {
		return ""
	}
	basic, ok := named.Underlying().(*types.Basic)
	if !ok || basic.Kind() != types.String {
		return ""
	}
	return named.Obj().Name()
}

func namedStringType(pkg *packages.Package, e ast.Expr) string {
	tv, ok := pkg.TypesInfo.Types[e]
	if !ok {
		return ""
	}
	named, ok := tv.Type.(*types.Named)
	if !ok {
		return ""
	}
	basic, ok := named.Underlying().(*types.Basic)
	if !ok || basic.Kind() != types.String {
		return ""
	}
	return named.Obj().Name()
}

func constStringValue(pkg *packages.Package, e ast.Expr) (string, bool) {
	// Literal.
	if lit, ok := e.(*ast.BasicLit); ok && lit.Kind == token.STRING {
		s, err := strconv.Unquote(lit.Value)
		if err == nil {
			return s, true
		}
		return strings.Trim(lit.Value, "\"`"), true
	}
	// Typed constant in TypesInfo.
	tv, ok := pkg.TypesInfo.Types[e]
	if !ok || tv.Value == nil {
		return "", false
	}
	s := tv.Value.String()
	s = strings.TrimPrefix(s, `"`)
	s = strings.TrimSuffix(s, `"`)
	return s, true
}

func toAnySlice(ss []string) []any {
	out := make([]any, len(ss))
	for i, s := range ss {
		out[i] = s
	}
	return out
}
