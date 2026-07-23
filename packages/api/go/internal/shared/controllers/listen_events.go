package controllers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	channelevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/services/gateway"
	whatsapp "template/api-go/internal/channel/services/gateway/whatsapp"
	waevents "template/api-go/internal/channel/services/gateway/whatsapp/events"
	sharedevents "template/api-go/internal/shared/events"
	"template/api-go/pkg/httputil"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// sseEventWhitelist defines which domain events are forwarded directly to SSE clients.
//
// Rule: only domain events WITHOUT integration handlers belong here.
// Events that have integration handlers (e.g. RemoteCreated, RemoteDeleted,
// RemotesSynced, MessagesSynced, MembershipAdded, MembershipRemoved) reach the
// frontend via ExternalMediator automatically — adding them here causes each
// event to be broadcast twice (once as a domain event, once as an integration event),
// doubling SSE traffic on bootstrap.
var sseEventWhitelist = map[string]bool{
	channelevents.GatewayConnectedEventName:    true,
	channelevents.GatewayDisconnectedEventName: true,
	channelevents.GatewayLoggedOutEventName:    true,
	channelevents.MessageReceivedEventName:     true,
	channelevents.MessageDeliveredEventName:    true,
	channelevents.MessageSeenEventName:         true,
	channelevents.GatewayPlatformEventName:     true,

	// Presence — typed events replacing the generic special_platform_event variants.
	channelevents.PresenceUpdatedEventName:     true,
	channelevents.ChatPresenceUpdatedEventName: true,

	// Sync lifecycle — business domain events stream to SSE for frontend hooks.
	// Integration counterparts also flow to the frontend via ExternalMediator.
	channelevents.SyncStartedEventName:   true,
	channelevents.SyncProgressEventName:  true,
	channelevents.SyncCompletedEventName: true,
}

// EventPayloads is a documentation-only type referenced by the SSE endpoint.
// It serves two purposes:
// 1. SSE event payloads — used by the emitter to build the ServerEvent oneOf union
// 2. Union variant types — used by patchDiscriminatedUnions to type json.RawMessage fields
// Both the struct and all variant definitions are removed from swagger after processing.
type EventPayloads struct {
	// ── SSE Event Payloads ──
	ChannelConnected     *channelevents.GatewayConnectedPayload            `json:"channelConnected,omitempty"`
	ChannelDisconnected  *channelevents.GatewayDisconnectedPayload         `json:"channelDisconnected,omitempty"`
	ChannelLoggedOut     *channelevents.ChannelLoggedOutPayload            `json:"channelLoggedOut,omitempty"`
	MessageReceived      *channelevents.ChannelMessageReceivedPayload      `json:"messageReceived,omitempty"`
	MessageDelivered     *channelevents.ChannelMessageDeliveredPayload     `json:"messageDelivered,omitempty"`
	MessageSeen          *channelevents.ChannelMessageSeenPayload          `json:"messageSeen,omitempty"`
	SpecialPlatformEvent *channelevents.ChannelSpecialPlatformEventPayload `json:"specialPlatformEvent,omitempty"`

	// ── Presence (typed events — replaces special_platform_event variants) ──
	PresenceUpdated     *channelevents.ChannelPresenceUpdatedPayload     `json:"presenceUpdated,omitempty"`
	ChatPresenceUpdated *channelevents.ChannelChatPresenceUpdatedPayload `json:"chatPresenceUpdated,omitempty"`

	// ── Remote observation (unified snapshot) ──
	RemoteUpdated *channelevents.ChannelRemoteUpdatedPayload `json:"remoteUpdated,omitempty"`

	// ── Sync lifecycle ──
	SyncStarted   *channelevents.ChannelSyncStartedPayload   `json:"syncStarted,omitempty"`
	SyncProgress  *channelevents.ChannelSyncProgressPayload  `json:"syncProgress,omitempty"`
	SyncCompleted *channelevents.ChannelSyncCompletedPayload `json:"syncCompleted,omitempty"`

	// ── ChannelEvent envelope (discriminated union over all channel events) ──
	// The @variant list on ChannelEvent includes all domain event payload types
	// that consumers (e.g. GetChannelSidebar) read from shared.events for
	// projection replay. Payloads below without corresponding SSE whitelist
	// entries are projection-only: they flow in-process via InternalMediator
	// and land in shared.events but are NOT pushed to SSE clients.
	ChannelEvent *sharedevents.ChannelEvent `json:"channelEvent,omitempty"`

	// ── Domain event payload variants (projection-only, no SSE) ──
	MessageSent        *channelevents.ChannelMessageSentPayload          `json:"messageSent,omitempty"`
	MessageEdited      *channelevents.ChannelMessageEditedPayload        `json:"messageEdited,omitempty"`
	MessageDeleted     *channelevents.ChannelMessageDeletedPayload       `json:"messageDeleted,omitempty"`
	RemotePinned       *channelevents.ChannelRemotePinnedPayload         `json:"remotePinned,omitempty"`
	RemoteUnpinned     *channelevents.ChannelRemoteUnpinnedPayload       `json:"remoteUnpinned,omitempty"`
	RemoteArchived     *channelevents.ChannelRemoteArchivedPayload       `json:"remoteArchived,omitempty"`
	RemoteUnarchived   *channelevents.ChannelRemoteUnarchivedPayload     `json:"remoteUnarchived,omitempty"`
	RemoteMuted        *channelevents.ChannelRemoteMutedPayload          `json:"remoteMuted,omitempty"`
	RemoteUnmuted      *channelevents.ChannelRemoteUnmutedPayload        `json:"remoteUnmuted,omitempty"`
	RemoteMarkedUnread *channelevents.ChannelRemoteMarkedAsUnreadPayload `json:"remoteMarkedUnread,omitempty"`
	RemoteChatSeen     *channelevents.ChannelRemoteChatSeenPayload       `json:"remoteChatSeen,omitempty"`
	RemoteCreated      *channelevents.ChannelRemoteCreatedPayload        `json:"remoteCreated,omitempty"`
	RemoteDeleted      *channelevents.ChannelRemoteDeletedPayload        `json:"remoteDeleted,omitempty"`
	RemotesSynced      *channelevents.ChannelRemotesSyncedPayload        `json:"remotesSynced,omitempty"`
	MessagesSynced     *channelevents.ChannelMessagesSyncedPayload       `json:"messagesSynced,omitempty"`
	MembershipAdded    *channelevents.ChannelMembershipAddedPayload      `json:"membershipAdded,omitempty"`
	MembershipRemoved  *channelevents.ChannelMembershipRemovedPayload    `json:"membershipRemoved,omitempty"`

	// ── @union Variant Types (ensure swaggo generates their definitions) ──

	// ChannelMessageReceivedPayload.PlatformData variants
	WhatsAppChannelMessageReceivedPlatformData *channelevents.WhatsAppChannelMessageReceivedPlatformData `json:"WhatsAppChannelMessageReceivedPlatformData,omitempty"`
	InternalChannelMessageReceivedPlatformData *channelevents.InternalChannelMessageReceivedPlatformData `json:"InternalChannelMessageReceivedPlatformData,omitempty"`

	// ChannelMessageSentPayload.PlatformData variants
	WhatsAppChannelMessageSentPlatformData *channelevents.WhatsAppChannelMessageSentPlatformData `json:"WhatsAppChannelMessageSentPlatformData,omitempty"`
	InternalChannelMessageSentPlatformData *channelevents.InternalChannelMessageSentPlatformData `json:"InternalChannelMessageSentPlatformData,omitempty"`

	// ChannelSpecialPlatformEventPayload.Payload variants
	WhatsAppQRCodeUpdated *waevents.WhatsAppQRCodeUpdated `json:"whatsAppQRCodeUpdated,omitempty"`

	// Integration.Credentials variants
	WhatsAppCredentials *whatsapp.WhatsAppCredentials `json:"whatsAppCredentials,omitempty"`

	// ── @union Content Variant Types (ChannelMessageReceivedPayload.Content) ──
	WhatsAppTextContent     *whatsapp.WhatsAppTextContent     `json:"whatsAppTextContent,omitempty"`
	WhatsAppImageContent    *whatsapp.WhatsAppImageContent    `json:"whatsAppImageContent,omitempty"`
	WhatsAppVideoContent    *whatsapp.WhatsAppVideoContent    `json:"whatsAppVideoContent,omitempty"`
	WhatsAppAudioContent    *whatsapp.WhatsAppAudioContent    `json:"whatsAppAudioContent,omitempty"`
	WhatsAppDocumentContent *whatsapp.WhatsAppDocumentContent `json:"whatsAppDocumentContent,omitempty"`
	WhatsAppStickerContent  *whatsapp.WhatsAppStickerContent  `json:"whatsAppStickerContent,omitempty"`
	WhatsAppLocationContent *whatsapp.WhatsAppLocationContent `json:"whatsAppLocationContent,omitempty"`
	WhatsAppContactContent  *whatsapp.WhatsAppContactContent  `json:"whatsAppContactContent,omitempty"`
	WhatsAppPollContent     *whatsapp.WhatsAppPollContent     `json:"whatsAppPollContent,omitempty"`
	WhatsAppReactionContent *whatsapp.WhatsAppReactionContent `json:"whatsAppReactionContent,omitempty"`
	InternalTextContent     *gateway.InternalTextContent      `json:"InternalTextContent,omitempty"`
}

type ListenEventsController struct {
	internalMediator mediator.InternalMediator
	externalMediator mediator.ExternalMediator
	clients          map[chan []byte]struct{}
	mu               sync.RWMutex
	once             sync.Once
}

func NewListenEventsController(internalM mediator.InternalMediator, externalM mediator.ExternalMediator) *ListenEventsController {
	return &ListenEventsController{
		internalMediator: internalM,
		externalMediator: externalM,
		clients:          make(map[chan []byte]struct{}),
	}
}

// compile-time interface check.
var _ types.Controller = (*ListenEventsController)(nil)

func (c *ListenEventsController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "",
		Path:        "/events",
		Method:      "GET",
		Description: "Listen to events via SSE",
		Tags:        []string{"Events"},

		Response: EventPayloads{},
		Status:   http.StatusOK,
	}
}

// @Description  Streams all domain events as Server-Sent Events. The data field contains a JSON-encoded DomainEvent where the payload varies by eventName. See EventPayloads for all possible payload types.
func (c *ListenEventsController) Handle(w http.ResponseWriter, r *http.Request) {
	c.ensureBroadcaster()

	flusher, ok := w.(http.Flusher)
	if !ok {
		httputil.RespondError(w, fmt.Errorf("streaming not supported"))
		return
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	// Create client channel
	clientCh := make(chan []byte, 64)
	c.mu.Lock()
	c.clients[clientCh] = struct{}{}
	c.mu.Unlock()

	// Send initial connected comment
	fmt.Fprintf(w, ": connected\n\n")
	flusher.Flush()

	// Ping ticker
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	// Cleanup on disconnect
	defer func() {
		c.mu.Lock()
		delete(c.clients, clientCh)
		c.mu.Unlock()
	}()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case data := <-clientCh:
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		case <-ticker.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		}
	}
}

func (c *ListenEventsController) ensureBroadcaster() {
	c.once.Do(func() {
		// Forward whitelisted domain events (from WhatsApp gateway)
		c.internalMediator.RegisterCallback(func(ctx context.Context, event types.DomainEventI) {
			if !sseEventWhitelist[event.GetEventName()] {
				return
			}
			data, err := json.Marshal(event)
			if err != nil {
				slog.Error("failed to marshal domain event for SSE", "error", err)
				return
			}
			c.broadcast(data)
		})

		// Forward integration events (from handlers, e.g. ChannelIntegrationConnected)
		c.externalMediator.RegisterCallback(func(ctx context.Context, event types.IntegrationEventI) {
			data, err := json.Marshal(event)
			if err != nil {
				slog.Error("failed to marshal integration event for SSE", "error", err)
				return
			}
			c.broadcast(data)
		})
	})
}

func (c *ListenEventsController) broadcast(data []byte) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for clientCh := range c.clients {
		select {
		case clientCh <- data:
		default:
		}
	}
}
