package events

import (
	"time"

	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelRemotePinnedPayload is the data carried by the remote-pinned domain event.
type ChannelRemotePinnedPayload struct {
	ChannelID uuid.UUID `json:"channelId"`
	RemoteID  string    `json:"remoteId"`
	At        time.Time `json:"at"`
	OwnerID   string    `json:"ownerId"`
}

// RemotePinnedEventName is the in-process domain event name raised when a
// remote is pinned — either by an explicit command from this service or via
// WhatsApp app-state sync from another device. Kept on the `channel.` prefix
// (rather than `remote.`) to match the service/bounded-context perspective
// that BFF queries already depend on.
const RemotePinnedEventName = "channel.remote_pinned"

type RemotePinnedEvent = types.DomainEvent[ChannelRemotePinnedPayload]

func NewRemotePinnedEvent(entityID uuid.UUID, ownerID string, payload ChannelRemotePinnedPayload) RemotePinnedEvent {
	return types.NewDomainEvent(RemotePinnedEventName, entityID, ownerID, payload)
}
