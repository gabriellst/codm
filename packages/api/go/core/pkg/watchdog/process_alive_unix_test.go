//go:build unix

package watchdog

import (
	"os"
	"os/exec"
	"testing"
)

// processAlive is the probe process_alive_unix.go actually compiles on every unix build (darwin
// included) — exercised directly here at the unit level. watchdog_test.go's
// TestDefaultProbeDetectsARealDeadProcess exercises the very same function again, but through the
// watchdog loop end-to-end.
func TestProcessAliveUnix(t *testing.T) {
	t.Run("este processo esta vivo", func(t *testing.T) {
		if !processAlive(os.Getpid()) {
			t.Fatal("o proprio processo de teste deveria estar vivo")
		}
	})

	t.Run("pid invalido nunca esta vivo", func(t *testing.T) {
		for _, pid := range []int{0, -1} {
			if processAlive(pid) {
				t.Fatalf("processAlive(%d) deveria ser false", pid)
			}
		}
	})

	t.Run("um filho que ja saiu esta morto", func(t *testing.T) {
		cmd := exec.Command(os.Args[0], "-test.run=^$")
		if err := cmd.Start(); err != nil {
			t.Fatalf("nao foi possivel iniciar o processo descartavel: %v", err)
		}
		pid := cmd.Process.Pid
		if err := cmd.Wait(); err != nil {
			t.Fatalf("o processo descartavel deveria sair limpo: %v", err)
		}
		if processAlive(pid) {
			t.Fatal("um processo que ja saiu nao pode estar vivo")
		}
	})
}
