//! Pré-condições — o PULL (`precondition_statuses`) e a única ação que o operador pode tomar
//! (`repair_precondition`).
//!
//! Mesmo raciocínio de `commands/supervision.rs`: um push só alcança quem já estava montado, e
//! quem abre o app com a permissão revogada é exatamente quem precisa saber. Então o console
//! PERGUNTA — e volta a perguntar quando a janela reganha foco, que é como ele descobre que o
//! operador acabou de conceder a permissão nos Ajustes.

use crate::preconditions::{self, PreconditionId, PreconditionStatus};

#[tauri::command]
#[specta::specta]
pub fn precondition_statuses() -> Vec<PreconditionStatus> {
    preconditions::statuses()
}

/// O bundle id NÃO é literal aqui: sai de `config().identifier`, o mesmo valor de onde `lib.rs`
/// deriva o data dir. `tccutil` apagando a entrada de outro app seria uma limpeza silenciosa que
/// não conserta nada e mexe onde não devia.
#[tauri::command]
#[specta::specta]
pub fn repair_precondition(app: tauri::AppHandle, id: PreconditionId) -> Result<(), String> {
    preconditions::run_repair(id, &app.config().identifier)
}
