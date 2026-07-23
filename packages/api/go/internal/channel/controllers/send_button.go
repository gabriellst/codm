package controllers

import (
	"net/http"

	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
)

type SendButtonRequest struct {
	ChannelID   string                `from:"body" json:"channelId" validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID    string                `from:"body" json:"remoteId"     validate:"required" example:"5511999999999@s.whatsapp.net"`
	Title       string                `from:"body" json:"title"        validate:"required,max=255" example:"Confirm your order"`
	Description string                `from:"body" json:"description"  validate:"required,max=1024" example:"Would you like to proceed?"`
	Footer      string                `from:"body" json:"footer"       validate:"omitempty,max=60" example:"Reply within 24h"`
	Buttons     []usecases.ButtonItem `from:"body" json:"buttons"      validate:"required,min=1,max=3,dive"`
}

type SendButtonController struct {
	handler *usecases.SendButtonHandler
}

func NewSendButtonController(handler *usecases.SendButtonHandler) *SendButtonController {
	return &SendButtonController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*SendButtonController)(nil)

func (c *SendButtonController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/button",
		Method:      "POST",
		Description: "Send a button message",
		Tags:        []string{"Messaging"},

		Request:  SendButtonRequest{},
		Response: usecases.SendButtonOutput{},
		Status:   http.StatusCreated,
	}
}

func (c *SendButtonController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[SendButtonRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.SendButtonInput{
		ChannelID:   req.ChannelID,
		RemoteID:    req.RemoteID,
		Title:       req.Title,
		Description: req.Description,
		Footer:      req.Footer,
		Buttons:     req.Buttons,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusCreated, output)
}
