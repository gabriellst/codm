// GENERATED from template.config.ts REPO.desktop by scripts/desktop/generate.ts — do NOT hand-edit.
// Regenerate: `bun desktop:generate` · drift gate: `bun desktop:generate --check` (test:tooling).
// include!-ed by src/sidecars/mod.rs AFTER the `Sidecar` struct definition.

/// Bundle identifier — also the keychain service name (REPO.desktop.identifier).
pub const IDENTIFIER: &str = "app.codedm.desktop";

/// Supervised sidecars — one entry per REPO.desktop.sidecars[]. Ports/env resolve from
/// REPO.env examples at generation time; `data_dir` (app-data subdir) and `resource_dir`
/// (bundle resource dir, for staged assets: the migrations and the external module closure)
/// are the runtime paths the shell computes — the only values that cannot be literals.
pub fn sidecars(data_dir: &str, resource_dir: &std::path::Path) -> Vec<Sidecar> {
    vec![
        Sidecar {
            name: "codedm-daemon",
            port: 3030,
            health_path: "/v1/session",
            cwd: Some(resource_dir.join("daemon-runtime")),
            env: vec![
                ("API_PORT".into(), "3030".into()),
                ("CODEDM_DATA_DIR".into(), data_dir.into()),
                ("CODEDM_MIGRATIONS_DIR".into(), resource_dir.join("migrations").to_string_lossy().into_owned()),
                ("API_GO_URL".into(), "http://localhost:3032".into()),
                ("NODE_ENV".into(), "production".into()),
            ],
        },
        Sidecar {
            name: "codedm-gateway",
            port: 3032,
            health_path: "/api/openapi.json",
            cwd: None,
            env: vec![
                ("CHANNEL_PORT".into(), "3032".into()),
                ("CODEDM_DATA_DIR".into(), data_dir.into()),
                ("CHANNEL_ALLOWED_ORIGINS".into(), "tauri://localhost,http://localhost:5173".into()),
            ],
        },
    ]
}
