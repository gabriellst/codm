//! The shell's ONLY door to the backends — a typed SDK aggregate in `tauri::State`.
//!
//! House rule (mirror of the frontend's "nunca `fetch` direto", pinned by
//! `tests/no_raw_http.rs`): raw `reqwest` is BANNED outside this module. Every command
//! that needs backend data goes `state.client.<service>.<method>()` — the same wire
//! contract the console consumes through the TS SDK, resolved at compile time.
//!
//! Identity: the S2S hop carries the owner explicitly (`X-Owner-Id` default header,
//! injected once here) — the called service never infers the owner (CLAUDE.md, SDK
//! rules). Commands never assemble identity headers by hand.
//!
//! URLs come from the SAME env keys the sidecar supervisor boots the services with
//! (`API_PORT` / `CHANNEL_PORT` — see `sidecars::sidecars`); no second source of truth.

use tauri::Manager;

/// Typed SDK aggregate + the identity it calls with. Constructed ONCE in `setup` and
/// managed as `tauri::State<Api>`.
pub struct Api {
    // Wiring lands ahead of its first product command (spec §F7): a command reads this as
    // `state.client.<service>.<method>()`. The live end-to-end path is proven by the
    // #[ignore]d smoke in packages/client/dist/rust/tests/live_smoke.rs.
    #[allow(dead_code)]
    pub client: codedm_client_rust::Client,
}

/// The single-tenant owner the desktop shell acts as. The daemon provisions the local
/// tenant under this id; the shell's S2S calls carry it explicitly.
const LOCAL_OWNER_ID: &str = "local";

fn port_from_env(key: &str, default: u16) -> u16 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

impl Api {
    /// Build the aggregate client against the supervised sidecars. `owner_id` rides as
    /// a default header on every request — commands never touch identity.
    pub fn from_env() -> Self {
        let api_port = port_from_env("API_PORT", 3030);
        let channel_port = port_from_env("CHANNEL_PORT", 3032);

        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::HeaderName::from_static("x-owner-id"),
            reqwest::header::HeaderValue::from_static(LOCAL_OWNER_ID),
        );
        let http = reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .expect("reqwest client");

        let client = codedm_client_rust::Client::builder()
            .typescript(format!("http://127.0.0.1:{api_port}"))
            // The `/api` frontier belongs to the BASE URL, never to a contract path — the repo's
            // convention, mirrored from the console: `Config.gatewayBaseUrl` points the `go`
            // sub-client at the api-ts ChannelProxy, which forwards to `${API_GO_URL}/api`
            // server-side (packages/app/react/src/lib/config.ts). The gateway's spec paths are
            // relative to that frontier, so the shell — which talks to :3032 directly, with no
            // proxy in between — carries it here.
            .go(format!("http://127.0.0.1:{channel_port}/api"))
            .http(http)
            .build()
            .expect("both service urls are set above — build cannot fail");

        Api { client }
    }
}

/// Register the aggregate in managed state. Called once from `run()`'s setup.
pub fn manage(app: &tauri::AppHandle) {
    app.manage(Api::from_env());
}
