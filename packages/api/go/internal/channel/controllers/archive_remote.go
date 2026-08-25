package controllers

import (
	"net/http"

	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/core-go/errors"
	"template/core-go/pkg/httputil"
	"template/core-go/types"
)

type ArchiveRemoteRequest struct {
	ChannelID string `from:"body"   json:"channelId" validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID  string `from:"body"   json:"remoteId"  validate:"required"      example:"5511999999999@s.whatsapp.net"`
	OwnerID   string `from:"header" name:"X-Owner-Id" validate:"required,uuid" swaggerignore:"true"`
}

type ArchiveRemoteController struct {
	handler *usecases.ArchiveRemoteHandler
}

func NewArchiveRemoteController(h *usecases.ArchiveRemoteHandler) *ArchiveRemoteController {
	return &ArchiveRemoteController{handler: h}
}

// compile-time interface check.
var _ types.Controller = (*ArchiveRemoteController)(nil)

func (c *ArchiveRemoteController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/remotes/archive",
		Method:      "POST",
		Description: "Archive a remote chat on the connected platform",
		Tags:        []string{"Channel"},
		Request:     ArchiveRemoteRequest{},
		Response:    nil,
		Status:      http.StatusNoContent,
		Errors: []errors.ErrorCode{
			ctxerrors.CodeChannelNotFound,
			ctxerrors.CodeChannelNotConnected,
		},
	}
}

func (c *ArchiveRemoteController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[ArchiveRemoteRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	if _, err := c.handler.Execute(r.Context(), usecases.ArchiveRemoteInput{
		ChannelID: req.ChannelID,
		RemoteID:  req.RemoteID,
		OwnerID:   req.OwnerID,
	}); err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusNoContent, nil)
}
