package shared

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
// The condition is os.Getppid() != CODM_PARENT_PID, and nothing else. A pid's parent changes for
// exactly one reason — the parent died — so the comparison is exact, needs no liveness probe, and
// (unlike signalling the parent to test it) cannot be fooled by pid reuse. It is also stronger than
// `ppid == 1`: on a host with a subreaper the orphan is adopted by something that is not init.
//
// The reaction is fx.Shutdowner, not os.Exit: it unwinds the same OnStop hooks a SIGTERM would
// (http server drained, outbox dispatcher stopped, SQLite store closed), so the shared codm.db is
// never left mid-write by the cleanup that exists to prevent messes.
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

// IsOrphaned is PURE: orphaned iff a supervisor was declared AND it is no longer our parent.
func IsOrphaned(rawSupervisorPID string, currentParentPID int) bool {
	supervisor := DeclaredSupervisorPID(rawSupervisorPID)
	return supervisor != 0 && currentParentPID != supervisor
}

// startParentWatchdog is the fx wiring: one goroutine, stopped with the app.
func startParentWatchdog(lc fx.Lifecycle, shutdowner fx.Shutdowner) {
	raw := os.Getenv(parentPIDEnv)
	if DeclaredSupervisorPID(raw) == 0 {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	lc.Append(fx.Hook{
		OnStart: func(context.Context) error {
			go watchParent(ctx, raw, watchdogInterval, os.Getppid, func() {
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
// interval and the ppid source as parameters — so the loop is exercised by a test at millisecond
// cadence instead of by fx at the real one.
func watchParent(ctx context.Context, rawSupervisorPID string, interval time.Duration, parentPID func() int, onOrphaned func()) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if !IsOrphaned(rawSupervisorPID, parentPID()) {
				continue
			}
			slog.Error(
				"supervisor is gone — shutting down so no port is left held",
				"supervisor", rawSupervisorPID,
				"reparentedTo", parentPID(),
			)
			onOrphaned()
			return
		}
	}
}
