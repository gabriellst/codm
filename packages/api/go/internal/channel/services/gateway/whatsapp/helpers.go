package whatsapp

import (
	"context"
	"errors"
	"strings"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	waTypes "go.mau.fi/whatsmeow/types"
)

const whatsAppUserSuffix = "@s.whatsapp.net"

// ErrInvalidRemoteID is the domain-normalized error returned when a caller
// supplied an external id that cannot be parsed into a platform JID. The
// whatsmeow-shaped wrapped error never crosses the adapter boundary.
var ErrInvalidRemoteID = errors.New("invalid remote_id")

// StripDeviceSuffix removes the WhatsApp multi-device identifier from a JID.
// "558386387518:96@s.whatsapp.net" → "558386387518@s.whatsapp.net"
// "558386387518:96" → "558386387518". JIDs without a colon are unchanged.
func StripDeviceSuffix(jid string) string {
	at := strings.IndexByte(jid, '@')
	user := jid
	server := ""
	if at >= 0 {
		user = jid[:at]
		server = jid[at:]
	}
	if colon := strings.IndexByte(user, ':'); colon >= 0 {
		user = user[:colon]
	}
	return user + server
}

// parseOrBuildJID parses a full JID or builds a default-server user JID from a
// bare phone number.
func parseOrBuildJID(input string) (waTypes.JID, error) {
	if strings.Contains(input, "@") {
		return waTypes.ParseJID(input)
	}
	return waTypes.NewJID(input, waTypes.DefaultUserServer), nil
}

// resolvePN converts a LID JID to its phone-number JID via the device store.
// Returns the input unchanged when it is not a LID or resolution fails; group
// JIDs pass through untouched.
func resolvePN(device *store.Device, jid waTypes.JID) waTypes.JID {
	if device == nil || jid.Server != waTypes.HiddenUserServer {
		return jid
	}
	pn, err := device.GetAltJID(context.Background(), jid)
	if err != nil || pn.IsEmpty() {
		return jid
	}
	return pn
}

// extractText pulls the plain-text body from a whatsmeow message. Non-text
// messages (media, protocol, reactions) return "".
func extractText(m *waE2E.Message) string {
	if m == nil {
		return ""
	}
	if c := m.GetConversation(); c != "" {
		return c
	}
	if e := m.GetExtendedTextMessage(); e != nil {
		return e.GetText()
	}
	return ""
}

// quotedStanzaID returns the id of the message this one replies to, or "".
func quotedStanzaID(m *waE2E.Message) string {
	if m == nil {
		return ""
	}
	if e := m.GetExtendedTextMessage(); e != nil {
		if ci := e.GetContextInfo(); ci != nil {
			return ci.GetStanzaID()
		}
	}
	return ""
}
