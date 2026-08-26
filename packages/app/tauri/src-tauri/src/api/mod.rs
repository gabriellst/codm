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
//! A superfície de NUVEM vem de `CODM_CLOUD_URL`, a mesma chave que o daemon TS usa — nunca
//! uma URL cravada aqui. Todas as três estão declaradas em `template.config.ts` com `appTauri`
//! entre os consumidores; consumo de env é relação declarada, não hábito — e os DEFAULTS vêm
//! do mesmo manifesto, via `crate::shell_env` (shell-env.json → build.rs → `env!()`), então um
//! app empacotado sem `process.env` continua sabendo as portas e a origem da nuvem.

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
    /// Build the aggregate client against the supervised sidecars. `owner_id` rides as
    /// a default header on every request — commands never touch identity.
    pub fn from_env() -> Self {
        let api_port = shell_env::port_from_env("API_PORT", shell_env::DAEMON_API_PORT);
        let channel_port = shell_env::port_from_env("CHANNEL_PORT", shell_env::GATEWAY_CHANNEL_PORT);
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
            .expect("every surface url is set above — build cannot fail; api::tests::from_env_builds_every_surface_without_panicking is the witness");

        Api { client }
    }
}

/// Register the aggregate in managed state. Called once from `run()`'s setup.
pub fn manage(app: &tauri::AppHandle) {
    app.manage(Api::from_env());
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
    fn from_env_builds_every_surface_without_panicking() {
        let _api = Api::from_env();
    }
    // The env-resolution unit tests (prefer env / fall back / blank is absent) moved with the
    // helpers to `crate::shell_env`.
}
