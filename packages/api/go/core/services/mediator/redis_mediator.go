package mediator

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"

	"template/core-go/config"
	"template/core-go/types"
)

const (
	streamPrefix  = "events:"
	maxStreamLen  = 10_000
	deadSuffix    = ":dead"
	readCount     = 32
	blockMS       = 5000
	maxDeliveries = 5
)

// RedisExternalMediator implements ExternalMediator using Redis Streams for
// cross-service delivery, while also fanning out each published event to any
// in-process callbacks (e.g. the SSE broadcaster in listen_events.go) so that
// local subscribers receive integration events alongside remote consumers.
type RedisExternalMediator struct {
	client       *redis.Client
	mu           sync.RWMutex
	callbacks    []func(ctx context.Context, event types.IntegrationEventI)
	handlers     map[string][]IntegrationEventHandler
	groupID      string
	consumerName string
	stopped      chan struct{}
}

func NewRedisExternalMediator(cfg *config.Config) (ExternalMediator, error) {
	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("invalid redis url: %w", err)
	}
	return &RedisExternalMediator{
		client:       redis.NewClient(opts),
		handlers:     make(map[string][]IntegrationEventHandler),
		groupID:      cfg.EventGroupID,
		consumerName: fmt.Sprintf("%s-%d", cfg.EventGroupID, os.Getpid()),
		stopped:      make(chan struct{}),
	}, nil
}

func (m *RedisExternalMediator) Register(h IntegrationEventHandler) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.handlers[h.EventName()] = append(m.handlers[h.EventName()], h)
	slog.Info("redis: registered integration handler", "event", h.EventName())
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
	if err := m.client.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("redis ping: %w", err)
	}
	m.mu.RLock()
	streams := make([]string, 0, len(m.handlers))
	for name := range m.handlers {
		streams = append(streams, streamPrefix+name)
	}
	m.mu.RUnlock()
	if len(streams) == 0 {
		slog.Info("redis: no integration handlers registered, consumer idle")
		return nil
	}
	for _, s := range streams {
		// MKSTREAM creates the stream if absent; BUSYGROUP means it already exists.
		if err := m.client.XGroupCreateMkStream(ctx, s, m.groupID, "$").Err(); err != nil &&
			!strings.Contains(err.Error(), "BUSYGROUP") {
			slog.Warn("redis: XGROUP CREATE failed", "stream", s, "error", err)
		}
	}
	go m.runReadLoop(streams)
	slog.Info("redis: external mediator consuming", "streams", len(streams), "group", m.groupID)
	return nil
}

func (m *RedisExternalMediator) runReadLoop(streams []string) {
	draining := true
	for {
		select {
		case <-m.stopped:
			return
		default:
		}
		ids := make([]string, len(streams))
		for i := range streams {
			if draining {
				ids[i] = "0"
			} else {
				ids[i] = ">"
			}
		}
		args := append(append([]string{}, streams...), ids...)
		res, err := m.client.XReadGroup(context.Background(), &redis.XReadGroupArgs{
			Group:    m.groupID,
			Consumer: m.consumerName,
			Streams:  args,
			Count:    readCount,
			Block:    blockMS * time.Millisecond,
		}).Result()
		if err != nil {
			if err == redis.Nil {
				draining = false
				continue
			}
			select {
			case <-m.stopped:
				return
			default:
			}
			slog.Error("redis: XREADGROUP failed", "error", err)
			time.Sleep(time.Second)
			continue
		}
		sawAny := false
		for _, stream := range res {
			eventName := strings.TrimPrefix(stream.Stream, streamPrefix)
			for _, msg := range stream.Messages {
				sawAny = true
				m.processEntry(stream.Stream, eventName, msg)
			}
		}
		if draining && !sawAny {
			draining = false
		}
	}
}

func (m *RedisExternalMediator) processEntry(stream, eventName string, msg redis.XMessage) {
	data, _ := msg.Values["data"].(string)
	if data == "" {
		_ = m.client.XAck(context.Background(), stream, m.groupID, msg.ID).Err()
		return
	}
	if err := m.dispatchRaw(context.Background(), eventName, []byte(data)); err != nil {
		count, _ := m.deliveryCount(stream, msg.ID)
		if count >= maxDeliveries {
			m.client.XAdd(context.Background(), &redis.XAddArgs{
				Stream: stream + deadSuffix, MaxLen: maxStreamLen, Approx: true,
				Values: map[string]any{"data": data, "reason": err.Error(), "originalId": msg.ID},
			})
			_ = m.client.XAck(context.Background(), stream, m.groupID, msg.ID).Err()
		}
		return // leave unacked for redelivery on next draining pass
	}
	_ = m.client.XAck(context.Background(), stream, m.groupID, msg.ID).Err()
}

func (m *RedisExternalMediator) deliveryCount(stream, id string) (int64, error) {
	pending, err := m.client.XPendingExt(context.Background(), &redis.XPendingExtArgs{
		Stream: stream, Group: m.groupID, Start: id, End: id, Count: 1,
	}).Result()
	if err != nil || len(pending) == 0 {
		return 0, err
	}
	return pending[0].RetryCount, nil
}

// dispatchRaw routes a decoded stream entry to all handlers registered for eventName.
// The mediator stays generic — it wraps the raw JSON in a rawIntegrationEvent and lets
// the handler (which owns the wire types) decode the concrete payload.
func (m *RedisExternalMediator) dispatchRaw(ctx context.Context, eventName string, raw []byte) error {
	m.mu.RLock()
	handlers := m.handlers[eventName]
	m.mu.RUnlock()
	evt := &rawIntegrationEvent{name: eventName, raw: raw}
	for _, h := range handlers {
		if err := h.Handle(ctx, evt); err != nil {
			return err
		}
	}
	return nil
}

func (m *RedisExternalMediator) Stop(_ context.Context) error {
	close(m.stopped)
	if err := m.client.Close(); err != nil {
		return fmt.Errorf("redis close: %w", err)
	}
	slog.Info("redis: stopped")
	return nil
}

// rawIntegrationEvent is a generic IntegrationEventI built from a stream entry.
// GetPayload returns the full (flat) wire JSON so a handler can decode it via
// the generated wire.UnmarshalIntegrationEvent.
type rawIntegrationEvent struct {
	name string
	raw  json.RawMessage
}

func (e *rawIntegrationEvent) GetEventName() string        { return e.name }
func (e *rawIntegrationEvent) GetOwnerID() string          { return "" }
func (e *rawIntegrationEvent) GetPayload() json.RawMessage { return e.raw }

var _ types.IntegrationEventI = (*rawIntegrationEvent)(nil)
