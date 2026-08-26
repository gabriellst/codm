# MCP como Capacidade do Core

**Date:** 2026-07-29
**Status:** Approved
**Bounded Context:** core + agent + contracts
**Kind:** refactor
**Story Points:** 13 — cruza `packages/contracts` (enum novo, geração de bindings), `core` (McpAdapter, AgentIdentityService, AgentIdentityMiddleware — capacidade nova do template) e `agent` (manifest.ts/register.ts/router.ts/identity.ts/RunTokenService morrem ou são renomeados, todo controller MCP-exposto muda), com renames que atravessam ~15 arquivos e uma migração de dado-de-tipo (RunTokenClaims → AgentRunIdentity).

## Context

Hoje o servidor MCP do CodeDM é gerado por `@kubb/plugin-mcp` a partir do OpenAPI — "uma tool É um controller". A exposição de um controller como tool passa por um **manifesto central**, `packages/api/typescript/src/agent/mcp/manifest.ts`, com sete estruturas paralelas sincronizadas à mão: `MCP_SCOPE_NAMES` (tupla dos 3 scopes), `SCOPE_CONFINEMENT` (`Record<McpScope, 'issue'|'thread'>`), `MCP_SCOPES` (`Record<McpScope, ControllerClass[]>` — a lista real), `TOOLS_IN_SCOPE`/`toolsInScope()` (nomes de wire derivados), `MCP_SCOPE_BY_OPERATION` (índice reverso operationId→scopes) e `ISSUE_HANDLING_OPERATION` (chaveamento por label pro e2e driver). Esse manifesto é publicado no `core` via um módulo de side-effect, `agent/mcp/register.ts` (`registerMcpScopes(MCP_SCOPE_BY_OPERATION)`), que popula um `Map` global em `core/src/utils/McpScopeRegistry.ts`; o emitter OpenAPI (`core/src/utils/OpenAPI.ts:849`, `buildOperation()`) lê esse Map via `mcpScopesFor(operationId)` para escrever `x-mcp-scope` e a tag sintética `mcp:<scope>` — e `buildOperationId()` (linha 876-884, `controller.constructor.name.replace('Controller', '')`) tem sua regra **copiada à mão** em `manifest.ts:233` (`operationIdOf`), com um teste (`tests/architecture/mcp-manifest.test.ts`) garantindo set-equality entre as duas cópias.

`McpRouterController` (`agent/mcp/router.ts`) é o adaptador HTTP: stateless, verifica+walk+dispatch por request (decisão medida — sessão memoizada quebrava com `Stateless transport cannot be reused across requests`). Por request: resolve o scope do path (`resolveScope`, contra `MCP_SCOPE_NAMES`), lê o run token, chama `RunTokenService.verify()`, checa `claims.scope === scope`, e — só para mensagens `tools/call` — corre `assertIdentityMatchesClaims` (`agent/mcp/identity.ts`) sobre o corpo JSON-RPC inteiro, ANTES de despachar pro transporte. Esse walk é genérico: `IDENTITY_KEYS = ['ownerId', 'issueId', 'threadId']` hardcoded, percorre `args` em profundidade e compara qualquer chave desse deny-list contra `RunTokenClaims`, pulando (não rejeitando) claims ausentes — é essa lacuna que faz `SteerIssueTurnController` e `ForkIssueController` terem que checar ownership manualmente no próprio `handle()` (`claims.threadId !== threadId`, e no caso do Steer, `openIssues.openIssues(threadId).some(issue => issue.issueId === issueId)`), porque o scope `orchestration` não carrega `issueId` nas claims. O carregamento do server gerado é por mapa estático de 3 imports (`GENERATED_SERVERS`), não por template-literal — medido: bundler não resolve import dinâmico contra o export map do workspace.

Separadamente, `ForkIssueController` e `SteerIssueTurnController` já usam `RunTokenMiddleware` (`agent/middlewares/RunTokenMiddleware.ts`) para estampar `ctx.runClaims` a partir do header `MCP_RUN_TOKEN_HEADER` — cada um redeclarando `RunClaimsCtxSchema` localmente porque o schema do controller precisa nomear o que o middleware injeta (Zod descarta chave não declarada). Isso é a "injeção de argumento à distância" citada nas decisões: o valor chega via header/claims, não via schema de input, e cada controller reimplementa a ponte.

`RunTokenClaims` (`agent/services/RunTokenService/RunTokenService.ts`) tem `ownerId`, `issueId?`, `threadId`, `entryId?`, `agentName`, `scope: McpScope`, `expiresAt`. `SCOPE_CONFINEMENT` é lido em `Agent.ts:151` (`agent/types/Agent.ts`, dentro de `buildMcpInvocation`) para decidir se `input.issueId` é obrigatório antes de `mint()` — a única checagem de "este scope exige issueId" hoje.

O idioma de middleware já existente no codebase é auto-declaração por controller: `override middlewares = [OperatorMiddleware]` (instância, não estático) em ~20 controllers, e `override middlewares = [OperatorMiddleware, RunTokenMiddleware]` em `ForkIssue`/`SteerIssueTurn`. `Controller` (base, `core/src/types/Controller.ts:72`) declara `middlewares: (Middleware | MiddlewareClass)[] = []` como propriedade de instância — o emitter (`OpenAPI.ts`), por sua vez, já lê algo do controller sem instanciá-lo (a classe crua chega via `router.controllers`, já instanciada pelo DI antes do `generateSpecification`).

`packages/contracts` já hospeda todo enum cross-boundary (`wire/enums/*.tsp` → `generated/typescript/src/wire/enums/*.ts`, ex.: `StopKind` em `wire/enums/stop-kind.tsp`, importado em `wire/main.tsp`, consumido como `@codedm/contracts-typescript/wire/enums`). `McpScope` hoje é uma tupla `as const` local em `manifest.ts`, fora dessa pipeline.

Nenhuma skill do repo (`(.claude/skills/agent|controller|middleware)`) documenta hoje o padrão de exposição MCP ou de identity — a busca por `manifest|SCOPE_CONFINEMENT|mcpScope|IDENTITY_KEYS|RunToken` nos registries dessas três skills não retorna nada.

## Problem

O manifesto centraliza a exposição MCP em sete listas que precisam ficar sincronizadas manualmente (`MCP_SCOPE_NAMES`, `SCOPE_CONFINEMENT`, `MCP_SCOPES`, `TOOLS_IN_SCOPE`, `MCP_SCOPE_BY_OPERATION`, `ISSUE_HANDLING_OPERATION`, e a cópia de `operationIdOf`) — o que um controller expõe como tool vive longe do próprio controller, ao contrário de todo outro cross-cutting concern do codebase (middleware é auto-declarado). A identidade (`IDENTITY_KEYS`) é um deny-list de 3 strings hardcoded em `identity.ts`, cego ao fato de que scopes diferentes têm formas de identidade diferentes (`issue-handling` exige `issueId`; `orchestration` não tem `issueId` e por isso `ForkIssue`/`SteerIssueTurn` reimplementam ownership check no `handle()`). `SCOPE_CONFINEMENT` é um `Record` paralelo que só existe pra essa checagem única em `Agent.ts:151`. E `McpScope` vive fora de `packages/contracts`, quebrando a convenção de que todo enum cross-boundary tem essa origem.

## Goal

Fazer da exposição MCP e da identidade de agente **capacidades do core** (agnósticas de produto): um controller se auto-declara exponível (`static mcpScopes`, idioma de `middlewares`), um agente se auto-declara com sua própria forma de identidade (`static IdentitySchema`), e a checagem de "essa chamada é da própria identidade" migra do walk genérico no router para um middleware tipado aplicado automaticamente no controller de destino. Eliminar as sete estruturas paralelas do manifest, o `Map` global e o deny-list hardcoded, movendo `McpScope` para `packages/contracts`.

## Decisions

1. **`McpScope` vira enum em `packages/contracts`** — `wire/enums/mcp-scope.tsp` (mesmo padrão de `stop-kind.tsp`), importado em `wire/main.tsp`, gerando `packages/contracts/generated/typescript/src/wire/enums/mcp-scope.ts`, consumido via `@codedm/contracts-typescript/wire/enums` (`ISSUE_HANDLING`, `ORCHESTRATION`, `SYSTEM` — mesmos 3 valores de `MCP_SCOPE_NAMES` hoje).

2. **Exposição por auto-declaração no controller**: `static mcpScopes = [McpScope.X]` no próprio controller, no idioma já usado por `middlewares`. O emitter (`core/src/utils/OpenAPI.ts`, `buildOperation()`) lê esse static direto da classe do controller na varredura — sem passar por registro de side-effect — e escreve `x-mcp-scope` e a tag `mcp:<scope>` como hoje. Morrem: `agent/mcp/manifest.ts` inteiro (`MCP_SCOPE_NAMES`, `MCP_SCOPES`, `SCOPE_CONFINEMENT`, `MCP_SCOPE_BY_OPERATION`, `operationIdOf` duplicado), `agent/mcp/register.ts` (o side-effect), `core/src/utils/McpScopeRegistry.ts` (o `Map` global e `registerMcpScopes`/`mcpScopesFor`). `TOOLS_IN_SCOPE`/`toolsInScope()` e `ISSUE_HANDLING_OPERATION` morrem como listas mantidas à mão — os agentes e o `E2eMcpDriver` passam a computar a mesma expansão (operationId → wire name) varrendo os controllers pelo `static mcpScopes`, no lugar de ler a constante pré-computada.

3. **Identidade por auto-declaração no agente**: cada classe de agente declara `static IdentitySchema` (Zod) — `IssueWorkAgent.IdentitySchema` com `issueId` obrigatório, `OrchestratorAgent.IdentitySchema` sem esse campo. O parse acontece **no spawn** (dentro de `Agent.buildMcpInvocation`, no lugar do `if (SCOPE_CONFINEMENT[scope] === 'issue' && !input.issueId) throw` de `Agent.ts:151`) — identidade inválida nunca chega a virar credencial (nunca chama `.mint(`). `SCOPE_CONFINEMENT` morre. Renomeações: `RunTokenClaims` → `AgentRunIdentity`; `RunTokenService` (classe abstrata + binding) → `AgentIdentityService`, com os verbos `issue`/`resolve`/`revoke` (era `mint`/`verify`/`revoke`) — mesma cardinalidade de chamador único por verbo (`issue`: base `Agent`; `resolve`: middleware do controller de destino; `revoke`: `AgentRunner` no fim do run).

4. **Segurança no destino via `AgentIdentityMiddleware`**, aplicado automaticamente a todo controller que declara `mcpScopes` (sem precisar listá-lo manualmente em `middlewares`, ao contrário de `OperatorMiddleware`): run-token presente → resolve a identidade (`AgentIdentityService.resolve`) e compara, chave a chave, os campos que a identidade tipada da requisição corrente carrega contra `params`/`body` do controller — tipado pelo `IdentitySchema` do agente que emitiu o token, não mais o walk genérico sobre `IDENTITY_KEYS`. Em caso de match, estampa `ctx.agentIdentity`. `ForkIssueController` passa a ler `entryId` de `ctx.agentIdentity` — fim do padrão de cada controller redeclarar seu próprio `RunClaimsCtxSchema` local para não perder o que `RunTokenMiddleware` injeta. Token ausente → segue o fluxo normal do operador (a checagem não é fail-closed pra controllers de `system`, que continuam servindo humano sem token de agente). `identity.ts` (o walk genérico e `IDENTITY_KEYS`) e `RunTokenMiddleware` morrem, substituídos por `AgentIdentityMiddleware`. A checagem de ownership pra ids fora do que a identidade confina — o padrão já usado em `SteerIssueTurnController` (`openIssues.openIssues(threadId).some(issue => issue.issueId === issueId)`) para o eixo `issueId` que o scope `orchestration` não carrega — vira regra documentada (não muda de mecanismo): quando a identidade do agente não confina um id que o controller aceita, o `handle()` do controller checa ownership explicitamente, como já faz `SteerIssueTurn`.

5. **Adaptador fino `/v1/mcp/:scope` substitui `McpRouterController`** (~40-60 linhas): resolve o scope do path, resolve a identidade a partir do token (`AgentIdentityService.resolve`), faz o **SCOPE MATCH** (`identity.scope !== scope` → 403) — carga que continua no router porque `tools/list` nunca passa por um controller (é respondido pelo SDK do MCP direto, sem round-trip HTTP de volta pro backend), então é o único ponto onde esse check pode acontecer para TODAS as mensagens JSON-RPC, não só `tools/call`. O walk de identidade por argumento sai daqui (migrou pro `AgentIdentityMiddleware`, decisão 4) — o adaptador não inspeciona mais o corpo JSON-RPC. Serve o servidor gerado via o mesmo mapa de loaders por scope (`GENERATED_SERVERS`, 3 imports estáticos — restrição de bundler já medida, mantida). O servidor continua construído **por request**, sem cache (decisão já medida e mantida: `Stateless transport cannot be reused across requests`).

6. **Hosting no `core`, agnóstico de produto** (o enum aperta o tipo no nível do app, o `core` fica com o formato genérico): `core/src/types/McpAdapter.ts` (classe base abstrata para o adaptador fino da decisão 5), `core/src/types/AgentIdentity.ts` (tipo genérico da identidade resolvida — `scopes: string[]`, não o enum do app — mais `compareIdentity(identity, candidate)`, a comparação tipada que substitui o walk), `core/src/services/AgentIdentityService/` (`abstract` + uma implementação `InMemory`, no padrão já existente de `CommandQueue` no `core`), `core/src/middlewares/AgentIdentityMiddleware`. Isso é capacidade do **template**: `packages/api/typescript/core` não conhece `McpScope` nem `AgentRunIdentity` — só o formato (`scopes: string[]`, comparação por chave).

7. **Auditoria por snapshot dourado**: `tests/architecture/mcp-exposure.test.ts`, scope → lista de tools, análogo ao que `mcp-manifest.test.ts` faz hoje contra o `openapi.json` publicado — qualquer mudança de exposição (um controller ganhando/perdendo `mcpScopes`) aparece no diff do snapshot em vez de passar despercebida. Substitui `mcp-manifest.test.ts` (que comparava o manifesto typed contra `x-mcp-scopes` do spec — sem manifesto typed, não há o que comparar do lado da decisão 2).

8. **`orchestration` ganha a tool de raise-stop nesta frente** — só a exposição (`static mcpScopes = [McpScope.ORCHESTRATION]` acrescentado em `RaiseStopController`, que hoje só está em `issue-handling`); a modelagem de Stop como filho de Thread (em vez de filho de Issue) é da frente B4, dependência declarada e fora do escopo daqui. `E2eMcpDriver` (`agent/mcp/E2eMcpDriver.ts`) adapta os índices que hoje lê de `ISSUE_HANDLING_OPERATION`/`operationIdOf` para o mecanismo da decisão 2 (varredura dos controllers pelo `static mcpScopes`, no lugar da constante).

## User Stories

**US-1 — Expor um controller como tool é local ao controller**
Given um dev abre `RecordArtifactController`,
When ele quer saber se e onde essa operação é exponível como tool MCP,
Then a resposta está no `static mcpScopes` do próprio arquivo — sem abrir `manifest.ts`.

**US-2 — Um scope novo força a pergunta de identidade**
Given um dev adiciona um `McpScope` novo em `packages/contracts`,
When nenhum agente ainda declara esse scope,
Then não há `SCOPE_CONFINEMENT` genérico a esquecer de atualizar — a exigência de campo (ex.: `issueId`) é decidida no `IdentitySchema` do primeiro agente que declarar o scope, no spawn.

**US-3 — `ForkIssueController` lê identidade sem redeclarar schema**
Given uma chamada MCP autenticada chega em `ForkIssueController` via `AgentIdentityMiddleware`,
When o `handle()` lê `entryId`,
Then lê de `ctx.agentIdentity` — sem `RunClaimsCtxSchema` local redeclarando o que o middleware injeta.

**US-4 — `tools/list` continua respondendo sem tocar controller**
Given um cliente MCP chama `tools/list` contra `/v1/mcp/orchestration`,
When o request chega no adaptador fino,
Then o SCOPE MATCH do adaptador é o único gate — nenhum `AgentIdentityMiddleware` roda, porque `tools/list` nunca faz round-trip de volta a um controller HTTP.

**US-5 — Mudança de exposição aparece no diff**
Given um dev remove `static mcpScopes` de `TransitionIssueStatusController`,
When `bun test` roda `tests/architecture/mcp-exposure.test.ts`,
Then o snapshot dourado scope→tools falha, nomeando a tool que sumiu.

## Acceptance Criteria

- [ ] AC-1: `McpScope` existe em `packages/contracts/wire/enums/mcp-scope.tsp`, importado em `wire/main.tsp`, e o `generated/typescript/src/wire/enums/mcp-scope.ts` expõe os mesmos 3 valores de `MCP_SCOPE_NAMES` hoje (`ISSUE_HANDLING`, `ORCHESTRATION`, `SYSTEM`).
- [ ] AC-2: `agent/mcp/manifest.ts`, `agent/mcp/register.ts` e `core/src/utils/McpScopeRegistry.ts` não existem mais no repo.
- [ ] AC-3: todo controller hoje listado em `MCP_SCOPES` declara `static mcpScopes` com o(s) mesmo(s) `McpScope`(s) que tinha no manifesto (incluindo `RaiseStopController`, que ganha `McpScope.ORCHESTRATION` além do `McpScope.ISSUE_HANDLING` que já tinha — decisão 8).
- [ ] AC-4: `core/src/utils/OpenAPI.ts` (`buildOperation`) lê `mcpScopes` do `static` da classe do controller — `bun sdk` reemitido produz `x-mcp-scope` e a tag `mcp:<scope>` idênticos aos de hoje para as operações não tocadas (AC-3 à parte).
- [ ] AC-5: `IssueWorkAgent` declara `static IdentitySchema` com `issueId` obrigatório; `OrchestratorAgent` declara `static IdentitySchema` sem `issueId`.
- [ ] AC-6: `SCOPE_CONFINEMENT` não existe mais; a checagem de campo obrigatório por scope acontece via parse do `IdentitySchema` do agente, no spawn, antes de qualquer `.issue(`/mint.
- [ ] AC-7: `RunTokenClaims` não existe mais como nome — o tipo equivalente se chama `AgentRunIdentity`; `RunTokenService` não existe mais como nome de classe/binding — o serviço equivalente se chama `AgentIdentityService` com os verbos `issue`/`resolve`/`revoke`.
- [ ] AC-8: `agent/mcp/identity.ts` (`IDENTITY_KEYS`, `findIdentityMismatches`, `assertIdentityMatchesClaims`) e `agent/middlewares/RunTokenMiddleware.ts` não existem mais.
- [ ] AC-9: existe `AgentIdentityMiddleware` em `core/src/middlewares/`, aplicado automaticamente (sem entrada manual em `middlewares`) a todo controller cujo `static mcpScopes` seja não-vazio.
- [ ] AC-10: `ForkIssueController` lê `entryId` de `ctx.agentIdentity` (não de `ctx.runClaims`/`RunClaimsCtxSchema`).
- [ ] AC-11: um controller de `system` (ex.: `GetHomeDashboardController`) continua servindo uma chamada de operador comum, sem token de agente, sem erro — o `AgentIdentityMiddleware` não é fail-closed na ausência de token.
- [ ] AC-12: `core/src/types/McpAdapter.ts`, `core/src/types/AgentIdentity.ts` (com `compareIdentity`) e `core/src/services/AgentIdentityService/` (`abstract` + `InMemory`) existem em `packages/api/typescript/core` e não importam `McpScope` nem qualquer tipo de `src/agent/`.
- [ ] AC-13: o adaptador em `agent/mcp/` que substitui `McpRouterController` faz o SCOPE MATCH (`identity.scope !== scope` → 403) para toda mensagem JSON-RPC, incluindo `tools/list`, sem invocar nenhum controller.
- [ ] AC-14: o adaptador não contém mais nenhuma lógica de walk de identidade por argumento (a responsabilidade migrou para `AgentIdentityMiddleware`, AC-9).
- [ ] AC-15: `GENERATED_SERVERS` (ou equivalente) continua um `Record` de 3 imports estáticos por scope, servidor construído por request (sem memoização de transporte entre requests).
- [ ] AC-16: `tests/architecture/mcp-exposure.test.ts` existe, com um snapshot dourado scope→lista-de-tools, e falha quando um `static mcpScopes` é adicionado/removido de um controller sem o snapshot ser atualizado.
- [ ] AC-17: `tests/architecture/mcp-manifest.test.ts` não existe mais (sem manifesto typed, a asserção que ele fazia não tem mais os dois lados a comparar — substituído por AC-16).
- [ ] AC-18: `E2eMcpDriver` não importa mais `ISSUE_HANDLING_OPERATION` nem `operationIdOf` de `agent/mcp/manifest` — resolve os mesmos nomes de tool pelo mecanismo da decisão 2.
- [ ] AC-19: `bun tsc`, `bun lint` e `bun test` (incluindo `tests/architecture/`) passam limpos em `packages/api/typescript` após a migração.

## Risks & Migration

**Ordem: `core` primeiro, `agent` depois.** `core/src/types/McpAdapter.ts`, `core/src/types/AgentIdentity.ts` e `core/src/services/AgentIdentityService/` (decisão 6) não têm dependência de `packages/contracts` nem de `src/agent/` — sobem primeiro e ficam mortos até o `agent` os usar. Só depois disso: (1) `McpScope` em `packages/contracts` + `bun sdk`/codegen; (2) `static mcpScopes` nos controllers + emitter lendo do `static`; (3) `IdentitySchema` nos agentes + rename `RunTokenService`→`AgentIdentityService`; (4) `AgentIdentityMiddleware` plugado + morte de `identity.ts`/`RunTokenMiddleware`; (5) adaptador fino substituindo `McpRouterController`; (6) `tests/architecture/mcp-exposure.test.ts` novo + morte de `mcp-manifest.test.ts`. Cada etapa deixa `bun tsc`/`bun test` verde antes da próxima — não há uma etapa "grande bang" que troque as sete estruturas de uma vez.

**Testes de arquitetura existentes que hoje asseveram as estruturas antigas** e precisam morrer/mudar junto (não depois): `tests/architecture/mcp-manifest.test.ts` (lê `MCP_SCOPES`/`MCP_SCOPE_NAMES`/`ISSUE_HANDLING_OPERATION` de `manifest.ts` diretamente — quebra no instante em que `manifest.ts` for removido, não antes). `agent/mcp/generated-server.test.ts` importa `MCP_SCOPE_NAMES`, `scopeOperationIds` de `./manifest` e `loadGeneratedServer` de `./router` — precisa mudar seus imports para a fonte pós-migração (enum de contracts + o mecanismo de varredura da decisão 2) no mesmo commit que remove `manifest.ts`, ou o arquivo nem compila. `agent/mcp/router.write-isolation.test.ts` exercita o adaptador diretamente — precisa ser adaptado junto com a troca pelo adaptador fino (decisão 5).

**Arquivos que hoje importam de `agent/mcp/manifest`** (levantado via grep, todos precisam de edição ou remoção): `agent/types/Agent.ts` (`SCOPE_CONFINEMENT`, `McpScope`), `agent/agents/OrchestratorAgent/OrchestratorAgent.ts` e `prompt.ts` (`TOOLS_IN_SCOPE`), `agent/agents/IssueWorkAgent/IssueWorkAgent.ts` e `prompt.ts` (`TOOLS_IN_SCOPE`), `agent/types/Agent.confinement.test.ts`, `agent/agents/OrchestratorAgent/OrchestratorAgent.test.ts`, `agent/agents/IssueWorkAgent/IssueWorkAgent.test.ts`, `agent/mcp/register.ts` (morre), `agent/mcp/E2eMcpDriver.ts`, `agent/mcp/generated-server.test.ts`, `agent/mcp/router.ts` (morre/vira o adaptador fino), `agent/services/AgentRunner/ClaudeAgentRunner/buildArgs.test.ts`, `tests/architecture/mcp-manifest.test.ts`, `core/src/index.ts` (`export * from './utils/McpScopeRegistry'`), `core/src/utils/OpenAPI.ts`.

## O que sobe pro template

- **Core (`packages/api/typescript/core`):** `core/src/types/McpAdapter.ts`, `core/src/types/AgentIdentity.ts` (com `compareIdentity`), `core/src/services/AgentIdentityService/` (`abstract` + `InMemory`), `core/src/middlewares/AgentIdentityMiddleware` — quatro artefatos novos, agnósticos de produto (não conhecem `McpScope` nem `AgentRunIdentity` do app), viram capacidade reutilizável por qualquer produto do template que exponha MCP.
- **Emitter (`core/src/utils/OpenAPI.ts`):** `buildOperation()` passa a ler `mcpScopes` do `static` do controller, no lugar do registro por side-effect (`mcpScopesFor`) — mecanismo genérico de leitura de metadado estático de controller, reaplicável a qualquer outro `static` que uma capacidade futura precise varrer na emissão do spec.
- **Skills:** `.claude/skills/controller/typescript/registry.yaml` ganha o padrão `static mcpScopes` como idioma de auto-declaração (ao lado de `middlewares`); `.claude/skills/agent/typescript/registry.yaml` ganha o padrão `static IdentitySchema` (parse no spawn, antes de mint/issue) e o rename `RunTokenService`→`AgentIdentityService`; `.claude/skills/middleware/typescript/registry.yaml` ganha o padrão de middleware auto-aplicado por metadado estático do controller (`AgentIdentityMiddleware` sendo o primeiro caso, não o único que essa forma pode assumir).
- **Registry central (`.claude/registry.yaml`):** nenhuma entrada nova de mapeamento arquivo→skill — os artefatos novos (`McpAdapter`, `AgentIdentityService`, `AgentIdentityMiddleware`) caem nos padrões já existentes de `service`/`middleware` no `core`.

## Open Questions

- O mecanismo exato de "varredura dos controllers pelo `static mcpScopes`" para computar a expansão tool-name-por-scope (hoje `TOOLS_IN_SCOPE`) — se via o mesmo `router.controllers` que o emitter já percorre, ou uma varredura própria em `agent/registry.ts` — fica para o `/plan`; a decisão 2 fixa que a lista deixa de ser mantida à mão, não o mecanismo de descoberta.
- Nome final do adaptador que substitui `McpRouterController` (decisão 5) — não fixado aqui; é um detalhe de nomenclatura, não uma decisão de design.
