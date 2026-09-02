//go:build windows

package proclive

import (
	"errors"

	"golang.org/x/sys/windows"
)

// stillActive is the Win32 STILL_ACTIVE sentinel GetExitCodeProcess returns while pid has not exited
// yet (259 / 0x103, the same value as STATUS_PENDING — that collision is a documented Win32 wart,
// not a bug here). golang.org/x/sys/windows does not export this constant, so it is declared locally
// instead of pulled from a package that does not have it.
const stillActive = 259

// IsAlive probes pid via OpenProcess + GetExitCodeProcess. Signal 0 (the unix idiom in
// alive_unix.go) does not exist here — os.Process.Signal on Windows only understands os.Kill — so
// the question has to be asked of the Win32 API directly. Answering "false" for every pid instead,
// as db/sqlite/lock.go used to, turns a single-instance guard into a no-op on this OS: two daemons
// then open the same store file and each one deletes the other's lock.
func IsAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		// ERROR_ACCESS_DENIED ⇒ exists but we may not query it (still alive) — the Windows analogue of
		// EPERM in alive_unix.go. Anything else (ERROR_INVALID_PARAMETER, ...) ⇒ no such pid.
		return errors.Is(err, windows.ERROR_ACCESS_DENIED)
	}
	defer windows.CloseHandle(handle)

	var exitCode uint32
	if err := windows.GetExitCodeProcess(handle, &exitCode); err != nil {
		// The handle opened but the exit code could not be read — report alive rather than let a caller
		// act on a guess. For the lock that costs a retry with a clear message; for the watchdog it
		// costs one missed shutdown, which its ppid half covers.
		return true
	}
	return exitCode == stillActive
}
