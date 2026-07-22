package controllers

import (
	"template/api-go/internal/channel/usecases"
	sharedenums "template/api-go/internal/shared/enums"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
	"net/http"
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

func (c *CreateWhatsAppChannelController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/channels/whatsapp",
		Method:      "POST",
		Description: "Create a new WhatsApp channel",
		Tags:        []string{"Channel"},
	
		Request:     CreateWhatsAppChannelRequest{},
		Response:    usecases.CreateChannelOutput{},
		Status:      http.StatusCreated,
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
		Platform: sharedenums.PlatformWhatsApp,
		OwnerID: req.OwnerID,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusCreated, output)
}
