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

func (r *ChannelRegistryImpl) Register(ctx context.Context, channelID uuid.UUID, config gateway.ChannelConfig) (gateway.Channel, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if ch, ok := r.channels[channelID]; ok {
		return ch, nil
	}

	ch, err := r.factory.Create(channelID, config)
	if err != nil {
		return nil, err
	}

	r.channels[channelID] = ch

	slog.Info("channel registered in registry", "channelId", channelID)
	return ch, nil
}

func (r *ChannelRegistryImpl) Get(channelID uuid.UUID) (gateway.Channel, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ch, ok := r.channels[channelID]
	return ch, ok
}

func (r *ChannelRegistryImpl) Remove(channelID uuid.UUID) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if ch, ok := r.channels[channelID]; ok {
		ch.Disconnect()
		delete(r.channels, channelID)
		slog.Info("channel removed from registry", "channelId", channelID)
	}
}

func (r *ChannelRegistryImpl) DisconnectAll() {
	r.mu.Lock()
	for id, ch := range r.channels {
		ch.Disconnect()
		slog.Info("disconnected channel", "channelId", id)
	}
	r.channels = make(map[uuid.UUID]gateway.Channel)
	r.mu.Unlock()
}

func (r *ChannelRegistryImpl) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.channels)
}
