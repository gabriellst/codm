package controllers

import (
	"net/http"

	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/errors"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
)

type MarkRemoteAsUnreadRequest struct {
	ChannelID string `from:"body"   json:"channelId" validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID  string `from:"body"   json:"remoteId"  validate:"required"      example:"5511999999999@s.whatsapp.net"`
	OwnerID   string `from:"header" name:"X-Owner-Id" validate:"required,uuid" swaggerignore:"true"`
}

type MarkRemoteAsUnreadController struct {
	handler *usecases.MarkRemoteAsUnreadHandler
}

func NewMarkRemoteAsUnreadController(h *usecases.MarkRemoteAsUnreadHandler) *MarkRemoteAsUnreadController {
	return &MarkRemoteAsUnreadController{handler: h}
}

func (c *MarkRemoteAsUnreadController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/remotes/mark-as-unread",
		Method:      "POST",
		Description: "Mark a remote chat as unread on the connected platform",
		Tags:        []string{"Channel"},
		Request:     MarkRemoteAsUnreadRequest{},
		Response:    nil,
		Status:      http.StatusNoContent,
		Errors: []errors.ErrorCode{
			ctxerrors.CodeChannelNotFound,
			ctxerrors.CodeChannelNotConnected,
		},
	}
}

func (c *MarkRemoteAsUnreadController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[MarkRemoteAsUnreadRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	if _, err := c.handler.Execute(r.Context(), usecases.MarkRemoteAsUnreadInput{
		ChannelID: req.ChannelID,
		RemoteID:  req.RemoteID,
		OwnerID:   req.OwnerID,
	}); err != nil {
		httputil.RespondError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
