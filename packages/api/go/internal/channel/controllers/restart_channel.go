package controllers

import (
	"net/http"

	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/core-go/errors"
	"template/core-go/pkg/httputil"
	"template/core-go/types"
)

type RestartChannelRequest struct {
	ID string `from:"param" name:"id" validate:"required,uuid"`
}

type RestartChannelController struct {
	handler *usecases.RestartChannelHandler
}

func NewRestartChannelController(handler *usecases.RestartChannelHandler) *RestartChannelController {
	return &RestartChannelController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*RestartChannelController)(nil)

func (c *RestartChannelController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/channels/{id}/restart",
		Method:      "POST",
		Description: "Restart channel connection",
		Tags:        []string{"Channel"},

		Request:  RestartChannelRequest{},
		Response: usecases.RestartChannelOutput{},
		Status:   http.StatusOK,
		Errors:   []errors.ErrorCode{ctxerrors.CodeChannelNotFound, errors.CodeValidationFailed},
	}
}

func (c *RestartChannelController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[RestartChannelRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.RestartChannelInput{
		ID: req.ID,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, output)
}
