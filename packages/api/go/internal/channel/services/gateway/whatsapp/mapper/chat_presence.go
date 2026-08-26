package mapper

import (
	"time"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types/events"

	msgenums "template/api-go/internal/channel/enums"
	ctxevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

func mapChatPresence(instanceID uuid.UUID, ownerID string, device *store.Device, v *events.ChatPresence) []types.DomainEventI {
	chatJID := resolvePN(device, v.Chat)
	senderJID := resolvePN(device, v.Sender)
	return []types.DomainEventI{
		ctxevents.NewChatPresenceUpdatedEvent(instanceID, ownerID, ctxevents.ChannelChatPresenceUpdatedPayload{
			ChannelID:  instanceID,
			ChatID:     stripDeviceSuffix(chatJID.String()),
			SenderID:   stripDeviceSuffix(senderJID.String()),
			State:      msgenums.ChatPresenceType(v.State),
			ObservedAt: time.Now().UTC(),
			OwnerID:    ownerID,
		}),
	}
}
