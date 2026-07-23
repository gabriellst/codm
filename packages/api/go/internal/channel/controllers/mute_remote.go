package controllers

import (
	"net/http"

	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/errors"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
)

type MuteRemoteRequest struct {
	ChannelID      string `from:"body"   json:"channelId"      validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID       string `from:"body"   json:"remoteId"       validate:"required"      example:"5511999999999@s.whatsapp.net"`
	OwnerID        string `from:"header" name:"X-Owner-Id"     validate:"required,uuid" swaggerignore:"true"`
	MuteExpiration int64  `from:"body"   json:"muteExpiration" example:"-1"`
}

type MuteRemoteController struct {
	handler *usecases.MuteRemoteHandler
}

func NewMuteRemoteController(h *usecases.MuteRemoteHandler) *MuteRemoteController {
	return &MuteRemoteController{handler: h}
}

// compile-time interface check.
var _ types.Controller = (*MuteRemoteController)(nil)

func (c *MuteRemoteController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/remotes/mute",
		Method:      "POST",
		Description: "Mute a remote chat on the connected platform",
		Tags:        []string{"Channel"},
		Request:     MuteRemoteRequest{},
		Response:    nil,
		Status:      http.StatusNoContent,
		Errors: []errors.ErrorCode{
			ctxerrors.CodeChannelNotFound,
			ctxerrors.CodeChannelNotConnected,
		},
	}
}

func (c *MuteRemoteController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[MuteRemoteRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	if _, err := c.handler.Execute(r.Context(), usecases.MuteRemoteInput{
		ChannelID:      req.ChannelID,
		RemoteID:       req.RemoteID,
		OwnerID:        req.OwnerID,
		MuteExpiration: req.MuteExpiration,
	}); err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusNoContent, nil)
}
