//! RUNTIME SUPERVISION, as a PURE state machine — the `ReadinessGate`'s mould, applied to the half
//! of the sidecars' life the gate never watched.
//!
//! The gate answers ONE question, once: which window opens. It stops the moment the window appears,
//! and everything after that was fail-open — a sidecar could die and the console kept querying dead
//! ports (the 30/07 incident: an orphan `codm-daemon` adopted by launchd still held `:3030`, no
//! gateway existed at all, and the operator's only clue was `GATEWAY_UNAVAILABLE` from a window that
//! looked healthy).
//!
//! Same discipline as `gate.rs`: no `AppHandle`, no I/O, no timers. Two inputs go in (a probe
//! outcome, a child's exit) and a `SupervisionState` transition comes out — so `cargo test` can
//! interrogate the hysteresis and the 503/refused split without booting an app.

use std::sync::Mutex;
use std::time::Duration;

/// How many CONSECUTIVE failed probes declare a sidecar down (~15s at `PROBE_INTERVAL`).
///
/// Not a magic number and not tunable-for-taste: one isolated failure is a SQLite lock, a GC pause
/// or a slow query, and a UI that screams at every one of those teaches the operator to ignore it.
/// Three consecutive misses is a process that stopped answering, not a hiccup.
pub const FAILURE_THRESHOLD: usize = 3;

/// Cadence of the runtime probe. The boot gate polls at 500ms because it is BLOCKING a window;
/// here nobody is waiting on the answer, so the loop trades latency for near-zero cost.
pub const PROBE_INTERVAL: Duration = Duration::from_secs(5);

/// Budget for ONE probe, deliberately shorter than the cadence.
///
/// The generated client carries no default timeout, so a sidecar that accepts the connection and
/// then never answers (a wedged event loop, a deadlocked handler) would park the supervision task
/// forever — the watcher dying silently because the watched process is sick. A cycle that produced
/// no answer is, from the operator's seat, indistinguishable from a dead process, and it still needs
/// `FAILURE_THRESHOLD` of them in a row to declare anything.
pub const PROBE_TIMEOUT: Duration = Duration::from_secs(4);

/// The transition, on its way to the console (PUSH half of spec Decision 9). Typed end-to-end by
/// tauri-specta exactly like the custom commands — the console gets
/// `events.supervisionChanged.listen(...)`, never a stringly `listen('supervision:changed')`.
///
/// The derive is TRANSPORT only: `SupervisionMonitor` above neither knows nor can reach it, which is
/// what keeps the machine testable without an app.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type, tauri_specta::Event)]
pub struct SupervisionChanged {
    pub state: SupervisionState,
}

/// Which SDK sub-client answers for a sidecar — and, since supervision, which one the console is
/// being told about. A fact of the SHELL (which binary is which service), never a contract enum:
/// it crosses to the webview as the shell's own supervision payload (specta), not through
/// `packages/contracts` (spec Decision 10).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum SidecarService {
    Daemon,
    Gateway,
}

/// What the console is shown. `Degraded`/`Down` name WHICH sidecar, because the reaction differs by
/// sidecar (spec Decision 6): the daemon is the whole app, the gateway is the channel.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SupervisionState {
    Healthy,
    Degraded { sidecar: SidecarService },
    Down { sidecar: SidecarService },
}

/// The result of ONE probe, with the distinction the boot path had no use for and threw away.
///
/// `Unhealthy` means the process ANSWERED — our own health endpoint reporting that an internal gate
/// failed (pending migration, stopped dispatcher) with the process alive. `Unreachable` means
/// nothing answered at all. Collapsing the two (a bare `bool`, which is what `probe` returned before
/// this front) discards exactly the information the B1 health endpoints were built to produce.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProbeOutcome {
    Healthy,
    /// Answered with a non-200 (the health contract's 503). Process ALIVE.
    Unhealthy(u16),
    /// Connection refused, or no answer within the cycle. Process DEAD, as far as anyone can tell.
    Unreachable,
}

/// Per-sidecar verdict. `Ord` is the aggregation rule: the WORST sidecar decides what the operator
/// is shown, so `Down > Degraded > Healthy` is load-bearing, not cosmetic.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum SidecarStatus {
    Healthy,
    Degraded,
    Down,
}

struct Watched {
    service: SidecarService,
    name: String,
    /// Consecutive — a single healthy answer zeroes it. That is what makes the threshold hysteresis
    /// and not a lifetime error budget.
    consecutive_failures: usize,
    status: SidecarStatus,
    /// The child's exit is DEFINITIVE (spec Decision 2): with no auto-respawn (Decision 7) a process
    /// we watched die cannot come back, so a later healthy probe on its port is NOT a recovery — it
    /// is somebody else's process holding the port, which is the incident this front exists to stop.
    exited: bool,
}

struct Inner {
    /// Supervision decides NOTHING until the boot gate hands over (`Reveal::Main`). Two deciders
    /// racing over the same windows is the fail-open in a new costume: a crash during boot would
    /// reveal the splash while a still-booting sibling was on its way to reveal the console.
    armed: bool,
    watched: Vec<Watched>,
}

pub struct SupervisionMonitor {
    state: Mutex<Inner>,
}

impl SupervisionMonitor {
    /// `fleet` is the supervised set in declaration order — ties in the aggregate are broken by it,
    /// so the daemon (declared first) speaks before the gateway.
    pub fn new(fleet: Vec<(SidecarService, String)>) -> Self {
        Self {
            state: Mutex::new(Inner {
                armed: false,
                watched: fleet
                    .into_iter()
                    .map(|(service, name)| Watched {
                        service,
                        name,
                        consecutive_failures: 0,
                        status: SidecarStatus::Healthy,
                        exited: false,
                    })
                    .collect(),
            }),
        }
    }

    /// Hand over from the boot gate. Called once, when the console window is revealed.
    pub fn arm(&self) {
        self.state.lock().expect("supervision mutex").armed = true;
    }

    /// The supervised set — what the polling loop iterates, so the loop needs no second list.
    pub fn services(&self) -> Vec<(SidecarService, String)> {
        self.state
            .lock()
            .expect("supervision mutex")
            .watched
            .iter()
            .map(|w| (w.service, w.name.clone()))
            .collect()
    }

    /// The binary name behind a service — for the shell log and the boot-error splash, which speak
    /// in process names.
    pub fn name_of(&self, service: SidecarService) -> String {
        self.state
            .lock()
            .expect("supervision mutex")
            .watched
            .iter()
            .find(|w| w.service == service)
            .map(|w| w.name.clone())
            .unwrap_or_else(|| "unknown sidecar".to_owned())
    }

    /// The current aggregate — the PULL half of spec Decision 9 (`supervision_state`).
    pub fn state(&self) -> SupervisionState {
        let inner = self.state.lock().expect("supervision mutex");
        Self::aggregate(&inner)
    }

    /// Feed one probe result. Returns `Some(state)` ONLY when the aggregate actually moved — the
    /// caller emits on transitions, never every 5 seconds.
    pub fn note_probe(
        &self,
        service: SidecarService,
        outcome: ProbeOutcome,
    ) -> Option<SupervisionState> {
        let mut inner = self.state.lock().expect("supervision mutex");
        if !inner.armed {
            return None;
        }
        let before = Self::aggregate(&inner);
        {
            let Some(watched) = inner.watched.iter_mut().find(|w| w.service == service) else {
                return None;
            };
            if watched.exited {
                return None;
            }
            match outcome {
                ProbeOutcome::Healthy => {
                    watched.consecutive_failures = 0;
                    watched.status = SidecarStatus::Healthy;
                }
                // The threshold is shared; the VERDICT is not. WHICH state the third consecutive
                // failure declares is decided by what that failure was (spec Decision 4).
                ProbeOutcome::Unhealthy(_) => {
                    watched.consecutive_failures += 1;
                    if watched.consecutive_failures >= FAILURE_THRESHOLD {
                        watched.status = SidecarStatus::Degraded;
                    }
                }
                ProbeOutcome::Unreachable => {
                    watched.consecutive_failures += 1;
                    if watched.consecutive_failures >= FAILURE_THRESHOLD {
                        watched.status = SidecarStatus::Down;
                    }
                }
            }
        }
        let after = Self::aggregate(&inner);
        (after != before).then_some(after)
    }

    /// The child process exited. INSTANT `Down` — no probe cycle, no threshold: the exit is not
    /// evidence of death, it IS the death (spec Decision 2 / AC-2).
    pub fn note_exit(&self, service: SidecarService) -> Option<SupervisionState> {
        let mut inner = self.state.lock().expect("supervision mutex");
        if !inner.armed {
            return None;
        }
        let before = Self::aggregate(&inner);
        {
            let Some(watched) = inner.watched.iter_mut().find(|w| w.service == service) else {
                return None;
            };
            watched.exited = true;
            watched.status = SidecarStatus::Down;
            watched.consecutive_failures = FAILURE_THRESHOLD;
        }
        let after = Self::aggregate(&inner);
        (after != before).then_some(after)
    }

    /// WORST SIDECAR DECIDES. A fleet where one process is dead is not "mostly healthy" — the same
    /// rule the readiness gate applies to the boot (one failure sends everyone to the splash).
    fn aggregate(inner: &Inner) -> SupervisionState {
        // First-declared wins a tie (`max_by_key` would keep the LAST maximum), so the daemon —
        // declared first, and the one whose death costs everything — names the state.
        let worst = inner
            .watched
            .iter()
            .fold(None::<&Watched>, |worst, w| match worst {
                Some(prev) if prev.status >= w.status => Some(prev),
                _ => Some(w),
            })
            .filter(|w| w.status != SidecarStatus::Healthy);
        match worst {
            None => SupervisionState::Healthy,
            Some(w) => match w.status {
                SidecarStatus::Down => SupervisionState::Down { sidecar: w.service },
                _ => SupervisionState::Degraded { sidecar: w.service },
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn armed_fleet() -> SupervisionMonitor {
        let monitor = SupervisionMonitor::new(vec![
            (SidecarService::Daemon, "codm-daemon".to_owned()),
            (SidecarService::Gateway, "codm-gateway".to_owned()),
        ]);
        monitor.arm();
        monitor
    }

    /// AC-1 + Story 4 + FALSEADOR AC-9a. Turn the hysteresis off (declare on the 1st failure) and
    /// this goes red on the very first assertion.
    #[test]
    fn one_failed_probe_changes_nothing_and_the_third_declares_down() {
        let monitor = armed_fleet();

        assert_eq!(
            monitor.note_probe(SidecarService::Gateway, ProbeOutcome::Unreachable),
            None,
            "1 falha isolada e lock de sqlite/pausa de gc — nao pode virar alarme"
        );
        assert_eq!(monitor.state(), SupervisionState::Healthy);

        assert_eq!(
            monitor.note_probe(SidecarService::Gateway, ProbeOutcome::Unreachable),
            None,
            "2 falhas ainda estao dentro da histerese"
        );
        assert_eq!(monitor.state(), SupervisionState::Healthy);

        assert_eq!(
            monitor.note_probe(SidecarService::Gateway, ProbeOutcome::Unreachable),
            Some(SupervisionState::Down {
                sidecar: SidecarService::Gateway
            }),
            "a {FAILURE_THRESHOLD}a falha consecutiva declara o sidecar caido"
        );
    }

    /// The threshold counts CONSECUTIVE failures — an error budget would have declared this fleet
    /// down after the fourth miss. A recovery in the middle resets it.
    #[test]
    fn a_streak_broken_by_one_healthy_probe_never_declares_down() {
        let monitor = armed_fleet();

        for _ in 0..2 {
            assert_eq!(monitor.note_probe(SidecarService::Gateway, ProbeOutcome::Unreachable), None);
        }
        assert_eq!(monitor.note_probe(SidecarService::Gateway, ProbeOutcome::Healthy), None);
        for _ in 0..2 {
            assert_eq!(monitor.note_probe(SidecarService::Gateway, ProbeOutcome::Unreachable), None);
        }

        assert_eq!(
            monitor.state(),
            SupervisionState::Healthy,
            "4 falhas no total, nunca 3 seguidas — a histerese conta consecutivas"
        );
    }

    /// AC-1 (recuperacao) — the operator restarted the process; the state must come back on its own.
    #[test]
    fn recovery_returns_the_fleet_to_healthy() {
        let monitor = armed_fleet();
        for _ in 0..FAILURE_THRESHOLD {
            monitor.note_probe(SidecarService::Gateway, ProbeOutcome::Unreachable);
        }
        assert_eq!(
            monitor.state(),
            SupervisionState::Down {
                sidecar: SidecarService::Gateway
            }
        );

        assert_eq!(
            monitor.note_probe(SidecarService::Gateway, ProbeOutcome::Healthy),
            Some(SupervisionState::Healthy),
            "voltar a responder devolve o estado sozinho — sem intervencao, sem respawn"
        );
    }

    /// AC-3 + FALSEADOR AC-9b. Collapse `Unhealthy`/`Unreachable` into one branch and this goes red:
    /// a 503 would start declaring `Down`, which is a restart prompt for a process that is alive and
    /// most likely fixing itself.
    #[test]
    fn a_503_degrades_and_never_declares_down() {
        let monitor = armed_fleet();

        for _ in 0..(FAILURE_THRESHOLD * 4) {
            monitor.note_probe(SidecarService::Daemon, ProbeOutcome::Unhealthy(503));
        }

        assert_eq!(
            monitor.state(),
            SupervisionState::Degraded {
                sidecar: SidecarService::Daemon
            },
            "503 e o nosso health dizendo que um gate interno reprovou COM o processo vivo"
        );
    }

    /// The other half of AC-3, in the same fleet: the two signals must not contaminate each other.
    #[test]
    fn refusal_declares_down_while_a_503_only_degrades() {
        let monitor = armed_fleet();

        for _ in 0..FAILURE_THRESHOLD {
            monitor.note_probe(SidecarService::Daemon, ProbeOutcome::Unhealthy(503));
            monitor.note_probe(SidecarService::Gateway, ProbeOutcome::Unreachable);
        }

        assert_eq!(
            monitor.state(),
            SupervisionState::Down {
                sidecar: SidecarService::Gateway
            },
            "o pior sidecar decide: recusa (morto) fala mais alto que 503 (vivo e reprovado)"
        );
    }

    /// AC-2 — the exit signal does not wait for the probe cadence. Zero probes fed here.
    #[test]
    fn a_child_exit_declares_down_without_a_single_probe() {
        let monitor = armed_fleet();

        assert_eq!(
            monitor.note_exit(SidecarService::Daemon),
            Some(SupervisionState::Down {
                sidecar: SidecarService::Daemon
            }),
            "a saida do filho e instantanea e definitiva — nao espera os {FAILURE_THRESHOLD} ciclos"
        );
    }

    /// The 30/07 incident, as a test: with no auto-respawn a process we saw exit cannot answer
    /// again — a healthy probe on its port is an ORPHAN holding the port, never a recovery.
    #[test]
    fn a_healthy_probe_never_resurrects_a_sidecar_that_exited() {
        let monitor = armed_fleet();
        monitor.note_exit(SidecarService::Daemon);

        assert_eq!(
            monitor.note_probe(SidecarService::Daemon, ProbeOutcome::Healthy),
            None
        );
        assert_eq!(
            monitor.state(),
            SupervisionState::Down {
                sidecar: SidecarService::Daemon
            },
            "quem responde na porta de um filho morto e processo de outra sessao"
        );
    }

    /// Supervision must not decide anything while the boot gate still owns the windows.
    #[test]
    fn nothing_is_declared_before_the_gate_hands_over() {
        let monitor = SupervisionMonitor::new(vec![(SidecarService::Daemon, "codm-daemon".to_owned())]);

        assert_eq!(monitor.note_exit(SidecarService::Daemon), None);
        for _ in 0..(FAILURE_THRESHOLD * 2) {
            assert_eq!(monitor.note_probe(SidecarService::Daemon, ProbeOutcome::Unreachable), None);
        }
        assert_eq!(
            monitor.state(),
            SupervisionState::Healthy,
            "antes do Reveal::Main quem decide qual janela abre e o ReadinessGate, sozinho"
        );
    }

    /// Each sidecar counts its OWN misses. A single fleet-wide counter would have declared down
    /// here (4 failures against a threshold of 3) while both processes were merely hiccuping once.
    #[test]
    fn failures_are_counted_per_sidecar() {
        let monitor = armed_fleet();

        for _ in 0..2 {
            assert_eq!(monitor.note_probe(SidecarService::Daemon, ProbeOutcome::Unreachable), None);
            assert_eq!(monitor.note_probe(SidecarService::Gateway, ProbeOutcome::Unreachable), None);
        }

        assert_eq!(
            monitor.state(),
            SupervisionState::Healthy,
            "2 falhas em cada um nao somam {FAILURE_THRESHOLD} em ninguem"
        );
    }
}
