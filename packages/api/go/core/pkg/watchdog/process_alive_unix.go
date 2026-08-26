//go:build unix

package watchdog

import (
	"errors"
	"os"
	"syscall"
)

// processAlive probes pid with signal 0 — the same idiom core/db/sqlite/lock.go uses for a lock
// holder ("is it safe to reclaim its lockfile?"). Signal 0 delivers nothing: nil ⇒ alive; EPERM ⇒
// exists but we may not signal it (still alive); ESRCH ⇒ no such process. Exact on POSIX, and it
// does not even need to be — the ppid half of IsOrphaned already catches every real death here; this
// probe only matters for the reused-pid edge case documented in watchdog.go.
func processAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	err = proc.Signal(syscall.Signal(0))
	if err == nil {
		return true
	}
	return errors.Is(err, syscall.EPERM)
}
