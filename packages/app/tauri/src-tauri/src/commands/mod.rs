//! Custom `#[tauri::command]` surface + the single `tauri_specta::Builder`.
//!
//! Every custom command lives in a submodule here and is re-exported so
//! `collect_commands!` can name it. The builder is consumed twice: once by
//! `run()` (in `lib.rs`) to register the invoke handler, and once by the export
//! test to emit `../commands/bindings.ts`. Keeping one constructor guarantees the
//! running handler and the committed bindings never drift.

mod secrets;
pub use secrets::*;

/// The single `tauri_specta::Builder` collecting every `#[specta::specta]`
/// custom command. See the module docs for why there is exactly one.
pub fn specta_builder() -> tauri_specta::Builder {
    tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
        secret_get,
        secret_set,
        secret_delete
    ])
}

// ── typed bindings export ─────────────────────────────────────────────────────────
//
// `cargo test` writes the specta-generated TS bindings to
// `packages/app/tauri/commands/bindings.ts` (committed, drift-checkable). The
// react `TauriSecretsService` imports `commands.secretGet(key)` from
// `@codedm/app-tauri/commands` — name + args + return type are the Rust
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
