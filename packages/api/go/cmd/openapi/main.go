// openapi is a spec-first emitter that walks the channel Go backend
// and produces an OpenAPI 3.1 document to a configured output path.
//
// Design: .specs/2026-04-15-sdk-spec-first-design.md §5.
//
//	go run ./cmd/openapi -out public/docs/openapi.json
package main

import (
	"flag"
	"fmt"
	"os"

	"template/api-go/pkg/openapi"
)

func main() {
	out := flag.String("out", "public/docs/openapi.json", "output path for openapi.json")
	root := flag.String("root", ".", "channel module root (where go.mod lives)")
	flag.Parse()

	if err := openapi.Generate(*root, *out); err != nil {
		fmt.Fprintf(os.Stderr, "openapi: %v\n", err)
		os.Exit(1)
	}
	fmt.Fprintf(os.Stderr, "openapi: wrote %s\n", *out)
}
