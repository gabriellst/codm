package watchdog

import (
	"context"
	"log/slog"
	"os"
	"strconv"
	"time"

	"go.uber.org/fx"
)

// PARENT WATCHDOG — the gateway's own answer to "the shell died and nobody told me".
//
// The desktop shell kills this process on every exit path it can observe: RunEvent::Exit (window
// close, Cmd+Q) and SIGTERM/SIGINT/SIGHUP (src-tauri/src/sidecars/lifecycle.rs). None of that runs
// under SIGKILL, a panic in its event loop, or a power cut — no hook of the parent's survives its
// own sudden death. What happens instead is that this process is REPARENTED (to launchd on macOS,
// pid 1) and keeps running forever, holding :3032 for a shell that no longer exists.
//
// That is the 31/07 incident: `tauri dev` hard-kills the shell on every recompile, and the founder
// collected orphans all day — one of them serving stale data to a brand-new window, with no error
// anywhere in the picture.
//
// ## The condition — two observations, one rule, no branch per OS
//
// Orphaned ⇔ a supervisor was declared AND (os.Getppid() != CODM_PARENT_PID OR the liveness probe
// says CODM_PARENT_PID is gone).
//
// The ppid half is exact on POSIX: a pid's parent changes for exactly one reason — the parent died —
// so it needs no probe and cannot be fooled by pid reuse. It is also stronger than `ppid == 1`: on a
// host with a subreaper the orphan is adopted by something that is not init.
//
// The probe half is what WINDOWS NEEDS: there is no reparenting there. os.Getppid() on Windows
// returns the pid of whoever created the process, frozen at spawn, alive or not — the ppid half
// never fires. process_alive_windows.go answers the one question Windows can: is CODM_PARENT_PID's
// process handle still alive right now (OpenProcess + GetExitCodeProcess)? Both halves are computed
// on every tick on every OS; IsOrphaned itself never branches on GOOS — the OS just decides which
// half turns true first.
//
// Why not reuse core/db/sqlite/lock.go's isProcessAlive? On POSIX the idiom is identical (signal 0,
// EPERM ⇒ alive) and process_alive_unix.go duplicates it on purpose rather than pull in a
// core/db/sqlite → core/pkg/watchdog dependency for ten lines. On WINDOWS the two callers need
// OPPOSITE defaults for the case neither can resolve cleanly: lock.go's Windows path conservatively
// returns "dead" for every pid, because for a LOCK that means "always reclaimable" — safe, since a
// wrong reclaim only costs the true owner a retry with a clear error. For THIS watchdog "dead" would
// be catastrophic: combined with the frozen ppid it would read every Windows gateway as orphaned on
// the very first tick and shut it down a second after boot. So process_alive_windows.go is a real
// probe (OpenProcess + GetExitCodeProcess), not a conservative stand-in.
//
// ## The reaction — fx.Shutdowner, never os.Exit
//
// The reaction is fx.Shutdowner, not os.Exit: it unwinds the same OnStop hooks a SIGTERM would (http
// server drained, outbox dispatcher stopped, SQLite store closed), so the shared codm.db is never
// left mid-write by the cleanup that exists to prevent messes. This does not change with this task —
// Windows has no SIGTERM to receive in the first place, so fx.Shutdowner was ALREADY the only
// reaction that could ever run there; what was missing was the CONDITION ever becoming true.
//
// CODM_PARENT_PID is deliberately absent from REPO.env / .env.example: it is a spawn-time argument
// the shell stamps on the child, same class as CODM_MIGRATIONS_DIR, and a pid sitting in a file
// humans edit would make every `bun dev` gateway shut itself down a second after boot. Unset simply
// DISABLES the watchdog — which is correct for `bun dev`, the tests and the e2e harness, none of
// which have a shell above them. (It is read here rather than in core/config/config.go for the same
// reason: it is not configuration, and config.go's readers are gated by the ENV-03 parity rail.)
const parentPIDEnv = "CODM_PARENT_PID"

// How often the parent is checked. Short enough that the port is free ~1s after the shell dies.
const watchdogInterval = time.Second

// DeclaredSupervisorPID is PURE: the supervisor pid the shell declared, or 0 when it declared
// nothing usable. Missing, empty and malformed all collapse to 0 on purpose — "nobody is
// supervising us" is the normal state under `bun dev` and must never read as "our supervisor left".
func DeclaredSupervisorPID(raw string) int {
	pid, err := strconv.Atoi(raw)
	if err != nil || pid <= 0 {
		return 0
	}
	return pid
}

// IsOrphaned is PURE: orphaned iff a supervisor was declared AND (it is no longer our parent OR the
// caller's liveness probe says it is gone). supervisorAlive is the RESULT of that probe for this
// tick, not a function — the caller (watchParent) decides when to pay for the syscall, this stays a
// plain equality-and-bool so it is trivial to table-test without spawning anything real.
func IsOrphaned(rawSupervisorPID string, currentParentPID int, supervisorAlive bool) bool {
	supervisor := DeclaredSupervisorPID(rawSupervisorPID)
	if supervisor == 0 {
		return false
	}
	return currentParentPID != supervisor || !supervisorAlive
}

// StartParentWatchdog is the fx wiring: one goroutine, stopped with the app.
func StartParentWatchdog(lc fx.Lifecycle, shutdowner fx.Shutdowner) {
	raw := os.Getenv(parentPIDEnv)
	if DeclaredSupervisorPID(raw) == 0 {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	lc.Append(fx.Hook{
		OnStart: func(context.Context) error {
			go watchParent(ctx, raw, watchdogInterval, os.Getppid, processAlive, func() {
				if err := shutdowner.Shutdown(); err != nil {
					slog.Error("parent watchdog could not request shutdown", "error", err)
					os.Exit(1)
				}
			})
			slog.Info("parent watchdog armed", "supervisor", raw, "interval", watchdogInterval)
			return nil
		},
		// Cancelling on stop keeps the goroutine from outliving a NORMAL shutdown and firing a
		// second, redundant Shutdown into an app that is already unwinding.
		OnStop: func(context.Context) error {
			cancel()
			return nil
		},
	})
}

// watchParent polls until it is orphaned or cancelled. Split out from the wiring — with the
// interval, the ppid source and the liveness probe all as parameters — so the loop is exercised by a
// test at millisecond cadence, with a fake probe, instead of by fx at the real one and the real
// interval.
func watchParent(
	ctx context.Context,
	rawSupervisorPID string,
	interval time.Duration,
	parentPID func() int,
	supervisorAlive func(pid int) bool,
	onOrphaned func(),
) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			parent := parentPID()
			alive := supervisorAlive(DeclaredSupervisorPID(rawSupervisorPID))
			if !IsOrphaned(rawSupervisorPID, parent, alive) {
				continue
			}
			slog.Error(
				"supervisor is gone — shutting down so no port is left held",
				"supervisor", rawSupervisorPID,
				"reparentedTo", parent,
				"supervisorAlive", alive,
			)
			onOrphaned()
			return
		}
	}
}
