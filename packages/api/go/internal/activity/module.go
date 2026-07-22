// Package activity is the activity-feed bounded context — the reference Go
// context of the template.
//
// Role (per docs/BACKEND.md, the Go side is a worker/indexer backend): consume
// integration events from the contracts wire, maintain the activity_entries
// read model (projection + projector), and expose one ctx-local read endpoint.
//
// Composition:
//   - handlers/     — external handler consuming integration.billing.subscription_changed
//   - projections/  — ActivityEntry free record + repository (interface + pg impl)
//   - projections/projectors/ — ActivityEntryProjector (InsertIfNew / find → Apply → save)
//   - usecases/     — ListActivity query handler (reads only this context's projection)
//   - controllers/  — GET /activity/entries (owner-scoped via the Session middleware)
package activity

import (
	"go.uber.org/fx"

	"template/api-go/internal/activity/controllers"
	"template/api-go/internal/activity/handlers"
	"template/api-go/internal/activity/projections"
	"template/api-go/internal/activity/projections/projectors"
	"template/api-go/internal/activity/usecases"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

var Module = fx.Module("activity",
	// Projection repository — constructor returns the interface type.
	fx.Provide(projections.NewPgActivityEntryProjectionRepository),

	// Read side
	fx.Provide(projectors.NewActivityEntryProjector),

	// Write-side external handler (observability side effect)
	fx.Provide(handlers.NewSubscriptionChangedHandler),

	// Query use case
	fx.Provide(usecases.NewListActivityHandler),

	// Controller — auto-registered via group:"controllers"
	fx.Provide(fx.Annotate(
		controllers.NewListActivityController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),

	fx.Invoke(registerHandlers),
)

// registerHandlers subscribes the context's consumers on the ExternalMediator.
// Both listen to the same integration event; the mediator fans out to each.
func registerHandlers(
	ext mediator.ExternalMediator,
	projector *projectors.ActivityEntryProjector,
	subscriptionChanged *handlers.SubscriptionChangedHandler,
) {
	ext.Register(projector)
	ext.Register(subscriptionChanged)
}
