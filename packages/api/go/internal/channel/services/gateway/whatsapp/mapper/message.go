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

// mapMessage produces either channel.message_sent or channel.message_received
// depending on Info.IsFromMe.
func mapMessage(instanceID uuid.UUID, ownerID string, device *store.Device, media MediaLocator, v *events.Message) types.DomainEventI {
	mediaPath := ""
	if media != nil {
		mediaPath = media.LocateMedia(v.Message)
	}
	msgType, content := extractMessageContent(v.Message, mediaPath)
	if msgType == "protocol" || msgType == "unknown" {
		return nil
	}
	if v.Info.Chat.Server == "broadcast" {
		// Status broadcasts (WhatsApp Stories) — not real chat messages.
		return nil
	}

	// Canonical remote_id: PN (@s.whatsapp.net) for user chats, group-JID (@g.us)
	// for groups. resolvePN converts LID→PN when the mapping is available in the
	// device store, and passes group JIDs and unknown IDs through unchanged.
	chatID := resolvePN(device, v.Info.Chat)
	senderID := resolvePN(device, v.Info.Sender)

	// For received direct messages, whatsmeow sets Info.Chat = sender's JID.
	// Keep remote_id = the counterparty (chat) for all cases.
	remoteID := stripDeviceSuffix(chatID.String())
	senderRemoteID := stripDeviceSuffix(senderID.String())

	if v.Info.IsFromMe {
		// Owner-authored message — either echoed back from our own
		// ch.SendMessage call or sent from another device (phone, other
		// web client). Emit channel.message_sent either way; the handler
		// deduplicates by MessageID (FindByMessageID guard) so a same-
		// message echo is a no-op instead of a double save.
		return ctxevents.NewMessageSentEvent(instanceID, ownerID, ctxevents.ChannelMessageSentPayload{
			ChannelID:         instanceID,
			MessageID:         v.Info.ID,
			InternalMessageID: uuid.New(),
			RemoteID:          remoteID,
			SenderID:          senderRemoteID,
			IsGroup:           v.Info.IsGroup,
			Timestamp:         v.Info.Timestamp.Unix(),
			OccurredAt:        time.Unix(v.Info.Timestamp.Unix(), 0).UTC(),
			ObservedAt:        time.Now().UTC(),
			MessageType:       msgenums.MessageType(msgType),
			Content:           content,
			Platform:          msgenums.PlatformWhatsApp,
			PlatformData: marshalPlatformData(ctxevents.WhatsAppChannelMessageSentPlatformData{
				IsGroup: v.Info.IsGroup,
			}),
			OwnerID: ownerID,
		})
	}

	return ctxevents.NewMessageReceivedEvent(instanceID, ownerID, ctxevents.ChannelMessageReceivedPayload{
		ChannelID:         instanceID,
		MessageID:         v.Info.ID,
		InternalMessageID: uuid.New(),
		RemoteID:          remoteID,
		SenderID:          senderRemoteID,
		FromMe:            false,
		// A RECEIVED message is, by definition, someone on the other side of the conversation typing.
		// Set explicitly rather than left to the zero value: the contract declares the field required,
		// and an empty string would make the wire type lie to every consumer.
		Author:      msgenums.MessageAuthorHuman,
		IsGroup:     v.Info.IsGroup,
		Timestamp:   v.Info.Timestamp.Unix(),
		OccurredAt:  time.Unix(v.Info.Timestamp.Unix(), 0).UTC(),
		ObservedAt:  time.Now().UTC(),
		MessageType: msgenums.MessageType(msgType),
		Content:     content,
		Platform:    string(msgenums.PlatformWhatsApp),
		PlatformData: marshalPlatformData(ctxevents.WhatsAppChannelMessageReceivedPlatformData{
			IsEphemeral: v.IsEphemeral,
			IsViewOnce:  v.IsViewOnce || v.IsViewOnceV2,
			IsGroup:     v.Info.IsGroup,
			PushName:    v.Info.PushName,
		}),
		OwnerID: ownerID,
	})
}
