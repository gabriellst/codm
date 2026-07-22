// Package handlers holds the activity context's event handlers.
package handlers

import (
	"context"
	"log/slog"

	"template/contracts-go/wire"
	"template/core-go/services/mediator"
	fwtypes "template/core-go/types"
)

// SubscriptionChangedHandler is the activity context's external (inbound
// integration) handler for integration.billing.subscription_changed.
//
// It is a non-critical observability side effect: the read-model write lives in
// ActivityEntryProjector (read side); this handler demonstrates the
// write-side external-handler citizen — consume a wire event from the
// contracts binding, unmarshal it, and react. Both register on the
// ExternalMediator for the same event name; the mediator fans out to each.
type SubscriptionChangedHandler struct{}

func NewSubscriptionChangedHandler() *SubscriptionChangedHandler {
	return &SubscriptionChangedHandler{}
}

// compile-time interface check.
var _ mediator.IntegrationEventHandler = (*SubscriptionChangedHandler)(nil)

func (h *SubscriptionChangedHandler) EventName() string { return wire.SubscriptionChangedEventName }

func (h *SubscriptionChangedHandler) Handle(ctx context.Context, event fwtypes.IntegrationEventI) error {
	typed, err := fwtypes.UnmarshalIntegrationEvent[wire.SubscriptionChangedEvent](event)
	if err != nil {
		return err
	}
	pl := typed.Payload
	slog.InfoContext(ctx, "activity: subscription posture changed",
		"ownerId", pl.OwnerID,
		"entityId", pl.EntityID,
		"occurredAt", pl.OccurredAt,
	)
	return nil
}
