package controllers

import (
	"net/http"

	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/core-go/errors"
	"template/core-go/pkg/httputil"
	"template/core-go/types"
)

type SendAudioRequest struct {
	ChannelID string `from:"body" json:"channelId" validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID  string `from:"body" json:"remoteId"     validate:"required" example:"5511999999999@s.whatsapp.net"`
	AudioURL  string `from:"body" json:"audioUrl,omitempty"     validate:"required_without=MediaPath,excluded_with=MediaPath,omitempty,url" example:"https://example.com/audio.ogg"`
	MediaPath string `from:"body" json:"mediaPath,omitempty"    validate:"required_without=AudioURL,excluded_with=AudioURL" example:"/data/media/ab12cd34.ogg"`
}

type SendAudioController struct {
	handler *usecases.SendAudioHandler
}

func NewSendAudioController(handler *usecases.SendAudioHandler) *SendAudioController {
	return &SendAudioController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*SendAudioController)(nil)

func (c *SendAudioController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/audio",
		Method:      "POST",
		Description: "Send an audio message",
		Tags:        []string{"Messaging"},

		Request:  SendAudioRequest{},
		Response: usecases.SendAudioOutput{},
		Status:   http.StatusCreated,
		Errors:   []errors.ErrorCode{ctxerrors.CodeChannelNotFound, ctxerrors.CodeChannelNotConnected, ctxerrors.CodeMediaPathNotAllowed, errors.CodeValidationFailed},
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
		RemoteID:  req.RemoteID,
		AudioURL:  req.AudioURL,
		MediaPath: req.MediaPath,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusCreated, output)
}
