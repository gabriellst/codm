# Pré-condições do app como conjunto extensível — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** O operador nunca mais fica diante de um app que abre e não funciona sem saber por quê — quando falta uma pré-condição do ambiente, o app diz qual é, explica por que ela importa e oferece o reparo em um clique.

**Architecture:** O shell Rust ganha um REGISTRO de pré-condições (`preconditions/`), cada uma um módulo que declara em que plataformas existe (`platforms`, campo — nunca `#[cfg]`, para o union de ids permanecer estável nas bindings commitadas), como sondar e como reparar. Dois comandos tauri-specta expõem isso ao console, que os consome atrás da porta `PreconditionsService` (impls Tauri + Browser, a mesma forma do `SupervisionService`). Um store alimentado pelo `PreconditionsGate` (montado no `__root`, re-sonda no `focus` da janela) é lido tanto pelo redirect quanto pelo slide de onboarding, que resolve o componente de cada pendência por um `Record<PreconditionId, …>` exaustivo.

**Tech Stack:** Rust (Tauri v2 + tauri-specta + specta), TypeScript, Bun, React, TanStack Router, Zustand, Tailwind

**Spec:** .specs/2026-08-08-preconditions-do-app-design.md
**Tasks:** 5
**Estimated minutes:** 240

---

## Task T1: O shell responde se uma pré-condição do ambiente está satisfeita

**Files to write:**
- Create: `packages/app/tauri/src-tauri/src/preconditions/mod.rs`
- Create: `packages/app/tauri/src-tauri/src/preconditions/full_disk_access.rs`
- Create: `packages/app/tauri/src-tauri/src/commands/preconditions.rs`
- Modify: `packages/app/tauri/src-tauri/src/commands/mod.rs` — declara `mod preconditions; pub use preconditions::*;` e acrescenta `precondition_statuses, repair_precondition` ao `collect_commands!`
- Modify: `packages/app/tauri/src-tauri/src/lib.rs` — acrescenta `mod preconditions;` à lista de módulos
- Regen: `packages/app/tauri/commands/bindings.ts`

**Files to read:**
- `packages/app/tauri/src-tauri/src/commands/supervision.rs`
- `packages/app/tauri/src-tauri/src/sidecars/supervision.rs`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /desktop-shell
**Depends on:** (none)
**Consumes (frozen):** nada de camadas anteriores — esta Task É o contrato. Ela CONGELA, para as Tasks seguintes: o nome de comando `precondition_statuses` (binding `commands.preconditionStatuses()`, retorno `PreconditionStatus[]`), o nome de comando `repair_precondition` (binding `commands.repairPrecondition(id)`, retorno `Result<null, string>`), o tipo `PreconditionStatus = { id: PreconditionId; satisfied: boolean }` e o union `PreconditionId = "FULL_DISK_ACCESS"`. Grafe esses identificadores exatamente assim — as Tasks T2–T5 importam-nos verbatim.
**Scope fence:** OUT — nenhum arquivo em `packages/app/react/` é tocado aqui (T2 cria a porta), `packages/app/tauri/config/capabilities.ts` é de T2, e o `bun desktop:generate` também. DONE elsewhere — nada; esta é a Task raiz.
**Gate:** `cd packages/app/tauri/src-tauri && cargo test` (verde E tendo reescrito `../commands/bindings.ts`), depois `cd packages/app/react && bun x tsc --noEmit`.

### Step T1.1 — Escreva o registro com seus testes falhando

Crie `packages/app/tauri/src-tauri/src/preconditions/mod.rs` com APENAS o bloco de testes abaixo por enquanto (o corpo entra em T1.3); rodar agora deve falhar por símbolos inexistentes.

```rust
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
```

### Step T1.2 — Escreva a sonda do Acesso Total ao Disco com seus testes falhando

Crie `packages/app/tauri/src-tauri/src/preconditions/full_disk_access.rs` com APENAS o bloco de testes abaixo por enquanto.

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Error, ErrorKind, Write};
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
    #[test]
    fn an_unreadable_file_reports_unsatisfied() {
        let path = std::env::temp_dir().join("codm-precondition-probe-unreadable");
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
        let path = std::env::temp_dir().join("codm-precondition-probe-readable");
        std::fs::write(&path, b"x").expect("criar o arquivo de sonda");

        let verdict = satisfied_from(open(&path));

        std::fs::remove_file(&path).ok();
        assert!(verdict);
    }

    /// AC-6 — a ORDEM, lida da lista, sem executar nada. Conceder sem limpar não funciona quando a
    /// negação já foi gravada, então o `tccutil reset` tem que vir primeiro; declarar os passos como
    /// dado é o que permite provar isso sem tocar no TCC da máquina que roda o teste.
    #[test]
    fn repair_resets_tcc_before_opening_settings() {
        let steps = repair("app.codm.desktop");

        assert_eq!(steps.len(), 2, "o reparo é exatamente dois passos");
        assert_eq!(steps[0].program, "tccutil");
        assert_eq!(
            steps[0].args,
            vec!["reset", "SystemPolicyAllFiles", "app.codm.desktop"]
        );
        assert_eq!(steps[1].program, "open");
        assert_eq!(steps[1].args, vec![SETTINGS_URL]);
    }

    /// O bundle id ENTRA — não é literal. `tccutil` apagando a entrada de outro app seria uma
    /// limpeza silenciosa que não conserta nada e mexe onde não devia.
    #[test]
    fn repair_targets_the_bundle_id_it_was_given() {
        let steps = repair("com.example.other");
        assert_eq!(steps[0].args[2], "com.example.other");
    }
}
```

### Step T1.3 — Rode os testes para vê-los falhar

Run: `cd packages/app/tauri/src-tauri && cargo test preconditions`
Expected: FAIL na compilação — `cannot find function 'satisfied_from' in this scope`, `cannot find value 'PRECONDITIONS' in this scope`.

### Step T1.4 — Proposed file (o registro)

```rust
// packages/app/tauri/src-tauri/src/preconditions/mod.rs — COMPLETE final file.
// Mantenha o bloco `#[cfg(test)] mod tests` do Step T1.1 ao final deste arquivo.
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
```

### Step T1.5 — Proposed file (a sonda do FDA)

```rust
// packages/app/tauri/src-tauri/src/preconditions/full_disk_access.rs — COMPLETE final file.
// Mantenha o bloco `#[cfg(test)] mod tests` do Step T1.2 ao final deste arquivo.
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

use super::{Platform, Precondition, PreconditionId, RepairStep};

pub const PRECONDITION: Precondition = Precondition {
    id: PreconditionId::FullDiskAccess,
    platforms: &[Platform::Macos],
    probe,
    repair,
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
fn repair(bundle_id: &str) -> Vec<RepairStep> {
    vec![
        RepairStep {
            program: "tccutil",
            args: vec![
                "reset".into(),
                "SystemPolicyAllFiles".into(),
                bundle_id.into(),
            ],
        },
        RepairStep {
            program: "open",
            args: vec![SETTINGS_URL.into()],
        },
    ]
}
```

### Step T1.6 — Proposed file (os comandos)

```rust
// packages/app/tauri/src-tauri/src/commands/preconditions.rs — COMPLETE final file.
//! Pré-condições — o PULL (`precondition_statuses`) e a única ação que o operador pode tomar
//! (`repair_precondition`).
//!
//! Mesmo raciocínio de `commands/supervision.rs`: um push só alcança quem já estava montado, e
//! quem abre o app com a permissão revogada é exatamente quem precisa saber. Então o console
//! PERGUNTA — e volta a perguntar quando a janela reganha foco, que é como ele descobre que o
//! operador acabou de conceder a permissão nos Ajustes.

use crate::preconditions::{self, PreconditionId, PreconditionStatus};

#[tauri::command]
#[specta::specta]
pub fn precondition_statuses() -> Vec<PreconditionStatus> {
    preconditions::statuses()
}

/// O bundle id NÃO é literal aqui: sai de `config().identifier`, o mesmo valor de onde `lib.rs`
/// deriva o data dir. `tccutil` apagando a entrada de outro app seria uma limpeza silenciosa que
/// não conserta nada e mexe onde não devia.
#[tauri::command]
#[specta::specta]
pub fn repair_precondition(app: tauri::AppHandle, id: PreconditionId) -> Result<(), String> {
    preconditions::run_repair(id, &app.config().identifier)
}
```

### Step T1.7 — Registre o módulo e os comandos

Modifique `packages/app/tauri/src-tauri/src/lib.rs`: na lista de `mod` (que hoje tem `api`, `commands`, `crash`, `sidecars`, `updater`), acrescente `mod preconditions;` em ordem alfabética — entre `mod crash;` e `mod sidecars;`.

Modifique `packages/app/tauri/src-tauri/src/commands/mod.rs`: depois do bloco `mod boot; pub use boot::*;`, acrescente

```rust
mod preconditions;
pub use preconditions::*;
```

e, dentro do `collect_commands![...]`, acrescente `precondition_statuses` e `repair_precondition` ao final da lista (depois de `restart_for_update`).

### Step T1.8 — Rode os testes e regenere as bindings

Run: `cd packages/app/tauri/src-tauri && cargo test`
Expected: PASS — todos os testes de `preconditions` verdes, e o teste `export_bindings::export_typescript_bindings` reescreve `packages/app/tauri/commands/bindings.ts`.

Confirme que as bindings ganharam o contrato congelado:

```bash
grep -n "preconditionStatuses\|repairPrecondition\|PreconditionId\|PreconditionStatus" packages/app/tauri/commands/bindings.ts
```

Expected: `async preconditionStatuses() : Promise<PreconditionStatus[]>`, `async repairPrecondition(id: PreconditionId) : Promise<Result<null, string>>`, `export type PreconditionId = "FULL_DISK_ACCESS"`, `export type PreconditionStatus = { id: PreconditionId; satisfied: boolean }`.

Se `PreconditionId` NÃO tiver saído como `"FULL_DISK_ACCESS"`, o `#[serde(rename_all = "SCREAMING_SNAKE_CASE")]` não foi honrado — corrija o derive (não o consumidor) e rode `cargo test` de novo.

### Step T1.9 — Type check do console contra as bindings novas

Run: `cd packages/app/react && bun x tsc --noEmit`
Expected: 0 erros — as bindings novas ainda não têm consumidor, então nada quebra.

### Step T1.10 — Commit

```bash
git add packages/app/tauri/src-tauri/src/preconditions/ \
        packages/app/tauri/src-tauri/src/commands/preconditions.rs \
        packages/app/tauri/src-tauri/src/commands/mod.rs \
        packages/app/tauri/src-tauri/src/lib.rs \
        packages/app/tauri/commands/bindings.ts
git commit -m "feat(desktop-shell): registro de pré-condições do ambiente + sonda do Acesso Total ao Disco (Task T1)"
```

---

## Task T2: O console consulta as pré-condições por uma porta, e o browser degrada honestamente

**Files to write:**
- Create: `packages/app/react/src/services/PreconditionsService/PreconditionsService.ts`
- Create: `packages/app/react/src/services/PreconditionsService/TauriPreconditionsService.ts`
- Create: `packages/app/react/src/services/PreconditionsService/BrowserPreconditionsService.ts`
- Modify: `packages/app/react/src/services/tokens.ts` — acrescenta `PreconditionsToken`
- Modify: `packages/app/react/src/services/registry/tauri.ts` — acrescenta o par `[PreconditionsToken, TauriPreconditionsService]`
- Modify: `packages/app/react/src/services/registry/browser.ts` — acrescenta o par `[PreconditionsToken, BrowserPreconditionsService]`
- Modify: `packages/app/react/src/services/registry/test.ts` — acrescenta `FakePreconditionsService` e o par `[PreconditionsToken, FakePreconditionsService]`
- Modify: `packages/app/react/src/services/hooks/index.ts` — acrescenta `usePreconditions`
- Modify: `packages/app/react/src/services/index.ts` — reexporta token, hook e tipos da porta
- Modify: `packages/app/tauri/config/capabilities.ts` — acrescenta a chave `preconditions: []` e o item `'preconditions'` em `CAPABILITIES`
- Test: `packages/app/react/src/services/PreconditionsService/BrowserPreconditionsService.test.ts`

**Files to read:**
- `packages/app/react/src/services/SupervisionService/SupervisionService.ts`
- `packages/app/react/src/services/SecretsService/TauriSecretsService.ts`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /desktop-shell
**Depends on:** T1
**Consumes (frozen):** de T1, verbatim — `commands.preconditionStatuses()` (retorna `PreconditionStatus[]`), `commands.repairPrecondition(id)` (retorna `Result<null, string>`, desembrulhado com `res.status === 'error'` exatamente como `TauriSecretsService` faz), e o union `PreconditionId = "FULL_DISK_ACCESS"`. Importe `commands` de `@codm/app-tauri/commands`. Esta Task CONGELA para T3–T5: o token `PreconditionsToken`, o hook `usePreconditions()`, a interface `PreconditionsService { statuses(): Promise<PreconditionStatus[]>; repair(id: PreconditionId): Promise<void> }`, as constantes `PRECONDITION_IDS` / tipo `PreconditionId`, e a classe de teste `FakePreconditionsService`.
**Scope fence:** DONE elsewhere (consuma, nunca redefina) — os comandos e tipos Rust de T1; NÃO reescreva o `bindings.ts`. OUT — o store, o gate e qualquer UI (T3/T4/T5 os criam); nenhum arquivo em `routes/` é tocado aqui.
**Gate:** `cd packages/app/react && bun x tsc --noEmit && bun test src/services/PreconditionsService/BrowserPreconditionsService.test.ts` e `bun test packages/app/tauri/config`.

### Step T2.1 — Escreva o teste da degradação no browser (AC-7)

```typescript
// packages/app/react/src/services/PreconditionsService/BrowserPreconditionsService.test.ts
import { describe, expect, it } from 'bun:test'
import { BrowserPreconditionsService } from './BrowserPreconditionsService'

/**
 * A DEGRADAÇÃO HONESTA AQUI NÃO É OTIMISMO — é a MESMA resposta que o lookup do host daria.
 * Nenhuma pré-condição declara o browser entre suas plataformas, então o conjunto aplicável é
 * vazio, e um conjunto vazio de pendências é o que ele é. Um `statuses()` que inventasse uma
 * pendência faria o console web exibir um slide pedindo uma permissão do macOS a quem está numa
 * aba — a versão de UI de "fingir uma capacidade de desktop" (desktop-shell DSK-03).
 */
describe('BrowserPreconditionsService', () => {
	it('AC-7: não reporta pré-condição nenhuma — o conjunto aplicável a uma aba é vazio', async () => {
		const service = new BrowserPreconditionsService()
		expect(await service.statuses()).toEqual([])
	})

	it('AC-7: repair é inerte — nada para reparar num host que não tem a pré-condição', async () => {
		const service = new BrowserPreconditionsService()
		expect(await service.repair('FULL_DISK_ACCESS')).toBeUndefined()
	})
})
```

### Step T2.2 — Rode o teste para vê-lo falhar

Run: `cd packages/app/react && bun test src/services/PreconditionsService/BrowserPreconditionsService.test.ts`
Expected: FAIL — `Cannot find module './BrowserPreconditionsService'`.

### Step T2.3 — Proposed file (a porta)

```typescript
// packages/app/react/src/services/PreconditionsService/PreconditionsService.ts — COMPLETE final file
/**
 * PRÉ-CONDIÇÕES PORT — o ambiente desta máquina permite que o app funcione?
 *
 * O console NÃO pode responder isso sozinho, e é essa a razão de ser uma porta em vez de uma
 * verificação num hook: quem observa é quem tem acesso. A webview não tem sistema de arquivos, não
 * tem processo próprio e não tem como tentar a leitura cujo resultado É o veredito. O host tenta;
 * o console consome.
 *
 * O CONJUNTO REPORTADO JÁ VEM FILTRADO por plataforma — cada pré-condição declara em que hosts ela
 * existe, e `statuses()` devolve só as aplicáveis a este. Por isso a UI nunca precisa perguntar em
 * que plataforma está: um host onde a pré-condição não existe simplesmente não a reporta
 * (desktop-shell bp-02 — ramifique no que a porta REPORTA, nunca no nome do host).
 *
 * Tipos puros, sem SDK de plataforma — como toda porta aqui, esta é a forma que uma implementação
 * expo/nativa futura satisfaria verbatim. `PreconditionId` é declarado à mão (e não importado das
 * bindings) pela mesma razão que `SupervisedSidecar`: a porta não conhece tauri. A implementação
 * Tauri é onde os dois se encontram, e é lá que uma divergência de nome para de compilar.
 */

/** Os ids conhecidos. Estrutura o mapa exaustivo de componentes no onboarding (spec Decision 3). */
export const PRECONDITION_IDS = ['FULL_DISK_ACCESS'] as const

export type PreconditionId = (typeof PRECONDITION_IDS)[number]

export interface PreconditionStatus {
	id: PreconditionId
	satisfied: boolean
}

export interface PreconditionsService {
	/** O estado agora (PULL). Só as pré-condições APLICÁVEIS a este host aparecem. */
	statuses(): Promise<PreconditionStatus[]>
	/**
	 * O reparo. Os passos e — sobretudo — a ORDEM deles pertencem ao host: o console pede "repare
	 * isto", não "rode tccutil e depois abra os Ajustes". Se a sequência mudar, muda no host.
	 */
	repair(id: PreconditionId): Promise<void>
}
```

### Step T2.4 — Proposed file (implementação Tauri)

```typescript
// packages/app/react/src/services/PreconditionsService/TauriPreconditionsService.ts — COMPLETE final file
import { commands } from '@codm/app-tauri/commands'
import type { PreconditionId, PreconditionStatus, PreconditionsService } from './PreconditionsService'

/**
 * O host, tipado ponta a ponta por tauri-specta (packages/app/tauri/commands/bindings.ts — nome do
 * comando, argumentos e retorno vêm do Rust em src-tauri/src/preconditions/). Sem `invoke`
 * stringly: renomeie o id no Rust e ESTE arquivo para de compilar, porque o `PreconditionStatus[]`
 * gerado deixa de ser atribuível ao da porta. É esse o trilho contra deriva entre os dois lados.
 *
 * `commands.repairPrecondition` devolve `Result<null, string>` — um `error` é falha de spawn no
 * host (o binário do passo não existe), e isso precisa chegar ao operador em vez de sumir; mesmo
 * desembrulho que `TauriSecretsService` faz.
 */
export class TauriPreconditionsService implements PreconditionsService {
	async statuses(): Promise<PreconditionStatus[]> {
		return await commands.preconditionStatuses()
	}

	async repair(id: PreconditionId): Promise<void> {
		const res = await commands.repairPrecondition(id)
		if (res.status === 'error') throw new Error(res.error)
	}
}
```

### Step T2.5 — Proposed file (implementação Browser)

```typescript
// packages/app/react/src/services/PreconditionsService/BrowserPreconditionsService.ts — COMPLETE final file
import type { PreconditionId, PreconditionStatus, PreconditionsService } from './PreconditionsService'

/**
 * DEGRADAÇÃO HONESTA, e vale ser preciso sobre por que "nada pendente" é a VERDADE aqui e não um
 * default otimista: uma aba de browser não tem nenhuma das pré-condições. Elas são fatos de hosts
 * nativos, e cada uma declara em que plataformas existe — o conjunto aplicável a uma aba é vazio,
 * então a lista vazia é a mesma resposta que o lookup do host daria, não uma exceção codificada
 * aqui. Reportar uma pendência faria o console web exibir um slide pedindo uma permissão do macOS a
 * quem nunca vai ver essa tela de Ajustes.
 *
 * `repair` é inerte pela mesma razão: não há nada para reparar num host onde a pré-condição não
 * existe, e a UI que chamaria isto nunca é renderizada aqui.
 */
export class BrowserPreconditionsService implements PreconditionsService {
	async statuses(): Promise<PreconditionStatus[]> {
		return []
	}

	async repair(_id: PreconditionId): Promise<void> {
		return undefined
	}
}
```

### Step T2.6 — Ligue o token, os registries, o hook e os exports

Modifique `packages/app/react/src/services/tokens.ts`: acrescente `import type { PreconditionsService } from './PreconditionsService/PreconditionsService'` junto aos demais imports de tipo e, depois de `export const NotificationToken = ...`, a linha

```typescript
export const PreconditionsToken = token<PreconditionsService>('PreconditionsService')
```

Modifique `packages/app/react/src/services/registry/tauri.ts`: acrescente `PreconditionsToken` à lista de imports de `../tokens`, `import { TauriPreconditionsService } from '../PreconditionsService/TauriPreconditionsService'`, e o par `[PreconditionsToken, TauriPreconditionsService],` ao final do record (antes de `[AnalyticsToken, AnalyticsServiceImpl]`).

Modifique `packages/app/react/src/services/registry/browser.ts`: o mesmo, com `BrowserPreconditionsService`.

Modifique `packages/app/react/src/services/registry/test.ts`: acrescente `PreconditionsToken` aos imports de `../tokens`, `import type { PreconditionId, PreconditionStatus, PreconditionsService } from '../PreconditionsService/PreconditionsService'`, a classe abaixo junto das demais Fakes, e o par `[PreconditionsToken, FakePreconditionsService],` ao final do record.

```typescript
/**
 * Semeado com o que uma máquina reportaria no mount (o PULL), e `set` reencena o que muda quando o
 * operador volta dos Ajustes — as duas metades que um consumidor de pré-condição tem que acertar,
 * do mesmo jeito que `FakeSupervisionService` expõe PULL e PUSH em vez de só o fácil. `repaired`
 * registra as chamadas porque "o botão realmente pediu o reparo" é a asserção que interessa: um
 * teste não pode executar `tccutil`.
 */
export class FakePreconditionsService implements PreconditionsService {
	readonly repaired: PreconditionId[] = []
	constructor(private current: PreconditionStatus[] = []) {}

	async statuses(): Promise<PreconditionStatus[]> {
		return this.current
	}

	async repair(id: PreconditionId): Promise<void> {
		this.repaired.push(id)
	}

	/** Reencena o que a sonda passaria a reportar — como o host faria depois de uma concessão. */
	set(statuses: PreconditionStatus[]): void {
		this.current = statuses
	}
}
```

Modifique `packages/app/react/src/services/hooks/index.ts`: acrescente `PreconditionsToken` aos imports de `../tokens`, `import type { PreconditionsService } from '../PreconditionsService/PreconditionsService'`, e a linha

```typescript
export const usePreconditions = (): PreconditionsService => useService(PreconditionsToken)
```

Modifique `packages/app/react/src/services/index.ts`: acrescente `usePreconditions` à lista exportada de `./hooks`, `PreconditionsToken` à de `./tokens`, e a linha de tipos

```typescript
export { PRECONDITION_IDS } from './PreconditionsService/PreconditionsService'
export type { PreconditionId, PreconditionStatus, PreconditionsService } from './PreconditionsService/PreconditionsService'
```

### Step T2.7 — Declare a capability

Modifique `packages/app/tauri/config/capabilities.ts`: depois da entrada `logging: ['log:default'],`, acrescente

```typescript
	// PRÉ-CONDIÇÕES (contract: PreconditionsService) — respaldada pelos comandos custom
	// `precondition_statuses` / `repair_precondition` (src-tauri/src/commands/preconditions.rs), que
	// `core:default` já cobre por serem `invoke`. Os passos de reparo são `std::process::Command` do
	// lado Rust, não o plugin de shell, então nenhuma permissão de `shell:*` entra aqui.
	preconditions: [],
```

e acrescente `'preconditions',` ao final do array `CAPABILITIES` (depois de `'logging'`).

### Step T2.8 — Regenere a config do shell

Run: `bun desktop:generate`
Expected: sem erro; `packages/app/tauri/src-tauri/capabilities/default.json` fica inalterado (a lista de permissões da chave é vazia, então nada novo é emitido).

### Step T2.9 — Rode os testes

Run: `cd packages/app/react && bun test src/services/PreconditionsService/BrowserPreconditionsService.test.ts`
Expected: PASS — 2 testes.

Run: `bun test packages/app/tauri/config`
Expected: PASS — os rails DSK do `generate.test.ts` seguem verdes com a capability nova.

### Step T2.10 — Type check + lint

Run: `cd packages/app/react && bun x tsc --noEmit` e depois, da raiz, `bun lint`
Expected: 0 erros.

### Step T2.11 — Commit

```bash
git add packages/app/react/src/services/PreconditionsService/ \
        packages/app/react/src/services/tokens.ts \
        packages/app/react/src/services/registry/ \
        packages/app/react/src/services/hooks/index.ts \
        packages/app/react/src/services/index.ts \
        packages/app/tauri/config/capabilities.ts
git commit -m "feat(services): porta PreconditionsService com impls Tauri e Browser (Task T2)"
```

---

## Task T3: Uma pendência leva o operador ao /onboarding, e some sozinha quando ele volta dos Ajustes

**Files to write:**
- Create: `packages/app/react/src/stores/usePreconditionsStore.ts`
- Create: `packages/app/react/src/components/console/PreconditionsGate.tsx`
- Create: `packages/app/react/src/components/console/PreconditionsGate.test.tsx`
- Modify: `packages/app/react/src/routes/__root.tsx` — monta `<PreconditionsGate />` dentro do `ServicesProvider`, ao lado de `<DeepLinkAuthListener />`

**Files to read:**
- `packages/app/react/src/components/console/SupervisionGate.tsx`
- `packages/app/react/src/components/console/SupervisionGate.test.tsx`
- `packages/app/react/src/stores/useCloudSessionStore.ts`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /store, /component, /desktop-shell
**Depends on:** T2
**Consumes (frozen):** de T2, verbatim — `usePreconditions()` e os tipos `PreconditionId` / `PreconditionStatus` de `@/services`; `FakePreconditionsService` e o default export `testBindings` de `@/services/registry/test`; `PreconditionsToken` de `@/services/tokens`; `Container` de `@/services`. Esta Task CONGELA para T4/T5: o store `usePreconditionsStore` com o campo `pending: PreconditionId[] | null` (onde `null` significa "ainda não sondado") e as ações `apply(statuses)` / `reset()`.
**Scope fence:** DONE elsewhere (consuma, nunca refaça) — a porta e o Fake de T2, os comandos Rust de T1. OUT — nenhum componente de `routes/onboarding/` é criado ou alterado aqui (T4 e T5 fazem isso); este gate só redireciona, não renderiza UI de pré-condição.
**Gate:** `cd packages/app/react && bun x tsc --noEmit && bun test src/components/console/PreconditionsGate.test.tsx`.

### Step T3.1 — Escreva o teste do gate

```tsx
// packages/app/react/src/components/console/PreconditionsGate.test.tsx
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { type Bindings, Container, ServicesProvider } from '@/services'
import type { PreconditionStatus } from '@/services'
import testBindings, { FakePreconditionsService } from '@/services/registry/test'
import { PreconditionsToken } from '@/services/tokens'
import { usePreconditionsStore } from '@/stores/usePreconditionsStore'
import { PreconditionsGate } from './PreconditionsGate'

/**
 * A PERGUNTA É "PARA ONDE O OPERADOR FOI", e ela só tem resposta num router de verdade — por isso
 * estes casos montam um `createMemoryHistory` em vez de espionar `useNavigate`. Um spy provaria que
 * chamamos a função; só o histórico prova que a tela mudou.
 *
 * Cada caso também assevera que os filhos do gate estão no DOM: sem isso a suíte seria vazia na pior
 * direção possível — um gate que nunca renderizasse nada passaria por "não redirecionou".
 */

function containerWith(statuses: PreconditionStatus[]): { container: Container; fake: FakePreconditionsService } {
	class Seeded extends FakePreconditionsService {
		constructor() {
			super(statuses)
		}
	}
	const container = new Container()
	container.load(testBindings)
	container.load([[PreconditionsToken, Seeded]] as unknown as Bindings)
	return { container, fake: container.resolve(PreconditionsToken) as FakePreconditionsService }
}

function routerAt(pathname: string, container: Container) {
	const rootRoute = createRootRoute({
		component: () => (
			<ServicesProvider container={container}>
				<PreconditionsGate />
				<div data-testid="console">console</div>
			</ServicesProvider>
		),
	})
	const dashboard = createRoute({ getParentRoute: () => rootRoute, path: '/dashboard', component: () => null })
	const onboarding = createRoute({ getParentRoute: () => rootRoute, path: '/onboarding', component: () => null })
	return createRouter({
		routeTree: rootRoute.addChildren([dashboard, onboarding]),
		history: createMemoryHistory({ initialEntries: [pathname] }),
	})
}

describe('PreconditionsGate', () => {
	let root: Root | null = null
	let host: HTMLDivElement

	beforeEach(() => {
		host = document.createElement('div')
		document.body.appendChild(host)
		usePreconditionsStore.getState().reset()
	})

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host.remove()
	})

	async function mount(pathname: string, container: Container) {
		const router = routerAt(pathname, container)
		await act(async () => {
			root = createRoot(host)
			root.render(<RouterProvider router={router} />)
		})
		// Deixa o PULL do gate assentar antes de qualquer asserção sobre a rota.
		await act(async () => {
			await Promise.resolve()
		})
		return router
	}

	it('AC-3: com uma pendência, leva o operador ao /onboarding', async () => {
		const { container } = containerWith([{ id: 'FULL_DISK_ACCESS', satisfied: false }])
		const router = await mount('/dashboard', container)

		expect(host.querySelector('[data-testid="console"]')).not.toBeNull()
		expect(router.state.location.pathname).toBe('/onboarding')
	})

	it('AC-3: com tudo satisfeito, não retém nem move o operador', async () => {
		const { container } = containerWith([{ id: 'FULL_DISK_ACCESS', satisfied: true }])
		const router = await mount('/dashboard', container)

		expect(host.querySelector('[data-testid="console"]')).not.toBeNull()
		expect(router.state.location.pathname).toBe('/dashboard')
		expect(usePreconditionsStore.getState().pending).toEqual([])
	})

	it('AC-4: o gatilho é o conjunto de pendências, não uma flag de "já visto"', async () => {
		// Segunda montagem com a MESMA pendência: se houvesse flag persistida, esta não redirecionaria.
		const first = containerWith([{ id: 'FULL_DISK_ACCESS', satisfied: false }])
		const firstRouter = await mount('/dashboard', first.container)
		expect(firstRouter.state.location.pathname).toBe('/onboarding')

		act(() => root?.unmount())
		root = null
		usePreconditionsStore.getState().reset()

		const second = containerWith([{ id: 'FULL_DISK_ACCESS', satisfied: false }])
		const secondRouter = await mount('/dashboard', second.container)
		expect(secondRouter.state.location.pathname).toBe('/onboarding')
	})

	it('Story 1: ao reganhar foco a sonda roda de novo e a pendência resolvida desaparece', async () => {
		const { container, fake } = containerWith([{ id: 'FULL_DISK_ACCESS', satisfied: false }])
		await mount('/onboarding', container)
		expect(usePreconditionsStore.getState().pending).toEqual(['FULL_DISK_ACCESS'])

		// O operador concedeu a permissão nos Ajustes e voltou para a janela.
		fake.set([{ id: 'FULL_DISK_ACCESS', satisfied: true }])
		await act(async () => {
			window.dispatchEvent(new Event('focus'))
			await Promise.resolve()
		})

		expect(usePreconditionsStore.getState().pending).toEqual([])
	})
})
```

### Step T3.2 — Rode o teste para vê-lo falhar

Run: `cd packages/app/react && bun test src/components/console/PreconditionsGate.test.tsx`
Expected: FAIL — `Cannot find module './PreconditionsGate'`.

### Step T3.3 — Scaffold do store

```bash
bun cli store preconditions --global
```

Confirme que o arquivo saiu em `packages/app/react/src/stores/usePreconditionsStore.ts`; se o scaffolder o tiver colocado em outro lugar, mova-o para lá (é o diretório dos stores cross-rota, ao lado de `useCloudSessionStore.ts`).

### Step T3.4 — Proposed file (o store, escrito por cima do scaffold)

```typescript
// packages/app/react/src/stores/usePreconditionsStore.ts — COMPLETE final file.
// MANTENHA a forma do scaffold: interfaces State/Actions separadas, `initialState` nomeado, e o
// `create<Store>()(set => ({...}))`.
import { create } from 'zustand'
import type { PreconditionId, PreconditionStatus } from '@/services'

/**
 * AS PENDÊNCIAS DO AMBIENTE, com DOIS consumidores em subárvores diferentes — o `PreconditionsGate`
 * (que decide para onde o operador vai) e o slide do onboarding (que decide o que renderizar). É
 * exatamente o caso do store: dois irmãos precisando coordenar sem um pai comum que possa segurar o
 * estado, e um dado que não pertence à URL (não é compartilhável nem sobrevive a nada — é fato da
 * máquina, relido a cada foco).
 *
 * NÃO É PERSISTIDO, e isso é uma decisão e não um esquecimento: a spec (AC-4) proíbe qualquer flag
 * de "já visto" governar a exibição. O gatilho é sempre o conjunto de pendências de AGORA.
 */
interface PreconditionsState {
	/**
	 * `null` = ainda não sondado; `[]` = sondado, nada pendente. A distinção é load-bearing: o gate
	 * não pode redirecionar com base em "ainda não sei", e sem os dois valores "não sondado" seria
	 * indistinguível de "tudo certo" — o operador chegaria ao console por um instante antes de ser
	 * mandado de volta, a cada boot.
	 */
	pending: PreconditionId[] | null
}

interface PreconditionsActions {
	/** Recebe o que a porta reportou e guarda só o que ficou pendente. */
	apply: (statuses: PreconditionStatus[]) => void
	reset: () => void
}

type PreconditionsStore = PreconditionsState & PreconditionsActions

const initialState: PreconditionsState = {
	pending: null,
}

export const usePreconditionsStore = create<PreconditionsStore>()(set => ({
	...initialState,
	apply: statuses => set({ pending: statuses.filter(status => !status.satisfied).map(status => status.id) }),
	reset: () => set(initialState),
}))
```

### Step T3.5 — Proposed file (o gate)

```tsx
// packages/app/react/src/components/console/PreconditionsGate.tsx — COMPLETE final file
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { usePreconditions } from '@/services'
import { usePreconditionsStore } from '@/stores/usePreconditionsStore'

/**
 * O QUE FAZ O APP DIZER QUE NÃO PODE FUNCIONAR — e o que faz essa fala aparecer sem o operador
 * pedir.
 *
 * Ele NÃO segura os filhos, ao contrário do `SupervisionGate`, e a diferença é de natureza: lá o
 * problema é que as requisições sairiam condenadas, então nada podia montar antes da resposta. Aqui
 * o problema é uma permissão do sistema — a UI renderiza perfeitamente, ela só não vai conseguir
 * fazer o trabalho. Segurar a tela por isso trocaria uma tela inútil por uma tela em branco.
 *
 * RE-SONDA NO FOCO, e é isso que fecha a Story 1: conceder a permissão acontece FORA do app, nos
 * Ajustes do macOS. Nada notifica o console. O único sinal disponível de "o operador pode ter feito
 * alguma coisa lá fora" é a janela reganhar foco — então é aí que perguntamos de novo, e a pendência
 * some sozinha sem ninguém apertar "verificar de novo".
 *
 * O `catch` silencioso é o caminho de default-satisfeito: um host que não responde não nos disse
 * nada, e nada não é motivo para mandar o operador para uma tela de permissão.
 */
export function PreconditionsGate() {
	const preconditions = usePreconditions()
	const apply = usePreconditionsStore(state => state.apply)
	const pending = usePreconditionsStore(state => state.pending)
	const pathname = useRouterState({ select: state => state.location.pathname })
	const navigate = useNavigate()

	useEffect(() => {
		let cancelled = false

		const probe = () => {
			void preconditions
				.statuses()
				.then(statuses => {
					if (!cancelled) apply(statuses)
				})
				.catch(() => undefined)
		}

		probe()
		window.addEventListener('focus', probe)

		return () => {
			cancelled = true
			window.removeEventListener('focus', probe)
		}
	}, [preconditions, apply])

	useEffect(() => {
		// `pending === null` é "ainda não sondado" e não decide nada — ver o store.
		if (pending && pending.length > 0 && pathname !== '/onboarding') {
			void navigate({ to: '/onboarding' })
		}
	}, [pending, pathname, navigate])

	return null
}
```

### Step T3.6 — Monte o gate na raiz

Modifique `packages/app/react/src/routes/__root.tsx`: importe `import { PreconditionsGate } from '@/components/console/PreconditionsGate'` junto dos demais imports de `@/components/console`, e renderize `<PreconditionsGate />` imediatamente depois de `<DeepLinkAuthListener />`, com o comentário:

```tsx
{/* Pré-condições do ambiente (spec Decision 6): a rota /onboarding passa a significar "há
    pendência", não "primeira execução". Root-level como o DeepLinkAuthListener porque a
    verificação é do processo — vale de qualquer tela — e porque re-sondar no foco da janela
    precisa estar montado enquanto o operador está nos Ajustes do macOS. */}
<PreconditionsGate />
```

### Step T3.7 — Rode o teste para vê-lo passar

Run: `cd packages/app/react && bun test src/components/console/PreconditionsGate.test.tsx`
Expected: PASS — 4 testes.

### Step T3.8 — Type check + lint

Run: `cd packages/app/react && bun x tsc --noEmit` e, da raiz, `bun lint`
Expected: 0 erros.

### Step T3.9 — Commit

```bash
git add packages/app/react/src/stores/usePreconditionsStore.ts \
        packages/app/react/src/components/console/PreconditionsGate.tsx \
        packages/app/react/src/components/console/PreconditionsGate.test.tsx \
        packages/app/react/src/routes/__root.tsx
git commit -m "feat(console): pendência de pré-condição leva ao onboarding e re-sonda no foco (Task T3)"
```

---

## Task T4: O slide diz qual permissão falta, por que ela importa, e repara em um clique

**Files to write:**
- Create: `packages/app/react/src/routes/onboarding/-components/PreconditionList/index.tsx`
- Create: `packages/app/react/src/routes/onboarding/-components/PreconditionList/index.test.tsx`
- Create: `packages/app/react/src/routes/onboarding/-components/FullDiskAccessCard/index.tsx`
- Create: `packages/app/react/src/routes/onboarding/-components/FullDiskAccessCard/index.test.tsx`
- Create: `packages/app/react/src/routes/onboarding/-components/PreconditionsSlide/index.tsx`
- Create: `packages/app/react/src/routes/onboarding/-components/preconditions.ts`
- Create: `packages/app/react/src/routes/onboarding/-components/preconditions.test.ts`
- Modify: `packages/app/react/src/locales/pt.json` — namespace `preconditions`
- Modify: `packages/app/react/src/locales/en.json` — namespace `preconditions`

**Files to read:**
- `packages/app/react/src/routes/onboarding/-components/ValueSlide/index.tsx`
- `packages/app/react/src/routes/attach/-components/AgentsStep/index.test.tsx`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /component, /desktop-shell
**Depends on:** T3
**Consumes (frozen):** de T2 — `usePreconditions()`, `PRECONDITION_IDS`, tipos `PreconditionId`/`PreconditionStatus` de `@/services`, `FakePreconditionsService` + `testBindings` de `@/services/registry/test`, `PreconditionsToken` de `@/services/tokens`. De T3 — `usePreconditionsStore` de `@/stores/usePreconditionsStore`, com `pending: PreconditionId[] | null`. O id literal a usar é `'FULL_DISK_ACCESS'`. Esta Task CONGELA para T5: o componente `PreconditionsSlide` (export nomeado, `ComponentProps<'div'>`) em `routes/onboarding/-components/PreconditionsSlide`.
**Scope fence:** DONE elsewhere (consuma, nunca refaça) — a porta (T2), o store e o gate (T3), os comandos Rust (T1). NÃO chame `commands.*` daqui: a UI fala com a porta. OUT — `OnboardingFlow/index.tsx` NÃO é tocado nesta Task (T5 o integra), e o `PreconditionsGate` não muda.
**Gate:** `cd packages/app/react && bun x tsc --noEmit && bun test src/routes/onboarding/`.

### Step T4.1 — Escreva os testes falhando

```tsx
// packages/app/react/src/routes/onboarding/-components/PreconditionList/index.test.tsx
import { describe, expect, it } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { PreconditionList, type PreconditionModule } from './index'

/**
 * AC-8 — "somar uma pré-condição ao registro a faz aparecer no fluxo sem editar módulo existente".
 *
 * A prova É este caso: um id INVENTADO, um módulo inventado, e o mesmo componente de lista que o
 * slide usa. Se a lista tivesse conhecimento embutido de quais pré-condições existem (uma cadeia de
 * `if`, um `switch`, um import direto do card), este teste não teria como passar sem alterá-la — e
 * é justamente essa impossibilidade que ele existe para detectar.
 */
describe('PreconditionList', () => {
	it('AC-8: renderiza o componente de uma pré-condição que a lista nunca viu antes', () => {
		type FakeId = 'PRECONDICAO_DE_MENTIRA'
		const modules: Record<FakeId, PreconditionModule<FakeId>> = {
			PRECONDICAO_DE_MENTIRA: {
				id: 'PRECONDICAO_DE_MENTIRA',
				Component: () => <p>cartão inventado no teste</p>,
			},
		}

		const html = renderToString(<PreconditionList pending={['PRECONDICAO_DE_MENTIRA']} modules={modules} />)

		expect(html).toContain('cartão inventado no teste')
	})

	it('não renderiza o que não está pendente', () => {
		type FakeId = 'A' | 'B'
		const modules: Record<FakeId, PreconditionModule<FakeId>> = {
			A: { id: 'A', Component: () => <p>cartão A</p> },
			B: { id: 'B', Component: () => <p>cartão B</p> },
		}

		const html = renderToString(<PreconditionList pending={['A']} modules={modules} />)

		expect(html).toContain('cartão A')
		expect(html).not.toContain('cartão B')
	})
})
```

```typescript
// packages/app/react/src/routes/onboarding/-components/preconditions.test.ts
import { describe, expect, it } from 'bun:test'
import { PRECONDITION_IDS } from '@/services'
import { PRECONDITION_MODULES } from './preconditions'

/**
 * AC-5 — o mapa é EXAUSTIVO sobre o union de ids.
 *
 * A garantia dura é de tipo: `Record<PreconditionId, …>` faz um id sem entrada virar erro de `tsc`,
 * não bug em runtime, e é por isso que o mapa é um Record e não um `Partial` com fallback. Este
 * caso guarda o outro lado — que ninguém acrescente ao mapa uma chave que não é um id (o que
 * compila, e viraria um cartão que nunca renderiza).
 */
describe('PRECONDITION_MODULES', () => {
	it('AC-5: tem exatamente uma entrada por id conhecido', () => {
		expect(Object.keys(PRECONDITION_MODULES).sort()).toEqual([...PRECONDITION_IDS].sort())
	})

	it('cada entrada se declara com o próprio id — o mapa e o módulo não podem discordar', () => {
		for (const [key, module] of Object.entries(PRECONDITION_MODULES)) {
			expect(module.id).toBe(key)
		}
	})
})
```

```tsx
// packages/app/react/src/routes/onboarding/-components/FullDiskAccessCard/index.test.tsx
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/lib/i18n'
import { type Bindings, Container, ServicesProvider } from '@/services'
import testBindings, { FakePreconditionsService } from '@/services/registry/test'
import { PreconditionsToken } from '@/services/tokens'
import { FullDiskAccessCard } from './index'

/**
 * AC-6 tem DUAS metades e este arquivo cobre as duas: o botão realmente PEDE o reparo (asseverado
 * pelo que o fake registrou — um teste não pode rodar `tccutil`), e a UI DECLARA as duas coisas que
 * vão acontecer ANTES de o operador clicar. A segunda metade é asseverada no DOM porque é onde ela
 * existe: um texto que só está no arquivo de locale não é uma promessa feita ao operador.
 *
 * A ORDEM dos dois passos não é asseverada aqui de propósito — ela pertence ao host e já é provada
 * em `preconditions/full_disk_access.rs`. Reasseverá-la aqui seria testar o dublê.
 */
describe('FullDiskAccessCard', () => {
	let root: Root | null = null
	let host: HTMLDivElement

	beforeEach(async () => {
		// Os textos são a asserção de metade dos casos daqui — sem fixar o idioma, `t()` devolveria a
		// própria chave e "a UI declara os dois passos" passaria vazia de significado.
		await i18n.changeLanguage('pt')
		host = document.createElement('div')
		document.body.appendChild(host)
	})

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host.remove()
	})

	function mount() {
		const container = new Container()
		container.load(testBindings)
		container.load([[PreconditionsToken, FakePreconditionsService]] as unknown as Bindings)
		const fake = container.resolve(PreconditionsToken) as FakePreconditionsService

		act(() => {
			root = createRoot(host)
			root.render(
				<ServicesProvider container={container}>
					<FullDiskAccessCard />
				</ServicesProvider>,
			)
		})
		return fake
	}

	it('AC-6: o clique pede o reparo da pré-condição de Acesso Total ao Disco', async () => {
		const fake = mount()
		const button = host.querySelector('button')
		expect(button).not.toBeNull()

		await act(async () => {
			button?.click()
			await Promise.resolve()
		})

		expect(fake.repaired).toEqual(['FULL_DISK_ACCESS'])
	})

	it('AC-6: a UI declara os dois passos antes do clique', () => {
		mount()
		const text = host.textContent ?? ''

		// A ordem embutida na ação tem que estar dita: limpar a negação, depois abrir os Ajustes.
		expect(text).toContain('apaga a negação')
		expect(text).toContain('Acesso Total ao Disco')
	})
})
```

### Step T4.2 — Rode os testes para vê-los falhar

Run: `cd packages/app/react && bun test src/routes/onboarding/`
Expected: FAIL — `Cannot find module './index'` / `Cannot find module './preconditions'`.

### Step T4.3 — Escreva as chaves de i18n (AC-9)

```bash
bun cli i18n preconditions --keys=slideTitle,slideBody,repairFailed,fullDiskAccess.title,fullDiskAccess.body,fullDiskAccess.action,fullDiskAccess.actionHint,fullDiskAccess.afterHint
```

Depois preencha os valores nos DOIS arquivos, em lock-step. `packages/app/react/src/locales/pt.json`, bloco `preconditions`:

```json
{
	"slideTitle": "Falta uma permissão",
	"slideBody": "O CODM precisa disto antes de conseguir trabalhar neste Mac.",
	"repairFailed": "Não foi possível iniciar o reparo.",
	"fullDiskAccess": {
		"title": "Acesso Total ao Disco",
		"body": "Os agentes leem suas pastas de projeto através do CODM — para o macOS, quem lê é o app. Sem esta permissão o sistema bloqueia a leitura e as tarefas param sem explicação.",
		"action": "Liberar Acesso Total ao Disco",
		"actionHint": "Dois passos, nesta ordem: o CODM apaga a negação já registrada e depois abre Privacidade e Segurança › Acesso Total ao Disco, onde você liga o CODM.",
		"afterHint": "Volte para esta janela depois de conceder — a verificação roda de novo sozinha."
	}
}
```

`packages/app/react/src/locales/en.json`, mesmo bloco:

```json
{
	"slideTitle": "One permission is missing",
	"slideBody": "CODM needs this before it can do any work on this Mac.",
	"repairFailed": "Could not start the repair.",
	"fullDiskAccess": {
		"title": "Full Disk Access",
		"body": "Agents read your project folders through CODM — as far as macOS is concerned, the app is the reader. Without this permission the system blocks those reads and tasks stop with no explanation.",
		"action": "Grant Full Disk Access",
		"actionHint": "Two steps, in this order: CODM clears the denial already on record, then opens Privacy & Security › Full Disk Access, where you switch CODM on.",
		"afterHint": "Come back to this window after granting — the check runs again on its own."
	}
}
```

### Step T4.4 — Scaffold dos três componentes

```bash
bun cli component onboarding PreconditionList --recipe=plain
bun cli component onboarding FullDiskAccessCard --recipe=card --i18n=preconditions.fullDiskAccess
bun cli component onboarding PreconditionsSlide --recipe=plain --i18n=preconditions
```

### Step T4.5 — Proposed file (a lista genérica, escrita por cima do scaffold)

```tsx
// packages/app/react/src/routes/onboarding/-components/PreconditionList/index.tsx — COMPLETE final file.
// MANTENHA a forma do scaffold: export nomeado, props estendendo ComponentProps, `{ className, ...props }`, `cn(...)`.
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Um módulo de pré-condição do lado do console: o id e como EXPLICAR essa pendência ao operador. A
 * detecção e o reparo pertencem ao host (services/PreconditionsService) — o que sobra para cá é a
 * única responsabilidade que uma webview pode ter das três.
 */
export interface PreconditionModule<Id extends string> {
	id: Id
	Component: () => ReactNode
}

interface PreconditionListProps<Id extends string> extends Omit<ComponentProps<'div'>, 'children'> {
	pending: readonly Id[]
	modules: Record<Id, PreconditionModule<Id>>
}

/**
 * A LISTA NÃO CONHECE NENHUMA PRÉ-CONDIÇÃO, e é isso que ela existe para garantir. Ela recebe o
 * mapa e despacha por índice — nunca uma cadeia de `if`, nunca um `switch` sobre o id (canon
 * CMP-P18). Genérica sobre `Id` para que a prova de extensibilidade (AC-8) possa passar um id que
 * não existe em produção: se a genericidade não estivesse aqui, "somar uma pré-condição sem editar
 * módulo existente" seria uma afirmação sem teste possível.
 *
 * A exaustividade vem do tipo: `Record<Id, …>` faz um id sem entrada parar de compilar (AC-5), então
 * o acesso por índice aqui não precisa de guarda em runtime — não existe caso ausente.
 */
export function PreconditionList<Id extends string>({ pending, modules, className, ...props }: PreconditionListProps<Id>) {
	return (
		<div className={cn('flex w-full flex-col gap-4', className)} {...props}>
			{pending.map(id => {
				const { Component } = modules[id]
				return <Component key={id} />
			})}
		</div>
	)
}
```

### Step T4.6 — Proposed file (o cartão do FDA)

```tsx
// packages/app/react/src/routes/onboarding/-components/FullDiskAccessCard/index.tsx — COMPLETE final file.
// MANTENHA a forma do scaffold: export nomeado, props estendendo ComponentProps, `{ className, ...props }`, `cn(...)`.
import { IconLock } from '@tabler/icons-react'
import { type ComponentProps, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePreconditions } from '@/services'

/**
 * A EXPLICAÇÃO e o BOTÃO de uma pré-condição — as duas responsabilidades que sobram para o console.
 *
 * O `actionHint` fica ACIMA do botão e não é decoração: a spec (AC-6) exige que o operador saiba as
 * duas coisas que vão acontecer antes de clicar. A ordem — limpar a negação, depois abrir os
 * Ajustes — é o que ninguém adivinha (conceder sem limpar não funciona quando a negação já foi
 * gravada), e por isso ela vive DENTRO da ação em vez de virar um passo a passo para o operador
 * executar. O texto diz o que o botão faz; o botão faz.
 *
 * O reparo é pedido à PORTA, nunca a `commands.*`: quais são os passos e em que ordem é decisão do
 * host, e um componente que soubesse disso teria que ser reescrito junto do host a cada mudança.
 */
// O `= {}` não é decoração: o registro atribui este componente a um slot tipado
// `Component: () => ReactNode` — zero-arg, porque é assim que `PreconditionList` o invoca
// (`<Component key={id} />`) e é assim que os módulos de mentira dos testes se declaram. Uma
// função com parâmetro OBRIGATÓRIO não é atribuível a esse tipo, e o default é a forma honesta
// de dizer "chamável sem argumentos" em vez de alargar o contrato do registro.
export function FullDiskAccessCard({ className, ...props }: ComponentProps<'div'> = {}) {
	const { t } = useTranslation()
	const preconditions = usePreconditions()
	const [repairing, setRepairing] = useState(false)

	const repair = async () => {
		setRepairing(true)
		try {
			await preconditions.repair('FULL_DISK_ACCESS')
		} catch {
			toast.error(t('preconditions.repairFailed'))
		} finally {
			setRepairing(false)
		}
	}

	return (
		<div className={cn('flex w-full flex-col gap-4 rounded-asymmetric border border-border bg-card p-6 text-left', className)} {...props}>
			<div className="flex items-center gap-3">
				<span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
					<IconLock className="size-5" />
				</span>
				<h2 className="text-lg font-bold text-foreground">{t('preconditions.fullDiskAccess.title')}</h2>
			</div>

			<p className="text-sm text-muted-foreground">{t('preconditions.fullDiskAccess.body')}</p>
			<p className="text-sm text-muted-foreground">{t('preconditions.fullDiskAccess.actionHint')}</p>

			<Button onClick={repair} disabled={repairing} className="self-start">
				{t('preconditions.fullDiskAccess.action')}
			</Button>

			<p className="text-xs text-muted-foreground">{t('preconditions.fullDiskAccess.afterHint')}</p>
		</div>
	)
}
```

### Step T4.7 — Proposed file (o registro do console)

```typescript
// packages/app/react/src/routes/onboarding/-components/preconditions.ts — COMPLETE final file
import type { PreconditionId } from '@/services'
import { FullDiskAccessCard } from './FullDiskAccessCard'
import type { PreconditionModule } from './PreconditionList'

/**
 * O REGISTRO DO CONSOLE — o par do registro do host (`src-tauri/src/preconditions/mod.rs`), unido a
 * ele pelo union de ids que as bindings do tauri-specta congelam.
 *
 * `Record<PreconditionId, …>` e não `Partial`: um id sem componente é erro de `tsc`, não um cartão
 * que some em runtime (spec Decision 3 / canon CMP-P18). Somar uma pré-condição = um arquivo de
 * cartão + uma linha aqui, sem tocar na lista, no slide ou no gate.
 */
export const PRECONDITION_MODULES: Record<PreconditionId, PreconditionModule<PreconditionId>> = {
	FULL_DISK_ACCESS: { id: 'FULL_DISK_ACCESS', Component: FullDiskAccessCard },
}
```

### Step T4.8 — Proposed file (o slide)

```tsx
// packages/app/react/src/routes/onboarding/-components/PreconditionsSlide/index.tsx — COMPLETE final file.
// MANTENHA a forma do scaffold: export nomeado, props estendendo ComponentProps, `{ className, ...props }`, `cn(...)`.
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { usePreconditionsStore } from '@/stores/usePreconditionsStore'
import { PreconditionList } from '../PreconditionList'
import { PRECONDITION_MODULES } from '../preconditions'

/**
 * O slide das pendências — dono do próprio dado, como todo componente aqui: lê o store que o
 * `PreconditionsGate` alimenta em vez de receber a lista por prop de cima.
 *
 * `pending ?? []` cobre o "ainda não sondado": o slide só é montado quando já há pendência (o fluxo
 * decide isso), mas um render antes da primeira resposta não pode explodir no acesso ao mapa.
 */
export function PreconditionsSlide({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const pending = usePreconditionsStore(state => state.pending)

	return (
		<div className={cn('flex flex-col items-center gap-6', className)} {...props}>
			<h1 className="heading-display text-4xl text-foreground md:text-5xl">{t('preconditions.slideTitle')}</h1>
			<p className="text-muted-foreground">{t('preconditions.slideBody')}</p>
			<PreconditionList pending={pending ?? []} modules={PRECONDITION_MODULES} />
		</div>
	)
}
```

### Step T4.9 — Rode os testes para vê-los passar

Run: `cd packages/app/react && bun test src/routes/onboarding/`
Expected: PASS — 6 testes (2 de `PreconditionList`, 2 de `preconditions`, 2 de `FullDiskAccessCard`).

### Step T4.10 — Type check + lint

Run: `cd packages/app/react && bun x tsc --noEmit` e, da raiz, `bun lint`
Expected: 0 erros.

### Step T4.11 — Commit

```bash
git add packages/app/react/src/routes/onboarding/-components/PreconditionList/ \
        packages/app/react/src/routes/onboarding/-components/FullDiskAccessCard/ \
        packages/app/react/src/routes/onboarding/-components/PreconditionsSlide/ \
        packages/app/react/src/routes/onboarding/-components/preconditions.ts \
        packages/app/react/src/routes/onboarding/-components/preconditions.test.ts \
        packages/app/react/src/locales/pt.json \
        packages/app/react/src/locales/en.json
git commit -m "feat(onboarding): slide de pré-condições com registro exaustivo e reparo em um clique (Task T4)"
```

---

## Task T5: Com uma pendência aberta o fluxo não deixa o operador passar; sem pendência ele é o de sempre

**Files to write:**
- Modify: `packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx` — prefixa o slide `PRECONDITIONS` quando há pendência, e retira as saídas enquanto ela existe
- Test: `packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.test.tsx`

**Files to read:**
- `packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx`
- `packages/app/react/src/routes/onboarding/-stores/useOnboardingStore.ts`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /component
**Depends on:** T4
**Consumes (frozen):** de T4 — o componente `PreconditionsSlide` de `routes/onboarding/-components/PreconditionsSlide`. De T3 — `usePreconditionsStore` de `@/stores/usePreconditionsStore` (`pending: PreconditionId[] | null`). Do arquivo existente — a tupla `SLIDES`, o `Record<SlideId, ReactNode>` `SLIDE_COMPONENTS`, o `useOnboardingStore` e as chaves i18n `onboarding.skip` / `onboarding.back` / `onboarding.next` / `onboarding.getStarted`, todos já em uso e que NÃO devem ser renomeados.
**Scope fence:** DONE elsewhere (consuma, nunca refaça) — o slide, o cartão, a lista e o registro (T4); o store e o gate (T3). OUT — nenhum arquivo fora de `OnboardingFlow/` é alterado nesta Task; os três slides de apresentação existentes não mudam.
**Gate:** `cd packages/app/react && bun x tsc --noEmit && bun test src/routes/onboarding/-components/OnboardingFlow/index.test.tsx`.

### Step T5.1 — Escreva o teste falhando

```tsx
// packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.test.tsx
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import i18n from '@/lib/i18n'
import { type Bindings, Container, ServicesProvider } from '@/services'
import testBindings, { FakePreconditionsService } from '@/services/registry/test'
import { PreconditionsToken } from '@/services/tokens'
import { usePreconditionsStore } from '@/stores/usePreconditionsStore'
import { useOnboardingStore } from '../../-stores/useOnboardingStore'
import { OnboardingFlow } from './index'

/**
 * O BURACO QUE ESTE ARQUIVO FECHA: o gate manda quem tem pendência para o /onboarding, e o
 * /onboarding tinha um "Pular" que devolvia a pessoa ao console. As duas coisas juntas dariam um
 * laço — ou, pior, um console aberto sem a permissão, que é exatamente a falha de origem.
 *
 * Sem pendência, nada disso existe: o fluxo tem que continuar sendo os três slides de apresentação
 * de sempre, com o "Pular" no lugar. Um teste que só cobrisse o caso bloqueado deixaria passar uma
 * regressão que tira a saída de todo mundo.
 */
describe('OnboardingFlow', () => {
	let root: Root | null = null
	let host: HTMLDivElement

	beforeEach(async () => {
		// O texto do cartão é o que distingue "slide da permissão presente" de "ausente" — sem idioma
		// fixado, `t()` devolve a chave e os dois casos veriam a mesma coisa.
		await i18n.changeLanguage('pt')
		host = document.createElement('div')
		document.body.appendChild(host)
		useOnboardingStore.getState().reset()
		usePreconditionsStore.getState().reset()
	})

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host.remove()
	})

	async function mount() {
		const container = new Container()
		container.load(testBindings)
		container.load([[PreconditionsToken, FakePreconditionsService]] as unknown as Bindings)

		const rootRoute = createRootRoute({
			component: () => (
				<ServicesProvider container={container}>
					<OnboardingFlow />
				</ServicesProvider>
			),
		})
		const dashboard = createRoute({ getParentRoute: () => rootRoute, path: '/dashboard', component: () => null })
		const router = createRouter({
			routeTree: rootRoute.addChildren([dashboard]),
			history: createMemoryHistory({ initialEntries: ['/'] }),
		})

		await act(async () => {
			root = createRoot(host)
			root.render(<RouterProvider router={router} />)
		})
		// Deixa o roteador assentar a rota inicial antes de qualquer asserção sobre o DOM — o mesmo
		// tick que o idioma de `PreconditionsGate.test.tsx` usa para o PULL do gate. Sem ele o
		// `RouterProvider` ainda não pintou nada e `host.textContent` é a string vazia, o que faria
		// os dois primeiros casos concordarem por acidente.
		await act(async () => {
			await Promise.resolve()
		})
	}

	it('com pendência, abre no slide da permissão e não oferece saída', async () => {
		usePreconditionsStore.getState().apply([{ id: 'FULL_DISK_ACCESS', satisfied: false }])
		await mount()

		expect(host.textContent).toContain('Acesso Total ao Disco')
		expect(host.querySelector('a[href="/dashboard"]')).toBeNull()
	})

	it('sem pendência, é o fluxo de apresentação de sempre — com o Pular no lugar', async () => {
		usePreconditionsStore.getState().apply([{ id: 'FULL_DISK_ACCESS', satisfied: true }])
		await mount()

		expect(host.textContent).not.toContain('Acesso Total ao Disco')
		expect(host.querySelector('a[href="/dashboard"]')).not.toBeNull()
	})

	it('o slide da permissão vem PRIMEIRO — o operador não precisa caçá-lo', async () => {
		usePreconditionsStore.getState().apply([{ id: 'FULL_DISK_ACCESS', satisfied: false }])
		await mount()

		// Quatro marcadores de slide (permissão + os três de apresentação), com o primeiro ativo.
		expect(useOnboardingStore.getState().currentSlide).toBe(0)
		expect(host.textContent).toContain('Acesso Total ao Disco')
	})
})
```

### Step T5.2 — Rode o teste para vê-lo falhar

Run: `cd packages/app/react && bun test src/routes/onboarding/-components/OnboardingFlow/index.test.tsx`
Expected: FAIL — o slide da permissão não aparece e o `a[href="/dashboard"]` está presente nos dois casos.

### Step T5.3 — Proposed file (o fluxo)

```tsx
// packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx — COMPLETE final file
import { type ComponentProps, type ReactNode, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowRight } from '@tabler/icons-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/console/Logo'
import { usePreconditionsStore } from '@/stores/usePreconditionsStore'
import { useOnboardingStore } from '../../-stores/useOnboardingStore'
import { ValueSlide } from '../ValueSlide'
import { HowItWorksSlide } from '../HowItWorksSlide'
import { ControlSlide } from '../ControlSlide'
import { PreconditionsSlide } from '../PreconditionsSlide'

// Sequência de slides como tupla const-asserted; despachada por um Record, nunca por cadeia de if.
const INTRO_SLIDES = ['VALUE', 'HOW', 'CONTROL'] as const
const BLOCKED_SLIDES = ['PRECONDITIONS', ...INTRO_SLIDES] as const
type SlideId = (typeof BLOCKED_SLIDES)[number]

const SLIDE_COMPONENTS: Record<SlideId, ReactNode> = {
	PRECONDITIONS: <PreconditionsSlide />,
	VALUE: <ValueSlide />,
	HOW: <HowItWorksSlide />,
	CONTROL: <ControlSlide />,
}

/**
 * O fluxo de entrada (T01) — e, desde a spec de pré-condições, também o de PENDÊNCIA. A rota
 * `/onboarding` deixou de significar "primeira execução" e passou a significar "há algo faltando"
 * (spec Decision 6): não existe flag de "já vi", então primeira execução e revogação posterior são
 * o mesmo caso, com uma superfície só.
 *
 * A CONSEQUÊNCIA ACEITA (spec Decision 7): quando uma permissão cai, o operador revê a apresentação
 * inteira. Isso é deliberado e está registrado para ninguém "consertar" depois achando que foi
 * descuido — o slide da pendência entra no fluxo existente em vez de virar uma tela paralela.
 *
 * ENQUANTO HÁ PENDÊNCIA NÃO HÁ SAÍDA, e essa é a única forma que não vira laço: o
 * `PreconditionsGate` traz o operador de volta para cá a cada tentativa de sair, então um "Pular"
 * ativo seria um botão que devolve a pessoa ao ponto de partida — e, se o gate fosse afrouxado para
 * evitar isso, o resultado seria o console aberto sem a permissão, que é a falha de origem. O
 * destravamento não depende de o operador apertar nada: o gate re-sonda quando a janela reganha
 * foco, então conceder nos Ajustes e voltar já basta.
 */
export function OnboardingFlow({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { currentSlide, direction, setCurrentSlide, setDirection, reset } = useOnboardingStore()
	const pending = usePreconditionsStore(state => state.pending)

	// Fresh intro on every entry (the store persists across navigations).
	useEffect(() => reset(), [reset])

	const blocked = (pending?.length ?? 0) > 0
	const slides: readonly SlideId[] = blocked ? BLOCKED_SLIDES : INTRO_SLIDES

	const lastIndex = slides.length - 1
	// Clamp, e não só fallback: quando a pendência é resolvida no meio do fluxo a lista ENCOLHE, e o
	// índice guardado no store pode passar do fim.
	const index = Math.min(currentSlide, lastIndex)
	const slideId = slides[index] ?? slides[0]
	const done = () => navigate({ to: '/dashboard' })

	const goTo = (target: number) => {
		setDirection(target < index ? -1 : 1)
		setCurrentSlide(Math.min(lastIndex, Math.max(0, target)))
	}

	return (
		// `min-h-full`, not `min-h-dvh`: sized against the box the root layout left under the AppChrome
		// title bar, never against the viewport (which no longer belongs entirely to the route).
		<div className={cn('flex min-h-full flex-col bg-route-background text-foreground', className)} {...props}>
			<header className="flex items-center justify-between px-6 py-6 md:px-10">
				<Logo />
				{!blocked && (
					<Link to="/dashboard" className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
						{t('onboarding.skip')}
					</Link>
				)}
			</header>

			<main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
				<div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
					<div
						key={slideId}
						className={cn(
							'flex w-full flex-col items-center gap-8 text-center',
							'animate-in fade-in duration-300 ease-out',
							direction === 1 ? 'slide-in-from-right-10' : 'slide-in-from-left-10',
						)}
					>
						{SLIDE_COMPONENTS[slideId]}
					</div>

					<div className="flex items-center gap-2">
						{slides.map((id, i) => (
							<span
								key={id}
								className={cn('h-2 rounded-full transition-all duration-300', i === index ? 'w-6 bg-primary' : 'w-2 bg-border')}
							/>
						))}
					</div>

					<div className="flex items-center gap-3">
						{index > 0 && (
							<Button variant="outline" onClick={() => goTo(index - 1)}>
								{t('onboarding.back')}
							</Button>
						)}
						{index < lastIndex ? (
							<Button onClick={() => goTo(index + 1)}>
								{t('onboarding.next')} <IconArrowRight data-icon="inline-end" />
							</Button>
						) : (
							<Button onClick={done} disabled={blocked}>
								{t('onboarding.getStarted')} <IconArrowRight data-icon="inline-end" />
							</Button>
						)}
					</div>
				</div>
			</main>
		</div>
	)
}
```

### Step T5.4 — Rode o teste para vê-lo passar

Run: `cd packages/app/react && bun test src/routes/onboarding/-components/OnboardingFlow/index.test.tsx`
Expected: PASS — 3 testes.

### Step T5.5 — Rode a suíte inteira do console

Run: `cd packages/app/react && bun test`
Expected: PASS — nenhuma regressão nos testes existentes de `SupervisionGate`, `ServicesProvider` e demais.

### Step T5.6 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 erros em todos os workspaces.

### Step T5.7 — Commit

```bash
git add packages/app/react/src/routes/onboarding/-components/OnboardingFlow/
git commit -m "feat(onboarding): o fluxo não libera o console enquanto há pré-condição pendente (Task T5)"
```

---

## Final Validation

- [ ] `cd packages/app/tauri/src-tauri && cargo test` — testes do shell verdes e `commands/bindings.ts` sem diff pendente
- [ ] `git diff --exit-code packages/app/tauri/commands/bindings.ts` — as bindings commitadas batem com o que `cargo test` gera
- [ ] `bun tsc` — type check completo limpo
- [ ] `bun lint` — lint limpo
- [ ] `cd packages/app/react && bun test` — suíte do console verde
- [ ] `bun test packages/app/tauri/config` — rails DSK do `generate.test.ts` verdes com a capability nova
- [ ] `bun desktop:generate` — sem diff inesperado em `src-tauri/capabilities/default.json`
- [ ] Verificação manual no app empacotado: com a permissão revogada (`tccutil reset SystemPolicyAllFiles app.codm.desktop`), abrir o CODM leva ao slide de permissão; clicar no botão abre Privacidade e Segurança; conceder e voltar à janela faz a pendência sumir sem recarregar
- [ ] AC mapping (cada AC da spec → ≥1 teste):
  - AC-1 → `packages/app/tauri/src-tauri/src/preconditions/full_disk_access.rs:"an_unreadable_file_reports_unsatisfied"`
  - AC-2 → `packages/app/tauri/src-tauri/src/preconditions/full_disk_access.rs:"a_readable_file_reports_satisfied"`
  - AC-3 → `packages/app/react/src/components/console/PreconditionsGate.test.tsx:"AC-3: com uma pendência, leva o operador ao /onboarding"` + `"AC-3: com tudo satisfeito, não retém nem move o operador"`
  - AC-4 → `packages/app/react/src/components/console/PreconditionsGate.test.tsx:"AC-4: o gatilho é o conjunto de pendências, não uma flag de \"já visto\""`
  - AC-5 → `packages/app/react/src/routes/onboarding/-components/preconditions.test.ts:"AC-5: tem exatamente uma entrada por id conhecido"` (a falha de compilação é garantida pelo tipo `Record<PreconditionId, …>` no próprio arquivo)
  - AC-6 → `packages/app/tauri/src-tauri/src/preconditions/full_disk_access.rs:"repair_resets_tcc_before_opening_settings"` (a ordem) + `packages/app/react/src/routes/onboarding/-components/FullDiskAccessCard/index.test.tsx:"AC-6: a UI declara os dois passos antes do clique"` (a declaração) + `"AC-6: o clique pede o reparo da pré-condição de Acesso Total ao Disco"`
  - AC-7 → `packages/app/react/src/services/PreconditionsService/BrowserPreconditionsService.test.ts:"AC-7: não reporta pré-condição nenhuma — o conjunto aplicável a uma aba é vazio"`
  - AC-8 → `packages/app/react/src/routes/onboarding/-components/PreconditionList/index.test.tsx:"AC-8: renderiza o componente de uma pré-condição que a lista nunca viu antes"`
  - AC-9 → `bun tsc` (as chaves são consumidas por `t()` tipado) + a inspeção dos dois blocos `preconditions` em `pt.json` e `en.json` no Step T4.3
  - AC-10 → `packages/app/tauri/src-tauri/src/preconditions/mod.rs:"every_precondition_declares_at_least_one_platform"` + `"applicable_filters_by_the_declared_platform_field"` + `"statuses_reports_exactly_the_applicable_ids"`
  - AC-11 → `packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.test.tsx:"com pendência, abre no slide da permissão e não oferece saída"` + `"sem pendência, é o fluxo de apresentação de sempre — com o Pular no lugar"`

## Notes

**As três decisões que a spec ganhou durante o `/plan`** já estão escritas nela (Decisions 5 emendada, 9 e 10; ACs 10 e 11), e este plano as implementa — não há divergência entre os dois artefatos. Em resumo, para quem lê só o plano:

- **O alvo da sonda** deixou de ser "o diretório de workspaces" e passou a ser um arquivo do próprio macOS. A metade load-bearing da Decision 5 ("é uma leitura, não uma consulta ao TCC") está integralmente honrada — `File::open` de verdade, veredito lido do `EPERM`. O que mudou foi o alvo, porque o shell não conhece os workspaces, porque ler `~/Desktop` teria falso-OK sob permissão estreita, e porque ler `~/Desktop` em primeiro plano dispararia um prompt cuja recusa gravaria a negação que o reparo existe para desfazer.
- **`platforms` é campo declarado, não `#[cfg]`** (Decision 9). Efeito colateral bem-vindo: a AC-7 sai do mesmo lookup em vez de ser um `return []` codificado — o browser não tem pré-condição aplicável porque nenhuma o declara.
- **Não há saída enquanto há pendência** (Decision 10). Se um dia for revertido, a mudança é o `blocked` de T5.3 — duas condições, nenhuma outra Task muda.

**`tccutil` sai com código diferente de zero quando não há nada para limpar**, que é o caso de quem nunca negou nada. Por isso `run_repair` não aborta a sequência em status != 0 — só em falha de spawn. Abortar ali deixaria os Ajustes fechados exatamente para o operador de primeira viagem.

**Os testes de permissão de arquivo (T1.2) não passam como root** — o root ignora os bits de permissão e abriria o arquivo 000. Os runners deste repo não rodam como root; se algum ambiente futuro o fizer, o caso `an_unreadable_file_reports_unsatisfied` falha de forma barulhenta, que é o comportamento certo.

**Nenhuma migração, nenhum contrato de fio, nenhum `bun sdk`.** Todo o tráfego novo é IPC do shell, tipado por tauri-specta — não passa por `packages/contracts` nem pela OpenAPI, então não há Contract Lock de SDK neste plano. O equivalente é o Step T1.8: `cargo test` regenera `commands/bindings.ts` e o arquivo é commitado junto do Rust que o produziu.

**A `boot-error` window (`BOOT_ERROR_FRAME`) não é usada** por este plano, como a spec já registra. Ela serve ao portão de prontidão dos sidecars e continua onde está.
