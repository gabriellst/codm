//! THE READINESS GATE, as a PURE state machine.
//!
//! The rule that matters is not "count how many came up", it is "whoever arrives LAST decides WHICH
//! window opens" — and before this that decision lived inside an async task holding an `AppHandle`,
//! where no test could interrogate it. Here it is a function with an inspectable return, and the
//! fail-open that existed (`note_ready` called from the give-up branch too, revealing the broken
//! dashboard) becomes impossible to reintroduce without leaving a test red.

use std::collections::VecDeque;
use std::sync::Mutex;

use super::remedy::{remedy_for, Remedy};

/// How many output lines per sidecar are RETAINED in memory, per process. The TAIL, not the head:
/// the panic is at the end.
pub const OUTPUT_TAIL_LINES: usize = 50;

/// How many of those the splash actually RENDERS. Smaller than what we retain on purpose: the point
/// is that the operator READS the cause, and the failing line is always among the last few, while
/// the full run is on disk one line below it (`SidecarFailure::log_path`). Dumping the whole buffer
/// buries the one sentence that matters.
pub const SPLASH_TAIL_LINES: usize = 30;

/// What a sidecar that never came up leaves for the operator to read.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SidecarFailure {
    pub name: String,
    /// Why we gave up: the spawn failed, or no healthy answer within the budget.
    pub reason: String,
    /// The retained tail of the process's captured output — stdout AND stderr, in the order they
    /// arrived. Both, since 2026-08-27: a sidecar that HANGS (the incident's first domino) never
    /// writes to stderr at all, so the only trace of how far it got is what it printed normally.
    pub output: Vec<String>,
    /// Where the FULL run was persisted (`sidecar_log::SidecarLog`), so the splash can tell the
    /// operator where to look instead of only showing the [`SPLASH_TAIL_LINES`] tail above. `None`
    /// when no process ever ran (port conflict, spawn setup failure) — there is nothing on disk to
    /// point to — or when the write itself was best-effort-skipped.
    pub log_path: Option<String>,
    /// The action the splash can OFFER for this failure, when the output names an error this shell
    /// knows how to undo (`super::remedy`). `None` = the operator gets the cause and the log path,
    /// and no button — which is the honest answer for a cause we cannot act on.
    pub remedy: Option<Remedy>,
}

/// PUSH half of the boot verdict, for the splash. The PULL half (`commands::boot_failures`) is NOT
/// enough on its own, and that is the whole 2026-08-27 blank-screen bug: the `boot-error` window is
/// DECLARED in tauri.conf.json, so its webview exists — and its page runs — from the very first
/// instant of the process, while the first failure only lands up to 60 seconds later. The page
/// asked once, got an empty list, and never asked again; the operator read a heading and nothing
/// else. So: the page still pulls on load (covers a reload, and a window revealed after the fact)
/// AND listens for this, which is what carries the verdict to a page that was already up.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type, tauri_specta::Event)]
pub struct BootFailed {
    pub failures: Vec<SidecarFailure>,
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

    /// Retain the tail of one sidecar's output. Called from the output reader ALWAYS — including for
    /// processes that end up healthy (the cost is 50 lines, and the alternative is having nothing to
    /// show at the moment it matters).
    pub fn record_output(&self, name: &str, line: &str) {
        let mut state = self.state.lock().expect("gate mutex");
        let entry = match state.stderr.iter().position(|(n, _)| n == name) {
            Some(index) => &mut state.stderr[index],
            None => {
                state.stderr.push((name.to_owned(), VecDeque::new()));
                state.stderr.last_mut().expect("just pushed")
            }
        };
        if entry.1.len() == OUTPUT_TAIL_LINES {
            entry.1.pop_front();
        }
        entry.1.push_back(line.to_owned());
    }

    pub fn note_ready(&self, _name: &str) -> Option<Reveal> {
        self.arrive(None)
    }

    /// `log_path` is the persisted stderr file for this sidecar's run (`sidecar_log::SidecarLog`),
    /// or `None` when no process ever ran (port conflict, spawn setup failure) — see
    /// `SidecarFailure::log_path`.
    pub fn note_failed(&self, name: &str, reason: &str, log_path: Option<&str>) -> Option<Reveal> {
        self.arrive(Some(self.build_failure(name, reason, log_path)))
    }

    /// A sidecar died AFTER the boot finished. Records the failure and hands back the SAME
    /// `Reveal::BootError` the give-up path returns — deliberately, so a runtime death reuses the
    /// splash instead of growing a second one: same window, same stderr tail, same retry button, and
    /// the same `boot_failures` PULL feeding it.
    ///
    /// It does NOT touch `arrived`: the boot already reached `total` and its verdict is history.
    /// This answers a different question ("what is broken NOW?") in the same vocabulary.
    pub fn note_runtime_failure(&self, name: &str, reason: &str, log_path: Option<&str>) -> Reveal {
        let failure = self.build_failure(name, reason, log_path);
        let mut state = self.state.lock().expect("gate mutex");
        state.failures.push(failure);
        Reveal::BootError(state.failures.clone())
    }

    /// The failures accumulated so far — what the `boot_failures` command hands the splash.
    pub fn failures(&self) -> Vec<SidecarFailure> {
        self.state.lock().expect("gate mutex").failures.clone()
    }

    /// A failure record with that sidecar's retained output tail (and persisted log path) attached.
    /// Locks and releases before the caller takes the lock again — the two paths differ only in what
    /// they do with the record.
    ///
    /// The remedy is read from the SAME lines the splash will render, never from the wider retained
    /// buffer: a button whose justification scrolled off the screen is a button the operator cannot
    /// judge.
    fn build_failure(&self, name: &str, reason: &str, log_path: Option<&str>) -> SidecarFailure {
        let output = {
            let state = self.state.lock().expect("gate mutex");
            state
                .stderr
                .iter()
                .find(|(n, _)| n == name)
                .map(|(_, lines)| splash_tail(lines))
                .unwrap_or_default()
        };
        SidecarFailure {
            name: name.to_owned(),
            reason: reason.to_owned(),
            remedy: remedy_for(reason, &output),
            output,
            log_path: log_path.map(|p| p.to_owned()),
        }
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

/// PURE — the last [`SPLASH_TAIL_LINES`] lines of a retained buffer, in chronological order.
/// Isolated from the gate's locking so the cut itself is falsifiable in `cargo test`.
fn splash_tail(lines: &VecDeque<String>) -> Vec<String> {
    lines
        .iter()
        .skip(lines.len().saturating_sub(SPLASH_TAIL_LINES))
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_sidecar_ready_reveals_the_main_window_exactly_once() {
        let gate = ReadinessGate::new(2);
        assert!(
            gate.note_ready("codm-daemon").is_none(),
            "o primeiro a chegar nao revela nada"
        );
        assert!(matches!(
            gate.note_ready("codm-gateway"),
            Some(Reveal::Main)
        ));
    }

    /// FALSEADOR AC-9 — o give-up NUNCA revela a janela principal.
    #[test]
    fn a_single_failure_reveals_the_error_splash_and_never_main() {
        let gate = ReadinessGate::new(2);
        gate.record_output(
            "codm-gateway",
            "panic: dial tcp 127.0.0.1:3032: connection refused",
        );
        assert!(gate.note_ready("codm-daemon").is_none());

        let reveal = gate
            .note_failed(
                "codm-gateway",
                "no 200 within 60s",
                Some("/data/logs/codm-gateway-1.log"),
            )
            .expect("o ultimo a chegar revela");
        let failures = match reveal {
            Reveal::Main => panic!("AC-9: give-up nao pode revelar a janela principal"),
            Reveal::BootError(failures) => failures,
        };
        assert_eq!(failures.len(), 1);
        assert_eq!(failures[0].name, "codm-gateway");
        assert_eq!(failures[0].reason, "no 200 within 60s");
        assert_eq!(
            failures[0].output,
            vec!["panic: dial tcp 127.0.0.1:3032: connection refused"]
        );
        assert_eq!(
            failures[0].log_path.as_deref(),
            Some("/data/logs/codm-gateway-1.log"),
            "a splash precisa do caminho do arquivo persistido, nao so da cauda em memoria"
        );
    }

    /// Nenhum caminho termina sem revelar janela: para todo par de desfechos, o ULTIMO a chegar
    /// devolve algum Reveal.
    #[test]
    fn the_last_arrival_always_reveals_something() {
        for (a_ok, b_ok) in [(true, true), (true, false), (false, true), (false, false)] {
            let gate = ReadinessGate::new(2);
            let first = if a_ok {
                gate.note_ready("a")
            } else {
                gate.note_failed("a", "boom", None)
            };
            assert!(first.is_none());
            let last = if b_ok {
                gate.note_ready("b")
            } else {
                gate.note_failed("b", "boom", None)
            };
            assert!(
                last.is_some(),
                "combinacao ({a_ok},{b_ok}) terminou sem revelar janela nenhuma"
            );
            if !a_ok || !b_ok {
                assert!(
                    matches!(last, Some(Reveal::BootError(_))),
                    "qualquer falha manda para a splash"
                );
            }
        }
    }

    /// AC-5 — uma morte DEPOIS do boot reusa a mesma splash: mesmo stderr, mesmo `boot_failures`
    /// (o PULL que a pagina ja usa), nenhuma segunda implementacao de tela de erro.
    #[test]
    fn a_runtime_death_reuses_the_boot_error_splash() {
        let gate = ReadinessGate::new(2);
        gate.record_output("codm-daemon", "FATAL: database is locked");
        assert!(gate.note_ready("codm-daemon").is_none());
        assert!(
            matches!(gate.note_ready("codm-gateway"), Some(Reveal::Main)),
            "o boot terminou bem — a splash so entra em cena depois"
        );

        let reveal = gate.note_runtime_failure(
            "codm-daemon",
            "process exited (code Some(1))",
            Some("/data/logs/codm-daemon-2.log"),
        );
        let Reveal::BootError(failures) = reveal else {
            panic!("AC-5: daemon caido em runtime tem de revelar a splash");
        };
        assert_eq!(failures.len(), 1);
        assert_eq!(failures[0].name, "codm-daemon");
        assert_eq!(failures[0].reason, "process exited (code Some(1))");
        assert_eq!(
            failures[0].output,
            vec!["FATAL: database is locked"],
            "a cauda capturada durante a vida do processo e o que o operador le"
        );
        assert_eq!(
            failures[0].log_path.as_deref(),
            Some("/data/logs/codm-daemon-2.log"),
            "uma morte em runtime tambem precisa apontar pro arquivo persistido"
        );
        assert_eq!(
            gate.failures().len(),
            1,
            "o mesmo comando boot_failures alimenta a splash — sem canal novo"
        );
    }

    /// A cauda entregue à splash é BOUNDED e são as ÚLTIMAS linhas — a mensagem de erro está no fim
    /// de uma corrida, nunca no começo.
    #[test]
    fn the_splash_tail_is_bounded_and_holds_the_last_lines() {
        let gate = ReadinessGate::new(1);
        let printed = OUTPUT_TAIL_LINES + 10;
        for i in 0..printed {
            gate.record_output("x", &format!("line {i}"));
        }
        let Some(Reveal::BootError(failures)) = gate.note_failed("x", "spawn failed", None) else {
            panic!("esperava a splash");
        };
        assert_eq!(failures[0].output.len(), SPLASH_TAIL_LINES);
        assert_eq!(
            failures[0].output.first().unwrap(),
            &format!("line {}", printed - SPLASH_TAIL_LINES),
            "o corte tem de comecar SPLASH_TAIL_LINES antes do fim"
        );
        assert_eq!(
            failures[0].output.last().unwrap(),
            &format!("line {}", printed - 1),
            "a ultima linha impressa e a que explica"
        );
    }

    /// Menos linhas do que o corte: entrega todas, sem inventar buraco.
    #[test]
    fn a_short_run_is_delivered_whole() {
        let gate = ReadinessGate::new(1);
        gate.record_output("x", "só uma linha");
        let Some(Reveal::BootError(failures)) = gate.note_failed("x", "spawn failed", None) else {
            panic!("esperava a splash");
        };
        assert_eq!(failures[0].output, vec!["só uma linha"]);
    }

    /// INCIDENTE 2026-08-27 — o daemon que morre na hora imprime a causa E o que fazer. A falha que
    /// chega à splash tem de carregar a AÇÃO, não só o texto (o botão nasce daqui).
    #[test]
    fn a_locked_data_dir_reaches_the_splash_with_its_remedy() {
        let gate = ReadinessGate::new(1);
        gate.record_output("codm-daemon", "codm-daemon starting");
        gate.record_output(
            "codm-daemon",
            r#"❌ Failed to start api-ts: DATA_DIR_LOCKED: Another daemon is already running on this data dir "C:\Users\t\data" (pid 16580). Stop the other daemon or point this one at a different CODM_DATA_DIR."#,
        );
        let Some(Reveal::BootError(failures)) =
            gate.note_failed("codm-daemon", "no healthy response from :47330 within 60s", None)
        else {
            panic!("esperava a splash");
        };
        assert_eq!(failures[0].remedy, Some(Remedy::ReleaseDataDirLock));
    }

    /// DRIFT RAIL entre o shell e a splash. A tela é HTML puro, sem bundler: ela não importa
    /// `commands/bindings.ts`, então escuta o evento pelo NOME e despacha o remédio pelo VALOR
    /// serializado do enum. As duas strings vivem, do lado dela, como literais — este teste é o
    /// único lugar que impede uma delas de mudar de um lado só e a tela voltar a ficar em branco.
    #[test]
    fn the_splash_page_speaks_the_same_names_this_module_emits() {
        use tauri_specta::Event as _;
        let page = std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../react/public/boot-error.html"),
        )
        .expect("boot-error.html — a splash vive no public/ do console");

        assert!(
            page.contains(&format!("listen('{}'", BootFailed::NAME)),
            "a splash precisa escutar '{}' — sem isso ela so tem a lista vazia do carregamento",
            BootFailed::NAME
        );
        let remedy = serde_json::to_string(&Remedy::ReleaseDataDirLock).expect("remedy serializa");
        assert!(
            page.contains(&remedy.replace('"', "")),
            "a splash despacha pelo valor serializado do Remedy ({remedy})"
        );
        for command in ["boot_failures", "retry_boot", "release_data_dir_lock"] {
            assert!(page.contains(command), "a splash precisa chamar '{command}'");
        }
    }

    /// E o contra-exemplo: um estouro de espera sem causa nomeada não ganha botão nenhum.
    #[test]
    fn a_timeout_without_a_named_cause_offers_no_remedy() {
        let gate = ReadinessGate::new(1);
        gate.record_output("codm-daemon", "applying migrations…");
        let Some(Reveal::BootError(failures)) =
            gate.note_failed("codm-daemon", "no healthy response from :47330 within 60s", None)
        else {
            panic!("esperava a splash");
        };
        assert_eq!(failures[0].remedy, None);
        assert_eq!(
            failures[0].output,
            vec!["applying migrations…"],
            "um sidecar que travou tambem tem saida — e e ela que explica ate onde ele foi"
        );
    }
}
