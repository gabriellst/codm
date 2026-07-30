//! `rust-codegen` — generate a Rust client module from one preprocessed OpenAPI spec.
//!
//! Usage:
//!   cargo run --manifest-path .../codegen/Cargo.toml --bin rust-codegen -- <spec> <output> [replacements.json]
//!
//! Invoked once per discovered api service by `packages/client/generators/rust/index.ts`.
//! The generator script handles workspace-wide discovery, preprocessing (via
//! `packages/client/lib/preprocess.ts`), and lib.rs regeneration. This binary only
//! drives progenitor for a single preprocessed 3.0.x spec.
//!
//! `replacements.json` (optional third arg) carries the ENUM DEDUP contract (rust-wire
//! spec §F4): `{ "enums": { "VideoStatus": "codedm_contracts_rust::wire::enums::VideoStatus" } }`.
//! Every schema component whose name appears there is NOT regenerated — progenitor
//! references the contracts crate's type instead, so the client and the wire binding
//! share ONE definition per contract enum (the generated enums derive strum Display +
//! EnumString, which is what the declared impls promise).
//!
//! On empty/missing/unparseable specs the output file is a small Client stub so
//! consumers can still `pub mod <service>;` it.

use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::panic;
use std::path::PathBuf;
use std::process::ExitCode;

use progenitor::{GenerationSettings, Generator, InterfaceStyle, TypeImpl};
use serde_json::Value;

#[derive(serde::Deserialize, Default)]
struct Replacements {
    #[serde(default)]
    enums: BTreeMap<String, String>,
}

fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();
    if args.len() != 3 && args.len() != 4 {
        eprintln!("usage: rust-codegen <spec-path> <output-path> [replacements.json]");
        return ExitCode::from(2);
    }
    let spec_path = PathBuf::from(&args[1]);
    let out_path = PathBuf::from(&args[2]);
    let replacements: Replacements = match args.get(3) {
        Some(p) => match fs::read_to_string(p).map_err(|e| e.to_string()).and_then(|s| serde_json::from_str(&s).map_err(|e| e.to_string())) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("rust-codegen: cannot read replacements {p} — {e}");
                return ExitCode::from(2);
            }
        },
        None => Replacements::default(),
    };

    let spec_str = match fs::read_to_string(&spec_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("rust-codegen: cannot read {} — {}; emitting stub", spec_path.display(), e);
            write_stub(&out_path);
            return ExitCode::SUCCESS;
        }
    };

    let raw: Value = match serde_json::from_str(&spec_str) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("rust-codegen: cannot parse {} — {}; emitting stub", spec_path.display(), e);
            write_stub(&out_path);
            return ExitCode::SUCCESS;
        }
    };

    // Zero-paths spec → stub. Consumers can still depend on the module.
    let has_paths = raw
        .get("paths")
        .and_then(Value::as_object)
        .map(|p| !p.is_empty())
        .unwrap_or(false);
    if !has_paths {
        eprintln!("rust-codegen: {} has zero paths; emitting stub", spec_path.display());
        write_stub(&out_path);
        return ExitCode::SUCCESS;
    }

    // Only replace enums the spec actually declares as components — replacing a name the
    // spec never references is harmless, but restricting keeps the mapping honest.
    let component_names: Vec<String> = raw
        .get("components")
        .and_then(|c| c.get("schemas"))
        .and_then(Value::as_object)
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default();

    let spec: openapiv3::OpenAPI = match serde_json::from_value(raw) {
        Ok(s) => s,
        Err(e) => {
            eprintln!(
                "rust-codegen: openapi 3.0 deserialize failed for {} — {}; emitting stub",
                spec_path.display(),
                e
            );
            write_stub(&out_path);
            return ExitCode::SUCCESS;
        }
    };

    // Wrap progenitor in catch_unwind: progenitor 0.10 panics for certain spec shapes.
    // Any panic is a soft failure → stub, so the crate still compiles.
    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
        let mut settings = GenerationSettings::default();
        settings.with_interface(InterfaceStyle::Positional);
        for (name, replacement) in &replacements.enums {
            if component_names.iter().any(|c| c == name) {
                settings.with_replacement(
                    name,
                    replacement,
                    [TypeImpl::Display, TypeImpl::FromStr].into_iter(),
                );
            }
        }
        let mut generator = Generator::new(&settings);
        generator.generate_tokens(&spec)
    }));

    let token_result = match result {
        Ok(r) => r,
        Err(_panic) => {
            eprintln!(
                "rust-codegen: progenitor panicked for {} (unsupported spec shape); emitting stub",
                spec_path.display()
            );
            write_stub(&out_path);
            return ExitCode::SUCCESS;
        }
    };

    let tokens = match token_result {
        Ok(t) => t,
        Err(e) => {
            eprintln!(
                "rust-codegen: progenitor failed for {} — {:?}; emitting stub",
                spec_path.display(),
                e
            );
            write_stub(&out_path);
            return ExitCode::SUCCESS;
        }
    };

    let ast = match syn::parse2::<syn::File>(tokens) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("rust-codegen: progenitor produced invalid Rust — {}; emitting stub", e);
            write_stub(&out_path);
            return ExitCode::SUCCESS;
        }
    };
    let formatted = prettyplease::unparse(&ast);

    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).expect("create output parent");
    }
    fs::write(&out_path, formatted).expect("write codegen output");
    eprintln!("rust-codegen: wrote {}", out_path.display());
    ExitCode::SUCCESS
}

fn write_stub(out_path: &PathBuf) {
    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).expect("create output parent");
    }
    let stub = r#"//! Stub client — this backend has no HTTP endpoints, its spec was unavailable,
//! or progenitor encountered an unsupported spec shape.
//!
//! Re-run `bun generators/rust/index.ts` after the service emits a compatible
//! OpenAPI spec to replace this with a real progenitor-generated module.

pub struct Client;

impl Client {
    pub fn new_with_client(_baseurl: &str, _client: ::reqwest::Client) -> Self {
        Self
    }
}
"#;
    fs::write(out_path, stub).expect("write stub");
}
