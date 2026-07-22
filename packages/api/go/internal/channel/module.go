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
//
// Exactly-once (dedup) delegation: the gateway does NOT dedup inbound messages.
// whatsmeow legitimately redelivers the same events.Message (reconnect, retry
// receipts, offline drain), and the outbox→Redis Streams egress is at-least-once,
// so duplicate MessageIDs can reach the consumer. The frozen wire event carries
// a stable MessageID for exactly this reason: the downstream Thread & Routing
// context (BC4) owns dedup, keying on ChannelMessageReceivedEvent.MessageID with
// a unique constraint. That context is not yet built (see PENDING_PGSCHEMAS:
// thread); when it lands it MUST enforce that guarantee — the gateway
// deliberately keeps no seen-message state.
//
// Runtime contract: the Go gateway currently requires external Postgres + Redis
// (the worker topology). NewPostgresDB eagerly pings Postgres and the
// RedisExternalMediator pings Redis at OnStart, so the process only boots with
// infra up — bring it up with `bun docker:compose` before starting the gateway
// or asserting boot health against GET /healthz. (A file-backed embedded path
// parallel to the TS PGlite daemon is a follow-up; until then the smoke test is
// gated on docker:compose.)
package channel

import (
	"context"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"go.uber.org/fx"

	"template/api-go/internal/channel/controllers"
	"template/api-go/internal/channel/handlers"
	"template/api-go/internal/channel/projections"
	"template/api-go/internal/channel/projections/projectors"
	messagerepo "template/api-go/internal/channel/repositories/message"
	remoterepo "template/api-go/internal/channel/repositories/remote"
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

	// Read-model repos (gateway.remotes / gateway.remote_memberships / gateway.messages).
	fx.Provide(remoterepo.NewPgRemoteProjectionRepository),
	fx.Provide(messagerepo.NewPgMessageProjectionRepository),

	// Remote projectors.
	fx.Provide(projectors.NewRemoteCreatedProjector),
	fx.Provide(projectors.NewRemoteUpdatedProjector),
	fx.Provide(projectors.NewRemoteDeletedProjector),
	fx.Provide(projectors.NewMembershipAddedProjector),
	fx.Provide(projectors.NewMembershipRemovedProjector),
	fx.Provide(projectors.NewRemoteOnMessageReceivedProjector),
	fx.Provide(projectors.NewRemoteOnMessageSentProjector),
	fx.Provide(projectors.NewRemoteOnMessageDeletedProjector),

	// Message projectors.
	fx.Provide(projectors.NewMessageReceivedProjector),
	fx.Provide(projectors.NewMessageSentProjector),
	fx.Provide(projectors.NewMessageEditedProjector),
	fx.Provide(projectors.NewMessageDeletedProjector),
	fx.Provide(projectors.NewMessageDeliveredProjector),
	fx.Provide(projectors.NewMessageSeenProjector),

	// ── Egress: domain fact → frozen wire integration event (InternalMediator) ──
	fx.Provide(handlers.NewMessageReceivedEgress),
	fx.Provide(handlers.NewConnectedEgress),
	fx.Provide(handlers.NewDisconnectedEgress),
	fx.Provide(handlers.NewPairingQRUpdatedEgress),
	fx.Provide(handlers.NewOutboundDeliveredEgress),

	// Read-model egress: rich domain facts → frozen wire integration events.
	fx.Provide(handlers.NewMessageSentEgress),
	fx.Provide(handlers.NewMessageEditedEgress),
	fx.Provide(handlers.NewMessageDeletedEgress),
	fx.Provide(handlers.NewMessageDeliveredEgress),
	fx.Provide(handlers.NewMessageSeenEgress),
	fx.Provide(handlers.NewRemoteCreatedEgress),
	fx.Provide(handlers.NewRemoteUpdatedEgress),
	fx.Provide(handlers.NewRemoteDeletedEgress),
	fx.Provide(handlers.NewMembershipAddedEgress),
	fx.Provide(handlers.NewMembershipRemovedEgress),
	fx.Provide(handlers.NewPresenceUpdatedEgress),
	fx.Provide(handlers.NewChatPresenceUpdatedEgress),
	fx.Provide(handlers.NewContactsSyncedEgress),
	fx.Provide(handlers.NewMessagesSyncedEgress),

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
	fx.Invoke(registerReadModelHandlers),
	fx.Invoke(registerLifecycleHooks),
)

// isUndefinedTable reports whether err is Postgres 42P01 (undefined_table) — the
// expected shape when the contracts-owned gateway.channels is not migrated yet.
func isUndefinedTable(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "42P01") || strings.Contains(msg, "does not exist")
}

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

// readModelHandlers collects the read-model projectors + egress bridges so they
// can be registered without a 28-argument positional signature. Each field is a
// mediator.DomainEventHandler; fx populates them from the providers above.
type readModelHandlers struct {
	fx.In

	IM mediator.InternalMediator

	// Remote projectors (write gateway.remotes / gateway.remote_memberships).
	RemoteCreated    *projectors.RemoteCreatedProjector
	RemoteUpdated    *projectors.RemoteUpdatedProjector
	RemoteDeleted    *projectors.RemoteDeletedProjector
	MembershipAdded  *projectors.MembershipAddedProjector
	MembershipRemove *projectors.MembershipRemovedProjector
	RemoteOnRecv     *projectors.RemoteOnMessageReceivedProjector
	RemoteOnSent     *projectors.RemoteOnMessageSentProjector
	RemoteOnDeleted  *projectors.RemoteOnMessageDeletedProjector

	// Message projectors (write gateway.messages).
	MsgReceived  *projectors.MessageReceivedProjector
	MsgSent      *projectors.MessageSentProjector
	MsgEdited    *projectors.MessageEditedProjector
	MsgDeleted   *projectors.MessageDeletedProjector
	MsgDelivered *projectors.MessageDeliveredProjector
	MsgSeen      *projectors.MessageSeenProjector

	// Read-model egress bridges (domain fact → frozen wire).
	EgMsgSent      *handlers.MessageSentEgress
	EgMsgEdited    *handlers.MessageEditedEgress
	EgMsgDeleted   *handlers.MessageDeletedEgress
	EgMsgDelivered *handlers.MessageDeliveredEgress
	EgMsgSeen      *handlers.MessageSeenEgress
	EgRemoteCreate *handlers.RemoteCreatedEgress
	EgRemoteUpdate *handlers.RemoteUpdatedEgress
	EgRemoteDelete *handlers.RemoteDeletedEgress
	EgMemberAdd    *handlers.MembershipAddedEgress
	EgMemberRemove *handlers.MembershipRemovedEgress
	EgPresence     *handlers.PresenceUpdatedEgress
	EgChatPresence *handlers.ChatPresenceUpdatedEgress
	EgContactsSync *handlers.ContactsSyncedEgress
	EgMessagesSync *handlers.MessagesSyncedEgress
}

// registerReadModelHandlers subscribes the read-model projectors and their
// egress bridges on the InternalMediator (fed by the OutboxDispatcher). The
// projectors mutate the local read model; the egress bridges publish the frozen
// wire events. Both fan out from the same domain fact.
func registerReadModelHandlers(h readModelHandlers) {
	// Projectors.
	h.IM.Register(h.RemoteCreated)
	h.IM.Register(h.RemoteUpdated)
	h.IM.Register(h.RemoteDeleted)
	h.IM.Register(h.MembershipAdded)
	h.IM.Register(h.MembershipRemove)
	h.IM.Register(h.RemoteOnRecv)
	h.IM.Register(h.RemoteOnSent)
	h.IM.Register(h.RemoteOnDeleted)
	h.IM.Register(h.MsgReceived)
	h.IM.Register(h.MsgSent)
	h.IM.Register(h.MsgEdited)
	h.IM.Register(h.MsgDeleted)
	h.IM.Register(h.MsgDelivered)
	h.IM.Register(h.MsgSeen)

	// Egress bridges.
	h.IM.Register(h.EgMsgSent)
	h.IM.Register(h.EgMsgEdited)
	h.IM.Register(h.EgMsgDeleted)
	h.IM.Register(h.EgMsgDelivered)
	h.IM.Register(h.EgMsgSeen)
	h.IM.Register(h.EgRemoteCreate)
	h.IM.Register(h.EgRemoteUpdate)
	h.IM.Register(h.EgRemoteDelete)
	h.IM.Register(h.EgMemberAdd)
	h.IM.Register(h.EgMemberRemove)
	h.IM.Register(h.EgPresence)
	h.IM.Register(h.EgChatPresence)
	h.IM.Register(h.EgContactsSync)
	h.IM.Register(h.EgMessagesSync)
}

// registerLifecycleHooks restores and tears down live gateway sessions across
// the process lifecycle.
//
//   - OnStart: whatsmeow persists paired devices in its sqlstore, and the
//     channels read model records which channels are paired (account_detail set).
//     After a restart/deploy the in-process registry is empty, so we enumerate
//     the paired channels and re-Register + Connect each one — inbound messages
//     resume flowing without a human re-hitting POST /connect.
//   - OnStop: cleanly disconnect every live session (cancels the adapter
//     goroutines) via the registry's DisconnectAll.
//
// Boot ordering: gateway.channels is owned by the `gateway` pg schema declared in
// packages/contracts (Drizzle), NOT by the Go worker. On a scratch database the
// table only exists after `bun migrate:dev` runs. So in the two-process topology
// `bun migrate:dev` MUST run before the Go gateway boots. Until it does, ListPaired
// hits an undefined table (SQLSTATE 42P01); that is an EXPECTED first-boot state,
// so it is logged at Warn (not Error) and the hook returns success — the server
// still starts and reads clean once migrations land.
func registerLifecycleHooks(
	lc fx.Lifecycle,
	reg registry.ChannelRegistry,
	repo projections.ChannelProjectionRepository,
) {
	lc.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			paired, err := repo.ListPaired(ctx)
			if err != nil {
				// Non-fatal: boot the gateway even if the read model is
				// unavailable — the operator can still re-Connect manually.
				if isUndefinedTable(err) {
					// Expected on a scratch DB before `bun migrate:dev` creates
					// gateway.channels. Warn, don't Error — scratch boot reads clean.
					slog.Warn("channel bootstrap: gateway.channels not migrated yet; run `bun migrate:dev` (skipping paired-session restore)", "error", err)
				} else {
					slog.Error("channel bootstrap: list paired channels failed", "error", err)
				}
				return nil
			}
			for _, p := range paired {
				channelID, perr := uuid.Parse(p.ID)
				if perr != nil {
					slog.Warn("channel bootstrap: bad channel id, skipping", "id", p.ID, "error", perr)
					continue
				}
				ch, rerr := reg.Register(ctx, channelID, gateway.ChannelConfig{
					OwnerID:       p.OwnerID,
					OwnerRemoteID: p.AccountDetail,
				})
				if rerr != nil {
					slog.Error("channel bootstrap: register failed", "channelId", channelID, "error", rerr)
					continue
				}
				if cerr := ch.Connect(ctx); cerr != nil {
					slog.Error("channel bootstrap: reconnect failed", "channelId", channelID, "error", cerr)
					continue
				}
				slog.Info("channel bootstrap: reconnected paired session", "channelId", channelID)
			}
			slog.Info("channel bootstrap complete", "restored", reg.Count())
			return nil
		},
		OnStop: func(_ context.Context) error {
			reg.DisconnectAll()
			return nil
		},
	})
}
