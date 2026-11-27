package whatsapp

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"go.mau.fi/whatsmeow"
)

// The send path used to give up on the first transport hiccup: the box reaches WhatsApp through an egress
// tunnel that drops the long-lived websocket every few minutes (whatsmeow then auto-reconnects within
// seconds), and a send that landed in that window failed with `failed to send usync query: context
// canceled` (measured 2026-11-26: 2 failures at 16:30 and 18:25). One retry after the reconnect — with the
// SAME message ID so WhatsApp dedupes if the first attempt did reach the server — turns those into
// successes. Permanent rejections (IQ errors, invalid JIDs, not paired) are never retried.
const (
	// sendAttemptTimeout bounds one attempt. It is separate from the caller's context so a slow attempt
	// cannot eat the time the retry needs.
	sendAttemptTimeout = 30 * time.Second
	// reconnectWait is how long a failed send waits for whatsmeow's auto-reconnect before giving up.
	reconnectWait = 20 * time.Second
	// reconnectPoll is the IsConnected polling interval while waiting.
	reconnectPoll = 250 * time.Millisecond
)

// ErrSendTransient marks a send that failed because WhatsApp was unreachable (disconnected or mid-reconnect),
// also after the single retry. The caller should answer 503 + Retry-After and let the client try later.
var ErrSendTransient = errors.New("whatsapp temporarily unavailable")

// isTransientSendErr reports whether err is a transport-level failure a reconnect can fix. Server rejections
// (whatsmeow.IQError), a store without a device JID and everything not recognised are permanent.
func isTransientSendErr(err error) bool {
	if err == nil {
		return false
	}
	var iqErr *whatsmeow.IQError
	if errors.As(err, &iqErr) || errors.Is(err, whatsmeow.ErrNotLoggedIn) || errors.Is(err, ErrInvalidRemoteID) {
		return false
	}
	if errors.Is(err, whatsmeow.ErrNotConnected) || errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) ||
		errors.Is(err, whatsmeow.ErrIQTimedOut) || errors.Is(err, whatsmeow.ErrMessageTimedOut) {
		return true
	}
	msg := strings.ToLower(err.Error())
	for _, needle := range []string{
		"usync", "context canceled", "websocket", "broken pipe", "connection reset",
		"use of closed network connection", "failed to write frame", "not connected",
	} {
		if strings.Contains(msg, needle) {
			return true
		}
	}
	return false
}

// retrySend runs attempt, and — only when it fails transiently and ctx is still alive — waits for the
// connection to come back and runs it exactly once more. The caller makes attempt idempotent (same message
// ID). A failure that is still transient after the retry (or a connection that never returned) is wrapped
// with ErrSendTransient.
func retrySend(
	ctx context.Context,
	attempt func(context.Context) (whatsmeow.SendResponse, error),
	awaitConnected func(context.Context, time.Duration) bool,
) (whatsmeow.SendResponse, error) {
	run := func() (whatsmeow.SendResponse, error) {
		actx, cancel := context.WithTimeout(ctx, sendAttemptTimeout)
		defer cancel()
		return attempt(actx)
	}
	resp, err := run()
	if err == nil || ctx.Err() != nil || !isTransientSendErr(err) {
		return resp, err
	}
	slog.Warn("send failed transiently — waiting for reconnect before the single retry", "error", err)
	if !awaitConnected(ctx, reconnectWait) {
		return resp, fmt.Errorf("%w: %w", ErrSendTransient, err)
	}
	resp, err = run()
	if err != nil && isTransientSendErr(err) {
		return resp, fmt.Errorf("%w: %w", ErrSendTransient, err)
	}
	return resp, err
}

// AwaitConnected blocks until the websocket is connected and logged in, or max / ctx elapses.
func (c *WhatsmeowChannel) AwaitConnected(ctx context.Context, max time.Duration) bool {
	ready := func() bool { return c.client.IsConnected() && c.client.IsLoggedIn() }
	if ready() {
		return true
	}
	deadline := time.NewTimer(max)
	defer deadline.Stop()
	tick := time.NewTicker(reconnectPoll)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return false
		case <-deadline.C:
			return ready()
		case <-tick.C:
			if ready() {
				return true
			}
		}
	}
}
