package controllers

import (
	"net/http"

	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
)

type SendStickerRequest struct {
	ChannelID  string `from:"body" json:"channelId" validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID   string `from:"body" json:"remoteId"     validate:"required" example:"5511999999999@s.whatsapp.net"`
	StickerURL string `from:"body" json:"stickerUrl"   validate:"required,url" example:"https://example.com/sticker.webp"`
}

type SendStickerController struct {
	handler *usecases.SendStickerHandler
}

func NewSendStickerController(handler *usecases.SendStickerHandler) *SendStickerController {
	return &SendStickerController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*SendStickerController)(nil)

func (c *SendStickerController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/sticker",
		Method:      "POST",
		Description: "Send a sticker message",
		Tags:        []string{"Messaging"},

		Request:  SendStickerRequest{},
		Response: usecases.SendStickerOutput{},
		Status:   http.StatusCreated,
	}
}

func (c *SendStickerController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[SendStickerRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.SendStickerInput{
		ChannelID:  req.ChannelID,
		RemoteID:   req.RemoteID,
		StickerURL: req.StickerURL,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusCreated, output)
}
