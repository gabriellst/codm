package controllers

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"time"

	"template/core-go/pkg/httputil"
	"template/core-go/types"
)

// HealthComponent é o veredito de UM componente. Espelha, campo a campo, o shape que o daemon TS
// publica em /v1/health — os dois backends respondem a mesma pergunta com a mesma forma, e um
// painel de diagnóstico futuro consome as duas sem tradutor.
type HealthComponent struct {
	Status string `json:"status"`
	// Gate=true reprova a prontidão. Gate=false é diagnóstico e NUNCA muda o código HTTP.
	Gate   bool   `json:"gate"`
	Detail string `json:"detail,omitempty"`
}

type HealthOutput struct {
	Status     string                     `json:"status"`
	Components map[string]HealthComponent `json:"components"`
}

// HealthController — o gêmeo Go do /v1/health do daemon.
//
// PÚBLICO por Metadata().Public: a cadeia global que internal/shared contribui (Session → APIKey)
// barraria o supervisor da shell quando CHANNEL_GLOBAL_API_KEY estiver setado, e "o app nunca abre
// porque a rota que diz se ele abriu exige credencial" é fail-closed pela razão errada. A rota que
// o supervisor pinga hoje (/api/openapi.json) já escapa da cadeia — por registrar direto no mux,
// que não é um mecanismo. Public é o mecanismo.
type HealthController struct {
	db *sql.DB
}

func NewHealthController(db *sql.DB) *HealthController {
	return &HealthController{db: db}
}

// compile-time interface check.
var _ types.Controller = (*HealthController)(nil)

func (c *HealthController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "",
		Path:        "/health",
		Method:      "GET",
		Description: "Readiness do gateway: o SQLite compartilhado responde (canal WhatsApp entra só como diagnóstico)",
		Tags:        []string{"Health"},
		Public:      true,

		Response: HealthOutput{},
		Status:   http.StatusOK,
	}
}

func (c *HealthController) Handle(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	components := map[string]HealthComponent{
		"db":      c.checkDB(ctx),
		"channel": c.channelDiagnostic(ctx),
	}

	ready := true
	for _, component := range components {
		if component.Gate && component.Status != "up" {
			ready = false
		}
	}

	status := http.StatusOK
	label := "ok"
	if !ready {
		status = http.StatusServiceUnavailable
		label = "not_ready"
	}
	httputil.RespondJSON(w, status, HealthOutput{Status: label, Components: components})
}

// GATE — o SQLite compartilhado (o MESMO arquivo que o daemon TS abre) aceita uma leitura.
func (c *HealthController) checkDB(ctx context.Context) HealthComponent {
	var one int
	if err := c.db.QueryRowContext(ctx, "SELECT 1").Scan(&one); err != nil {
		return HealthComponent{Status: "down", Gate: true, Detail: err.Error()}
	}
	return HealthComponent{Status: "up", Gate: true}
}

// DIAGNÓSTICO — nunca gate, e o Status é fixo em "up" de propósito: o WhatsApp conecta PELO app
// (QR na mão do operador), então "desconectado" é o estado normal de um boot limpo. Leitura direta
// da tabela de read-model, sem importar o contexto channel — mesma postura do middleware Session,
// que consulta authentication_sessions por SQL cru a partir de internal/shared.
func (c *HealthController) channelDiagnostic(ctx context.Context) HealthComponent {
	var status string
	err := c.db.QueryRowContext(ctx,
		`SELECT status FROM gateway_channels ORDER BY updated_at DESC LIMIT 1`,
	).Scan(&status)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		return HealthComponent{Status: "up", Gate: false, Detail: "NONE"}
	case err != nil:
		return HealthComponent{Status: "up", Gate: false, Detail: "unreadable: " + err.Error()}
	default:
		return HealthComponent{Status: "up", Gate: false, Detail: status}
	}
}
