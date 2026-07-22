package whatsapp

// mapper.go is the whatsmeow → domain ACL. It is the single place raw whatsmeow
// events become CodeDM domain events; everything downstream speaks the domain
// vocabulary. Only the subset the frozen contract needs is mapped — inbound
// text messages and the disconnect lifecycle. Connection + QR facts are raised
// directly by the adapter (they need live client state), so they are not here.

import (
	"time"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types/events"

	chanevents "template/api-go/internal/channel/events"
	"template/contracts-go/wire"
	"template/core-go/types"
)

// mapEvent converts a raw whatsmeow event into zero or more domain events.
// Returns nil for event types with no mapping.
func mapEvent(channelID uuid.UUID, ownerID string, device *store.Device, evt any) []types.DomainEventI {
	switch v := evt.(type) {
	case *events.Message:
		if e := mapMessage(channelID, ownerID, device, v); e != nil {
			return []types.DomainEventI{e}
		}
		return nil

	case *events.LoggedOut:
		// TERMINAL only. events.LoggedOut is the platform-side unpair (the user
		// removed the linked device). It maps to the terminal channel.disconnected
		// fact → wire integration.channel.disconnected (BC4 parks the threads) and
		// clears the read-model pairing.
		return []types.DomainEventI{
			chanevents.NewDisconnectedEvent(channelID, ownerID, chanevents.DisconnectedPayload{
				ChannelID: channelID,
				Kind:      wire.ChannelKindWHATSAPP,
				OwnerID:   ownerID,
			}),
		}

	// events.Disconnected / events.StreamReplaced are TRANSIENT. client.EnableAutoReconnect
	// swallows them (whatsmeow reconnects), so emitting no domain event avoids
	// churning the frozen wire and flipping the read model on every network blip.
	default:
		return nil
	}
}

// mapMessage produces channel.message_received for inbound text. Owner-authored
// echoes, non-text content, and status broadcasts are skipped — the gateway
// only forwards inbound human text to the router.
func mapMessage(channelID uuid.UUID, ownerID string, device *store.Device, v *events.Message) types.DomainEventI {
	if v.Info.IsFromMe {
		return nil
	}
	if v.Info.Chat.Server == "broadcast" {
		return nil
	}
	text := extractText(v.Message)
	if text == "" {
		return nil
	}

	// Canonical external ids: PN (@s.whatsapp.net) for users, group JID (@g.us)
	// for groups. resolvePN converts LID→PN when the device store knows the
	// mapping and passes groups/unknowns through.
	contactJID := resolvePN(device, v.Info.Chat)
	senderJID := resolvePN(device, v.Info.Sender)

	displayName := v.Info.PushName

	return chanevents.NewMessageReceivedEvent(channelID, ownerID, chanevents.MessageReceivedPayload{
		ChannelID:   channelID,
		MessageID:   v.Info.ID,
		ContactID:   StripDeviceSuffix(contactJID.String()),
		DisplayName: displayName,
		SenderID:    StripDeviceSuffix(senderJID.String()),
		IsGroup:     v.Info.IsGroup,
		Text:        text,
		QuotedID:    quotedStanzaID(v.Message),
		Kind:        wire.ChannelKindWHATSAPP,
		ReceivedAt:  time.Unix(v.Info.Timestamp.Unix(), 0).UTC(),
		OwnerID:     ownerID,
	})
}
