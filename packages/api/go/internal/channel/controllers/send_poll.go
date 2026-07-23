package controllers

import (
	"net/http"

	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/api-go/pkg/httputil"
	"template/core-go/errors"
	"template/core-go/types"
)

type SendPollRequest struct {
	ChannelID       string                `from:"body" json:"channelId"      validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID        string                `from:"body" json:"remoteId"        validate:"required" example:"5511999999999@s.whatsapp.net"`
	PollName        string                `from:"body" json:"pollName"        validate:"required,max=255" example:"What do you prefer?"`
	Options         []usecases.PollOption `from:"body" json:"options"         validate:"required,min=2,max=12,dive"`
	SelectableCount int                   `from:"body" json:"selectableCount" validate:"omitempty,min=0" example:"1"`
}

type SendPollController struct {
	handler *usecases.SendPollHandler
}

func NewSendPollController(handler *usecases.SendPollHandler) *SendPollController {
	return &SendPollController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*SendPollController)(nil)

func (c *SendPollController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/poll",
		Method:      "POST",
		Description: "Send a poll message",
		Tags:        []string{"Messaging"},

		Request:  SendPollRequest{},
		Response: usecases.SendPollOutput{},
		Status:   http.StatusCreated,
		Errors:   []errors.ErrorCode{ctxerrors.CodeChannelNotFound, ctxerrors.CodeChannelNotConnected, ctxerrors.CodeTooFewPollOptions, ctxerrors.CodeTooManyPollOptions, errors.CodeValidationFailed},
	}
}

func (c *SendPollController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[SendPollRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.SendPollInput{
		ChannelID:       req.ChannelID,
		RemoteID:        req.RemoteID,
		PollName:        req.PollName,
		Options:         req.Options,
		SelectableCount: req.SelectableCount,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusCreated, output)
}
