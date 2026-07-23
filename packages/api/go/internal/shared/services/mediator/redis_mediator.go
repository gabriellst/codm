package mediator

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"

	"github.com/redis/go-redis/v9"

	"template/api-go/internal/shared/config"
	"template/core-go/types"
)

const (
	streamPrefix = "events:"
	maxStreamLen = 10_000
)

// RedisExternalMediator implements ExternalMediator using Redis Streams for
// cross-service delivery, while also fanning out each published event to any
// in-process callbacks (e.g. the SSE broadcaster in listen_events.go) so that
// local subscribers receive integration events alongside remote consumers.
type RedisExternalMediator struct {
	client    *redis.Client
	mu        sync.RWMutex
	callbacks []func(ctx context.Context, event types.IntegrationEventI)
}

func NewRedisExternalMediator(cfg *config.Config) (ExternalMediator, error) {
	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("invalid redis url: %w", err)
	}
	return &RedisExternalMediator{client: redis.NewClient(opts)}, nil
}

func (m *RedisExternalMediator) Register(_ IntegrationEventHandler) {}

func (m *RedisExternalMediator) RegisterCallback(fn func(ctx context.Context, event types.IntegrationEventI)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.callbacks = append(m.callbacks, fn)
}

func (m *RedisExternalMediator) Publish(ctx context.Context, event types.IntegrationEventI) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal integration event: %w", err)
	}

	stream := streamPrefix + event.GetEventName()

	id, err := m.client.XAdd(ctx, &redis.XAddArgs{
		Stream: stream,
		MaxLen: maxStreamLen,
		Approx: true,
		Values: map[string]any{"data": payload},
	}).Result()
	if err != nil {
		return fmt.Errorf("XADD %s: %w", stream, err)
	}

	slog.Info("redis: event published", "stream", stream, "id", id, "ownerId", event.GetOwnerID(), "size", len(payload))

	m.mu.RLock()
	callbacks := m.callbacks
	m.mu.RUnlock()
	for _, fn := range callbacks {
		fn(ctx, event)
	}
	return nil
}

func (m *RedisExternalMediator) Start(ctx context.Context) error {
	if err := m.client.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("redis ping: %w", err)
	}
	slog.Info("redis: external mediator ready (publish-only)")
	return nil
}

func (m *RedisExternalMediator) Stop(_ context.Context) error {
	if err := m.client.Close(); err != nil {
		return fmt.Errorf("redis close: %w", err)
	}
	slog.Info("redis: stopped")
	return nil
}
