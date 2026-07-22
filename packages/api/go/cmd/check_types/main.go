package main

import (
	"fmt"
	"go/types"
	"sort"
	"strings"

	"golang.org/x/tools/go/packages"
)

func main() {
	cfg := &packages.Config{
		Mode: packages.NeedName |
			packages.NeedFiles |
			packages.NeedSyntax |
			packages.NeedTypes |
			packages.NeedTypesInfo |
			packages.NeedDeps |
			packages.NeedImports |
			packages.NeedModule,
		Tests: false,
	}

	pkgs, err := packages.Load(cfg, "template/api-go/internal/shared/events")
	if err != nil {
		fmt.Printf("load err: %v\n", err)
		return
	}

	if len(pkgs) == 0 {
		fmt.Println("no packages loaded")
		return
	}

	pkg := pkgs[0]
	if pkg.Types == nil {
		fmt.Println("nil types")
		return
	}

	scope := pkg.Types.Scope()
	names := scope.Names()
	sort.Strings(names)
	for _, name := range names {
		if !strings.HasSuffix(name, "Event") || strings.HasSuffix(name, "EventName") {
			continue
		}
		obj := scope.Lookup(name)
		fmt.Printf("%s: %T\n", name, obj)

		if tn, ok := obj.(*types.TypeName); ok {
			t := tn.Type()
			fmt.Printf("  IsAlias: %v\n", tn.IsAlias())
			fmt.Printf("  Type: %s\n", t.String())

			// Try Named (Go generics)
			if named, ok := t.(*types.Named); ok {
				fmt.Printf("  Named TypeArgs: %d\n", named.TypeArgs().Len())
				for i := 0; i < named.TypeArgs().Len(); i++ {
					arg := named.TypeArgs().At(i)
					fmt.Printf("  Arg[%d]: %T -> %s\n", i, arg, arg.String())
					if argNamed, ok := arg.(*types.Named); ok {
						fmt.Printf("    Arg named: %s\n", argNamed.Obj().Name())
					}
				}
			}
		}
		fmt.Println()
	}
}
