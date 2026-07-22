package controllers

import (
	"net/http"
	msgenums "template/api-go/internal/channel/enums"
	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
)

type SendChatPresenceRequest struct {
	ChannelID string                     `from:"body" json:"channelId" validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID     string                     `from:"body" json:"remoteId"    validate:"required" example:"5511999999999@s.whatsapp.net"`
	Presence     msgenums.ChatPresenceType  `from:"body" json:"presence"     validate:"required,oneof=composing recording paused" example:"composing"`
}

type SendChatPresenceController struct {
	handler *usecases.SendChatPresenceHandler
}

func NewSendChatPresenceController(handler *usecases.SendChatPresenceHandler) *SendChatPresenceController {
	return &SendChatPresenceController{handler: handler}
}

func (c *SendChatPresenceController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/presence",
		Method:      "POST",
		Description: "Send chat presence indicator",
		Tags:        []string{"Messaging"},
	
		Request:     SendChatPresenceRequest{},
		Response:    usecases.SendChatPresenceOutput{},
		Status:      http.StatusOK,
	}
}

func (c *SendChatPresenceController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[SendChatPresenceRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.SendChatPresenceInput{
		ChannelID: req.ChannelID,
		RemoteID:    req.RemoteID,
		Presence:     req.Presence,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, output)
}
