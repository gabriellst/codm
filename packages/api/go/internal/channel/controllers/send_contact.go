package controllers

import (
	"net/http"

	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
)

type SendContactRequest struct {
	ChannelID string                 `from:"body" json:"channelId" validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID  string                 `from:"body" json:"remoteId"     validate:"required" example:"5511999999999@s.whatsapp.net"`
	Contacts  []usecases.ContactInfo `from:"body" json:"contacts"     validate:"required,min=1,dive"`
}

type SendContactController struct {
	handler *usecases.SendContactHandler
}

func NewSendContactController(handler *usecases.SendContactHandler) *SendContactController {
	return &SendContactController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*SendContactController)(nil)

func (c *SendContactController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/contact",
		Method:      "POST",
		Description: "Send a contact card message",
		Tags:        []string{"Messaging"},

		Request:  SendContactRequest{},
		Response: usecases.SendContactOutput{},
		Status:   http.StatusCreated,
	}
}

func (c *SendContactController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[SendContactRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.SendContactInput{
		ChannelID: req.ChannelID,
		RemoteID:  req.RemoteID,
		Contacts:  req.Contacts,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusCreated, output)
}
