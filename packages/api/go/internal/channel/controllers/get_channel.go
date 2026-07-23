package controllers

import (
	"net/http"

	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/errors"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
)

type GetChannelRequest struct {
	ID string `from:"param" name:"id" validate:"required,uuid"`
}

type GetChannelController struct {
	handler *usecases.GetChannelHandler
}

func NewGetChannelController(handler *usecases.GetChannelHandler) *GetChannelController {
	return &GetChannelController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*GetChannelController)(nil)

func (c *GetChannelController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/channels/{id}",
		Method:      "GET",
		Description: "Get channel by ID",
		Tags:        []string{"Channel"},

		Request:  GetChannelRequest{},
		Response: usecases.GetChannelOutput{},
		Status:   http.StatusOK,
		Errors:   []errors.ErrorCode{ctxerrors.CodeChannelNotFound, errors.CodeValidationFailed},
	}
}

func (c *GetChannelController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[GetChannelRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.GetChannelInput{
		ID: req.ID,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, output)
}
