// Package mapper converts raw whatsmeow events into DomainEvents.
// The only exported entry point is MapEvent; all per-case helpers are unexported.
package mapper

import (
	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types/events"

	"template/core-go/types"
)

// MapEvent converts a raw whatsmeow event into zero or more DomainEvents.
// Returns nil (or an empty slice) for event types that have no mapping.
// media is the channel's MediaLocator; nil declares the caller has no media
// capability (mock gateway) and media messages map without a mediaPath.
func MapEvent(instanceID uuid.UUID, ownerID string, device *store.Device, media MediaLocator, evt any) []types.DomainEventI {
	switch v := evt.(type) {

	// ──────────────────────────────────────────────
	// Connection
	// ──────────────────────────────────────────────

	case *events.Connected:
		return mapConnected(instanceID, ownerID, v)

	case *events.Disconnected, *events.StreamReplaced:
		return mapDisconnected(instanceID, ownerID)

	case *events.LoggedOut:
		return mapLoggedOut(instanceID, ownerID, v)

	case *events.PairSuccess, *events.PairError:
		return nil

	// ──────────────────────────────────────────────
	// Messages: split Sent vs Received by direction
	// ──────────────────────────────────────────────

	case *events.Message:
		return wrap(mapMessage(instanceID, ownerID, device, media, v))

	// ──────────────────────────────────────────────
	// Receipts: split Delivered vs Seen by type
	// ──────────────────────────────────────────────

	case *events.Receipt:
		return wrap(mapReceipt(instanceID, ownerID, device, v))

	// ──────────────────────────────────────────────
	// History sync: only INITIAL_BOOTSTRAP and RECENT are surfaced
	// ──────────────────────────────────────────────

	case *events.HistorySync:
		return mapHistorySync(instanceID, ownerID, device, v)

	case *events.AppStateSyncComplete:
		return mapAppStateSyncComplete(instanceID, ownerID, v)

	// ──────────────────────────────────────────────
	// Platform-specific presence and remote updates
	// ──────────────────────────────────────────────

	case *events.ChatPresence:
		return mapChatPresence(instanceID, ownerID, device, v)

	case *events.Presence:
		return mapPresence(instanceID, ownerID, device, v)

	case *events.PushName:
		return mapPushName(instanceID, ownerID, device, v)

	case *events.Contact:
		return mapContact(instanceID, ownerID, device, v)

	case *events.Picture:
		return mapPicture(instanceID, ownerID, device, v)

	case *events.GroupInfo:
		return mapGroupInfo(instanceID, ownerID, device, v)

	case *events.JoinedGroup:
		return mapJoinedGroup(instanceID, ownerID, device, v)

	// ──────────────────────────────────────────────
	// Echo-to-action: chat-setting changes propagated from other devices
	// (phone, other web clients). WhatsApp dispatches these via the
	// AppState sync mechanism — each action carries a boolean state, so we
	// translate into the matching on/off channel.remote_* domain event.
	// ──────────────────────────────────────────────

	case *events.Pin:
		return wrap(mapPin(instanceID, ownerID, device, v))

	case *events.Mute:
		return wrap(mapMute(instanceID, ownerID, device, v))

	case *events.Archive:
		return wrap(mapArchive(instanceID, ownerID, device, v))

	case *events.MarkChatAsRead:
		return wrap(mapMarkChatAsRead(instanceID, ownerID, device, v))

	default:
		return nil
	}
}
