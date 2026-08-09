# Onboarding como wizard de passos tipados, e SystemPrecondition como uma das espécies — Design Spec

**Date:** 2026-08-09
**Status:** Approved
**Bounded Context:** cross-context: `owner` (novo agregado + middleware), `ui` (leitura BFF unificada), desktop-shell (renomeação), console react (remodelagem do fluxo + passos de setup)
**Kind:** feature
**Story Points:** 21 — agregado novo com migração e middleware que barra a API, wizard multi-passo com progresso persistido, absorção de um endpoint existente, recomposição de três fluxos de setup em passos, e uma renomeação que atravessa Rust, bindings commitadas e console: ~29 artefatos em quatro frentes. A decomposição em duas specs foi proposta e recusada pelo founder — ver "Por que uma spec só".

## Context

O `/onboarding` do codm são três slides de apresentação — `ValueSlide`, `HowItWorksSlide`,
`ControlSlide`, orquestrados por
`packages/app/react/src/routes/onboarding/-components/OnboardingFlow/` — e nada mais. Não existe
noção de conclusão: o `useOnboardingStore` guarda só o índice do slide e a direção da animação, em
memória, resetados a cada entrada. No backend não há nada de onboarding.

**E, no entanto, já existe um segundo onboarding no produto.** O
`packages/api/typescript/src/ui/usecases/GetSetupChecklist.ts` se descreve no próprio docblock como
*"The onboarding gate's three 'done' flags"* e devolve `channelDone / workspaceDone / threadDone`
por consultas de existência. O painel que o consome
(`packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/`) já é um wizard
disfarçado — monta um `Step[]` com `n`, `title`, `description`, `to`, `done`, e se apresenta como
*"turns three cold-start chores into a guided checklist"*. São duas histórias sobre a mesma coisa,
em dois lugares, e nenhuma das duas sabe da outra.

Em 08/08 as pré-condições do ambiente entraram por cima disso
(`.specs/2026-08-08-preconditions-do-app-design.md`, implementada e commitada). O lado do host ficou
bem resolvido: um registro em `packages/app/tauri/src-tauri/src/preconditions/` onde cada módulo
declara em que plataformas existe e sobre o que seu reparo age, exposto por comandos tauri-specta e
consumido atrás da porta `packages/app/react/src/services/PreconditionsService/`. O que ficou errado
foi o acoplamento ao fluxo: o `packages/app/react/src/components/console/PreconditionsGate.tsx`
redireciona para `/onboarding` sempre que há pendência, e o `OnboardingFlow` responde prefixando um
slide e removendo as saídas.

**As peças de setup já são passos e diálogos, não fluxos de rota.** O `/attach` já é um wizard de
quatro passos — `ContactStep`, `WorkspaceStep`, `AgentsStep`, `ReviewStep`, sob `AttachThreadWizard`,
com um `useAttachWizardStore` cujo docblock diz espelhar o `useOnboardingStore`. E `/channels` e
`/workspaces` expõem `ConnectChannelDialog` e `AddWorkspaceDialog`, componentes autocontidos. Compor
um wizard maior com essas peças é reuso, não aninhamento — e por isso o wizard não precisa navegar
para fora de si.

O medscall (`/Users/work/Desktop/Projetos/medscall/software/monorepo`) é o molde do que falta:
entidade `Onboarding` com `currentStep` e `completedAt`
(`packages/api/src/ui/entities/Onboarding.ts`), um `OnboardingMiddleware`
(`packages/api/src/ui/middlewares/OnboardingMiddleware.ts`) que barra a API com
`ONBOARDING_NOT_COMPLETED`, e uma rota que compõe os passos por função pura — `wizardSteps(type)` em
`packages/app/src/routes/onboarding/index.tsx`, cujo comentário registra a regra que importa: *"o
front não deriva nada disso"*.

Duas âncoras do codm fecham o desenho. O contexto `packages/api/typescript/src/owner/` já é a fatia
por dono e já é um contexto completo (entidades, repositórios, middlewares, eventos) — ao contrário
do `ui`, que aqui é BFF de leitura pura, sem entidade nem repositório, e portanto não comporta um
agregado. E o `packages/app/react/src/components/console/CloudSessionGate.tsx` é o precedente exato
de uma guarda que redireciona para uma tela real com URL própria em vez de renderizar overlay.

Do mundo lá fora, o padrão que informou a taxonomia: produtos maduros quase nunca barram a
**entrada**, barram a **capacidade** — Stripe libera o dashboard inteiro em test mode e só bloqueia
no ponto de cobrar; Vercel deixa navegar sem Git e só impede o deploy; Linear e Slack têm onboarding
curto e pulável com uma superfície "Getting started" que persiste até acabar. A exceção que mais
interessa é o **Setup Assistant da Apple**, que é esta spec implementada: passos obrigatórios sem
botão de pular, passos adiáveis com "Configurar depois nos Ajustes", e o que foi adiado reaparecendo
como badge nos Ajustes.

## Problem

1. **Uma falha de permissão sequestra a apresentação inteira.** Como a pendência é o motivo de a
   tela existir, qualquer revogação joga o operador no slide 1 e o faz reler os três slides. A spec
   de 08/08 registrou isso como consequência aceita (Decision 7); na prática é a relação invertida.
2. **Beco sem saída medido em `desktop:dev`.** Com a pendência bloqueando a saída (Decision 10) e o
   reparo indisponível fora de um bundle (Decision 11), o operador fica sem ação possível: não pode
   reparar, porque o app admite que não consegue, e não pode sair. O botão desabilitado ainda esconde
   um laço — habilitá-lo sozinho faria a guarda trazer a pessoa de volta na hora.
3. **O onboarding não tem conclusão.** Não há como saber se o operador já passou por ele, nada barra
   `/app` de quem nunca viu, e o único caminho até a tela é um link no painel do dashboard.
4. **Duas histórias de onboarding, em dois lugares.** O `/onboarding` (apresentação, sem estado) e o
   `setup-checklist` (progresso derivado, no dashboard) contam partes da mesma coisa sem se conhecer.
5. **Duas máquinas de despacho para o mesmo problema.** `PreconditionList` + `PRECONDITION_MODULES`
   resolvem id→componente para pendências; o wizard resolve id→componente para passos.
6. **`Precondition` é um nome vazio.** Todo passo do wizard é uma pré-condição para concluir — é o
   que "concluir" significa. O nome não recorta nada.

## Goal

O operador tem um onboarding com começo e fim, que o conduz de fato: vê o que o produto é, conecta o
canal, aponta a pasta, vincula a conversa e resolve o que o sistema operacional exige — tudo dentro
de uma tela só, sem sair. Nada disso o prende: ele conclui quando quiser, e o que deixou para trás
continua visível no painel do dashboard até resolver. E quem escreve o código passa a ter um registro
único de passos, com um vocabulário que diz de que espécie cada passo é e o que acontece se ele ficar
por fazer.

## Decisions

### Nomenclatura e modelo de passos

1. **`SystemPrecondition` substitui `Precondition` em toda a superfície.** `Step` é o gênero;
   `SystemPrecondition` é a espécie que nasce de um fato do sistema operacional, é condicional a esse
   fato, e **nunca pode ser persistida como vencida** — permissão é revogável. A renomeação atravessa
   o Rust (`SystemPreconditionId`, `system_precondition_statuses`, `repair_system_precondition`), as
   bindings geradas, a porta (`SystemPreconditionsService`), o store e os componentes.

2. **Todo passo é um `Step`; o que varia é de onde vem sua satisfação.** Quatro fontes, uma regra de
   composição só:

   | espécie | satisfação vem de |
   |---|---|
   | apresentação | progresso persistido (`currentStep`) |
   | setup | banco — consultas de existência (canal `CONNECTED`, workspace, thread viva) |
   | `SystemPrecondition` | host — a sonda |
   | final | — |

3. **Dois eixos ORTOGONAIS descrevem um passo, e cada um governa uma superfície diferente.** Manter
   os dois separados é o que impede o wizard de saber de dashboard e vice-versa.

   **`kind` — o que acontece se ficar por fazer (governa o wizard):**

   | valor | significado |
   |---|---|
   | `INFORMATIVE` | ver é cumprir; não há nada a satisfazer |
   | `REQUIRED` | não conclui sem |
   | `DEFERRABLE` | conclui sem, e fica visível depois |

   **`impact` — o que fica quebrado enquanto isso (governa o dashboard):**

   | valor | significado |
   |---|---|
   | `BLOCKING` | alguma capacidade real não funciona |
   | `ADVISORY` | só falta, não quebra |

   **`REQUIRED` e `ADVISORY` entram sem nenhum passo usando hoje**, deliberadamente e a pedido do
   founder: o vocabulário é para ser documentado e usado, e um membro de union sem uso em TypeScript
   não dispara lint (ao contrário do `RepairScope::Standalone` no Rust, que precisou de
   `#[allow(dead_code)]`).

4. **A condicionalidade mora numa função pura de composição na própria rota — sem context bag e sem
   predicado por passo.** Espelha o `wizardSteps(type)` do medscall:
   `onboardingSteps(pending) => [...INTRO_STEPS, ...SETUP_STEPS, ...pending, FINAL_STEP]`, com
   `STEP_COMPONENTS: Record<StepId, ReactNode>` exaustivo sobre

   ```ts
   const INTRO_STEPS = ['VALUE', 'HOW', 'CONTROL'] as const
   const SETUP_STEPS = ['CHANNEL', 'WORKSPACE', 'CONTACT', 'AGENTS', 'REVIEW'] as const
   type StepId = (typeof INTRO_STEPS)[number] | (typeof SETUP_STEPS)[number] | SystemPreconditionId | 'FINAL'
   ```

   Uma `SystemPrecondition` está na lista porque está em `pending`, e some porque saiu.

   **Os cinco passos de setup são IRMÃOS, no mesmo nível — não há wizard dentro de wizard.** Cada peça
   é um passo próprio, com componente próprio: `CHANNEL` (o pareamento por QR, hoje dentro de
   `ConnectChannelDialog`), `WORKSPACE` (o seletor de pasta, hoje dentro de `AddWorkspaceDialog`), e
   `CONTACT` / `AGENTS` / `REVIEW`, reusados do `/attach`. **O `WorkspaceStep` do `/attach` fica de
   fora desta lista**: ele *seleciona* um workspace existente, e o passo `WORKSPACE` imediatamente
   anterior acabou de criar um — o passo de revisão recebe esse workspace direto. O `/attach` avulso
   segue com seus quatro passos, intacto. (Resolvido na verificação de coerência de 09/08: a redação
   original dizia `setup` no singular enquanto a composição dizia `SETUP_STEPS` no plural.)

5. **A ordem é `intro → setup → SystemPrecondition → final`.** Como nenhum passo é `REQUIRED` hoje, a
   ordem pesa menos do que pesaria; a pré-condição fica adjacente ao "Concluir", que é onde ela mais
   dói se ignorada.

### Persistência e propriedade dos fatos

6. **Agregado `Onboarding` por `ownerId`, no contexto `ui`.** Campos: `ownerId`, `currentStep`,
   `completedAt`. **Sem campo `state`**: nenhum passo coleta dado que não tenha tabela própria, e um
   saco genérico agora é convite a preenchê-lo com o que não devia.
   O contexto `ui` do codm é hoje BFF de leitura pura — sem `entities/`, sem `repositories/`, sem
   `middlewares/` — e **ganha os três por causa desta spec**, exatamente como no medscall, onde
   `Onboarding` e seu repositório vivem em `packages/api/src/ui/`. A alternativa considerada era o
   contexto `owner` (que já é completo e já é a fatia por dono); o founder escolheu `ui` em 09/08 para
   que o agregado, a leitura unificada, os comandos e o middleware vivam todos no mesmo contexto, em
   vez de espalhar o onboarding entre dois. Consequência aceita: o `ui` deixa de ser somente-leitura.

7. **Persistência no SQLite local, uma linha por `ownerId`.**

8. **Cada fato tem um dono e ninguém infere o do outro.** O servidor é dono de `completedAt` e
   `currentStep`. O banco é dono da satisfação dos passos de setup (derivada, nunca persistida — um
   canal apagado desfaz o passo, e isso é o certo). O cliente é dono das pendências do host. O
   servidor **nunca** ouve falar de `SystemPrecondition`: não enxerga o TCC da máquina, e o mesmo
   `ownerId` em dois Macs teria respostas diferentes.

9. **Uma leitura só.** `GET /onboarding` devolve `currentStep`, `completedAt` e a satisfação dos
   passos derivados de banco. **O `GET /ui/setup-checklist` morre**, junto com seu use case, e o
   painel do dashboard passa a consumir a leitura nova. Uma história, um endpoint.

10. **A API barra com `ONBOARDING_NOT_COMPLETED` enquanto não houver `completedAt`**, no espírito do
    `OnboardingMiddleware` do medscall, e é isso que faz o redirect para `/app` mandar ao
    `/onboarding`. Barrar a entrada uma vez é o modelo do Setup Assistant da Apple; o que não barra é
    a *capacidade* depois, que fica a cargo de cada tela.

    **O middleware é declarado POR CONTROLLER, e os controllers de setup ficam de fora.** Ele entra
    no `override middlewares` das leituras do console (dashboard, threads, issues) — a mesma forma
    como o `OperatorMiddleware` já é aplicado hoje (ver
    `packages/api/typescript/src/ui/controllers/GetAttachThreadWizard.ts`) — e **não** entra nos
    controllers que os passos de setup precisam chamar (conectar canal, criar workspace, vincular
    thread) nem nos do próprio `/onboarding`. Sem essa exclusão o wizard não conseguiria executar os
    próprios passos antes de `completedAt` existir, e o beco sem saída do Problem 2 reapareceria uma
    camada abaixo — barrado pela API em vez de pela UI. (Divergência encontrada na verificação de
    coerência de 09/08 e resolvida pelo founder: a redação original dizia "rotas protegidas" sem
    qualificar, o que incluía os próprios controllers de setup.)

### Fluxo

11. **Os passos de setup vivem DENTRO do wizard, reusando os componentes que já existem** — o QR de
    `ConnectChannelDialog`, o seletor de pasta de `AddWorkspaceDialog`, e `ContactStep` / `AgentsStep`
    / `ReviewStep` do `/attach` (o `WorkspaceStep` dele fica de fora — ver Decision 4). Não é wizard
    dentro de wizard: são as mesmas peças, achatadas em passos irmãos numa segunda composição. Por
    isso o wizard nunca navega para fora, e — combinado com a exclusão de middleware da Decision 10 —
    o bloqueio não cria beco sem saída nem na UI nem na API.

12. **A posição de abertura é o primeiro passo não vencido — nunca "slide 0".** Antes de concluir, é
    o `currentStep`. Depois de concluir, os passos de conteúdo já estão vencidos e o primeiro não
    vencido é justamente o que ficou pendente — o operador cai direto nele. É o que elimina o custo
    que a Decision 7 da spec anterior havia aceitado.

13. **Concluir é bloqueado APENAS por passos `REQUIRED`.** Como nenhum passo é `REQUIRED` hoje,
    concluir é sempre possível — mas como *consequência* da tabela, não como regra imposta. O
    `blocked` do `OnboardingFlow` deixa de existir, e com ele o "Pular" escondido e o botão inerte.

14. **O wizard é reentrável, e o reanúncio é uma vez por execução do app.** Sem `completedAt` → a
    guarda sempre leva ao `/onboarding`; com `completedAt` e algo pendente → leva **uma vez por
    abertura**, marcando que já anunciou; caso contrário → livre. O "já anunciei" vive em memória e
    morre com o processo. Sem ele, apertar "Concluir" devolveria o operador ao `/onboarding` no
    instante seguinte.

15. **O painel do dashboard é a superfície do que foi adiado.** Ele sobrevive com papel novo: deixa
    de ser uma segunda história e passa a mostrar os passos `DEFERRABLE` ainda não satisfeitos,
    alimentado pela mesma leitura do wizard. É o "badge nos Ajustes" do Setup Assistant.

16. **`PreconditionsGate` deixa de existir como componente e vira `useSystemPreconditions()`**, um
    hook montado na raiz pelo mesmo padrão de ponto-de-montagem fino que o `useDeepLinkAuth` já usa em
    `packages/app/react/src/routes/__root.tsx`. Sonda no mount, re-sonda no `focus`, publica no store.
    **Não redireciona** — quem redireciona é a guarda de onboarding, sobre o fato do servidor.

17. **Poda: três artefatos morrem.** `PreconditionList` (o `STEP_COMPONENTS` já despacha),
    `preconditions.ts` / `PRECONDITION_MODULES` (funde no `STEP_COMPONENTS`) e `PreconditionsSlide`
    (não existe "slide de pendências" quando cada pendência é um passo).

### Registro e reversão

18. **A taxonomia (`kind` × `impact`, as quatro fontes de satisfação) é documentada em
    `docs/FRONTEND.md`**, não só nesta spec — é conceito de arquitetura, não detalhe de uma feature.

19. **Esta spec REVERTE a Decision 6 e a AC-4 de
    `.specs/2026-08-08-preconditions-do-app-design.md`**, que dizem o oposto: lá `/onboarding`
    significa "há pendência" e qualquer flag persistida de "já vi" é proibida. A reversão fica
    nominal para quem ler as duas saber qual vale. O "já anunciei" da Decision 14 **não** é a flag que
    a AC-4 proibia: aquela esconderia o wizard para sempre; esta só evita reanunciar dentro de uma
    execução, e morre com o processo.

## User Stories

- **Story 1:** Como operador que abre o CODM pela primeira vez, quero ser conduzido do zero até
  funcionando sem sair da tela, para não ter que descobrir sozinho o que configurar.
  - Given nenhum `Onboarding` para o meu `ownerId`, when abro o app, then a API recusa as leituras do
    console com `ONBOARDING_NOT_COMPLETED` e sou levado ao `/onboarding`.
  - Given que estou no wizard, when chego ao passo do canal, then pareio o WhatsApp ali mesmo, sem
    navegar para `/channels`.
  - Given que percorri os passos, when concluo, then `completedAt` é gravado e o console abre.
  - Given que já concluí, when abro o app de novo, then vou direto ao console.

- **Story 2:** Como operador com pressa, quero pular o que não quero fazer agora e ainda assim entrar
  no console, para o produto não me prender numa tela de configuração.
  - Given passos de setup não satisfeitos, when clico em concluir, then entro no console mesmo assim.
  - Given que pulei, when chego ao dashboard, then o painel mostra exatamente o que ficou por fazer.
  - Given que resolvo um deles depois, when a leitura atualiza, then aquele item some do painel.

- **Story 3:** Como operador cuja permissão de disco foi revogada, quero cair direto na explicação
  daquela permissão, para não reler a apresentação nem descobrir o problema por um app que não
  funciona.
  - Given `completedAt` gravado e o Acesso Total ao Disco revogado, when abro o app, then sou levado
    ao `/onboarding` posicionado **naquele passo**, não no primeiro slide.
  - Given que já fui anunciado nesta execução, when navego pelo console, then não sou trazido de volta
    a cada tela.
  - Given que concedo a permissão nos Ajustes, when volto à janela, then a sonda roda de novo e o
    passo desaparece da lista.

- **Story 4:** Como desenvolvedor rodando `bun desktop:dev` sem a permissão no terminal, quero chegar
  ao console, para não ficar preso numa tela cujo reparo o próprio app diz não poder executar.
  - Given um host sem identidade atribuível e uma pendência, when abro o app, then vejo o passo com a
    orientação e consigo concluir e seguir.

- **Story 5:** Como desenvolvedor somando um passo novo, quero declarar `kind` e `impact` e registrar
  o componente, para não tocar no fluxo, na guarda nem no painel.
  - Given um `StepId` sem entrada em `STEP_COMPONENTS`, when o projeto compila, then `tsc` falha.

## Acceptance Criteria

- [ ] AC-1: Sem `Onboarding` concluído para o `ownerId`, os controllers que declaram o middleware
      respondem `ONBOARDING_NOT_COMPLETED` e o console leva o operador ao `/onboarding`; os
      controllers de setup e os do próprio `/onboarding` respondem normalmente (Decision 10).
- [ ] AC-2: Concluir grava `completedAt` para aquele `ownerId` e as mesmas rotas passam a responder.
- [ ] AC-3: O progresso é uma linha por `ownerId`; um segundo operador tem onboarding independente.
- [ ] AC-4: A composição dos passos é uma função pura de `pending` — sem objeto de contexto e sem
      predicado por passo.
- [ ] AC-5: `STEP_COMPONENTS` é exaustivo sobre `StepId`; um id sem entrada não compila.
- [ ] AC-6: Cada passo declara `kind` e `impact`, e ambos os enums carregam todos os valores da
      taxonomia — inclusive `REQUIRED` e `ADVISORY`, sem uso hoje.
- [ ] AC-7: A conclusão é bloqueada por um passo `REQUIRED` não satisfeito e por nada mais — provado
      por um passo `REQUIRED` de mentira num teste.
- [ ] AC-8: Com todos os passos `DEFERRABLE` insatisfeitos, concluir funciona.
- [ ] AC-9: A satisfação de um passo de setup é derivada do banco, nunca persistida: apagar o único
      canal faz o passo voltar a insatisfeito.
- [ ] AC-10: Com `completedAt` gravado e algo pendente, o wizard abre **naquele passo**, não no
      primeiro slide.
- [ ] AC-11: Com `completedAt` gravado e algo pendente, a guarda leva ao `/onboarding` **uma vez por
      execução**; navegações seguintes na mesma execução não são interceptadas.
- [ ] AC-12: O servidor não recebe nem persiste nenhum dado de `SystemPrecondition`.
- [ ] AC-13: `GET /ui/setup-checklist` não existe mais; o painel do dashboard consome a leitura de
      onboarding e mostra os `DEFERRABLE` não satisfeitos.
- [ ] AC-14: Os cinco passos de setup (`CHANNEL`, `WORKSPACE`, `CONTACT`, `AGENTS`, `REVIEW`)
      acontecem dentro do `/onboarding`, sem navegação para `/channels`, `/workspaces` ou `/attach`.
- [ ] AC-15: Conceder a permissão e devolver o foco remove o passo da lista sem recarregar o app —
      provado com a porta dublada e um evento de `focus` simulado (o ato nos Ajustes não é
      automatizável; o que se prova é a reação do console a uma sonda que mudou de resposta).
- [ ] AC-16: `PreconditionList`, `preconditions.ts` e `PreconditionsSlide` não existem mais — nem seus
      testes — e o console segue verde.
- [ ] AC-17: Nenhum identificador público chamado `Precondition*` sobrevive — Rust, bindings, porta,
      store e componentes falam `SystemPrecondition*`. Provado por um rail de arquitetura que varre
      Rust **e** TypeScript, não por um teste de comportamento.
- [ ] AC-18: `useSystemPreconditions()` sonda no mount e no `focus`, e não executa navegação nenhuma.
- [ ] AC-19: A taxonomia está documentada em `docs/FRONTEND.md`. **Sem gate automático** — é entrega
      de documentação, verificada por leitura.
- [ ] AC-20: Todo texto novo existe em `pt.json` e `en.json`, provado por um **teste de paridade de
      chaves** entre os dois arquivos. Este repo NÃO valida isso por tipo: a augmentação
      `typeof pt` está desligada em `packages/app/react/src/@types/i18next.d.ts` (estourava a
      profundidade de instanciação do TS), então `tsc` não pega chave faltando.
- [ ] AC-21: O snapshot `packages/api/typescript/tests/architecture/__snapshots__/mcp-exposure.test.ts.snap`
      deixa de listar `mcp__codm__GetSetupChecklist`, e o rail de exposição MCP segue verde.
- [ ] AC-22: A fiação de analytics do `HomeSection` (`setPersonProperties` com
      `channelDone`/`workspaceDone`/`threadDone`) passa a ler a leitura unificada, sem perder
      propriedade nenhuma do PostHog.

## Por que uma spec só

A decomposição foi proposta e recusada. A costura sugerida era **(A)** o modelo e o contrato —
agregado, migração, middleware, leitura unificada, taxonomia e wizard com os passos que já existem —
e **(B)** os passos de setup mais o painel como superfície do adiado. O argumento a favor era que
**A** torna **B** trivial: com registro, `kind`/`impact` e guarda no lugar, somar um passo de setup
vira criar o componente e acrescentar uma linha, enquanto fazer as duas juntas significa desenhar o
registro *e* preenchê-lo com quatro passos novos no mesmo fôlego — a forma medida de largar a cauda
(`.specs/2026-05-26-audit-distillation-what-we-got-wrong.md`).

O founder optou por uma spec só. A mitigação fica no `/plan`: com ~29 artefatos, ele passa do limiar
que aciona o `task-breakdown`, e a expectativa é que produza ondas com o contrato do backend
congelado antes de qualquer task de console.

## Dano colateral inventariado

Levantado na verificação de coerência de 09/08, com `grep`. Matar `GetSetupChecklist` atinge **sete**
lugares, não os dois que a redação original citava — e a ordem das frentes depende disso:

| arquivo | o que quebra |
|---|---|
| `packages/api/typescript/src/ui/{usecases,controllers}/GetSetupChecklist.ts` + os dois `index.ts` | os artefatos em si |
| `packages/api/typescript/src/ui/usecases/BffReads.test.ts` | teste direto do use case |
| `packages/api/typescript/src/thread/usecases/DeletedThreadReads.test.ts` | teste em OUTRO contexto que exercita "apagar a única thread desmarca `threadDone`" |
| `tests/architecture/__snapshots__/mcp-exposure.test.ts.snap` | o controller é ferramenta MCP (`static mcpScopes = [McpScope.system]`); o rail quebra sem atualizar o snapshot (AC-21) |
| `routes/(app)/dashboard/-components/HomeSection/index.tsx` | consome `useGetSetupChecklist` **e** alimenta `analytics.setPersonProperties` (AC-22) |
| `routes/(app)/dashboard/-components/SetupChecklist/index.tsx` | consome `GetSetupChecklistQueryResponse` |
| `services/AnalyticsService/AnalyticsService.ts` | docblock cita o hook pelo nome — comentário, mas envelhece |

**Consequência para a ordem das frentes:** a migração do painel do dashboard **tem de acontecer na
mesma frente que mata o endpoint**. Se o `bun sdk` rodar com o use case já deletado e o painel ainda
apontando para o hook antigo, `bun tsc` fica vermelho entre frentes — e a regra é que a frente
seguinte só começa com a anterior 100% verde. Isto também é o que a Decision 9 já dizia com outras
palavras: "uma história, um endpoint".

Da poda (Decision 17), os testes dos artefatos removidos vão junto —
`PreconditionList/index.test.tsx` e `preconditions.test.ts`. O `PreconditionsGate.test.tsx` é
reescrito para o hook `useSystemPreconditions()` em vez de apagado (o comportamento de sondar e
re-sondar continua; só o redirect sai). O `FullDiskAccessCard` sobrevive à poda e entra na
renomeação da Decision 1.

## Risks & Migration

Não existe onboarding hoje, então todo `ownerId` existente nasce **sem** `Onboarding` e a Decision 10
o manda ao `/onboarding` na primeira abertura depois do deploy. É o comportamento correto — ninguém
viu a apresentação —, mas é uma mudança visível para quem já usa o app.

A migração cria uma tabela nova, sem backfill e sem tocar linha existente.

A renomeação `Precondition*` → `SystemPrecondition*` atravessa as bindings geradas por tauri-specta,
que são commitadas. Um `cargo test` regenera; o risco é um commit sair com Rust renomeado e bindings
antigas, que o `bun tsc` pega.

**O ponto de maior risco da estimativa, verificado e não suposto:** `ConnectChannelDialog` e
`AddWorkspaceDialog` estão soldados à casca de diálogo. Ambos importam `DialogContent`,
`DialogHeader` e `DialogTitle` de `@/components/ui/dialog` e chamam `useDialogStore().hide` para
fechar; o `AddWorkspaceDialog` chega a tipar suas props como
`Pick<ComponentProps<typeof DialogContent>, 'className'>`. Reusá-los como conteúdo de passo exige
extrair o miolo — o pareamento por QR com seu polling, e o seletor de pasta com seu form — para
componentes que não conhecem diálogo nem `hide()`, deixando as cascas atuais como invólucros finos
sobre esse miolo. São dois refactors de código em produção que hoje funciona, com seus testes junto.
É aqui que esta spec tem mais chance de estourar, e é o primeiro lugar onde o `/plan` deve olhar ao
formar as ondas.

## Open Questions

Nenhuma. Nomenclatura, taxonomia, ordem, propriedade dos fatos, persistência, escopo dos passos de
setup, papel do painel e reversão foram decididos pelo founder durante este brainstorm.
