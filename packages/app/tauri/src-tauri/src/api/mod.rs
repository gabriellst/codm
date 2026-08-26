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
//! URLs come from the SAME resolved ports the sidecar supervisor boots the services with
//! (`api_port` / `channel_port` — see `sidecars::resolve_ports`, called ONCE in `lib.rs`'s `setup`
//! and passed in here); no second source of truth. Building this client from its OWN independent
//! call to `shell_env::port_candidates` + a second bind-and-release scan would risk picking a
//! DIFFERENT free port than the one the spawned sidecar actually got — the client would then be
//! calling an address nothing is listening on. A superfície de NUVEM vem de `CODM_CLOUD_URL`, a
//! mesma chave que o daemon TS usa — nunca uma URL cravada aqui, e ela AINDA lê o manifesto
//! diretamente (`crate::shell_env`): a cloud não é candidata a porta, não tem corrida nenhuma a
//! resolver antes.

use tauri::Manager;

use crate::shell_env;

/// Typed SDK aggregate + the identity it calls with. Constructed ONCE in `setup` and
/// managed as `tauri::State<Api>`.
pub struct Api {
    // Wiring lands ahead of its first product command (spec §F7): a command reads this as
    // `state.client.<service>.<method>()`. The live end-to-end path is proven by the
    // #[ignore]d smoke in packages/client/dist/rust/tests/live_smoke.rs.
    #[allow(dead_code)]
    pub client: codm_client_rust::Client,
}

/// The single-tenant owner the desktop shell acts as. The daemon provisions the local
/// tenant under this id; the shell's S2S calls carry it explicitly.
const LOCAL_OWNER_ID: &str = "local";

impl Api {
    /// Build the aggregate client against the supervised sidecars, on the ports the caller already
    /// resolved (`sidecars::resolve_ports`) — this constructor makes NO port decision of its own.
    /// `owner_id` rides as a default header on every request — commands never touch identity.
    pub fn new(api_port: u16, channel_port: u16) -> Self {
        let local_api = format!("http://127.0.0.1:{api_port}");
        // O default era `local_api` — "defaults to API_URL", a regra do lado TS. Num app empacotado
        // não há `process.env`, então o sub-cliente de nuvem do shell apontava o daemon local, que
        // não monta `auth` (cloud-only) e devolve 404. O default agora é o MESMO valor que o
        // supervisor entrega ao daemon em `CODM_CLOUD_URL`: uma origem, dois leitores.
        let cloud_url = shell_env::value_from_env("CODM_CLOUD_URL", shell_env::DAEMON_CODM_CLOUD_URL);

        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::HeaderName::from_static("x-owner-id"),
            reqwest::header::HeaderValue::from_static(LOCAL_OWNER_ID),
        );
        let http = reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .expect("reqwest client");

        let client = codm_client_rust::Client::builder()
            .typescript(local_api)
            // A superfície de NUVEM (ADR 0001): o mesmo backend TypeScript publica duas specs, e o
            // agregado tem um sub-cliente para cada. Ela é OBRIGATÓRIA no builder — sem esta linha o
            // `build()` devolve `Err(MissingUrl("typescript-cloud"))` e o `.expect()` abaixo derruba
            // o shell no BOOT. Foi exatamente o que aconteceu quando o terceiro módulo nasceu.
            .typescript_cloud(cloud_url)
            // The `/api` frontier belongs to the BASE URL, never to a contract path — the repo's
            // convention, mirrored from the console: `Config.gatewayBaseUrl` points the `go`
            // sub-client at the api-ts ChannelProxy, which forwards to `${API_GO_URL}/api`
            // server-side (packages/app/react/src/lib/config.ts). The gateway's spec paths are
            // relative to that frontier, so the shell — which talks to :3032 directly, with no
            // proxy in between — carries it here.
            .go(format!("http://127.0.0.1:{channel_port}/api"))
            .http(http)
            .build()
            .expect("every surface url is set above — build cannot fail; api::tests::new_builds_every_surface_without_panicking is the witness");

        Api { client }
    }
}

/// Register the aggregate in managed state, on the ports the caller already resolved. Called once
/// from `run()`'s setup, AFTER `sidecars::resolve_ports` — see that function's doc for why the
/// resolution happens exactly once and is threaded through rather than re-derived here.
pub fn manage(app: &tauri::AppHandle, api_port: u16, channel_port: u16) {
    app.manage(Api::new(api_port, channel_port));
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A TESTEMUNHA do defeito que quase saiu: quando o agregado ganhou a terceira superfície
    /// (`typescript-cloud`), o `build()` passou a exigir uma terceira URL — e este construtor não a
    /// setava. O crate COMPILAVA e o shell PANICAVA no boot, no `.expect()` logo abaixo do builder.
    ///
    /// `cargo check` não pega isso. Só chamar pega.
    #[test]
    fn new_builds_every_surface_without_panicking() {
        let _api = Api::new(47330, 47332);
    }
    // The env-resolution unit tests (prefer env / fall back / blank is absent) moved with the
    // helpers to `crate::shell_env`.
}
