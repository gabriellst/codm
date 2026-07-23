package mapper

import (
	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/appstate"
	"go.mau.fi/whatsmeow/types/events"

	ctxevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

// mapAppStateSyncComplete emits channel.gateway.sync_complete only when the
// whatsmeow AppStateSyncComplete event carries Name == appstate.WAPatchRegular —
// that's the app-state stanza that contains contact names and marks the sync
// as complete for our purposes. The other four names (critical_block,
// critical_unblock_low, regular_high, regular_low) are dropped.
func mapAppStateSyncComplete(instanceID uuid.UUID, ownerID string, v *events.AppStateSyncComplete) []types.DomainEventI {
	if v == nil {
		return nil
	}
	if v.Name != appstate.WAPatchRegular {
		return nil
	}
	return []types.DomainEventI{
		ctxevents.NewGatewaySyncCompleteEvent(instanceID, ownerID, ctxevents.ChannelGatewaySyncCompletePayload{
			ChannelID: instanceID,
			OwnerID:   ownerID,
		}),
	}
}
