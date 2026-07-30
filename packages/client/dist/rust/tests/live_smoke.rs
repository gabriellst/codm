//! LIVE end-to-end smoke (rust-wire spec §4.4) — `#[ignore]` by default because it
//! needs the backends up (`bun dev`, or the Tauri shell's sidecars).
//!
//! Run manually:
//!   cargo test --manifest-path packages/client/dist/rust/Cargo.toml -- --ignored
//!
//! Proves the whole chain the shell relies on: typed aggregate → HTTP → gateway →
//! typed response (contract enums resolving to the WIRE crate's types).

use codedm_client_rust::Client;

#[tokio::test]
#[ignore = "needs live backends on :3030/:3032 — run with -- --ignored"]
async fn gateway_lists_channels_through_the_typed_client() {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::HeaderName::from_static("x-owner-id"),
        reqwest::header::HeaderValue::from_static("local"),
    );
    let http = reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .expect("reqwest client");

    let client = Client::builder()
        .typescript("http://127.0.0.1:3030")
        .go("http://127.0.0.1:3032")
        .http(http)
        .build()
        .expect("build");

    let channels = client
        .go
        .list_channels(Some(10), None)
        .await
        .expect("GET /channel/channels through the typed client");
    // Typed access is the assertion — the response deserialized into ListChannelsOutput.
    let _ = channels.into_inner();
}
