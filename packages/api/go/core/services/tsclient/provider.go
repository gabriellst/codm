// Package tsclient provides the generated Go→TS API client, wired with the
// service-to-service auth header. Reusable for any future Go→TS call.
package tsclient

import (
	"net/http"

	tsclientgen "template/client-go/pkg/typescript"
	"template/core-go/config"
)

// serviceKeyTransport injects the shared S2S key header on every outbound request.
type serviceKeyTransport struct {
	key  string
	base http.RoundTripper
}

func (t *serviceKeyTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if t.key != "" {
		req.Header.Set("x-internal-service-key", t.key)
	}
	base := t.base
	if base == nil {
		base = http.DefaultTransport
	}
	return base.RoundTrip(req)
}

// NewClient builds the TypeScript API client pointed at the TS API, with
// the S2S key attached. fx provides it for any consumer (e.g. the sync trigger).
func NewClient(cfg *config.Config) (*tsclientgen.ClientWithResponses, error) {
	hc := &http.Client{Transport: &serviceKeyTransport{key: cfg.InternalServiceKey, base: http.DefaultTransport}}
	return tsclientgen.NewClientWithResponses(cfg.TypescriptAPIURL, tsclientgen.WithHTTPClient(hc))
}
