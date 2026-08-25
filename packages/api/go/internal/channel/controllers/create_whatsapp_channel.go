package controllers

import (
	"net/http"
	"template/api-go/internal/channel/enums"
	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/core-go/errors"
	"template/core-go/pkg/httputil"
	"template/core-go/types"
)

type CreateWhatsAppChannelRequest struct {
	Name    string `from:"body" json:"name" validate:"required,min=1,max=100" example:"My WhatsApp"`
	OwnerID string `from:"header" name:"X-Owner-Id" validate:"required,uuid" swaggerignore:"true"`
}

type CreateWhatsAppChannelController struct {
	handler *usecases.CreateChannelHandler
}

func NewCreateWhatsAppChannelController(handler *usecases.CreateChannelHandler) *CreateWhatsAppChannelController {
	return &CreateWhatsAppChannelController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*CreateWhatsAppChannelController)(nil)

func (c *CreateWhatsAppChannelController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/channels/whatsapp",
		Method:      "POST",
		Description: "Create a new WhatsApp channel",
		Tags:        []string{"Channel"},

		Request:  CreateWhatsAppChannelRequest{},
		Response: usecases.CreateChannelOutput{},
		Status:   http.StatusCreated,
		Errors:   []errors.ErrorCode{ctxerrors.CodeChannelNameAlreadyExists, errors.CodeValidationFailed},
	}
}

func (c *CreateWhatsAppChannelController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[CreateWhatsAppChannelRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.CreateChannelInput{
		Name:     req.Name,
		Platform: enums.PlatformWhatsApp,
		OwnerID:  req.OwnerID,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusCreated, output)
}
