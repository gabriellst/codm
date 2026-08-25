package controllers

import (
	"net/http"

	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/core-go/errors"
	"template/core-go/pkg/httputil"
	"template/core-go/types"
)

type SendLinkRequest struct {
	ChannelID    string `from:"body" json:"channelId" validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	RemoteID     string `from:"body" json:"remoteId"     validate:"required" example:"5511999999999@s.whatsapp.net"`
	URL          string `from:"body" json:"url"          validate:"required,url" example:"https://example.com/article"`
	Title        string `from:"body" json:"title"        validate:"omitempty,max=255" example:"Interesting Article"`
	Description  string `from:"body" json:"description"  validate:"omitempty,max=1024" example:"Check out this article about technology"`
	ThumbnailURL string `from:"body" json:"thumbnailUrl" validate:"omitempty,url" example:"https://example.com/thumb.jpg"`
}

type SendLinkController struct {
	handler *usecases.SendLinkHandler
}

func NewSendLinkController(handler *usecases.SendLinkHandler) *SendLinkController {
	return &SendLinkController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*SendLinkController)(nil)

func (c *SendLinkController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/link",
		Method:      "POST",
		Description: "Send a link with preview",
		Tags:        []string{"Messaging"},

		Request:  SendLinkRequest{},
		Response: usecases.SendLinkOutput{},
		Status:   http.StatusCreated,
		Errors:   []errors.ErrorCode{ctxerrors.CodeChannelNotFound, ctxerrors.CodeChannelNotConnected, errors.CodeValidationFailed},
	}
}

func (c *SendLinkController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[SendLinkRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.SendLinkInput{
		ChannelID:    req.ChannelID,
		RemoteID:     req.RemoteID,
		URL:          req.URL,
		Title:        req.Title,
		Description:  req.Description,
		ThumbnailURL: req.ThumbnailURL,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusCreated, output)
}
