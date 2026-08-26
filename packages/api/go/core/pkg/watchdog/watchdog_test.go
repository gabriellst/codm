package watchdog

import (
	"context"
	"os"
	"os/exec"
	"strconv"
	"sync/atomic"
	"testing"
	"time"
)

func TestIsOrphaned(t *testing.T) {
	cases := []struct {
		name            string
		supervisor      string
		parent          int
		supervisorAlive bool
		want            bool
	}{
		// The shell that spawned us is still our parent AND still alive — the normal state, all day.
		{"parent unchanged, supervisor alive", "4242", 4242, true, false},
		// The incident, verbatim: the shell was SIGKILLed and macOS handed us to launchd, where we
		// went on holding :3032 for a window that no longer had a backend.
		{"reparented to launchd", "4242", 1, false, true},
		// Stronger than `ppid == 1`: a subreaper adopts the orphan instead of init and this still sees it.
		{"reparented to a subreaper", "4242", 9999, false, true},
		// ppid changed but the probe reads a reused pid as alive — still orphaned, the ppid half
		// alone is already enough.
		{"reparented but the probe reads a reused pid as alive", "4242", 1, true, true},
		// WINDOWS, verbatim: os.Getppid() is frozen at spawn and can never change there, so the
		// probe is the ONLY half that can ever turn true.
		{"ppid frozen (Windows), probe says the supervisor is gone", "4242", 4242, false, true},
		// Everything below is `bun dev` / `go test` / the e2e harness: nothing is supervising us, and
		// a false positive would shut the gateway down one second into every local session.
		{"no supervisor declared", "", 1, false, false},
		{"blank supervisor", "   ", 1, false, false},
		{"malformed supervisor", "nope", 1, false, false},
		{"zero supervisor", "0", 1, false, false},
		{"negative supervisor", "-1", 1, false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsOrphaned(tc.supervisor, tc.parent, tc.supervisorAlive); got != tc.want {
				t.Fatalf("IsOrphaned(%q, %d, %v) = %v, want %v", tc.supervisor, tc.parent, tc.supervisorAlive, got, tc.want)
			}
		})
	}
}

func alwaysAlive(int) bool { return true }

// waitForShutdown polls shutdowns until it reaches want or a one-second deadline expires, then
// fails loudly — the same "poll, don't sleep-a-fixed-amount" shape the pre-existing test used.
func waitForShutdown(t *testing.T, shutdowns *atomic.Int64, want int64) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for shutdowns.Load() < want && time.Now().Before(deadline) {
		time.Sleep(2 * time.Millisecond)
	}
	if got := shutdowns.Load(); got != want {
		t.Fatalf("esperava %d shutdown(s), obteve %d", want, got)
	}
}

// (a) POSIX path, unaffected by this task: the ppid changing alone is enough to fire, with a probe
// that never budges from "alive".
func TestWatchParentReactsOnPPIDChange(t *testing.T) {
	var parent atomic.Int64
	parent.Store(4242)
	var shutdowns atomic.Int64

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go watchParent(ctx, "4242", 2*time.Millisecond, func() int { return int(parent.Load()) }, alwaysAlive, func() {
		shutdowns.Add(1)
	})

	time.Sleep(30 * time.Millisecond)
	if got := shutdowns.Load(); got != 0 {
		t.Fatalf("com o pai vivo e o ppid inalterado o watchdog nao pode desligar nada, mas desligou %d vez(es)", got)
	}

	parent.Store(1)
	waitForShutdown(t, &shutdowns, 1)

	// And exactly once: the loop returns after firing, so a slow fx unwind is never raced by a
	// second Shutdown from the same watchdog.
	time.Sleep(30 * time.Millisecond)
	if got := shutdowns.Load(); got != 1 {
		t.Fatalf("o watchdog tem de parar depois de disparar, mas disparou %d vezes", got)
	}
}

// (b) WINDOWS path: os.Getppid() never changes there, so a constant ppid stands in for "frozen at
// spawn" — only the liveness probe going false can shut the gateway down.
func TestWatchParentReactsOnProbeDeath_FrozenPPID(t *testing.T) {
	var alive atomic.Bool
	alive.Store(true)
	var shutdowns atomic.Int64

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	// currentParentPID is a CONSTANT 4242 for the whole test — if this loop only used the ppid half
	// (the pre-Windows-fix behaviour), it would never fire no matter what the probe says.
	go watchParent(ctx, "4242", 2*time.Millisecond, func() int { return 4242 }, func(int) bool { return alive.Load() }, func() {
		shutdowns.Add(1)
	})

	time.Sleep(30 * time.Millisecond)
	if got := shutdowns.Load(); got != 0 {
		t.Fatalf("com a sonda dizendo vivo e o ppid congelado o watchdog nao pode desligar nada, mas desligou %d vez(es)", got)
	}

	alive.Store(false)
	waitForShutdown(t, &shutdowns, 1)

	time.Sleep(30 * time.Millisecond)
	if got := shutdowns.Load(); got != 1 {
		t.Fatalf("o watchdog tem de parar depois de disparar, mas disparou %d vezes", got)
	}
}

// (c) Live supervisor on any OS: ppid unchanged AND the probe agrees. This is the steady state of
// every supervised gateway, all day, and it must never fire.
func TestWatchParentDoesNotReactWhileSupervisorIsLive(t *testing.T) {
	var shutdowns atomic.Int64
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go watchParent(ctx, "4242", 2*time.Millisecond, func() int { return 4242 }, alwaysAlive, func() {
		shutdowns.Add(1)
	})

	time.Sleep(40 * time.Millisecond)
	if got := shutdowns.Load(); got != 0 {
		t.Fatalf("supervisor vivo (ppid inalterado + sonda viva) nao pode disparar nada, disparou %d vez(es)", got)
	}
}

// (d) The DEFAULT probe StartParentWatchdog actually wires — processAlive, no mock — must itself
// correctly read a real dead process as dead. This is what proves process_alive_unix.go (the file
// this build compiles on every CI runner and every contributor's machine) is not just
// self-consistent with IsOrphaned's contract on paper, but right about an operating-system fact.
func TestDefaultProbeDetectsARealDeadProcess(t *testing.T) {
	// Re-exec the test binary itself with a filter that matches nothing: it starts, runs no test,
	// exits 0. A disposable, definitely-dead-by-the-time-we-check pid, no fixture required.
	cmd := exec.Command(os.Args[0], "-test.run=^$")
	if err := cmd.Start(); err != nil {
		t.Fatalf("nao foi possivel iniciar o processo descartavel: %v", err)
	}
	deadPID := cmd.Process.Pid
	if err := cmd.Wait(); err != nil {
		t.Fatalf("o processo descartavel deveria sair limpo: %v", err)
	}

	var shutdowns atomic.Int64
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// ppid frozen on the dead supervisor's own pid, exactly what Windows would report — only the
	// DEFAULT probe (processAlive, not a mock) can make this fire.
	go watchParent(ctx, strconv.Itoa(deadPID), 2*time.Millisecond, func() int { return deadPID }, processAlive, func() {
		shutdowns.Add(1)
	})

	waitForShutdown(t, &shutdowns, 1)
}

// A cancelled context stops it — that is what keeps the goroutine from outliving a NORMAL shutdown
// and firing a redundant Shutdown into an app that is already unwinding.
func TestWatchParentStopsOnContextCancel(t *testing.T) {
	var shutdowns atomic.Int64
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	done := make(chan struct{})
	go func() {
		watchParent(ctx, "4242", time.Millisecond, func() int { return 1 }, alwaysAlive, func() { shutdowns.Add(1) })
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
