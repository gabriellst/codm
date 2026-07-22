package whatsapp

import (
	"strings"

	"template/api-go/internal/channel/services/gateway/whatsapp/jidutil"
)

const whatsAppUserSuffix = "@s.whatsapp.net"

// NormalizeJID ensures a phone number or JID string includes the WhatsApp server suffix
// and strips the multi-device suffix (e.g., ":96" from "558386387518:96@s.whatsapp.net").
// This guarantees the same person always maps to a single canonical JID regardless of
// which device session generated it.
func NormalizeJID(input string) string {
	input = StripDeviceSuffix(input)
	if strings.Contains(input, "@") {
		return input
	}
	return input + whatsAppUserSuffix
}

// StripDeviceSuffix removes the WhatsApp multi-device identifier from a JID.
// E.g., "558386387518:96@s.whatsapp.net" → "558386387518@s.whatsapp.net"
// E.g., "558386387518:96" → "558386387518"
// Group JIDs and JIDs without a colon are returned unchanged.
// Delegates to jidutil so the mapper sub-package can share the same logic
// without a mapper → whatsapp import cycle.
func StripDeviceSuffix(jid string) string {
	return jidutil.StripDeviceSuffix(jid)
}

// StripJIDServer removes the server suffix (@s.whatsapp.net, @g.us, etc.)
// from a JID, returning only the user identifier (phone number or group id).
// Returns the input unchanged if no @ is present.
// Delegates to jidutil so the mapper sub-package can share the same logic
// without a mapper → whatsapp import cycle.
func StripJIDServer(jid string) string {
	return jidutil.StripJIDServer(jid)
}
