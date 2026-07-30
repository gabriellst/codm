//! Architecture rail — the Rust mirror of the frontend's "nunca `fetch` direto":
//! raw `reqwest` is allowed ONLY in `src/api/mod.rs` (where the identity-carrying
//! client is built). Every other module talks to the backends through the typed
//! aggregate `api::Api` in managed state.

use std::path::Path;

fn rust_sources(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
    for entry in std::fs::read_dir(dir).expect("read src dir") {
        let path = entry.expect("dir entry").path();
        if path.is_dir() {
            rust_sources(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

#[test]
fn raw_reqwest_is_confined_to_the_api_module() {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut files = Vec::new();
    rust_sources(&src, &mut files);
    assert!(!files.is_empty(), "no sources found under src/");

    let offenders: Vec<_> = files
        .iter()
        .filter(|p| !p.ends_with("api/mod.rs"))
        .filter(|p| std::fs::read_to_string(p).expect("read source").contains("reqwest"))
        .collect();

    assert!(
        offenders.is_empty(),
        "raw reqwest outside src/api/mod.rs — use the typed api::Api state instead: {offenders:?}"
    );
}

/// HAND-ROLLED HTTP IS RAW HTTP. The rail above caught `reqwest`; the readiness probe escaped it by
/// writing `GET {path} HTTP/1.1\r\n…` into a `std::net::TcpStream` — literally the hand-assembled
/// request the rust-wire house rule bans, surviving only by predating the SDK.
#[test]
fn hand_rolled_http_is_confined_to_the_api_module() {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut files = Vec::new();
    rust_sources(&src, &mut files);
    assert!(!files.is_empty(), "no sources found under src/");

    let offenders: Vec<_> = files
        .iter()
        .filter(|p| !p.ends_with("api/mod.rs"))
        .filter(|p| {
            let body = std::fs::read_to_string(p).expect("read source");
            body.contains("TcpStream") || body.contains("HTTP/1.1")
        })
        .collect();

    assert!(
        offenders.is_empty(),
        "hand-rolled HTTP outside src/api/mod.rs — call the typed operation through api::Api: {offenders:?}"
    );
}
