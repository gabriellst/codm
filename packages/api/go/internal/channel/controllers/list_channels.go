package controllers

import (
	"net/http"

	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/errors"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
)

type ListChannelsRequest struct {
	Limit   int    `from:"query" name:"limit" validate:"omitempty,min=1,max=100"`
	Offset  int    `from:"query" name:"offset" validate:"omitempty,min=0"`
	OwnerID string `from:"header" name:"X-Owner-Id" validate:"required,uuid" swaggerignore:"true"`
}

type ListChannelsController struct {
	handler *usecases.ListChannelsHandler
}

func NewListChannelsController(handler *usecases.ListChannelsHandler) *ListChannelsController {
	return &ListChannelsController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*ListChannelsController)(nil)

func (c *ListChannelsController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/channels",
		Method:      "GET",
		Description: "List channels",
		Tags:        []string{"Channel"},

		Request:  ListChannelsRequest{},
		Response: usecases.ListChannelsOutput{},
		Status:   http.StatusOK,
		Errors:   []errors.ErrorCode{errors.CodeValidationFailed},
	}
}

// Owner ID is resolved from session cookie automatically
func (c *ListChannelsController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[ListChannelsRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.ListChannelsInput{
		OwnerID: req.OwnerID,
		Limit:   req.Limit,
		Offset:  req.Offset,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, output)
}
