package watchdog

import "template/core-go/pkg/proclive"

// processAlive is the DEFAULT liveness probe StartParentWatchdog wires ("is my supervisor still
// there?"). It is a delegation, not an implementation: the per-OS probes moved to pkg/proclive when
// db/sqlite/lock.go turned out to be asking the same question of a lockfile holder against a private
// copy that answered false for every pid on Windows. pkg/proclive/alive_test.go covers the probe
// itself on every OS; watchdog_test.go keeps exercising it through the loop end to end.
func processAlive(pid int) bool {
	return proclive.IsAlive(pid)
}
