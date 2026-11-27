package mapper

import (
	"encoding/json"
	"time"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types/events"
)

// MessageEdit is a decoded WhatsApp edit (protocolMessage type MESSAGE_EDIT).
type MessageEdit struct {
	TargetID    string          // platform_message_id of the edited message
	RemoteID    string          // canonical remote_id (PN for users, group JID), same rule as mapMessage
	MessageType string          // type of the NEW content (TEXT, IMAGE, ...)
	Content     json.RawMessage // new content, same JSON shape gateway_messages.content uses
	EditedAt    time.Time
}

// DecodeEdit returns the edit carried by v, or ok=false when v is not an edit.
// whatsmeow's UnwrapRaw leaves edits as a ProtocolMessage{Type: MESSAGE_EDIT,
// Key: original, EditedMessage: new content}; mapMessage drops those as
// "protocol", so they are handled here instead.
func DecodeEdit(device *store.Device, v *events.Message) (MessageEdit, bool) {
	if v == nil || v.Message == nil {
		return MessageEdit{}, false
	}
	pm := v.Message.GetProtocolMessage()
	if pm == nil || pm.GetType() != waE2E.ProtocolMessage_MESSAGE_EDIT || pm.GetEditedMessage() == nil {
		return MessageEdit{}, false
	}
	target := pm.GetKey().GetID()
	if target == "" {
		return MessageEdit{}, false
	}
	msgType, content := extractMessageContent(pm.GetEditedMessage(), "")
	if content == nil || msgType == "protocol" || msgType == "unknown" {
		return MessageEdit{}, false
	}
	at := v.Info.Timestamp
	if ms := pm.GetTimestampMS(); ms > 0 {
		at = time.UnixMilli(ms)
	}
	if at.IsZero() {
		at = time.Now()
	}
	return MessageEdit{
		TargetID:    target,
		RemoteID:    stripDeviceSuffix(resolvePN(device, v.Info.Chat).String()),
		MessageType: msgType,
		Content:     content,
		EditedAt:    at.UTC(),
	}, true
}
