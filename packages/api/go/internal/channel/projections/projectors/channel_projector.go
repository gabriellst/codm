// Package projectors keeps the channel read model fresh from the gateway's
// domain lifecycle events. It is the read-side counterpart of the egress
// handlers: where those publish the cross-boundary contract, these mutate the
// local projection. Both fan out from the same InternalMediator dispatch.
package projectors

import (
	"context"

	chanevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/projections"
	"template/contracts-go/wire"
	"template/core-go/services/mediator"
	fwtypes "template/core-go/types"
)

// ── channel.connected → status CONNECTED ─────────────────────────────────────

type ConnectedProjector struct{ repo projections.ChannelProjectionRepository }

func NewConnectedProjector(repo projections.ChannelProjectionRepository) *ConnectedProjector {
	return &ConnectedProjector{repo: repo}
}

var _ mediator.DomainEventHandler = (*ConnectedProjector)(nil)

func (p *ConnectedProjector) EventName() string { return chanevents.ConnectedEventName }

func (p *ConnectedProjector) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.ConnectedPayload](event)
	if err != nil {
		return err
	}
	pl := ev.Payload
	return p.repo.SetStatus(ctx, pl.ChannelID.String(), wire.ChannelStatusCONNECTED, pl.AccountDetail)
}

// ── channel.disconnected (TERMINAL) → status DISCONNECTED + unpair ────────────
//
// channel.disconnected is a terminal fact: platform-side LoggedOut or an explicit
// teardown. Transient whatsmeow drops (Disconnected/StreamReplaced) are swallowed
// by auto-reconnect and never reach here (see mapper.mapEvent). Terminal means the
// pairing is gone, so we force-clear account_detail — not SetStatus(...,""), which
// would preserve it and leave a dead session in ListPaired.

type DisconnectedProjector struct{ repo projections.ChannelProjectionRepository }

func NewDisconnectedProjector(repo projections.ChannelProjectionRepository) *DisconnectedProjector {
	return &DisconnectedProjector{repo: repo}
}

var _ mediator.DomainEventHandler = (*DisconnectedProjector)(nil)

func (p *DisconnectedProjector) EventName() string { return chanevents.DisconnectedEventName }

func (p *DisconnectedProjector) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.DisconnectedPayload](event)
	if err != nil {
		return err
	}
	pl := ev.Payload
	return p.repo.ClearAccount(ctx, pl.ChannelID.String())
}
