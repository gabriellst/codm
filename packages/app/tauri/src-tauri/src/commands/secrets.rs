//! Keychain-backed `secret_*` commands — the custom native surface the react
//! console's `TauriSecretsService` invokes (via `@codedm/app-tauri/commands`).
//!
//! Each command is `#[specta::specta]` in addition to `#[tauri::command]` so its
//! name, args, and Result type are collected into the `tauri_specta::Builder`
//! (see `super::specta_builder()`), which exports the TS bindings the react
//! `TauriSecretsService` imports. One source of truth: the Rust signature.
//!
//! The keychain SERVICE name is the app's bundle identifier — read at runtime from
//! `app.config().identifier` (Tauri exposes the resolved bundle id via the `AppHandle`),
//! so there is no generated `IDENTIFIER` const to keep in sync. `AppHandle` is a Tauri
//! special argument: tauri-specta omits it from the exported TS bindings, so the react
//! `TauriSecretsService` signature (`secretGet(key)`, …) is unchanged.

/// The keychain service name = the app's bundle identifier (`tauri.conf.json` `identifier`).
fn service(app: &tauri::AppHandle) -> String {
    app.config().identifier.clone()
}

#[tauri::command]
#[specta::specta]
pub fn secret_get(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(&service(&app), &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
#[specta::specta]
pub fn secret_set(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(&service(&app), &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn secret_delete(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(&service(&app), &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
