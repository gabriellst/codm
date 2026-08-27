package whatsapp

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waCommon"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types"
	waLog "go.mau.fi/whatsmeow/util/log"

	"template/api-go/internal/channel/services/gateway"
)

func TestResolveMediaBytesReadsFromMediaPathInsideStore(t *testing.T) {
	store := &MediaStore{dir: t.TempDir()}
	path := filepath.Join(store.dir, "abc123.png")
	want := []byte("staged artifact bytes")
	if err := os.WriteFile(path, want, 0o644); err != nil {
		t.Fatalf("seed file: %v", err)
	}

	c := &WhatsmeowChannel{mediaStore: store}

	got, err := c.resolveMediaBytes(context.Background(), "", path)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if string(got) != string(want) {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestResolveMediaBytesRejectsMediaPathOutsideStore(t *testing.T) {
	store := &MediaStore{dir: t.TempDir()}
	outsideDir := t.TempDir()
	outside := filepath.Join(outsideDir, "secret.txt")
	if err := os.WriteFile(outside, []byte("nope"), 0o644); err != nil {
		t.Fatalf("seed file: %v", err)
	}

	c := &WhatsmeowChannel{mediaStore: store}

	_, err := c.resolveMediaBytes(context.Background(), "", outside)
	if !errors.Is(err, ErrMediaPathNotAllowed) {
		t.Fatalf("expected ErrMediaPathNotAllowed, got %v", err)
	}
}

func TestResolveMediaBytesRejectsMediaPathWithoutMediaStore(t *testing.T) {
	c := &WhatsmeowChannel{} // mediaStore is nil — channel never wired to inbound media.

	_, err := c.resolveMediaBytes(context.Background(), "", "/whatever/path.png")
	if !errors.Is(err, ErrMediaPathNotAllowed) {
		t.Fatalf("expected ErrMediaPathNotAllowed, got %v", err)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// buildReactionMessage — the KEY is the whole message
//
// A reaction is addressed by the full WhatsApp message key: remote + fromMe + id
// + participant. whatsmeow derives the last two from the `sender` JID it is
// handed, so these tests assert on the KEY the builder produces rather than on
// the arguments it passed — the key is what a recipient's client matches against,
// and the only thing that decides whether the emoji renders at all.
// ─────────────────────────────────────────────────────────────────────────────

const (
	testGroupJID    = "120363000000000000@g.us"
	testMemberJID   = "5511777777777@s.whatsapp.net"
	testContactJID  = "5511888888888@s.whatsapp.net"
	testOwnerJID    = "5511999999999@s.whatsapp.net"
	testReactionID  = "3EB0B430A6B7FBEC1200"
	testReactionEmo = "👀"
)

// reactionChannel builds an OFFLINE WhatsmeowChannel whose device is logged in as
// testOwnerJID. No socket is opened: BuildReaction only reads the device store.
func reactionChannel(t *testing.T) *WhatsmeowChannel {
	t.Helper()
	ownJID, err := types.ParseJID(testOwnerJID)
	if err != nil {
		t.Fatalf("parse own JID: %v", err)
	}
	device := &store.Device{ID: &ownJID}
	return &WhatsmeowChannel{client: whatsmeow.NewClient(device, waLog.Noop)}
}

// reactionKey runs the builder and returns the key it produced.
func reactionKey(t *testing.T, c *WhatsmeowChannel, key gateway.SendReactionKey) *waCommon.MessageKey {
	t.Helper()
	msg, err := c.buildReactionMessage(gateway.SendReactionContent{Key: key, Reaction: testReactionEmo})
	if err != nil {
		t.Fatalf("buildReactionMessage: %v", err)
	}
	if msg.GetReactionMessage() == nil {
		t.Fatal("want a ReactionMessage, got none")
	}
	return msg.GetReactionMessage().GetKey()
}

// THE BUG. In a group the chat JID is the GROUP, so a key built from the chat
// alone claims the group itself authored the message — it addresses nothing, and
// no client in the room renders the emoji. The participant has to be the author.
func TestBuildReaction_GroupMessageFromAnotherParticipant_KeyCarriesTheAuthor(t *testing.T) {
	c := reactionChannel(t)

	got := reactionKey(t, c, gateway.SendReactionKey{
		RemoteID: testGroupJID,
		FromMe:   false,
		ID:       testReactionID,
		SenderID: testMemberJID,
	})

	if got.GetRemoteJID() != testGroupJID {
		t.Fatalf("remoteJid = %q, want the group %q", got.GetRemoteJID(), testGroupJID)
	}
	if got.GetFromMe() {
		t.Fatal("fromMe = true for someone else's message, want false")
	}
	if got.GetParticipant() != testMemberJID {
		t.Fatalf("participant = %q, want the AUTHOR %q — a key pointing at the group reacts to nothing", got.GetParticipant(), testMemberJID)
	}
}

// The operator's OWN message inside a group: no participant is sent (the id would
// be the `operator` sentinel, not a JID), and the device's own JID answers it —
// which is how the 🤖 reply cue has always worked.
func TestBuildReaction_GroupMessageFromMe_KeyIsOwnedByThisDevice(t *testing.T) {
	c := reactionChannel(t)

	got := reactionKey(t, c, gateway.SendReactionKey{
		RemoteID: testGroupJID,
		FromMe:   true,
		ID:       testReactionID,
	})

	if !got.GetFromMe() {
		t.Fatal("fromMe = false for our own message, want true")
	}
	if got.GetParticipant() != "" {
		t.Fatalf("participant = %q, want it unset for a fromMe key", got.GetParticipant())
	}
}

// THE NO-REGRESSION HALF. A DM never had a participant in its key (WhatsApp does
// not set one for user-server chats) and must not grow one: the author's JID is
// carried exactly as before, and the key comes out identical to the pre-fix one.
func TestBuildReaction_DirectMessage_KeyIsUnchangedAndCarriesNoParticipant(t *testing.T) {
	c := reactionChannel(t)

	got := reactionKey(t, c, gateway.SendReactionKey{
		RemoteID: testContactJID,
		FromMe:   false,
		ID:       testReactionID,
		SenderID: testContactJID,
	})

	if got.GetRemoteJID() != testContactJID {
		t.Fatalf("remoteJid = %q, want %q", got.GetRemoteJID(), testContactJID)
	}
	if got.GetFromMe() {
		t.Fatal("fromMe = true for the contact's message, want false")
	}
	if got.GetParticipant() != "" {
		t.Fatalf("participant = %q, want it unset in a DM", got.GetParticipant())
	}
}

// A command row enqueued BEFORE the author travelled — no SenderID at all — keeps
// the historical chat-JID fallback rather than erroring. In a DM that is still the
// right key; in a group it is no worse than it was.
func TestBuildReaction_NoSender_FallsBackToTheChatJID(t *testing.T) {
	c := reactionChannel(t)

	got := reactionKey(t, c, gateway.SendReactionKey{RemoteID: testContactJID, FromMe: false, ID: testReactionID})

	if got.GetFromMe() {
		t.Fatal("fromMe = true, want false")
	}
	if got.GetParticipant() != "" {
		t.Fatalf("participant = %q, want it unset in a DM", got.GetParticipant())
	}
}

// An author the platform's own parser rejects is REPORTED, never silently swapped
// back for the chat JID — quietly addressing the wrong message is the exact bug
// class this whole change exists to close, and a fallback here would reintroduce
// it for the one input that cannot be reasoned about.
func TestBuildReaction_UnparseableSender_IsAnErrorNotAFallback(t *testing.T) {
	c := reactionChannel(t)

	_, err := c.buildReactionMessage(gateway.SendReactionContent{
		Key:      gateway.SendReactionKey{RemoteID: testGroupJID, FromMe: false, ID: testReactionID, SenderID: "1.2.3@s.whatsapp.net"},
		Reaction: testReactionEmo,
	})
	if err == nil {
		t.Fatal("want an error for a sender JID types.ParseJID rejects, got nil")
	}
}
