package controllers

import (
	"net/http"

	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/api-go/pkg/httputil"
	"template/core-go/errors"
	"template/core-go/types"
)

type UnpinRemoteRequest struct {
	ChannelID string `from:"body"   json:"channelId" validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID  string `from:"body"   json:"remoteId"  validate:"required"      example:"5511999999999@s.whatsapp.net"`
	OwnerID   string `from:"header" name:"X-Owner-Id" validate:"required,uuid" swaggerignore:"true"`
}

type UnpinRemoteController struct {
	handler *usecases.UnpinRemoteHandler
}

func NewUnpinRemoteController(h *usecases.UnpinRemoteHandler) *UnpinRemoteController {
	return &UnpinRemoteController{handler: h}
}

// compile-time interface check.
var _ types.Controller = (*UnpinRemoteController)(nil)

func (c *UnpinRemoteController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/remotes/unpin",
		Method:      "POST",
		Description: "Unpin a remote chat on the connected platform",
		Tags:        []string{"Channel"},
		Request:     UnpinRemoteRequest{},
		Response:    nil,
		Status:      http.StatusNoContent,
		Errors: []errors.ErrorCode{
			ctxerrors.CodeChannelNotFound,
			ctxerrors.CodeChannelNotConnected,
		},
	}
}

func (c *UnpinRemoteController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[UnpinRemoteRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	if _, err := c.handler.Execute(r.Context(), usecases.UnpinRemoteInput{
		ChannelID: req.ChannelID,
		RemoteID:  req.RemoteID,
		OwnerID:   req.OwnerID,
	}); err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusNoContent, nil)
}
