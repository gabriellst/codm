//! Keychain-backed `secret_*` commands — the custom native surface the react
//! console's `TauriSecretsService` invokes (via `@codedm/app-tauri/commands`).
//!
//! Each command is `#[specta::specta]` in addition to `#[tauri::command]` so its
//! name, args, and Result type are collected into the `tauri_specta::Builder`
//! (see `super::specta_builder()`), which exports the TS bindings the react
//! `TauriSecretsService` imports. One source of truth: the Rust signature.
//!
//! `crate::IDENTIFIER` (bundle id = keychain service name) is re-exported at the
//! crate root by `lib.rs` from `sidecars::generated`.

#[tauri::command]
#[specta::specta]
pub fn secret_get(key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(crate::IDENTIFIER, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
#[specta::specta]
pub fn secret_set(key: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(crate::IDENTIFIER, &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn secret_delete(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(crate::IDENTIFIER, &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
