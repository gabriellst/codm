//! Round-trip rail over the SHARED wire fixtures (packages/contracts/fixtures/events).
//!
//! Every fixture is the canonical transport envelope `{id, ownerId, time, name, payload}`
//! as the Go gateway publishes it. Parsing here proves the Rust binding accepts what the
//! other side emits; re-serializing and comparing as `serde_json::Value` (key-order
//! agnostic) proves nothing is lost or renamed on the way back — the failure mode that
//! shipped in the template's DSL-based binding (spec §2.1/§2.2) cannot re-enter green.
//!
//! Committed by hand (not generated): the fixture DIR is the contract; this file only
//! walks it.

use codm_contracts_rust::wire::envelope::WireEvent;

fn fixtures_dir() -> std::path::PathBuf {
    // crate root = packages/contracts/generated/rust → ../../fixtures/events
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/events")
}

fn fixture_files() -> Vec<std::path::PathBuf> {
    let mut files: Vec<_> = std::fs::read_dir(fixtures_dir())
        .expect("fixtures/events must exist — run `bun run codegen:fixtures` in packages/contracts")
        .map(|e| e.expect("dir entry").path())
        .filter(|p| p.extension().is_some_and(|e| e == "json"))
        .collect();
    files.sort();
    files
}

fn is_meta(path: &std::path::Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.starts_with('_'))
}

#[test]
fn every_event_fixture_parses_as_known_and_roundtrips() {
    let files = fixture_files();
    let event_fixtures: Vec<_> = files.iter().filter(|p| !is_meta(p)).collect();
    assert!(
        !event_fixtures.is_empty(),
        "no event fixtures found — run `bun run codegen:fixtures` in packages/contracts"
    );

    for path in event_fixtures {
        let raw = std::fs::read_to_string(path).expect("read fixture");
        let parsed: WireEvent =
            serde_json::from_str(&raw).unwrap_or_else(|e| panic!("{path:?}: parse failed: {e}"));
        let known = match &parsed {
            WireEvent::Known(ev) => ev,
            WireEvent::Opaque(_) => panic!("{path:?}: a contract event fixture fell into Opaque — the dispatch enum is missing its variant"),
        };
        // Envelope must survive intact — id/time vanishing was the proven template defect.
        assert!(!known.owner_id().is_empty(), "{path:?}: owner_id lost");

        let back = serde_json::to_value(&parsed).expect("serialize");
        let orig: serde_json::Value = serde_json::from_str(&raw).expect("fixture is valid JSON");
        assert_eq!(orig, back, "{path:?}: roundtrip diverged");
    }
}

#[test]
fn unknown_event_name_is_opaque_passthrough_not_an_error() {
    let path = fixtures_dir().join("_unknown-event.json");
    let raw = std::fs::read_to_string(&path).expect("unknown-event probe fixture");
    let parsed: WireEvent =
        serde_json::from_str(&raw).expect("an unknown name must PARSE (forward-compat), not error");
    assert!(
        matches!(parsed, WireEvent::Opaque(_)),
        "unknown event name must land in Opaque"
    );
    // Passthrough must be lossless so a consumer can log/forward the frame verbatim.
    let back = serde_json::to_value(&parsed).expect("serialize");
    let orig: serde_json::Value = serde_json::from_str(&raw).expect("valid JSON");
    assert_eq!(orig, back, "opaque passthrough diverged");
}

#[test]
fn minimal_fixtures_prove_optionals_are_optional() {
    let minimal: Vec<_> = fixture_files()
        .into_iter()
        .filter(|p| p.to_str().is_some_and(|s| s.ends_with(".minimal.json")))
        .collect();
    assert!(!minimal.is_empty(), "minimal fixtures missing");
    for path in minimal {
        let raw = std::fs::read_to_string(&path).expect("read fixture");
        let parsed: WireEvent = serde_json::from_str(&raw)
            .unwrap_or_else(|e| panic!("{path:?}: required-only fixture failed — an optional is emitted as required: {e}"));
        assert!(matches!(parsed, WireEvent::Known(_)), "{path:?}: minimal fixture fell into Opaque");
    }
}
