package mediator

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"template/api-go/internal/shared/types"
)

type integrationEnvelope struct {
	ctx   context.Context
	event types.IntegrationEventI
}

// MemoryExternalMediator implements ExternalMediator using a buffered channel.
type MemoryExternalMediator struct {
	handlers  map[string][]IntegrationEventHandler
	callbacks []func(ctx context.Context, event types.IntegrationEventI)
	mu        sync.RWMutex
	eventCh   chan integrationEnvelope
	stopCh    chan struct{}
	done      chan struct{}
}

func NewMemoryExternalMediator() ExternalMediator {
	return &MemoryExternalMediator{
		handlers: make(map[string][]IntegrationEventHandler),
		eventCh:  make(chan integrationEnvelope, 256),
		stopCh:   make(chan struct{}),
		done:     make(chan struct{}),
	}
}

func (m *MemoryExternalMediator) Register(h IntegrationEventHandler) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.handlers[h.EventName()] = append(m.handlers[h.EventName()], h)
	slog.Info("memory mediator: registered handler", "event", h.EventName())
}

func (m *MemoryExternalMediator) RegisterCallback(fn func(ctx context.Context, event types.IntegrationEventI)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.callbacks = append(m.callbacks, fn)
}

func (m *MemoryExternalMediator) Publish(ctx context.Context, event types.IntegrationEventI) error {
	select {
	case m.eventCh <- integrationEnvelope{ctx: ctx, event: event}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (m *MemoryExternalMediator) Start(_ context.Context) error {
	go func() {
		defer close(m.done)
		for {
			select {
			case <-m.stopCh:
				m.drain()
				return
			case env := <-m.eventCh:
				m.dispatch(env)
			}
		}
	}()
	slog.Info("memory mediator: started")
	return nil
}

func (m *MemoryExternalMediator) Stop(_ context.Context) error {
	close(m.stopCh)
	<-m.done
	slog.Info("memory mediator: stopped")
	return nil
}

func (m *MemoryExternalMediator) dispatch(env integrationEnvelope) {
	m.mu.RLock()
	handlers := m.handlers[env.event.GetEventName()]
	callbacks := m.callbacks
	m.mu.RUnlock()

	slog.Debug("memory mediator: dispatching",
		"event", env.event.GetEventName(),
		"handlers", len(handlers),
		"eventType", fmt.Sprintf("%T", env.event),
	)

	ctx, cancel := context.WithTimeout(context.WithoutCancel(env.ctx), 30*time.Second)
	defer cancel()

	for _, h := range handlers {
		if err := m.safeHandle(ctx, h, env.event); err != nil {
			slog.Error("memory mediator: handler error",
				"event", env.event.GetEventName(),
				"error", err,
			)
		}
	}

	for _, fn := range callbacks {
		fn(ctx, env.event)
	}
}

func (m *MemoryExternalMediator) safeHandle(ctx context.Context, h IntegrationEventHandler, event types.IntegrationEventI) (err error) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("memory mediator: handler panicked",
				"event", event.GetEventName(),
				"handler", fmt.Sprintf("%T", h),
				"panic", r,
			)
			err = fmt.Errorf("handler panicked: %v", r)
		}
	}()
	return h.Handle(ctx, event)
}

func (m *MemoryExternalMediator) drain() {
	for {
		select {
		case env := <-m.eventCh:
			m.dispatch(env)
		default:
			return
		}
	}
}
