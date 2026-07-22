package openapi

import (
	"fmt"
	"go/ast"
	"go/token"
	"go/types"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"golang.org/x/tools/go/packages"
)

// modulePrefix is the Go-side seam for the repo identity config. Go cannot
// import /template.config.ts, so this const mirrors its `goModulePrefix`
// value — template.config.ts is the source of truth; keep the two in
// lockstep (sync-machinery P1-2). It must match the `module <prefix>/...`
// lines of api-go, core-go, contracts-go and client-go.
const modulePrefix = "template"

// ownsSchemaSource reports whether a package import path is authoritative for
// THIS service's OpenAPI surface: our own service code (<prefix>/api-go), the
// OpenAPI core (<prefix>/core-go), and the wire contracts (<prefix>/contracts-go).
//
// It deliberately excludes the generated downstream SDK (<prefix>/client-go).
// The polyglot split spreads enum definitions across sibling Go modules — so the
// scan must span the whole module prefix rather than a single module — but
// client-go is oapi-codegen output that re-declares the same wire enum names
// (SalesPlatform, CurrencyCode, …). Including it would collide in the
// name-keyed enum registry and double every wire enum's `enum` values. Loaded
// stdlib/third-party deps (via NeedDeps) are excluded by the module prefix.
func ownsSchemaSource(pkgPath string) bool {
	return strings.HasPrefix(pkgPath, modulePrefix+"/") &&
		!strings.HasPrefix(pkgPath, modulePrefix+"/client-go")
}

// sortedPkgPaths returns all loaded package paths in deterministic order.
func (w *walker) sortedPkgPaths() []string {
	out := make([]string, 0, len(w.byPath))
	for p := range w.byPath {
		out = append(out, p)
	}
	sort.Strings(out)
	return out
}

// walker loads the channel module packages and exposes helpers to look up
// types, constants, and AST nodes by qualified name.
type walker struct {
	root   string
	fset   *token.FileSet
	pkgs   []*packages.Package
	byPath map[string]*packages.Package // import path -> package
	empty  bool                         // true when no internal/ exists (no contexts → empty spec)
}

func newWalker(root string) (*walker, error) {
	// Controllers live under internal/<ctx>/. A fresh boilerplate service may
	// have no bounded contexts yet — in that case there is nothing to walk, so
	// return an empty walker and let the emitter produce a valid empty spec
	// rather than failing on a missing ./internal/ pattern.
	if info, err := os.Stat(filepath.Join(root, "internal")); err != nil || !info.IsDir() {
		return &walker{
			root:   root,
			fset:   token.NewFileSet(),
			byPath: map[string]*packages.Package{},
			empty:  true,
		}, nil
	}

	cfg := &packages.Config{
		Mode: packages.NeedName |
			packages.NeedFiles |
			packages.NeedSyntax |
			packages.NeedTypes |
			packages.NeedTypesInfo |
			packages.NeedDeps |
			packages.NeedImports |
			packages.NeedModule,
		Dir:   root,
		Tests: false,
	}

	pkgs, err := packages.Load(cfg, "./internal/...")
	if err != nil {
		return nil, err
	}

	// Hard-fail on any load error so emission doesn't silently produce
	// a degraded spec.
	var errs []string
	packages.Visit(pkgs, nil, func(p *packages.Package) {
		for _, e := range p.Errors {
			errs = append(errs, fmt.Sprintf("  %s: %s", p.PkgPath, e.Error()))
		}
	})
	if len(errs) > 0 {
		return nil, fmt.Errorf("packages.Load errors:\n%s", strings.Join(errs, "\n"))
	}

	w := &walker{
		root:   root,
		pkgs:   pkgs,
		byPath: map[string]*packages.Package{},
	}
	// Index every transitively loaded package by import path, so
	// usecases/shared types referenced from controllers resolve.
	packages.Visit(pkgs, nil, func(p *packages.Package) {
		if p.Types == nil {
			return
		}
		if _, ok := w.byPath[p.PkgPath]; !ok {
			w.byPath[p.PkgPath] = p
		}
		if w.fset == nil && p.Fset != nil {
			w.fset = p.Fset
		}
	})

	// The real contract is "no Go packages under internal/ → empty spec", of which the missing-dir
	// fast path above is just one shape. An internal/ that exists but holds no Go packages yet
	// (e.g. only the README placeholder of a contextless template) loads zero packages — that is
	// the same empty state, not a walk failure.
	if len(w.byPath) == 0 {
		w.empty = true
	}
	if w.fset == nil {
		w.fset = token.NewFileSet()
	}

	return w, nil
}

// controllerType describes one concrete controller.
type controllerType struct {
	pkg      *packages.Package
	named    *types.Named
	metadata controllerMetadata
}

// forEachController invokes fn for every concrete type implementing types.Controller.
func (w *walker) forEachController(fn func(*controllerType) error) error {
	if w.empty {
		// No bounded contexts loaded → no controllers to register.
		return nil
	}
	ctrlIface := w.lookupControllerInterface()
	if ctrlIface == nil {
		return fmt.Errorf("types.Controller interface not found")
	}
	seen := map[string]bool{}
	paths := w.sortedPkgPaths()
	for _, ppath := range paths {
		pkg := w.byPath[ppath]
		if pkg.Types == nil {
			continue
		}
		if !strings.Contains(pkg.PkgPath, "/controllers") {
			continue
		}
		scope := pkg.Types.Scope()
		for _, name := range scope.Names() {
			obj := scope.Lookup(name)
			tn, ok := obj.(*types.TypeName)
			if !ok {
				continue
			}
			named, ok := tn.Type().(*types.Named)
			if !ok {
				continue
			}
			// Check pointer receiver implementation.
			ptr := types.NewPointer(named)
			if !types.Implements(ptr, ctrlIface) && !types.Implements(named, ctrlIface) {
				continue
			}
			key := pkg.PkgPath + "." + name
			if seen[key] {
				continue
			}
			seen[key] = true

			meta, err := w.extractControllerMetadata(pkg, named)
			if err != nil {
				return fmt.Errorf("%s: %w", key, err)
			}
			if err := fn(&controllerType{pkg: pkg, named: named, metadata: *meta}); err != nil {
				return err
			}
		}
	}
	return nil
}

// lookupControllerInterface resolves types.Controller from the shared/types package.
func (w *walker) lookupControllerInterface() *types.Interface {
	p, ok := w.byPath[modulePrefix+"/core-go/types"]
	if !ok {
		return nil
	}
	obj := p.Types.Scope().Lookup("Controller")
	if obj == nil {
		return nil
	}
	iface, ok := obj.Type().Underlying().(*types.Interface)
	if !ok {
		return nil
	}
	return iface
}

// lookupNamed finds a named type by its package path and type name.
func (w *walker) lookupNamed(pkgPath, name string) (*packages.Package, *types.Named) {
	pkg, ok := w.byPath[pkgPath]
	if !ok {
		return nil, nil
	}
	obj := pkg.Types.Scope().Lookup(name)
	if obj == nil {
		return nil, nil
	}
	tn, ok := obj.(*types.TypeName)
	if !ok {
		return nil, nil
	}
	named, ok := tn.Type().(*types.Named)
	if !ok {
		return nil, nil
	}
	return pkg, named
}

// packagesByPrefix returns packages whose PkgPath has the given prefix (sorted).
func (w *walker) packagesByPrefix(prefix string) []*packages.Package {
	var out []*packages.Package
	for path, p := range w.byPath {
		if strings.HasPrefix(path, prefix) {
			out = append(out, p)
		}
	}
	return out
}

// findTypeDeclComment returns the leading doc comment group for a named type's
// AST declaration, if available.
func (w *walker) findTypeDeclComment(pkg *packages.Package, typeName string) *ast.CommentGroup {
	for _, f := range pkg.Syntax {
		for _, decl := range f.Decls {
			gen, ok := decl.(*ast.GenDecl)
			if !ok || gen.Tok != token.TYPE {
				continue
			}
			for _, spec := range gen.Specs {
				ts, ok := spec.(*ast.TypeSpec)
				if !ok {
					continue
				}
				if ts.Name.Name != typeName {
					continue
				}
				// Prefer the GenDecl doc (covers the "// @union ..." lines immediately above `type X struct`).
				if gen.Doc != nil {
					return gen.Doc
				}
				return ts.Doc
			}
		}
	}
	return nil
}
