//go:build unix

// Package proclive answers ONE question — "is pid still running?" — and answers it on every OS the
// desktop ships to. It exists because two callers need the same answer for opposite reasons and one
// of them used to get it wrong: db/sqlite/lock.go asks it about a lockfile's holder ("may I reclaim
// this?") and pkg/watchdog asks it about the supervisor ("did my shell die?"). The watchdog grew a
// real Windows probe; the lock kept a private copy that returned false for EVERY pid there, which
// silently disabled the single-instance guard on a platform the product ships. One probe, one
// answer, both callers.
//
// It is the Go twin of packages/api/typescript/core/src/utils/ProcessLiveness.ts, which was
// extracted from the TS DataDirLock for exactly the same reason.
package proclive

import (
	"errors"
	"os"
	"syscall"
)

// IsAlive probes pid with signal 0 — it delivers nothing and only reports reachability: nil ⇒ alive;
// EPERM ⇒ exists but we may not signal it (still alive, e.g. another user's process); ESRCH ⇒ no
// such process. Exact on POSIX.
func IsAlive(pid int) bool {
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
