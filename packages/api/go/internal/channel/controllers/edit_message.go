package controllers

import (
	"net/http"

	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/errors"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
)

type EditMessageRequest struct {
	ChannelID string `from:"body" json:"channelId" validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID  string `from:"body" json:"remoteId"    validate:"required" example:"5511999999999@s.whatsapp.net"`
	MessageID string `from:"body" json:"messageId"    validate:"required" example:"3EB0B430A6B7FBEC1200"`
	Text      string `from:"body" json:"text"         validate:"required,min=1" example:"Edited message text"`
}

type EditMessageController struct {
	handler *usecases.EditMessageHandler
}

func NewEditMessageController(handler *usecases.EditMessageHandler) *EditMessageController {
	return &EditMessageController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*EditMessageController)(nil)

func (c *EditMessageController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/edit",
		Method:      "PUT",
		Description: "Edit an existing message",
		Tags:        []string{"Messaging"},

		Request:  EditMessageRequest{},
		Response: usecases.EditMessageOutput{},
		Status:   http.StatusOK,
		Errors:   []errors.ErrorCode{ctxerrors.CodeChannelNotFound, ctxerrors.CodeChannelNotConnected, errors.CodeValidationFailed},
	}
}

func (c *EditMessageController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[EditMessageRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.EditMessageInput{
		ChannelID: req.ChannelID,
		RemoteID:  req.RemoteID,
		MessageID: req.MessageID,
		Text:      req.Text,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, output)
}
