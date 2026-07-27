// Package testseam holds the gateway's TEST-ONLY HTTP ingress.
//
// WHY IT IS NOT IN controllers/. The Go OpenAPI emitter is spec-first and STATIC: pkg/openapi
// walks `./internal/...` with packages.Load and registers every operation whose package path
// contains "/controllers" (walker.go:106). It does not read the fx graph, so gating the fx
// provider with a config flag has ZERO effect on emission. A test-only route inside controllers/
// would land in public/docs/openapi.json, and from there in the COMMITTED SDK under
// packages/client/dist/typescript/src/go/ — failing scripts/check-generated.ts on drift and
// leaking a test surface into the public client. Living one package over is what keeps it out,
// structurally rather than by convention: runtime registration reads the injected
// []types.Controller slice and never looks at package paths (http_router.go:44-56).
package testseam

import (
	"net/http"

	"github.com/google/uuid"

	"template/api-go/internal/channel/enums"
	ctxevents "template/api-go/internal/channel/events"
	"template/core-go/errors"
	"template/core-go/pkg/httputil"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// TestIngressRequest mirrors the header contract of the eleven real channel controllers: they all
// require X-Owner-Id (from:"header", validate:"required,uuid"), and the gateway only stamps that
// header itself when a session cookie is present — which a smoke client does not have. Diverging
// here would just move the 4xx somewhere less obvious.
type TestIngressRequest struct {
	ChannelID string `from:"body" json:"channelId" validate:"required,uuid"`
	OwnerID   string `from:"header" name:"X-Owner-Id" validate:"required,uuid" swaggerignore:"true"`
}

// TestIngressController is the seam that lets an UNATTENDED run reach the CONNECTED literal.
//
// In production the only producer of channel.gateway_connected is the whatsmeow pairing mapper
// (services/gateway/whatsapp/mapper/connected.go), which needs a QR scanned on a phone. Everything
// the gateway can do on its own stops at CONNECTING (usecases/connect_channel.go persistConnecting).
// So without this, the acceptance criterion is not "failing" — it is unreachable.
//
// IT WRITES NOTHING ITSELF. It raises the domain event and hands it to the internal mediator; from
// there it is untouched production code that works: handlers/channel_connected_handler.go →
// uow.Execute → repo.Find → inst.SetConnected(...) (the ENTITY method, entities/channel.go) →
// repo.Save → INSERT ... ON CONFLICT with version = version + 1, plus the shared_events/outbox
// append. A direct SQL INSERT from a test would prove that SQLite works, not that the gateway and
// the daemon share a store.
//
// Dispatch, NOT Publish. Publish queues on a channel (internal_mediator.go); Dispatch runs the
// handlers on the caller's goroutine and returns the first error, so the HTTP response comes back
// only AFTER the commit — no sleep, no polling, and a handler failure is a 5xx instead of a silent
// green. (The verdict still belongs to the ROW, not to this status code: Dispatch fans out to two
// handlers registered on this event and returns on the first error, so a non-2xx can mean either
// "nothing was written" or "written, then a later handler failed".)
type TestIngressController struct {
	mediator mediator.InternalMediator
}

func NewTestIngressController(m mediator.InternalMediator) *TestIngressController {
	return &TestIngressController{mediator: m}
}

// compile-time interface check.
var _ types.Controller = (*TestIngressController)(nil)

func (c *TestIngressController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/channels/_test/gateway",
		Method:      "POST",
		Description: "TEST-ONLY: raise channel.gateway_connected through the gateway's own production chain",
		Tags:        []string{"Channel"},

		Request: TestIngressRequest{},
		Status:  http.StatusNoContent,
		Errors:  []errors.ErrorCode{errors.CodeValidationFailed},
	}
}

func (c *TestIngressController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[TestIngressRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	channelUUID, err := uuid.Parse(req.ChannelID)
	if err != nil {
		httputil.RespondError(w, errors.NewBaseError(errors.CodeValidationFailed, "channelId must be a uuid"))
		return
	}

	if err := c.mediator.Dispatch(r.Context(), ctxevents.NewGatewayConnectedEvent(
		channelUUID,
		req.OwnerID,
		ctxevents.GatewayConnectedPayload{
			ChannelID: channelUUID,
			Platform:  string(enums.PlatformWhatsApp),
			OwnerID:   req.OwnerID,
		},
	)); err != nil {
		httputil.RespondError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
