package whatsapp

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"go.mau.fi/whatsmeow"
)

func TestIsTransientSendErr(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"usync context canceled (the 2026-11-26 failure)", fmt.Errorf("failed to send message: failed to get device list: failed to send usync query: context canceled"), true},
		{"not connected", whatsmeow.ErrNotConnected, true},
		{"wrapped not connected", fmt.Errorf("x: %w", whatsmeow.ErrNotConnected), true},
		{"context canceled", context.Canceled, true},
		{"attempt deadline", fmt.Errorf("send: %w", context.DeadlineExceeded), true},
		{"iq timeout", whatsmeow.ErrIQTimedOut, true},
		{"websocket closed text", errors.New("failed to write frame: websocket: close sent"), true},
		{"broken pipe", errors.New("write tcp 1.2.3.4:1->5.6.7.8:443: write: broken pipe"), true},
		{"server rejection 403", whatsmeow.ErrIQForbidden, false},
		{"server rejection 400 wrapped", fmt.Errorf("x: %w", whatsmeow.ErrIQBadRequest), false},
		{"not paired", whatsmeow.ErrNotLoggedIn, false},
		{"invalid jid", fmt.Errorf("%w: bad", ErrInvalidRemoteID), false},
		{"unknown", errors.New("boom"), false},
	}
	for _, tc := range cases {
		if got := isTransientSendErr(tc.err); got != tc.want {
			t.Errorf("%s: isTransientSendErr = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func okResp() whatsmeow.SendResponse { return whatsmeow.SendResponse{ID: "ID1"} }

func TestRetrySend_SuccessFirstTimeDoesNotWait(t *testing.T) {
	calls := 0
	_, err := retrySend(context.Background(),
		func(context.Context) (whatsmeow.SendResponse, error) { calls++; return okResp(), nil },
		func(context.Context, time.Duration) bool { t.Fatal("must not wait"); return true })
	if err != nil || calls != 1 {
		t.Fatalf("err=%v calls=%d", err, calls)
	}
}

func TestRetrySend_TransientThenSuccess_RetriesExactlyOnce(t *testing.T) {
	calls, waits := 0, 0
	resp, err := retrySend(context.Background(),
		func(context.Context) (whatsmeow.SendResponse, error) {
			calls++
			if calls == 1 {
				return whatsmeow.SendResponse{}, errors.New("failed to send usync query: context canceled")
			}
			return okResp(), nil
		},
		func(_ context.Context, d time.Duration) bool {
			waits++
			if d != reconnectWait {
				t.Errorf("waited %v, want %v", d, reconnectWait)
			}
			return true
		})
	if err != nil || calls != 2 || waits != 1 || resp.ID != "ID1" {
		t.Fatalf("err=%v calls=%d waits=%d resp=%+v", err, calls, waits, resp)
	}
}

func TestRetrySend_TransientTwice_GivesUpWithErrSendTransient(t *testing.T) {
	calls := 0
	_, err := retrySend(context.Background(),
		func(context.Context) (whatsmeow.SendResponse, error) {
			calls++
			return whatsmeow.SendResponse{}, whatsmeow.ErrNotConnected
		},
		func(context.Context, time.Duration) bool { return true })
	if calls != 2 {
		t.Fatalf("calls=%d, want exactly 2 (one retry)", calls)
	}
	if !errors.Is(err, ErrSendTransient) || !errors.Is(err, whatsmeow.ErrNotConnected) {
		t.Fatalf("err=%v must wrap ErrSendTransient and the cause", err)
	}
}

func TestRetrySend_StillDisconnected_NoSecondAttempt(t *testing.T) {
	calls := 0
	_, err := retrySend(context.Background(),
		func(context.Context) (whatsmeow.SendResponse, error) {
			calls++
			return whatsmeow.SendResponse{}, whatsmeow.ErrNotConnected
		},
		func(context.Context, time.Duration) bool { return false })
	if calls != 1 || !errors.Is(err, ErrSendTransient) {
		t.Fatalf("calls=%d err=%v", calls, err)
	}
}

func TestRetrySend_PermanentRejection_NotRetried(t *testing.T) {
	calls := 0
	_, err := retrySend(context.Background(),
		func(context.Context) (whatsmeow.SendResponse, error) {
			calls++
			return whatsmeow.SendResponse{}, whatsmeow.ErrIQForbidden
		},
		func(context.Context, time.Duration) bool { t.Fatal("must not wait"); return true })
	if calls != 1 || errors.Is(err, ErrSendTransient) || !errors.Is(err, whatsmeow.ErrIQForbidden) {
		t.Fatalf("calls=%d err=%v", calls, err)
	}
}

func TestRetrySend_CallerContextDone_NotRetried(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	calls := 0
	_, err := retrySend(ctx,
		func(context.Context) (whatsmeow.SendResponse, error) {
			calls++
			cancel() // the overall budget is gone
			return whatsmeow.SendResponse{}, context.Canceled
		},
		func(context.Context, time.Duration) bool { t.Fatal("must not wait"); return true })
	if calls != 1 || !errors.Is(err, context.Canceled) {
		t.Fatalf("calls=%d err=%v", calls, err)
	}
}

func TestRetrySend_AttemptGetsOwnTimeout(t *testing.T) {
	_, _ = retrySend(context.Background(),
		func(ctx context.Context) (whatsmeow.SendResponse, error) {
			dl, ok := ctx.Deadline()
			if !ok || time.Until(dl) > sendAttemptTimeout {
				t.Errorf("attempt ctx deadline=%v ok=%v, want <= %v", dl, ok, sendAttemptTimeout)
			}
			return okResp(), nil
		},
		func(context.Context, time.Duration) bool { return true })
}
