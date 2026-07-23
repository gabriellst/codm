package controllers

import (
	"net/http"

	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
)

type SendFileRequest struct {
	ChannelID string `from:"body" json:"channelId" validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID  string `from:"body" json:"remoteId"     validate:"required" example:"5511999999999@s.whatsapp.net"`
	MediaURL  string `from:"body" json:"mediaUrl"     validate:"required,url" example:"https://example.com/document.pdf"`
	FileName  string `from:"body" json:"fileName"     validate:"omitempty,max=255" example:"document.pdf"`
	MimeType  string `from:"body" json:"mimeType"     validate:"omitempty,max=127" example:"application/pdf"`
}

type SendFileController struct {
	handler *usecases.SendFileHandler
}

func NewSendFileController(handler *usecases.SendFileHandler) *SendFileController {
	return &SendFileController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*SendFileController)(nil)

func (c *SendFileController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/file",
		Method:      "POST",
		Description: "Send a file/document message",
		Tags:        []string{"Messaging"},

		Request:  SendFileRequest{},
		Response: usecases.SendFileOutput{},
		Status:   http.StatusCreated,
	}
}

func (c *SendFileController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[SendFileRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.SendFileInput{
		ChannelID: req.ChannelID,
		RemoteID:  req.RemoteID,
		MediaURL:  req.MediaURL,
		FileName:  req.FileName,
		MimeType:  req.MimeType,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusCreated, output)
}
