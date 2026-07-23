package controllers

import (
	"net/http"

	"template/api-go/internal/channel/enums"
	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
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

	w.WriteHeader(http.StatusNoContent)
}
