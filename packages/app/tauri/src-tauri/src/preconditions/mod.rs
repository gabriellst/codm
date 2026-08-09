//! PRÉ-CONDIÇÕES DO AMBIENTE — o registro, e a única coisa que muda para somar a próxima.
//!
//! Uma pré-condição é um módulo com responsabilidades DECLARADAS: em que plataformas ela existe,
//! como detectá-la e como repará-la. `PRECONDITIONS` lista os módulos; somar uma é criar um arquivo
//! e acrescentar uma linha aqui — nenhum módulo existente muda (spec Decision 2).
//!
//! PLATAFORMA É CAMPO, NÃO `#[cfg]`, e a razão é o contrato: as bindings do tauri-specta são
//! geradas no mac e COMMITADAS (`../commands/bindings.ts`). Se o enum `PreconditionId` encolhesse
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
pub enum PreconditionId {
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

/// O módulo. Três responsabilidades declaradas + onde ele vale.
pub struct Precondition {
    pub id: PreconditionId,
    /// Onde ela EXISTE. Nunca vazio (asseverado).
    pub platforms: &'static [Platform],
    /// A sonda. `true` = satisfeita.
    pub probe: fn() -> bool,
    /// Os passos, EM ORDEM, dado o bundle id do app (o alvo do `tccutil`).
    pub repair: fn(&str) -> Vec<RepairStep>,
}

/// O REGISTRO. Somar uma pré-condição = um arquivo + uma linha aqui.
///
/// `static` e não `const`: um `const` é inlinado em cada uso, então `PRECONDITIONS.iter()` tomaria
/// emprestado um temporário e `applicable()` não poderia devolver `&'static Precondition`. Um
/// `static` tem endereço estável, que é exatamente o que o iterador precisa emprestar.
pub static PRECONDITIONS: &[Precondition] = &[full_disk_access::PRECONDITION];

/// O que vale nesta máquina — lookup uniforme sobre o campo declarado.
pub fn applicable() -> impl Iterator<Item = &'static Precondition> {
    PRECONDITIONS
        .iter()
        .filter(|p| p.platforms.contains(&current_platform()))
}

/// O que atravessa para o console. Só os aplicáveis.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct PreconditionStatus {
    pub id: PreconditionId,
    pub satisfied: bool,
}

pub fn statuses() -> Vec<PreconditionStatus> {
    applicable()
        .map(|p| PreconditionStatus {
            id: p.id,
            satisfied: (p.probe)(),
        })
        .collect()
}

pub fn repair_steps(id: PreconditionId, bundle_id: &str) -> Vec<RepairStep> {
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
pub fn run_repair(id: PreconditionId, bundle_id: &str) -> Result<(), String> {
    for step in repair_steps(id, bundle_id) {
        let status = std::process::Command::new(step.program)
            .args(&step.args)
            .status()
            .map_err(|e| format!("precondition repair: `{}` não iniciou: {e}", step.program))?;
        log::info!(
            "[preconditions] {} {:?} -> {status}",
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
    fn every_precondition_declares_at_least_one_platform() {
        for precondition in PRECONDITIONS {
            assert!(
                !precondition.platforms.is_empty(),
                "{:?} não declara plataforma nenhuma",
                precondition.id
            );
        }
    }

    /// O filtro é por CAMPO DECLARADO, não por `#[cfg]`: o registro é o mesmo em todo alvo e o que
    /// muda é quem passa por `applicable()`. É isso que mantém o union de ids estável nas bindings.
    #[test]
    fn applicable_filters_by_the_declared_platform_field() {
        let ids: Vec<PreconditionId> = applicable().map(|p| p.id).collect();

        #[cfg(target_os = "macos")]
        assert_eq!(ids, vec![PreconditionId::FullDiskAccess]);

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
        let reported: Vec<PreconditionId> = statuses().into_iter().map(|s| s.id).collect();
        let expected: Vec<PreconditionId> = applicable().map(|p| p.id).collect();
        assert_eq!(reported, expected);
    }

    /// Um id que não é aplicável não tem reparo — e pedir o reparo dele devolve uma lista vazia em
    /// vez de estourar. O console é quem manda o id, e o console é código que pode estar mais novo
    /// (ou mais velho) que este binário.
    #[test]
    fn repair_steps_of_a_non_applicable_id_are_empty() {
        #[cfg(not(target_os = "macos"))]
        assert!(repair_steps(PreconditionId::FullDiskAccess, "app.codm.desktop").is_empty());

        // No macOS o id É aplicável — a asserção equivalente é que ele TEM passos (a ordem deles é
        // asseverada em full_disk_access.rs, onde os passos são declarados).
        #[cfg(target_os = "macos")]
        assert!(!repair_steps(PreconditionId::FullDiskAccess, "app.codm.desktop").is_empty());
    }
}
