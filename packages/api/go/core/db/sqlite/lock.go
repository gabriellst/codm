package sqlite

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"syscall"
)

// DataDirLockedError is returned when a second process tries to open a SQLite
// data dir that a LIVE process already holds. Callers can errors.As-match it to
// fail loudly instead of silently opening a second handle on the same file.
//
// SQLite in WAL mode is multi-process safe for concurrent readers/writers, but
// the go-domain target is a SINGLE supervised process owning the store
// (go-domain-design.md §5.2). This guard mirrors the TS DataDirLock
// (packages/api/typescript/core/src/db/drivers/DataDirLock.ts): one owner per
// data dir, fail-loud on a second live daemon, reclaim a stale lock from a
// crashed one.
type DataDirLockedError struct {
	LockPath  string
	HeldByPID int
}

func (e *DataDirLockedError) Error() string {
	return fmt.Sprintf(
		"sqlite data dir lock %q is already held by a running process (pid %d). "+
			"Only one process may own the codedm SQLite store at a time — stop the other "+
			"process or point this one at a different data dir.",
		e.LockPath, e.HeldByPID,
	)
}

// isProcessAlive reports whether pid names a currently-running process. Signal 0
// probes existence without delivering anything: nil ⇒ alive; EPERM ⇒ exists but
// unsignalable (still alive); ESRCH ⇒ no such process. On platforms where signal
// 0 is unsupported (Windows) this conservatively returns false, so a stale lock
// is always reclaimable there.
func isProcessAlive(pid int) bool {
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

// acquireDataDirLock takes an exclusive PID lockfile at lockPath, mirroring the
// TS acquireDataDirLock. It writes the current pid with O_EXCL so the acquire is
// atomic against a racing process. If the lockfile already holds a DIFFERENT live
// pid it returns *DataDirLockedError; a stale lock (dead pid) is reclaimed. The
// returned release func removes the lockfile iff this process still owns it — the
// store calls it on Close.
func acquireDataDirLock(lockPath string) (func(), error) {
	self := os.Getpid()

	write := func() error {
		f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
		if err != nil {
			return err
		}
		defer f.Close()
		_, err = f.WriteString(strconv.Itoa(self))
		return err
	}

	err := write()
	if err != nil {
		if !errors.Is(err, os.ErrExist) {
			return nil, fmt.Errorf("acquire sqlite lock: %w", err)
		}

		holder := readLockPID(lockPath)
		// Idempotent for THIS process: same pid means we already own it.
		if holder == self {
			return releaseFunc(lockPath, self), nil
		}
		if isProcessAlive(holder) {
			return nil, &DataDirLockedError{LockPath: lockPath, HeldByPID: holder}
		}

		// Stale lock (previous owner crashed) — reclaim. The retry is still O_EXCL,
		// so a live process that acquired in the gap wins and we surface its lock.
		_ = os.Remove(lockPath)
		if err := write(); err != nil {
			if errors.Is(err, os.ErrExist) {
				return nil, &DataDirLockedError{LockPath: lockPath, HeldByPID: readLockPID(lockPath)}
			}
			return nil, fmt.Errorf("acquire sqlite lock (reclaim): %w", err)
		}
	}

	return releaseFunc(lockPath, self), nil
}

// readLockPID reads the pid recorded in the lockfile, or 0 if it is
// missing/unreadable/garbage.
func readLockPID(lockPath string) int {
	raw, err := os.ReadFile(lockPath)
	if err != nil {
		return 0
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(raw)))
	if err != nil {
		return 0
	}
	return pid
}

// releaseFunc returns an idempotent release that removes the lockfile only if it
// still records this process's pid (defensive against a reclaim by another
// process after a crash).
func releaseFunc(lockPath string, self int) func() {
	return func() {
		if readLockPID(lockPath) == self {
			_ = os.Remove(lockPath)
		}
	}
}
