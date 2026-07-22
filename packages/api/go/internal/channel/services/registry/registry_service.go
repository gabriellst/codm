package registry

import (
	"context"

	"github.com/google/uuid"

	"template/api-go/internal/channel/services/gateway"
)

type ChannelRegistry interface {
	Register(ctx context.Context, instanceID uuid.UUID, config gateway.ChannelConfig) (gateway.Channel, error)
	Get(instanceID uuid.UUID) (gateway.Channel, bool)
	Remove(instanceID uuid.UUID)
	DisconnectAll()
	Count() int
}
