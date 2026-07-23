package controllers

import (
	"net/http"

	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/errors"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
)

type SendImageRequest struct {
	ChannelID string   `from:"body" json:"channelId" validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID  string   `from:"body" json:"remoteId"     validate:"required" example:"5511999999999@s.whatsapp.net"`
	MediaURL  string   `from:"body" json:"mediaUrl"     validate:"required,url" example:"https://example.com/image.png"`
	Caption   string   `from:"body" json:"caption"      validate:"omitempty,max=1024" example:"Check this out"`
	Mentioned []string `from:"body" json:"mentioned"    validate:"omitempty" example:"5511999999999"`
}

type SendImageController struct {
	handler *usecases.SendImageHandler
}

func NewSendImageController(handler *usecases.SendImageHandler) *SendImageController {
	return &SendImageController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*SendImageController)(nil)

func (c *SendImageController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/image",
		Method:      "POST",
		Description: "Send an image message",
		Tags:        []string{"Messaging"},

		Request:  SendImageRequest{},
		Response: usecases.SendImageOutput{},
		Status:   http.StatusCreated,
		Errors:   []errors.ErrorCode{ctxerrors.CodeChannelNotFound, ctxerrors.CodeChannelNotConnected, errors.CodeValidationFailed},
	}
}

func (c *SendImageController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[SendImageRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.SendImageInput{
		ChannelID: req.ChannelID,
		RemoteID:  req.RemoteID,
		MediaURL:  req.MediaURL,
		Caption:   req.Caption,
		Mentioned: req.Mentioned,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusCreated, output)
}
