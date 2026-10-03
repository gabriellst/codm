# MCPs de terceiros — o agente ganha ferramentas fora do produto

**Date:** 2026-09-02
**Status:** Draft
**Bounded Context:** cross-context — `agent` (cadastro, proxy, gate), `thread` (stops), `ui` (console), `contracts` (enums novos)
**Kind:** feature
**Story Points:** 13 — proxy MCP novo (o daemon vira cliente MCP e dono de ciclo de vida de processo), agregado + migração, e um gate de aprovação atravessando `agent` → `thread` → console.

## Context

O CODM já fala MCP, mas só numa direção: **o daemon é um servidor**. `McpDoorController`
(`packages/api/typescript/src/agent/mcp/door.ts`) monta uma porta JSON-RPC em `/mcp/:scope`,
deliberadamente fora do OpenAPI, com token de run opaco resolvido **a cada chamada** e escopos
(`McpScope`). As ferramentas não são escritas à mão: `agent/mcp/exposure.ts` varre os barrels de
controllers procurando `static mcpScopes`, e o servidor por escopo é gerado por `@kubb/plugin-mcp` a
partir da mesma OpenAPI que gera a SDK — *uma ferramenta É um controller*.

Do lado do spawn, os dois runners declaram **exatamente um** servidor para o CLI: `ClaudeAgentRunner`
serializa `{ mcpServers: { codm: … } }` em `--mcp-config`
(`agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.ts:624`) e `CodexAgentRunner` escreve
`-c mcp_servers.codm.*` (`agent/services/AgentRunner/CodexAgentRunner/CodexAgentRunner.ts:483`). A
chave `codm` e o prefixo de fio vivem num único módulo folha, `agent/mcp/wire.ts` (`MCP_SERVER_KEY`,
`MCP_TOOL_WIRE_PREFIX`). `AgentMcpInvocation` (`agent/types/AgentMcpInvocation.ts`) é, hoje,
**singular**: um transporte, um token, uma lista `allowedTools`.

A máquina de aprovação **já existe inteira e está no contrato congelado**: `StopKind.APPROVAL_NEEDED`
e `StopResolution.APPROVE`/`DENY` (`packages/contracts/src/wire/enums/`), `DeclareStop`
(`agent/usecases/DeclareStop.ts`) levantando, `ResolveStop` (`thread/usecases/ResolveStop.ts`)
respondendo e validando que a resolução casa com o kind, e o card Needs-you renderizando. O que falta
não é vocabulário: hoje **quem pede aprovação é o modelo, voluntariamente**, via a ferramenta
`RaiseStop` — um gate mole.

Dois anexos completam o terreno. `agent` já tem agregado e repositório (`AgentSession` +
`AgentSessionRepository`), então um registro novo cabe ali sem contexto novo; e `Workspace`
(`workspace/entities/Workspace.ts`) é o precedente exato da forma — *"uma pasta de projeto que o
operador registrou"*, agregado fino cuja única invariante com dentes é unicidade. No console,
`routes/(app)/settings/` já existe. E `ProcessTree` (`core/src/utils/ProcessTree.ts`) descreve, no
próprio docblock, a topologia que este spec inverte: *"um CLI de provedor spawna filhos próprios
(hooks, servidores MCP — um dos quais é cliente nosso)"*.

## Problem

1. O agente só alcança o que o CODM expõe. Nada fora do produto — navegador, arquivos, shell, APIs de
   terceiros — é alcançável, por mais que o ecossistema MCP já tenha servidor pronto para isso.
2. Pedidos concretos do operador não têm caminho nenhum. *"Cancela a assinatura tal"* exige navegar
   num site, e hoje isso não é representável.
3. `AgentMcpInvocation` sendo singular, não existe ponto no modelo onde um segundo servidor caberia,
   nem sequer para experimentar.

## Goal

O dono cadastra servidores MCP na máquina dele — navegador, filesystem, shell, o que o ecossistema
oferecer — e os agentes do CODM passam a operar com essas ferramentas além das nossas, pelo canal,
com o produto no caminho de toda chamada sensível: uma ação de alto impacto não executa antes de o
dono aprovar, e o pedido chega no mesmo card Needs-you que ele já usa.

## Decisions

1. **Consumir, não expor.** Este spec abre a direção *agente → MCPs de terceiros*. Expor o CODM como
   servidor MCP para clientes externos (Claude Desktop, Cursor) fica de fora.
2. **O cadastro é global do dono.** Uma lista só na máquina; todo run de todo agente enxerga os
   servidores habilitados. Refinar por workspace, thread ou agente é spec futuro.
3. **Cadastro por formulário tipado**, validado contra o schema da SDK — não colagem de `.mcp.json`
   nem importação de `~/.claude.json` / `~/.codex/config.toml`.
4. **Escopo inclui shell e filesystem local**, não só navegador. O raio de ação é a máquina inteira, e
   é isso que torna a decisão 6 obrigatória em vez de opcional.
5. **Entrega por PROXY, não por passthrough.** O CLI continua conhecendo **um** servidor (`codm`). O
   daemon passa a ser também *cliente* MCP: conecta nos cadastrados, agrega o `tools/list` deles no
   nosso e encaminha o `tools/call`. Assim o gate e a auditoria são idênticos nos dois CLIs, sem
   depender de feature de provedor — e sem repetir o erro que o commit `6765ec46` corrigiu (portar a
   declaração de MCP do claude para o codex sem medir).
6. **O gate recusa e pergunta; nunca bloqueia.** Numa ferramenta marcada `ASK`, o proxy não chama o
   upstream: persiste a chamada, levanta `APPROVAL_NEEDED` e devolve erro tipado ao modelo. Isso
   respeita a razão já registrada em `AskOperator` — *"numa noite com ninguém acordado, uma ferramenta
   bloqueante penduraria o run até o watchdog"*.
7. **A aprovação não executa a chamada.** APPROVE grava a permissão; o turno seguinte do agente refaz
   o `tools/call`, que agora passa. Executar no ato colocaria o daemon rodando ferramenta fora de um
   run — sem token, sem identidade e sem turno para receber o resultado.
8. **A permissão é confinada ao run/issue que a originou.** Aprovar uma vez não abre a ferramenta para
   sempre; "sempre permitir" é refinamento futuro.
9. **Reaproveitar o vocabulário de stop existente.** Nenhum `StopKind` novo, nenhuma `StopResolution`
   nova, nenhum card novo — `APPROVAL_NEEDED` + `APPROVE`/`DENY` já cobrem.
10. **A `key` do servidor namespeia as ferramentas.** Uma ferramenta upstream entra na nossa porta como
    `<key>__<tool>` e chega ao CLI como `mcp__codm__<key>__<tool>`. `wire.ts` não muda: o prefixo
    continua reconhecendo tudo como nosso, e o guard anti-double-publish segue correto.
11. **Credencial mora no SQLite do `$CODM_DATA_DIR`, não no keychain.** As tabelas `whatsmeow_*` já
    vivem nesse arquivo e carregam a sessão do WhatsApp, então material de credencial já reside ali; um
    keychain só para MCP criaria um segundo domicílio de segredo e exigiria o daemon (Bun) falar com o
    keychain, coisa que hoje só o shell Tauri faz.
12. **O daemon assume o ciclo de vida dos processos stdio upstream**, via o `ProcessTree` que já
    existe — incluindo a estratégia de Windows, onde não há grupo de processo a sinalizar.
13. **Um spec só.** Dividir em (A) cadastro + proxy e (B) gate entregaria uma fase A ligável em que uma
    mensagem injetada no WhatsApp roda comando local. Como a decisão 4 põe shell no escopo, A sozinha
    não é entregável.
14. **Ferramentas upstream entram APENAS no escopo `issue-handling`.** Não em `orchestration`, não em
    `system`. `orchestration` é a superfície que lê texto de grupo escrito por terceiros — a ameaça que
    o docblock de `AgentRunIdentity` nomeia ao explicar por que `entryId` não é argumento de ferramenta
    — e ligar shell nela seria ligar shell direto no texto não-confiável. `system` é administração do
    dono. O fluxo do produto já serve o caso motivador sem isso: o Orchestrator ouve *"cancela a
    assinatura tal"*, forka uma issue, e é o `IssueWorkAgent` — que roda confinado a essa issue — quem
    navega.
15. **A fronteira é o registro por escopo no servidor, não `--allowedTools`.** `CodexAgentRunner` não
    tem mecanismo de allowed-tools nenhum; só o claude tem. O código já diz a regra: a lista no cliente
    é a metade cliente, e só o scope match no adapter é fronteira. Uma ferramenta upstream é
    registrada no servidor gerado do escopo `issue-handling` e portanto **não existe** para um token de
    outro escopo, independentemente do CLI.
16. **A decisão 14 é o que faz a decisão 9 fechar.** Todo run que alcança uma ferramenta upstream é
    issue-scoped, logo carrega `issueId` — que é exatamente o campo obrigatório de `DeclareStop`. Sem a
    decisão 14 o gate seria irrepresentável para o Orchestrator, que estruturalmente não tem esse campo.
17. **A permissão é chaveada por hash canônico de `(key do servidor, nome da ferramenta, argumentos)`**,
    com os argumentos serializados de forma estável (chaves ordenadas), somado ao run que a originou.
    Sem chave canônica, "a mesma chamada" não é decidível: um espaço a mais viraria outra chamada, e
    uma chamada diferente poderia casar com a permissão errada.
18. **O dono pode pré-aprovar tudo, e esse switch é o `approvalNeeded` que já existe.** `StopPolicy`
    (`thread/repositories/StopPolicyConfigRepository`) é uma linha de settings por dono com
    `approvalNeeded: boolean`, já renderizada na tela como `stopCriteria` e já lida por quem levanta
    stop. Desligá-la é o equivalente do modo perigoso: nada é perguntado, tudo executa. **Não** existe
    um segundo booleano de "pré-aprovar MCP" — um campo novo significando "não me pergunte sobre
    aprovação" seria redeclaração de uma decisão que já tem dono, exatamente o que o CLAUDE.md proíbe.
19. **A política efetiva é uma função pura, num único lugar.** `ASK` sobrevive apenas quando o servidor
    pede E o dono quer ser perguntado; em qualquer outra combinação a chamada executa. Isso mata por
    construção o estado em que o gate quer levantar um stop que a política proíbe — uma chamada
    NUNCA fica bloqueada sem caminho de aprovação.
20. **`AUTO` e o pré-aprovado global são decisões diferentes e ambas ficam.** `AUTO` por servidor é "este
    servidor é seguro" (um MCP de docs read-only); o global é blanket e alcança também os servidores
    cadastrados depois.

21. **A política aceita override POR FERRAMENTA, além da do servidor.** Medido contra o caso de uso
    principal: `browser-use` — servidor MCP oficial, stdio (`uvx --from 'browser-use[cli]' browser-use
    --mcp`) — publica no MESMO servidor ferramentas granulares (`browser_navigate`, `browser_click`,
    `browser_type`, `browser_get_state`) e uma autônoma, `retry_with_browser_use_agent`, descrita como
    *"run a complete browser automation task with an AI agent"*. Com política só por servidor o dono
    escolheria entre inutilizável (`ASK` pedindo aprovação a cada clique) e inseguro (`AUTO` liberando
    junto a ferramenta que executa uma sessão inteira dirigida por outro modelo). O override é o que
    torna o caso motivador — *"cancela a assinatura tal"* — utilizável e gateado ao mesmo tempo.
    Resolução: override da ferramenta quando existir, senão a do servidor; o resto da regra 19 não muda.
22. **Um servidor MCP de terceiro pode rodar o próprio modelo, e o gate fica ANTES disso, não dentro.**
    `browser-use` carrega a própria API key e o próprio loop de agente, então o conteúdo da página entra
    no modelo DELE. Nosso ponto de controle é a fronteira do `tools/call`; o que acontece depois de uma
    chamada aprovada é opaco para nós. É a razão de a ferramenta autônoma nascer `ASK` mesmo num
    servidor `AUTO`.

## User Stories

- **Story 1:** Como dono, quero cadastrar um MCP de navegador e pedir pelo WhatsApp *"cancela minha
  assinatura da X"*, para que o agente resolva sozinho o que hoje eu faço à mão.
  - Given um servidor de navegador cadastrado, habilitado e com política `AUTO`, when o Orchestrator
    forka a issue e o `IssueWorkAgent` chama uma ferramenta dele, then a chamada é encaminhada ao
    upstream e o resultado volta ao modelo.
  - Given esse mesmo servidor, when é o turno do Orchestrator (escopo `orchestration`), then nenhuma
    ferramenta upstream aparece — o trabalho acontece na issue, não na conversa.
  - Given o mesmo servidor desabilitado, when o run começa, then nenhuma ferramenta dele aparece para o
    modelo.

- **Story 2:** Como dono, quero que uma ferramenta que mexe na minha máquina peça minha aprovação antes
  de rodar, para que uma mensagem mal-intencionada no canal não execute comando local.
  - Given um servidor de shell com política `ASK`, when o agente chama uma ferramenta dele, then nada é
    executado no upstream e um stop `APPROVAL_NEEDED` aparece no card Needs-you com o servidor, a
    ferramenta e os argumentos.
  - Given esse stop, when eu respondo APPROVE, then a mesma chamada no turno seguinte é encaminhada.
  - Given esse stop, when eu respondo DENY, then a repetição da chamada volta a ser recusada.

- **Story 3:** Como dono, quero ver e administrar meus servidores no console, para saber o que meus
  agentes conseguem fazer.
  - Given a tela de settings, when abro a seção de MCP, then vejo cada servidor cadastrado, se está
    habilitado, sua política e as ferramentas que ele expôs.

- **Story 4:** Como desenvolvedor mantendo o daemon, quero que um upstream quebrado não derrube a
  porta, para que um servidor mal configurado não deixe o agente sem ferramenta nenhuma.
  - Given um servidor cadastrado que não conecta, when o agente pede `tools/list`, then as nossas
    ferramentas voltam normalmente e a falha do upstream é reportada no console.

## Acceptance Criteria

- [ ] AC-1: Cadastrar um servidor cuja `key` colida com um operationId já exposto é recusado com erro
      tipado, e o teste prova que nenhuma linha foi gravada contando linhas, não pela ausência de
      exceção.
- [ ] AC-2: `key` é única por dono, com índice único no SQLite além da checagem no use case — mesma
      postura da unicidade de path em `AddWorkspace`.
- [ ] AC-3: Com um servidor STDIO habilitado, `tools/list` em `/mcp/:scope` devolve as ferramentas
      geradas MAIS as do upstream, cada uma nomeada `<key>__<tool>`.
- [ ] AC-4: Contra um `claude` real, a ferramenta upstream chega ao modelo com o nome de fio
      `mcp__codm__<key>__<tool>` — medido, não portado, na mesma forma que a convenção original foi
      medida.
- [ ] AC-5: A declaração entregue aos dois CLIs continua nomeando **um** servidor (`codm`) — verificado
      nos dois runners. No claude, a lista `--allowedTools` inclui as upstream habilitadas; no codex,
      que não tem mecanismo de allowed-tools, a ausência dessa lista é a expectativa e não uma falha.
- [ ] AC-6: Um token de escopo `orchestration` ou `system` não enxerga ferramenta upstream nenhuma:
      `tools/list` nesses escopos devolve só as geradas, e um `tools/call` nomeando uma upstream é
      recusado pelo servidor. Vale para os dois CLIs, porque a fronteira é o registro por escopo e não
      a lista no cliente.
- [ ] AC-7: `tools/call` numa ferramenta de servidor `AUTO` encaminha ao upstream e devolve o resultado
      dele ao modelo sem reescrita.
- [ ] AC-8: `tools/call` numa ferramenta de servidor `ASK` não invoca o upstream — provado contando
      invocações no processo upstream (zero) — e devolve `isError` ao modelo.
- [ ] AC-9: Essa mesma chamada levanta um stop `APPROVAL_NEEDED` carregando servidor, ferramenta e
      argumentos, e o stop aparece na consulta de stops abertos.
- [ ] AC-10: APPROVE grava a permissão e a repetição do mesmo `tools/call` encaminha ao upstream; DENY
      não grava, e a repetição é recusada de novo.
- [ ] AC-11: A permissão casa por hash canônico: os mesmos argumentos com chaves em outra ordem ou
      espaçamento diferente CASAM, e um argumento com valor diferente NÃO casa — recusado de novo.
- [ ] AC-12: Uma chamada idêntica vinda de outro run é recusada mesmo depois do APPROVE, provando o
      confinamento da decisão 8.
- [ ] AC-13: Encerrar um run — normal, erro ou cancelamento — derruba os processos stdio upstream que o
      daemon spawnou, sem filho vazado, em POSIX e em Windows.
- [ ] AC-14: Um servidor desabilitado não aparece nem em `tools/list` nem na lista de ferramentas
      permitidas entregue ao CLI.
- [ ] AC-15: Um upstream que não conecta não derruba a porta: `tools/list` responde com as nossas
      ferramentas e a falha fica visível no console.
- [ ] AC-16: A seção de settings lista, cadastra (form validando contra o schema da SDK),
      habilita/desabilita, troca a política e remove um servidor.
- [ ] AC-17: Com `stopCriteria.approvalNeeded` desligado, uma ferramenta de servidor `ASK` **executa**
      sem levantar stop e sem gravar aprovação — o modo pré-aprovado. Nenhuma combinação de política
      produz uma chamada bloqueada sem caminho de aprovação.
- [ ] AC-18: A resolução da política efetiva é uma função pura testada nas quatro combinações de
      (`approvalPolicy` do servidor × `approvalNeeded` do dono), e é o único lugar do código que decide
      entre gatear e executar.
- [ ] AC-19: A tela de settings deixa explícito, no ponto do toggle, que desligar `approvalNeeded`
      pré-aprova também as ferramentas externas — incluindo as de servidores cadastrados depois.
- [ ] AC-20: Num servidor `AUTO` com override `ASK` numa ferramenta, a ferramenta com override é gateada
      e as demais executam — provado na mesma chamada de política, com o cenário do `browser-use`
      (`browser_click` executa, `retry_with_browser_use_agent` gateia).
- [ ] AC-21: `bun tsc`, `bun lint`, `bun run test` e o gate `db:check-go` passam.

## Arquitetura — onde cada peça encaixa

**O agregado.** `agent/entities/McpServer.ts`, na forma de `Workspace`: `ownerId`, `key`, `transport`
(`STDIO` com command/args/env, `HTTP` com url/headers), `enabled`, `approvalPolicy` (`AUTO` | `ASK`),
`addedAt`. Tabela em `packages/contracts/src/db/sqlite/agent.ts`, migração por `bun migrate:create`,
espelhada no embed Go por `db:sync-go` (o gate exige as duas cópias byte-a-byte iguais, mesmo o Go não
lendo estas tabelas).

**O proxy.** `door.buildTransport(scope)` hoje carrega o servidor gerado e conecta. Passa a registrar,
**no mesmo `McpServer`, antes do `connect()`**, as ferramentas upstream — o que se encaixa exatamente na
decisão já tomada e documentada ali de construir servidor e transporte frescos a cada request. Um
`McpUpstreamRegistry` mantém um cliente por servidor habilitado, cacheia o `tools/list` deles e usa
`ProcessTree` para spawnar e derrubar os stdio. As ferramentas upstream são registradas **apenas no
servidor gerado do escopo `issue-handling`** (decisão 14), e é esse registro — não a lista entregue ao
cliente — que constitui a fronteira.

**A política efetiva.** Um módulo folha, `agent/mcp/approvalPolicy.ts`, com uma função pura de
(`approvalPolicy` do servidor, `approvalNeeded` do dono) → gatear ou executar. É o ÚNICO lugar que
decide isso; o handler do proxy chama e obedece. Escrito como função e não como cadeia de `if`
espalhada porque as quatro combinações precisam ser testáveis de uma vez, e porque a combinação
perigosa — servidor pedindo `ASK` com o dono recusando ser perguntado — só é segura se alguém a
resolveu explicitamente.

**Identidade numa ferramenta proxiada.** Uma ferramenta nossa é um controller alcançado por HTTP, então
`AgentIdentityMiddleware` resolve o token no destino. Uma ferramenta upstream não passa por HTTP nem por
controller: o handler roda dentro da porta. Logo o proxy resolve a identidade ele mesmo, pelo
`AgentIdentityService` que o `McpDoorController` já injeta e já usa para o scope match — é dali que saem
`ownerId`, `threadId` e `issueId` do stop, nunca de argumento do modelo.

**O que muda de forma.** `toolsInScope` deixa de ser derivação puramente estática do OpenAPI: o agente
passa a consultar o registry para montar a lista de ferramentas permitidas. `AgentToolName` já é
`string` por decisão anterior (a lista fechada foi deliberadamente abandonada), então nomes upstream
não quebram o tipo.

## Riscos & Migração

- **`tools/list` deixa de ser função pura do OpenAPI.** A promessa "uma ferramenta É um controller"
  passa a valer só para as nossas; as upstream são descobertas em runtime. O rail que garante que todo
  controller está no barrel continua válido, mas não cobre mais o conjunto inteiro exposto.
- **Latência.** Toda chamada upstream ganha um hop pelo nosso processo. Aceito: é o preço do ponto
  único de gate.
- **Inversão de posse de processo.** Servidores stdio deixam de ser filhos do CLI e viram filhos do
  daemon. O docblock de `ProcessTree.ts` descreve a topologia antiga e precisa ser atualizado junto.

## Fora de escopo

- Computer-use nativo no shell Tauri (screenshot, mouse, teclado) — spec próprio.
- Expor o CODM como servidor MCP para clientes externos.
- Catálogo curado de MCPs com instalação em um clique.
- Cadastro por workspace, thread ou agente.
- "Sempre permitir esta ferramenta" (allowlist incremental).
- Ferramentas upstream nos escopos `orchestration` e `system` (decisão 14). Se um dia a conversa
  precisar de ferramenta externa, isso é um spec com sua própria análise de superfície de injeção.

## Open Questions

1. **Qual `FactSource` o stop levantado pelo proxy carrega?** A distinção existente é DECLARED (o modelo
   disse) × INFERRED (o runner observou), e um stop levantado pelo proxy não é limpo nem num nem noutro:
   a intenção é do modelo, a decisão de parar é nossa. Resolver em `/plan` antes de escrever o use case
   — a coluna não pode passar a mentir.
2. ~~**Onde a política `ASK` incide: no servidor ou na ferramenta?**~~ **FECHADA** pela decisão 21: nos
   dois, com a da ferramenta sobrepondo a do servidor. Deixou de ser hipotética quando o `browser-use`
   foi verificado — ele publica, no mesmo servidor, ações granulares e uma ferramenta autônoma. A
   antiga formulação da questão dizia: se na prática um servidor misturar leitura inofensiva com
   escrita destrutiva, a
   granularidade por ferramenta vira necessária — mas o `tools/list` que o proxy já faz dá a base para
   isso sem retrabalho de modelo.
