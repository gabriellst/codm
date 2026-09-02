package proclive

import (
	"os"
	"os/exec"
	"testing"
	"time"
)

// sleepHelperEnv marks the re-exec of THIS test binary as the disposable "foreign live process".
// Spawning `sleep 30` would have been shorter and is what the sqlite lock test used to do, but that
// binary does not exist on Windows — which is precisely the OS whose answer was wrong, so the test
// that proves it has to run there.
const sleepHelperEnv = "CODM_PROCLIVE_SLEEP_HELPER"

// TestSleepHelperProcess is not a test: it is the body of the child process the cases below spawn.
// Without the env var it skips instantly, so a normal `go test ./...` costs nothing.
func TestSleepHelperProcess(t *testing.T) {
	if os.Getenv(sleepHelperEnv) == "" {
		t.Skip("helper process body — only runs when re-exec'd by this package's tests")
	}
	time.Sleep(30 * time.Second)
}

func startSleepHelper(t *testing.T) int {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=^TestSleepHelperProcess$")
	cmd.Env = append(os.Environ(), sleepHelperEnv+"=1")
	if err := cmd.Start(); err != nil {
		t.Fatalf("spawn sleep helper: %v", err)
	}
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
	})
	return cmd.Process.Pid
}

func TestIsAlive(t *testing.T) {
	t.Run("this very process is alive", func(t *testing.T) {
		if !IsAlive(os.Getpid()) {
			t.Fatal("the running test process must read as alive")
		}
	})

	t.Run("a non-pid is never alive", func(t *testing.T) {
		for _, pid := range []int{0, -1} {
			if IsAlive(pid) {
				t.Fatalf("IsAlive(%d) must be false", pid)
			}
		}
	})

	// The case the old lock.go got wrong on Windows, where it answered false for every pid: a
	// FOREIGN process that is genuinely running. Everything the single-instance guard does hangs off
	// this answer — read it wrong and the guard reclaims a live owner's lock instead of refusing.
	t.Run("a live foreign process is alive", func(t *testing.T) {
		if pid := startSleepHelper(t); !IsAlive(pid) {
			t.Fatalf("a running child (pid %d) must read as alive", pid)
		}
	})

	t.Run("a process that already exited is dead", func(t *testing.T) {
		// Re-exec with a filter that matches nothing: it starts, runs no test, exits 0.
		cmd := exec.Command(os.Args[0], "-test.run=^$")
		if err := cmd.Start(); err != nil {
			t.Fatalf("spawn disposable process: %v", err)
		}
		pid := cmd.Process.Pid
		if err := cmd.Wait(); err != nil {
			t.Fatalf("the disposable process should exit cleanly: %v", err)
		}
		if IsAlive(pid) {
			t.Fatalf("an exited process (pid %d) cannot be alive", pid)
		}
	})
}
