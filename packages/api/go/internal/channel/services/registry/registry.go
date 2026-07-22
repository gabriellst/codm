// Package registry keeps the in-process map of live gateway channel sessions.
//
// It has no repository dependency and no batch bootstrap: after a restart the
// operator re-authenticates via Connect, which repopulates the map with fresh
// platform sessions.
package registry

import (
	"context"
	"log/slog"
	"sync"

	"github.com/google/uuid"

	"template/api-go/internal/channel/services/gateway"
)

// ChannelRegistry is the port the use cases talk to.
type ChannelRegistry interface {
	Register(ctx context.Context, channelID uuid.UUID, config gateway.ChannelConfig) (gateway.Channel, error)
	Get(channelID uuid.UUID) (gateway.Channel, bool)
	Remove(channelID uuid.UUID)
	DisconnectAll()
	Count() int
}

// ChannelRegistryImpl is the default in-memory implementation.
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

// compile-time port check.
var _ ChannelRegistry = (*ChannelRegistryImpl)(nil)

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
	slog.Info("channel registered", "channelId", channelID)
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
		slog.Info("channel removed", "channelId", channelID)
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
