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
	"template/api-go/internal/channel/services/pool"
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
// — the single codm.db file the TS daemon will also open. That is the fix for
// the split-DB symptom the console showed: the gateway used to write channel
// state to Postgres while the ui read PGlite, so a freshly connected channel
// still rendered DISCONNECTED. One store, one truth.
var Module = fx.Module("channel",
	// Infrastructure — whatsmeow's device/session store on a dedicated FK-on
	// handle over the SAME file, plus the channel factory built on it.
	// LoadConfig reads the adapter's OWN env var (WHATSMEOW_LOG_LEVEL) — core
	// no longer carries that field (spec T11).
	fx.Provide(whatsapp.LoadConfig),
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

	// Pool service
	fx.Provide(fx.Annotate(
		pool.NewChannelPool,
		fx.As(new(pool.ChannelPool)),
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

func registerLifecycleHooks(lc fx.Lifecycle, pool pool.ChannelPool, repo channelrepo.ChannelRepository, factory gateway.ChannelFactory) {
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
					live, err := pool.Register(context.Background(), id.UUID(), gateway.ChannelConfig{
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
			pool.DisconnectAll()
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
	pool pool.ChannelPool,
	domainEventRepo repositories.DomainEventRepository,
	uow unitofwork.UnitOfWork,
	remoteProjRepo remoterepo.RemoteProjectionRepository,
	msgProjRepo messagerepo.MessageProjectionRepository,
) {
	m.Register(handlers.NewChannelCreatedHandler())
	m.Register(handlers.NewChannelDeletedHandler())
	m.Register(handlers.NewChannelConnectedHandler(repo, pool, ext, uow))
	m.Register(handlers.NewChannelDisconnectedHandler(repo, ext, uow))
	m.Register(handlers.NewChannelLoggedOutHandler(repo, ext, uow))
	m.Register(handlers.NewMessageReceivedHandler(ext, pool))
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

	// Remote projector — single projector for the remotes projection (T8),
	// subscribed to every event that mutates a remote row, including the
	// cross-aggregate message_received/sent/deleted events.
	projectors.RegisterAll(m, projectors.NewRemoteProjector(remoteProjRepo, repo, msgProjRepo))

	// Message projector — single projector for the messages projection (T8),
	// subscribed to every event that mutates a message row.
	projectors.RegisterAll(m, projectors.NewMessageProjector(msgProjRepo))

	// Own-message ingress — REGISTERED AFTER THE PROJECTORS ON PURPOSE. `ChannelMediator.Dispatch`
	// runs a name's handlers in registration order and RETURNS ON THE FIRST ERROR, so a bridge that
	// fails ahead of the projectors would take the projection down with it. The other integration
	// bridges sit with their siblings above because their events have no projector; this one shares
	// `channel.message_sent` with two, and the projection is the more important of the two jobs.
	m.Register(handlers.NewMessageSentHandler(ext, pool))

	// Membership projector — single projector for the remote_memberships
	// projection (T8/T13), subscribed to every membership-mutating event.
	projectors.RegisterAll(m, projectors.NewMembershipProjector(remoteProjRepo))

	// Remote snapshot projector (T13) — the contact/group roster half of the
	// remotes projection, moved out of the whatsmeow adapter
	// (whatsmeow_channel.go used to hold remoteProjRepo itself and write rows
	// directly). Its exported SyncContactSnapshot resolves the live channel
	// from the pool and streams its contact snapshot through the port.
	//
	// Canon-fix (.plans/2026-08-10-eixo-ambiente-go.md): the projector no
	// longer registers with the mediator directly — it has no
	// DomainEventRepository dependency anymore, only its projection repos.
	// RemoteSnapshotSyncedHandler owns channel.gateway.sync_complete,
	// calling SyncContactSnapshot directly (ordering guarantee) and raising
	// channel.remotes_synced itself once it returns — see that handler's
	// docblock. Registered after the sync pipeline handlers above (which
	// also listen on channel.gateway.sync_complete) so a pre-existing,
	// near-infallible write (SyncCompletedHandler persisting
	// channel.sync_completed) is never blocked by this newer, more
	// failure-prone one — see
	// projections/projectors/remote_snapshot_projector.go's docblock.
	snapshotProjector := projectors.NewRemoteSnapshotProjector(pool, remoteProjRepo, msgProjRepo)
	m.Register(handlers.NewRemoteSnapshotSyncedHandler(snapshotProjector, domainEventRepo))
}

// No message persistence handlers needed: messages are themselves the
// channel.message_* domain events in shared.events, and the ListMessages
// query aggregates them at read time. Delivery status is similarly
// computed from channel.message_delivered / channel.message_seen events.
