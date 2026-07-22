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

// ListChannelsRequest lists the operator's channels. OwnerID is optional.
type ListChannelsRequest struct {
	OwnerID string `from:"query" name:"ownerId" validate:"omitempty,uuid"`
}

type ListChannelsController struct {
	handler *usecases.ListChannelsHandler
	apiKey  types.Middleware
}

func NewListChannelsController(handler *usecases.ListChannelsHandler, cfg *config.Config) *ListChannelsController {
	return &ListChannelsController{handler: handler, apiKey: middlewares.APIKey(cfg.GatewayAPIKey)}
}

var _ types.Controller = (*ListChannelsController)(nil)

func (c *ListChannelsController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/list",
		Method:      "GET",
		Description: "List the operator's channel sessions",
		Tags:        []string{"Channel"},
		Middlewares: []types.Middleware{c.apiKey},
		Request:     ListChannelsRequest{},
		Response:    usecases.ListChannelsOutput{},
		Status:      http.StatusOK,
		Errors:      []errors.ErrorCode{errors.CodeUnauthorized},
	}
}

func (c *ListChannelsController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[ListChannelsRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	out, err := c.handler.Execute(r.Context(), usecases.ListChannelsInput{OwnerID: req.OwnerID})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, out)
}
