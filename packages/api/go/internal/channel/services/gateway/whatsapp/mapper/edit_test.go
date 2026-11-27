package mapper

import (
	"strings"
	"testing"
	"time"

	"go.mau.fi/whatsmeow/proto/waCommon"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"
)

func editEvent(target, text string, tsMs int64) *events.Message {
	return &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{Chat: types.NewJID("120363000000000001", types.GroupServer), IsGroup: true},
			Timestamp:     time.Unix(100, 0),
		},
		Message: &waE2E.Message{ProtocolMessage: &waE2E.ProtocolMessage{
			Type:          waE2E.ProtocolMessage_MESSAGE_EDIT.Enum(),
			Key:           &waCommon.MessageKey{ID: proto.String(target)},
			EditedMessage: &waE2E.Message{Conversation: proto.String(text)},
			TimestampMS:   proto.Int64(tsMs),
		}},
		IsEdit: true,
	}
}

func TestDecodeEdit(t *testing.T) {
	e, ok := DecodeEdit(nil, editEvent("ORIG1", "resposta final", 1_700_000_000_123))
	if !ok {
		t.Fatal("edit not decoded")
	}
	if e.TargetID != "ORIG1" || e.RemoteID != "120363000000000001@g.us" || e.EditedAt.UnixMilli() != 1_700_000_000_123 {
		t.Fatalf("bad edit: %+v", e)
	}
	if !strings.Contains(string(e.Content), "resposta final") {
		t.Fatalf("content: %s", e.Content)
	}
	// a normal text message and a revoke are not edits
	plain := &events.Message{Message: &waE2E.Message{Conversation: proto.String("oi")}}
	revoke := editEvent("X", "y", 1)
	revoke.Message.ProtocolMessage.Type = waE2E.ProtocolMessage_REVOKE.Enum()
	for _, m := range []*events.Message{plain, revoke, nil} {
		if _, ok := DecodeEdit(nil, m); ok {
			t.Fatal("non-edit decoded as edit")
		}
	}
}
