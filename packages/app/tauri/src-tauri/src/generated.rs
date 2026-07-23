// GENERATED from template.config.ts REPO.desktop by scripts/desktop/generate.ts — do NOT hand-edit.
// Regenerate: `bun desktop:generate` · drift gate: `bun desktop:generate --check` (test:tooling).
// include!-ed by lib.rs AFTER the `Sidecar` struct definition.

/// Bundle identifier — also the keychain service name (REPO.desktop.identifier).
pub const IDENTIFIER: &str = "app.codedm.desktop";

/// Supervised sidecars — one entry per REPO.desktop.sidecars[]. Ports/env resolve from
/// REPO.env examples at generation time; `data_dir` is the runtime app-data subdir the
/// shell computes (the only boot-env value that cannot be a generation-time literal).
pub fn sidecars(data_dir: &str) -> Vec<Sidecar> {
    vec![
        Sidecar {
            name: "codedm-daemon",
            port: 3030,
            health_path: "/v1/session",
            env: vec![
                ("API_PORT".into(), "3030".into()),
                ("CODEDM_DATA_DIR".into(), data_dir.into()),
                ("API_GO_URL".into(), "http://localhost:3032".into()),
                ("NODE_ENV".into(), "production".into()),
            ],
        },
        Sidecar {
            name: "codedm-gateway",
            port: 3032,
            health_path: "/api/openapi.json",
            env: vec![
                ("CHANNEL_PORT".into(), "3032".into()),
                ("CODEDM_DATA_DIR".into(), data_dir.into()),
                ("CHANNEL_ALLOWED_ORIGINS".into(), "tauri://localhost,http://localhost:5173".into()),
            ],
        },
    ]
}
