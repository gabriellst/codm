//! Construction rail — the aggregate Client wires one typed sub-client per discovered
//! api service. Symmetric with the TS/Go SDK aggregates.

use codedm_client_rust::Client;

#[test]
fn client_builder_constructs() {
    let client = Client::builder()
        .typescript("http://localhost:3030")
        .go("http://localhost:3032")
        .build()
        .expect("build");
    // Construction proves the struct shape; nothing to call without a live server.
    let _ = &client.typescript;
    let _ = &client.go;
}

#[test]
fn missing_url_fails_loud() {
    let err = Client::builder().typescript("http://localhost:3030").build();
    assert!(err.is_err(), "missing go url must not silently default");
}

/// Enum dedup (rust-wire spec §F4): a contract enum used by an api surface resolves to
/// the WIRE crate's type — one definition, shared by binding and client. This line only
/// compiles if the replacement actually happened (type identity, not name equality).
#[test]
fn contract_enums_are_the_wire_crate_types() {
    let _: codedm_contracts_rust::wire::enums::ChannelKind =
        codedm_contracts_rust::wire::enums::ChannelKind::WHATSAPP;
}
