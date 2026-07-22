package mapper

import (
	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/types/events"

	ctxevents "template/api-go/internal/channel/events"
	sharedenums "template/api-go/internal/shared/enums"
	"template/api-go/internal/shared/types"
)

func mapConnected(instanceID uuid.UUID, ownerID string, _ *events.Connected) []types.DomainEventI {
	return []types.DomainEventI{
		ctxevents.NewGatewayConnectedEvent(instanceID, ownerID, ctxevents.GatewayConnectedPayload{
			ChannelID: instanceID,
			Platform:  sharedenums.PlatformWhatsApp,
			OwnerID:   ownerID,
		}),
	}
}

func mapDisconnected(instanceID uuid.UUID, ownerID string) []types.DomainEventI {
	return []types.DomainEventI{
		ctxevents.NewGatewayDisconnectedEvent(instanceID, ownerID, ctxevents.GatewayDisconnectedPayload{
			ChannelID: instanceID,
			Platform:  sharedenums.PlatformWhatsApp,
			OwnerID:   ownerID,
		}),
	}
}

func mapLoggedOut(instanceID uuid.UUID, ownerID string, v *events.LoggedOut) []types.DomainEventI {
	return []types.DomainEventI{
		ctxevents.NewGatewayLoggedOutEvent(instanceID, ownerID, ctxevents.ChannelLoggedOutPayload{
			ChannelID: instanceID,
			Reason:    v.Reason.String(),
			Platform:  sharedenums.PlatformWhatsApp,
			OwnerID:   ownerID,
		}),
	}
}
