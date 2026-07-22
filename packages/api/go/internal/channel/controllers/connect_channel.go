// Package controllers holds the channel gateway's HTTP ports. Every route is
// guarded by the api-key middleware (service-to-service). The gateway is called
// by the TS daemon, never by a browser directly.
package controllers

import (
	"net/http"

	"template/api-go/internal/channel/middlewares"
	"template/api-go/internal/channel/usecases"
	"template/core-go/config"
	"template/core-go/errors"
	"template/core-go/pkg/httputil"
	"template/core-go/types"
)

// ConnectChannelRequest starts or resumes a WhatsApp session. OwnerID is
// optional — the single-operator daemon defaults it to the implicit operator.
type ConnectChannelRequest struct {
	OwnerID string `from:"body" json:"ownerId" validate:"omitempty,uuid"`
}

type ConnectChannelController struct {
	handler *usecases.ConnectChannelHandler
	apiKey  types.Middleware
}

func NewConnectChannelController(handler *usecases.ConnectChannelHandler, cfg *config.Config) *ConnectChannelController {
	return &ConnectChannelController{handler: handler, apiKey: middlewares.APIKey(cfg.GatewayAPIKey)}
}

var _ types.Controller = (*ConnectChannelController)(nil)

func (c *ConnectChannelController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/connect",
		Method:      "POST",
		Description: "Start or resume a WhatsApp channel session (QR pairing or reconnect)",
		Tags:        []string{"Channel"},
		Middlewares: []types.Middleware{c.apiKey},
		Request:     ConnectChannelRequest{},
		Response:    usecases.ConnectChannelOutput{},
		Status:      http.StatusOK,
		Errors:      []errors.ErrorCode{errors.CodeUnauthorized, errors.CodeExternalService},
	}
}

func (c *ConnectChannelController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[ConnectChannelRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	out, err := c.handler.Execute(r.Context(), usecases.ConnectChannelInput{OwnerID: req.OwnerID})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, out)
}
