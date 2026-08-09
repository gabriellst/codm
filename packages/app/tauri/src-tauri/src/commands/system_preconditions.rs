//! Pré-condições — o PULL (`system_precondition_statuses`) e a única ação que o operador pode tomar
//! (`repair_system_precondition`).
//!
//! Mesmo raciocínio de `commands/supervision.rs`: um push só alcança quem já estava montado, e
//! quem abre o app com a permissão revogada é exatamente quem precisa saber. Então o console
//! PERGUNTA — e volta a perguntar quando a janela reganha foco, que é como ele descobre que o
//! operador acabou de conceder a permissão nos Ajustes.

use crate::system_preconditions::{self, SystemPreconditionId, SystemPreconditionStatus};

#[tauri::command]
#[specta::specta]
pub fn system_precondition_statuses() -> Vec<SystemPreconditionStatus> {
    system_preconditions::statuses()
}

/// O bundle id NÃO é literal aqui: sai de `config().identifier`, o mesmo valor de onde `lib.rs`
/// deriva o data dir. `tccutil` apagando a entrada de outro app seria uma limpeza silenciosa que
/// não conserta nada e mexe onde não devia.
#[tauri::command]
#[specta::specta]
pub fn repair_system_precondition(app: tauri::AppHandle, id: SystemPreconditionId) -> Result<(), String> {
    system_preconditions::run_repair(id, &app.config().identifier)
}
