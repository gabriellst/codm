package controllers

import (
	"net/http"
	msgenums "template/api-go/internal/channel/enums"
	ctxerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/usecases"
	"template/api-go/pkg/httputil"
	"template/core-go/errors"
	"template/core-go/types"
)

type SendStatusRequest struct {
	ChannelID       string               `from:"body" json:"channelId"      validate:"required,uuid" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	StatusType      msgenums.MessageType `from:"body" json:"statusType"      validate:"required,oneof=TEXT IMAGE VIDEO AUDIO" example:"TEXT"`
	Content         string               `from:"body" json:"content"         validate:"required" example:"Hello, this is my status!"`
	Caption         string               `from:"body" json:"caption"         validate:"omitempty,max=1024" example:"My caption"`
	BackgroundColor string               `from:"body" json:"backgroundColor" validate:"omitempty" example:"#FF5733"`
	Font            string               `from:"body" json:"font"            validate:"omitempty" example:"SERIF"`
}

type SendStatusController struct {
	handler *usecases.SendStatusHandler
}

func NewSendStatusController(handler *usecases.SendStatusHandler) *SendStatusController {
	return &SendStatusController{handler: handler}
}

// compile-time interface check.
var _ types.Controller = (*SendStatusController)(nil)

func (c *SendStatusController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "messaging",
		Path:        "/messages/status",
		Method:      "POST",
		Description: "Send a status/story update",
		Tags:        []string{"Messaging"},

		Request:  SendStatusRequest{},
		Response: usecases.SendStatusOutput{},
		Status:   http.StatusCreated,
		Errors:   []errors.ErrorCode{ctxerrors.CodeChannelNotFound, ctxerrors.CodeChannelNotConnected, errors.CodeValidationFailed},
	}
}

func (c *SendStatusController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[SendStatusRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.SendStatusInput{
		ChannelID:       req.ChannelID,
		StatusType:      req.StatusType,
		Content:         req.Content,
		Caption:         req.Caption,
		BackgroundColor: req.BackgroundColor,
		Font:            req.Font,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusCreated, output)
}
