package controllers

import (
	"net/http"

	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/errors"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
)

type DeleteChannelRequest struct {
	ID string `from:"param" name:"id" validate:"required,uuid"`
}

type DeleteChannelController struct {
	handler *usecases.DeleteChannelHandler
}

func NewDeleteChannelController(handler *usecases.DeleteChannelHandler) *DeleteChannelController {
	return &DeleteChannelController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*DeleteChannelController)(nil)

func (c *DeleteChannelController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/channels/{id}",
		Method:      "DELETE",
		Description: "Delete a channel",
		Tags:        []string{"Channel"},

		Request:  DeleteChannelRequest{},
		Response: usecases.DeleteChannelOutput{},
		Status:   http.StatusOK,
		Errors:   []errors.ErrorCode{ctxerrors.CodeChannelNotFound, errors.CodeValidationFailed},
	}
}

func (c *DeleteChannelController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[DeleteChannelRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.DeleteChannelInput{
		ID: req.ID,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, output)
}
