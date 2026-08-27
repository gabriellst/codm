//! WHAT THE OPERATOR CAN DO ABOUT IT — a failure's cause turned into an OFFER, not prose.
//!
//! Incident (Windows, testador, 2026-08-27). The daemon hung on its very first boot and the shell
//! gave up after 60s. The hung process stayed ALIVE holding the data dir's lockfile, so EVERY later
//! opening of the app died instantly with a message that already said exactly what to do:
//!
//! ```text
//! ❌ Failed to start api-ts: DATA_DIR_LOCKED: Another daemon is already running on this data dir
//! "C:\Users\…\data" (pid 16580). Stop the other daemon or point this one at a different CODM_DATA_DIR.
//! ```
//!
//! The operator waited HOURS in front of a splash that said "one or more services did not answer",
//! because reading the cause was one thing and being able to act on it was another. This module is
//! the second half: a failure whose captured output NAMES an error we know how to undo carries a
//! [`Remedy`], and the splash renders a button for it (`commands::release_data_dir_lock`).
//!
//! ## Why the detection is a NAMED ERROR and not a substring
//!
//! `ApiErrors` is the generated contract enum (`codm-client-rust`, from the daemon's own OpenAPI):
//! the same closed vocabulary the daemon throws with. A line is scanned for a token that PARSES as
//! one of those codes — so a prose sentence that merely mentions a locked data dir is not a match,
//! and a rename of the code upstream breaks this file's `ApiErrors::DataDirLocked` arm at COMPILE
//! time instead of silently disabling the button.
//!
//! The other half of the seam lives in `packages/api/typescript/src/bootError.ts`: a `BaseError`
//! reaching the daemon's top-level boot handler is printed as `<CODE>: <message>` — one line, code
//! first, never a stack trace. Keep the two in step; they are a pair.

use std::str::FromStr;

use codm_client_rust::typescript::types::ApiErrors;

/// An action the boot-error splash can offer for a failure it understands.
///
/// Deliberately a CLOSED enum crossing to the webview (specta), not a free-form string: the page
/// dispatches on the variant and does no parsing of its own — the shell decides what is actionable,
/// the splash only renders it. Adding a remedy = a variant here, an arm in [`remedy_of`], a command
/// that performs it, and a branch in `boot-error.html`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum Remedy {
    /// Another process of ours is still holding the data dir's lockfile. Undone by sweeping the
    /// leftover sidecar processes of a previous run and booting again.
    ReleaseDataDirLock,
}

/// The remedy a failure earns, if any — read from the reason the shell wrote plus the tail of the
/// process's own captured output (the SAME tail the splash renders, so a button never appears
/// without its cause visible right above it).
pub fn remedy_for(reason: &str, output: &[String]) -> Option<Remedy> {
    std::iter::once(reason)
        .chain(output.iter().map(String::as_str))
        .flat_map(named_errors_in)
        .find_map(remedy_of)
}

/// The one place that says which named errors this shell knows how to undo. Every other code is
/// legitimately unactionable from here — the operator still gets the cause and the log path.
fn remedy_of(error: ApiErrors) -> Option<Remedy> {
    match error {
        ApiErrors::DataDirLocked => Some(Remedy::ReleaseDataDirLock),
        _ => None,
    }
}

/// Every contract error code NAMED in one line of output.
///
/// Split on `:` because that is the shape both writers use — the daemon's boot handler prints
/// `❌ Failed to start api-ts: DATA_DIR_LOCKED: Another daemon…`, and a `BaseError`'s own
/// `name: message` rendering is the same. A Windows path inside the message (`"C:\Users\…"`) splits
/// too, harmlessly: a fragment only counts when it parses as a whole code, so `C` and `\Users\…`
/// are simply not errors.
fn named_errors_in(line: &str) -> Vec<ApiErrors> {
    line.split(':')
        .filter_map(|fragment| ApiErrors::from_str(fragment.trim()).ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A LINHA REAL do incidente (Windows, 2026-08-27), verbatim: é dela que o botão tem de nascer.
    #[test]
    fn the_incident_line_earns_the_lock_release_remedy() {
        let line = r#"❌ Failed to start api-ts: DATA_DIR_LOCKED: Another daemon is already running on this data dir "C:\Users\test\AppData\Roaming\app.codm.desktop\data" (pid 16580). Stop the other daemon or point this one at a different CODM_DATA_DIR."#;
        assert_eq!(
            remedy_for("no healthy response from :47330 within 60s", &[line.to_owned()]),
            Some(Remedy::ReleaseDataDirLock),
            "o caminho do Windows tem dois-pontos e nao pode atrapalhar a leitura do codigo"
        );
    }

    /// FALSEADOR — o gatilho é o CÓDIGO NOMEADO, nunca a prosa que fala do mesmo assunto. Uma
    /// mensagem em inglês corrente sobre um data dir travado não pode ligar um botão que MATA
    /// processo.
    #[test]
    fn prose_about_a_locked_data_dir_earns_nothing() {
        let lines = [
            "another daemon is already running on this data dir".to_owned(),
            "data_dir_locked".to_owned(),
            "DATA_DIR_LOCKED_SOMETHING_ELSE: nope".to_owned(),
            "the data dir is locked".to_owned(),
        ];
        assert_eq!(remedy_for("no healthy response from :47330 within 60s", &lines), None);
    }

    /// Um erro NOMEADO que este shell não sabe desfazer continua sem botão — a tela mostra a causa,
    /// e só isso.
    #[test]
    fn a_named_error_without_a_remedy_offers_no_button() {
        let lines = ["❌ Failed to start api-ts: MIGRATIONS_PENDING: run the migrations first".to_owned()];
        assert_eq!(remedy_for("spawn failed: no such file", &lines), None);
    }

    /// As duas outras falhas que esta splash já mostrava — conflito de porta e estouro de espera —
    /// não ganham botão nenhum: matar processo não é a resposta para nenhuma delas.
    #[test]
    fn port_and_timeout_failures_stay_without_a_remedy() {
        assert_eq!(
            remedy_for(
                "every candidate port is already taken by another process: 47330, 47331 — refusing to boot onto a port this shell does not own",
                &[],
            ),
            None
        );
        assert_eq!(remedy_for("no healthy response from :47330 within 60s", &[]), None);
    }

    /// A razão que o SHELL escreveu conta tanto quanto o que o processo imprimiu — as duas fontes
    /// entram na mesma varredura.
    #[test]
    fn the_reason_written_by_the_shell_is_scanned_too() {
        assert_eq!(
            remedy_for("DATA_DIR_LOCKED: another daemon holds it", &[]),
            Some(Remedy::ReleaseDataDirLock)
        );
    }
}
