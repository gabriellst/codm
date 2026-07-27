package channel

import (
	"context"
	"log/slog"
	"template/api-go/internal/channel/controllers"
	"template/api-go/internal/channel/handlers"
	projectors "template/api-go/internal/channel/projections/projectors"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	messagerepo "template/api-go/internal/channel/repositories/message"
	remoterepo "template/api-go/internal/channel/repositories/remote"
	gateway "template/api-go/internal/channel/services/gateway"
	whatsapp "template/api-go/internal/channel/services/gateway/whatsapp"
	"template/api-go/internal/channel/services/registry"
	"template/api-go/internal/channel/usecases"
	"template/core-go/repositories"
	"template/core-go/services/mediator"
	"template/core-go/services/unitofwork"
	"template/core-go/types"
	"time"

	"go.uber.org/fx"

	_ "template/api-go/internal/channel/errors"
)

// Module wires the channel bounded context over the SHARED SQLite store.
//
// Every repository below resolves *sqlite.SqliteStore (provided by core.Module)
// — the single codedm.db file the TS daemon will also open. That is the fix for
// the split-DB symptom the console showed: the gateway used to write channel
// state to Postgres while the ui read PGlite, so a freshly connected channel
// still rendered DISCONNECTED. One store, one truth.
var Module = fx.Module("channel",
	// Infrastructure — whatsmeow's device/session store on a dedicated FK-on
	// handle over the SAME file, plus the channel factory built on it.
	fx.Provide(whatsapp.NewWhatsmeowStore),
	fx.Provide(fx.Annotate(
		whatsapp.NewWhatsmeowChannelFactory,
		fx.As(new(gateway.ChannelFactory)),
	)),

	// Repository — projection-backed implementation (T6). Reads and writes the
	// `gateway_channels` table directly; appends domain events to shared_events
	// via DomainEventRepository inside Save. Strict 404 on miss (no event replay).
	fx.Provide(fx.Annotate(
		channelrepo.NewSqliteChannelRepository,
		fx.As(new(channelrepo.ChannelRepository)),
	)),

	// Projection repositories (T7/T8) — read/write projection tables.
	fx.Provide(fx.Annotate(
		remoterepo.NewSqliteRemoteProjectionRepository,
		fx.As(new(remoterepo.RemoteProjectionRepository)),
	)),
	fx.Provide(fx.Annotate(
		messagerepo.NewSqliteMessageProjectionRepository,
		fx.As(new(messagerepo.MessageProjectionRepository)),
	)),

	// Write-side repositories (needed by future use cases: Pin/Archive/Mute).
	fx.Provide(fx.Annotate(
		remoterepo.NewSqliteRemoteRepository,
		fx.As(new(remoterepo.RemoteRepository)),
	)),
	fx.Provide(fx.Annotate(
		messagerepo.NewSqliteMessageRepository,
		fx.As(new(messagerepo.MessageRepository)),
	)),

	// Registry service
	fx.Provide(fx.Annotate(
		registry.NewChannelRegistry,
		fx.As(new(registry.ChannelRegistry)),
	)),

	// Use cases — channel management
	fx.Provide(usecases.NewCreateChannelHandler),
	fx.Provide(usecases.NewConnectChannelHandler),
	fx.Provide(usecases.NewListChannelsHandler),
	fx.Provide(usecases.NewGetChannelHandler),
	fx.Provide(usecases.NewDeleteChannelHandler),
	fx.Provide(usecases.NewRestartChannelHandler),
	fx.Provide(usecases.NewLogoutChannelHandler),
	fx.Provide(usecases.NewSetPresenceHandler),
	fx.Provide(usecases.NewGetOrCreateChannelHandler),

	// Use cases — messaging
	fx.Provide(usecases.NewSendTextHandler),
	fx.Provide(usecases.NewSendMediaHandler),
	fx.Provide(usecases.NewCheckIsOnPlatformHandler),
	fx.Provide(usecases.NewDeleteMessageHandler),
	fx.Provide(usecases.NewSendImageHandler),
	fx.Provide(usecases.NewSendVideoHandler),
	fx.Provide(usecases.NewSendFileHandler),
	fx.Provide(usecases.NewSendAudioHandler),
	fx.Provide(usecases.NewSendStickerHandler),
	fx.Provide(usecases.NewSendLinkHandler),
	fx.Provide(usecases.NewSendLocationHandler),
	fx.Provide(usecases.NewSendContactHandler),
	fx.Provide(usecases.NewSendReactionHandler),
	fx.Provide(usecases.NewSendPollHandler),
	fx.Provide(usecases.NewSendListHandler),
	fx.Provide(usecases.NewSendButtonHandler),
	fx.Provide(usecases.NewSendStatusHandler),
	fx.Provide(usecases.NewEditMessageHandler),
	fx.Provide(usecases.NewForwardMessageHandler),
	fx.Provide(usecases.NewSendChatPresenceHandler),

	// Use cases — remote (chat state: pin/archive/mute/mark-read)
	fx.Provide(usecases.NewPinRemoteHandler),
	fx.Provide(usecases.NewUnpinRemoteHandler),
	fx.Provide(usecases.NewArchiveRemoteHandler),
	fx.Provide(usecases.NewUnarchiveRemoteHandler),
	fx.Provide(usecases.NewMuteRemoteHandler),
	fx.Provide(usecases.NewUnmuteRemoteHandler),
	fx.Provide(usecases.NewMarkRemoteAsUnreadHandler),
	fx.Provide(usecases.NewMarkRemoteAsSeenHandler),

	// Controllers — channel management
	fx.Provide(fx.Annotate(controllers.NewCreateWhatsAppChannelController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewListChannelsController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewGetChannelController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewDeleteChannelController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewConnectChannelController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewRestartChannelController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewLogoutChannelController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewSetPresenceController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewGetOrCreateChannelController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),

	// Controllers — messaging
	fx.Provide(fx.Annotate(controllers.NewSendTextController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewSendMediaController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewCheckIsOnPlatformController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewDeleteMessageController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewSendImageController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewSendVideoController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewSendFileController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewSendAudioController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewSendStickerController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewSendLinkController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewSendLocationController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewSendContactController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewSendReactionController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewSendPollController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewSendListController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewSendButtonController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewSendStatusController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewEditMessageController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewForwardMessageController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewSendChatPresenceController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),

	// Controllers — remote (chat state mutations)
	fx.Provide(fx.Annotate(controllers.NewPinRemoteController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewUnpinRemoteController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewArchiveRemoteController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewUnarchiveRemoteController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewMuteRemoteController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewUnmuteRemoteController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewMarkRemoteAsUnreadController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(controllers.NewMarkRemoteAsSeenController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),

	// Lifecycle hooks
	fx.Invoke(registerLifecycleHooks),
	fx.Invoke(registerDomainEventHandlers),
)

func registerLifecycleHooks(lc fx.Lifecycle, reg registry.ChannelRegistry, repo channelrepo.ChannelRepository, factory gateway.ChannelFactory) {
	lc.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			channels, err := repo.FindAllActive(ctx)
			if err != nil {
				slog.Warn("startup: failed to load active channels", "error", err)
				return nil
			}
			slog.Info("startup: reconnecting channels", "count", len(channels))
			go func() {
				// Wait for the OS to fully close TCP connections from the previous
				// process before reconnecting. Without this, WhatsApp may see the
				// old connection as still alive and reject the new one with 401
				// "logged out from another device", causing whatsmeow to delete the
				// local session keys.
				time.Sleep(3 * time.Second)
				for _, ch := range channels {
					id := ch.ID
					ownerID := ch.OwnerID
					ownerRemoteID := ch.OwnerRemoteID
					live, err := reg.Register(context.Background(), id.UUID(), gateway.ChannelConfig{
						OwnerID:       ownerID,
						OwnerRemoteID: ownerRemoteID,
					})
					if err != nil {
						slog.Warn("startup: failed to register channel", "channelId", id.UUID(), "error", err)
						continue
					}
					if err := live.Connect(context.Background()); err != nil {
						slog.Warn("startup: failed to connect channel", "channelId", id.UUID(), "error", err)
					}
				}
			}()
			return nil
		},
		OnStop: func(ctx context.Context) error {
			slog.Info("disconnecting all instances...")
			reg.DisconnectAll()
			if c, ok := factory.(interface{ Close() error }); ok {
				_ = c.Close()
			}
			return nil
		},
	})
}

func registerDomainEventHandlers(
	m mediator.InternalMediator,
	ext mediator.ExternalMediator,
	repo channelrepo.ChannelRepository,
	reg registry.ChannelRegistry,
	domainEventRepo repositories.DomainEventRepository,
	uow unitofwork.UnitOfWork,
	remoteProjRepo remoterepo.RemoteProjectionRepository,
	msgProjRepo messagerepo.MessageProjectionRepository,
) {
	m.Register(handlers.NewChannelCreatedHandler())
	m.Register(handlers.NewChannelDeletedHandler())
	m.Register(handlers.NewChannelConnectedHandler(repo, reg, ext, uow))
	m.Register(handlers.NewChannelDisconnectedHandler(repo, ext, uow))
	m.Register(handlers.NewChannelLoggedOutHandler(repo, ext, uow))
	m.Register(handlers.NewMessageReceivedHandler(ext, reg))
	m.Register(handlers.NewMessageDeliveredHandler(ext))
	m.Register(handlers.NewMessageSeenHandler(ext))
	m.Register(handlers.NewGatewayPlatformEventHandler(ext))

	// Sync pipeline — gateway events → business sync events → integration events.
	m.Register(handlers.NewSyncStartedHandler(domainEventRepo))
	m.Register(handlers.NewSyncProgressHandler(domainEventRepo))
	m.Register(handlers.NewSyncCompletedHandler(domainEventRepo))
	m.Register(handlers.NewSyncStartedIntegrationHandler(ext))
	m.Register(handlers.NewSyncProgressIntegrationHandler(ext))
	m.Register(handlers.NewSyncCompletedIntegrationHandler(ext))

	// Integration handlers — domain → external mediator.
	m.Register(handlers.NewPresenceUpdatedIntegrationHandler(ext))
	m.Register(handlers.NewChatPresenceUpdatedIntegrationHandler(ext))

	// Remote event handler — fan-out remote observation events to integration consumers.
	m.Register(handlers.NewRemoteUpdatedHandler(ext))
	m.Register(handlers.NewRemoteCreatedIntegrationHandler(ext))
	m.Register(handlers.NewRemoteDeletedIntegrationHandler(ext))
	m.Register(handlers.NewRemotesSyncedIntegrationHandler(ext))
	m.Register(handlers.NewMessagesSyncedIntegrationHandler(ext))
	m.Register(handlers.NewMembershipAddedIntegrationHandler(ext))
	m.Register(handlers.NewMembershipRemovedIntegrationHandler(ext))

	// Remote projectors — write to remotes projection (T8).
	m.Register(projectors.NewRemoteCreatedProjector(remoteProjRepo))
	m.Register(projectors.NewRemoteDeletedProjector(remoteProjRepo))
	m.Register(projectors.NewRemoteUpdatedProjector(remoteProjRepo, repo))
	m.Register(projectors.NewRemotePinnedProjector(remoteProjRepo))
	m.Register(projectors.NewRemoteUnpinnedProjector(remoteProjRepo))
	m.Register(projectors.NewRemoteArchivedProjector(remoteProjRepo))
	m.Register(projectors.NewRemoteUnarchivedProjector(remoteProjRepo))
	m.Register(projectors.NewRemoteMutedProjector(remoteProjRepo))
	m.Register(projectors.NewRemoteUnmutedProjector(remoteProjRepo))
	m.Register(projectors.NewRemoteMarkedAsUnreadProjector(remoteProjRepo))
	m.Register(projectors.NewRemoteChatSeenProjector(remoteProjRepo))
	m.Register(projectors.NewRemoteOnMessageReceivedProjector(remoteProjRepo))
	m.Register(projectors.NewRemoteOnMessageSentProjector(remoteProjRepo))
	m.Register(projectors.NewRemoteOnMessageDeletedProjector(msgProjRepo, remoteProjRepo))

	// Message projectors — write to messages projection (T8).
	m.Register(projectors.NewMessageReceivedProjector(msgProjRepo))
	m.Register(projectors.NewMessageSentProjector(msgProjRepo))
	m.Register(projectors.NewMessageEditedProjector(msgProjRepo))
	m.Register(projectors.NewMessageDeletedProjector(msgProjRepo))
	m.Register(projectors.NewMessageDeliveredProjector(msgProjRepo))
	m.Register(projectors.NewMessageSeenProjector(msgProjRepo))

	// Membership projectors — write to remote_memberships projection (T8/T13).
	m.Register(projectors.NewMembershipAddedProjector(remoteProjRepo))
	m.Register(projectors.NewMembershipRemovedProjector(remoteProjRepo))
}

// No message persistence handlers needed: messages are themselves the
// channel.message_* domain events in shared.events, and the ListMessages
// query aggregates them at read time. Delivery status is similarly
// computed from channel.message_delivered / channel.message_seen events.
