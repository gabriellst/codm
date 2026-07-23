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

type SendMediaRequest struct {
	ChannelID string            `from:"body" json:"channelId" validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID  string            `from:"body" json:"remoteId"     validate:"required" example:"5511999999999@s.whatsapp.net"`
	MediaType enums.MessageType `from:"body" json:"mediaType"    validate:"required,oneof=IMAGE VIDEO DOCUMENT" example:"IMAGE"`
	MediaURL  string            `from:"body" json:"mediaUrl"     validate:"required,url" example:"https://example.com/image.png"`
	Caption   string            `from:"body" json:"caption"      validate:"omitempty,max=1024" example:"Check this out"`
	FileName  string            `from:"body" json:"fileName"     validate:"omitempty,max=255" example:"document.pdf"`
}

type SendMediaController struct {
	handler *usecases.SendMediaHandler
}

func NewSendMediaController(handler *usecases.SendMediaHandler) *SendMediaController {
	return &SendMediaController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*SendMediaController)(nil)

func (c *SendMediaController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/media",
		Method:      "POST",
		Description: "Send a media message",
		Tags:        []string{"Messaging"},

		Request:  SendMediaRequest{},
		Response: usecases.SendMediaOutput{},
		Status:   http.StatusCreated,
		Errors:   []errors.ErrorCode{ctxerrors.CodeChannelNotFound, ctxerrors.CodeChannelNotConnected, errors.CodeValidationFailed},
	}
}

func (c *SendMediaController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[SendMediaRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.SendMediaInput{
		ChannelID: req.ChannelID,
		RemoteID:  req.RemoteID,
		MediaType: req.MediaType,
		MediaURL:  req.MediaURL,
		Caption:   req.Caption,
		FileName:  req.FileName,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusCreated, output)
}
