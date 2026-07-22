// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/channel/services/registry/registry_service.go
// Harvested verbatim for the service skill exemplar set — do not edit; re-harvest instead.
package registry

import (
	"context"

	"github.com/google/uuid"

	"monorepo/api/internal/channel/services/gateway"
)

type ChannelRegistry interface {
	Register(ctx context.Context, instanceID uuid.UUID, config gateway.ChannelConfig) (gateway.Channel, error)
	Get(instanceID uuid.UUID) (gateway.Channel, bool)
	Remove(instanceID uuid.UUID)
	DisconnectAll()
	Count() int
}
