package controllers

import (
	"net/http"

	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/core-go/errors"
	"template/core-go/pkg/httputil"
	"template/core-go/types"
)

type SendLocationRequest struct {
	ChannelID string  `from:"body" json:"channelId" validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID  string  `from:"body" json:"remoteId"     validate:"required" example:"5511999999999@s.whatsapp.net"`
	Latitude  float64 `from:"body" json:"latitude"     example:"-23.5505"`
	Longitude float64 `from:"body" json:"longitude"    example:"-46.6333"`
	Name      string  `from:"body" json:"name"         validate:"omitempty,max=255" example:"Paulista Avenue"`
	Address   string  `from:"body" json:"address"      validate:"omitempty,max=500" example:"Av. Paulista, 1578 - Bela Vista, Sao Paulo"`
}

type SendLocationController struct {
	handler *usecases.SendLocationHandler
}

func NewSendLocationController(handler *usecases.SendLocationHandler) *SendLocationController {
	return &SendLocationController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*SendLocationController)(nil)

func (c *SendLocationController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/location",
		Method:      "POST",
		Description: "Send a location message",
		Tags:        []string{"Messaging"},

		Request:  SendLocationRequest{},
		Response: usecases.SendLocationOutput{},
		Status:   http.StatusCreated,
		Errors:   []errors.ErrorCode{ctxerrors.CodeChannelNotFound, ctxerrors.CodeChannelNotConnected, ctxerrors.CodeInvalidCoordinates, errors.CodeValidationFailed},
	}
}

func (c *SendLocationController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[SendLocationRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.SendLocationInput{
		ChannelID: req.ChannelID,
		RemoteID:  req.RemoteID,
		Latitude:  req.Latitude,
		Longitude: req.Longitude,
		Name:      req.Name,
		Address:   req.Address,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusCreated, output)
}
