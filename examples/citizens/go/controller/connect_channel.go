// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/channel/controllers/connect_channel.go
// Harvested verbatim for the controller skill exemplar set — do not edit; re-harvest instead.
package controllers

import (
	"net/http"

	"monorepo/api/internal/channel/usecases"
	"monorepo/api/internal/shared/types"
	"monorepo/api/pkg/httputil"
)

type ConnectChannelRequest struct {
	ID string `from:"param" name:"id" validate:"required,uuid"`
}

type ConnectChannelController struct {
	handler *usecases.ConnectChannelHandler
}

func NewConnectChannelController(handler *usecases.ConnectChannelHandler) *ConnectChannelController {
	return &ConnectChannelController{handler: handler}
}

func (c *ConnectChannelController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/channels/{id}/connect",
		Method:      "POST",
		Description: "Connect channel (returns QR code)",
		Tags:        []string{"Channel"},
	
		Request:     ConnectChannelRequest{},
		Response:    usecases.ConnectChannelOutput{},
		Status:      http.StatusOK,
	}
}

func (c *ConnectChannelController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[ConnectChannelRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.ConnectChannelInput{
		ID: req.ID,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, output)
}
