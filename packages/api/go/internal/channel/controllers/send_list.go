package controllers

import (
	"net/http"

	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
)

type SendListRequest struct {
	ChannelID   string                 `from:"body" json:"channelId" validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID    string                 `from:"body" json:"remoteId"     validate:"required" example:"5511999999999@s.whatsapp.net"`
	Title       string                 `from:"body" json:"title"        validate:"required,max=255" example:"Our Menu"`
	Description string                 `from:"body" json:"description"  validate:"required,max=1024" example:"Choose from the options below"`
	ButtonText  string                 `from:"body" json:"buttonText"   validate:"required,max=20" example:"View Options"`
	FooterText  string                 `from:"body" json:"footerText"   validate:"omitempty,max=60" example:"Powered by our bot"`
	Sections    []usecases.ListSection `from:"body" json:"sections"     validate:"required,min=1,dive"`
}

type SendListController struct {
	handler *usecases.SendListHandler
}

func NewSendListController(handler *usecases.SendListHandler) *SendListController {
	return &SendListController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*SendListController)(nil)

func (c *SendListController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/list",
		Method:      "POST",
		Description: "Send a list message",
		Tags:        []string{"Messaging"},

		Request:  SendListRequest{},
		Response: usecases.SendListOutput{},
		Status:   http.StatusCreated,
	}
}

func (c *SendListController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[SendListRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.SendListInput{
		ChannelID:   req.ChannelID,
		RemoteID:    req.RemoteID,
		Title:       req.Title,
		Description: req.Description,
		ButtonText:  req.ButtonText,
		FooterText:  req.FooterText,
		Sections:    req.Sections,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusCreated, output)
}
