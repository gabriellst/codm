// AUTO-GENERATED — do not edit.
package client

import (
	"net/http"

	gopkg "template/client-go/pkg/go"
	typescript "template/client-go/pkg/typescript"
)

type Config struct {
	GoURL string
	TypescriptURL string
	HTTPClient *http.Client
}

type Client struct {
	Go *gopkg.ClientWithResponses
	Typescript *typescript.ClientWithResponses
}

func New(cfg Config) (*Client, error) {
	httpClient := cfg.HTTPClient
	if httpClient == nil { httpClient = http.DefaultClient }
	gopkg, err := gopkg.NewClientWithResponses(cfg.GoURL, gopkg.WithHTTPClient(httpClient))
	if err != nil { return nil, err }
	typescript, err := typescript.NewClientWithResponses(cfg.TypescriptURL, typescript.WithHTTPClient(httpClient))
	if err != nil { return nil, err }
	return &Client{
		Go: gopkg,
		Typescript: typescript,
	}, nil
}
