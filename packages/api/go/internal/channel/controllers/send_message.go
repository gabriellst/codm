package controllers

import (
	"net/http"

	"template/api-go/internal/channel/middlewares"
	"template/api-go/internal/channel/usecases"
	"template/core-go/config"
	"template/core-go/errors"
	"template/core-go/pkg/httputil"
	"template/core-go/types"
)

// SendMessageRequest is an operator-initiated direct text send.
type SendMessageRequest struct {
	ChannelID string `from:"body" json:"channelId" validate:"required,uuid"`
	To        string `from:"body" json:"to" validate:"required"`
	Text      string `from:"body" json:"text" validate:"required,min=1"`
}

type SendMessageController struct {
	handler *usecases.SendMessageHandler
	apiKey  types.Middleware
}

func NewSendMessageController(handler *usecases.SendMessageHandler, cfg *config.Config) *SendMessageController {
	return &SendMessageController{handler: handler, apiKey: middlewares.APIKey(cfg.GatewayAPIKey)}
}

var _ types.Controller = (*SendMessageController)(nil)

func (c *SendMessageController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/send",
		Method:      "POST",
		Description: "Send a plain-text message on a connected channel",
		Tags:        []string{"Channel"},
		Middlewares: []types.Middleware{c.apiKey},
		Request:     SendMessageRequest{},
		Response:    usecases.SendMessageOutput{},
		Status:      http.StatusOK,
		Errors:      []errors.ErrorCode{errors.CodeUnauthorized, errors.CodeNotFound, errors.CodeExternalService},
	}
}

func (c *SendMessageController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[SendMessageRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	out, err := c.handler.Execute(r.Context(), usecases.SendMessageInput{
		ChannelID: req.ChannelID,
		To:        req.To,
		Text:      req.Text,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, out)
}
