package projectors

import (
	"context"

	"template/core-go/services/mediator"
	"template/core-go/types"
)

// MultiEventProjector is the canonical "ONE projector per projection" shape
// (.claude/skills/projector/go/SKILL.md): a single struct that owns a
// projection's entire transition surface, subscribing to every event that
// mutates it and dispatching internally. Splitting into one struct per event
// is the HANDLER pattern, not the projector pattern — the sibling sync
// handlers in this context are intentionally one-per-event, but a projector
// keeps find → ApplyX → save cohesive in one place. Cross-language parity:
// the TS canon states "uma classe por Projection, escuta múltiplos eventos"
// (packages/api/typescript/core/src/types/Projector.ts).
type MultiEventProjector interface {
	// EventNames lists every event name this projector reacts to.
	EventNames() []string
	// Handle dispatches internally (a switch on event.GetEventName()) to the
	// branch for whichever of EventNames() fired.
	Handle(ctx context.Context, event types.DomainEventI) error
}

// namedHandler adapts a single (name, shared Handle) pair to
// mediator.DomainEventHandler. The InternalMediator keys its registration
// table by one EventName() per handler value (see ChannelMediator.Register),
// so registering ONE MultiEventProjector under N event names still needs N
// map entries — namedHandler is the thin per-name adapter that all delegate
// back into the same projector's Handle. Mirrors the TS
// BoundedContext.registerProjectors "pseudoHandler" (packages/api/typescript/
// core/src/types/BoundedContext.ts), which loops over projectorInstance.events
// and registers one adapter per name against the same projector instance.
type namedHandler struct {
	name   string
	handle func(ctx context.Context, event types.DomainEventI) error
}

func (h namedHandler) EventName() string { return h.name }

func (h namedHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	return h.handle(ctx, event)
}

// RegisterAll registers p against m under every name in p.EventNames(), so the
// single projector struct dispatches across all of them via its own Handle.
func RegisterAll(m mediator.InternalMediator, p MultiEventProjector) {
	for _, name := range p.EventNames() {
		m.Register(namedHandler{name: name, handle: p.Handle})
	}
}
