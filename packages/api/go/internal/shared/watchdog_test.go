package shared

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

func TestIsOrphaned(t *testing.T) {
	cases := []struct {
		name       string
		supervisor string
		parent     int
		want       bool
	}{
		// The shell that spawned us is still our parent — the normal state, all day.
		{"parent unchanged", "4242", 4242, false},
		// The incident, verbatim: the shell was SIGKILLed and macOS handed us to launchd, where we
		// went on holding :3032 for a window that no longer had a backend.
		{"reparented to launchd", "4242", 1, true},
		// Stronger than `ppid == 1`: a subreaper adopts the orphan instead of init and this still sees it.
		{"reparented to a subreaper", "4242", 9999, true},
		// Everything below is `bun dev` / `go test` / the e2e harness: nothing is supervising us, and
		// a false positive would shut the gateway down one second into every local session.
		{"no supervisor declared", "", 1, false},
		{"blank supervisor", "   ", 1, false},
		{"malformed supervisor", "nope", 1, false},
		{"zero supervisor", "0", 1, false},
		{"negative supervisor", "-1", 1, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsOrphaned(tc.supervisor, tc.parent); got != tc.want {
				t.Fatalf("IsOrphaned(%q, %d) = %v, want %v", tc.supervisor, tc.parent, got, tc.want)
			}
		})
	}
}

// The loop must sit still while the parent is alive and react the moment it is not.
func TestWatchParentReactsOnlyAfterTheParentChanges(t *testing.T) {
	var parent atomic.Int64
	parent.Store(4242)
	var shutdowns atomic.Int64

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go watchParent(ctx, "4242", 2*time.Millisecond, func() int { return int(parent.Load()) }, func() {
		shutdowns.Add(1)
	})

	time.Sleep(30 * time.Millisecond)
	if got := shutdowns.Load(); got != 0 {
		t.Fatalf("com o pai vivo o watchdog nao pode desligar nada, mas desligou %d vez(es)", got)
	}

	parent.Store(1)
	deadline := time.Now().Add(time.Second)
	for shutdowns.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(2 * time.Millisecond)
	}
	if got := shutdowns.Load(); got != 1 {
		t.Fatalf("orfao tem de pedir shutdown exatamente uma vez, pediu %d", got)
	}

	// And exactly once: the loop returns after firing, so a slow fx unwind is never raced by a
	// second Shutdown from the same watchdog.
	time.Sleep(30 * time.Millisecond)
	if got := shutdowns.Load(); got != 1 {
		t.Fatalf("o watchdog tem de parar depois de disparar, mas disparou %d vezes", got)
	}
}

// A cancelled context stops it — that is what keeps the goroutine from outliving a NORMAL shutdown
// and firing a redundant Shutdown into an app that is already unwinding.
func TestWatchParentStopsOnContextCancel(t *testing.T) {
	var shutdowns atomic.Int64
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	done := make(chan struct{})
	go func() {
		watchParent(ctx, "4242", time.Millisecond, func() int { return 1 }, func() { shutdowns.Add(1) })
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("watchParent nao respeitou o cancelamento do contexto")
	}
	if got := shutdowns.Load(); got != 0 {
		t.Fatalf("cancelado antes do primeiro tick, nao pode ter desligado nada (%d)", got)
	}
}
