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
//!
//! `API_PORT`/`CHANNEL_PORT` carry a CANDIDATE LIST now (`config/ports.ts`), not a single value —
//! the packaged app's own port family, chosen at boot by trying each in order and taking the first
//! nothing else is bound to (`sidecars::lifecycle::resolve_port`). `build.rs` joins the list with
//! `,` into one env var; `port_candidates` below splits it back.

/// The daemon's candidate listening ports (`API_PORT`), comma-joined by `build.rs` from
/// `config/ports.ts` — split back with `port_candidates`.
pub const DAEMON_API_PORT_CANDIDATES: &str = env!("CODM_SHELL_ENV_DAEMON_API_PORT");
/// The cloud origin the daemon asks for identity (`CODM_CLOUD_URL`) — `config/cloud.ts`.
pub const DAEMON_CODM_CLOUD_URL: &str = env!("CODM_SHELL_ENV_DAEMON_CODM_CLOUD_URL");
/// The gateway's candidate listening ports (`CHANNEL_PORT`), same shape as
/// `DAEMON_API_PORT_CANDIDATES`.
pub const GATEWAY_CHANNEL_PORT_CANDIDATES: &str = env!("CODM_SHELL_ENV_GATEWAY_CHANNEL_PORT");
/// The brand the customer sees (`PRODUCT_NAME`): e-mail chrome on the daemon side — `config/env.ts`.
pub const DAEMON_PRODUCT_NAME: &str = env!("CODM_SHELL_ENV_DAEMON_PRODUCT_NAME");
/// The brand the customer sees (`PRODUCT_NAME`): the WhatsApp linked-device name on the gateway
/// side. Same manifest key, same value; each sidecar reads its own role's constant.
pub const GATEWAY_PRODUCT_NAME: &str = env!("CODM_SHELL_ENV_GATEWAY_PRODUCT_NAME");

/// Split a comma-joined candidate-port default back into the list `build.rs` validated element by
/// element while emitting it — a failure here can only mean the two disagree (a build bug), not a
/// runtime condition, same posture as `port_from_env`'s default parse.
pub fn port_candidates(default_csv: &str) -> Vec<u16> {
    default_csv
        .split(',')
        .map(|s| {
            s.trim()
                .parse()
                .unwrap_or_else(|_| panic!("shell-env candidate default is not a port: {s:?} in {default_csv:?} — build.rs validates this"))
        })
        .collect()
}

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

#[cfg(test)]
mod tests {
    use super::*;

    /// O contrato chegou inteiro: `build.rs` emitiu as três chaves e nenhuma é vazia. Um
    /// `shell-env.json` desregenerado (chave a menos) já quebra a compilação no `env!()`; este
    /// teste cobre o valor.
    #[test]
    fn generated_defaults_are_present_and_well_formed() {
        assert_eq!(port_candidates(DAEMON_API_PORT_CANDIDATES).len(), 4, "API_PORT candidates: {DAEMON_API_PORT_CANDIDATES:?}");
        assert_eq!(
            port_candidates(GATEWAY_CHANNEL_PORT_CANDIDATES).len(),
            4,
            "CHANNEL_PORT candidates: {GATEWAY_CHANNEL_PORT_CANDIDATES:?}"
        );
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

    /// `build.rs` joins the candidates with `,`; this is the inverse, and it has to survive a
    /// generated default it never saw at the call site (only the two constants above ever do).
    #[test]
    fn port_candidates_splits_the_joined_default() {
        assert_eq!(port_candidates("47330,47340,47350"), vec![47330, 47340, 47350]);
        assert_eq!(port_candidates("3030"), vec![3030]);
    }

    #[test]
    #[should_panic(expected = "is not a port")]
    fn port_candidates_panics_on_a_malformed_default() {
        port_candidates("not-a-port");
    }
}
