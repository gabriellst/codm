//! Custom `#[tauri::command]` surface + the single `tauri_specta::Builder`.
//!
//! Every custom command lives in a submodule here and is re-exported so
//! `collect_commands!` can name it. The builder is consumed twice: once by
//! `run()` (in `lib.rs`) to register the invoke handler, and once by the export
//! test to emit `../commands/bindings.ts`. Keeping one constructor guarantees the
//! running handler and the committed bindings never drift.

mod boot;
pub use boot::*;

mod host_info;
pub use host_info::*;

mod system_preconditions;
pub use system_preconditions::*;

mod secrets;
pub use secrets::*;

mod supervision;
pub use supervision::*;

mod update;
pub use update::*;

mod window;
pub use window::*;

/// The single `tauri_specta::Builder` collecting every `#[specta::specta]`
/// custom command AND every typed event. See the module docs for why there is exactly one.
///
/// Events ride the same builder as commands so the console's PUSH channel is generated from the
/// Rust type too — `events.supervisionChanged.listen(...)`, with the payload shape coming from
/// `SupervisionState` itself. `Builder::mount_events` (called in `run()`'s setup) is what makes the
/// registry available at runtime; without it the first `emit` panics, loudly, at boot.
pub fn specta_builder() -> tauri_specta::Builder {
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            secret_get,
            secret_set,
            secret_delete,
            boot_failures,
            retry_boot,
            release_data_dir_lock,
            host_ports,
            supervision_state,
            pending_update,
            restart_for_update,
            system_precondition_statuses,
            repair_system_precondition,
            window_chrome
        ])
        .events(tauri_specta::collect_events![
            crate::sidecars::BootFailed,
            crate::sidecars::SupervisionChanged,
            crate::updater::UpdateReady
        ])
}

// ── typed bindings export ─────────────────────────────────────────────────────────
//
// `cargo test` writes the specta-generated TS bindings to
// `packages/app/tauri/commands/bindings.ts` (committed, drift-checkable). The
// react `TauriSecretsService` imports `commands.secretGet(key)` from
// `@codm/app-tauri/commands` — name + args + return type are the Rust
// signature, verbatim. Re-run `cargo test` after touching any `secret_*`
// command and commit the regenerated file.
#[cfg(test)]
mod export_bindings {
    use super::specta_builder;
    use specta_typescript::Typescript;

    #[test]
    fn export_typescript_bindings() {
        // ../commands/bindings.ts relative to src-tauri/ = packages/app/tauri/commands/bindings.ts
        // `@ts-nocheck` header: the specta template always emits a couple of unused helpers
        // (TAURI_CHANNEL, __makeEvents__) that trip the react console's noUnusedLocals — the file
        // is generated + drift-checked, so it opts out of type-checking rather than being edited.
        specta_builder()
            .export(
                Typescript::default().header("// @ts-nocheck"),
                concat!(env!("CARGO_MANIFEST_DIR"), "/../commands/bindings.ts"),
            )
            .expect("failed to export tauri-specta TypeScript bindings");
    }
}
