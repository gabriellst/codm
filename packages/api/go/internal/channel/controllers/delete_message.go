package controllers

import (
	"net/http"

	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/core-go/errors"
	"template/core-go/pkg/httputil"
	"template/core-go/types"
)

type DeleteMessageRequest struct {
	ChannelID string `from:"body" json:"channelId" validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID  string `from:"body" json:"remoteId"    validate:"required" example:"5511999999999@s.whatsapp.net"`
	MessageID string `from:"body" json:"messageId"    validate:"required" example:"3EB0B430A6B7FBEC1200"`
}

type DeleteMessageController struct {
	handler *usecases.DeleteMessageHandler
}

func NewDeleteMessageController(handler *usecases.DeleteMessageHandler) *DeleteMessageController {
	return &DeleteMessageController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*DeleteMessageController)(nil)

func (c *DeleteMessageController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/delete",
		Method:      "DELETE",
		Description: "Delete a message",
		Tags:        []string{"Messaging"},

		Request:  DeleteMessageRequest{},
		Response: usecases.DeleteMessageOutput{},
		Status:   http.StatusOK,
		Errors:   []errors.ErrorCode{ctxerrors.CodeChannelNotFound, ctxerrors.CodeChannelNotConnected, errors.CodeValidationFailed},
	}
}

func (c *DeleteMessageController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[DeleteMessageRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.DeleteMessageInput{
		ChannelID: req.ChannelID,
		RemoteID:  req.RemoteID,
		MessageID: req.MessageID,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, output)
}
