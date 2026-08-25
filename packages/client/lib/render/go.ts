import { goPackageIdent, goFieldName } from '../sanitize'
import type { ApiSource } from '../discover'

export interface ServiceMeta {
	source: ApiSource
}

export function renderAggregateClientGo(metas: ServiceMeta[]): string {
	const imports = metas
		.map(m => {
			const pkg = goPackageIdent(m.source.service)
			return `\t${pkg} "template/client-go/pkg/${m.source.service}"`
		})
		.join('\n')

	const configFields = metas.map(m => `\t${goFieldName(m.source.service)}URL string`).join('\n')

	const fields = metas.map(m => `\t${goFieldName(m.source.service)} *${goPackageIdent(m.source.service)}.ClientWithResponses`).join('\n')

	const inits = metas
		.map(m => {
			const pkg = goPackageIdent(m.source.service)
			const field = goFieldName(m.source.service)
			// Use pkg ident (which escapes reserved words) as the local variable name.
			const localVar = pkg
			return `\t${localVar}, err := ${pkg}.NewClientWithResponses(cfg.${field}URL, ${pkg}.WithHTTPClient(httpClient))\n\tif err != nil { return nil, err }`
		})
		.join('\n')

	const assigns = metas.map(m => `\t\t${goFieldName(m.source.service)}: ${goPackageIdent(m.source.service)},`).join('\n')

	return `// AUTO-GENERATED — do not edit.
package client

import (
	"net/http"

${imports}
)

type Config struct {
${configFields}
	HTTPClient *http.Client
}

type Client struct {
${fields}
}

func New(cfg Config) (*Client, error) {
	httpClient := cfg.HTTPClient
	if httpClient == nil { httpClient = http.DefaultClient }
${inits}
	return &Client{
${assigns}
	}, nil
}
`
}
