package mapper

import (
	"time"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/proto/waHistorySync"
	"go.mau.fi/whatsmeow/proto/waWeb"
	"go.mau.fi/whatsmeow/store"
	waMeowTypes "go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"

	channelenums "template/api-go/internal/channel/enums"
	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/projections"
	sharedenums "template/api-go/internal/shared/enums"
	"template/api-go/internal/shared/types"
)

// mapHistorySync translates a whatsmeow HistorySync into a gateway progress event only.
//
// Bulk message projection is performed by WhatsmeowChannel.processHistorySyncMessages
// directly against the MessageProjectionRepository (ACL layer), avoiding the
// 2k+ event-rows-per-reconnect problem. This mapper only emits the
// gateway_history_sync progress event so consumers can observe sync progress.
func mapHistorySync(instanceID uuid.UUID, ownerID string, device *store.Device, v *events.HistorySync) []types.DomainEventI {
	if v == nil || v.Data == nil {
		return nil
	}
	out := []types.DomainEventI{}

	// ---- SyncType-gated: progress event ----
	syncType := mapHistorySyncType(v.Data.GetSyncType())
	if syncType != "" {
		out = append(out, ctxevents.NewGatewayHistorySyncEvent(instanceID, ownerID, ctxevents.ChannelGatewayHistorySyncPayload{
			ChannelID:       instanceID,
			OwnerID:         ownerID,
			HistorySyncType: syncType,
			Percent:         v.Data.GetProgress(),
		}))
	}

	if len(out) == 0 {
		return nil
	}
	return out
}

func mapHistorySyncType(t waHistorySync.HistorySync_HistorySyncType) channelenums.HistorySyncType {
	switch t {
	case waHistorySync.HistorySync_INITIAL_BOOTSTRAP:
		return channelenums.HistorySyncTypeInitial
	case waHistorySync.HistorySync_RECENT:
		return channelenums.HistorySyncTypeRecent
	default:
		return ""
	}
}

// BuildHistorySyncMessageRecords extracts all messages from a HistorySync proto
// and returns a slice of Message projection records suitable for bulk
// UpsertAllIfNew. Each record gets OccurredAt from the message timestamp and
// ObservedAt from now (when our server processed this batch).
//
// Called by WhatsmeowChannel.processHistorySyncMessages.
func BuildHistorySyncMessageRecords(
	instanceID uuid.UUID,
	device *store.Device,
	data *waHistorySync.HistorySync,
	now time.Time,
) []*projections.Message {
	if data == nil {
		return nil
	}

	var records []*projections.Message
	// observedSeq increments by 1 µs per record to preserve WhatsApp's original
	// message ordering within same-second timestamps. Postgres timestamptz has
	// microsecond precision; using 1 µs guarantees distinct values without
	// drifting meaningfully from the actual observed time.
	observedSeq := now
	for _, conv := range data.GetConversations() {
		if conv == nil {
			continue
		}
		chatIDStr := conv.GetID()
		if chatIDStr == "" {
			continue
		}

		chatJID, err := waMeowTypes.ParseJID(chatIDStr)
		if err != nil || chatJID.IsEmpty() {
			continue
		}
		// Skip broadcast/status/newsletter chats.
		if chatJID.Server == "broadcast" || chatJID.Server == "newsletter" {
			continue
		}
		resolvedChat := resolvePN(device, chatJID).ToNonAD()
		remoteID := stripDeviceSuffix(resolvedChat.String())

		for _, histMsg := range conv.GetMessages() {
			if histMsg == nil {
				continue
			}
			rec := buildHistoryMessageRecord(instanceID, device, remoteID, histMsg.GetMessage(), now, observedSeq)
			if rec != nil {
				records = append(records, rec)
				observedSeq = observedSeq.Add(time.Microsecond)
			}
		}
	}
	return records
}

// buildHistoryMessageRecord converts a single WebMessageInfo proto into a
// Message projection record. Returns nil for protocol messages, unknown types,
// or messages with an empty ID.
func buildHistoryMessageRecord(
	instanceID uuid.UUID,
	device *store.Device,
	remoteID string,
	info *waWeb.WebMessageInfo,
	now time.Time,
	observedAt time.Time,
) *projections.Message {
	if info == nil || info.Key == nil {
		return nil
	}
	msgID := info.Key.GetID()
	if msgID == "" {
		return nil
	}

	msgType, content := extractMessageContent(info.Message)
	if msgType == "protocol" || msgType == "unknown" {
		return nil
	}

	fromMe := info.Key.GetFromMe()
	direction := channelenums.DirectionReceived
	if fromMe {
		direction = channelenums.DirectionSent
	}

	// Resolve the sender remote_id. For group messages, Participant holds the
	// sender; for DMs it's the remote (received) or our own device (sent).
	senderRemoteID := ""
	if info.Participant != nil && *info.Participant != "" {
		senderJID, parseErr := waMeowTypes.ParseJID(*info.Participant)
		if parseErr == nil && !senderJID.IsEmpty() {
			senderRemoteID = stripDeviceSuffix(resolvePN(device, senderJID).ToNonAD().String())
		}
	}
	if senderRemoteID == "" {
		if fromMe && device != nil && device.ID != nil {
			senderRemoteID = stripDeviceSuffix(resolvePN(device, *device.ID).ToNonAD().String())
		} else {
			senderRemoteID = remoteID
		}
	}

	occurredAt := now
	if info.MessageTimestamp != nil {
		occurredAt = time.Unix(int64(*info.MessageTimestamp), 0).UTC()
	}

	deliveredAt, seenAt := historyMsgReceipts(occurredAt)

	return &projections.Message{
		ID:                uuid.New().String(),
		ChannelID:         instanceID.String(),
		RemoteID:          remoteID,
		PlatformMessageID: msgID,
		Direction:         string(direction),
		Platform:          sharedenums.PlatformWhatsApp,
		SenderRemoteID:    senderRemoteID,
		Content:           content,
		OccurredAt:        occurredAt,
		ObservedAt:        observedAt,
		DeliveredAt:       deliveredAt,
		SeenAt:            seenAt,
	}
}

// historyMsgReceipts returns delivered_at = t and seen_at = nil for all
// history sync messages. Delivery is certain (the message is in history),
// but seen status is left nil so it can only advance via live read receipts.
func historyMsgReceipts(t time.Time) (deliveredAt, seenAt *time.Time) {
	deliveredAt = &t
	return
}
