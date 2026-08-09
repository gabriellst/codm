# Pré-condições do app como conjunto extensível — Design Spec

**Date:** 2026-08-08
**Status:** Approved
**Bounded Context:** desktop-shell (Tauri host + o DI de services do console)
**Kind:** feature
**Story Points:** 5 — um contexto ponta a ponta: comando Rust novo, porta com duas implementações, registro, slide de UI, guarda de rota e i18n nos dois idiomas. Sem migração e sem contrato de fio.

## Context

O CODM depende do ambiente do Mac de um jeito que a maioria dos apps não depende: os agentes que ele
gera leem pastas de projeto do operador. Tudo que o daemon gera — o `claude`, e todo `zsh`/`git`/`gh`
abaixo dele — é atribuído pelo macOS ao app como **processo responsável**; o log do `tccd` diz
literalmente `responsible={identifier=app.codm.desktop}`. Como os workspaces vivem sob `~/Desktop`,
pasta protegida por TCC, a permissão de disco do app **é** a permissão de disco dos agentes.

O app não tem hoje nenhuma noção disso. O `packages/app/react/src/routes/onboarding/` são três
slides de apresentação (`ValueSlide`, `HowItWorksSlide`, `ControlSlide`) e nada mais; uma busca por
`full disk`, `systempreferences`, `tccutil` ou `permission` em
`packages/app/tauri/src-tauri/src/` não retorna nada.

Duas âncoras existentes moldam este desenho, e nenhuma precisa ser inventada:

- **`packages/app/react/src/services/SupervisionService/`** — porta (`SupervisionService.ts`) com
  duas implementações (`TauriSupervisionService`, `BrowserSupervisionService`), consumida por um
  banner. O docblock dela já argumenta por que uma verificação sobre o host mora numa porta e não
  num hook do console: quem observa é quem tem acesso, e o console não tem.
- **`packages/app/tauri/config/capabilities.ts`** — `CAPABILITIES` (as chaves abstratas) mais
  `CAPABILITY_PERMISSIONS` (o mapa por chave), com render que falha ruidosamente quando existe chave
  sem mapeamento. É a forma "registro + mapa exaustivo" que esta spec reusa.

A janela `boot-error` já é declarada em `packages/app/tauri/config/window.ts` (`BOOT_ERROR_FRAME`) e
hoje serve ao portão de prontidão dos sidecars. **Ela não é usada por esta spec** — fica registrada
para não parecer omissão.

## Problem

1. **Sem Acesso Total ao Disco o app não abre, e não diz por quê.** Medido em 07/08/2026: o TCC
   gravou a negação a partir de um pedido feito por sidecar em segundo plano — onde o macOS não pode
   exibir diálogo —, e a partir daí houve ~640 negações de kernel
   (`System Policy: deny(1) file-read-data /Users/work/Desktop/…`). O `claude` passou a morrer no
   startup com `EPERM` (Bun não consegue ler o próprio cwd), o portão de prontidão nunca concluiu, e
   como as duas janelas nascem ocultas e o portão revela exatamente uma, **nenhuma apareceu**. O
   operador clica no ícone e não acontece nada.
2. **Full Disk Access não tem diálogo.** É permissão só de Ajustes; o macOS nunca pergunta. Um app
   que depende dela e não conduz o operador até lá simplesmente não funciona.
3. **Conceder não basta se a negação já foi gravada.** É preciso `tccutil reset` antes. Esse passo
   não é adivinhável e hoje está documentado só em `docs/RELEASE.md`, onde o operador não olha.
4. **Não há onde encaixar a próxima.** `notification` e `autostart` são capabilities declaradas cuja
   concessão ninguém verifica; hoje falham em silêncio, e não existe estrutura que as acolha.

## Goal

O operador nunca mais fica diante de um app que abre e não funciona sem saber por quê. Quando falta
uma pré-condição do ambiente, o app diz qual é, explica por que ela importa e oferece o reparo em um
clique. E acrescentar a próxima pré-condição custa um arquivo e uma linha, em vez de uma nova
checagem enfiada no boot.

## Decisions

1. **Escopo inicial: apenas o Acesso Total ao Disco.** A estrutura nasce extensível, mas com uma
   pré-condição só — a que dói hoje e foi medida.
2. **Uma pré-condição é um módulo com três responsabilidades declaradas:** como detectar, como
   explicar e como reparar. Um registro lista os módulos. Somar uma pré-condição é criar um arquivo
   e acrescentar uma linha ao registro, sem editar nada existente.
3. **O componente de UI de cada pré-condição é resolvido por mapa indexado pelo id**, nunca por
   cadeia de `if` ou `switch` (canon `CMP-P18`). O mapa é exaustivo sobre o union de ids: um id sem
   componente é erro de `tsc`, não bug em runtime.
4. **A detecção roda no shell Rust**, exposta ao console por comando tipado (tauri-specta), atrás de
   uma porta `PreconditionsService` com implementação Tauri e implementação Browser — a mesma forma
   do `SupervisionService`. A implementação Browser reporta tudo satisfeito: TCC é fato do macOS e o
   console web não tem o que verificar.
5. **A sonda do Acesso Total ao Disco é uma tentativa de leitura, não uma consulta ao TCC.** `EPERM`
   significa não satisfeita. Não existe API para perguntar ao TCC, e o `tccd` só responde negando —
   verificar na saída é a única forma.
   O ALVO é um arquivo do próprio macOS (`~/Library/Application Support/com.apple.TCC/TCC.db`), cujo
   conteúdo é irrelevante e nunca é lido. Ele foi escolhido sobre o diretório de workspaces (a
   redação original desta decisão) por três razões apuradas durante o `/plan`: o shell Rust não
   conhece os workspaces — eles são linhas no SQLite do daemon —, e na primeira execução não existe
   nenhum, então a sonda literal reportaria "satisfeita" exatamente no caso da Story 1; ler
   `~/Desktop` daria OK para quem concedeu apenas a permissão estreita de Desktop, deixando os
   agentes quebrados fora dela; e ler `~/Desktop` a partir do app em primeiro plano dispararia o
   prompt de `SystemPolicyDesktopFolder`, cuja recusa GRAVARIA a negação que a Decision 8 existe
   para desfazer — a sonda teria criado o problema. Ratificado pelo founder em 08/08/2026.
6. **`/onboarding` passa a significar "há pendência", não "primeira execução".** Não existe flag de
   "já vi": a rota abre enquanto houver pré-condição não satisfeita e some quando todas estiverem.
   Primeira execução e revogação posterior viram o mesmo caso, com uma superfície só.
7. **As pré-condições entram como um slide no fluxo existente**, ao lado dos três de apresentação.
   Consequência aceita conscientemente pelo founder: quando uma permissão cai, o operador revê a
   apresentação inteira. Registrado para ninguém "corrigir" depois achando que foi descuido.
8. **O reparo é um botão só: roda `tccutil reset` e abre os Ajustes na sequência.** A ordem é o que
   ninguém adivinha — conceder sem limpar não funciona quando a negação já foi gravada —, então ela
   fica embutida na ação em vez de virar instrução. O botão diz o que faz antes de fazer.
9. **A plataforma em que uma pré-condição existe é um CAMPO declarado no módulo, não `#[cfg]`.** A
   avaliação vira lookup uniforme sobre esse campo — nunca um `if` de sistema operacional dentro de
   uma sonda (não-negociável #5 do CLAUDE.md). A razão de ser campo e não compilação condicional é o
   contrato: as bindings do tauri-specta são geradas no mac e commitadas, então um enum de ids que
   encolhesse por alvo faria o arquivo commitado nomear um id inexistente no build do Windows e o
   mapa exaustivo da Decision 3 deixaria de fechar. O union de ids é estável em toda plataforma; o
   que varia é quais são aplicáveis. Consequência bem-vinda: a Decision 4 (implementação Browser
   reporta tudo satisfeito) deixa de ser um caso especial — uma aba simplesmente não é plataforma de
   nenhuma pré-condição, e o conjunto aplicável a ela é vazio pelo mesmo lookup. Ratificado pelo
   founder em 08/08/2026.
10. **Enquanto há pendência, o fluxo não oferece saída.** O "Pular" some e o botão final fica inerte.
    É a única forma que não vira laço: a Decision 6 traz o operador de volta ao `/onboarding` a cada
    tentativa de sair, então um "Pular" ativo devolveria a pessoa ao ponto de partida — e afrouxar a
    guarda para evitar isso entregaria o console sem permissão, que é a falha de origem. O
    destravamento não exige ação: a verificação roda de novo quando a janela reganha foco, então
    conceder nos Ajustes e voltar basta.
11. **Uma pré-condição declara do que o REPARO dela precisa; onde o host não oferece isso, ela
    detecta e explica, mas não oferece o botão.** Sob `tauri dev` o shell roda um Mach-O cru
    (`target/debug/codm-desktop`): sem `.app`, sem `Info.plist`, `Identifier` gerado pelo cargo e
    assinatura ad-hoc cujo cdhash muda a cada build. O macOS não tem a que atribuir a concessão, e
    quem a carrega passa a ser o processo responsável — o terminal que lançou o comando. Um
    `tccutil reset app.codm.desktop` ali não encontra entrada nenhuma e os Ajustes abrem numa lista
    onde o app não aparece: o botão afirmaria consertar sem consertar.
    A detecção NÃO some junto, e essa é a parte deliberada: em dev a leitura falha de verdade
    quando o terminal não tem a permissão, e é a mesma falha invisível que esta spec existe para
    matar — apagá-la só a transfere para quem desenvolve. O que muda é a orientação: em vez do
    botão, o cartão diz que a permissão pertence ao terminal.
    A avaliação segue sendo lookup uniforme sobre campo declarado (Decision 9): a pré-condição
    declara o ESCOPO do seu reparo, e o host DERIVA se tem identidade atribuível — do executável
    estar dentro de um `.app`, nunca de `debug_assertions`, que descreve o perfil de build e não o
    fato. Ratificado pelo founder em 09/08/2026.

## User Stories

- **Story 1:** Como operador que acabou de instalar o CODM, quero que o app me diga que falta a
  permissão de disco e me leve até ela, para não ficar diante de uma janela que não abre.
  - Given o app sem Acesso Total ao Disco, when eu abro o CODM, then o fluxo de onboarding aparece
    com o slide da permissão, explicando que sem ela os agentes não leem minhas pastas.
  - Given o slide da permissão, when clico no botão de reparo, then o app limpa a negação gravada e
    abre o painel de Privacidade do macOS.
  - Given que concedi a permissão nos Ajustes, when volto ao app, then a pendência desaparece e o
    console abre normalmente.

- **Story 2:** Como operador que já usava o app, quero ser avisado quando a permissão cair, para não
  descobrir por um app que abre e não faz nada.
  - Given o app funcionando e a permissão revogada depois, when abro o CODM, then o onboarding
    reaparece com a pendência, sem que eu precise saber que o problema é esse.

- **Story 3:** Como desenvolvedor somando uma pré-condição nova (notificações, autostart), quero
  criar um arquivo e registrá-lo, para não ter que editar o boot nem o fluxo de onboarding.
  - Given uma pré-condição nova registrada, when o app inicia, then ela é verificada e, se não
    satisfeita, aparece com o próprio componente — sem alteração em nenhum módulo existente.
  - Given um id de pré-condição sem componente no mapa, when o projeto compila, then `tsc` falha.

## Acceptance Criteria

- [ ] AC-1: Com o diretório de workspaces ilegível (`EPERM`), a pré-condição de Acesso Total ao Disco
      é reportada como não satisfeita.
- [ ] AC-2: Com o diretório legível, ela é reportada como satisfeita.
- [ ] AC-3: Havendo qualquer pré-condição não satisfeita, a navegação leva ao `/onboarding`; com
      todas satisfeitas, o `/onboarding` não retém o operador.
- [ ] AC-4: Não existe flag persistida de "onboarding já visto" governando essa decisão — o gatilho é
      exclusivamente o conjunto de pendências.
- [ ] AC-5: O slide da pré-condição renderiza o componente registrado para o seu id, resolvido por
      mapa; um id sem entrada no mapa não compila.
- [ ] AC-6: O botão de reparo executa o `tccutil reset` **antes** de abrir os Ajustes, e a UI declara
      as duas coisas ao operador antes de ele clicar.
- [ ] AC-7: A implementação Browser da porta reporta todas as pré-condições como satisfeitas, e o
      console web não exibe o slide.
- [ ] AC-8: Somar uma pré-condição ao registro a faz aparecer no fluxo sem edição em módulo
      existente — provado por um caso de teste que registra uma pré-condição de mentira.
- [ ] AC-9: Todo texto novo existe em `pt.json` e `en.json`.
- [ ] AC-10: Uma pré-condição declara em que plataformas existe, e o conjunto reportado ao console já
      vem filtrado por essa declaração — nenhuma sonda ramifica em sistema operacional.
- [ ] AC-11: Com pendência aberta, o fluxo de onboarding não expõe rota de saída para o console; sem
      pendência, ele é o fluxo de apresentação de sempre, com o "Pular" no lugar.
- [ ] AC-12: Num host sem identidade atribuível (executável fora de um `.app`, como em `tauri dev`),
      a pré-condição de Acesso Total ao Disco continua sendo detectada e explicada, mas o cartão não
      oferece o botão de reparo — apresenta no lugar a orientação de que a permissão pertence ao
      processo responsável. Pedir o reparo nesse host falha explicitamente em vez de virar no-op.
- [ ] AC-13: A disponibilidade do reparo sai de lookup sobre um campo declarado no módulo mais um
      fato derivado do executável — nunca de `debug_assertions` nem de qualquer desvio por ambiente.

## Risks & Migration

O `/onboarding` muda de semântica: hoje é apresentação de primeira execução, passa a ser fluxo de
pendências. Se existir hoje algum estado persistido de "onboarding concluído"
(`routes/onboarding/-stores/useOnboardingStore.ts`), ele deixa de governar a exibição — a Decision 6
é explícita quanto a isso, e a AC-4 é o que impede a flag de voltar por engano.

`tccutil reset` altera estado de privacidade do sistema. O risco é aceitável porque o alvo é o
próprio bundle id do app e o efeito é remover uma negação — nunca conceder nada. Conceder segue
sendo ato do operador, nos Ajustes.

## Open Questions

Nenhuma. As quatro decisões de produto (escopo, superfície, gatilho, reparo) foram tomadas pelo
founder durante o brainstorm.
