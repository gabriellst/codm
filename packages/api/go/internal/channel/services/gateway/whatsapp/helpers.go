package whatsapp

import (
	"context"
	"encoding/json"
	"errors"

	"go.mau.fi/whatsmeow/store"
	waMeowTypes "go.mau.fi/whatsmeow/types"
)

// ErrInvalidRemoteID is the domain-normalized error returned when the caller
// supplied a remote_id that cannot be parsed into a platform JID. The use case
// layer never sees the whatsmeow-shaped "invalid JID: ..." wrapped error; this
// sentinel crosses the adapter boundary instead.
var ErrInvalidRemoteID = errors.New("invalid remote_id")

// This package owns JID-format translation. Callers outside this package
// consume already-normalized remote_id strings. Inside:
//   - resolveLID: domain event emission path — converts user JIDs to LID form
//     so the outbox carries platform-canonical remote_ids.
//   - resolvePN: WhatsApp-API callout path — converts LIDs back to PN when
//     whatsmeow endpoints (mark-read, pin, app-state patches) still require
//     phone-form JIDs.
//
// Both helpers pass group JIDs (@g.us) through unchanged; group identifiers
// are never re-keyed.

// resolvePN converts a LID JID to its phone number JID using the device store.
// Returns the original JID unchanged if it's not a LID or resolution fails.
func resolvePN(device *store.Device, jid waMeowTypes.JID) waMeowTypes.JID {
	if device == nil || jid.Server != waMeowTypes.HiddenUserServer {
		return jid
	}
	pn, err := device.GetAltJID(context.Background(), jid)
	if err != nil || pn.IsEmpty() {
		return jid
	}
	return pn
}

// resolveLID returns the LID-form JID for a WhatsApp user JID. If the input is
// already a LID (@lid suffix) it is returned unchanged. If the input is a
// phone-number JID (@s.whatsapp.net), the device store is consulted to find
// the linked LID; on failure (no mapping yet, e.g. brand-new contact), the
// original PN JID is returned so upstream code can still key off a stable
// identifier. Group and broadcast JIDs pass through unchanged — groups do not
// have LIDs.
func resolveLID(device *store.Device, jid waMeowTypes.JID) waMeowTypes.JID {
	if device == nil {
		return jid
	}
	switch jid.Server {
	case waMeowTypes.HiddenUserServer:
		return jid // already LID
	case waMeowTypes.DefaultUserServer:
		lid, err := device.GetAltJID(context.Background(), jid)
		if err != nil || lid.IsEmpty() {
			return jid
		}
		return lid
	default:
		return jid
	}
}

// marshalPlatformData marshals any platform-data struct to json.RawMessage.
func marshalPlatformData(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}
