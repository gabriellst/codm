package openapi

import (
	"fmt"
	"go/ast"
	"go/token"
	"go/types"
	"strconv"
	"strings"

	"golang.org/x/tools/go/packages"
)

// controllerMetadata is the extracted form of types.ControllerMetadata{...}.
type controllerMetadata struct {
	Context     string
	Path        string
	Method      string
	Description string
	Tags        []string
	Status      int
	Request     types.Type // may be nil
	Response    types.Type // may be nil
	// Errors is not extracted yet (Phase 4 scope: structural; error codes TBD).
}

// ResolvedStatus returns the effective success status, applying the default rule.
func (m controllerMetadata) ResolvedStatus() int {
	if m.Status != 0 {
		return m.Status
	}
	if m.Response == nil {
		return 204
	}
	return 200
}

// extractControllerMetadata locates the controller type's `Metadata()` method on
// a pointer receiver and statically evaluates the composite literal it returns.
func (w *walker) extractControllerMetadata(pkg *packages.Package, named *types.Named) (*controllerMetadata, error) {
	name := named.Obj().Name()

	// Find func (c *<Name>) Metadata() types.ControllerMetadata in the package AST.
	for _, f := range pkg.Syntax {
		for _, decl := range f.Decls {
			fd, ok := decl.(*ast.FuncDecl)
			if !ok {
				continue
			}
			if fd.Name.Name != "Metadata" || fd.Recv == nil || len(fd.Recv.List) != 1 {
				continue
			}
			recvType := unwrapStar(fd.Recv.List[0].Type)
			if id, ok := recvType.(*ast.Ident); !ok || id.Name != name {
				continue
			}
			return evalMetadataBody(pkg, fd)
		}
	}
	return nil, fmt.Errorf("controller %s: Metadata() method not found", name)
}

func unwrapStar(e ast.Expr) ast.Expr {
	if s, ok := e.(*ast.StarExpr); ok {
		return s.X
	}
	return e
}

// evalMetadataBody finds the `return types.ControllerMetadata{...}` and extracts fields.
func evalMetadataBody(pkg *packages.Package, fd *ast.FuncDecl) (*controllerMetadata, error) {
	var lit *ast.CompositeLit
	ast.Inspect(fd.Body, func(n ast.Node) bool {
		ret, ok := n.(*ast.ReturnStmt)
		if !ok || len(ret.Results) != 1 {
			return true
		}
		if c, ok := ret.Results[0].(*ast.CompositeLit); ok {
			lit = c
			return false
		}
		return true
	})
	if lit == nil {
		return nil, fmt.Errorf("no composite literal in Metadata()")
	}

	meta := &controllerMetadata{}

	for _, elt := range lit.Elts {
		kv, ok := elt.(*ast.KeyValueExpr)
		if !ok {
			continue
		}
		key, ok := kv.Key.(*ast.Ident)
		if !ok {
			continue
		}
		switch key.Name {
		case "Context":
			meta.Context = stringFromExpr(pkg, kv.Value)
		case "Path":
			meta.Path = stringFromExpr(pkg, kv.Value)
		case "Method":
			meta.Method = stringFromExpr(pkg, kv.Value)
		case "Description":
			meta.Description = stringFromExpr(pkg, kv.Value)
		case "Tags":
			meta.Tags = stringSliceFromExpr(pkg, kv.Value)
		case "Status":
			meta.Status = intFromExpr(pkg, kv.Value)
		case "Request":
			meta.Request = typeFromValueExpr(pkg, kv.Value)
		case "Response":
			meta.Response = typeFromValueExpr(pkg, kv.Value)
		}
	}

	if meta.Method == "" || meta.Path == "" {
		return nil, fmt.Errorf("missing Method/Path in Metadata()")
	}

	return meta, nil
}

// typeFromValueExpr resolves the runtime type of an expression that is either:
//   - `nil`
//   - `FooRequest{}` (local struct literal)
//   - `pkg.SomeOutput{}` (qualified struct literal)
func typeFromValueExpr(pkg *packages.Package, e ast.Expr) types.Type {
	// nil
	if id, ok := e.(*ast.Ident); ok && id.Name == "nil" {
		return nil
	}
	// &T{} pointer → unwrap.
	if u, ok := e.(*ast.UnaryExpr); ok && u.Op == token.AND {
		e = u.X
	}
	tv, ok := pkg.TypesInfo.Types[e]
	if !ok || tv.Type == nil {
		return nil
	}
	return tv.Type
}

func stringFromExpr(pkg *packages.Package, e ast.Expr) string {
	if lit, ok := e.(*ast.BasicLit); ok && lit.Kind == token.STRING {
		s, err := strconv.Unquote(lit.Value)
		if err == nil {
			return s
		}
		return strings.Trim(lit.Value, "\"`")
	}
	// fall back to type-and-value constant info
	if tv, ok := pkg.TypesInfo.Types[e]; ok && tv.Value != nil {
		return constantToString(tv.Value.String())
	}
	return ""
}

func intFromExpr(pkg *packages.Package, e ast.Expr) int {
	// Literal
	if lit, ok := e.(*ast.BasicLit); ok && lit.Kind == token.INT {
		i, err := strconv.Atoi(lit.Value)
		if err == nil {
			return i
		}
	}
	// Selector (e.g. http.StatusNoContent) — resolve via the types info.
	tv, ok := pkg.TypesInfo.Types[e]
	if !ok || tv.Value == nil {
		return 0
	}
	s := tv.Value.String()
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return 0
}

func stringSliceFromExpr(pkg *packages.Package, e ast.Expr) []string {
	cl, ok := e.(*ast.CompositeLit)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(cl.Elts))
	for _, el := range cl.Elts {
		if s := stringFromExpr(pkg, el); s != "" {
			out = append(out, s)
		}
	}
	return out
}

func constantToString(s string) string {
	// constant.String() wraps strings in quotes.
	s = strings.TrimPrefix(s, `"`)
	s = strings.TrimSuffix(s, `"`)
	return s
}
