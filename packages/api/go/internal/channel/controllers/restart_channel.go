package controllers

import (
	"net/http"

	"template/api-go/internal/channel/usecases"
	"template/api-go/internal/shared/types"
	"template/api-go/pkg/httputil"
)

type RestartChannelRequest struct {
	ID string `from:"param" name:"id" validate:"required,uuid"`
}

type RestartChannelController struct {
	handler *usecases.RestartChannelHandler
}

func NewRestartChannelController(handler *usecases.RestartChannelHandler) *RestartChannelController {
	return &RestartChannelController{handler: handler}
}

func (c *RestartChannelController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "channel",
		Path:        "/channels/{id}/restart",
		Method:      "POST",
		Description: "Restart channel connection",
		Tags:        []string{"Channel"},

		Request:  RestartChannelRequest{},
		Response: usecases.RestartChannelOutput{},
		Status:   http.StatusOK,
	}
}

func (c *RestartChannelController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[RestartChannelRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.RestartChannelInput{
		ID: req.ID,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, output)
}
