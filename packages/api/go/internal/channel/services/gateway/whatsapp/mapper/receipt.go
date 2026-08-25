package mapper

import (
	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types/events"

	"template/api-go/internal/channel/enums"
	ctxevents "template/api-go/internal/channel/events"
	waenums "template/api-go/internal/channel/services/gateway/whatsapp/enums"
	"template/core-go/types"
)

// mapReceipt produces either channel.message_delivered or channel.message_seen.
// read-self collapses into message_seen with Self=true.
func mapReceipt(instanceID uuid.UUID, ownerID string, device *store.Device, v *events.Receipt) types.DomainEventI {
	messageIDs := make([]string, len(v.MessageIDs))
	for i, id := range v.MessageIDs {
		messageIDs[i] = string(id)
	}

	receiptChat := resolvePN(device, v.Chat)
	receiptSender := resolvePN(device, v.Sender)
	remoteID := stripDeviceSuffix(receiptChat.String())
	senderJID := stripDeviceSuffix(receiptSender.String())

	// whatsmeow uses an empty string for the "delivery" receipt (the WhatsApp
	// protocol's plain delivery ack carries no <type> attr). Normalise to our
	// canonical shape.
	receiptType := waenums.ReceiptType(v.Type)
	if receiptType == "" {
		receiptType = waenums.ReceiptTypeDelivered
	}

	switch receiptType {
	case waenums.ReceiptTypeDelivered:
		return ctxevents.NewMessageDeliveredEvent(instanceID, ownerID, ctxevents.ChannelMessageDeliveredPayload{
			ChannelID:  instanceID,
			RemoteID:   remoteID,
			SenderID:   senderJID,
			MessageIDs: messageIDs,
			Timestamp:  v.Timestamp.Unix(),
			Platform:   string(enums.PlatformWhatsApp),
			OwnerID:    ownerID,
		})
	case waenums.ReceiptTypeRead, waenums.ReceiptTypePlayed, waenums.ReceiptTypeReadSelf:
		return ctxevents.NewMessageSeenEvent(instanceID, ownerID, ctxevents.ChannelMessageSeenPayload{
			ChannelID:  instanceID,
			RemoteID:   remoteID,
			SenderID:   senderJID,
			MessageIDs: messageIDs,
			Timestamp:  v.Timestamp.Unix(),
			Self:       receiptType == waenums.ReceiptTypeReadSelf,
			Platform:   string(enums.PlatformWhatsApp),
			OwnerID:    ownerID,
		})
	default:
		return nil
	}
}
