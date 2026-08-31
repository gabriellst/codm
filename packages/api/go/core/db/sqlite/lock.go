package sqlite

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"template/core-go/pkg/proclive"
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
			"Only one process may own the codm SQLite store at a time — stop the other "+
			"process or point this one at a different data dir.",
		e.LockPath, e.HeldByPID,
	)
}

// acquireDataDirLock takes an exclusive PID lockfile at lockPath, mirroring the
// TS acquireDataDirLock. If the lockfile already holds a DIFFERENT live pid it
// returns *DataDirLockedError; a stale lock (dead pid) is reclaimed. The returned
// release func removes the lockfile iff this process still owns it — the store
// calls it on Close.
func acquireDataDirLock(lockPath string) (func(), error) {
	self := os.Getpid()

	err := publishLock(lockPath, self)
	if err == nil {
		return releaseFunc(lockPath, self), nil
	}
	if !errors.Is(err, os.ErrExist) {
		return nil, fmt.Errorf("acquire sqlite lock: %w", err)
	}

	holder := readLockPID(lockPath)
	// Idempotent for THIS process: same pid means we already own it.
	if holder == self {
		return releaseFunc(lockPath, self), nil
	}
	if proclive.IsAlive(holder) {
		return nil, &DataDirLockedError{LockPath: lockPath, HeldByPID: holder}
	}

	// Stale lock (previous owner crashed) — reclaim. The retry still publishes
	// atomically, so a live process that acquired in the gap wins and we surface
	// its lock instead of stomping it.
	_ = os.Remove(lockPath)
	if err := publishLock(lockPath, self); err != nil {
		if errors.Is(err, os.ErrExist) {
			return nil, &DataDirLockedError{LockPath: lockPath, HeldByPID: readLockPID(lockPath)}
		}
		return nil, fmt.Errorf("acquire sqlite lock (reclaim): %w", err)
	}

	return releaseFunc(lockPath, self), nil
}

// publishLock makes lockPath appear, ALREADY CONTAINING pid, in one atomic step:
// the pid is written to a private temp file next to it and the finished file is
// hard-linked into place. os.Link fails with os.ErrExist when the name is taken,
// which is the same exclusivity O_EXCL gave — minus the window that O_EXCL left
// open.
//
// THAT WINDOW WAS A REAL BUG, not a theoretical one. Creating with O_EXCL and
// THEN writing the pid means a racing acquirer can stat the file between the two
// syscalls and read it EMPTY. readLockPID answers 0, nobody is pid 0, so the
// racer concludes "stale" and DELETES a live owner's lock — and whoever then
// loses the re-create reports "already held by a running process (pid 0)". That
// is how TestConcurrentBoot's three racers failed on the Linux CI runner; the
// Windows host hid it because the liveness probe there answered false for every
// pid, so the reclaim branch was the normal path instead of the error one.
//
// A filesystem without hard links fails loudly here rather than falling back to
// the racy path. That is not a real narrowing: SQLite's WAL mode already needs
// the shared-memory support such filesystems lack, so a data dir that cannot
// link could not host this store anyway.
func publishLock(lockPath string, pid int) error {
	tmp, err := os.CreateTemp(filepath.Dir(lockPath), filepath.Base(lockPath)+".*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	// Removes the temp NAME, never the published lock: after a successful link the
	// content has two names and only this one goes away.
	defer func() { _ = os.Remove(tmpPath) }()

	if _, err := tmp.WriteString(strconv.Itoa(pid)); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Link(tmpPath, lockPath)
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
