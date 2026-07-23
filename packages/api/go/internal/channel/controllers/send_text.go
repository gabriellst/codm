package controllers

import (
	"net/http"

	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/errors"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
)

type SendTextRequest struct {
	ChannelID       string `from:"body" json:"channelId"      validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID        string `from:"body" json:"remoteId"          validate:"required" example:"5511999999999@s.whatsapp.net"`
	Text            string `from:"body" json:"text"            validate:"required,min=1" example:"Hello, world!"`
	QuotedMessageID string `from:"body" json:"quotedMessageId" validate:"omitempty" example:"3EB0B430A6B7FBEC1200"`
}

type SendTextController struct {
	handler *usecases.SendTextHandler
}

func NewSendTextController(handler *usecases.SendTextHandler) *SendTextController {
	return &SendTextController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*SendTextController)(nil)

func (c *SendTextController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/text",
		Method:      "POST",
		Description: "Send a text message",
		Tags:        []string{"Messaging"},

		Request:  SendTextRequest{},
		Response: usecases.SendTextOutput{},
		Status:   http.StatusCreated,
		Errors:   []errors.ErrorCode{ctxerrors.CodeChannelNotFound, ctxerrors.CodeChannelNotConnected, errors.CodeValidationFailed},
	}
}

func (c *SendTextController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[SendTextRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.SendTextInput{
		ChannelID:       req.ChannelID,
		RemoteID:        req.RemoteID,
		Text:            req.Text,
		QuotedMessageID: req.QuotedMessageID,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusCreated, output)
}
