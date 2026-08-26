package mapper

import (
	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/types/events"

	"template/api-go/internal/channel/enums"
	ctxevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

func mapConnected(instanceID uuid.UUID, ownerID string, _ *events.Connected) []types.DomainEventI {
	return []types.DomainEventI{
		ctxevents.NewGatewayConnectedEvent(instanceID, ownerID, ctxevents.GatewayConnectedPayload{
			ChannelID: instanceID,
			Platform:  string(enums.PlatformWhatsApp),
			OwnerID:   ownerID,
		}),
	}
}

func mapDisconnected(instanceID uuid.UUID, ownerID string) []types.DomainEventI {
	return []types.DomainEventI{
		ctxevents.NewGatewayDisconnectedEvent(instanceID, ownerID, ctxevents.GatewayDisconnectedPayload{
			ChannelID: instanceID,
			Platform:  string(enums.PlatformWhatsApp),
			OwnerID:   ownerID,
		}),
	}
}

func mapLoggedOut(instanceID uuid.UUID, ownerID string, v *events.LoggedOut) []types.DomainEventI {
	return []types.DomainEventI{
		ctxevents.NewGatewayLoggedOutEvent(instanceID, ownerID, ctxevents.ChannelLoggedOutPayload{
			ChannelID: instanceID,
			Reason:    v.Reason.String(),
			Platform:  string(enums.PlatformWhatsApp),
			OwnerID:   ownerID,
		}),
	}
}
