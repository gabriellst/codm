// cmd/emit-openapi — offline OpenAPI emitter for api-go.
//
// Delegates to packages/api/go/core/pkg/openapi.Generate which walks the
// service via go/packages, discovers controllers, and emits OpenAPI 3.0.3.
//
// Output: packages/api/go/public/openapi.json
//
// Usage:
//
//	go run ./cmd/emit-openapi
//	# or via Nx:
//	bun nx run api-go:emit-openapi
package main

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"template/core-go/pkg/openapi"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	outPath := filepath.Join("public", "openapi.json")
	if err := openapi.Generate(".", outPath); err != nil {
		slog.Error("emit-openapi failed", "err", err)
		os.Exit(1)
	}

	info, err := os.Stat(outPath)
	if err != nil {
		slog.Error("stat output", "err", err)
		os.Exit(1)
	}
	slog.Info("wrote openapi.json", "path", outPath, "bytes", info.Size())
	fmt.Printf("Wrote %d bytes to %s\n", info.Size(), outPath)
}
