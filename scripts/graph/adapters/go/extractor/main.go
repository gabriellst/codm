// Go AST extractor for the code-graph pipeline.
//
// Walks a directory of Go source files, parses each with go/parser, and emits
// a JSON document describing the facts the TypeScript adapter needs to build
// the graph (type declarations, calls, imports, struct fields, etc.).
//
// The TS side is responsible for routing those facts into graph nodes / edges
// — this binary only produces structured facts so the TS adapter is no longer
// pattern-matching against raw source bytes.
//
// Invocation:
//   go run ./scripts/graph/adapters/go/extractor <repoRoot> [<rootDir> ...]
//
// Defaults to scanning packages/channel/internal if no roots are given.
// Output: JSON on stdout, schema documented in `types.go-facts.ts`.
package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
)

type Output struct {
	Files []FileFacts `json:"files"`
}

type FileFacts struct {
	Rel             string            `json:"rel"`
	Package         string            `json:"package"`
	Imports         []ImportRef       `json:"imports"`
	Types           []TypeDecl        `json:"types"`
	ConstBlocks     []ConstBlock      `json:"constBlocks"`
	ErrorCodes      []ErrorCodeDecl   `json:"errorCodes"`
	StringConsts    []StringConst     `json:"stringConsts"`
	Funcs           []FuncDecl        `json:"funcs"`
	Methods         []MethodDecl      `json:"methods"`
	Calls           []CallRef         `json:"calls"`
	PascalRefs      []PascalRef       `json:"pascalRefs"`
	ControllerMeta  *ControllerMeta   `json:"controllerMeta,omitempty"`
}

type MethodDecl struct {
	Name      string `json:"name"`
	RecvType  string `json:"recvType"`           // receiver type, e.g. "MessageReceivedProjector"
	RecvPtr   bool   `json:"recvPtr,omitempty"`  // true for `*T` receivers
	Line      int    `json:"line"`               // start line
	EndLine   int    `json:"endLine"`            // last line of method body
	ReturnRef string `json:"returnRef,omitempty"` // selector expression on the return statement (e.g. "ctxevents.MessageReceivedEventName")
}

type ImportRef struct {
	Alias string `json:"alias,omitempty"`
	Path  string `json:"path"`
}

type TypeDecl struct {
	Name       string      `json:"name"`
	Kind       string      `json:"kind"` // "struct" | "interface" | "alias"
	Underlying string      `json:"underlying,omitempty"`
	Line       int         `json:"line"`
	Fields     []FieldDecl `json:"fields,omitempty"`
}

type FieldDecl struct {
	Name    string `json:"name"`
	Pkg     string `json:"pkg,omitempty"`
	Type    string `json:"type"`
	Pointer bool   `json:"pointer,omitempty"`
}

type ConstBlock struct {
	Typed   string         `json:"typed,omitempty"`
	Members []ConstMember  `json:"members"`
}

type ConstMember struct {
	Name  string `json:"name"`
	Value string `json:"value,omitempty"`
	Line  int    `json:"line"`
}

type ErrorCodeDecl struct {
	Name string `json:"name"` // identifier without the "Code" prefix
	Wire string `json:"wire"` // the string literal value
	Line int    `json:"line"`
}

type StringConst struct {
	Name  string `json:"name"`
	Value string `json:"value"`
	Line  int    `json:"line"`
}

type FuncDecl struct {
	Name   string      `json:"name"`
	Line   int         `json:"line"`
	Params []FieldDecl `json:"params"`
}

type CallRef struct {
	Callee       string   `json:"callee"`            // full text, e.g. "externalMediator.Publish" or "NewFooEvent"
	Pkg          string   `json:"pkg,omitempty"`     // "externalMediator" if callee is a SelectorExpr
	Fn           string   `json:"fn"`                // "Publish" or "NewFooEvent"
	TypeArgs     []string `json:"typeArgs,omitempty"`
	FirstArgCall string   `json:"firstArgCall,omitempty"` // if first arg is itself a CallExpr, its function name
	Line         int      `json:"line"`
	RecvType     string   `json:"recvType,omitempty"`     // receiver type if this call lives inside a method body
}

type PascalRef struct {
	Pkg    string `json:"pkg"`
	Symbol string `json:"symbol"`
	Line   int    `json:"line"`
}

type ControllerMeta struct {
	Path         string   `json:"path,omitempty"`
	Method       string   `json:"method,omitempty"`
	Description  string   `json:"description,omitempty"`
	Context      string   `json:"context,omitempty"`
	ErrorCodes   []string `json:"errorCodes,omitempty"`
	Line         int      `json:"line"`
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: extractor <repoRoot> [<rootDir> ...]")
		os.Exit(2)
	}
	repoRoot := os.Args[1]
	roots := os.Args[2:]
	if len(roots) == 0 {
		// Polyglot default. Callers should pass explicit roots; this fallback
		// keeps the binary runnable standalone for debugging.
		roots = []string{filepath.Join(repoRoot, "packages/api/go/internal")}
	}

	out := Output{Files: []FileFacts{}}
	for _, root := range roots {
		err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			if info.IsDir() {
				name := info.Name()
				if name == "vendor" || name == "node_modules" || name == "dist" {
					return filepath.SkipDir
				}
				return nil
			}
			if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
				return nil
			}
			rel, _ := filepath.Rel(repoRoot, path)
			rel = filepath.ToSlash(rel)
			facts, perr := parseFile(path, rel)
			if perr != nil {
				fmt.Fprintf(os.Stderr, "parse error %s: %v\n", rel, perr)
				return nil
			}
			out.Files = append(out.Files, facts)
			return nil
		})
		if err != nil {
			fmt.Fprintln(os.Stderr, "walk error:", err)
			os.Exit(1)
		}
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(out); err != nil {
		fmt.Fprintln(os.Stderr, "encode error:", err)
		os.Exit(1)
	}
}

func parseFile(absPath, rel string) (FileFacts, error) {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, absPath, nil, parser.ParseComments)
	if err != nil {
		return FileFacts{Rel: rel}, err
	}

	facts := FileFacts{
		Rel:          rel,
		Package:      f.Name.Name,
		Imports:      []ImportRef{},
		Types:        []TypeDecl{},
		ConstBlocks:  []ConstBlock{},
		ErrorCodes:   []ErrorCodeDecl{},
		StringConsts: []StringConst{},
		Funcs:        []FuncDecl{},
		Methods:      []MethodDecl{},
		Calls:        []CallRef{},
		PascalRefs:   []PascalRef{},
	}

	// Imports
	for _, imp := range f.Imports {
		ir := ImportRef{Path: unquote(imp.Path.Value)}
		if imp.Name != nil {
			ir.Alias = imp.Name.Name
		}
		facts.Imports = append(facts.Imports, ir)
	}

	// Top-level decls
	for _, d := range f.Decls {
		switch g := d.(type) {
		case *ast.GenDecl:
			handleGenDecl(g, fset, &facts)
		case *ast.FuncDecl:
			handleFuncDecl(g, fset, &facts)
		}
	}

	// Walk the AST for calls + pascal refs + controller metadata + body identifiers
	ast.Inspect(f, func(n ast.Node) bool {
		switch x := n.(type) {
		case *ast.CallExpr:
			if c := extractCall(x, fset); c != nil {
				facts.Calls = append(facts.Calls, *c)
			}
		case *ast.SelectorExpr:
			if id, ok := x.X.(*ast.Ident); ok {
				sym := x.Sel.Name
				if len(sym) > 0 && isUpper(sym[0]) {
					facts.PascalRefs = append(facts.PascalRefs, PascalRef{
						Pkg:    id.Name,
						Symbol: sym,
						Line:   fset.Position(x.Pos()).Line,
					})
				}
			}
		case *ast.CompositeLit:
			meta := extractControllerMeta(x, fset)
			if meta != nil {
				facts.ControllerMeta = meta
			}
		}
		return true
	})

	// Stamp method receiver on calls/pascal refs that sit inside a method body.
	// Sorted methods are scanned per call/ref (typically <20 methods per file).
	for i := range facts.Calls {
		facts.Calls[i].RecvType = recvTypeAtLine(facts.Methods, facts.Calls[i].Line)
	}

	return facts, nil
}

func recvTypeAtLine(methods []MethodDecl, line int) string {
	for _, m := range methods {
		if line >= m.Line && line <= m.EndLine {
			return m.RecvType
		}
	}
	return ""
}

func handleGenDecl(g *ast.GenDecl, fset *token.FileSet, facts *FileFacts) {
	switch g.Tok {
	case token.TYPE:
		for _, spec := range g.Specs {
			ts, ok := spec.(*ast.TypeSpec)
			if !ok {
				continue
			}
			td := TypeDecl{Name: ts.Name.Name, Line: fset.Position(ts.Pos()).Line}
			switch t := ts.Type.(type) {
			case *ast.StructType:
				td.Kind = "struct"
				td.Fields = extractStructFields(t)
			case *ast.InterfaceType:
				td.Kind = "interface"
			case *ast.Ident:
				td.Kind = "alias"
				td.Underlying = t.Name
			case *ast.ArrayType:
				td.Kind = "alias"
				td.Underlying = "[]" + typeText(t.Elt)
			case *ast.IndexExpr:
				td.Kind = "alias"
				td.Underlying = typeText(t)
			case *ast.SelectorExpr:
				td.Kind = "alias"
				td.Underlying = typeText(t)
			default:
				td.Kind = "alias"
				td.Underlying = typeText(t)
			}
			facts.Types = append(facts.Types, td)
		}
	case token.CONST:
		// Track the active type across spec lines — Go allows `const ( A Foo = "x"; B = "y" )`
		// where B inherits Foo's type. We split into typed blocks per typeName.
		grouped := map[string]*ConstBlock{}
		untyped := &ConstBlock{}
		lastType := ""
		for _, spec := range g.Specs {
			vs, ok := spec.(*ast.ValueSpec)
			if !ok {
				continue
			}
			typeName := ""
			if vs.Type != nil {
				typeName = typeText(vs.Type)
			}
			if typeName != "" {
				lastType = typeName
			}
			activeType := lastType
			for i, name := range vs.Names {
				val := ""
				if i < len(vs.Values) {
					val = literalText(vs.Values[i])
				}
				line := fset.Position(name.Pos()).Line

				// Error code pattern: identifier starts with "Code" and the active type is ErrorCode
				if strings.HasSuffix(activeType, "ErrorCode") && strings.HasPrefix(name.Name, "Code") {
					facts.ErrorCodes = append(facts.ErrorCodes, ErrorCodeDecl{
						Name: strings.TrimPrefix(name.Name, "Code"),
						Wire: val,
						Line: line,
					})
					continue
				}

				member := ConstMember{Name: name.Name, Value: val, Line: line}
				if activeType == "" {
					untyped.Members = append(untyped.Members, member)
					// Bare string constants — useful for *EventName patterns
					if val != "" {
						facts.StringConsts = append(facts.StringConsts, StringConst{Name: name.Name, Value: val, Line: line})
					}
				} else {
					b, ok := grouped[activeType]
					if !ok {
						b = &ConstBlock{Typed: activeType}
						grouped[activeType] = b
					}
					b.Members = append(b.Members, member)
				}
			}
		}
		if len(untyped.Members) > 0 {
			facts.ConstBlocks = append(facts.ConstBlocks, *untyped)
		}
		for _, b := range grouped {
			facts.ConstBlocks = append(facts.ConstBlocks, *b)
		}
	}
}

func handleFuncDecl(fn *ast.FuncDecl, fset *token.FileSet, facts *FileFacts) {
	if fn.Recv != nil {
		// Capture method with its receiver type and body line range so downstream
		// adapters can scope calls/events per struct (e.g. one Projector per file).
		recvType, recvPtr := decomposeRecv(fn.Recv)
		if recvType == "" {
			return
		}
		startLine := fset.Position(fn.Pos()).Line
		endLine := startLine
		if fn.Body != nil {
			endLine = fset.Position(fn.Body.End()).Line
		}
		m := MethodDecl{
			Name:     fn.Name.Name,
			RecvType: recvType,
			RecvPtr:  recvPtr,
			Line:     startLine,
			EndLine:  endLine,
		}
		if ref := singleReturnSelector(fn); ref != "" {
			m.ReturnRef = ref
		}
		facts.Methods = append(facts.Methods, m)
		return
	}
	d := FuncDecl{Name: fn.Name.Name, Line: fset.Position(fn.Pos()).Line, Params: []FieldDecl{}}
	if fn.Type != nil && fn.Type.Params != nil {
		for _, p := range fn.Type.Params.List {
			pkg, name, ptr := decomposeType(p.Type)
			for _, n := range p.Names {
				d.Params = append(d.Params, FieldDecl{Name: n.Name, Pkg: pkg, Type: name, Pointer: ptr})
			}
			if len(p.Names) == 0 {
				// Unnamed param — record once with empty name
				d.Params = append(d.Params, FieldDecl{Pkg: pkg, Type: name, Pointer: ptr})
			}
		}
	}
	facts.Funcs = append(facts.Funcs, d)
}

// decomposeRecv pulls the underlying struct name from a method receiver.
// Returns ("", false) when the receiver shape is unexpected.
func decomposeRecv(recv *ast.FieldList) (string, bool) {
	if recv == nil || len(recv.List) == 0 {
		return "", false
	}
	t := recv.List[0].Type
	ptr := false
	if star, ok := t.(*ast.StarExpr); ok {
		ptr = true
		t = star.X
	}
	switch x := t.(type) {
	case *ast.Ident:
		return x.Name, ptr
	case *ast.IndexExpr:
		if id, ok := x.X.(*ast.Ident); ok {
			return id.Name, ptr
		}
	case *ast.IndexListExpr:
		if id, ok := x.X.(*ast.Ident); ok {
			return id.Name, ptr
		}
	}
	return "", false
}

// singleReturnSelector recognises the common one-liner pattern
//   func (p *X) EventName() string { return pkg.SOME_CONST }
// and returns "pkg.SOME_CONST". Used to associate projectors with the event
// they subscribe to without scanning the rest of the file.
func singleReturnSelector(fn *ast.FuncDecl) string {
	if fn.Body == nil || len(fn.Body.List) != 1 {
		return ""
	}
	ret, ok := fn.Body.List[0].(*ast.ReturnStmt)
	if !ok || len(ret.Results) != 1 {
		return ""
	}
	switch e := ret.Results[0].(type) {
	case *ast.SelectorExpr:
		if id, ok := e.X.(*ast.Ident); ok {
			return id.Name + "." + e.Sel.Name
		}
	case *ast.Ident:
		return e.Name
	}
	return ""
}

func extractStructFields(s *ast.StructType) []FieldDecl {
	out := []FieldDecl{}
	if s.Fields == nil {
		return out
	}
	for _, f := range s.Fields.List {
		pkg, name, ptr := decomposeType(f.Type)
		if len(f.Names) == 0 {
			out = append(out, FieldDecl{Pkg: pkg, Type: name, Pointer: ptr})
			continue
		}
		for _, n := range f.Names {
			out = append(out, FieldDecl{Name: n.Name, Pkg: pkg, Type: name, Pointer: ptr})
		}
	}
	return out
}

// decomposeType peels *, generics, qualified names. Returns (pkg, baseTypeName, isPointer).
func decomposeType(e ast.Expr) (string, string, bool) {
	ptr := false
	if s, ok := e.(*ast.StarExpr); ok {
		ptr = true
		e = s.X
	}
	// strip generics: T[X] → T
	if ix, ok := e.(*ast.IndexExpr); ok {
		e = ix.X
	}
	if ix, ok := e.(*ast.IndexListExpr); ok {
		e = ix.X
	}
	switch t := e.(type) {
	case *ast.Ident:
		return "", t.Name, ptr
	case *ast.SelectorExpr:
		pkg := ""
		if id, ok := t.X.(*ast.Ident); ok {
			pkg = id.Name
		}
		return pkg, t.Sel.Name, ptr
	}
	return "", typeText(e), ptr
}

func typeText(e ast.Expr) string {
	switch t := e.(type) {
	case *ast.Ident:
		return t.Name
	case *ast.SelectorExpr:
		left := typeText(t.X)
		if left == "" {
			return t.Sel.Name
		}
		return left + "." + t.Sel.Name
	case *ast.StarExpr:
		return "*" + typeText(t.X)
	case *ast.ArrayType:
		return "[]" + typeText(t.Elt)
	case *ast.IndexExpr:
		return typeText(t.X) + "[" + typeText(t.Index) + "]"
	case *ast.MapType:
		return "map[" + typeText(t.Key) + "]" + typeText(t.Value)
	}
	return ""
}

func extractCall(c *ast.CallExpr, fset *token.FileSet) *CallRef {
	ref := CallRef{Line: fset.Position(c.Pos()).Line}
	switch fn := c.Fun.(type) {
	case *ast.Ident:
		ref.Fn = fn.Name
		ref.Callee = fn.Name
	case *ast.SelectorExpr:
		ref.Fn = fn.Sel.Name
		if id, ok := fn.X.(*ast.Ident); ok {
			ref.Pkg = id.Name
		}
		ref.Callee = exprText(fn)
	case *ast.IndexExpr:
		// Generic call: F[T](args). The function part is fn.X
		ref.TypeArgs = []string{typeText(fn.Index)}
		switch inner := fn.X.(type) {
		case *ast.Ident:
			ref.Fn = inner.Name
			ref.Callee = inner.Name
		case *ast.SelectorExpr:
			ref.Fn = inner.Sel.Name
			if id, ok := inner.X.(*ast.Ident); ok {
				ref.Pkg = id.Name
			}
			ref.Callee = exprText(inner)
		}
	case *ast.IndexListExpr:
		args := make([]string, 0, len(fn.Indices))
		for _, ix := range fn.Indices {
			args = append(args, typeText(ix))
		}
		ref.TypeArgs = args
		switch inner := fn.X.(type) {
		case *ast.Ident:
			ref.Fn = inner.Name
			ref.Callee = inner.Name
		case *ast.SelectorExpr:
			ref.Fn = inner.Sel.Name
			if id, ok := inner.X.(*ast.Ident); ok {
				ref.Pkg = id.Name
			}
			ref.Callee = exprText(inner)
		}
	default:
		return nil
	}
	if len(c.Args) > 0 {
		if firstCall, ok := c.Args[0].(*ast.CallExpr); ok {
			switch ff := firstCall.Fun.(type) {
			case *ast.Ident:
				ref.FirstArgCall = ff.Name
			case *ast.SelectorExpr:
				ref.FirstArgCall = ff.Sel.Name
			}
		}
	}
	return &ref
}

// extractControllerMeta inspects a composite literal for the Controller Metadata
// fields (Path, Method, Description, Context, Errors). Returns nil if the literal
// is not a Metadata-shaped object.
func extractControllerMeta(cl *ast.CompositeLit, fset *token.FileSet) *ControllerMeta {
	out := ControllerMeta{Line: fset.Position(cl.Pos()).Line}
	matched := 0
	for _, elt := range cl.Elts {
		kv, ok := elt.(*ast.KeyValueExpr)
		if !ok {
			continue
		}
		keyIdent, ok := kv.Key.(*ast.Ident)
		if !ok {
			continue
		}
		switch keyIdent.Name {
		case "Path":
			out.Path = literalText(kv.Value)
			matched++
		case "Method":
			out.Method = literalText(kv.Value)
			matched++
		case "Description":
			out.Description = literalText(kv.Value)
			matched++
		case "Context":
			out.Context = literalText(kv.Value)
			matched++
		case "Errors":
			if al, ok := kv.Value.(*ast.CompositeLit); ok {
				for _, e := range al.Elts {
					if se, ok := e.(*ast.SelectorExpr); ok && strings.HasPrefix(se.Sel.Name, "Code") {
						out.ErrorCodes = append(out.ErrorCodes, strings.TrimPrefix(se.Sel.Name, "Code"))
					}
					if id, ok := e.(*ast.Ident); ok && strings.HasPrefix(id.Name, "Code") {
						out.ErrorCodes = append(out.ErrorCodes, strings.TrimPrefix(id.Name, "Code"))
					}
				}
				matched++
			}
		}
	}
	if matched < 2 {
		return nil
	}
	return &out
}

func exprText(e ast.Expr) string {
	switch t := e.(type) {
	case *ast.Ident:
		return t.Name
	case *ast.SelectorExpr:
		left := exprText(t.X)
		if left == "" {
			return t.Sel.Name
		}
		return left + "." + t.Sel.Name
	}
	return ""
}

func literalText(e ast.Expr) string {
	if lit, ok := e.(*ast.BasicLit); ok {
		return unquote(lit.Value)
	}
	return ""
}

func unquote(s string) string {
	if len(s) >= 2 && (s[0] == '"' || s[0] == '`') {
		return s[1 : len(s)-1]
	}
	return s
}

func isUpper(b byte) bool {
	return b >= 'A' && b <= 'Z'
}
