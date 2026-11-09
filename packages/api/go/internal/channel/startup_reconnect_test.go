package channel

import (
	"context"
	stderrors "errors"
	"fmt"
	"reflect"
	"testing"
	"time"

	ctxerrors "template/api-go/internal/channel/errors"
	gateway "template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/gateway/mock"
	"template/api-go/internal/channel/services/pool"
	coreerrors "template/core-go/errors"
	"template/core-go/types"

	"github.com/google/uuid"
)

// recordingWait never sleeps; it records each requested delay and can end the loop after `allow`
// waits, standing in for the gateway stopping mid-backoff.
type recordingWait struct {
	delays []time.Duration
	allow  int
}

func (w *recordingWait) wait(_ context.Context, d time.Duration) bool {
	w.delays = append(w.delays, d)
	return w.allow < 0 || len(w.delays) <= w.allow
}

// scriptedAttempt answers each call with the next scripted outcome.
func scriptedAttempt(outcomes ...struct {
	retry bool
	err   error
}) (connectAttempt, *int) {
	calls := 0
	return func(context.Context) (bool, error) {
		o := outcomes[calls]
		calls++
		return o.retry, o.err
	}, &calls
}

var (
	transient = struct {
		retry bool
		err   error
	}{true, stderrors.New("failed to dial whatsapp web websocket: lookup web.whatsapp.com: no such host")}
	connected = struct {
		retry bool
		err   error
	}{false, nil}
)

func TestRetryUntilSettled_RetriesATransientFailureWithGrowingDelaysUntilItConnects(t *testing.T) {
	attempt, calls := scriptedAttempt(transient, transient, transient, transient, transient, transient, transient, connected)
	w := &recordingWait{allow: -1}
	delays := []time.Duration{2 * time.Second, 5 * time.Second, 60 * time.Second}

	n := retryUntilSettled(context.Background(), uuid.New(), attempt, delays, w.wait)

	if n != 8 || *calls != 8 {
		t.Fatalf("want 8 attempts (7 failures + the one that connects), got n=%d calls=%d", n, *calls)
	}
	want := []time.Duration{2 * time.Second, 5 * time.Second, 60 * time.Second, 60 * time.Second, 60 * time.Second, 60 * time.Second, 60 * time.Second}
	if !reflect.DeepEqual(w.delays, want) {
		t.Fatalf("delays: want %v (last one repeats), got %v", want, w.delays)
	}
}

func TestRetryUntilSettled_ConnectingOnTheFirstTryNeverWaits(t *testing.T) {
	attempt, calls := scriptedAttempt(connected)
	w := &recordingWait{allow: -1}

	retryUntilSettled(context.Background(), uuid.New(), attempt, startupRetryDelays, w.wait)

	if *calls != 1 || len(w.delays) != 0 {
		t.Fatalf("want a single attempt and no wait, got calls=%d waits=%v", *calls, w.delays)
	}
}

func TestRetryUntilSettled_AnInvalidatedDeviceIsNotRetried(t *testing.T) {
	attempt, calls := scriptedAttempt(transient, struct {
		retry bool
		err   error
	}{false, coreerrors.NewBaseError(ctxerrors.CodeChannelDeviceInvalidated, "reconnect via QR pairing")})
	w := &recordingWait{allow: -1}

	retryUntilSettled(context.Background(), uuid.New(), attempt, startupRetryDelays, w.wait)

	if *calls != 2 || len(w.delays) != 1 {
		t.Fatalf("want the loop to end on the permanent failure, got calls=%d waits=%v", *calls, w.delays)
	}
}

func TestRetryUntilSettled_StoppingTheGatewayEndsTheBackoff(t *testing.T) {
	attempt, calls := scriptedAttempt(transient, transient, transient, connected)
	w := &recordingWait{allow: 1} // the second wait is interrupted by the stop

	retryUntilSettled(context.Background(), uuid.New(), attempt, startupRetryDelays, w.wait)

	if *calls != 2 {
		t.Fatalf("want no attempt after the stop, got %d attempts", *calls)
	}
}

func TestSleepCtx_ReturnsFalseOnceTheContextEnds(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if sleepCtx(ctx, time.Hour) {
		t.Fatal("a cancelled context must cut the sleep short")
	}
}

func TestIsDeviceInvalidated(t *testing.T) {
	invalidated := coreerrors.NewBaseError(ctxerrors.CodeChannelDeviceInvalidated, "reconnect via QR pairing")
	cases := map[string]struct {
		err  error
		want bool
	}{
		"the named error":       {invalidated, true},
		"wrapped":               {fmt.Errorf("connect: %w", invalidated), true},
		"another app error":     {coreerrors.NewBaseError(coreerrors.CodeNotFound, "nope"), false},
		"a network failure":     {transient.err, false},
		"no error at all (nil)": {nil, false},
	}
	for name, c := range cases {
		if got := isDeviceInvalidated(c.err); got != c.want {
			t.Errorf("%s: want %v, got %v", name, c.want, got)
		}
	}
}

type noopDomainEventRepo struct{}

func (noopDomainEventRepo) Save(context.Context, types.DomainEventI) error      { return nil }
func (noopDomainEventRepo) SaveAll(context.Context, []types.DomainEventI) error { return nil }

func TestBootConnectAttempt_ConnectsAndThenStandsDownForAChannelAlreadyComingUp(t *testing.T) {
	p := pool.NewChannelPool(mock.NewMockChannelFactory(mock.Scenario{}, noopDomainEventRepo{}))
	channelID := uuid.New()
	cfg := gateway.ChannelConfig{OwnerID: "owner-1", OwnerRemoteID: "5511999999999@s.whatsapp.net"}
	attempt := bootConnectAttempt(p, channelID, cfg)

	retry, err := attempt(context.Background())
	if retry || err != nil {
		t.Fatalf("first attempt: want connected (retry=false, err=nil), got retry=%v err=%v", retry, err)
	}
	live, ok := p.Get(channelID)
	if !ok {
		t.Fatal("the attempt must leave the channel registered in the pool")
	}
	if s := live.Status(); s != gateway.ConnectionStatusConnecting && s != gateway.ConnectionStatusConnected {
		t.Fatalf("want the channel coming up after the attempt, got %s", s)
	}

	// A second attempt (e.g. a late retry racing the operator's own connect) finds it coming up and
	// leaves it alone.
	if retry, err := attempt(context.Background()); retry || err != nil {
		t.Fatalf("second attempt: want to stand down, got retry=%v err=%v", retry, err)
	}
}
