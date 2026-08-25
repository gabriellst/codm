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
//! entre os consumidores; consumo de env é relação declarada, não hábito.

use tauri::Manager;

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

fn port_from_env(key: &str, default: u16) -> u16 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

/// A DECISÃO, separada da leitura: dado o valor cru (ou a ausência dele) e um default, qual URL
/// vale. Pura de propósito — é o que permite testá-la sem mutar env, que em Rust é global ao
/// processo e corre contra os testes em paralelo.
///
/// Vazio conta como AUSENTE: um `CODM_CLOUD_URL=` no `.env` daria uma base vazia, e todo request
/// cairia num path relativo — o modo mais silencioso de errar o destino.
fn resolve_url(raw: Option<String>, default: &str) -> String {
    match raw {
        Some(v) if !v.trim().is_empty() => v,
        _ => default.to_string(),
    }
}

fn url_from_env(key: &str, default: &str) -> String {
    resolve_url(std::env::var(key).ok(), default)
}

impl Api {
    /// Build the aggregate client against the supervised sidecars. `owner_id` rides as
    /// a default header on every request — commands never touch identity.
    pub fn from_env() -> Self {
        let api_port = port_from_env("API_PORT", 3030);
        let channel_port = port_from_env("CHANNEL_PORT", 3032);
        let local_api = format!("http://127.0.0.1:{api_port}");
        // Default = a api local, exatamente a regra que o lado TS já declara para esta chave
        // ("defaults to API_URL", template.config.ts). Não é conveniência: é não inventar uma
        // segunda semântica para a mesma variável. Em produção o instalador aponta para a nuvem.
        let cloud_url = url_from_env("CODM_CLOUD_URL", &local_api);

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

    #[test]
    fn resolve_url_prefers_the_env_value() {
        assert_eq!(
            resolve_url(Some("https://cloud.example".into()), "http://127.0.0.1:3030"),
            "https://cloud.example"
        );
    }

    #[test]
    fn resolve_url_falls_back_when_absent() {
        assert_eq!(resolve_url(None, "http://127.0.0.1:3030"), "http://127.0.0.1:3030");
    }

    /// Vazio é AUSENTE, não "use string vazia". Sem isto, um `CODM_CLOUD_URL=` no `.env` daria uma
    /// base vazia e todo request iria para um path relativo, sem erro nenhum.
    #[test]
    fn resolve_url_treats_blank_as_absent() {
        assert_eq!(resolve_url(Some("".into()), "http://fallback"), "http://fallback");
        assert_eq!(resolve_url(Some("   ".into()), "http://fallback"), "http://fallback");
    }
}
