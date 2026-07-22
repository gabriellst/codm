package mapper

import (
	"context"
	"encoding/json"

	"go.mau.fi/whatsmeow/store"
	waMeowTypes "go.mau.fi/whatsmeow/types"

	"template/api-go/internal/channel/services/gateway/whatsapp/jidutil"
	"template/api-go/internal/shared/types"
)

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

// resolveLID returns the LID-form JID for a WhatsApp user JID.
// NOTE: resolveLID intentionally remains here rather than being moved to jidutil
// because it depends on go.mau.fi/whatsmeow types (store.Device, waMeowTypes.JID).
// Moving it to jidutil would pull those heavy dependencies into the utility package,
// breaking its design as a pure-string, zero-dependency helper. The mapper → whatsapp
// import cycle is avoided by keeping resolveLID local to the mapper package.
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

// wrap lifts a single optional event into the slice return shape used by MapEvent.
// Nil stays nil (means "we didn't map this whatsmeow event to anything").
func wrap(evt types.DomainEventI) []types.DomainEventI {
	if evt == nil {
		return nil
	}
	return []types.DomainEventI{evt}
}

// marshalPlatformData marshals any platform-data struct to json.RawMessage.
func marshalPlatformData(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

// marshalContent marshals a generic map to json.RawMessage.
func marshalContent(v map[string]any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

// jidSliceToStrings converts a slice of JIDs to a slice of strings.
func jidSliceToStrings(jids []waMeowTypes.JID) []string {
	result := make([]string, len(jids))
	for i, jid := range jids {
		result[i] = jid.String()
	}
	return result
}

// jidPtrToString converts a pointer to a JID to a string.
func jidPtrToString(jid *waMeowTypes.JID) string {
	if jid == nil {
		return ""
	}
	return jid.String()
}

// stripDeviceSuffix removes the WhatsApp multi-device identifier from a JID string.
// E.g., "558386387518:96@s.whatsapp.net" → "558386387518@s.whatsapp.net"
// Delegates to jidutil to avoid duplicating the logic here.
func stripDeviceSuffix(jid string) string {
	return jidutil.StripDeviceSuffix(jid)
}

// stripJIDServer removes the server suffix (@s.whatsapp.net, @g.us, etc.)
// from a JID, returning only the user identifier (phone number or group id).
// Delegates to jidutil to avoid duplicating the logic here.
func stripJIDServer(jid string) string {
	return jidutil.StripJIDServer(jid)
}
