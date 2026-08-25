package mediator

import (
	"context"
	"fmt"
	"log/slog"
	"sync"

	"template/core-go/types"
)

type eventEnvelope struct {
	ctx   context.Context
	event types.DomainEventI
}

// ChannelMediator implements InternalMediator using a buffered channel.
type ChannelMediator struct {
	handlers  map[string][]DomainEventHandler
	callbacks []func(ctx context.Context, event types.DomainEventI)
	mu        sync.RWMutex
	eventCh   chan eventEnvelope
	stopCh    chan struct{}
	done      chan struct{}
	stopped   chan struct{} // closed after Stop() completes
}

func NewChannelMediator() *ChannelMediator {
	return &ChannelMediator{
		handlers: make(map[string][]DomainEventHandler),
		eventCh:  make(chan eventEnvelope, 256),
		stopCh:   make(chan struct{}),
		done:     make(chan struct{}),
		stopped:  make(chan struct{}),
	}
}

func (m *ChannelMediator) Register(h DomainEventHandler) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.handlers[h.EventName()] = append(m.handlers[h.EventName()], h)
}

func (m *ChannelMediator) RegisterCallback(fn func(ctx context.Context, event types.DomainEventI)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.callbacks = append(m.callbacks, fn)
}

func (m *ChannelMediator) Publish(ctx context.Context, event types.DomainEventI) error {
	select {
	case <-m.stopped:
		return fmt.Errorf("mediator is stopped, dropping event %s", event.GetEventName())
	default:
	}

	select {
	case m.eventCh <- eventEnvelope{ctx: ctx, event: event}:
		return nil
	case <-m.stopped:
		return fmt.Errorf("mediator stopped while publishing event %s", event.GetEventName())
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Dispatch synchronously runs all handlers for the event on the caller's goroutine.
// Returns the first handler error so the outbox can retry the event.
func (m *ChannelMediator) Dispatch(ctx context.Context, event types.DomainEventI) error {
	m.mu.RLock()
	handlers := m.handlers[event.GetEventName()]
	callbacks := m.callbacks
	m.mu.RUnlock()

	for _, h := range handlers {
		if err := m.safeHandle(ctx, h, event); err != nil {
			return err
		}
	}

	for _, fn := range callbacks {
		fn(ctx, event)
	}

	return nil
}

func (m *ChannelMediator) Start(_ context.Context) {
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
}

func (m *ChannelMediator) Stop() {
	close(m.stopCh)
	<-m.done
	close(m.stopped)
}

func (m *ChannelMediator) dispatch(env eventEnvelope) {
	m.mu.RLock()
	handlers := m.handlers[env.event.GetEventName()]
	callbacks := m.callbacks
	m.mu.RUnlock()

	// Detach from the original request context to prevent cancellation
	// after HTTP response is sent. WithoutCancel preserves values (trace IDs, etc.).
	ctx := context.WithoutCancel(env.ctx)

	for _, h := range handlers {
		if err := m.safeHandle(ctx, h, env.event); err != nil {
			slog.Error("domain event handler failed",
				"event", env.event.GetEventName(),
				"error", err,
			)
		}
	}

	for _, fn := range callbacks {
		fn(ctx, env.event)
	}
}

func (m *ChannelMediator) safeHandle(ctx context.Context, h DomainEventHandler, event types.DomainEventI) (err error) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("internal mediator: handler panicked",
				"event", event.GetEventName(),
				"handler", fmt.Sprintf("%T", h),
				"panic", r,
			)
			err = fmt.Errorf("handler panicked: %v", r)
		}
	}()
	return h.Handle(ctx, event)
}

func (m *ChannelMediator) drain() {
	for {
		select {
		case env := <-m.eventCh:
			m.dispatch(env)
		default:
			return
		}
	}
}
