package controllers

import (
	"net/http"

	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/core-go/errors"
	"template/core-go/pkg/httputil"
	"template/core-go/types"
)

type SendReactionRequest struct {
	ChannelID string `from:"body" json:"channelId" validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID  string `from:"body" json:"remoteId"    validate:"required" example:"5511999999999@s.whatsapp.net"`
	MessageID string `from:"body" json:"messageId"    validate:"required" example:"3EB0B430A6B7FBEC1200"`
	FromMe    bool   `from:"body" json:"fromMe"       example:"true"`
	// SenderID is the JID of whoever AUTHORED the target message — the part of the
	// WhatsApp message key that makes a reaction stick on someone else's message in
	// a GROUP, where the chat JID is the group and not the author. Optional: a
	// `fromMe` target needs no author, and a DM's chat JID already is one.
	SenderID string `from:"body" json:"senderId"     example:"5511999999999@s.whatsapp.net"`
	Reaction string `from:"body" json:"reaction"     validate:"required" example:"👍"`
}

type SendReactionController struct {
	handler *usecases.SendReactionHandler
}

func NewSendReactionController(handler *usecases.SendReactionHandler) *SendReactionController {
	return &SendReactionController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*SendReactionController)(nil)

func (c *SendReactionController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/reaction",
		Method:      "POST",
		Description: "Send a reaction to a message",
		Tags:        []string{"Messaging"},

		Request:  SendReactionRequest{},
		Response: usecases.SendReactionOutput{},
		Status:   http.StatusOK,
		Errors:   []errors.ErrorCode{ctxerrors.CodeChannelNotFound, ctxerrors.CodeChannelNotConnected, errors.CodeValidationFailed},
	}
}

func (c *SendReactionController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[SendReactionRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.SendReactionInput{
		ChannelID: req.ChannelID,
		RemoteID:  req.RemoteID,
		MessageID: req.MessageID,
		FromMe:    req.FromMe,
		SenderID:  req.SenderID,
		Reaction:  req.Reaction,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, output)
}
