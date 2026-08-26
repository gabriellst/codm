package pool

import (
	"context"
	"log/slog"
	"sync"

	"template/api-go/internal/channel/services/gateway"

	"github.com/google/uuid"
)

// ChannelPoolImpl maintains the in-process map of live gateway channels.
//
// The pool has no repository dependency and no batch bootstrap method.
// Users re-authenticate after deploy via the Connect command, which
// repopulates this map with fresh WhatsApp sessions.
type ChannelPoolImpl struct {
	channels map[uuid.UUID]gateway.Channel
	mu       sync.RWMutex
	factory  gateway.ChannelFactory
}

// compile-time interface check.
var _ ChannelPool = (*ChannelPoolImpl)(nil)

func NewChannelPool(factory gateway.ChannelFactory) *ChannelPoolImpl {
	return &ChannelPoolImpl{
		channels: make(map[uuid.UUID]gateway.Channel),
		factory:  factory,
	}
}

func (r *ChannelPoolImpl) Register(ctx context.Context, channelID uuid.UUID, config gateway.ChannelConfig) (gateway.Channel, error) {
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

	slog.Info("channel registered in pool", "channelId", channelID)
	return ch, nil
}

func (r *ChannelPoolImpl) Get(channelID uuid.UUID) (gateway.Channel, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ch, ok := r.channels[channelID]
	return ch, ok
}

func (r *ChannelPoolImpl) Remove(channelID uuid.UUID) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if ch, ok := r.channels[channelID]; ok {
		ch.Disconnect()
		delete(r.channels, channelID)
		slog.Info("channel removed from pool", "channelId", channelID)
	}
}

func (r *ChannelPoolImpl) DisconnectAll() {
	r.mu.Lock()
	for id, ch := range r.channels {
		ch.Disconnect()
		slog.Info("disconnected channel", "channelId", id)
	}
	r.channels = make(map[uuid.UUID]gateway.Channel)
	r.mu.Unlock()
}

func (r *ChannelPoolImpl) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.channels)
}
