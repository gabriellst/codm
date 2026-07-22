package public

import "embed"

//go:embed docs/openapi.json
var OpenAPIJSON []byte

//go:embed all:app
var AppFS embed.FS
