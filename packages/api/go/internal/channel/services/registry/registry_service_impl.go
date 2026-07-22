package registry

import (
	"context"
	"log/slog"
	"sync"

	"template/api-go/internal/channel/services/gateway"

	"github.com/google/uuid"
)

// ChannelRegistryImpl maintains the in-process map of live gateway channels.
//
// The registry has no repository dependency and no batch bootstrap method.
// Users re-authenticate after deploy via the Connect command, which
// repopulates this map with fresh WhatsApp sessions.
type ChannelRegistryImpl struct {
	channels map[uuid.UUID]gateway.Channel
	mu       sync.RWMutex
	factory  gateway.ChannelFactory
}

func NewChannelRegistry(factory gateway.ChannelFactory) *ChannelRegistryImpl {
	return &ChannelRegistryImpl{
		channels: make(map[uuid.UUID]gateway.Channel),
		factory:  factory,
	}
}

func (r *ChannelRegistryImpl) Register(ctx context.Context, instanceID uuid.UUID, config gateway.ChannelConfig) (gateway.Channel, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if ch, ok := r.channels[instanceID]; ok {
		return ch, nil
	}

	ch, err := r.factory.Create(instanceID, config)
	if err != nil {
		return nil, err
	}

	r.channels[instanceID] = ch

	slog.Info("instance registered in registry", "instanceId", instanceID)
	return ch, nil
}

func (r *ChannelRegistryImpl) Get(instanceID uuid.UUID) (gateway.Channel, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ch, ok := r.channels[instanceID]
	return ch, ok
}

func (r *ChannelRegistryImpl) Remove(instanceID uuid.UUID) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if ch, ok := r.channels[instanceID]; ok {
		ch.Disconnect()
		delete(r.channels, instanceID)
		slog.Info("instance removed from registry", "instanceId", instanceID)
	}
}

func (r *ChannelRegistryImpl) DisconnectAll() {
	r.mu.Lock()
	for id, ch := range r.channels {
		ch.Disconnect()
		slog.Info("disconnected instance", "instanceId", id)
	}
	r.channels = make(map[uuid.UUID]gateway.Channel)
	r.mu.Unlock()
}

func (r *ChannelRegistryImpl) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.channels)
}
