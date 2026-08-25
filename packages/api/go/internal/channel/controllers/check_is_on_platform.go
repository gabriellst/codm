package controllers

import (
	"net/http"

	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/core-go/errors"
	"template/core-go/pkg/httputil"
	"template/core-go/types"
)

type CheckIsOnPlatformRequest struct {
	ChannelID   string   `from:"body" json:"channelId"  validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	Identifiers []string `from:"body" json:"identifiers"   validate:"required,min=1" example:"5511999999999"`
}

type CheckIsOnPlatformController struct {
	handler *usecases.CheckIsOnPlatformHandler
}

func NewCheckIsOnPlatformController(handler *usecases.CheckIsOnPlatformHandler) *CheckIsOnPlatformController {
	return &CheckIsOnPlatformController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*CheckIsOnPlatformController)(nil)

func (c *CheckIsOnPlatformController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/check-number",
		Method:      "POST",
		Description: "Check if identifiers are on the platform",
		Tags:        []string{"Messaging"},

		Request:  CheckIsOnPlatformRequest{},
		Response: usecases.CheckIsOnPlatformOutput{},
		Status:   http.StatusOK,
		Errors:   []errors.ErrorCode{ctxerrors.CodeChannelNotFound, ctxerrors.CodeChannelNotConnected, ctxerrors.CodeEmptyNumberList, errors.CodeValidationFailed},
	}
}

func (c *CheckIsOnPlatformController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[CheckIsOnPlatformRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.CheckIsOnPlatformInput{
		ChannelID:   req.ChannelID,
		Identifiers: req.Identifiers,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, output)
}
