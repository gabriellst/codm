//! The env the shell SUPPLIES — compile-time constants derived from the manifest, never literals.
//!
//! `template.config.ts` declares, per env key, who reads it (`consumers`). The keys that name the
//! shell (`appTauri`) are rendered by `config/generate.ts` into `shell-env.json`, per sidecar;
//! `build.rs` turns each pair into `cargo:rustc-env=CODM_SHELL_ENV_<ROLE>_<KEY>`; this module is
//! the ONLY place that reads them back, as `env!()`. A port or URL literal anywhere else in this
//! crate is a second copy of the manifest — the exact drift that shipped 0.5.1 with a daemon that
//! did not know where the cloud lives (`CODM_CLOUD_URL` was never in its boot env).
//!
//! `process.env` still wins at runtime (the root `.env` in dev, a hand-launched shell): the
//! constants are DEFAULTS, and the readers below keep the same shape they always had — only the
//! default stopped being typed by hand.

/// The daemon's listening port (`API_PORT`), as the manifest declares it.
pub const DAEMON_API_PORT: &str = env!("CODM_SHELL_ENV_DAEMON_API_PORT");
/// The cloud origin the daemon asks for identity (`CODM_CLOUD_URL`) — `config/cloud.ts`.
pub const DAEMON_CODM_CLOUD_URL: &str = env!("CODM_SHELL_ENV_DAEMON_CODM_CLOUD_URL");
/// The gateway's listening port (`CHANNEL_PORT`), as the manifest declares it.
pub const GATEWAY_CHANNEL_PORT: &str = env!("CODM_SHELL_ENV_GATEWAY_CHANNEL_PORT");

/// A DECISÃO, separada da leitura: dado o valor cru (ou a ausência dele) e um default, qual valor
/// vale. Pura de propósito — é o que permite testá-la sem mutar env, que em Rust é global ao
/// processo e corre contra os testes em paralelo.
///
/// Vazio conta como AUSENTE: um `CODM_CLOUD_URL=` no `.env` daria uma base vazia, e todo request
/// cairia num path relativo — o modo mais silencioso de errar o destino.
pub fn resolve_value(raw: Option<String>, default: &str) -> String {
    match raw {
        Some(v) if !v.trim().is_empty() => v,
        _ => default.to_string(),
    }
}

/// A string env value, `process.env` first, the generated default second.
pub fn value_from_env(key: &str, default: &str) -> String {
    resolve_value(std::env::var(key).ok(), default)
}

/// A port env value, `process.env` first, the generated default second. The default is parsed
/// here, not validated: `build.rs` already refused any non-port value while emitting it, so a
/// failure at this line can only mean the two disagree — a build bug, not a runtime condition.
pub fn port_from_env(key: &str, default: &str) -> u16 {
    let fallback: u16 = default
        .parse()
        .unwrap_or_else(|_| panic!("shell-env default for {key} is not a port: {default:?} — build.rs validates this"));
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(fallback)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// O contrato chegou inteiro: `build.rs` emitiu as três chaves e nenhuma é vazia. Um
    /// `shell-env.json` desregenerado (chave a menos) já quebra a compilação no `env!()`; este
    /// teste cobre o valor.
    #[test]
    fn generated_defaults_are_present_and_well_formed() {
        assert!(DAEMON_API_PORT.parse::<u16>().is_ok(), "API_PORT: {DAEMON_API_PORT:?}");
        assert!(GATEWAY_CHANNEL_PORT.parse::<u16>().is_ok(), "CHANNEL_PORT: {GATEWAY_CHANNEL_PORT:?}");
        assert!(
            DAEMON_CODM_CLOUD_URL.starts_with("https://"),
            "CODM_CLOUD_URL must be the public cloud origin, got {DAEMON_CODM_CLOUD_URL:?}"
        );
    }

    #[test]
    fn resolve_value_prefers_the_env_value() {
        assert_eq!(
            resolve_value(Some("https://cloud.example".into()), DAEMON_CODM_CLOUD_URL),
            "https://cloud.example"
        );
    }

    #[test]
    fn resolve_value_falls_back_when_absent() {
        assert_eq!(resolve_value(None, DAEMON_CODM_CLOUD_URL), DAEMON_CODM_CLOUD_URL);
    }

    /// Vazio é AUSENTE, não "use string vazia". Sem isto, um `CODM_CLOUD_URL=` no `.env` daria uma
    /// base vazia e todo request iria para um path relativo, sem erro nenhum.
    #[test]
    fn resolve_value_treats_blank_as_absent() {
        assert_eq!(resolve_value(Some("".into()), "http://fallback"), "http://fallback");
        assert_eq!(resolve_value(Some("   ".into()), "http://fallback"), "http://fallback");
    }

    #[test]
    fn port_from_env_parses_the_generated_default() {
        // A key no environment will ever carry — so the generated default is what comes back.
        assert_eq!(
            port_from_env("CODM_SHELL_ENV_TEST_UNSET_PORT_KEY", DAEMON_API_PORT),
            DAEMON_API_PORT.parse::<u16>().unwrap()
        );
    }
}
