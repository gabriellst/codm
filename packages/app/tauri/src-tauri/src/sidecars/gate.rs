//! THE READINESS GATE, as a PURE state machine.
//!
//! The rule that matters is not "count how many came up", it is "whoever arrives LAST decides WHICH
//! window opens" — and before this that decision lived inside an async task holding an `AppHandle`,
//! where no test could interrogate it. Here it is a function with an inspectable return, and the
//! fail-open that existed (`note_ready` called from the give-up branch too, revealing the broken
//! dashboard) becomes impossible to reintroduce without leaving a test red.

use std::collections::VecDeque;
use std::sync::Mutex;

/// How many stderr lines per sidecar the splash shows. The TAIL, not the head: the panic is at the end.
pub const STDERR_TAIL_LINES: usize = 50;

/// What a sidecar that never came up leaves for the operator to read.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SidecarFailure {
    pub name: String,
    /// Why we gave up: the spawn failed, or no healthy answer within the budget.
    pub reason: String,
    /// The retained tail of captured stderr, in chronological order.
    pub stderr: Vec<String>,
}

/// Which window to reveal. Returned ONLY to whoever arrives last — everyone before gets `None`.
#[derive(Debug)]
pub enum Reveal {
    Main,
    BootError(Vec<SidecarFailure>),
}

struct State {
    arrived: usize,
    failures: Vec<SidecarFailure>,
    stderr: Vec<(String, VecDeque<String>)>,
}

pub struct ReadinessGate {
    total: usize,
    state: Mutex<State>,
}

impl ReadinessGate {
    pub fn new(total: usize) -> Self {
        Self {
            total,
            state: Mutex::new(State {
                arrived: 0,
                failures: Vec::new(),
                stderr: Vec::new(),
            }),
        }
    }

    /// Retain the tail of one sidecar's stderr. Called from the stderr reader ALWAYS — including for
    /// processes that end up healthy (the cost is 50 lines, and the alternative is having nothing to
    /// show at the moment it matters).
    pub fn record_stderr(&self, name: &str, line: &str) {
        let mut state = self.state.lock().expect("gate mutex");
        let entry = match state.stderr.iter().position(|(n, _)| n == name) {
            Some(index) => &mut state.stderr[index],
            None => {
                state.stderr.push((name.to_owned(), VecDeque::new()));
                state.stderr.last_mut().expect("just pushed")
            }
        };
        if entry.1.len() == STDERR_TAIL_LINES {
            entry.1.pop_front();
        }
        entry.1.push_back(line.to_owned());
    }

    pub fn note_ready(&self, _name: &str) -> Option<Reveal> {
        self.arrive(None)
    }

    pub fn note_failed(&self, name: &str, reason: &str) -> Option<Reveal> {
        let stderr = {
            let state = self.state.lock().expect("gate mutex");
            state
                .stderr
                .iter()
                .find(|(n, _)| n == name)
                .map(|(_, lines)| lines.iter().cloned().collect())
                .unwrap_or_default()
        };
        self.arrive(Some(SidecarFailure {
            name: name.to_owned(),
            reason: reason.to_owned(),
            stderr,
        }))
    }

    /// The failures accumulated so far — what the `boot_failures` command hands the splash.
    pub fn failures(&self) -> Vec<SidecarFailure> {
        self.state.lock().expect("gate mutex").failures.clone()
    }

    fn arrive(&self, failure: Option<SidecarFailure>) -> Option<Reveal> {
        let mut state = self.state.lock().expect("gate mutex");
        state.arrived += 1;
        if let Some(failure) = failure {
            state.failures.push(failure);
        }
        if state.arrived < self.total {
            return None;
        }
        // WHOEVER ARRIVES LAST DECIDES, and the decision is binary: a single failure sends everyone
        // to the splash. Revealing the main window "because most of them came up" is the fail-open
        // this front exists to kill — a partially alive app is the one the operator cannot diagnose.
        if state.failures.is_empty() {
            Some(Reveal::Main)
        } else {
            Some(Reveal::BootError(state.failures.clone()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_sidecar_ready_reveals_the_main_window_exactly_once() {
        let gate = ReadinessGate::new(2);
        assert!(gate.note_ready("codm-daemon").is_none(), "o primeiro a chegar nao revela nada");
        assert!(matches!(gate.note_ready("codm-gateway"), Some(Reveal::Main)));
    }

    /// FALSEADOR AC-9 — o give-up NUNCA revela a janela principal.
    #[test]
    fn a_single_failure_reveals_the_error_splash_and_never_main() {
        let gate = ReadinessGate::new(2);
        gate.record_stderr("codm-gateway", "panic: dial tcp 127.0.0.1:3032: connection refused");
        assert!(gate.note_ready("codm-daemon").is_none());

        let reveal = gate
            .note_failed("codm-gateway", "no 200 within 60s")
            .expect("o ultimo a chegar revela");
        let failures = match reveal {
            Reveal::Main => panic!("AC-9: give-up nao pode revelar a janela principal"),
            Reveal::BootError(failures) => failures,
        };
        assert_eq!(failures.len(), 1);
        assert_eq!(failures[0].name, "codm-gateway");
        assert_eq!(failures[0].reason, "no 200 within 60s");
        assert_eq!(
            failures[0].stderr,
            vec!["panic: dial tcp 127.0.0.1:3032: connection refused"]
        );
    }

    /// Nenhum caminho termina sem revelar janela: para todo par de desfechos, o ULTIMO a chegar
    /// devolve algum Reveal.
    #[test]
    fn the_last_arrival_always_reveals_something() {
        for (a_ok, b_ok) in [(true, true), (true, false), (false, true), (false, false)] {
            let gate = ReadinessGate::new(2);
            let first = if a_ok { gate.note_ready("a") } else { gate.note_failed("a", "boom") };
            assert!(first.is_none());
            let last = if b_ok { gate.note_ready("b") } else { gate.note_failed("b", "boom") };
            assert!(last.is_some(), "combinacao ({a_ok},{b_ok}) terminou sem revelar janela nenhuma");
            if !a_ok || !b_ok {
                assert!(
                    matches!(last, Some(Reveal::BootError(_))),
                    "qualquer falha manda para a splash"
                );
            }
        }
    }

    #[test]
    fn stderr_is_retained_bounded_and_tail_first() {
        let gate = ReadinessGate::new(1);
        for i in 0..(STDERR_TAIL_LINES + 10) {
            gate.record_stderr("x", &format!("line {i}"));
        }
        let Some(Reveal::BootError(failures)) = gate.note_failed("x", "spawn failed") else {
            panic!("esperava a splash");
        };
        assert_eq!(failures[0].stderr.len(), STDERR_TAIL_LINES);
        assert_eq!(
            failures[0].stderr.last().unwrap(),
            &format!("line {}", STDERR_TAIL_LINES + 9)
        );
    }
}
