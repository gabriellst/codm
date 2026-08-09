//! PRÉ-CONDIÇÕES DO AMBIENTE — o registro, e a única coisa que muda para somar a próxima.
//!
//! Uma pré-condição é um módulo com responsabilidades DECLARADAS: em que plataformas ela existe,
//! como detectá-la e como repará-la. `SYSTEM_PRECONDITIONS` lista os módulos; somar uma é criar um arquivo
//! e acrescentar uma linha aqui — nenhum módulo existente muda (spec Decision 2).
//!
//! PLATAFORMA É CAMPO, NÃO `#[cfg]`, e a razão é o contrato: as bindings do tauri-specta são
//! geradas no mac e COMMITADAS (`../commands/bindings.ts`). Se o enum `SystemPreconditionId` encolhesse
//! por alvo, o arquivo commitado nomearia um id inexistente no build do Windows e o mapa exaustivo
//! do console (spec Decision 3) deixaria de fechar. Então o union de ids é o mesmo em toda
//! plataforma e o que varia é quais são APLICÁVEIS — dado, avaliado por lookup uniforme em
//! `applicable()`, nunca por um desvio de fluxo dentro de uma sonda.
//!
//! A DETECÇÃO mora aqui e não no console porque quem observa é quem tem acesso: o console é uma
//! webview, sem sistema de arquivos e sem processo próprio. Mesma razão do `SupervisionService`.

mod full_disk_access;

use serde::{Deserialize, Serialize};
use specta::Type;

/// Os ids. Estável em toda plataforma — ver o doc do módulo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SystemPreconditionId {
    FullDiskAccess,
}

/// Os hosts nativos. NÃO cruza para o console: o filtro já aconteceu aqui, e um console que
/// recebesse a plataforma só teria como usá-la para refazer o mesmo `if` que este campo existe
/// para eliminar (desktop-shell bp-02 — a UI ramifica no que uma porta REPORTA, nunca no host).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Macos,
    Windows,
    Linux,
}

/// A plataforma deste binário. `cfg!` expande para literal booleano, então isto é resolvido em
/// tempo de compilação sem ramificar em runtime.
pub const fn current_platform() -> Platform {
    if cfg!(target_os = "macos") {
        Platform::Macos
    } else if cfg!(target_os = "windows") {
        Platform::Windows
    } else {
        Platform::Linux
    }
}

/// Um passo de reparo como DADO — e é isso que torna a ordem asseverável. A spec (AC-6) exige que
/// o `tccutil reset` aconteça ANTES de os Ajustes abrirem; um teste lê a lista e prova a ordem sem
/// executar nada nem tocar no TCC da máquina.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepairStep {
    pub program: &'static str,
    pub args: Vec<String>,
}

/// Sobre o que o reparo de uma pré-condição age — DECLARADO pelo módulo, como `platforms`
/// (Decision 9). É o que permite ao host decidir se aquele reparo tem efeito aqui sem que
/// nenhuma sonda precise saber em que build está rodando.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RepairScope {
    /// Age sobre a concessão DESTE bundle (`tccutil reset <bundle id>`). Sem bundle atribuível
    /// não há entrada para limpar nem app para listar nos Ajustes.
    AppGrant,
    /// Não depende da identidade do app.
    ///
    /// Nenhuma pré-condição do registro usa esta variante ainda — `FullDiskAccess` é a única e
    /// declara `AppGrant`. Ela existe porque o CAMPO precisa cobrir os dois casos desde já (a
    /// mesma razão de `Platform` ter `Windows`/`Linux` antes de existir sonda para eles); fica
    /// `#[allow(dead_code)]` até a primeira pré-condição `Standalone` chegar, em vez de sumir do
    /// enum e o campo mentir que só existe um jeito de reparo.
    #[allow(dead_code)]
    Standalone,
}

/// O módulo. Quatro responsabilidades declaradas + onde ele vale.
pub struct SystemPrecondition {
    pub id: SystemPreconditionId,
    /// Onde ela EXISTE. Nunca vazio (asseverado).
    pub platforms: &'static [Platform],
    /// A sonda. `true` = satisfeita.
    pub probe: fn() -> bool,
    /// Os passos, EM ORDEM, dado o bundle id do app (o alvo do `tccutil`).
    pub repair: fn(&str) -> Vec<RepairStep>,
    /// Sobre o que o reparo age — ver `RepairScope`.
    pub repair_scope: RepairScope,
}

/// O REGISTRO. Somar uma pré-condição = um arquivo + uma linha aqui.
///
/// `static` e não `const`: um `const` é inlinado em cada uso, então `SYSTEM_PRECONDITIONS.iter()` tomaria
/// emprestado um temporário e `applicable()` não poderia devolver `&'static SystemPrecondition`. Um
/// `static` tem endereço estável, que é exatamente o que o iterador precisa emprestar.
pub static SYSTEM_PRECONDITIONS: &[SystemPrecondition] = &[full_disk_access::SYSTEM_PRECONDITION];

/// O que vale nesta máquina — lookup uniforme sobre o campo declarado.
pub fn applicable() -> impl Iterator<Item = &'static SystemPrecondition> {
    SYSTEM_PRECONDITIONS
        .iter()
        .filter(|p| p.platforms.contains(&current_platform()))
}

/// Este processo tem identidade que o macOS consiga usar para atribuir uma concessão?
///
/// DERIVADO do executável, nunca de `debug_assertions`: aquilo descreve o perfil de build, e um
/// binário release rodado fora de um bundle teria a mesma ausência de identidade que o de `tauri
/// dev`. O fato é o `.app` ancestral — `/Applications/CoDM.app/Contents/MacOS/codm-desktop` tem;
/// `target/debug/codm-desktop` não.
pub fn has_attributable_identity() -> bool {
    match std::env::current_exe() {
        Ok(path) => path
            .ancestors()
            .any(|ancestor| ancestor.extension().is_some_and(|ext| ext == "app")),
        // `current_exe()` sem resolver não prova identidade nenhuma.
        Err(_) => false,
    }
}

/// Se o reparo de uma pré-condição TEM efeito neste host — cruza `repair_scope` (declarado) com
/// `has_attributable_identity()` (derivado do processo). Um `AppGrant` sem identidade atribuível
/// não tem bundle para o `tccutil` limpar nem app para listar nos Ajustes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RepairAvailability {
    Available,
    /// O host não consegue atribuir a concessão a este app — quem a carrega é o processo
    /// responsável (em `tauri dev`, o terminal).
    NoAppIdentity,
}

fn repair_availability(scope: RepairScope) -> RepairAvailability {
    match scope {
        RepairScope::AppGrant if !has_attributable_identity() => RepairAvailability::NoAppIdentity,
        RepairScope::AppGrant | RepairScope::Standalone => RepairAvailability::Available,
    }
}

/// O que atravessa para o console. Só os aplicáveis.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SystemPreconditionStatus {
    pub id: SystemPreconditionId,
    pub satisfied: bool,
    pub repair: RepairAvailability,
}

pub fn statuses() -> Vec<SystemPreconditionStatus> {
    applicable()
        .map(|p| SystemPreconditionStatus {
            id: p.id,
            satisfied: (p.probe)(),
            repair: repair_availability(p.repair_scope),
        })
        .collect()
}

pub fn repair_steps(id: SystemPreconditionId, bundle_id: &str) -> Vec<RepairStep> {
    applicable()
        .find(|p| p.id == id)
        .map(|p| (p.repair)(bundle_id))
        .unwrap_or_default()
}

/// Executa os passos EM ORDEM.
///
/// Um passo que sai com código != 0 NÃO aborta a sequência, de propósito: `tccutil reset` sai
/// diferente de zero quando não havia nada gravado para limpar — que é justamente o caso de quem
/// nunca negou nada —, e abortar ali deixaria os Ajustes fechados exatamente para o operador de
/// primeira viagem. Falha de SPAWN (binário ausente) é outra coisa: essa sobe, porque significa
/// que o reparo não aconteceu de forma alguma.
pub fn run_repair(id: SystemPreconditionId, bundle_id: &str) -> Result<(), String> {
    if let Some(system_precondition) = applicable().find(|p| p.id == id) {
        if repair_availability(system_precondition.repair_scope) == RepairAvailability::NoAppIdentity {
            return Err(format!(
                "system_precondition repair: {id:?} exige identidade de app atribuível (este processo roda fora de um bundle `.app`) — recusado antes de tentar qualquer coisa"
            ));
        }
    }

    for step in repair_steps(id, bundle_id) {
        let status = std::process::Command::new(step.program)
            .args(&step.args)
            .status()
            .map_err(|e| format!("system_precondition repair: `{}` não iniciou: {e}", step.program))?;
        log::info!(
            "[system_preconditions] {} {:?} -> {status}",
            step.program,
            step.args
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Uma pré-condição que não vale em plataforma nenhuma não é uma pré-condição — é código morto
    /// que o `applicable()` filtraria para sempre, silenciosamente.
    #[test]
    fn every_system_precondition_declares_at_least_one_platform() {
        for system_precondition in SYSTEM_PRECONDITIONS {
            assert!(
                !system_precondition.platforms.is_empty(),
                "{:?} não declara plataforma nenhuma",
                system_precondition.id
            );
        }
    }

    /// O filtro é por CAMPO DECLARADO, não por `#[cfg]`: o registro é o mesmo em todo alvo e o que
    /// muda é quem passa por `applicable()`. É isso que mantém o union de ids estável nas bindings.
    #[test]
    fn applicable_filters_by_the_declared_platform_field() {
        let ids: Vec<SystemPreconditionId> = applicable().map(|p| p.id).collect();

        #[cfg(target_os = "macos")]
        assert_eq!(ids, vec![SystemPreconditionId::FullDiskAccess]);

        #[cfg(not(target_os = "macos"))]
        assert!(
            ids.is_empty(),
            "FULL_DISK_ACCESS declara apenas Macos e não deveria ser aplicável aqui"
        );
    }

    /// O console nunca vê o id de uma pré-condição que não vale nesta máquina — se visse, teria que
    /// decidir sozinho o que fazer com ela, e essa decisão é justamente o que o campo evita.
    #[test]
    fn statuses_reports_exactly_the_applicable_ids() {
        let reported: Vec<SystemPreconditionId> = statuses().into_iter().map(|s| s.id).collect();
        let expected: Vec<SystemPreconditionId> = applicable().map(|p| p.id).collect();
        assert_eq!(reported, expected);
    }

    /// Um id que não é aplicável não tem reparo — e pedir o reparo dele devolve uma lista vazia em
    /// vez de estourar. O console é quem manda o id, e o console é código que pode estar mais novo
    /// (ou mais velho) que este binário.
    #[test]
    fn repair_steps_of_a_non_applicable_id_are_empty() {
        #[cfg(not(target_os = "macos"))]
        assert!(repair_steps(SystemPreconditionId::FullDiskAccess, "app.codm.desktop").is_empty());

        // No macOS o id É aplicável — a asserção equivalente é que ele TEM passos (a ordem deles é
        // asseverada em full_disk_access.rs, onde os passos são declarados).
        #[cfg(target_os = "macos")]
        assert!(!repair_steps(SystemPreconditionId::FullDiskAccess, "app.codm.desktop").is_empty());
    }

    /// O binário de teste vive em `target/debug/deps/`, fora de qualquer `.app` — exatamente a
    /// mesma forma que `tauri dev` tem (`target/debug/codm-desktop`, também sem `.app` ancestral).
    /// É por isso que este teste pode assertar `false` sem consultar variável de ambiente nenhuma:
    /// o fato é o caminho do executável, não o perfil de build.
    #[test]
    fn has_attributable_identity_is_false_for_the_test_harness_binary() {
        assert!(!has_attributable_identity());
    }

    /// Asserção de registro, como `every_system_precondition_declares_at_least_one_platform`: o `match`
    /// exaustivo (sem `_`) garante em tempo de compilação que toda variante de `RepairScope` segue
    /// coberta se `repair_scope` crescer — e o loop garante que TODA pré-condição do registro tem
    /// um valor válido.
    #[test]
    fn every_system_precondition_declares_a_repair_scope() {
        for system_precondition in SYSTEM_PRECONDITIONS {
            match system_precondition.repair_scope {
                RepairScope::AppGrant | RepairScope::Standalone => {}
            }
        }
    }

    /// A situação de quem roda `cargo test` é a mesma de `tauri dev`: sem `.app` ancestral, logo
    /// sem identidade atribuível. FDA declara `RepairScope::AppGrant`, então `statuses()` tem que
    /// reportar `NoAppIdentity` para ela — nunca `Available`, que seria a mesma mentira que a spec
    /// pede para não contar.
    #[test]
    fn statuses_reports_no_app_identity_for_fda_without_a_bundle() {
        #[cfg(target_os = "macos")]
        {
            let reported = statuses();
            let fda = reported
                .iter()
                .find(|s| s.id == SystemPreconditionId::FullDiskAccess)
                .expect("FDA é aplicável no macOS");
            assert_eq!(fda.repair, RepairAvailability::NoAppIdentity);
        }
    }

    /// `run_repair` recusa ANTES de montar `Command::new` — o teste passa mesmo sem `tccutil` no
    /// PATH do runner, porque nenhum processo chega a ser criado.
    #[test]
    fn run_repair_refuses_without_spawning_when_no_app_identity() {
        #[cfg(target_os = "macos")]
        {
            let result = run_repair(SystemPreconditionId::FullDiskAccess, "app.codm.desktop");
            assert!(result.is_err(), "sem identidade de app, o reparo tem que recusar");
        }
    }
}
