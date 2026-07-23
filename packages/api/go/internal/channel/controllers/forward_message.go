package controllers

import (
	"net/http"

	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
)

type ForwardMessageRequest struct {
	ChannelID      string `from:"body" json:"channelId"  validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID       string `from:"body" json:"remoteId"       validate:"required" example:"5511888888888@s.whatsapp.net"`
	SourceRemoteID string `from:"body" json:"sourceRemoteId" validate:"required" example:"5511999999999@s.whatsapp.net"`
	MessageID      string `from:"body" json:"messageId"      validate:"required" example:"3EB0B430A6B7FBEC1200"`
}

type ForwardMessageController struct {
	handler *usecases.ForwardMessageHandler
}

func NewForwardMessageController(handler *usecases.ForwardMessageHandler) *ForwardMessageController {
	return &ForwardMessageController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*ForwardMessageController)(nil)

func (c *ForwardMessageController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/forward",
		Method:      "POST",
		Description: "Forward a message to another chat",
		Tags:        []string{"Messaging"},

		Request:  ForwardMessageRequest{},
		Response: usecases.ForwardMessageOutput{},
		Status:   http.StatusCreated,
	}
}

func (c *ForwardMessageController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[ForwardMessageRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.ForwardMessageInput{
		ChannelID:      req.ChannelID,
		RemoteID:       req.RemoteID,
		SourceRemoteID: req.SourceRemoteID,
		MessageID:      req.MessageID,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusCreated, output)
}
