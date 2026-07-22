// Package controllers holds the activity context's HTTP ports.
package controllers

import (
	"database/sql"
	"net/http"
	"time"

	"template/api-go/internal/activity/middlewares"
	"template/api-go/internal/activity/usecases"
	"template/core-go/errors"
	"template/core-go/pkg/httputil"
	"template/core-go/types"
)

// ListActivityRequest — the owner is resolved from the session cookie by the
// Session middleware; `before` is an RFC 3339 cursor over lastOccurredAt.
type ListActivityRequest struct {
	OwnerID string `from:"header" name:"X-Owner-Id" validate:"required,uuid" swaggerignore:"true"`
	Limit   int    `from:"query" name:"limit" validate:"omitempty,min=1,max=100"`
	Before  string `from:"query" name:"before" validate:"omitempty,datetime=2006-01-02T15:04:05Z07:00" example:"2026-07-01T12:00:00Z"`
}

// ListActivityController serves the owner-scoped activity feed.
type ListActivityController struct {
	handler *usecases.ListActivityHandler
	session types.Middleware
}

func NewListActivityController(handler *usecases.ListActivityHandler, db *sql.DB) *ListActivityController {
	return &ListActivityController{
		handler: handler,
		session: middlewares.Session(db),
	}
}

// compile-time interface check.
var _ types.Controller = (*ListActivityController)(nil)

func (c *ListActivityController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "activity",
		Path:        "/entries",
		Method:      "GET",
		Description: "List the owner-scoped activity feed, newest first",
		Tags:        []string{"Activity"},
		Middlewares: []types.Middleware{c.session},

		Request:  ListActivityRequest{},
		Response: usecases.ListActivityOutput{},
		Status:   http.StatusOK,
		Errors:   []errors.ErrorCode{errors.CodeUnauthorized, errors.CodeValidationFailed},
	}
}

func (c *ListActivityController) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[ListActivityRequest](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	input := usecases.ListActivityInput{
		OwnerID: req.OwnerID,
		Limit:   req.Limit,
	}
	if req.Before != "" {
		before, parseErr := time.Parse(time.RFC3339, req.Before)
		if parseErr != nil {
			httputil.RespondError(w, errors.NewBaseError(errors.CodeBadRequest, "invalid before cursor: "+parseErr.Error()))
			return
		}
		input.Before = &before
	}

	output, err := c.handler.Execute(r.Context(), input)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, output)
}
