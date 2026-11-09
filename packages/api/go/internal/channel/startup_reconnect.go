package channel

import (
	"context"
	stderrors "errors"
	"log/slog"
	"time"

	ctxerrors "template/api-go/internal/channel/errors"
	gateway "template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/pool"
	coreerrors "template/core-go/errors"

	"github.com/google/uuid"
)

// startupRetryDelays is the wait before each RETRY of a channel's boot-time connect; the last
// delay repeats until the connect lands or the gateway stops.
//
// Why the boot connect retries at all (2026-11-08): the Mac came back from a watchdog reset, the
// app started before DNS did, and the one boot attempt died on `lookup web.whatsapp.com: no such
// host`. whatsmeow's own auto-reconnect only covers a connection that once SUCCEEDED, so nothing
// tried again — WhatsApp stayed down, silently, until someone opened the console and pressed
// connect. Short first delays cover the network coming up a few seconds late; the 60s ceiling keeps
// a machine that is offline for hours from hammering the dialer.
var startupRetryDelays = []time.Duration{
	2 * time.Second,
	5 * time.Second,
	10 * time.Second,
	30 * time.Second,
	60 * time.Second,
}

// connectAttempt is one try at bringing a channel up. retry=false ends the loop: either the channel
// is up (err == nil) or no amount of retrying can bring it up (err != nil).
type connectAttempt func(ctx context.Context) (retry bool, err error)

// waitFunc sleeps for d unless ctx ends first; it reports whether the full delay elapsed.
type waitFunc func(ctx context.Context, d time.Duration) bool

func sleepCtx(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

// retryUntilSettled runs attempt until it settles (retry=false) or ctx ends, waiting delays[i]
// before retry i+1 and repeating the last delay. It reports how many attempts ran.
func retryUntilSettled(ctx context.Context, channelID uuid.UUID, attempt connectAttempt, delays []time.Duration, wait waitFunc) int {
	for n := 1; ; n++ {
		retry, err := attempt(ctx)
		if !retry {
			if err != nil {
				slog.Warn("startup: channel needs the operator — not retrying", "channelId", channelID, "attempt", n, "error", err)
			} else if n > 1 {
				slog.Info("startup: channel connected after retrying", "channelId", channelID, "attempts", n)
			}
			return n
		}
		delay := delays[min(n-1, len(delays)-1)]
		slog.Warn("startup: failed to connect channel — retrying", "channelId", channelID, "attempt", n, "retryIn", delay, "error", err)
		if !wait(ctx, delay) {
			slog.Info("startup: gateway stopping — channel connect retries abandoned", "channelId", channelID, "attempts", n)
			return n
		}
	}
}

// bootConnectAttempt is the production attempt: (re-)register the channel and connect it.
//
// Register runs on EVERY try, not once: a logout evicts the channel from the pool (see
// whatsapp.WhatsmeowChannel.handleEvent), so a client captured before the loop may be a dead one,
// while the pool hands back whatever lives there NOW — including a channel the operator already
// re-paired from the console. A channel that is already connected or connecting is someone else's
// to drive, and the loop stands down rather than racing it.
func bootConnectAttempt(p pool.ChannelPool, channelID uuid.UUID, cfg gateway.ChannelConfig) connectAttempt {
	return func(ctx context.Context) (bool, error) {
		live, err := p.Register(ctx, channelID, cfg)
		if err != nil {
			return true, err
		}
		switch live.Status() {
		case gateway.ConnectionStatusConnected, gateway.ConnectionStatusConnecting:
			return false, nil
		}
		if err := live.Connect(ctx); err != nil {
			return !isDeviceInvalidated(err), err
		}
		return false, nil
	}
}

// isDeviceInvalidated: the platform revoked the session (logged out from the phone). Only a fresh
// QR pairing brings it back, which is the operator's move — retrying would just repeat the refusal.
func isDeviceInvalidated(err error) bool {
	var appErr *coreerrors.AppError
	return stderrors.As(err, &appErr) && appErr.Code == ctxerrors.CodeChannelDeviceInvalidated
}
