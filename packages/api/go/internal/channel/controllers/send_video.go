package controllers

import (
	"net/http"

	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/core-go/errors"
	"template/core-go/pkg/httputil"
	"template/core-go/types"
)

type SendVideoRequest struct {
	ChannelID string `from:"body" json:"channelId" validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID  string `from:"body" json:"remoteId"     validate:"required" example:"5511999999999@s.whatsapp.net"`
	MediaURL  string `from:"body" json:"mediaUrl"     validate:"required,url" example:"https://example.com/video.mp4"`
	Caption   string `from:"body" json:"caption"      validate:"omitempty,max=1024" example:"Watch this video"`
}

type SendVideoController struct {
	handler *usecases.SendVideoHandler
}

func NewSendVideoController(handler *usecases.SendVideoHandler) *SendVideoController {
	return &SendVideoController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*SendVideoController)(nil)

func (c *SendVideoController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/video",
		Method:      "POST",
		Description: "Send a video message",
		Tags:        []string{"Messaging"},

		Request:  SendVideoRequest{},
		Response: usecases.SendVideoOutput{},
		Status:   http.StatusCreated,
		Errors:   []errors.ErrorCode{ctxerrors.CodeChannelNotFound, ctxerrors.CodeChannelNotConnected, errors.CodeValidationFailed},
	}
}

func (c *SendVideoController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[SendVideoRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.SendVideoInput{
		ChannelID: req.ChannelID,
		RemoteID:  req.RemoteID,
		MediaURL:  req.MediaURL,
		Caption:   req.Caption,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusCreated, output)
}
