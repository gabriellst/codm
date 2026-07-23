package mediator

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"

	"github.com/redis/go-redis/v9"

	"template/core-go/config"
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
//
// EGRESS-ONLY (sanctioned today — channel-wire-classification §A): the
// XREADGROUP consumer loop is not implemented, so a registered ingress handler
// would never fire. Register therefore FAILS LOUD at wiring time: it records
// the registration and Start refuses to boot while any exist. Restoring the
// full consumer (XREADGROUP + PEL + dead-letter, template lineage) is a listed
// follow-up gating any TS→Go ingress (e.g. integration.channel.delivery_requested).
type RedisExternalMediator struct {
	client    *redis.Client
	mu        sync.RWMutex
	callbacks []func(ctx context.Context, event types.IntegrationEventI)
	// deadRegistrations collects EventName()s handed to Register — a non-empty
	// list is a wiring error surfaced by Start (fail-loud, never a silent no-op).
	deadRegistrations []string
}

func NewRedisExternalMediator(cfg *config.Config) (ExternalMediator, error) {
	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("invalid redis url: %w", err)
	}
	return &RedisExternalMediator{client: redis.NewClient(opts)}, nil
}

// Register FAILS LOUD (via Start) instead of silently dropping the handler:
// this mediator has no consume loop yet, so an accepted registration would be
// dead ingress — exactly the silent no-op the conformity audit flagged.
func (m *RedisExternalMediator) Register(h IntegrationEventHandler) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.deadRegistrations = append(m.deadRegistrations, h.EventName())
}

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
	m.mu.RLock()
	dead := append([]string(nil), m.deadRegistrations...)
	m.mu.RUnlock()
	if len(dead) > 0 {
		return fmt.Errorf(
			"redis external mediator is egress-only (no XREADGROUP consumer yet) but %d ingress handler(s) were registered: %v — "+
				"restore the stream consumer before wiring TS→Go ingress",
			len(dead), dead,
		)
	}
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
