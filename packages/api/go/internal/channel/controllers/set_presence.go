package controllers

import (
	"net/http"

	"template/api-go/internal/channel/enums"
	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/core-go/errors"
	"template/core-go/pkg/httputil"
	"template/core-go/types"
)

type SetPresenceRequest struct {
	ID       string             `from:"param" name:"id" validate:"required,uuid"`
	Presence enums.PresenceType `from:"body" json:"presence" validate:"required,oneof=AVAILABLE UNAVAILABLE COMPOSING RECORDING PAUSED" example:"AVAILABLE"`
}

type SetPresenceController struct {
	handler *usecases.SetPresenceHandler
}

func NewSetPresenceController(handler *usecases.SetPresenceHandler) *SetPresenceController {
	return &SetPresenceController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*SetPresenceController)(nil)

func (c *SetPresenceController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/channels/{id}/presence",
		Method:      "PUT",
		Description: "Set channel presence",
		Tags:        []string{"Channel"},

		Request:  SetPresenceRequest{},
		Response: nil,
		Status:   http.StatusNoContent,
		Errors:   []errors.ErrorCode{ctxerrors.CodeChannelNotFound, ctxerrors.CodeChannelNotConnected, errors.CodeValidationFailed},
	}
}

func (c *SetPresenceController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[SetPresenceRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	_, err = c.handler.Execute(r.Context(), usecases.SetPresenceInput{
		ID:       req.ID,
		Presence: req.Presence,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusNoContent, nil)
}
