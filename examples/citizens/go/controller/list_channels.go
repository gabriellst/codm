// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/channel/controllers/list_channels.go
// Harvested verbatim for the controller skill exemplar set — do not edit; re-harvest instead.
package controllers

import (
	"net/http"

	"monorepo/api/internal/channel/usecases"
	"monorepo/api/internal/shared/types"
	"monorepo/api/pkg/httputil"
)

type ListInstancesRequest struct {
	Limit    int    `from:"query" name:"limit" validate:"omitempty,min=1,max=100"`
	Offset   int    `from:"query" name:"offset" validate:"omitempty,min=0"`
	OwnerID  string `from:"header" name:"X-Owner-Id" validate:"required,uuid" swaggerignore:"true"`
}

type ListChannelsController struct {
	handler *usecases.ListChannelsHandler
}

func NewListChannelsController(handler *usecases.ListChannelsHandler) *ListChannelsController {
	return &ListChannelsController{handler: handler}
}

func (c *ListChannelsController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/channels",
		Method:      "GET",
		Description: "List channels",
		Tags:        []string{"Channel"},
	
		Request:     ListInstancesRequest{},
		Response:    usecases.ListChannelsOutput{},
		Status:      http.StatusOK,
	}
}

// Owner ID is resolved from session cookie automatically
func (c *ListChannelsController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[ListInstancesRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.ListChannelsInput{
		OwnerID: req.OwnerID,
		Limit:    req.Limit,
		Offset:   req.Offset,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, output)
}
