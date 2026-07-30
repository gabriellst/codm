package httprouter

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"template/core-go/config"
	"template/core-go/types"
)

type stubController struct{ meta types.ControllerMetadata }

func (c *stubController) Metadata() types.ControllerMetadata { return c.meta }
func (c *stubController) Handle(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"ok":true}`))
}

// denyAll é o proxy do par Session→APIKey que internal/shared contribui ao grupo
// app_middlewares: um middleware GLOBAL que barra requisições sem credencial.
func denyAll(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	})
}

func TestGlobalMiddlewaresApplyToOrdinaryControllers(t *testing.T) {
	r := NewHttpRouter(&config.Config{})
	r.Use(denyAll)
	r.RegisterControllers([]types.Controller{
		&stubController{meta: types.ControllerMetadata{Path: "/ordinary", Method: "GET"}},
	})

	rec := httptest.NewRecorder()
	r.Handler().ServeHTTP(rec, httptest.NewRequest("GET", "/api/ordinary", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("rota comum deveria passar pela cadeia global: got %d, want 401", rec.Code)
	}
}

func TestPublicControllerBypassesGlobalMiddlewares(t *testing.T) {
	r := NewHttpRouter(&config.Config{})
	r.Use(denyAll)
	r.RegisterControllers([]types.Controller{
		&stubController{meta: types.ControllerMetadata{Path: "/health", Method: "GET", Public: true}},
	})

	rec := httptest.NewRecorder()
	r.Handler().ServeHTTP(rec, httptest.NewRequest("GET", "/api/health", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("rota publica nao pode ser barrada pela cadeia global: got %d, want 200", rec.Code)
	}
}

func TestPublicStillAppliesControllerOwnMiddlewares(t *testing.T) {
	// Public dispensa a cadeia GLOBAL, nunca a que o proprio controller declara.
	r := NewHttpRouter(&config.Config{})
	r.RegisterControllers([]types.Controller{
		&stubController{meta: types.ControllerMetadata{
			Path: "/health", Method: "GET", Public: true, Middlewares: []types.Middleware{denyAll},
		}},
	})
	rec := httptest.NewRecorder()
	r.Handler().ServeHTTP(rec, httptest.NewRequest("GET", "/api/health", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("middleware do proprio controller deve rodar mesmo em rota publica: got %d", rec.Code)
	}
}
