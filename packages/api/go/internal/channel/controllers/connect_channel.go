package controllers

import (
	"net/http"

	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
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

// compile-time interface check.
var _ types.Controller = (*ConnectChannelController)(nil)

func (c *ConnectChannelController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/channels/{id}/connect",
		Method:      "POST",
		Description: "Connect channel (returns QR code)",
		Tags:        []string{"Channel"},

		Request:  ConnectChannelRequest{},
		Response: usecases.ConnectChannelOutput{},
		Status:   http.StatusOK,
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
