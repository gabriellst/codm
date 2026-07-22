// Package jidutil provides pure-string helpers for manipulating WhatsApp JID strings.
// It intentionally has no imports from the parent whatsapp package so that the mapper
// sub-package can import it without creating an import cycle.
package jidutil

import "strings"

// StripDeviceSuffix removes the WhatsApp multi-device identifier from a JID string.
// E.g., "558386387518:96@s.whatsapp.net" → "558386387518@s.whatsapp.net"
// E.g., "558386387518:96" → "558386387518"
// Group JIDs and JIDs without a colon are returned unchanged.
func StripDeviceSuffix(jid string) string {
	colonIdx := strings.Index(jid, ":")
	if colonIdx == -1 {
		return jid
	}
	atIdx := strings.Index(jid, "@")
	if atIdx == -1 {
		return jid[:colonIdx]
	}
	if colonIdx < atIdx {
		return jid[:colonIdx] + jid[atIdx:]
	}
	return jid
}

// StripJIDServer removes the server suffix (@s.whatsapp.net, @g.us, etc.)
// from a JID, returning only the user identifier (phone number or group id).
// Returns the input unchanged if no @ is present.
func StripJIDServer(jid string) string {
	if idx := strings.Index(jid, "@"); idx != -1 {
		return jid[:idx]
	}
	return jid
}
