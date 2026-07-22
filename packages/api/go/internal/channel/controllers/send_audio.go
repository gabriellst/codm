package controllers

import (
	"net/http"

	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
)

type SendAudioRequest struct {
	ChannelID string `from:"body" json:"channelId" validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID     string `from:"body" json:"remoteId"     validate:"required" example:"5511999999999@s.whatsapp.net"`
	AudioURL     string `from:"body" json:"audioUrl"     validate:"required,url" example:"https://example.com/audio.ogg"`
}

type SendAudioController struct {
	handler *usecases.SendAudioHandler
}

func NewSendAudioController(handler *usecases.SendAudioHandler) *SendAudioController {
	return &SendAudioController{handler: handler}
}

func (c *SendAudioController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/audio",
		Method:      "POST",
		Description: "Send an audio message",
		Tags:        []string{"Messaging"},
	
		Request:     SendAudioRequest{},
		Response:    usecases.SendAudioOutput{},
		Status:      http.StatusCreated,
	}
}

func (c *SendAudioController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[SendAudioRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.SendAudioInput{
		ChannelID: req.ChannelID,
		RemoteID:     req.RemoteID,
		AudioURL:     req.AudioURL,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusCreated, output)
}
