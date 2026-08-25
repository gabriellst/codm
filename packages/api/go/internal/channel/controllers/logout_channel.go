package controllers

import (
	"net/http"

	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/core-go/errors"
	"template/core-go/pkg/httputil"
	"template/core-go/types"
)

type LogoutChannelRequest struct {
	ID string `from:"param" name:"id" validate:"required,uuid"`
}

type LogoutChannelController struct {
	handler *usecases.LogoutChannelHandler
}

func NewLogoutChannelController(handler *usecases.LogoutChannelHandler) *LogoutChannelController {
	return &LogoutChannelController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*LogoutChannelController)(nil)

func (c *LogoutChannelController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/channels/{id}/logout",
		Method:      "DELETE",
		Description: "Logout channel",
		Tags:        []string{"Channel"},

		Request:  LogoutChannelRequest{},
		Response: usecases.LogoutChannelOutput{},
		Status:   http.StatusOK,
		Errors:   []errors.ErrorCode{ctxerrors.CodeChannelNotFound, ctxerrors.CodeChannelNotConnected, errors.CodeValidationFailed},
	}
}

func (c *LogoutChannelController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[LogoutChannelRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.LogoutChannelInput{
		ID: req.ID,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, output)
}
