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

// LogoutChannelRequest unpairs and removes a channel session.
type LogoutChannelRequest struct {
	ChannelID string `from:"param" name:"id" validate:"required,uuid"`
}

type LogoutChannelController struct {
	handler *usecases.LogoutChannelHandler
	apiKey  types.Middleware
}

func NewLogoutChannelController(handler *usecases.LogoutChannelHandler, cfg *config.Config) *LogoutChannelController {
	return &LogoutChannelController{handler: handler, apiKey: middlewares.APIKey(cfg.GatewayAPIKey)}
}

var _ types.Controller = (*LogoutChannelController)(nil)

func (c *LogoutChannelController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/{id}/logout",
		Method:      "POST",
		Description: "Log out and remove a channel session",
		Tags:        []string{"Channel"},
		Middlewares: []types.Middleware{c.apiKey},
		Request:     LogoutChannelRequest{},
		Response:    usecases.LogoutChannelOutput{},
		Status:      http.StatusOK,
		Errors:      []errors.ErrorCode{errors.CodeUnauthorized, errors.CodeBadRequest},
	}
}

func (c *LogoutChannelController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[LogoutChannelRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	out, err := c.handler.Execute(r.Context(), usecases.LogoutChannelInput{ChannelID: req.ChannelID})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, out)
}
