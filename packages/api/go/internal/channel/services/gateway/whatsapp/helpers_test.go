package whatsapp

import (
	"testing"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"google.golang.org/protobuf/proto"
)

func TestStripDeviceSuffix(t *testing.T) {
	cases := map[string]string{
		"558386387518:96@s.whatsapp.net": "558386387518@s.whatsapp.net",
		"558386387518:96":                "558386387518",
		"558386387518@s.whatsapp.net":    "558386387518@s.whatsapp.net",
		"120363000000000000@g.us":        "120363000000000000@g.us",
		"558386387518":                   "558386387518",
	}
	for in, want := range cases {
		if got := StripDeviceSuffix(in); got != want {
			t.Errorf("StripDeviceSuffix(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestParseOrBuildJID(t *testing.T) {
	jid, err := parseOrBuildJID("558386387518")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if jid.User != "558386387518" || jid.Server != "s.whatsapp.net" {
		t.Errorf("parseOrBuildJID bare number = %s, want 558386387518@s.whatsapp.net", jid.String())
	}

	full, err := parseOrBuildJID("120363000000000000@g.us")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if full.Server != "g.us" {
		t.Errorf("parseOrBuildJID group = %s, want @g.us server", full.String())
	}
}

func TestExtractText(t *testing.T) {
	if got := extractText(nil); got != "" {
		t.Errorf("extractText(nil) = %q, want empty", got)
	}

	conv := &waE2E.Message{Conversation: proto.String("hello")}
	if got := extractText(conv); got != "hello" {
		t.Errorf("extractText(conversation) = %q, want hello", got)
	}

	ext := &waE2E.Message{
		ExtendedTextMessage: &waE2E.ExtendedTextMessage{Text: proto.String("world")},
	}
	if got := extractText(ext); got != "world" {
		t.Errorf("extractText(extended) = %q, want world", got)
	}

	// Media-only messages have no text.
	img := &waE2E.Message{ImageMessage: &waE2E.ImageMessage{}}
	if got := extractText(img); got != "" {
		t.Errorf("extractText(image) = %q, want empty", got)
	}
}
