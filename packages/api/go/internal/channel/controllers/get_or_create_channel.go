package controllers

import (
	"net/http"
	"template/api-go/internal/channel/usecases"
	sharedenums "template/api-go/internal/shared/enums"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
)

type GetOrCreateChannelRequest struct {
	Platform sharedenums.Platform `from:"query" name:"platform" validate:"required,oneof=WHATSAPP" example:"WHATSAPP"`
	OwnerID  string               `from:"header" name:"X-Owner-Id" validate:"required,uuid" swaggerignore:"true"`
}

type GetOrCreateChannelController struct {
	handler *usecases.GetOrCreateChannelHandler
}

func NewGetOrCreateChannelController(handler *usecases.GetOrCreateChannelHandler) *GetOrCreateChannelController {
	return &GetOrCreateChannelController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*GetOrCreateChannelController)(nil)

func (c *GetOrCreateChannelController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/channels/resolve",
		Method:      "GET",
		Description: "Get or create channel for current tenant and platform",
		Tags:        []string{"Channel"},

		Request:  GetOrCreateChannelRequest{},
		Response: usecases.GetOrCreateChannelOutput{},
		Status:   http.StatusOK,
	}
}

// Owner ID is resolved from session cookie automatically
func (c *GetOrCreateChannelController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[GetOrCreateChannelRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.GetOrCreateChannelInput{
		Platform: req.Platform,
		OwnerID:  req.OwnerID,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, output)
}
