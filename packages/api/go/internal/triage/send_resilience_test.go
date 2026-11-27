package triage

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	channelerrors "template/api-go/internal/channel/errors"
	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/gateway/whatsapp"
	coreerrors "template/core-go/errors"
)

func TestIsUnavailable(t *testing.T) {
	if !isUnavailable(fmt.Errorf("x: %w", whatsapp.ErrSendTransient)) {
		t.Error("ErrSendTransient must be unavailable")
	}
	notConnected := coreerrors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel is not connected")
	if !isUnavailable(notConnected) {
		t.Error("channel-not-connected AppError must be unavailable")
	}
	if isUnavailable(coreerrors.NewBaseErrorWithCause(channelerrors.CodeMessageSendFailed, "failed", errors.New("forbidden"))) {
		t.Error("a permanent send failure must stay a normal error")
	}
	if isUnavailable(nil) {
		t.Error("nil is not unavailable")
	}
}

func TestRespondUnavailable_503WithRetryAfter(t *testing.T) {
	rec := httptest.NewRecorder()
	respondUnavailable(rec, "reconnecting")
	if rec.Code != http.StatusServiceUnavailable || rec.Header().Get("Retry-After") != "10" {
		t.Fatalf("code=%d retry-after=%q", rec.Code, rec.Header().Get("Retry-After"))
	}
}

func TestSendContext_SurvivesClientCancel(t *testing.T) {
	reqCtx, cancel := context.WithCancel(context.Background())
	r := httptest.NewRequest(http.MethodPost, "/send", nil).WithContext(reqCtx)
	ctx, done := sendContext(r)
	defer done()
	cancel() // the HTTP client hung up
	if ctx.Err() != nil {
		t.Fatalf("send context was cancelled with the request: %v", ctx.Err())
	}
	if dl, ok := ctx.Deadline(); !ok || time.Until(dl) > sendOverallTimeout {
		t.Fatalf("send context needs its own deadline <= %v", sendOverallTimeout)
	}
}

type fakeChannel struct {
	gateway.Channel
	connected bool
	waited    time.Duration
}

func (f *fakeChannel) AwaitConnected(_ context.Context, max time.Duration) bool {
	f.waited = max
	return f.connected
}

type fakePool struct {
	ch gateway.Channel
	ok bool
}

func (p fakePool) Register(context.Context, uuid.UUID, gateway.ChannelConfig) (gateway.Channel, error) {
	return nil, nil
}
func (p fakePool) Get(uuid.UUID) (gateway.Channel, bool) { return p.ch, p.ok }
func (p fakePool) Remove(uuid.UUID)                      {}
func (p fakePool) DisconnectAll()                        {}
func (p fakePool) Count() int                            { return 0 }

func TestAwaitChannelConnected(t *testing.T) {
	id := uuid.NewString()
	down := &fakeChannel{connected: false}
	if awaitChannelConnected(context.Background(), fakePool{ch: down, ok: true}, id) {
		t.Error("a channel that never reconnects must report false")
	}
	if down.waited != reconnectWait {
		t.Errorf("waited %v, want %v", down.waited, reconnectWait)
	}
	if !awaitChannelConnected(context.Background(), fakePool{ch: &fakeChannel{connected: true}, ok: true}, id) {
		t.Error("connected channel must report true")
	}
	if !awaitChannelConnected(context.Background(), fakePool{ok: false}, id) {
		t.Error("channel not in pool: let the send produce its own error")
	}
	if !awaitChannelConnected(context.Background(), fakePool{ch: &fakeChannel{}, ok: true}, "not-a-uuid") {
		t.Error("bad channel id: let the send produce its own error")
	}
}
