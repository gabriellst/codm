package controllers

import (
	"net/http"

	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
)

type CheckIsOnPlatformRequest struct {
	ChannelID string   `from:"body" json:"channelId"  validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	Identifiers  []string `from:"body" json:"identifiers"   validate:"required,min=1" example:"5511999999999"`
}

type CheckIsOnPlatformController struct {
	handler *usecases.CheckIsOnPlatformHandler
}

func NewCheckIsOnPlatformController(handler *usecases.CheckIsOnPlatformHandler) *CheckIsOnPlatformController {
	return &CheckIsOnPlatformController{handler: handler}
}

func (c *CheckIsOnPlatformController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/check-number",
		Method:      "POST",
		Description: "Check if identifiers are on the platform",
		Tags:        []string{"Messaging"},
	
		Request:     CheckIsOnPlatformRequest{},
		Response:    usecases.CheckIsOnPlatformOutput{},
		Status:      http.StatusOK,
	}
}

func (c *CheckIsOnPlatformController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[CheckIsOnPlatformRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.CheckIsOnPlatformInput{
		ChannelID: req.ChannelID,
		Identifiers:  req.Identifiers,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, output)
}
