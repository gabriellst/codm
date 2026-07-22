package tsclient

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestServiceKeyTransport_InjectsHeader(t *testing.T) {
	var got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("x-internal-service-key")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	hc := &http.Client{Transport: &serviceKeyTransport{key: "secret-123", base: http.DefaultTransport}}
	req, _ := http.NewRequest(http.MethodGet, srv.URL, nil)
	if _, err := hc.Do(req); err != nil {
		t.Fatalf("request: %v", err)
	}
	if got != "secret-123" {
		t.Fatalf("header not injected, got %q", got)
	}
}
