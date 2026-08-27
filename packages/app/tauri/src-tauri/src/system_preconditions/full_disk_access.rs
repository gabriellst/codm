//! ACESSO TOTAL AO DISCO (macOS) — a permissão de disco dos AGENTES.
//!
//! Tudo que o daemon gera (o `claude`, e todo `zsh`/`git`/`gh` abaixo dele) é atribuído pelo macOS
//! a ESTE app como processo responsável — o log do `tccd` diz `responsible={identifier=app.codm
//! .desktop}`. Como os workspaces vivem sob pastas protegidas, a permissão do app É a permissão
//! deles. Medido em 07/08/2026: ~640 negações de kernel, o `claude` morrendo com EPERM no startup,
//! o portão de prontidão nunca concluindo e nenhuma janela aparecendo.
//!
//! A SONDA É UMA LEITURA, NÃO UMA PERGUNTA (spec Decision 5). O macOS não expõe API para consultar
//! o TCC; o `tccd` só se manifesta NEGANDO, depois do fato. O resultado de uma leitura de verdade é
//! a única evidência disponível.
//!
//! O ALVO é um arquivo do PRÓPRIO macOS, escolhido por duas propriedades e por nada mais:
//!   (a) só abre com Acesso Total ao Disco — nenhuma permissão estreita passa por aqui, então não
//!       há falso-OK. Ler `~/Desktop` daria OK para quem concedeu apenas a permissão de Desktop,
//!       deixando os agentes quebrados em qualquer outro lugar;
//!   (b) abrir NUNCA dispara diálogo — FDA não tem prompt (Problem 2 da spec). Ler `~/Desktop` a
//!       partir do app em primeiro plano dispararia o prompt de `SystemPolicyDesktopFolder`, e uma
//!       recusa GRAVARIA a negação que o reparo existe para desfazer: a sonda teria criado o
//!       problema.
//! O CONTEÚDO é irrelevante e nunca é lido — só o `Ok`/`Err` da abertura importa.

use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};

use super::{Platform, SystemPrecondition, SystemPreconditionId, RepairScope, RepairStep};

pub const SYSTEM_PRECONDITION: SystemPrecondition = SystemPrecondition {
    id: SystemPreconditionId::FullDiskAccess,
    platforms: &[Platform::Macos],
    probe,
    repair,
    repair_scope: RepairScope::AppGrant,
};

/// Privacidade e Segurança › Acesso Total ao Disco.
pub const SETTINGS_URL: &str =
    "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";

fn probe_target() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join("Library/Application Support/com.apple.TCC/TCC.db"))
}

fn probe() -> bool {
    match probe_target() {
        Some(path) => satisfied_from(open(&path)),
        // Sem home resolvível não há o que ler, e "não sei" não é motivo para bloquear o operador.
        None => true,
    }
}

/// A abertura, isolada para o teste poder apontá-la a um arquivo temporário.
pub fn open(path: &Path) -> io::Result<()> {
    File::open(path).map(|_| ())
}

/// O veredito, isolado do disco.
///
/// `PermissionDenied` é a ÚNICA evidência de negação. `NotFound` não é: um arquivo ausente não
/// prova permissão nenhuma, e travar o app numa pendência que ninguém consegue resolver seria pior
/// que a falha que isto conserta — mesmo princípio do default-online do `SupervisionGate`.
pub fn satisfied_from(result: io::Result<()>) -> bool {
    match result {
        Err(e) if e.kind() == io::ErrorKind::PermissionDenied => false,
        _ => true,
    }
}

/// A ORDEM é o que ninguém adivinha (spec Decision 8): conceder sem limpar não funciona quando a
/// negação já foi gravada, então o `tccutil reset` vem ANTES de os Ajustes abrirem. Ela fica
/// embutida na ação em vez de virar instrução para o operador seguir.
///
/// E há um TERCEIRO passo entre os dois, que o 0.5.3 não tinha: o reset apaga a entrada do app no
/// TCC — a mesma entrada que o faz aparecer na lista de Acesso Total ao Disco —, então os Ajustes
/// abriam numa lista onde o CODM não estava, e o operador tinha de arrastar o app à mão. A sonda
/// (`open(TCC.db)` negado) re-registra o app ANTES de o pane abrir; aí é só ligar o switch.
fn repair(bundle_id: &str) -> Vec<RepairStep> {
    vec![
        RepairStep::Command {
            program: "tccutil",
            args: vec![
                "reset".into(),
                "SystemPolicyAllFiles".into(),
                bundle_id.into(),
            ],
        },
        RepairStep::Probe,
        RepairStep::Command {
            program: "open",
            args: vec![SETTINGS_URL.into()],
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Error, ErrorKind, Write};
    // Só-Unix, e por isso atrás de `cfg`: o teste que a usa também é — ver o docblock dele. Sem esta
    // guarda o `cargo test` do shell nem COMPILA no Windows (`from_mode` não existe lá), e a perna
    // Windows nativa, que passou a rodar os testes de verdade em 2026-08-26, encontrou isso no
    // primeiro run — o arquivo inteiro é macOS-only em produção, mas os testes compilam em todo lugar.
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    /// O VEREDITO, isolado do disco. `PermissionDenied` é a única evidência de negação que o macOS
    /// oferece; `NotFound` não prova permissão nenhuma e não pode virar uma pendência que ninguém
    /// consegue resolver (mesmo princípio do default-online do `SupervisionGate`).
    #[test]
    fn permission_denied_is_the_only_unsatisfied_verdict() {
        assert!(!satisfied_from(Err(Error::from(ErrorKind::PermissionDenied))));
        assert!(satisfied_from(Ok(())));
        assert!(satisfied_from(Err(Error::from(ErrorKind::NotFound))));
    }

    /// AC-1, contra o disco de verdade: um arquivo sem bit de leitura devolve EPERM ao abrir, que é
    /// exatamente a forma que o TCC dá à negação. Não roda como root (que ignora os bits) — e os
    /// runners deste repo não são root.
    ///
    /// `cfg(unix)`: o mecanismo asseverado aqui são os bits de permissão POSIX, que no Windows não
    /// existem — lá o controle é por ACL e `from_mode` sequer compila. Pular no Windows é honesto
    /// (a pré-condição inteira é macOS-only, `platforms: &[Platform::Macos]`); o que não podia
    /// continuar é o arquivo não compilar.
    #[cfg(unix)]
    #[test]
    fn an_unreadable_file_reports_unsatisfied() {
        let path = std::env::temp_dir().join("codm-system_precondition-probe-unreadable");
        let mut file = std::fs::File::create(&path).expect("criar o arquivo de sonda");
        file.write_all(b"x").expect("escrever no arquivo de sonda");
        drop(file);
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o000))
            .expect("remover o bit de leitura");

        let verdict = satisfied_from(open(&path));

        // Devolve os bits ANTES de asseverar, senão uma falha deixa lixo não removível no temp.
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).ok();
        std::fs::remove_file(&path).ok();

        assert!(!verdict, "um arquivo ilegível tem que reportar não satisfeita");
    }

    /// AC-2.
    #[test]
    fn a_readable_file_reports_satisfied() {
        let path = std::env::temp_dir().join("codm-system_precondition-probe-readable");
        std::fs::write(&path, b"x").expect("criar o arquivo de sonda");

        let verdict = satisfied_from(open(&path));

        std::fs::remove_file(&path).ok();
        assert!(verdict);
    }

    /// AC-6 — a ORDEM, lida da lista, sem executar nada. Conceder sem limpar não funciona quando a
    /// negação já foi gravada, então o `tccutil reset` tem que vir primeiro; declarar os passos como
    /// dado é o que permite provar isso sem tocar no TCC da máquina que roda o teste.
    #[test]
    fn repair_resets_tcc_then_reregisters_then_opens_settings() {
        let steps = repair("app.codm.desktop");

        assert_eq!(steps.len(), 3, "o reparo é exatamente três passos: reset, sonda, open");
        assert_eq!(
            steps[0],
            RepairStep::Command {
                program: "tccutil",
                args: vec!["reset".into(), "SystemPolicyAllFiles".into(), "app.codm.desktop".into()],
            }
        );
        // A sonda ENTRE o reset e o open: é o acesso negado dela que faz o app voltar à lista dos
        // Ajustes. Antes dela (0.5.3), o pane abria sem o CODM listado.
        assert_eq!(steps[1], RepairStep::Probe);
        assert_eq!(
            steps[2],
            RepairStep::Command {
                program: "open",
                args: vec![SETTINGS_URL.into()],
            }
        );
    }

    /// O bundle id ENTRA — não é literal. `tccutil` apagando a entrada de outro app seria uma
    /// limpeza silenciosa que não conserta nada e mexe onde não devia.
    #[test]
    fn repair_targets_the_bundle_id_it_was_given() {
        let steps = repair("com.example.other");
        let RepairStep::Command { args, .. } = &steps[0] else {
            panic!("o primeiro passo é o tccutil reset")
        };
        assert_eq!(args[2], "com.example.other");
    }
}
