// Package channel is BC1 — the Channel Gateway bounded context.
//
// Role (Go side = external-gateway worker): own the platform sessions
// (whatsmeow/WhatsApp today), normalize inbound messages into the FROZEN wire
// contract, and deliver outbound messages the core requests. It publishes/
// consumes ONLY the locked integration.channel* events.
//
// Composition:
//   - services/gateway/           — the platform-agnostic Channel port + factory
//   - services/gateway/whatsapp/  — the whatsmeow adapter (store, factory,
//     channel, mapper ACL)
//   - services/registry/          — in-process live-session map
//   - events/                     — domain lifecycle facts (channel.*)
//   - handlers/                   — egress (domain→wire, InternalMediator) +
//     delivery_requested (wire→session, ExternalMediator)
//   - projections/                — channels read model + status projectors
//   - usecases/ + controllers/    — the api-key-guarded HTTP surface
package channel

import (
	"go.uber.org/fx"

	"template/api-go/internal/channel/controllers"
	"template/api-go/internal/channel/handlers"
	"template/api-go/internal/channel/projections"
	"template/api-go/internal/channel/projections/projectors"
	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/gateway/whatsapp"
	"template/api-go/internal/channel/services/registry"
	"template/api-go/internal/channel/usecases"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

var Module = fx.Module("channel",
	// ── Platform seam (WhatsApp realized; INSTAGRAM_DM/TELEGRAM are new adapters) ──
	fx.Provide(whatsapp.NewSQLStore),
	fx.Provide(fx.Annotate(whatsapp.NewWhatsmeowChannelFactory, fx.As(new(gateway.ChannelFactory)))),
	fx.Provide(fx.Annotate(registry.NewChannelRegistry, fx.As(new(registry.ChannelRegistry)))),

	// ── Read model ──
	fx.Provide(projections.NewPgChannelProjectionRepository),
	fx.Provide(projectors.NewConnectedProjector),
	fx.Provide(projectors.NewDisconnectedProjector),

	// ── Egress: domain fact → frozen wire integration event (InternalMediator) ──
	fx.Provide(handlers.NewMessageReceivedEgress),
	fx.Provide(handlers.NewConnectedEgress),
	fx.Provide(handlers.NewDisconnectedEgress),
	fx.Provide(handlers.NewPairingQRUpdatedEgress),
	fx.Provide(handlers.NewOutboundDeliveredEgress),

	// ── Ingress: core delivery command → live session (ExternalMediator) ──
	fx.Provide(handlers.NewDeliveryRequestedHandler),

	// ── Use cases ──
	fx.Provide(usecases.NewConnectChannelHandler),
	fx.Provide(usecases.NewSendMessageHandler),
	fx.Provide(usecases.NewLogoutChannelHandler),
	fx.Provide(usecases.NewListChannelsHandler),

	// ── Controllers (auto-registered via group:"controllers") ──
	provideController(controllers.NewConnectChannelController),
	provideController(controllers.NewSendMessageController),
	provideController(controllers.NewLogoutChannelController),
	provideController(controllers.NewListChannelsController),

	fx.Invoke(registerHandlers),
)

// provideController annotates a controller constructor for the shared
// group:"controllers" collection the HttpRouter consumes.
func provideController(ctor any) fx.Option {
	return fx.Provide(fx.Annotate(
		ctor,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	))
}

// registerHandlers subscribes the context's write-side consumers.
//   - egress handlers + status projectors listen on the InternalMediator (fed
//     by the OutboxDispatcher from the durable outbox).
//   - the delivery handler listens on the ExternalMediator (Redis Streams).
func registerHandlers(
	im mediator.InternalMediator,
	ext mediator.ExternalMediator,
	msgRecv *handlers.MessageReceivedEgress,
	connected *handlers.ConnectedEgress,
	disconnected *handlers.DisconnectedEgress,
	qr *handlers.PairingQRUpdatedEgress,
	outbound *handlers.OutboundDeliveredEgress,
	connectedProj *projectors.ConnectedProjector,
	disconnectedProj *projectors.DisconnectedProjector,
	delivery *handlers.DeliveryRequestedHandler,
) {
	im.Register(msgRecv)
	im.Register(connected)
	im.Register(disconnected)
	im.Register(qr)
	im.Register(outbound)
	im.Register(connectedProj)
	im.Register(disconnectedProj)

	ext.Register(delivery)
}
