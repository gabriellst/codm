//go:build windows

package watchdog

import (
	"errors"

	"golang.org/x/sys/windows"
)

// processAlive probes pid via OpenProcess + GetExitCodeProcess. Signal 0 (process_alive_unix.go's
// idiom) does not exist here: os.Process.Signal on Windows only understands os.Kill, which is why
// core/db/sqlite/lock.go's isProcessAlive conservatively returns false for EVERY pid on this OS —
// correct for a lock (a wrong reclaim only costs the true owner a retry with a clear error),
// catastrophic for a watchdog whose ppid half never fires on Windows (see watchdog.go: os.Getppid()
// is frozen at spawn there). This file is a real probe, built for that difference.

// stillActive is the Win32 STILL_ACTIVE sentinel GetExitCodeProcess returns while pid has not
// exited yet (259 / 0x103, same value as STATUS_PENDING — that collision is a documented Win32
// wart, not a bug here). golang.org/x/sys/windows does not export this constant, so it is declared
// locally instead of pulled from a package that does not have it.
const stillActive = 259

func processAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		// ERROR_ACCESS_DENIED ⇒ exists but we may not query it (still alive) — the Windows analogue
		// of EPERM in process_alive_unix.go. Anything else (ERROR_INVALID_PARAMETER, ...) ⇒ no such
		// pid.
		return errors.Is(err, windows.ERROR_ACCESS_DENIED)
	}
	defer windows.CloseHandle(handle)

	var exitCode uint32
	if err := windows.GetExitCodeProcess(handle, &exitCode); err != nil {
		// OpenProcess succeeded but the exit code could not be read — treat as alive rather than
		// risk a false shutdown. The ppid half of IsOrphaned is what actually covers Windows' one
		// false negative (a reused pid), same trade documented in watchdog.go.
		return true
	}
	return exitCode == stillActive
}
