package triage

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"

	channelerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/services/gateway/whatsapp"
	"template/api-go/internal/channel/services/pool"
	coreerrors "template/core-go/errors"
)

const (
	// sendOverallTimeout caps one /send or /send/media call end to end: one attempt (30s), the reconnect wait
	// (20s) and the single retry (30s) all live under it. The send context is detached from the HTTP request,
	// so a client that gives up (and cancels its request) cannot cancel the usync mid-flight.
	sendOverallTimeout = 100 * time.Second
	// reconnectWait is how long a request waits for whatsmeow's auto-reconnect when the bridge is not
	// connected at the moment the request arrives.
	reconnectWait = 20 * time.Second
	// retryAfterSeconds is the Retry-After value of a 503.
	retryAfterSeconds = "10"
)

// connectionAwaiter is implemented by the WhatsApp channel; the mock gateway has no websocket to wait for.
type connectionAwaiter interface {
	AwaitConnected(ctx context.Context, max time.Duration) bool
}

// sendContext returns the context a send runs under: the request's values, none of its cancellation.
func sendContext(r *http.Request) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.WithoutCancel(r.Context()), sendOverallTimeout)
}

// awaitChannelConnected waits up to reconnectWait for the channel's websocket. It reports true when the
// channel is connected, or when there is nothing to wait on (unknown channel id, channel not in the pool, a
// gateway without the capability) — the send itself then produces the precise error.
func awaitChannelConnected(ctx context.Context, pl pool.ChannelPool, channelID string) bool {
	id, err := uuid.Parse(channelID)
	if err != nil {
		return true
	}
	gw, ok := pl.Get(id)
	if !ok {
		return true
	}
	aw, ok := gw.(connectionAwaiter)
	if !ok {
		return true
	}
	return aw.AwaitConnected(ctx, reconnectWait)
}

// isUnavailable reports a transient "WhatsApp not reachable" failure that deserves 503 + Retry-After:
// the send failed even after the reconnect-and-retry, or the channel row says it is not connected.
func isUnavailable(err error) bool {
	if errors.Is(err, whatsapp.ErrSendTransient) {
		return true
	}
	var appErr *coreerrors.AppError
	return errors.As(err, &appErr) && appErr.Code == channelerrors.CodeChannelNotConnected
}

func respondUnavailable(w http.ResponseWriter, msg string) {
	w.Header().Set("Retry-After", retryAfterSeconds)
	jsonErr(w, http.StatusServiceUnavailable, msg)
}
