# Frente B2 — MCP como capacidade do core (auto-declaração, identidade tipada, adaptador fino) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle.

**Goal:** A exposição MCP e a identidade de agente viram **capacidades do core**: um controller se auto-declara exponível (`static mcpScopes`, no idioma de `middlewares`), um agente se auto-declara com a própria forma de identidade (`static IdentitySchema`, com parse **no spawn**), e a checagem de "essa chamada é da própria identidade" migra do walk genérico no router para um `AgentIdentityMiddleware` tipado, auto-aplicado no controller de destino. Morrem as sete estruturas paralelas do manifesto, o `Map` global do core, o deny-list `IDENTITY_KEYS`, a cópia de `operationIdOf` e o módulo de side-effect — e `McpScope` passa a nascer em `packages/contracts`.

**Architecture:** Sete cortes na ordem obrigatória, cada um deixando `tsc`/`test` verdes. (1) O CONTRATO primeiro: `McpScope` vira enum TypeSpec, com bindings TS+Go+Rust — é o único vocabulário que todos os cortes seguintes citam. (2) e (3) O CORE em paralelo, e ambos nascem MORTOS (nada os importa ainda): a hospedagem da IDENTIDADE (`types/AgentIdentity.ts` com `compareIdentity`, `services/AgentIdentityService/` abstract+InMemory no padrão de `CommandQueue`, `middlewares/AgentIdentityMiddleware`) e a hospedagem da EXPOSIÇÃO (o slot `static mcpScopes` na base `Controller`, `operationIdOf` single-sourced e `McpExposure`, a varredura pura sobre controllers). (4) A IDENTIDADE no app: `IdentitySchema` por agente, parse no `buildMcpInvocation` **antes de qualquer `.issue(`**, renames `RunTokenClaims`→`AgentRunIdentity` e `RunTokenService`→`AgentIdentityService` — é aqui que mora o FALSEADOR obrigatório e onde `SCOPE_CONFINEMENT` morre. (5) A EXPOSIÇÃO no app: 32 controllers ganham `static mcpScopes` (com `RaiseStopController` ganhando `ORCHESTRATION`), o emitter passa a ler o static na varredura, e `manifest.ts` + `register.ts` + `McpScopeRegistry.ts` morrem juntos — o que arrasta (6), o snapshot dourado, para o MESMO commit, porque `mcp-manifest.test.ts` deixa de compilar no instante em que o manifesto some. (7) O middleware plugado (fim da mutação de argumento à distância em `ForkIssue`) e só então (8) o adaptador fino, que fica com UMA carga — o SCOPE MATCH que `tools/list` exige.

**Tech Stack:** TypeScript, Bun, TypeSpec (contracts, 3 bindings), Zod, tsyringe-neo, `@modelcontextprotocol/sdk`, Kubb (`@kubb/plugin-mcp`), bun:test

**Spec:** .specs/2026-07-29-mcp-core-service-design.md
**Tasks:** 10
**Estimated minutes:** 520

---

## Ground em HEAD `ec8f419d` — o que a spec diz e o que o código diz

A spec foi escrita em 2026-07-29, **antes** de B3+B4+B5 e do merge de `feat/rust-wire`. Rodada de verificação re-executada em HEAD; `bun x tsc -p tsconfig.build.json --noEmit` em `packages/api/typescript` → **exit 0**, e `bun test src/agent/mcp src/agent/agents tests/architecture/mcp-manifest.test.ts` → **72 pass / 0 fail / 191 expect() / 8 arquivos**. Base limpa.

| Afirmação | Veredito em HEAD | Prova |
|---|---|---|
| `RaiseStopController` migrou para `thread/controllers` no B4 | **FALSO — nunca esteve em `issue/`.** Vive em `packages/api/typescript/src/agent/controllers/RaiseStop.ts` e chama `DeclareStop` de `agent/usecases/` | `find src -name "RaiseStop*"` → `src/thread/usecases/RaiseStop.ts` + `src/agent/controllers/RaiseStop.ts`; `grep -rn "class RaiseStopController" src/` → **1 hit**, `src/agent/controllers/RaiseStop.ts:32`. O que o B4 moveu foi o **use case** `issue/usecases/RaiseStop.ts` → `thread/usecases/RaiseStop.ts` (commit `6fd77b96`, `D packages/api/typescript/src/issue/usecases/RaiseStop.ts`) — homônimo, outro artefato. A spec (linha 49/82) nunca localiza o controller; só o nomeia. |
| Todos os paths de controllers citados no manifesto | **UM mudou de endereço, e o manifesto JÁ foi atualizado pelo B4.** `GetNeedsYouPanelController`: `issue/controllers` → `thread/controllers` | `git show 6fd77b96 --name-status` → `R100 src/issue/controllers/GetNeedsYouPanel.ts → src/thread/controllers/GetNeedsYouPanel.ts`, e `M src/agent/mcp/manifest.ts` no mesmo commit. `manifest.ts:9-18` importa `GetNeedsYouPanelController` de `@thread/controllers` com o comentário do B4 inline. `ResolveStop`/`UpdateStopCriteria` também migraram para `thread/controllers`, mas **nenhum dos dois está em `MCP_SCOPES`** — não são tools. |
| `E2eMcpDriver` tem o guard `claims.entryId` (C8) e usa `ISSUE_HANDLING_OPERATION`/`operationIdOf` | **VERDADEIRO, os três.** O guard é `const claims = this.runTokens.verify(mcp.token); if (claims && !claims.entryId) return []` | `E2eMcpDriver.ts:10` (`import { ISSUE_HANDLING_OPERATION, operationIdOf } from './manifest'`), `:88-89` (o guard), `:93` (`operationIdOf(ForkIssueController)`), `:104`/`:113` (`ISSUE_HANDLING_OPERATION.recordArtifact` / `.transitionIssueStatus`). Os três sobrevivem à migração: o guard vira `identity.entryId` (T4), os índices viram `operationIdOf(<classe>)` (T5). |
| `Agent.ts:151` lê `SCOPE_CONFINEMENT` no mint | **VERDADEIRO, linha exata.** | `grep -n "SCOPE_CONFINEMENT" src/agent/types/Agent.ts` → `:9` (import) e `:151` (`if (SCOPE_CONFINEMENT[scope] === 'issue' && !input.issueId) {`). |
| O emitter consulta o `Map` global em `core/src/utils/OpenAPI.ts` | **VERDADEIRO, em DOIS pontos, não um.** | `:10` importa `mcpScopeRegistrySnapshot` **e** `mcpScopesFor`. `:849` (`const mcpScopes = mcpScopesFor(operationId)`, dentro de `buildOperation` que começa em `:841`) escreve `x-mcp-scope` + a tag `mcp:<scope>` (`buildTags`, `:863`). **E `:508-517`, dentro de `generateSpecification` (`:481`), publica o manifesto de RAIZ `x-mcp-scopes` a partir de `mcpScopeRegistrySnapshot()`** — é ESSE que o gerador da SDK lê como autoridade (`packages/client/generators/typescript.ts:56-60`, `:324`, `:356`). A spec não cita o segundo ponto; matá-lo sem substituto quebra `bun sdk`. |
| `core/src/types/Controller.ts` ganha o slot | **A base existe e declara `middlewares` como propriedade de INSTÂNCIA em `:72`** — o novo slot é `static`, categoria diferente, sem colisão | `Controller.ts:72`: `middlewares: (Middleware | MiddlewareClass)[] = []`. |
| Onde vivem middlewares no core | **`core/src/middlewares/` JÁ EXISTE**, com `RateLimitMiddleware.ts` + `RateLimitMiddleware.test.ts` + `index.ts` (barrel de uma linha), re-exportado por `core/src/index.ts:40` | `ls core/src/middlewares/`. A convenção real: `@singleton()`, `implements Middleware`, imports por caminho relativo (`../types/Http`, `../services/RateLimitStore`), export nomeado no barrel. |
| `RunTokenService` em `agent/services/RunTokenService/` | **VERDADEIRO para o abstract** (`RunTokenService.ts:93` linhas, com `RunTokenClaims`). A IMPLEMENTAÇÃO fica em outro lugar: `agent/mcp/RunTokenService.ts` (`InMemoryRunTokenService`) — a spec não nomeia esse arquivo | `find . -name "*RunToken*"` → 4 arquivos: `services/RunTokenService/{index,RunTokenService}.ts`, `mcp/RunTokenService.ts`, `middlewares/RunTokenMiddleware.ts`. |
| `ForkIssue` lê `originEntryId` injetado pelo router | **QUASE — não é o router, é o `RunTokenMiddleware`, e o ponto exato é `ForkIssue.ts:86`** | `ForkIssue.ts:86`: `const claims = request.ctx.runClaims`; `:100-106` rejeita `!claims.entryId`; `:120` passa `originEntryId: claims.entryId`. O schema local que existe só para o Zod não descartar a chave é `RunClaimsCtxSchema` (`ForkIssue.ts:26-29`), duplicado verbatim em `SteerIssueTurn.ts:14-17`. `grep -rn "runClaims\|RunClaimsCtxSchema" src/` → **10 hits em 3 arquivos**, e nenhum fora deles. |
| Testes de arquitetura que asseveram as estruturas antigas | **TRÊS, e um quarto que só toca um re-export** | `tests/architecture/mcp-manifest.test.ts` (importa `MCP_SCOPES`, `MCP_SCOPE_NAMES`, `ISSUE_HANDLING_OPERATION`, `operationIdOf`, `scopeOperationIds`); `src/agent/mcp/generated-server.test.ts:5` (`MCP_SCOPE_NAMES`, `scopeOperationIds`) + `:6` (`loadGeneratedServer` de `./router`); `src/agent/types/Agent.confinement.test.ts:8` (`SCOPE_CONFINEMENT`, `TOOLS_IN_SCOPE`, `MCP_SCOPE_NAMES`); `src/agent/services/AgentRunner/ClaudeAgentRunner/buildArgs.test.ts:6` importa `wireToolName` **do manifesto** (que só o re-exporta de `./wire`). |
| `ctx` do controller viaja para o OpenAPI/SDK | **NÃO.** `buildRequestParams` lê só `query`/`params`/`headers`; `buildRequestBody` lê `body`. `grep -c "runClaims" public/docs/openapi.json` → **0** | Consequência dura e usada por este plano: trocar `ctx.runClaims` por `ctx.agentIdentity` **não muda um byte do spec nem da SDK**. |

**Duas descobertas que a spec não previu e que este plano absorve:**

1. **O `x-mcp-scopes` de raiz é contrato com o gerador da SDK.** `packages/client/generators/typescript.ts:60` lê `spec['x-mcp-scopes']` como "a autoridade sobre o que deve existir" e `:356` lança quando a contagem emitida diverge do manifesto publicado. Se o emitter parar de publicá-lo, `bun sdk` emite ZERO tools com build verde — exatamente a falha silenciosa que `mcp-manifest.test.ts` foi escrito para tornar impossível. O T5 reconstrói `x-mcp-scopes` a partir da varredura dos statics, não do `Map`.
2. **Matar `manifest.ts` obriga a mexer em `shared/context-map.ts`.** `POLICY_EXCEPTIONS` (`context-map.ts:154-159`) tem **6 entradas** geradas por `.map()` sobre `['artifact','issue','thread','ui','workspace','owner']`, todas com `file: 'agent/mcp/manifest.ts'`, e `context-map.test.ts` tem um teste "policy exceptions are ALIVE" que reprova quando o arquivo citado não existe. As 6 mudam de arquivo (não morrem — ver D-C).

---

## Decisões de desenho tomadas neste plano (grounded)

As duas Open Questions da spec, mais quatro que caíram do código de HEAD.

### D-A — A varredura da decisão 2 tem DOIS lados, e eles se provam um ao outro

A spec deixa aberto "se via o mesmo `router.controllers` que o emitter já percorre, ou uma varredura própria em `agent/registry.ts`". **A resposta é: os dois, deliberadamente, porque os consumidores estão em tempos diferentes e o desacordo entre eles é o que o snapshot dourado mede.**

- **Lado EMITTER (instâncias).** `generateSpecification(routers)` já recebe `Router[]` com controllers **instanciados** pelo DI. Uma função pura de core (`McpExposure`) varre `router.controllers`, lê `(c.constructor as …).mcpScopes` e devolve `operationId → scopes` + `scope → operationIds`. Zero registro, zero side-effect, zero `Map` global — o objeto vive um `generateSpecification` e morre.
- **Lado RUNTIME (classes).** Os agentes precisam de `--allowedTools` **antes** de qualquer HTTP e num módulo que não pode importar `src/routers.ts` (ciclo: `routers.ts → agent/index.ts → agent/registry.ts`). Então `agent/mcp/exposure.ts` varre as **classes** exportadas pelos barris `controllers/index.ts` dos 7 contextos e aplica a mesma função de core.

**Por que o lado runtime NÃO é o manifesto de volta:**

1. **Não há lista.** O manifesto declarava `MCP_SCOPES = { 'issue-handling': [A, B, C, …] }` — a associação scope↔controller morava ali. `exposure.ts` importa `* as controllers from '@issue/controllers'` e pergunta a cada classe `mcpScopes`. Um controller que entra num scope amanhã é varrido amanhã, sem edição aqui — e um que sai, some. É a diferença entre declarar e descobrir.
2. **O barril já é obrigatório.** `tests/architecture/wiring-completeness.test.ts` (WIRE-03) exige que TODA classe `extends Controller` seja exportada de `controllers/index.ts`. A varredura não pode ter ponto cego, porque um controller fora do barril já é build vermelho por outro motivo.
3. **O grafo de módulos não muda.** `manifest.ts` já importa esses mesmos 7 barris hoje (ESM carrega o módulo inteiro em `import { X } from '@issue/controllers'`, não só o símbolo). `grep -n "@artifact/controllers\|@issue/controllers\|@thread/controllers\|@ui/controllers\|@workspace/controllers\|@owner/controllers" src/agent/mcp/manifest.ts` → 6 blocos. Zero ciclo novo, zero peso novo.
4. **A alternativa medida é pior.** Injetar `McpExposure` nos agentes via DI exigiria bindar `Router[]` no container — e `tests/architecture/real-di-resolution.test.ts:38` resolve `IssueWorkAgent`/`OrchestratorAgent` de um child container montado só com `ALL_REGISTRIES.real`, sem composition root. O binding teria de existir em `agent/registry.ts`, que não pode importar `routers.ts`. **Essa rail vai vermelha na hora.**

**O que prova que os dois lados concordam:** `tests/architecture/mcp-exposure.test.ts` (T6) compara a varredura de CLASSES (fonte) com o `x-mcp-scopes` + `x-mcp-scope` do `openapi.json` COMMITADO (artefato) — a mesma set-equality bidirecional que `mcp-manifest.test.ts` fazia, com o manifesto typed trocado pela varredura. Não é auto-referência: os dois lados leem coisas diferentes (classe estática vs. spec emitido por instância).

**Limitação herdada e mantida:** a varredura por classe não consegue reproduzir o sufixo de método que `buildOperationId` acrescenta a controller multi-método (a classe não expõe `method` estaticamente). `operationIdOf` documenta isso, exatamente como o `operationIdOf` do manifesto já documentava — e a set-equality do T6 é o que transforma uma divergência em teste vermelho em vez de tool vazia.

### D-B — Nome do adaptador: `McpDoorController`, em `agent/mcp/door.ts`

A spec deixa o nome aberto. Três razões para este:

1. **O docstring atual já o chama assim** — `router.ts:23`: *"THE MCP DOOR — the JSON-RPC endpoint an agent CLI talks to"*. O nome já existe na prosa; só não estava no símbolo.
2. **`Router` é uma palavra tomada no core** (`core/src/types/Router.ts`, `MainRouter.ts`) e o artefato não roteia nada desde que o walk saiu: ele autoriza e entrega. Manter `McpRouterController` seria descrever o que o arquivo deixou de fazer.
3. **`agent/mcp/` não é varrido por WIRE-03** (a rail escaneia `src/<ctx>/controllers/`), então o adaptador continua fora do barril de controllers — que é o que mantém a carve-out de OpenAPI (`agent/index.ts:24-31`) funcionando por posição em vez de por exceção.

### D-C — As 6 exceções de context-map MUDAM DE ARQUIVO, não morrem

`shared/context-map.ts:154-159` gera 6 `POLICY_EXCEPTIONS` com `file: 'agent/mcp/manifest.ts'`. Com o manifesto morto elas apontariam para nada, e `context-map.test.ts` ("policy exceptions are ALIVE") reprova. Elas **migram para `agent/mcp/exposure.ts`** e o `NOTE_MCP_MANIFEST` é reescrito: deixa de dizer "nomeia as CLASSES que este contexto expõe" (declaração) e passa a dizer "importa os BARRIS para VARRER o `static mcpScopes` de cada classe" (descoberta). O `ANNOTATED_CYCLES` de `agent ↔ ui` (`:167`) é reescrito pelo mesmo motivo — hoje ele justifica o ciclo dizendo que o manifesto NOMEIA os controllers de `ui`.

**Por que não eliminar as exceções de vez.** Seria possível se ninguém em `agent/` importasse controller de outro contexto — mas os agentes precisam da expansão de tools no spawn (D-A), e a única fonte cross-context são os barris. Confinar as 6 a UM arquivo é a mesma postura que o manifesto tinha e que a rail já sanciona; o que muda é que o arquivo deixou de carregar a lista.

### D-D — `compareIdentity` compara `{...params, ...body}` RASO, não um walk profundo — e cobre os mesmos três eixos

O walk de `identity.ts` é profundo porque roda no ROUTER, sobre o corpo JSON-RPC, onde o argumento do tool é `{ threadId, data: { issueId, … } }` — dois níveis. O middleware roda no CONTROLLER de destino, **depois** que o shim gerado já traduziu o tool call em `POST /v1/threads/:threadId/artifacts` com body `{ kind, name, ref, meta, issueId }`. Ou seja: o que estava em `data.issueId` chega em `request.body.issueId`, e o que estava no topo chega em `request.params`. **Um merge raso de `params` e `body` cobre exatamente os três eixos que o walk cobria**, no ponto onde já estão separados por camada.

E é **allow-list em vez de deny-list**: `compareIdentity` itera as chaves que a IDENTIDADE carrega (`Object.entries(identity)`), não uma constante de 3 strings. Uma identidade sem `issueId` (o orquestrador) simplesmente não compara `issueId` — que é o comportamento de hoje (`assertIdentityMatchesClaims` PULA claim ausente), agora expresso pela forma do dado em vez de por um `if (claimed &&`. A regra que preenche a lacuna continua sendo a da decisão 4 da spec: quando a identidade não confina um id que o controller aceita, o `handle()` checa ownership — como `SteerIssueTurn` já faz.

### D-E — O nome do header vive no core, com uma rail contra drift

`AgentIdentityMiddleware` mora no core e precisa ler o token; o shim gerado manda **só** o header dedicado (`packages/client/dist/typescript/src/typescript/mcp/scopes/*/_http.ts:20` — `headers: { …, [MCP_RUN_TOKEN_HEADER]: run.token }`, sem `authorization`). E `core` **não depende** de `@codedm/client-typescript` (`core/package.json` não o lista; a direção da dependência é a inversa).

**Escolha:** `core/src/types/AgentIdentity.ts` exporta `AGENT_RUN_TOKEN_HEADER = 'x-codedm-run-token'` (o mesmo byte de `MCP_RUN_TOKEN_HEADER` hoje) e o T6 pina o par com uma asserção de uma linha em `mcp-exposure.test.ts` — o único lugar do repo que pode importar os dois lados. Nenhuma rail proíbe a string (`product-residue.test.ts:41-49` lista `kiwify|nuvemshop|cartpanda|yampi|useTenancyStore|TenancyScope|SINGLE_STORE|MULTI_STORE|storeVisualizations|bkdash|bk-dash` — `codedm` é o produto vivo). **Follow-up registrado** (não vira Task): single-sourcing real seria `packages/client/generators/typescript.ts` emitir a constante lendo do core, o que exige `packages/client` depender de `core` — decisão de topologia, fora das Decisions desta spec.

### D-F — Os códigos de erro do middleware são os do CORE, e isso é uma mudança observável declarada

`RunTokenMiddleware` lança `AGENT_RUN_TOKEN_INVALID` (401), código do vocabulário do contexto `agent` (`src/agent/errors/index.ts:46,70`). O core não pode lançá-lo — `core/src/errors/codes.ts` é explícito: *"Core never imports from contexts"*. `AgentIdentityMiddleware` lança `UNAUTHORIZED` (401) e `FORBIDDEN` (403), ambos já em `BaseInterfaceErrors` (`codes.ts:16-17`), com o **mesmo status HTTP**.

**Custo verificado: zero teste e zero front.** `ls src/agent/middlewares/` → só `index.ts` + `RunTokenMiddleware.ts`; não existe `RunTokenMiddleware.test.ts`. Os testes que asseveram `AGENT_RUN_TOKEN_INVALID`/`AGENT_RUN_SCOPE_MISMATCH` (`router.test.ts`) o fazem no **adaptador**, que continua app-side e continua lançando os códigos do `agent` (T8). O `ctx` não é emitido, então nenhum hook/SDK/react vê a diferença.

### D-G — A auto-aplicação acontece em `Controller.executeMiddlewares`, não em `MainRouter`

Os dois candidatos existem: `MainRouter.configureRouterControllers` (`core/src/types/MainRouter.ts:38-70`) já funde global+router+controller e MUTA `controller.middlewares`; `Controller.executeMiddlewares` (`Controller.ts:149`) é quem consome a lista.

**Escolhido: `executeMiddlewares`**, porque a auto-aplicação é uma fronteira de SEGURANÇA e o `MainRouter` é pulável por três caminhos reais — `EMIT_OPENAPI=true` nunca o executa, `src/agent/controllers/DetectProviders.test.ts:30` chama `controller.executeController(...)` direto (precedente vivo), e qualquer teste futuro faria o mesmo. Um controller com `static mcpScopes` que se pode invocar sem passar pela checagem é a exata forma do bug que esta frente elimina. `executeMiddlewares` é o único ponto por onde `handle()` não pode ser alcançado.

**Consequência de wiring, verificada:** `executeMiddlewares` resolve pelo container RAIZ (`container.resolve(middlewareOrClass)`, `Controller.ts:160`), então `AgentIdentityService` precisa estar bindado na raiz em **todos os envs**. Por isso o binding vai em **`src/shared/registry.ts`** (onde moram os tokens de core — `CommandQueue:191`, `IdempotencyGuard:186`, `RateLimitStore`), **não** em `agent/registry.ts`. É também o que mantém `tests/architecture/real-di-resolution.test.ts` verde sem uma linha nova.

---

## Inventário — as sete estruturas paralelas, e o que fica no lugar de cada uma

Todas em `packages/api/typescript/src/agent/mcp/manifest.ts` (295 linhas) salvo indicação. Contagem de consumidores por `grep -rn "mcp/manifest\|from './manifest'" src/ core/src/` → **17 hits em 15 arquivos**.

| # | Estrutura que morre | Onde vive hoje | Quem lê hoje | Substituto | Task |
|---|---|---|---|---|---|
| 1 | `MCP_SCOPE_NAMES` (tupla dos 3 scopes + o `type McpScope` derivado) | `manifest.ts:80-81` | `router.ts:8` (`resolveScope`), `generated-server.test.ts:5`, `Agent.confinement.test.ts:8`, `RunTokenService.ts:2` (o tipo) | **`enum McpScope` em `packages/contracts/wire/enums/mcp-scope.tsp`** → `@codedm/contracts-typescript/wire/enums`; a tupla vira `Object.values(McpScope)` onde ainda for preciso iterar | T1 |
| 2 | `SCOPE_CONFINEMENT` (`Record<McpScope,'issue'\|'thread'>`) | `manifest.ts:105-131` | **um único call site**: `Agent.ts:151`; mais `Agent.confinement.test.ts:8` | **`static IdentitySchema` por agente**, parseado no spawn dentro de `buildMcpInvocation`, antes de `.issue(`. `IssueWorkAgent` exige `issueId`; `OrchestratorAgent` não o declara | T4 |
| 3 | `MCP_SCOPES` (`Record<McpScope, ControllerClass[]>` — a lista real, 33 entradas) | `manifest.ts:150-224` | `IssueWorkAgent.test.ts:13`, e indiretamente tudo que deriva | **`static mcpScopes = [McpScope.X]` em cada controller** + a varredura (D-A) | T5 |
| 4 | `TOOLS_IN_SCOPE` / `toolsInScope()` | `manifest.ts:277-281` | `IssueWorkAgent.ts:6`, `OrchestratorAgent.ts:6`, `IssueWorkAgent/prompt.ts` (via #6), `OrchestratorAgent/prompt.ts:4,180`, 3 testes | **`toolsInScope(scope)` em `agent/mcp/exposure.ts`**, computado pela varredura das classes — mesma assinatura, fonte diferente | T5 |
| 5 | `MCP_SCOPE_BY_OPERATION` (índice reverso operationId→scopes) | `manifest.ts:287-295` | `register.ts:2` e mais ninguém | **`McpExposure` (core)**, construído por `generateSpecification` a partir de `router.controllers`; vive um emit e morre | T3+T5 |
| 6 | `ISSUE_HANDLING_OPERATION` (mapa keyed de 6 operationIds) | `manifest.ts:255-262` | `IssueWorkAgent/prompt.ts:3,57-60`, `E2eMcpDriver.ts:10,104,113` | **`operationIdOf(<ClasseDoController>)`** direto, com as classes re-exportadas por `exposure.ts` (que já as importa para varrer) | T5 |
| 7 | `GENERATED_SERVERS` → loader do adaptador | `router.ts:238-242` (**não** no manifesto) | `loadGeneratedServer` (`router.ts:250`), `generated-server.test.ts:6` | **PERMANECE** como `Record` de 3 imports estáticos (AC-15 — restrição de bundler já medida), agora atrás do `abstract loadServer(scope)` de `McpAdapter` | T8 |
| + | `IDENTITY_KEYS` + `findIdentityMismatches` + `assertIdentityMatchesClaims` | `agent/mcp/identity.ts` (101 linhas) | `router.ts:9,161` | **`compareIdentity` (core, puro)** chamado por `AgentIdentityMiddleware` — allow-list pelas chaves da identidade, não deny-list de 3 strings (D-D) | T2+T7 |
| + | `operationIdOf` (cópia à mão de `buildOperationId`) | `manifest.ts:243-245` | `manifest.ts` interno, `E2eMcpDriver.ts:10` | **`operationIdOf` em `core/src/utils/McpExposure.ts`**, e `OpenAPI.buildOperationId` passa a DELEGAR para ele — uma regra, um arquivo, fim da set-equality entre cópias | T3 |
| + | O `Map` global do core + `registerMcpScopes`/`mcpScopesFor`/`mcpScopeRegistrySnapshot` | `core/src/utils/McpScopeRegistry.ts` (43 linhas), exportado por `core/src/index.ts:53` | `OpenAPI.ts:10,511,849` | **`McpExposure`** — objeto local do emit, sem estado de módulo | T3+T5 |
| + | `register.ts` (o módulo de side-effect) | `agent/mcp/register.ts` (19 linhas), importado por `agent/registry.ts:22` | boot | **nada** — o emitter lê o static na varredura; não há o que registrar | T5 |

**Total: 3 arquivos deletados (`manifest.ts`, `register.ts`, `McpScopeRegistry.ts`), 1 renomeado (`identity.ts` → some; a lógica vira `compareIdentity` no core), 1 substituído (`router.ts` → `door.ts`), 4 nascem no core, 1 nasce em `agent/mcp/` (`exposure.ts`).**

---

## Task T1: Contract Lock — `McpScope` nasce em `packages/contracts`

**Files to write:**
- Create: `packages/contracts/wire/enums/mcp-scope.tsp`
- Modify: `packages/contracts/wire/main.tsp` — o `import` na vizinhança dos outros enums de agente
- Modify (GERADO, commitar): `packages/contracts/generated/typescript/src/wire/enums/mcp-scope.ts`, `.../generated/typescript/src/wire/enums/index.ts`, `packages/contracts/generated/go/wire/enums.go`, `packages/contracts/generated/rust/src/wire/enums.rs` — **exatamente o que `bun contracts` escrever**, sem edição à mão

**Files to read:**
- `packages/contracts/wire/enums/stop-kind.tsp` — o molde exato (namespace, `@doc`, membros)
- `packages/contracts/wire/enums/language.tsp` — o precedente de **valor ≠ nome de membro** (`PT_BR: "pt-BR"`), que é o que este enum precisa
- `packages/contracts/wire/main.tsp:37-53` — o bloco de imports onde a linha entra

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /enum
**Depends on:** (none)
**Scope fence:** DONE: o `.tsp`, o import em `main.tsp`, e os bindings regerados nas 3 línguas. OUT: qualquer consumidor (T4/T5); qualquer `.tsp` de evento ou de schema (`McpScope` **não** entra em nenhum payload de wire — é vocabulário de rota e de credencial, não de mensagem); qualquer edição em `packages/api`. Esta Task não toca `src/`.
**Gate:** `bun contracts && bun check:generated && bun tsc` — exit 0 nos três, e `grep -rn "ISSUE_HANDLING" packages/contracts/generated/{typescript,go,rust}` retorna hits nas 3 línguas

### Step T1.1 — Proposed file: Create `packages/contracts/wire/enums/mcp-scope.tsp`

```tsp
namespace TemplateContracts;

@doc("Which declared MCP tool surface a credential opens. The value is the WIRE spelling — it is the path segment of the JSON-RPC door (/v1/mcp/<value>), the synthetic OpenAPI tag (mcp:<value>) the Kubb tag filter matches on, and the directory the per-scope generated server is emitted into. Changing a value renames all three at once.")
enum McpScope {
  ISSUE_HANDLING: "issue-handling",
  ORCHESTRATION: "orchestration",
  SYSTEM: "system",
}
```

- [ ] Os 3 valores são **byte-idênticos** a `MCP_SCOPE_NAMES` de HEAD (`manifest.ts:80`: `['issue-handling', 'orchestration', 'system']`) — AC-1
- [ ] Nome de membro em SCREAMING_SNAKE, valor em kebab: o precedente é `language.tsp` (`PT_BR: "pt-BR"`, `EN_US: "en-US"`); confirmado que o emitter TS/Go/Rust suporta divergência nome↔valor

### Step T1.2 — Proposed file: Modify `packages/contracts/wire/main.tsp`

Uma linha, no bloco dos enums do runtime de agente (junto de `agent-model-id`/`agent-stop-reason`, linhas 37-38):

```tsp
import "./enums/agent-model-id.tsp";
import "./enums/agent-stop-reason.tsp";
import "./enums/mcp-scope.tsp";
```

### Step T1.3 — Regenerar os três bindings

- [ ] `cd packages/contracts && bun run all` (= `tsp:compile` + `codegen:wire` TS/Go/Rust + `codegen:fixtures` + `drizzle:generate`)
- [ ] Conferir que o Rust compilou: `codegen:wire:rust` termina com `cargo check` — um valor com hífen já tem precedente (`pt-BR`), mas o gate é o exit code, não a suposição
- [ ] `bun run --cwd packages/contracts test` → `bun test codegen/` + `test:rust` + `test:go`, exit 0
- [ ] Confirmar que `drizzle:generate` **não** produziu migração nova: `git status --porcelain packages/contracts/db/migrations` vazio (nenhuma coluna persiste `McpScope`)

### Step T1.4 — Verificar que nada além dos bindings mudou

- [ ] `git status --porcelain packages/` — só `packages/contracts/wire/**` e `packages/contracts/generated/**`
- [ ] `bun check:generated` → exit 0 (regenera contracts + SDK e exige árvore limpa; a SDK **não** deve mudar aqui, porque nenhum controller referencia o enum ainda)
- [ ] `bun tsc` → exit 0

### Step T1.5 — Commit

```bash
git add packages/contracts/wire/enums/mcp-scope.tsp \
        packages/contracts/wire/main.tsp \
        packages/contracts/generated
git commit -m "feat(contracts): B2 T1 — McpScope nasce onde todo enum cross-boundary nasce

Era uma tupla \`as const\` local em agent/mcp/manifest.ts, fora da pipeline que
define todo o resto do vocabulário de wire. Os 3 valores sao byte-identicos aos
de MCP_SCOPE_NAMES: o valor E a grafia de wire, e ela aparece em tres lugares ao
mesmo tempo — o segmento de rota /v1/mcp/<scope>, a tag sintetica mcp:<scope>
que o filtro do Kubb enxerga, e o diretorio do servidor gerado por scope.

Nasce sem consumidor. T4 e T5 o consomem."
```

---

## Task T2: Core hospeda a IDENTIDADE — `AgentIdentity`, `AgentIdentityService`, `AgentIdentityMiddleware`

**Files to write:**
- Create: `packages/api/typescript/core/src/types/AgentIdentity.ts` — o formato genérico + `compareIdentity` + `AGENT_RUN_TOKEN_HEADER` + `readAgentRunToken`
- Create: `packages/api/typescript/core/src/types/AgentIdentity.test.ts` — o falseador de `compareIdentity`
- Create: `packages/api/typescript/core/src/services/AgentIdentityService/AgentIdentityService.ts` — o abstract (3 verbos)
- Create: `packages/api/typescript/core/src/services/AgentIdentityService/InMemoryAgentIdentityService.ts`
- Create: `packages/api/typescript/core/src/services/AgentIdentityService/index.ts`
- Create: `packages/api/typescript/core/src/middlewares/AgentIdentityMiddleware.ts`
- Modify: `packages/api/typescript/core/src/middlewares/index.ts` — uma linha de export
- Modify: `packages/api/typescript/core/src/index.ts` — `export * from './types/AgentIdentity'` + `'./services/AgentIdentityService'`

**Files to read:**
- `packages/api/typescript/core/src/services/CommandQueue/{CommandQueue,MockCommandQueue}.ts` — o padrão abstract+impl que a spec nomeia (decisão 6): abstract sem decorator, impl com `@singleton()`, barrel re-exportando os dois
- `packages/api/typescript/core/src/middlewares/RateLimitMiddleware.ts` — a convenção real de middleware no core: `@singleton()`, `implements Middleware`, imports relativos (`../types/Http`, `../types/Middleware`, `../types/BaseError`), `BaseInterfaceErrors` como vocabulário
- `packages/api/typescript/src/agent/services/RunTokenService/RunTokenService.ts` — a tabela verbo→chamador único que migra verbatim (com os nomes novos)
- `packages/api/typescript/src/agent/mcp/RunTokenService.ts` — a implementação in-memory que migra (expiry como backstop, drop-on-read)
- `packages/api/typescript/src/agent/mcp/identity.ts` — o que `compareIdentity` substitui, e o que dele NÃO migra (o walk profundo — D-D)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** opus
**Skills:** /service, /middleware, /test
**Depends on:** (none)
**Scope fence:** DONE: os 4 artefatos de core, o barrel e os exports. OUT: bindar qualquer coisa (T7), renomear qualquer coisa em `src/agent/` (T4), aplicar o middleware (T7), tocar `McpAdapter`/exposição (T3/T8). Estes arquivos nascem **MORTOS** — nenhum `import` em `src/` os cita ao fim desta Task, e isso é intencional (a spec ordena `core` primeiro exatamente para isso). Nada aqui importa de `src/agent/`, de `packages/contracts` ou de `@codedm/client-typescript`.
**Gate:** `cd packages/api/typescript/core && bun test src/types/AgentIdentity.test.ts && cd .. && bun x tsc -p tsconfig.build.json --noEmit` — exit 0 nos dois, e `grep -rn "McpScope\|AgentRunIdentity\|@codedm/client-typescript" core/src/types/AgentIdentity.ts core/src/services/AgentIdentityService core/src/middlewares/AgentIdentityMiddleware.ts` retorna **vazio** (AC-12)

### Step T2.1 — Proposed file: Create `core/src/types/AgentIdentity.ts`

COMPLETE file:

```typescript
/**
 * THE SHAPE OF "ON WHOSE BEHALF" — the core half of agent identity (B2, spec decision 6).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT CORE KNOWS AND WHAT IT DELIBERATELY DOES NOT
 * It knows that a run has a SCOPE (an opaque surface name), an EXPIRY, and some number of id-shaped
 * fields naming what the run is confined to. It does NOT know that the product's scopes are called
 * `issue-handling` / `orchestration` / `system`, and it does NOT know that this product's confinement
 * axes are `ownerId` / `issueId` / `threadId`. That is the whole point: the product tightens the type
 * (`scope: McpScope`, `issueId?: string`) at its own layer, and core keeps the FORMAT.
 *
 * WHY AN INDEX SIGNATURE RATHER THAN A GENERIC PARAMETER ON THE INTERFACE
 * The comparison below has to walk WHATEVER keys the product's identity carries, and it has to do so
 * without being told which. A closed interface would force core to name the axes; a generic would
 * force every core consumer to be generic over it, including the middleware the router resolves by
 * class token (a token has no type arguments at runtime). The index signature says exactly the true
 * thing: `scope` and `expiresAt` are core's, everything else is the product's and core only compares
 * it.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
export interface AgentIdentity {
	/**
	 * WHICH declared tool surface this credential opens — `string` here, an enum at the product layer.
	 *
	 * It is the AUTHORIZATION half. A credential minted for one surface must not authenticate a call
	 * against another, and core carries the field so the adapter (`McpAdapter`) can make that check
	 * without knowing what the surfaces are.
	 */
	scope: string
	/** Short-lived: the run window plus grace. Expiry is a BACKSTOP; `revoke` is the primary. */
	expiresAt: Date
	/**
	 * Everything else the product confines a run to — `issueId`, `threadId`, `entryId`, `ownerId`,
	 * whatever the product's `IdentitySchema` declared. Compared, never interpreted.
	 */
	[key: string]: unknown
}

/** One disagreement found by `compareIdentity`, with enough context to log WHERE it was. */
export interface IdentityMismatch {
	/** `params.threadId` / `body.issueId` — the layer the offending value arrived on. */
	at: string
	key: string
	claimed: string
	supplied: string
}

/**
 * Every key the IDENTITY carries whose value the CANDIDATE contradicts.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * ALLOW-LIST BY CONSTRUCTION, NOT A DENY-LIST OF THREE STRINGS
 * The predecessor (`agent/mcp/identity.ts`) walked the tool arguments against a hardcoded
 * `IDENTITY_KEYS = ['ownerId','issueId','threadId']` — blind to the fact that different scopes have
 * different identity SHAPES, and forced to SKIP (not reject) a key whose claim was absent. Here the
 * identity itself is the list: an orchestrator identity that carries no `issueId` compares no
 * `issueId`, and that is a property of the DATA rather than of an `if (claimed &&` in a walker.
 *
 * The gap that skipping leaves does not disappear and is not papered over: when the identity does not
 * confine an id the controller accepts, the controller's own `handle()` checks ownership — the rule
 * `SteerIssueTurnController` already implements and which spec decision 4 promotes to documented
 * requirement.
 *
 * WHY A FLAT CANDIDATE AND NOT A DEEP WALK — MEASURED, and the depth was never about depth
 * The old walk was deep because it ran on the JSON-RPC BODY, where a generated tool call nests the
 * request payload under `data` (`{ threadId, data: { issueId, … } }`). This runs one layer later, at
 * the controller the shim actually called, where the same two values have already been split into
 * `params` and `body` by the HTTP layer. Merging those two flat objects reaches exactly the same
 * three axes, at the point where they are already named.
 *
 * A non-string on either side is ignored rather than coerced: it cannot name an id, and comparing it
 * would invent a verdict no schema promised. ALL mismatches are returned, never the first — the log
 * should record the full shape of an attempt, not whichever axis happened to be walked first.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
export function compareIdentity(identity: AgentIdentity, candidate: Readonly<Record<string, unknown>>, at = ''): IdentityMismatch[] {
	const mismatches: IdentityMismatch[] = []
	for (const [key, claimed] of Object.entries(identity)) {
		if (key === 'scope' || typeof claimed !== 'string' || claimed.length === 0) continue
		const supplied = candidate[key]
		if (typeof supplied !== 'string') continue
		if (supplied !== claimed) mismatches.push({ at: at ? `${at}.${key}` : key, key, claimed, supplied })
	}
	return mismatches
}

/**
 * The header an agent run token travels in.
 *
 * SINGLE-SOURCED HERE because core is the SERVER side of it (`AgentIdentityMiddleware` reads it) and
 * core cannot import from `@codedm/client-typescript` — the api depends on the SDK, so the edge would
 * be a cycle. The generated per-scope `_http.ts` shims send this and ONLY this (no `authorization`
 * fallback), and the SDK's own `MCP_RUN_TOKEN_HEADER` must agree byte for byte; the api-side rail in
 * `tests/architecture/mcp-exposure.test.ts` pins the pair, because it is the one place that may
 * import both sides.
 */
export const AGENT_RUN_TOKEN_HEADER = 'x-codedm-run-token'

/**
 * Read the run token off a request — the dedicated header, or `Authorization: Bearer <token>`.
 *
 * Both spellings, because the two callers differ: the generated shim sets the dedicated header, and an
 * external MCP client driving the door by hand may only be able to set `Authorization`. Returns `''`
 * when there is none, which the middleware reads as "not an agent call" rather than as a failure.
 */
export function readAgentRunToken(headers: Readonly<Record<string, string | undefined>> | undefined): string {
	const dedicated = headers?.[AGENT_RUN_TOKEN_HEADER] ?? headers?.[AGENT_RUN_TOKEN_HEADER.toLowerCase()]
	if (dedicated) return dedicated
	const authorization = headers?.authorization ?? headers?.Authorization ?? ''
	return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice('bearer '.length).trim() : ''
}
```

### Step T2.2 — Proposed file: Create `core/src/services/AgentIdentityService/AgentIdentityService.ts`

COMPLETE file:

```typescript
import type { AgentIdentity } from '../../types/AgentIdentity'

/**
 * ISSUE / RESOLVE / REVOKE for the opaque token that carries a run's identity to the MCP door.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * THREE VERBS, THREE DIFFERENT CALLERS — an invariant, not a style preference:
 *
 * | verb      | sole caller                      | why it and nobody else                             |
 * |-----------|----------------------------------|----------------------------------------------------|
 * | `issue`   | the base `Agent`, at spawn       | only layer holding the input envelope AND the request |
 * | `resolve` | the destination controller's     | authorization is a per-CALL boundary, not per-run   |
 * |           | `AgentIdentityMiddleware` + the  |                                                     |
 * |           | adapter's scope match            |                                                     |
 * | `revoke`  | the runner, at run end           | only it knows the process died (normal/error/cancel) |
 *
 * A runner that ISSUES would have to be handed the identity the seam exists to keep out of it.
 *
 * THE GENERIC IS FOR THE PRODUCT'S NARROWED TYPE, AND IT ERASES CLEANLY
 * `AgentIdentityService<AgentRunIdentity>` at an injection site gives the product its own fields back
 * from `resolve()`; tsyringe reads `design:paramtypes`, which carries the ERASED class, so the binding
 * is found by the same class token regardless of the argument. No cast anywhere.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
export abstract class AgentIdentityService<I extends AgentIdentity = AgentIdentity> {
	/** Issue an opaque token for one run. Called EXCLUSIVELY by the base `Agent`. */
	abstract issue(identity: I): string

	/** Resolve a token to its identity, or `null` when unknown / expired / revoked. Per call. */
	abstract resolve(token: string): I | null

	/** Invalidate at run termination — normal, error or cancellation. Idempotent by contract. */
	abstract revoke(token: string): void
}
```

### Step T2.3 — Proposed file: Create `core/src/services/AgentIdentityService/InMemoryAgentIdentityService.ts`

COMPLETE file (o corpo migra verbatim de `src/agent/mcp/RunTokenService.ts`, com os verbos novos):

```typescript
import { singleton } from 'tsyringe-neo'
import { randomBytes } from 'node:crypto'
import type { AgentIdentity } from '../../types/AgentIdentity'
import { AgentIdentityService } from './AgentIdentityService'

/** 32 bytes of CSPRNG, base64url — ~256 bits of entropy, unguessable and opaque by construction. */
const TOKEN_BYTES = 32

/**
 * The implementation of the three verbs, in memory.
 *
 * ### Why in-memory is the RIGHT storage rather than a shortcut
 * A run token's lifetime is one agent run inside one daemon process: issued when the run starts,
 * carried to a child CLI, resolved by the destination controller in the SAME process, revoked by the
 * runner when the process dies. Persisting it would create a durable credential that outlives the
 * thing it authorizes — a token surviving a restart could authorize a write on behalf of a run whose
 * process is long gone, which is exactly the "late tool call from a dead run" this design answers
 * with a 401. A restart invalidating every token is CORRECT: no run survives a restart either.
 *
 * ### Opaque means opaque
 * Random bytes, not a signed envelope. Nothing about the identity can be read out of it — not by the
 * runner (which must not see identity at all), not by the CLI, not by the model. Resolution is a map
 * lookup, so the identity never travels outside this process.
 *
 * ### Expiry is a BACKSTOP
 * `revoke` at termination is the primary invalidation; `expiresAt` catches the run that died in a way
 * that skipped teardown. Both are checked on every resolve, and an expired entry is dropped ON READ so
 * a long-lived daemon does not accumulate dead identities.
 */
@singleton()
export class InMemoryAgentIdentityService<I extends AgentIdentity = AgentIdentity> extends AgentIdentityService<I> {
	private readonly tokens = new Map<string, I>()

	issue(identity: I): string {
		const token = randomBytes(TOKEN_BYTES).toString('base64url')
		this.tokens.set(token, identity)
		return token
	}

	resolve(token: string): I | null {
		const identity = this.tokens.get(token)
		if (!identity) return null
		if (identity.expiresAt.getTime() <= Date.now()) {
			this.tokens.delete(token)
			return null
		}
		return identity
	}

	revoke(token: string): void {
		this.tokens.delete(token)
	}
}
```

### Step T2.4 — Proposed file: Create `core/src/services/AgentIdentityService/index.ts`

```typescript
export * from './AgentIdentityService'
export * from './InMemoryAgentIdentityService'
```

- [ ] Conferir contra `core/src/services/CommandQueue/index.ts` — mesmo formato (re-export de cada arquivo, sem default)

### Step T2.5 — Proposed file: Create `core/src/middlewares/AgentIdentityMiddleware.ts`

COMPLETE file:

```typescript
import { singleton } from 'tsyringe-neo'
import { BaseError } from '../types/BaseError'
import type { BaseInterfaceErrors } from '../errors/codes'
import type { HttpControllerRequest, HttpMiddlewareResponse } from '../types/Http'
import type { Middleware } from '../types/Middleware'
import { AgentIdentityService } from '../services/AgentIdentityService'
import { compareIdentity } from '../types/AgentIdentity'

/**
 * THE DESTINATION-SIDE IDENTITY CHECK — auto-applied to every controller that declares `mcpScopes`
 * (B2, spec decision 4). It replaces BOTH the per-controller `RunTokenMiddleware` and the generic
 * argument walk the MCP door used to run over the JSON-RPC body.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * IT IS NOT LISTED IN `middlewares`, AND THAT IS THE POINT
 * `OperatorMiddleware` is opted into per controller because "who is this daemon" is a routing choice.
 * This one is not a choice: a controller that declared itself reachable as a model-callable tool has
 * ALREADY said the dangerous thing, and requiring a second, separate line to protect it means the
 * protection can be forgotten exactly where it matters. `Controller.executeMiddlewares` appends it
 * whenever `static mcpScopes` is non-empty — chosen over `MainRouter` because MainRouter is skippable
 * (emission never runs it, and a test that calls `executeController` directly bypasses it), and a
 * security boundary with a bypass is not one.
 *
 * NOT FAIL-CLOSED ON A MISSING TOKEN, DELIBERATELY
 * `system`-scope operations are the console's own reads — `GetHomeDashboard`, `GetSettings` — served
 * to a human operator with no agent run anywhere in sight. Rejecting an absent token would take the
 * whole console down to protect a surface no agent is calling. Absent token ⇒ this middleware does
 * nothing and the operator flow proceeds; a token that is PRESENT and dead is a different claim
 * entirely (a late call from a run that already ended) and gets 401.
 *
 * WHY IT COMPARES `params` + `body` AND NOT THE TOOL ARGUMENTS
 * By the time a generated tool reaches here it has already become an ordinary HTTP request, and the
 * two levels the old walk had to descend (`threadId` at the top, `data.issueId` nested) have been
 * split into `params` and `body` by the HTTP layer. `compareIdentity` reads the keys the IDENTITY
 * carries, so an identity without `issueId` compares no `issueId` — and the controller that accepts
 * an id its identity does not confine checks ownership itself, as `SteerIssueTurn` already does.
 *
 * WHY THE CODES ARE CORE'S AND NOT THE AGENT CONTEXT'S
 * `core/src/errors/codes.ts` states the rule: core never imports from a context, so it cannot raise
 * `AGENT_RUN_TOKEN_INVALID`. `UNAUTHORIZED` and `FORBIDDEN` carry the SAME statuses (401/403) the
 * predecessor did; the adapter, which is product-side, keeps raising the product's own codes.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
@singleton()
export class AgentIdentityMiddleware implements Middleware {
	constructor(private readonly identities: AgentIdentityService) {}

	async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
		const token = readAgentRunToken(request.headers)
		// NOT an agent call. The operator flow owns this request and this middleware has no opinion.
		if (!token) return {}

		const identity = this.identities.resolve(token)
		if (!identity) {
			throw new BaseError<BaseInterfaceErrors>('UNAUTHORIZED', 'missing, unknown, expired or revoked agent run token')
		}

		const mismatches = compareIdentity(identity, { ...request.params, ...request.body })
		if (mismatches.length > 0) {
			const detail = mismatches.map(m => `${m.at}=${m.supplied} (run is confined to ${m.claimed})`).join('; ')
			throw new BaseError<BaseInterfaceErrors>('FORBIDDEN', `this call targets another run's identity: ${detail}`)
		}

		// The identity the controller reads instead of re-declaring a ctx schema for what a middleware
		// injected. `ctx` never reaches the OpenAPI spec (the emitter reads only body/query/params/
		// headers), so this key is invisible to the SDK by construction.
		request.ctx = { ...request.ctx, agentIdentity: identity }
		return {}
	}
}
```

- [ ] Acrescentar `readAgentRunToken` ao import de `../types/AgentIdentity` (o bloco acima o usa; o import está escrito como `import { compareIdentity } from '../types/AgentIdentity'` e precisa virar `import { compareIdentity, readAgentRunToken } from '../types/AgentIdentity'`)

### Step T2.6 — Proposed file: Modify `core/src/middlewares/index.ts`

```typescript
export { RateLimitMiddleware } from './RateLimitMiddleware'
export { AgentIdentityMiddleware } from './AgentIdentityMiddleware'
```

E em `core/src/index.ts`, junto do bloco de `types/` (após `:18`, `export * from './types/Router'`) e do bloco de `services/` (após `:33`, `export * from './services/CommandQueue'`):

```typescript
export * from './types/AgentIdentity'
export * from './services/AgentIdentityService'
```

### Step T2.7 — O FALSEADOR: Create `core/src/types/AgentIdentity.test.ts`

COMPLETE file:

```typescript
import { describe, expect, it } from 'bun:test'
import { AGENT_RUN_TOKEN_HEADER, compareIdentity, readAgentRunToken, type AgentIdentity } from './AgentIdentity'
import { InMemoryAgentIdentityService } from '../services/AgentIdentityService'

const IN_AN_HOUR = () => new Date(Date.now() + 3_600_000)

const issueWorkIdentity = (): AgentIdentity => ({
	scope: 'issue-handling',
	ownerId: 'owner-a',
	issueId: 'issue-a',
	threadId: 'thread-a',
	expiresAt: IN_AN_HOUR(),
})

/** The orchestrator shape: thread-confined, structurally without an issue. */
const orchestratorIdentity = (): AgentIdentity => ({
	scope: 'orchestration',
	ownerId: 'owner-a',
	threadId: 'thread-a',
	entryId: 'entry-a',
	expiresAt: IN_AN_HOUR(),
})

describe('compareIdentity — the identity is the list, not a hardcoded deny-list', () => {
	it('FALSEADOR — a path param naming another thread is a mismatch', () => {
		const found = compareIdentity(issueWorkIdentity(), { threadId: 'ATTACKER-CHOSEN-THREAD' })
		expect(found).toHaveLength(1)
		expect(found[0]).toMatchObject({ key: 'threadId', claimed: 'thread-a', supplied: 'ATTACKER-CHOSEN-THREAD' })
	})

	it('FALSEADOR — a BODY field naming another issue is a mismatch, on the same footing as a param', () => {
		// The regression the predecessor's deep walk existed for: `RecordArtifact` composes its body
		// with `.omit({ ownerId, threadId })`, so `issueId` survives INTO the payload. At this layer the
		// payload is `request.body`, which the caller merges flat with `params` — same three axes.
		const found = compareIdentity(issueWorkIdentity(), { threadId: 'thread-a', issueId: 'issue-B' })
		expect(found.map(m => m.key)).toEqual(['issueId'])
	})

	it('reports EVERY axis, not the first — a log should show the whole shape of an attempt', () => {
		const found = compareIdentity(issueWorkIdentity(), { threadId: 'thread-B', issueId: 'issue-B' })
		expect(found.map(m => m.key).sort()).toEqual(['issueId', 'threadId'])
	})

	it('an identity that does NOT carry a key compares nothing for it — no skip branch, just absence', () => {
		// The orchestrator case. `issueId` is not in the identity, so a call naming one is not rejected
		// here; the controller that accepts it checks ownership itself (spec decision 4).
		expect(compareIdentity(orchestratorIdentity(), { threadId: 'thread-a', issueId: 'anything' })).toEqual([])
	})

	it('agreement is silence, and `scope` is never compared as an axis', () => {
		expect(compareIdentity(issueWorkIdentity(), { threadId: 'thread-a', issueId: 'issue-a', scope: 'system' })).toEqual([])
	})

	it('a non-string on either side is ignored rather than coerced', () => {
		expect(compareIdentity({ ...issueWorkIdentity(), issueId: 7 }, { issueId: '7' })).toEqual([])
		expect(compareIdentity(issueWorkIdentity(), { issueId: 7 })).toEqual([])
	})
})

describe('readAgentRunToken — both spellings, because the two callers differ', () => {
	it('reads the dedicated header the generated shim sets', () => {
		expect(readAgentRunToken({ [AGENT_RUN_TOKEN_HEADER]: 'tok' })).toBe('tok')
	})

	it('reads `Authorization: Bearer` for a client that can only set that', () => {
		expect(readAgentRunToken({ authorization: 'Bearer tok' })).toBe('tok')
	})

	it('absent is EMPTY, not an error — the operator flow has no token and is not a failure', () => {
		expect(readAgentRunToken(undefined)).toBe('')
		expect(readAgentRunToken({})).toBe('')
	})
})

describe('InMemoryAgentIdentityService — issue / resolve / revoke', () => {
	it('resolves what it issued, and the token carries nothing readable', () => {
		const service = new InMemoryAgentIdentityService()
		const identity = issueWorkIdentity()
		const token = service.issue(identity)

		expect(service.resolve(token)).toEqual(identity)
		expect(token).not.toContain('issue-a')
		expect(token).not.toContain('thread-a')
	})

	it('FALSEADOR — an EXPIRED identity resolves to null and is dropped on read', () => {
		const service = new InMemoryAgentIdentityService()
		const token = service.issue({ scope: 'issue-handling', threadId: 'thread-a', expiresAt: new Date(Date.now() - 1) })
		expect(service.resolve(token)).toBeNull()
		expect(service.resolve(token)).toBeNull()
	})

	it('FALSEADOR — revoke is immediate and idempotent: a late call from a dead run resolves to null', () => {
		const service = new InMemoryAgentIdentityService()
		const token = service.issue(issueWorkIdentity())
		service.revoke(token)
		service.revoke(token)
		expect(service.resolve(token)).toBeNull()
	})

	it('an unknown token is null — fails closed on a value nobody issued', () => {
		expect(new InMemoryAgentIdentityService().resolve('made-up')).toBeNull()
	})
})
```

### Step T2.8 — Vermelho, verde, e a prova de que o gate pode falhar

- [ ] `cd packages/api/typescript/core && bun test src/types/AgentIdentity.test.ts` ANTES dos Steps T2.1-T2.6 → falha em `Cannot find module './AgentIdentity'`
- [ ] Aplicar T2.1-T2.6, rodar de novo → verde
- [ ] **Provar que o gate pode falhar:** trocar em `compareIdentity` a linha `if (supplied !== claimed) mismatches.push(...)` por `if (false) mismatches.push(...)`; rodar → **3 `it` FALSEADOR ficam vermelhos** (os dois primeiros e o `reports EVERY axis`). Reverter. Registrar a saída no artefato do T10
- [ ] **Segundo falseador:** trocar `if (identity.expiresAt.getTime() <= Date.now())` por `if (false)`; rodar → o `it` `FALSEADOR — an EXPIRED identity resolves to null` fica vermelho. Reverter
- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` → exit 0
- [ ] `grep -rn "McpScope\|AgentRunIdentity\|@codedm/client-typescript\|from '\.\./\.\./src" core/src/types/AgentIdentity.ts core/src/services/AgentIdentityService core/src/middlewares/AgentIdentityMiddleware.ts` → **vazio** (AC-12: o core não conhece nem o enum nem o tipo do produto)

### Step T2.9 — Commit

```bash
git add packages/api/typescript/core/src/types/AgentIdentity.ts \
        packages/api/typescript/core/src/types/AgentIdentity.test.ts \
        packages/api/typescript/core/src/services/AgentIdentityService \
        packages/api/typescript/core/src/middlewares/AgentIdentityMiddleware.ts \
        packages/api/typescript/core/src/middlewares/index.ts \
        packages/api/typescript/core/src/index.ts
git commit -m "feat(core): B2 T2 — a identidade de agente vira formato do template

Quatro artefatos, todos agnosticos de produto: o formato (scope opaco + expiry +
o resto que o produto declarar), compareIdentity, o servico de 3 verbos
(issue/resolve/revoke, abstract + InMemory no padrao de CommandQueue) e o
middleware de destino.

compareIdentity troca o deny-list de 3 strings por allow-list pela forma do
dado: a identidade E a lista. Uma identidade sem issueId nao compara issueId —
antes isso era um if (claimed &&) dentro de um walker cego a scope.

E raso, nao profundo, e cobre os mesmos tres eixos: o walk descia dois niveis
porque lia o corpo JSON-RPC; aqui a chamada ja virou HTTP e o que estava em
data.issueId chega em request.body.issueId.

Nascem MORTOS. Nada em src/ os importa ainda — a ordem da spec e core primeiro."
```

---

## Task T3: Core hospeda a EXPOSIÇÃO — o slot `static mcpScopes`, `operationIdOf` único e `McpExposure`

**Files to write:**
- Create: `packages/api/typescript/core/src/utils/McpExposure.ts` — `operationIdOf`, `mcpScopesOf`, `class McpExposure`
- Create: `packages/api/typescript/core/src/utils/McpExposure.test.ts`
- Modify: `packages/api/typescript/core/src/types/Controller.ts` — o slot `static mcpScopes?: readonly string[]`
- Modify: `packages/api/typescript/core/src/utils/OpenAPI.ts` — `buildOperationId` **delega** para `operationIdOf` (a regra passa a ter um dono). Sem mudar de fonte ainda
- Modify: `packages/api/typescript/core/src/index.ts` — `export * from './utils/McpExposure'`

**Files to read:**
- `packages/api/typescript/core/src/utils/OpenAPI.ts:841-884` — `buildOperation`, `buildTags` e `buildOperationId`, as três funções que o T5 religa
- `packages/api/typescript/core/src/utils/OpenAPI.ts:481-517` — `generateSpecification` e o bloco que publica o `x-mcp-scopes` de RAIZ (o ponto que a spec não cita)
- `packages/api/typescript/core/src/types/Router.ts:9-15` — `controllers?: Controller[]`, a superfície que a varredura percorre
- `packages/api/typescript/src/agent/mcp/manifest.ts:236-252` — o `operationIdOf` duplicado e o docstring que explica por que o sufixo multi-método NÃO é reproduzido

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** opus
**Skills:** /controller, /test
**Depends on:** (none)
**Scope fence:** DONE: a função pura de varredura, o slot na base e o single-sourcing de `operationIdOf`. OUT: **trocar a FONTE do emitter** (T5 — `buildOperation` continua lendo `mcpScopesFor` ao fim desta Task, e `McpScopeRegistry.ts` continua vivo), declarar `static mcpScopes` em qualquer controller (T5), aplicar middleware (T7). `McpExposure` nasce MORTO como os artefatos do T2. Nada aqui importa de `src/` nem de `packages/contracts`.
**Gate:** `cd packages/api/typescript/core && bun test src/utils/McpExposure.test.ts && cd .. && bun x tsc -p tsconfig.build.json --noEmit && bun test` — exit 0 nos três (o `bun test` inteiro porque `buildOperationId` mudou de corpo e `OpenAPI.test.ts` existe)

### Step T3.1 — Proposed file: Create `core/src/utils/McpExposure.ts`

COMPLETE file:

```typescript
import type { Controller } from '../types/Controller'
import type { Router } from '../types/Router'

/** The static shape a controller CLASS carries when it declares itself model-callable. */
export interface McpExposedControllerClass {
	readonly name: string
	readonly mcpScopes?: readonly string[]
}

/**
 * `OP(C)` — the operationId of a controller, BY THE EMITTER'S OWN RULE, spelled once.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * THIS USED TO BE TWO COPIES AND A TEST BETWEEN THEM. `OpenAPI.buildOperationId` derived it from the
 * instance; `agent/mcp/manifest.ts#operationIdOf` re-derived it from the class, and
 * `tests/architecture/mcp-manifest.test.ts` asserted set-equality between the two so a drift in
 * either would be a red test rather than a silently empty tool. One function with two callers is
 * strictly better than two functions with a referee.
 *
 * THE MULTI-METHOD SUFFIX IS NOT REPRODUCIBLE FROM A CLASS, AND THAT IS SAID OUT LOUD
 * `buildOperationId` appends the HTTP method when a controller declares MORE THAN ONE — but `method`
 * is an INSTANCE property, so a class-side scan cannot know it. `methods` is therefore optional here:
 * the emitter passes the real list, a class-side scan passes nothing and gets the base name. No
 * controller in any declared scope has ever had more than one method, and the golden snapshot
 * (`tests/architecture/mcp-exposure.test.ts`) compares the class-side scan against the EMITTED spec
 * in both directions — so a controller that grows a second method turns into a red test, not into a
 * tool nobody can call.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
export function operationIdOf(target: McpExposedControllerClass | Controller, method?: string, methods?: readonly string[]): string {
	const className = 'name' in target && typeof target.name === 'string' && target.name.length > 0 ? target.name : target.constructor.name
	const baseName = className.replace('Controller', '')
	if (!method || !methods || methods.length <= 1) return baseName
	return `${baseName}${method.charAt(0).toUpperCase() + method.slice(1)}`
}

/**
 * The scopes a controller DECLARED — empty for everything nobody declared.
 *
 * THE DEFAULT IS NOT EXPOSED, and that is the entire security property: measured on the real spec,
 * `@kubb/plugin-mcp` with no `include` filter turned ALL 40 operations into tools. An endpoint born
 * tomorrow is not a model-callable tool tomorrow, because its class says nothing.
 *
 * Accepts an INSTANCE (the emitter walks `router.controllers`, already resolved by DI) or a CLASS
 * (a runtime scan walks the `controllers/index.ts` barrels). Both read the same `static`.
 */
export function mcpScopesOf(target: McpExposedControllerClass | Controller): readonly string[] {
	const source = (typeof target === 'function' ? target : target.constructor) as McpExposedControllerClass
	return source.mcpScopes ?? []
}

/**
 * A scan of the declared MCP exposure — `operationId ↔ scope`, both directions.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * A LOCAL OBJECT, NOT A REGISTRY. Its predecessor was a module-level `Map` in
 * `core/src/utils/McpScopeRegistry.ts`, populated by a SIDE-EFFECT import from the api package
 * (`agent/mcp/register.ts`) because the emitter lives in core and core must not import from `src`.
 * The `static` on the controller removes the need for that crossing entirely: the declaration
 * ARRIVES with the controller. So this is constructed where it is used, from what the caller already
 * holds, and it dies with the call. Nothing to register, nothing to order at boot, nothing to forget
 * to import — the measured failure of the predecessor was that commenting out ONE side-effect line
 * dropped the whole tool surface to zero with a green build.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
export class McpExposure {
	private readonly byOperation = new Map<string, string[]>()
	private readonly byScope = new Map<string, string[]>()

	private constructor(entries: Iterable<readonly [string, readonly string[]]>) {
		for (const [operationId, scopes] of entries) {
			if (scopes.length === 0) continue
			this.byOperation.set(operationId, [...scopes])
			for (const scope of scopes) this.byScope.set(scope, [...(this.byScope.get(scope) ?? []), operationId])
		}
	}

	/** From resolved controller INSTANCES — what `generateSpecification(routers)` already holds. */
	static fromRouters(routers: readonly Router[]): McpExposure {
		const controllers = routers.flatMap(router => router.controllers ?? [])
		return new McpExposure(controllers.map(controller => [operationIdOf(controller), mcpScopesOf(controller)] as const))
	}

	/** From controller CLASSES — what a runtime scan of the `controllers/index.ts` barrels holds. */
	static fromClasses(classes: Iterable<McpExposedControllerClass>): McpExposure {
		return new McpExposure([...classes].map(controller => [operationIdOf(controller), mcpScopesOf(controller)] as const))
	}

	/** The scopes exposing an operation. Empty for every operation nobody declared. */
	scopesFor(operationId: string): readonly string[] {
		return this.byOperation.get(operationId) ?? []
	}

	/** The operationIds of a scope, SORTED — the shape the published manifest and the snapshot compare. */
	operationIds(scope: string): readonly string[] {
		return [...(this.byScope.get(scope) ?? [])].sort()
	}

	/** Every scope something declared, sorted. Empty when this service has no MCP surface at all. */
	scopes(): readonly string[] {
		return [...this.byScope.keys()].sort()
	}

	/** `scope → operationIds`, the exact object published at the spec root as `x-mcp-scopes`. */
	manifest(): Record<string, string[]> {
		return Object.fromEntries(this.scopes().map(scope => [scope, [...this.operationIds(scope)]]))
	}
}
```

### Step T3.2 — Proposed file: Modify `core/src/types/Controller.ts`

O slot entra junto das outras "Optional properties" (`:71-74`), com a diferença de categoria declarada — é `static`, não instância:

```typescript
	// Optional properties.
	readonly contentType: MimeTypes = MimeTypes['.json']
	readonly mockController: boolean = false
	middlewares: (Middleware | MiddlewareClass)[] = []
	skipMiddlewares: (Middleware | MiddlewareClass)[] = []

	/**
	 * WHICH declared tool surfaces expose this operation as a model-callable MCP tool.
	 *
	 * `static`, and the difference from `middlewares` right above is the whole reason: `middlewares` is
	 * a property of the RUNNING controller (each instance may be re-wired by the router), while "is
	 * this endpoint exposed as a tool" is a property of the CLASS — read by the OpenAPI emitter during
	 * the scan, and by a runtime scan over the `controllers/index.ts` barrels, neither of which wants
	 * to construct anything to ask the question.
	 *
	 * `readonly string[]` and not an enum: core does not know what this product's surfaces are called.
	 * The product tightens it (`static override mcpScopes = [McpScope.ISSUE_HANDLING]`), and the
	 * assignment typechecks because the enum's members are strings.
	 *
	 * ABSENT IS THE DEFAULT AND ABSENT MEANS NOT EXPOSED. Measured: with no filter,
	 * `@kubb/plugin-mcp` turns every operation in the spec into a tool. The security property comes
	 * ENTIRELY from this being opt-in, per class, in the file a reviewer is already reading.
	 */
	static readonly mcpScopes?: readonly string[]
```

- [ ] Conferir que `static readonly mcpScopes?: …` sem inicializador compila sob `strictPropertyInitialization` (statics escapam da regra — mesmo mecanismo de `static readonly NAME: AgentName` em `src/agent/types/Agent.ts:60`)
- [ ] Conferir que `core/src/types/Controller.typecheck.test.ts` continua verde (ele exercita a constraint `ValidEnvelope`, que este campo não toca)

### Step T3.3 — Proposed file: Modify `core/src/utils/OpenAPI.ts` — `buildOperationId` passa a delegar

Só o corpo do método (`:876-884`). A fonte de `mcpScopes` **não muda nesta Task**:

```typescript
	private buildOperationId(controller: Controller, method: string): string {
		// THE rule, and it now has exactly one home (`utils/McpExposure.ts#operationIdOf`). It used to be
		// spelled here and copied by hand into `agent/mcp/manifest.ts`, with an architecture test
		// asserting set-equality between the two copies — a referee between two truths instead of one
		// truth with two callers.
		const methods = Array.isArray(controller.method) ? controller.method : [controller.method]
		return operationIdOf(controller, method, methods)
	}
```

e o import no topo, junto de `:10`:

```typescript
import { operationIdOf } from './McpExposure'
```

- [ ] O comportamento é **idêntico** ao de HEAD: mesmo `replace('Controller','')`, mesmo sufixo capitalizado quando `methods.length > 1`. `bun test core/src/utils/OpenAPI.test.ts` é o que prova
- [ ] `mcpScopeRegistrySnapshot`/`mcpScopesFor` continuam importados e usados (`:511`, `:849`) — a troca de fonte é do T5

### Step T3.4 — Proposed file: Create `core/src/utils/McpExposure.test.ts`

COMPLETE file:

```typescript
import { describe, expect, it } from 'bun:test'
import { McpExposure, mcpScopesOf, operationIdOf, type McpExposedControllerClass } from './McpExposure'

/** Class-shaped stand-ins — the scan reads a NAME and a static, and constructs nothing. */
const exposed = (name: string, mcpScopes?: readonly string[]): McpExposedControllerClass => ({ name, mcpScopes })

describe('operationIdOf — one rule, two callers', () => {
	it('strips the `Controller` suffix, which is the whole convention', () => {
		expect(operationIdOf(exposed('RecordArtifactController'))).toBe('RecordArtifact')
	})

	it('appends the method ONLY for a multi-method controller — the emitter half', () => {
		expect(operationIdOf(exposed('ChannelProxyController'), 'post', ['get', 'post'])).toBe('ChannelProxyPost')
		expect(operationIdOf(exposed('CreateIssueController'), 'post', ['post'])).toBe('CreateIssue')
	})

	it('a class-side scan passes no method and gets the base name — the documented limitation', () => {
		expect(operationIdOf(exposed('ChannelProxyController'))).toBe('ChannelProxy')
	})
})

describe('mcpScopesOf — the default is NOT exposed', () => {
	it('a class that declares nothing is exposed nowhere', () => {
		expect(mcpScopesOf(exposed('ArchiveIssueController'))).toEqual([])
	})

	it('reads the static off a class', () => {
		expect(mcpScopesOf(exposed('RaiseStopController', ['issue-handling', 'orchestration']))).toEqual(['issue-handling', 'orchestration'])
	})
})

describe('McpExposure — the scan, both directions', () => {
	const scan = () =>
		McpExposure.fromClasses([
			exposed('CreateIssueController', ['issue-handling']),
			exposed('RaiseStopController', ['issue-handling', 'orchestration']),
			exposed('ForkIssueController', ['orchestration']),
			exposed('ArchiveIssueController'),
		])

	it('operationId → scopes', () => {
		expect(scan().scopesFor('RaiseStop')).toEqual(['issue-handling', 'orchestration'])
	})

	it('scope → operationIds, sorted', () => {
		expect(scan().operationIds('issue-handling')).toEqual(['CreateIssue', 'RaiseStop'])
		expect(scan().operationIds('orchestration')).toEqual(['ForkIssue', 'RaiseStop'])
	})

	it('FALSEADOR — an undeclared controller is in NO scope and in NO manifest entry', () => {
		expect(scan().scopesFor('ArchiveIssue')).toEqual([])
		expect(JSON.stringify(scan().manifest())).not.toContain('ArchiveIssue')
	})

	it('the manifest is exactly what the spec root publishes as x-mcp-scopes', () => {
		expect(scan().manifest()).toEqual({
			'issue-handling': ['CreateIssue', 'RaiseStop'],
			orchestration: ['ForkIssue', 'RaiseStop'],
		})
	})

	it('a service with NO declared surface produces an EMPTY manifest, not a missing one', () => {
		// The generator treats `{}` as "this service declares nothing"; the api-side rail is what turns
		// "declared nothing" into a red test for THIS service. Core stays honest about the difference.
		expect(McpExposure.fromClasses([exposed('ArchiveIssueController')]).manifest()).toEqual({})
		expect(McpExposure.fromClasses([]).scopes()).toEqual([])
	})

	it('fromRouters reads the same static off INSTANCES the DI already resolved', () => {
		class RecordArtifactController {
			static readonly mcpScopes = ['issue-handling'] as const
		}
		const routers = [{ controllers: [new RecordArtifactController()] }] as unknown as Parameters<typeof McpExposure.fromRouters>[0]
		expect(McpExposure.fromRouters(routers).operationIds('issue-handling')).toEqual(['RecordArtifact'])
	})
})
```

### Step T3.5 — Vermelho, verde, e a prova de que o gate pode falhar

- [ ] `cd packages/api/typescript/core && bun test src/utils/McpExposure.test.ts` ANTES do T3.1 → falha em `Cannot find module './McpExposure'`
- [ ] Aplicar T3.1-T3.4 → verde
- [ ] **Provar que o gate pode falhar:** em `mcpScopesOf`, trocar `return source.mcpScopes ?? []` por `return source.mcpScopes ?? ['issue-handling']` (a default-is-exposed que o docstring proíbe); rodar → os dois `it` de "the default is NOT exposed" e o `FALSEADOR — an undeclared controller` ficam vermelhos. Reverter
- [ ] `cd packages/api/typescript && bun test core/src/utils/OpenAPI.test.ts` → verde, provando que a delegação de `buildOperationId` não mudou comportamento
- [ ] `bun x tsc -p tsconfig.build.json --noEmit && bun test` → exit 0 nos dois
- [ ] `git diff packages/api/typescript/public/docs/openapi.json` → **vazio** (nada foi reemitido; a fonte do emitter não mudou)

### Step T3.6 — Commit

```bash
git add packages/api/typescript/core/src/utils/McpExposure.ts \
        packages/api/typescript/core/src/utils/McpExposure.test.ts \
        packages/api/typescript/core/src/types/Controller.ts \
        packages/api/typescript/core/src/utils/OpenAPI.ts \
        packages/api/typescript/core/src/index.ts
git commit -m "feat(core): B2 T3 — o slot static mcpScopes e a varredura que substitui o Map global

A base Controller ganha \`static mcpScopes?: readonly string[]\` — static e nao de
instancia porque \"e exposto como tool\" e propriedade da CLASSE, lida sem
construir nada, tanto pelo emitter (que ja percorre router.controllers) quanto
por uma varredura de barris em runtime.

McpExposure e um OBJETO LOCAL, nao um registro: construido de quem o chamador ja
tem, morre com a chamada. O Map de modulo que ele substitui dependia de um
import de side-effect cuja remocao derrubava a superficie inteira de tools com
build verde.

operationIdOf passa a ter um dono so: buildOperationId DELEGA. Eram duas copias
com um teste de arbitro entre elas.

Nasce MORTO — buildOperation ainda le mcpScopesFor. A troca de fonte e o T5."

---

## Task T4: A identidade se auto-declara no agente e é PARSEADA NO SPAWN — `SCOPE_CONFINEMENT` morre

**Files to write:**
- Create: `packages/api/typescript/src/agent/types/AgentRunIdentity.ts` — o schema base + o tipo (ex-`RunTokenClaims`)
- Modify: `packages/api/typescript/src/agent/types/Agent.ts` — o slot `static IdentitySchema`, o parse no spawn, `.issue(` no lugar de `.mint(`
- Modify: `packages/api/typescript/src/agent/agents/IssueWorkAgent/IssueWorkAgent.ts` — `static IdentitySchema` com `issueId` obrigatório
- Modify: `packages/api/typescript/src/agent/agents/OrchestratorAgent/OrchestratorAgent.ts` — `static IdentitySchema` SEM o campo
- Modify: `packages/api/typescript/src/agent/mcp/manifest.ts` — `SCOPE_CONFINEMENT` + o `McpScope` local morrem; `MCP_SCOPE_NAMES` passa a derivar do enum de contracts
- Modify: `packages/api/typescript/src/agent/mcp/router.ts`, `src/agent/mcp/identity.ts`, `src/agent/mcp/E2eMcpDriver.ts`, `src/agent/middlewares/RunTokenMiddleware.ts` — o rename mecânico `RunTokenService`→`AgentIdentityService`, `RunTokenClaims`→`AgentRunIdentity`, `mint/verify`→`issue/resolve`
- Modify: `packages/api/typescript/src/shared/registry.ts` — o binding de `AgentIdentityService` (D-G: raiz, todos os envs)
- Modify: `packages/api/typescript/src/agent/registry.ts` — remove o binding de `RunTokenService`
- Delete: `packages/api/typescript/src/agent/services/RunTokenService/{RunTokenService,index}.ts`, `packages/api/typescript/src/agent/mcp/RunTokenService.ts`
- Rename+rewrite: `src/agent/types/Agent.confinement.test.ts` → `src/agent/types/Agent.identity.test.ts` — **o FALSEADOR**
- Modify: `src/agent/mcp/router.test.ts`, `src/agent/mcp/router.write-isolation.test.ts` — o mesmo rename mecânico

**Files to read:**
- `packages/api/typescript/src/agent/types/Agent.ts:118-186` — `buildMcpInvocation` inteiro: o guard de `caps`, o bloco de `SCOPE_CONFINEMENT` (`:145-156`) que é substituído, e o `mint` (`:158-174`)
- `packages/api/typescript/src/agent/types/Agent.confinement.test.ts` — a suíte que vira o falseador; **`ProbeAgent` (`:57-73`) é o molde e sobrevive**, com o scope virando um par (scope, IdentitySchema)
- `packages/api/typescript/src/shared/registry.ts:180-192` — onde os tokens de CORE são bindados (`LoggingService`, `MailSender`, `IdempotencyGuard`, `CommandQueue`), que é onde o novo entra
- `packages/api/typescript/src/agent/registry.ts:18-19,101` — o binding de `RunTokenService` que sai, e o comentário que explica por que é in-memory nos três envs

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** opus
**Skills:** /entity, /service, /schema, /test
**Depends on:** T1, T2
**Consumes (frozen):** de T1, verbatim — `McpScope` (`ISSUE_HANDLING` / `ORCHESTRATION` / `SYSTEM`) de `@codedm/contracts-typescript/wire/enums`. De T2, verbatim — `AgentIdentityService` (abstract, verbos `issue`/`resolve`/`revoke`, genérico em `I extends AgentIdentity`), `InMemoryAgentIdentityService`, a interface `AgentIdentity` (`scope: string`, `expiresAt: Date`, index signature) e `AGENT_RUN_TOKEN_HEADER` — todos de `@codedm/core-typescript`.
**Scope fence:** DONE: o `static IdentitySchema`, o parse no spawn, o rename completo do vocabulário de identidade, a morte de `SCOPE_CONFINEMENT` e a migração do binding para `shared/registry.ts`. OUT: `static mcpScopes` em controller nenhum (T5); `MCP_SCOPES`/`TOOLS_IN_SCOPE`/`ISSUE_HANDLING_OPERATION` continuam VIVOS e intocados no manifesto encolhido (T5 os mata); `identity.ts` continua existindo com o walk (T7 o mata) — só troca os NOMES dos tipos; `AgentIdentityMiddleware` continua sem call site (T7); o adaptador continua sendo `McpRouterController` (T8). **Ponte consciente de UM commit:** ao fim desta Task `manifest.ts` existe só para `MCP_SCOPE_NAMES`/`MCP_SCOPES`/`TOOLS_IN_SCOPE`/`ISSUE_HANDLING_OPERATION`/`MCP_SCOPE_BY_OPERATION`; declarar isso na mensagem de commit.
**Gate:** `cd packages/api/typescript && bun test src/agent && bun x tsc -p tsconfig.build.json --noEmit` — exit 0 nos dois, e `grep -rn "RunTokenClaims\|RunTokenService\|SCOPE_CONFINEMENT\|\.mint(" packages/api/typescript/src packages/api/typescript/core` retorna **vazio** (AC-6, AC-7)

### Step T4.1 — Proposed file: Create `src/agent/types/AgentRunIdentity.ts`

COMPLETE file:

```typescript
import { z } from '@codedm/core-typescript'
import type { AgentIdentity } from '@codedm/core-typescript'
import { McpScope } from '@codedm/contracts-typescript/wire/enums'
import type Z from 'zod'
import type { AgentName } from '../enums'

/**
 * THE FIELDS A RUN IS CONFINED TO — the product's half of agent identity (B2, spec decision 3).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * THIS IS THE BASE, NOT THE CONTRACT. Each agent narrows it into its OWN `static IdentitySchema`:
 * `IssueWorkAgent` requires `issueId`, `OrchestratorAgent` does not have the field at all. That is
 * the inversion this frente is about — "which scope needs which id" used to be a `Record<McpScope,
 * 'issue'|'thread'>` in a manifest, read by exactly ONE call site, and a scope added tomorrow was a
 * line somebody had to remember to add. Now the requirement is stated by the agent that has it, in
 * the file that has it, and parsed BEFORE a credential exists.
 *
 * WHY THE VALUES ARE PRIMITIVES AND NOT `z.instance(Id)`. This is not an entity and not a value
 * object: it is the payload of a credential that travels to a child CLI and comes back on a header.
 * The project's layer rule (CLAUDE.md) puts `z.instance(Id)` on entity and value-object schemas ONLY;
 * events, use cases, controllers and credentials keep `z.uuid()`.
 *
 * WHY `entryId` LIVES HERE AND NOT IN A TOOL SCHEMA. `ForkIssue` needs the transcript entry the
 * operator's request arrived on, because that entry is what the finished answer quotes. If the field
 * were an argument the MODEL would supply it — and a model reading a group chat written by third
 * parties could attribute its issue to any message in the conversation. Keeping it OUT of every
 * schema makes the attribution unforgeable by construction rather than by validation: there is no
 * argument to check, because there is no argument.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
export const AgentRunIdentitySchema = z.object({
	ownerId: z.uuid(),
	/**
	 * The issue this run is confined to. OPTIONAL IN THE BASE and required by whoever needs it — the
	 * orchestrator is keyed by THREAD and structurally has none (its session row is the one with
	 * `issue_id IS NULL`).
	 */
	issueId: z.uuid().optional(),
	threadId: z.uuid(),
	/** The transcript entry that TRIGGERED this run, when one did. Absent on runs no message triggered. */
	entryId: z.uuid().optional(),
})

/** The confinement fields alone — what an agent's `IdentitySchema` produces. */
export type AgentRunIdentityFields = Z.output<typeof AgentRunIdentitySchema>

/**
 * What the issued token resolves back to. Extends the core FORMAT (`scope` + `expiresAt` + whatever
 * else the product carries) with this product's confinement axes and its two credential facts.
 *
 * Renamed from `RunTokenClaims` (spec decision 3): "claims" named the ENVELOPE, and there is no
 * envelope — the token is 32 random bytes and the fields never leave this process. What travels is a
 * lookup key; what this type describes is the IDENTITY the lookup returns.
 */
export interface AgentRunIdentity extends AgentIdentity, AgentRunIdentityFields {
	agentName: AgentName
	/**
	 * WHICH declared tool surface this credential opens — the AUTHORIZATION half.
	 *
	 * Without it a token is a bearer credential for the WHOLE MCP door: `IssueWorkAgent` is issued for
	 * `issue-handling` (six writes on its own issue) and the same bytes would authenticate a call
	 * against `/mcp/system` and its twenty-three operations — `CreateOwner`, `DisableOwner`,
	 * `AddWorkspace`, `RemoveWorkspace` among them. None of those carry a confinement axis in their
	 * arguments, so the comparison finds nothing to reject. The token rides on the child CLI's argv,
	 * readable by the very shell-capable model this design defends against, so "the agent only asks
	 * for its own scope" is not a property anyone can rely on. `--allowedTools` is the CLIENT-side
	 * half of the same rule; the SCOPE MATCH in the adapter is the server-side one, and only the
	 * server-side one is a boundary.
	 */
	scope: McpScope
	/** Short-lived: the run window plus grace. Expiry is a backstop; `revoke` is the primary. */
	expiresAt: Date
}
```

- [ ] `McpScope` é importado como VALOR (não `import type`) porque o tipo do campo é o enum — conferir que o lint não pede `import type` para um uso só-tipo; se pedir, `import type { McpScope }`

### Step T4.2 — Proposed file: Modify `src/agent/types/Agent.ts`

Quatro blocos. **(a)** os imports (`:1-11`) — `SCOPE_CONFINEMENT` sai, o enum e o serviço de core entram:

```typescript
import type Z from 'zod'
import type { ZodType } from 'zod'
import { BaseError, Config, AgentIdentityService } from '@codedm/core-typescript'
import { McpScope } from '@codedm/contracts-typescript/wire/enums'
import type { AgentName, AgentToolName } from '../enums'
import type { AgentRunner } from '../services/AgentRunner'
import type { AgentMcpInvocation } from './AgentMcpInvocation'
import type { ProviderCapabilities } from './ProviderCapabilities'
import type { AgentRunIdentity, AgentRunIdentityFields } from './AgentRunIdentity'
import { MCP_ROUTE_PREFIX } from '../mcp/route'
import type { AgentApplicationErrors } from '../errors'
```

**(b)** o slot novo, junto de `static readonly NAME` (`:56-60`):

```typescript
	/**
	 * THE SHAPE OF THIS AGENT'S IDENTITY — declared by the agent that has it (spec decision 3).
	 *
	 * It replaces `SCOPE_CONFINEMENT`, a `Record<McpScope, 'issue' | 'thread'>` in the MCP manifest
	 * whose ONLY reader was the line below. That record made "which id does this surface require" a
	 * property of the SCOPE, kept in a file far from every agent, and a scope added tomorrow was a
	 * line somebody had to remember to add — with the weaker confinement as the silent default if
	 * they forgot.
	 *
	 * Here the requirement is a schema on the class: `IssueWorkAgent.IdentitySchema` demands `issueId`,
	 * `OrchestratorAgent.IdentitySchema` does not have the field. A NEW scope forces the question at
	 * the only place that can answer it — the first agent that declares the scope — and forces it at
	 * the moment that matters, which is BEFORE a credential exists.
	 *
	 * Declared here without an initializer so `run()` can read it off `this.constructor`; statics
	 * escape `strictPropertyInitialization`, same mechanism as `NAME` above. `undefined` is legal and
	 * means "this agent declares no scope" — an agent that declares one and no schema fails loudly at
	 * spawn rather than issuing a credential confined to nothing.
	 */
	static readonly IdentitySchema?: ZodType<AgentRunIdentityFields>
```

**(c)** o construtor (`:83`):

```typescript
	constructor(protected readonly identities: AgentIdentityService<AgentRunIdentity>) {}
```

**(d)** o miolo de `buildMcpInvocation` — o bloco `SCOPE_CONFINEMENT` (`:145-156`) é substituído pelo parse, e `mint` vira `issue`:

```typescript
	private buildMcpInvocation(input: this['input'], request: { caps?: ProviderCapabilities }, scope: McpScope): AgentMcpInvocation {
		// A CLI whose probe says it cannot take an MCP config cannot serve an agent that REQUIRES tools.
		// NAMED failure, never a silent drop to the inferred path: degrading here would look exactly
		// like a healthy run that simply chose to declare nothing, which is the one distinction the
		// declared/inferred split exists to preserve. Absent `caps` stays permissive by the same rule
		// the argv builder uses — the probe did not run, so nothing was ruled out.
		if (request.caps && request.caps.mcpConfig === false) {
			throw new BaseError<AgentApplicationErrors>(
				'AGENT_TOOLS_UNSUPPORTED',
				`agent ${(this.constructor as typeof Agent).NAME} requires the '${scope}' tool scope, but this CLI build cannot take an MCP config`,
			)
		}

		// IDENTITY IS PARSED BEFORE IT CAN BECOME A CREDENTIAL (spec decision 3). This used to read
		// `if (SCOPE_CONFINEMENT[scope] === 'issue' && !input.issueId) throw` — one hardcoded axis, one
		// hardcoded question, keyed off a record in a manifest. The requirement did not go away: it
		// became the agent's OWN schema, so an agent that needs an issue says so where it lives, and an
		// agent that does not simply has no such field for anything to demand.
		//
		// It runs BEFORE `.issue(` and that ORDER is the property, not a detail: an identity that does
		// not parse never becomes a token, so there is no credential confined to nothing for a model to
		// hold — and `runner.run` is never reached, which is what the falsifier counts.
		const IdentitySchema = (this.constructor as typeof Agent).IdentitySchema
		if (!IdentitySchema) {
			throw new BaseError<AgentApplicationErrors>(
				'AGENT_TOOLS_UNSUPPORTED',
				`agent ${(this.constructor as typeof Agent).NAME} declares the '${scope}' tool scope but no IdentitySchema — a credential with no declared shape cannot be confined`,
			)
		}
		const parsed = IdentitySchema.safeParse({
			ownerId: input.ownerId,
			issueId: input.issueId,
			threadId: input.threadId,
			// Carried so the destination controller can read the originating entry off `ctx.agentIdentity`
			// — the reason `ForkIssue` does not take it as an argument. Absent on runs no message triggered.
			entryId: input.entryId,
		})
		if (!parsed.success) {
			throw new BaseError<AgentApplicationErrors>(
				'AGENT_TOOLS_UNSUPPORTED',
				`agent ${(this.constructor as typeof Agent).NAME} declares the '${scope}' tool scope, whose identity it cannot satisfy: ${parsed.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`,
			)
		}

		const token = this.identities.issue({
			...parsed.data,
			agentName: (this.constructor as typeof Agent).NAME,
			scope,
			expiresAt: new Date(Date.now() + RUN_TOKEN_TTL_MS),
		})

		// HTTP is the DECIDED default: the daemon is already an HTTP server, so the MCP door costs no
		// extra process and no extra port.
		return {
			transport: 'http',
			endpoint: `http://127.0.0.1:${Config.env.API_PORT}/${Config.version}${MCP_ROUTE_PREFIX}/${this.mcpScope}`,
			token,
			allowedTools: this.tools,
		}
	}
```

e o tipo de `mcpScope` (`:79`) passa a ser o enum de contracts:

```typescript
	readonly mcpScope?: McpScope
```

- [ ] Se `tsc` reclamar da variância de `ZodType<AgentRunIdentityFields>` contra o `ZodObject` que `.extend()`/`.omit()` produzem, afrouxar o slot para `ZodType<Partial<AgentRunIdentityFields>>` e manter o spread de `parsed.data` — **não** montar o payload relendo `input`, o que anularia o parse como gate
- [ ] `RUN_TOKEN_TTL_MS` (`:19`) fica com o nome — é o TTL do token, não das claims

### Step T4.3 — Proposed file: Modify os dois agentes

`IssueWorkAgent.ts`, junto de `mcpScope`/`tools` (`:53-54`):

```typescript
	/**
	 * `issueId` is REQUIRED — the security half, stated where the agent lives.
	 *
	 * This agent's tools are six WRITES performed on its own issue, and the destination-side check
	 * (`AgentIdentityMiddleware`) can only compare an axis the identity CARRIES. An identity without
	 * `issueId` gives no protection at all on an `issueId` argument, so a credential that could call
	 * these tools without naming its issue would be a credential confined to nothing.
	 *
	 * It is enforced at SPAWN, before `.issue(` — see `Agent.buildMcpInvocation`.
	 */
	static override readonly IdentitySchema = AgentRunIdentitySchema.extend({ issueId: z.uuid() })

	override readonly mcpScope = McpScope.ISSUE_HANDLING
```

`OrchestratorAgent.ts` (`:47-49`):

```typescript
	/**
	 * NO `issueId` — not "optional", ABSENT. The orchestrator is keyed by THREAD and structurally has
	 * no issue, and the field's absence is what tells the destination-side comparison there is nothing
	 * to compare on that axis. The consequence is named, not hidden: every tool in this scope that
	 * ACCEPTS an `issueId` verifies ownership in its own handler (`SteerIssueTurn` does exactly that),
	 * because no generic check can help where there is no claim.
	 */
	static override readonly IdentitySchema = AgentRunIdentitySchema.omit({ issueId: true })

	override readonly mcpScope = McpScope.ORCHESTRATION
```

- [ ] Nos dois: o construtor passa `identities` em vez de `runTokens` para `super(...)`; o parâmetro tipa `AgentIdentityService<AgentRunIdentity>`
- [ ] `override readonly tools = TOOLS_IN_SCOPE[...]` fica INTOCADO nesta Task (é do T5). Com `mcpScope` virando enum, o índice passa a ser `TOOLS_IN_SCOPE[McpScope.ISSUE_HANDLING]` — o valor do enum é a mesma string, então o `Record` indexa igual

### Step T4.4 — Proposed file: Modify `src/agent/mcp/manifest.ts` — o encolhimento

- [ ] Apagar o bloco `SCOPE_CONFINEMENT` inteiro (`:83-131`, docstring incluído)
- [ ] Apagar `export const MCP_SCOPE_NAMES = [...] as const` e `export type McpScope = ...` (`:80-81`), substituindo por:

```typescript
import { McpScope } from '@codedm/contracts-typescript/wire/enums'

/**
 * The declared surfaces, as an iterable. The VALUES are the wire spelling and they now come from
 * `packages/contracts` — this file no longer owns the vocabulary, only (until T5) the lists derived
 * from it.
 */
export const MCP_SCOPE_NAMES = Object.values(McpScope)
export { McpScope }
```

- [ ] `MCP_SCOPES` continua `satisfies Record<McpScope, readonly ControllerClass[]>` — agora contra o enum, que é o mesmo conjunto de chaves
- [ ] Acrescentar no topo do docstring do arquivo: `// SHRINKING (B2 T4): SCOPE_CONFINEMENT is gone — confinement is each agent's own `static IdentitySchema`, parsed at spawn. The remaining lists die in T5.`

### Step T4.5 — O rename mecânico nos 4 consumidores + 2 testes

Tabela de substituição, aplicada verbatim:

| de | para |
|---|---|
| `RunTokenService` (tipo/import/param) | `AgentIdentityService<AgentRunIdentity>` (import de `@codedm/core-typescript`) |
| `RunTokenClaims` | `AgentRunIdentity` (de `../types/AgentRunIdentity`) |
| `.mint(` | `.issue(` |
| `.verify(` | `.resolve(` |
| `runTokens` (nome de campo/param) | `identities` |
| `claims` (variável local) | `identity` |

- [ ] `src/agent/mcp/router.ts` — `:7` o import, `:69` o construtor, `:80-82` o `resolve`, `:161` a assinatura de `rejectMismatchedIdentity` (o walk em si **fica** até o T7)
- [ ] `src/agent/mcp/identity.ts` — só os tipos: `findIdentityMismatches(args, identity: AgentRunIdentity)` e `assertIdentityMatchesClaims` → **renomear para `assertIdentityMatches`** (o sufixo `Claims` some com o tipo). O corpo e o `IDENTITY_KEYS` ficam; morrem no T7
- [ ] `src/agent/mcp/E2eMcpDriver.ts` — `:6` o import, `:65` o construtor, `:88` e `:127` os `verify`→`resolve`, e o guard vira `if (identity && !identity.entryId) return []` (**o guard C8 sobrevive, só troca de nome de variável**)
- [ ] `src/agent/middlewares/RunTokenMiddleware.ts` — mesmo rename; o arquivo continua existindo e continua fail-closed (morre no T7)
- [ ] `src/agent/mcp/router.test.ts` — `:7`, `:8`, `:38` (`claimsForA` → `identityForA`), `:42` (`scope: 'issue-handling'` → `McpScope.ISSUE_HANDLING`)
- [ ] `src/agent/mcp/router.write-isolation.test.ts` — `:8`, `:9`, `:50-53`

### Step T4.6 — Os bindings trocam de arquivo

`src/agent/registry.ts`: apagar o import de `RunTokenService`/`InMemoryRunTokenService` (`:18-19`) e a entrada de binding (`:101`, o bloco comentado inteiro).

`src/shared/registry.ts`, junto dos outros tokens de core (após `CommandQueue`, `:191`):

```typescript
	// The agent run identity — the SINGLE source of "on whose behalf" for every MCP tool call.
	//
	// It lives HERE and not in `agent/registry.ts` for a mechanical reason: `AgentIdentityMiddleware`
	// is auto-applied by `Controller.executeMiddlewares`, which resolves from the ROOT container
	// (`container.resolve(middlewareOrClass)`) — so a binding scoped to one context's child container
	// would resolve in production and throw in any suite that exercises a controller directly. Same
	// shelf as `CommandQueue` and `IdempotencyGuard`: a core seam the whole process shares.
	//
	// One in-memory instance per process in EVERY env: a token's lifetime is one run inside one
	// daemon, and a persisted one would outlive the process it authorizes. Bound in all three because
	// the integration and mock suites exercise the 401/403 boundary directly, and a double would be a
	// second implementation of the thing under test.
	{ token: AgentIdentityService, mock: InMemoryAgentIdentityService, integration: InMemoryAgentIdentityService, real: InMemoryAgentIdentityService },
```

- [ ] Import em `shared/registry.ts`: `AgentIdentityService, InMemoryAgentIdentityService` de `@codedm/core-typescript`, junto do bloco que já traz `CommandQueue, MockCommandQueue, SqliteCommandQueue` (`:31-33`)
- [ ] Rodar `bun test tests/architecture/real-di-resolution.test.ts` — a rail resolve `IssueWorkAgent`/`OrchestratorAgent` de `ALL_REGISTRIES.real` e vai vermelha se o binding não estiver visível

### Step T4.7 — O FALSEADOR: rename+rewrite `Agent.confinement.test.ts` → `Agent.identity.test.ts`

**Baseline medido em HEAD `ec8f419d`:** `bun test src/agent/types/Agent.confinement.test.ts` → **6 pass / 0 fail / 11 expect() calls / 1 arquivo**.

COMPLETE file:

```typescript
import { describe, expect, it } from 'bun:test'
import type { ZodType } from 'zod'
import type { BaseError } from '@codedm/core-typescript'
import { InMemoryAgentIdentityService, z } from '@codedm/core-typescript'
import { McpScope } from '@codedm/contracts-typescript/wire/enums'
import { AgentRunner } from '../services/AgentRunner'
import { AgentName, AgentRunOutcome } from '../enums'
import type { AgentRunRequest, AgentRuntimeEvent } from '../types'
import { AgentRunIdentitySchema, type AgentRunIdentity } from './AgentRunIdentity'
import { Agent } from './Agent'

/**
 * IDENTITY IS PARSED AT SPAWN, AND AN IDENTITY THAT DOES NOT PARSE NEVER BECOMES A CREDENTIAL
 * (B2, spec decision 3 — the falsifier this frente does not close without).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACES. `Agent.confinement.test.ts` pinned the same property through
 * `SCOPE_CONFINEMENT` — a `Record<McpScope, 'issue' | 'thread'>` in the MCP manifest, read by exactly
 * one line in `buildMcpInvocation`. The property survives; its CARRIER changed from a record keyed by
 * scope to a schema owned by the agent. So the tests below assert through each agent's OWN
 * `IdentitySchema` rather than through a scope name, which is what keeps them meaningful when a scope
 * is added.
 *
 * THE TWO HALVES, AND NEITHER IS OPTIONAL:
 *  1. An agent whose schema REQUIRES a field refuses to spawn without it. This is the security half —
 *     a credential that can call six writes on an issue must name the issue it may write to, or the
 *     destination-side comparison has no axis to compare arguments against and waves everything
 *     through (it compares the keys the identity CARRIES; an absent key is an absent check).
 *  2. An agent whose schema does NOT declare the field spawns happily without it. This is the half
 *     the orchestrator needs, and it is what made the old blanket `if (!input.issueId) throw` fatal.
 *
 * AND THE ORDER IS THE PROPERTY: the refusal happens BEFORE `.issue(` and therefore before
 * `runner.run`, which is why every refusal case asserts `runner.requests` is EMPTY. A test that only
 * asserted the throw would stay green against an implementation that issued the token first.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */

class CapturingRunner extends AgentRunner {
	readonly requests: AgentRunRequest<ZodType | undefined>[] = []

	run<OutputSchema extends ZodType | undefined = undefined>(request: AgentRunRequest<OutputSchema>): AsyncIterable<AgentRuntimeEvent> {
		this.requests.push(request)
		return (async function* () {
			yield {
				type: 'finished',
				result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'done', sessionId: 's1', failed: false },
			} satisfies AgentRuntimeEvent
		})()
	}

	async shutdown(): Promise<void> {}
}

const ProbeInputSchema = z.agentInput({})

/**
 * A minimal REAL subclass rather than a mock: minting happens inside the base's template-method
 * `run()`, so anything that stubbed the base would be testing itself. The scope AND the schema are
 * constructor/static inputs so one class can stand in for both agent shapes — and the schema is a
 * static, exactly as a real agent declares it.
 */
function probeAgentFor(scope: McpScope, IdentitySchema: ZodType | undefined) {
	return class ProbeAgent extends Agent<typeof ProbeInputSchema> {
		static override readonly NAME = AgentName.ISSUE_WORK
		static override readonly IdentitySchema = IdentitySchema as never
		override readonly inputSchema = ProbeInputSchema
		override readonly mcpScope = scope
		override readonly tools = ['mcp__codedm__Probe']

		protected buildRequest(input: this['input']): Omit<AgentRunRequest, 'mcp' | 'agentName'> {
			return { cwd: input.cwd, systemPrompt: 'probe', messages: [] }
		}
	}
}

const OWNER = '00000000-0000-4000-8000-0000000000aa'
const THREAD = '00000000-0000-4000-8000-0000000000bb'
const ISSUE = '00000000-0000-4000-8000-0000000000cc'
const ENTRY = '00000000-0000-4000-8000-0000000000dd'

const drain = async (agent: Agent<typeof ProbeInputSchema>, runner: CapturingRunner, extra: Record<string, string> = {}) => {
	for await (const _ of agent.run(runner, { ownerId: OWNER, threadId: THREAD, cwd: '/tmp/x', ...extra })) {
		// drain
	}
}

/** The two real shapes, spelled the way the two real agents spell them. */
const IssueWorkIdentity = AgentRunIdentitySchema.extend({ issueId: z.uuid() })
const OrchestratorIdentity = AgentRunIdentitySchema.omit({ issueId: true })

describe('Agent — the identity is parsed at spawn, and it gates the credential', () => {
	it('FALSEADOR — an agent whose IdentitySchema REQUIRES issueId refuses to spawn without one', async () => {
		const runner = new CapturingRunner()
		const Probe = probeAgentFor(McpScope.ISSUE_HANDLING, IssueWorkIdentity)
		const agent = new Probe(new InMemoryAgentIdentityService<AgentRunIdentity>())

		await expect(drain(agent, runner)).rejects.toThrow(expect.objectContaining({ name: 'AGENT_TOOLS_UNSUPPORTED' }) as BaseError)
		// BEFORE the spawn — the ORDER is the property. An implementation that issued first and then
		// validated would throw exactly the same error and leave this counter at 1.
		expect(runner.requests).toHaveLength(0)
	})

	it('FALSEADOR — and no credential was created: the service holds nothing to resolve', async () => {
		const identities = new InMemoryAgentIdentityService<AgentRunIdentity>()
		const Probe = probeAgentFor(McpScope.ISSUE_HANDLING, IssueWorkIdentity)
		const agent = new Probe(identities)

		await expect(drain(agent, new CapturingRunner())).rejects.toThrow()
		// There is no token to name, so the assertion is on the store's behaviour: nothing it could
		// have issued resolves. `issue()` is the only writer and it was never reached.
		expect(identities.resolve('')).toBeNull()
	})

	it('the same agent spawns normally WITH the field, and the identity carries it', async () => {
		const runner = new CapturingRunner()
		const identities = new InMemoryAgentIdentityService<AgentRunIdentity>()
		const Probe = probeAgentFor(McpScope.ISSUE_HANDLING, IssueWorkIdentity)

		await drain(new Probe(identities), runner, { issueId: ISSUE })

		const identity = identities.resolve(runner.requests[0]?.mcp?.token ?? '')
		expect(identity?.issueId).toBe(ISSUE)
		expect(identity?.scope).toBe(McpScope.ISSUE_HANDLING)
		expect(identity?.agentName).toBe(AgentName.ISSUE_WORK)
	})

	it('an agent whose IdentitySchema does NOT declare issueId spawns without one', async () => {
		const runner = new CapturingRunner()
		const identities = new InMemoryAgentIdentityService<AgentRunIdentity>()
		const Probe = probeAgentFor(McpScope.ORCHESTRATION, OrchestratorIdentity)

		await drain(new Probe(identities), runner)

		const identity = identities.resolve(runner.requests[0]?.mcp?.token ?? '')
		expect(identity?.threadId).toBe(THREAD)
		// ABSENT, not undefined-but-present: the schema omitted the key, so the destination-side
		// comparison has no `issueId` axis at all. That absence is what the owning controller
		// compensates for by checking ownership itself.
		expect(identity && 'issueId' in identity).toBe(false)
	})

	it('an identity that is present but MALFORMED is refused too — the parse is not a presence check', async () => {
		const runner = new CapturingRunner()
		const Probe = probeAgentFor(McpScope.ISSUE_HANDLING, IssueWorkIdentity)
		const agent = new Probe(new InMemoryAgentIdentityService<AgentRunIdentity>())

		await expect(drain(agent, runner, { issueId: 'not-a-uuid' })).rejects.toThrow(
			expect.objectContaining({ name: 'AGENT_TOOLS_UNSUPPORTED' }) as BaseError,
		)
		expect(runner.requests).toHaveLength(0)
	})

	it('an agent that declares a scope and NO IdentitySchema fails loudly instead of issuing', async () => {
		const runner = new CapturingRunner()
		const Probe = probeAgentFor(McpScope.SYSTEM, undefined)
		const agent = new Probe(new InMemoryAgentIdentityService<AgentRunIdentity>())

		await expect(drain(agent, runner)).rejects.toThrow(expect.objectContaining({ name: 'AGENT_TOOLS_UNSUPPORTED' }) as BaseError)
		expect(runner.requests).toHaveLength(0)
	})

	it('entryId rides the envelope into the identity — the channel that makes attribution unforgeable', async () => {
		const runner = new CapturingRunner()
		const identities = new InMemoryAgentIdentityService<AgentRunIdentity>()
		const Probe = probeAgentFor(McpScope.ORCHESTRATION, OrchestratorIdentity)

		await drain(new Probe(identities), runner, { entryId: ENTRY })

		expect(identities.resolve(runner.requests[0]?.mcp?.token ?? '')?.entryId).toBe(ENTRY)
	})
})

describe('the two REAL agents declare the two shapes', () => {
	it('IssueWorkAgent.IdentitySchema requires issueId; OrchestratorAgent.IdentitySchema has no such field', async () => {
		const { IssueWorkAgent } = await import('../agents/IssueWorkAgent')
		const { OrchestratorAgent } = await import('../agents/OrchestratorAgent')

		expect(IssueWorkAgent.IdentitySchema?.safeParse({ ownerId: OWNER, threadId: THREAD }).success).toBe(false)
		expect(IssueWorkAgent.IdentitySchema?.safeParse({ ownerId: OWNER, threadId: THREAD, issueId: ISSUE }).success).toBe(true)

		const orchestrator = OrchestratorAgent.IdentitySchema?.safeParse({ ownerId: OWNER, threadId: THREAD })
		expect(orchestrator?.success).toBe(true)
		expect(orchestrator?.success && 'issueId' in orchestrator.data).toBe(false)
	})
})
```

### Step T4.8 — VERMELHO → VERDE, com os números

- [ ] **Vermelho (1):** `cd packages/api/typescript && git mv src/agent/types/Agent.confinement.test.ts src/agent/types/Agent.identity.test.ts`, aplicar SÓ o T4.7 (o teste), rodar `bun test src/agent/types/Agent.identity.test.ts` → falha em `Cannot find module './AgentRunIdentity'` (o schema não existe)
- [ ] **Vermelho (2):** aplicar T4.1 (o schema) e rodar de novo → **os 2 `it` FALSEADOR + o `MALFORMED` + o `NO IdentitySchema` reprovam** com `AGENT_TOOLS_UNSUPPORTED` ausente e `runner.requests` = 1, porque `buildMcpInvocation` ainda usa `SCOPE_CONFINEMENT` e `SCOPE_CONFINEMENT[McpScope.ISSUE_HANDLING] === 'issue'` só cobre o caso "sem issueId" — o caso `not-a-uuid` PASSA pelo guard velho. Registrar a contagem exata de `fail`
- [ ] **Verde:** aplicar T4.2-T4.6, rodar → `bun test src/agent/types/Agent.identity.test.ts` com **0 fail**. Registrar `N pass / M expect()` no artefato do T10 (baseline de HEAD para comparação: 6 pass / 11 expect)
- [ ] **Provar que o gate pode falhar (o falseador da condição 5, e ele é DUPLO):**
  - (a) Comentar as 4 linhas do `if (!parsed.success) { throw … }` em `Agent.buildMcpInvocation` e rodar → **exatamente 2 `it` ficam vermelhos**: `FALSEADOR — an agent whose IdentitySchema REQUIRES issueId refuses to spawn without one` e `an identity that is present but MALFORMED is refused too`. Descomentar. Colar a saída (`N pass / 2 fail`) no artefato do T10
  - (b) MOVER o bloco de parse para DEPOIS do `this.identities.issue(...)` (mantendo o throw) e rodar → o `it` `FALSEADOR — and no credential was created` continua verde por acidente, mas `runner.requests` na primeira asserção ainda é 0… **portanto**: em vez disso, trocar `if (!parsed.success) throw` por `if (!parsed.success) { this.identities.issue({ ...} as never); throw … }` e rodar → o `it` `FALSEADOR — and no credential was created` fica vermelho. Reverter. Este é o falseador da ORDEM, distinto do da VALIDAÇÃO
- [ ] `bun test src/agent && bun x tsc -p tsconfig.build.json --noEmit` → exit 0 nos dois
- [ ] `grep -rn "RunTokenClaims\|RunTokenService\|SCOPE_CONFINEMENT\|\.mint(" packages/api/typescript/src packages/api/typescript/core` → **vazio** (AC-6, AC-7)
- [ ] `bun test tests/architecture/real-di-resolution.test.ts` → verde (o binding mudou de arquivo)

### Step T4.9 — Commit

```bash
git add packages/api/typescript/src/agent/types/AgentRunIdentity.ts \
        packages/api/typescript/src/agent/types/Agent.ts \
        packages/api/typescript/src/agent/types/Agent.identity.test.ts \
        packages/api/typescript/src/agent/agents/IssueWorkAgent/IssueWorkAgent.ts \
        packages/api/typescript/src/agent/agents/OrchestratorAgent/OrchestratorAgent.ts \
        packages/api/typescript/src/agent/mcp \
        packages/api/typescript/src/agent/middlewares/RunTokenMiddleware.ts \
        packages/api/typescript/src/agent/registry.ts \
        packages/api/typescript/src/agent/services/RunTokenService \
        packages/api/typescript/src/shared/registry.ts
git commit -m "refactor(agent): B2 T4 — o agente declara a propria identidade, e ela e parseada no spawn

SCOPE_CONFINEMENT era um Record<McpScope,'issue'|'thread'> num manifesto, com UM
unico leitor (Agent.ts:151). Ele dizia \"esta superficie exige um issueId\" longe
de qualquer agente, e um scope novo era uma linha que alguem tinha que lembrar
de acrescentar — com a confinacao mais fraca como default silencioso.

Agora cada agente declara \`static IdentitySchema\`: IssueWork exige issueId,
Orchestrator NAO TEM o campo (nao \"opcional\" — ausente, que e o que diz a
comparacao no destino que ali nao ha eixo a comparar).

O parse roda ANTES de .issue(, e essa ORDEM e a propriedade: identidade que nao
parseia nunca vira credencial, e o runner nunca e alcancado. Os falseadores
contam runner.requests, nao so o throw.

Renames: RunTokenClaims -> AgentRunIdentity (nao ha envelope: o token e 32 bytes
aleatorios e a identidade nunca sai do processo), RunTokenService ->
AgentIdentityService com issue/resolve/revoke — e o abstract migra para o core,
com o binding indo para shared/registry.ts porque executeMiddlewares resolve
pelo container RAIZ.

PONTE DE UM COMMIT: manifest.ts sobrevive encolhido, so com as listas de
exposicao (MCP_SCOPES / TOOLS_IN_SCOPE / ISSUE_HANDLING_OPERATION /
MCP_SCOPE_BY_OPERATION). O T5 as mata."
```

---

## Task T5: A exposição se auto-declara — 32 controllers ganham `static mcpScopes`, o manifesto e o `Map` global morrem

**Files to write:**
- Modify (32 arquivos, 7 contextos): cada controller hoje listado em `MCP_SCOPES` ganha `static override readonly mcpScopes = [...]` — lista completa no Step T5.2
- Create: `packages/api/typescript/src/agent/mcp/exposure.ts` — a varredura de classes (lado runtime da D-A)
- Modify: `packages/api/typescript/core/src/utils/OpenAPI.ts` — `buildOperation` e o `x-mcp-scopes` de RAIZ passam a ler `McpExposure`
- Modify: `packages/api/typescript/core/src/index.ts` — o export de `McpScopeRegistry` sai
- Delete: `packages/api/typescript/core/src/utils/McpScopeRegistry.ts`, `packages/api/typescript/src/agent/mcp/manifest.ts`, `packages/api/typescript/src/agent/mcp/register.ts`
- Modify: `src/agent/registry.ts` (o `import './mcp/register'` sai), `src/agent/mcp/router.ts` (`resolveScope` contra o enum), `src/agent/mcp/E2eMcpDriver.ts`, `src/agent/agents/{IssueWorkAgent,OrchestratorAgent}/{*.ts,prompt.ts}`, `src/shared/context-map.ts`
- Modify (testes): `src/agent/mcp/generated-server.test.ts`, `src/agent/agents/IssueWorkAgent/IssueWorkAgent.test.ts`, `src/agent/agents/OrchestratorAgent/{OrchestratorAgent,prompt}.test.ts`, `src/agent/services/AgentRunner/ClaudeAgentRunner/buildArgs.test.ts`
- Delete: `packages/api/typescript/tests/architecture/mcp-manifest.test.ts` — **deixa de compilar no instante em que `manifest.ts` some**; o substituto é o T6, no MESMO commit
- Modify (GERADO, commitar): `packages/api/typescript/public/docs/openapi.json`, `packages/client/dist/typescript/src/**`

**Files to read:**
- `packages/api/typescript/src/agent/mcp/manifest.ts:150-224` — `MCP_SCOPES`, a fonte literal dos 33 pares (scope, controller) que viram statics; **os docstrings por scope migram para os controllers ou para `exposure.ts`, não se perdem**
- `packages/api/typescript/core/src/utils/OpenAPI.ts:481-517` e `:841-874` — os DOIS pontos que trocam de fonte
- `packages/client/generators/typescript.ts:56-90` e `:320-360` — por que o `x-mcp-scopes` de raiz é contrato e o que a asserção de contagem compara
- `packages/api/typescript/src/shared/context-map.ts:1-8` e `:145-175` — `NOTE_MCP_MANIFEST`, as 6 `POLICY_EXCEPTIONS` geradas por `.map()` e o `ANNOTATED_CYCLES` de `agent ↔ ui`
- `packages/api/typescript/tests/architecture/wiring-completeness.test.ts` — WIRE-03, a rail que garante que a varredura de barris não tem ponto cego

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** opus
**Skills:** /controller, /enum, /sdk, /test
**Depends on:** T1, T3, T4
**Consumes (frozen):** de T1, verbatim — `McpScope` de `@codedm/contracts-typescript/wire/enums`. De T3, verbatim — `McpExposure` (`fromRouters` / `fromClasses` / `scopesFor` / `operationIds` / `scopes` / `manifest`), `operationIdOf(target, method?, methods?)`, `mcpScopesOf(target)` e o slot `static readonly mcpScopes?: readonly string[]` na base `Controller`, todos de `@codedm/core-typescript`. De T4, verbatim — `AgentRunIdentity`, `AgentIdentityService`, e o fato de que `mcpScope` nos dois agentes já é o enum.
**Scope fence:** DONE: os statics, a varredura de runtime, a troca de fonte do emitter nos DOIS pontos, a morte das 5 estruturas restantes + `register.ts` + `McpScopeRegistry.ts` + `manifest.ts`, e o regen de spec+SDK. **UMA ADIÇÃO DE SUPERFÍCIE NOMEADA** (spec decisão 8, AC-3): `RaiseStopController` ganha `McpScope.ORCHESTRATION` além do `ISSUE_HANDLING` que já tinha — é a única mudança de exposição desta frente, e é a única diferença esperada no diff de `openapi.json`/SDK. OUT: `AgentIdentityMiddleware` continua sem call site (T7); `identity.ts` + `RunTokenMiddleware` continuam vivos (T7); o adaptador continua `McpRouterController` (T8); nenhum controller muda de path, de método, de schema ou de `middlewares`.
**Gate:** `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun test && cd ../../.. && bun emit-openapi && bun sdk && bun check:generated` — exit 0 em todos, e `grep -rn "mcp/manifest\|McpScopeRegistry\|mcpScopesFor\|registerMcpScopes\|MCP_SCOPES\|SCOPE_CONFINEMENT\|TOOLS_IN_SCOPE\|ISSUE_HANDLING_OPERATION\|MCP_SCOPE_BY_OPERATION" packages/api packages/client packages/e2e` retorna **vazio** (AC-2)

### Step T5.1 — Proposed file: Create `src/agent/mcp/exposure.ts`

COMPLETE file:

```typescript
import { McpExposure, operationIdOf, type McpExposedControllerClass } from '@codedm/core-typescript'
import { McpScope } from '@codedm/contracts-typescript/wire/enums'
import * as artifactControllers from '@artifact/controllers'
import * as issueControllers from '@issue/controllers'
import * as threadControllers from '@thread/controllers'
import * as uiControllers from '@ui/controllers'
import * as workspaceControllers from '@workspace/controllers'
import * as ownerControllers from '@owner/controllers'
import * as agentControllers from '../controllers'
import { wireToolName } from './wire'

/**
 * THE RUNTIME HALF OF THE EXPOSURE SCAN (B2, spec decision 2 — the Open Question this plan closes).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * IT IMPORTS BARRELS TO DISCOVER, WHERE THE MANIFEST IMPORTED CLASSES TO DECLARE
 * Its predecessor, `mcp/manifest.ts`, held `MCP_SCOPES = { 'issue-handling': [A, B, C, …] }` — the
 * scope↔controller association LIVED there, and a controller joining a scope was an edit to that
 * list. This file holds no list: it asks every exported controller class what its own
 * `static mcpScopes` says. A controller that joins a scope tomorrow is scanned tomorrow, with no edit
 * here, and one that leaves simply stops appearing.
 *
 * WHY A SCAN OF BARRELS AND NOT A SCAN OF `router.controllers`
 * The emitter already walks resolved instances and does exactly that (`McpExposure.fromRouters`). The
 * RUNTIME cannot: an agent needs its `--allowedTools` while assembling a spawn, in a module that
 * cannot reach `src/routers.ts` without a cycle (`routers.ts → agent/index.ts → agent/registry.ts`).
 * Injecting the exposure through DI was measured against the wrong wall too —
 * `tests/architecture/real-di-resolution.test.ts` resolves both agents from a child container built
 * from `ALL_REGISTRIES.real` alone, with no composition root anywhere, and a binding that needed
 * `Router[]` would make that rail red on the spot.
 *
 * THE SCAN HAS NO BLIND SPOT, AND THAT IS ENFORCED ELSEWHERE
 * `tests/architecture/wiring-completeness.test.ts` (WIRE-03) already requires every class extending
 * `Controller` to be exported from its context's `controllers/index.ts`. A controller outside its
 * barrel is a red build for an older reason than this file, so "the barrel is the whole set" is a
 * property somebody else is already guarding.
 *
 * THE CROSS-CONTEXT IMPORTS ARE CONFINED TO THIS FILE, exactly as they were confined to the manifest,
 * and `shared/context-map.ts` names the six per-file exceptions. What changed is the JUSTIFICATION:
 * they used to be here so one screen could DECLARE the audience; they are here now so one module can
 * DISCOVER it without dragging a barrel import into a prompt builder.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */

/** Every exported controller class of every context that has (or may grow) an MCP surface. */
const ALL_CONTROLLER_CLASSES: readonly McpExposedControllerClass[] = [
	agentControllers,
	artifactControllers,
	issueControllers,
	threadControllers,
	uiControllers,
	workspaceControllers,
	ownerControllers,
].flatMap(barrel => Object.values(barrel).filter((value): value is McpExposedControllerClass => typeof value === 'function'))

/** The scan, computed once per process. Classes are static; re-walking them per call buys nothing. */
const EXPOSURE = McpExposure.fromClasses(ALL_CONTROLLER_CLASSES)

/** `SCOPE_OPS(s)` — the operationIds a scope exposes, derived and never written down. */
export function operationIdsInScope(scope: McpScope): readonly string[] {
	return EXPOSURE.operationIds(scope)
}

/**
 * The expansion an agent declares as its `tools`. NEVER a hand-written list: adding
 * `static mcpScopes` to a controller changes the argv with no edit to a runner, an agent or a test.
 */
export function toolsInScope(scope: McpScope): readonly string[] {
	return operationIdsInScope(scope).map(wireToolName)
}

/** The scan itself, for the golden snapshot to compare against the emitted spec. */
export function mcpExposure(): McpExposure {
	return EXPOSURE
}

/**
 * `WIRE(C)` — the spelling an MCP client calls a controller by. One hop over `operationIdOf`, which
 * is core's single copy of the emitter's own rule.
 */
export function toolNameOf(controller: McpExposedControllerClass): string {
	return wireToolName(operationIdOf(controller))
}

export { operationIdOf, wireToolName }

/**
 * The controller classes NAMED BY PROSE — a prompt that tells a model which tool to call, and the
 * deterministic e2e driver that calls two of them by name.
 *
 * This is NOT the scope list reborn: nothing here says which surface any of them belongs to, and
 * removing an entry removes a SENTENCE, not an exposure. They are re-exported from this file for one
 * mechanical reason — it is the module already licensed to import another context's barrel, and
 * spreading that license to a prompt builder would spread the context-map exceptions with it.
 */
export const {
	CreateIssueController,
	TransitionIssueStatusController,
	RaiseStopController,
	AskOperatorController,
	ForkIssueController,
} = agentControllers
export const { RecordArtifactController } = artifactControllers
```

- [ ] `Object.values(barrel).filter(typeof === 'function')` pega TODA classe exportada, incluindo as sem `mcpScopes` — `mcpScopesOf` devolve `[]` para elas e `McpExposure` as descarta. **Nenhuma lista de opt-out**
- [ ] Conferir que os barris não exportam funções que não sejam controller (ex.: um helper). Se exportarem, o filtro ainda é seguro: `operationIdOf` deriva um nome e `mcpScopesOf` devolve `[]`, então a entrada é descartada por `McpExposure`
- [ ] `agentControllers` inclui `TestRunIssueTurnController` (só montado sob `CODEDM_E2E`) — sem `static mcpScopes`, logo invisível para a varredura, que é o correto

### Step T5.2 — Os 32 controllers se auto-declaram (33 pares + 1 novo = 34)

Padrão, imediatamente acima de `readonly path`, com `McpScope` importado de `@codedm/contracts-typescript/wire/enums`:

```typescript
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.ISSUE_HANDLING]
```

| Contexto | Arquivo | `mcpScopes` |
|---|---|---|
| agent | `controllers/CreateIssue.ts` | `[McpScope.ISSUE_HANDLING]` |
| agent | `controllers/TransitionIssueStatus.ts` | `[McpScope.ISSUE_HANDLING]` |
| agent | `controllers/RaiseStop.ts` | **`[McpScope.ISSUE_HANDLING, McpScope.ORCHESTRATION]`** ← a única adição de superfície (decisão 8) |
| agent | `controllers/AskOperator.ts` | `[McpScope.ISSUE_HANDLING]` |
| agent | `controllers/ForkIssue.ts` | `[McpScope.ORCHESTRATION]` |
| agent | `controllers/SteerIssueTurn.ts` | `[McpScope.ORCHESTRATION]` |
| artifact | `controllers/RecordArtifact.ts` | `[McpScope.ISSUE_HANDLING]` |
| artifact | `controllers/ListArtifacts.ts` | `[McpScope.SYSTEM]` |
| thread | `controllers/SendDirectMessage.ts` | `[McpScope.ISSUE_HANDLING]` |
| thread | `controllers/GetThreadSettings.ts` | `[McpScope.SYSTEM]` |
| thread | `controllers/GetSessionChat.ts` | `[McpScope.SYSTEM]` |
| thread | `controllers/ConfigureContextBuffer.ts` | `[McpScope.SYSTEM]` |
| thread | `controllers/ConfigureMentionGate.ts` | `[McpScope.SYSTEM]` |
| thread | `controllers/GetNeedsYouPanel.ts` | `[McpScope.SYSTEM]` |
| issue | `controllers/GetSessionIssues.ts` | `[McpScope.ORCHESTRATION, McpScope.SYSTEM]` ← o único já multi-scope em HEAD |
| issue | `controllers/GetIssueStatus.ts` | `[McpScope.ORCHESTRATION]` |
| issue | `controllers/GetIssueDetail.ts` | `[McpScope.SYSTEM]` |
| issue | `controllers/GetIssuesOverview.ts` | `[McpScope.SYSTEM]` |
| ui | `controllers/GetHomeDashboard.ts` | `[McpScope.SYSTEM]` |
| ui | `controllers/GetMyAccount.ts` | `[McpScope.SYSTEM]` |
| ui | `controllers/GetSettings.ts` | `[McpScope.SYSTEM]` |
| ui | `controllers/GetSetupChecklist.ts` | `[McpScope.SYSTEM]` |
| ui | `controllers/GetUserInfo.ts` | `[McpScope.SYSTEM]` |
| ui | `controllers/GetAttachThreadWizard.ts` | `[McpScope.SYSTEM]` |
| workspace | `controllers/ListWorkspaces.ts` | `[McpScope.SYSTEM]` |
| workspace | `controllers/AddWorkspace.ts` | `[McpScope.SYSTEM]` |
| workspace | `controllers/RemoveWorkspace.ts` | `[McpScope.SYSTEM]` |
| owner | `controllers/CreateOwner.ts` | `[McpScope.SYSTEM]` |
| owner | `controllers/SetActiveOwner.ts` | `[McpScope.SYSTEM]` |
| owner | `controllers/UpdateOwnerSettings.ts` | `[McpScope.SYSTEM]` |
| owner | `controllers/EnableOwner.ts` | `[McpScope.SYSTEM]` |
| owner | `controllers/DisableOwner.ts` | `[McpScope.SYSTEM]` |

- [ ] **32 classes, 34 pares.** Conferir contra `MCP_SCOPES` de HEAD ANTES de apagar o manifesto: 6 + 4 + 23 = 33 pares, `GetSessionIssuesController` aparecendo em dois scopes; +1 = `RaiseStop`→`ORCHESTRATION`
- [ ] Os arquivos de controller que estão em `MCP_SCOPES` mas cujo caminho é preciso confirmar caso a caso: `grep -rn "class <Nome>Controller" packages/api/typescript/src` para cada um. **`RaiseStopController` está em `src/agent/controllers/RaiseStop.ts`**, não em `issue/` nem em `thread/` (ver a tabela de Ground)
- [ ] Os docstrings por scope que hoje vivem no manifesto (`:151-156` issue-handling, `:158-171` orchestration, `:173-181` system) migram: a parte sobre POR QUE um scope tem a forma que tem vai para o docstring do `enum McpScope`… não — o `.tsp` é contrato de wire e não deve carregar política de produto. **Vão para `exposure.ts`**, num bloco `### As três superfícies e por que são três` colado do manifesto. Não perder a frase sobre `ListenEvents`/`StreamTerminalSession` ausentes de propósito (são SSE e travariam o agente)
- [ ] `ArchiveIssue`/`RestoreIssue`/`SteerIssue` (issue) e `AttachThread`/`PauseThread`/`ResumeThread`/`SetParticipantInvocation`/`SteerThread`/`ResolveStop`/`UpdateStopCriteria` (thread) **NÃO ganham nada** — não estavam em `MCP_SCOPES` e a ausência é a exposição zero

### Step T5.3 — Proposed file: Modify `core/src/utils/OpenAPI.ts` — a troca de fonte, nos DOIS pontos

**(a)** o import (`:10`) sai e entra o novo:

```typescript
import { McpExposure } from './McpExposure'
```

**(b)** um campo privado na classe, junto dos outros estados de emissão:

```typescript
	/**
	 * The MCP exposure of THIS emission — built from the routers handed to `generateSpecification` and
	 * discarded with it. Its predecessor was a module-level `Map` in `utils/McpScopeRegistry.ts`,
	 * populated by a side-effect import from the api package; the `static mcpScopes` on the controller
	 * removes the crossing entirely, so there is nothing to register and nothing to order at boot.
	 */
	private mcpExposure = McpExposure.fromClasses([])
```

**(c)** `generateSpecification` (`:481`), no topo e no bloco de raiz (`:508-517`):

```typescript
	async generateSpecification(routers: Router[]): Promise<void> {
		this.registerErrorSchemas()
		// BEFORE the walk: `buildOperation` reads it per operation.
		this.mcpExposure = McpExposure.fromRouters(routers)

		for (const router of routers) {
			for (const controller of router.controllers ?? []) {
				this.buildPath(controller, router)
			}
		}

		// … unchanged …

		// THE MANIFEST ITSELF, published at the ROOT — `scope → the operationIds declared under it`.
		//
		// NOT a convenience index over the per-operation `x-mcp-scope` stamps: it is the OTHER SIDE of
		// them, and the SDK generator reads it as the authority for what must exist
		// (`packages/client/generators/typescript.ts`, which throws when the emitted tool count
		// disagrees). Deriving the expected surface from those same stamps would make the assertion
		// tautological, and a scope whose tag filter matched nothing would emit zero tools with a green
		// build.
		//
		// Emitted only when something declared, so a service with no MCP surface stays byte-identical.
		const manifest = this.mcpExposure.manifest()
		if (Object.keys(manifest).length > 0) {
			;(this.spec as OpenAPIV3.Document & { 'x-mcp-scopes'?: Record<string, string[]> })['x-mcp-scopes'] = manifest
		}
```

**(d)** `buildOperation` (`:841-861`), só a linha da fonte:

```typescript
		// THE MCP CROSSING. The declaration is the controller's OWN `static mcpScopes` — read here off
		// the class during the same walk that builds the path, with no registry and no side-effect
		// module in between.
		//
		// Empty for every operation nobody declared — THE DEFAULT IS NOT EXPOSED, and that is the whole
		// security property: an endpoint born tomorrow is not a model-callable tool tomorrow.
		const mcpScopes = this.mcpExposure.scopesFor(operationId)
```

- [ ] `buildTags` (`:863`) fica **byte-idêntico** — continua recebendo `mcpScopes` e escrevendo `mcp:<scope>`
- [ ] Apagar `core/src/utils/McpScopeRegistry.ts` e a linha `export * from './utils/McpScopeRegistry'` de `core/src/index.ts:53`

### Step T5.4 — Os consumidores das listas mortas

- [ ] `src/agent/agents/IssueWorkAgent/IssueWorkAgent.ts` — `import { toolsInScope } from '../../mcp/exposure'`; `override readonly tools = toolsInScope(McpScope.ISSUE_HANDLING)`
- [ ] `src/agent/agents/OrchestratorAgent/OrchestratorAgent.ts` — idem com `McpScope.ORCHESTRATION`
- [ ] `src/agent/agents/IssueWorkAgent/prompt.ts` — os 4 `ISSUE_HANDLING_OPERATION.x` (`:57-60`) viram `operationIdOf(<Classe>)`:

```typescript
import { operationIdOf, TransitionIssueStatusController, RaiseStopController, AskOperatorController, RecordArtifactController } from '../../mcp/exposure'
// …
			`  · finished → call the ${operationIdOf(TransitionIssueStatusController)} tool with status COMPLETED and a short summary.`,
			`  · blocked and you need the operator to decide or approve → call the ${operationIdOf(RaiseStopController)} tool.`,
			`  · you need one specific answer to keep going → call the ${operationIdOf(AskOperatorController)} tool.`,
			`  · produced a link, image or file worth keeping → call the ${operationIdOf(RecordArtifactController)} tool.`,
```

- [ ] `src/agent/agents/OrchestratorAgent/prompt.ts:180` — `const [createIssue] = TOOLS_IN_SCOPE.orchestration` era **destructuring POSICIONAL** do primeiro item de uma lista ordenada à mão, e a ordem era a garantia. Vira nominal: `const createIssue = toolNameOf(ForkIssueController)`. **Isso corrige um acoplamento à ordem que o T5 tornaria silenciosamente errado** (a varredura ordena alfabeticamente, então `[0]` de `orchestration` passaria a ser `ForkIssue`… ou `GetIssueStatus`, dependendo do conjunto). Registrado como apertada nomeada
- [ ] `src/agent/mcp/E2eMcpDriver.ts` — `ISSUE_HANDLING_OPERATION.recordArtifact` → `operationIdOf(RecordArtifactController)`, `.transitionIssueStatus` → `operationIdOf(TransitionIssueStatusController)`, e o import de `./manifest` vira `./exposure`. O `operationIdOf(ForkIssueController)` de `:93` só troca de módulo. **O guard `!identity.entryId` (C8) não é tocado**
- [ ] `src/agent/mcp/router.ts` — `resolveScope` deixa de varrer `MCP_SCOPE_NAMES`:

```typescript
	private resolveScope(candidate: string): McpScope {
		const scope = Object.values(McpScope).find(name => name === candidate)
		if (!scope) throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_TOKEN_INVALID', `unknown MCP scope '${candidate}'`)
		return scope
	}
```

e `GENERATED_SERVERS` continua `Record<McpScope, …>` — agora indexado pelo enum, cujos valores são as mesmas 3 strings (AC-15)
- [ ] `src/agent/registry.ts` — apagar `import './mcp/register'` (`:22`) e o comentário de 3 linhas acima dele

### Step T5.5 — Os testes que liam o manifesto

- [ ] `src/agent/mcp/generated-server.test.ts` — `MCP_SCOPE_NAMES` → `Object.values(McpScope)`; `scopeOperationIds(scope)` → **ler o `x-mcp-scopes` do `openapi.json` COMMITADO**, não `operationIdsInScope`. Razão: este arquivo prova que o SERVIDOR GERADO lista exatamente a superfície declarada, e o servidor gerado descende do spec — comparar o gerado contra a varredura de classes fecharia o círculo pelo lado errado e deixaria a divergência spec↔classe invisível aqui. (Essa comparação é do T6, que é o lugar dela.)
- [ ] `src/agent/agents/IssueWorkAgent/IssueWorkAgent.test.ts:93-95,109` — `TOOLS_IN_SCOPE['issue-handling']` → `toolsInScope(McpScope.ISSUE_HANDLING)`; `MCP_SCOPES['issue-handling'].length` → `operationIdsInScope(McpScope.ISSUE_HANDLING).length`; `TOOLS_IN_SCOPE.system` → `toolsInScope(McpScope.SYSTEM)`
- [ ] `src/agent/agents/OrchestratorAgent/OrchestratorAgent.test.ts:82` e `prompt.test.ts:87-92` — idem; no `prompt.test.ts` o falseador documentado (`:87`) passa a nomear `toolNameOf(ForkIssueController)` em vez do índice `[0]`
- [ ] `src/agent/services/AgentRunner/ClaudeAgentRunner/buildArgs.test.ts:6` — `import { wireToolName } from '../../../mcp/manifest'` → `from '../../../mcp/wire'` (o manifesto só re-exportava; a fonte sempre foi `wire.ts`)
- [ ] **Deletar `tests/architecture/mcp-manifest.test.ts`** — importa 5 símbolos de `@agent/mcp/manifest` e não compila sem o arquivo. Seu substituto (`mcp-exposure.test.ts`) é o T6 e entra **no mesmo commit** (ver a nota de fusão)

### Step T5.6 — `shared/context-map.ts` — as 6 exceções trocam de arquivo

- [ ] `NOTE_MCP_MANIFEST` (`:6-7`) vira `NOTE_MCP_EXPOSURE`, reescrito:

```typescript
const NOTE_MCP_EXPOSURE =
	"The MCP exposure scan (agent/mcp/exposure.ts) imports each context's `controllers/index.ts` BARREL in order to READ each class's `static mcpScopes` — discovery, not declaration. Nothing is constructed, nothing is invoked, no state crosses; the association scope↔controller lives on the controller itself, which is the founder amendment this replaced the manifest with. The barrel is the whole set because WIRE-03 already requires every Controller subclass to be exported from it. It is confined to ONE file so a prompt builder never has to import another context's barrel to name a tool. The runtime path is the opposite of an import: tool → HTTP → that context's own controller → its own use case."
```

- [ ] O `.map()` de `POLICY_EXCEPTIONS` (`:154-159`): `file: 'agent/mcp/manifest.ts'` → `'agent/mcp/exposure.ts'`, `why: NOTE_MCP_EXPOSURE`
- [ ] `ANNOTATED_CYCLES` `agent ↔ ui` (`:167`): a frase "agent → ui é o MCP manifest NOMEANDO os read controllers de ui como tools de `system`" passa a "a varredura de exposição LENDO o `static mcpScopes` das classes que o barril de ui exporta — uma leitura de metadado estático, que não constrói nem chama nada"
- [ ] `bun test tests/architecture/context-map.test.ts` → verde, incluindo o teste "policy exceptions are ALIVE"

### Step T5.7 — Regen, e o diff ESPERADO

- [ ] `bun emit-openapi && bun sdk`
- [ ] `git diff --stat packages/api/typescript/public/docs/openapi.json packages/client/dist` — o diff **esperado e único** é `RaiseStop` ganhando `orchestration`:
  - `openapi.json`: a operação `RaiseStop` ganha `"orchestration"` em `x-mcp-scope` e a tag `mcp:orchestration`; o `x-mcp-scopes` de raiz ganha `"RaiseStop"` dentro de `orchestration`
  - `packages/client/dist/typescript/src/typescript/mcp/scopes/orchestration/`: nasce `raiseStop.ts` e `server.ts` ganha um `registerTool("RaiseStop", …)`
- [ ] **QUALQUER outra diferença é regressão.** Verificação dura: `git diff packages/api/typescript/public/docs/openapi.json | grep '^[-+]' | grep -v 'RaiseStop\|orchestration\|^[-+][-+][-+]'` → **vazio** (AC-4: as demais operações ficam byte-idênticas)
- [ ] `bun check:generated` → exit 0

### Step T5.8 — Verde e os greps

- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun test` → exit 0 nos dois
- [ ] `grep -rn "mcp/manifest\|McpScopeRegistry\|mcpScopesFor\|registerMcpScopes\|mcpScopeRegistrySnapshot\|MCP_SCOPES\|MCP_SCOPE_NAMES\|SCOPE_CONFINEMENT\|TOOLS_IN_SCOPE\|toolsInScope\b\|ISSUE_HANDLING_OPERATION\|MCP_SCOPE_BY_OPERATION\|scopeOperationIds" packages/api packages/client packages/e2e | grep -v "exposure.ts"` → **vazio** (AC-2). `toolsInScope` sobrevive como função de `exposure.ts`, daí a exclusão
- [ ] `ls packages/api/typescript/src/agent/mcp/` → `E2eMcpDriver.ts`, `exposure.ts`, `generated-server.test.ts`, `identity.ts`, `route.ts`, `router.test.ts`, `router.ts`, `router.write-isolation.test.ts`, `wire.ts` — **sem `manifest.ts`, sem `register.ts`, sem `RunTokenService.ts`**
- [ ] `bun test tests/architecture/` → verde (context-map, wiring-completeness, allowlist-liveness, enum-placement)

### Step T5.9 — Commit (FUNDIDO com o T6 — ver a nota de fusão abaixo)

**Este Step não commita.** `tests/architecture/mcp-manifest.test.ts` deixa de compilar com a morte de `manifest.ts`, e o hook de pre-commit roda `nx run-many -t test --projects=api-typescript` inteiro: um commit intermediário sem o substituto seria vermelho por construção. Execute o T6 e commite os dois juntos no Step T6.5.

---

## Task T6: O snapshot dourado `mcp-exposure.test.ts` — e a morte de `mcp-manifest.test.ts`

**Files to write:**
- Create: `packages/api/typescript/tests/architecture/mcp-exposure.test.ts`
- Create: `packages/api/typescript/tests/architecture/__snapshots__/mcp-exposure.test.ts.snap` — **o snapshot COMMITADO**
- (a deleção de `tests/architecture/mcp-manifest.test.ts` foi executada no Step T5.5; este commit a carrega)

**Files to read:**
- `packages/api/typescript/tests/architecture/mcp-manifest.test.ts` — as 6 asserções que este arquivo herda (set-equality manifesto↔`x-mcp-scopes`, `x-mcp-scope`↔manifesto, tag↔extensão, "o default não é exposto", e a derivação de operationId), e o docstring que explica por que o gerador sozinho não fecha o buraco
- `packages/api/typescript/tests/architecture/README.md` — a convenção das rails deste diretório
- `packages/client/dist/typescript/src/typescript/mcp/context/index.ts` — o `MCP_RUN_TOKEN_HEADER` que a asserção anti-drift da D-E compara

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** opus
**Skills:** /test
**Depends on:** T5
**Consumes (frozen):** de T5, verbatim — `mcpExposure()`, `operationIdsInScope(scope)`, `toolsInScope(scope)` e `toolNameOf(C)` de `@agent/mcp/exposure`; o `openapi.json` reemitido com `RaiseStop` em `orchestration`. De T2, verbatim — `AGENT_RUN_TOKEN_HEADER` de `@codedm/core-typescript`.
**Scope fence:** DONE: o snapshot dourado scope→tools, as asserções bidirecionais herdadas do `mcp-manifest.test.ts`, e a rail anti-drift do header (D-E). OUT: mudar a exposição de qualquer controller (o snapshot REGISTRA o que o T5 declarou; se ele não bater, o defeito é do T5, não do snapshot); tocar o middleware (T7) ou o adaptador (T8).
**Gate:** `cd packages/api/typescript && bun test tests/architecture/mcp-exposure.test.ts` — exit 0, e `git status --porcelain tests/architecture/__snapshots__` limpo depois de uma segunda rodada (um snapshot que se reescreve a cada run não é dourado)

### Step T6.1 — Proposed file: Create `tests/architecture/mcp-exposure.test.ts`

COMPLETE file:

```typescript
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AGENT_RUN_TOKEN_HEADER } from '@codedm/core-typescript'
import { MCP_RUN_TOKEN_HEADER } from '@codedm/client-typescript/typescript/mcp/context'
import { McpScope } from '@codedm/contracts-typescript/wire/enums'
import { mcpExposure, operationIdsInScope, toolsInScope } from '@agent/mcp/exposure'

/**
 * THE GOLDEN SNAPSHOT OF WHAT A MODEL CAN CALL (B2, spec decision 7 / AC-16).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT IT REPLACES AND WHY THE REPLACEMENT IS NOT A DOWNGRADE
 * `mcp-manifest.test.ts` compared a TYPED MANIFEST (a hand-written `Record<McpScope,
 * ControllerClass[]>`) against the emitted spec. With the manifest gone there is no such object to
 * compare — but the two sides did not disappear, they moved: the DECLARATION is now the
 * `static mcpScopes` on each controller class (read here through the runtime scan), and the ARTIFACT
 * is still the committed `openapi.json` everything downstream is generated from. The set-equality is
 * the same in both directions, over the same two things, minus the intermediate list.
 *
 * IT IS NOT SELF-REFERENTIAL, AND THE TWO SIDES REALLY ARE TWO
 * The left side walks CLASSES through `agent/mcp/exposure.ts` (barrels → `static mcpScopes`); the
 * right side reads a JSON file emitted from INSTANCES the DI resolved, through a completely separate
 * path (`OpenAPI.generateSpecification` → `McpExposure.fromRouters`). A drift between them — a stale
 * spec, an operation renamed on one side, a controller whose class-side operationId cannot reproduce
 * the emitter's multi-method suffix — is a red test rather than a silently empty tool surface.
 *
 * MEASURED FAILURE MODE THE PREDECESSOR CLOSED, AND THIS ONE STILL CLOSES: from inside a spec, "this
 * service declares no MCP surface" and "this service's declaration never made it" are THE SAME BYTES,
 * and the SDK generator's discovery is generic — it cannot special-case one service into "must be
 * non-empty" without inventing a second source of truth. So the first test below asserts the surface
 * is non-empty at all.
 *
 * AND THE SNAPSHOT IS THE POINT, not the equalities: a controller GAINING or LOSING an
 * `static mcpScopes` is exactly the change that used to be reviewable only by reading a diff of a
 * list nobody was required to read. Now it names the tool in a failing assertion.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */

const SPEC_PATH = join(import.meta.dir, '..', '..', 'public', 'docs', 'openapi.json')

interface EmittedOperation {
	operationId: string
	tags?: string[]
	'x-mcp-scope'?: string[]
}

function readSpec(): { operations: EmittedOperation[]; manifest: Record<string, string[]> } {
	const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8')) as {
		paths: Record<string, Record<string, EmittedOperation>>
		'x-mcp-scopes'?: Record<string, string[]>
	}
	const operations: EmittedOperation[] = []
	for (const methods of Object.values(spec.paths)) {
		for (const operation of Object.values(methods)) {
			if (operation && typeof operation === 'object' && operation.operationId) operations.push(operation)
		}
	}
	return { operations, manifest: spec['x-mcp-scopes'] ?? {} }
}

const sorted = (values: readonly string[]): string[] => [...values].sort()
const SCOPES = Object.values(McpScope)

describe('AC-16 — the golden snapshot: scope → the tools a model can call', () => {
	/**
	 * THE ARTIFACT UNDER REVIEW. Adding `static mcpScopes` to a controller, or removing it, changes
	 * these bytes — and a reviewer reads the change as a list of TOOL NAMES rather than as a diff of a
	 * declaration buried in a class. Wire names (not operationIds) on purpose: this is the vocabulary
	 * a model is handed in `--allowedTools`, which is the surface the review is actually about.
	 */
	test('the declared tool surface, by scope', () => {
		expect(Object.fromEntries(SCOPES.map(scope => [scope, [...toolsInScope(scope)]]))).toMatchSnapshot()
	})
})

describe('the scan and the emitted spec describe the same surface, in both directions', () => {
	const { operations, manifest } = readSpec()

	test('the spec publishes a manifest at all — an undeclared surface is not "no surface"', () => {
		// THE FALSIFIER'S TARGET. Without this, a spec that published `{}` would leave every assertion
		// below comparing empty to empty and passing — the exact shape of the failure the predecessor
		// measured when one side-effect import was commented out.
		expect(Object.keys(manifest).sort()).toEqual(sorted(SCOPES))
		for (const scope of SCOPES) expect(manifest[scope]?.length ?? 0).toBeGreaterThan(0)
	})

	for (const scope of SCOPES) {
		test(`'${scope}': the CLASS-side scan and the published root extension agree`, () => {
			expect(sorted(manifest[scope] ?? [])).toEqual(sorted(operationIdsInScope(scope)))
		})

		test(`'${scope}': the operations STAMPED with x-mcp-scope are exactly the scan's`, () => {
			const stamped = operations.filter(o => (o['x-mcp-scope'] ?? []).includes(scope)).map(o => o.operationId)
			expect(sorted(stamped)).toEqual(sorted(operationIdsInScope(scope)))
		})

		test(`'${scope}': the synthetic tag describes the same set as the extension`, () => {
			// If these diverge, the DECLARATION OF RECORD and the TRANSPORT have come apart: the spec
			// would say an operation is in the scope while Kubb's tag filter, which reads ONLY tags,
			// would not emit it — a shorter tool surface than the one under review.
			const tagged = operations.filter(o => (o.tags ?? []).includes(`mcp:${scope}`)).map(o => o.operationId)
			const stamped = operations.filter(o => (o['x-mcp-scope'] ?? []).includes(scope)).map(o => o.operationId)
			expect(sorted(tagged)).toEqual(sorted(stamped))
		})
	}

	test('THE DEFAULT IS NOT EXPOSED — an unscoped operation carries no mcp: tag either', () => {
		const leaked = operations
			.filter(o => (o['x-mcp-scope'] ?? []).length === 0)
			.filter(o => (o.tags ?? []).some(tag => tag.startsWith('mcp:')))
			.map(o => o.operationId)
		expect(leaked).toEqual([])
	})

	test('every operationId the scan derives really exists in the spec', () => {
		// The class-side derivation cannot reproduce the emitter's multi-method suffix (a class does not
		// expose `method`). This is where that limitation becomes a RED TEST instead of a tool nobody
		// can call: a scoped controller that grows a second HTTP method fails here, by name.
		const emitted = new Set(operations.map(o => o.operationId))
		for (const scope of SCOPES) {
			for (const operationId of operationIdsInScope(scope)) expect(emitted.has(operationId)).toBe(true)
		}
	})

	test('AC-3 — RaiseStop is in BOTH surfaces, which is the one exposure change of this frente', () => {
		expect(sorted(mcpExposure().scopesFor('RaiseStop'))).toEqual([McpScope.ISSUE_HANDLING, McpScope.ORCHESTRATION].sort())
	})
})

describe('D-E — the run-token header has one spelling on both sides of the wire', () => {
	test('core (server side) and the SDK (shim side) agree byte for byte', () => {
		// `core` cannot import `@codedm/client-typescript` (the api depends on the SDK, so the edge would
		// be a cycle), and the generated `_http.ts` shims send THIS header and no `authorization`
		// fallback. This file is the one place allowed to import both, which makes it the one place the
		// pair can be pinned.
		expect(AGENT_RUN_TOKEN_HEADER).toBe(MCP_RUN_TOKEN_HEADER)
	})
})
```

### Step T6.2 — Gerar e INSPECIONAR o snapshot

- [ ] `cd packages/api/typescript && bun test tests/architecture/mcp-exposure.test.ts --update-snapshots`
- [ ] **Ler o `.snap` gerado linha a linha** antes de commitar. Ele deve conter exatamente 3 chaves (`issue-handling`, `orchestration`, `system`) com, respectivamente, **6, 5 e 23** entradas — `orchestration` com 5 porque ganhou `mcp__codedm__RaiseStop`
- [ ] Conferir que TODA entrada tem o prefixo `mcp__codedm__` (é `wireToolName`, não operationId)
- [ ] Conferir que nenhuma entrada é `mcp__codedm__ListenEvents` ou `mcp__codedm__StreamTerminalSession` — são SSE e, chamados como tool, travariam o agente até o watchdog. A ausência é deliberada e vem de HEAD
- [ ] Rodar `bun test tests/architecture/mcp-exposure.test.ts` (SEM `--update-snapshots`) → verde, e `git status --porcelain tests/architecture/__snapshots__` limpo

### Step T6.3 — O FALSEADOR do snapshot (US-5 / AC-16)

- [ ] Apagar a linha `static override readonly mcpScopes = [McpScope.ISSUE_HANDLING]` de `src/agent/controllers/TransitionIssueStatus.ts` e rodar `bun test tests/architecture/mcp-exposure.test.ts` → **o snapshot reprova NOMEANDO `mcp__codedm__TransitionIssueStatus`**, e reprovam junto `'issue-handling': the CLASS-side scan and the published root extension agree` e `…the operations STAMPED with x-mcp-scope are exactly the scan's`. Registrar a saída no artefato do T10. **Restaurar**
- [ ] Acrescentar `static override readonly mcpScopes = [McpScope.SYSTEM]` em `src/issue/controllers/ArchiveIssue.ts` (um controller deliberadamente fora de todo scope) e rodar → o snapshot reprova ganhando `mcp__codedm__ArchiveIssue`. **Restaurar**
- [ ] Confirmar que os dois falseadores **não** exigiram reemitir o spec para falhar — é a varredura de classes que muda primeiro, e é exatamente essa assimetria que a set-equality mede

### Step T6.4 — Gates completos antes do commit fundido

- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun test` → exit 0 nos dois
- [ ] `cd ../../.. && bun run tsc && bun lint && bun run test` → exit 0
- [ ] `bun check:generated` → exit 0
- [ ] `bun test:tooling` → exit 0

### Step T6.5 — Commit ÚNICO, T5 + T6

**Regra de fusão (precedente T5+T6 / T7+T8 do B4):** o hook de pre-commit roda `nx run-many -t test --projects=api-typescript` + `test:tooling` + `tsc` + `build`, então **todo commit tem de estar 100% verde**. `tests/architecture/mcp-manifest.test.ts` importa 5 símbolos de `@agent/mcp/manifest` e não compila sem ele; AC-16 e AC-17 são um par pela mesma razão (a rail não pode ter uma janela sem cobertura). Logo os dois Tasks são UM commit.

```bash
git add packages/api/typescript/core/src/utils/OpenAPI.ts \
        packages/api/typescript/core/src/utils/McpScopeRegistry.ts \
        packages/api/typescript/core/src/index.ts \
        packages/api/typescript/src/agent/mcp \
        packages/api/typescript/src/agent/registry.ts \
        packages/api/typescript/src/agent/agents \
        packages/api/typescript/src/agent/controllers \
        packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/buildArgs.test.ts \
        packages/api/typescript/src/artifact/controllers \
        packages/api/typescript/src/issue/controllers \
        packages/api/typescript/src/thread/controllers \
        packages/api/typescript/src/ui/controllers \
        packages/api/typescript/src/workspace/controllers \
        packages/api/typescript/src/owner/controllers \
        packages/api/typescript/src/shared/context-map.ts \
        packages/api/typescript/tests/architecture/mcp-manifest.test.ts \
        packages/api/typescript/tests/architecture/mcp-exposure.test.ts \
        packages/api/typescript/tests/architecture/__snapshots__ \
        packages/api/typescript/public/docs/openapi.json \
        packages/client/dist
git status --porcelain   # conferir que NADA fora dessa lista está staged
git commit -m "refactor(agent,core): B2 T5+T6 — o controller declara a propria exposicao; o manifesto e o Map global morrem

Sete estruturas paralelas viravam UMA pergunta: o que exatamente um modelo pode
chamar. MCP_SCOPES, MCP_SCOPE_NAMES, TOOLS_IN_SCOPE, MCP_SCOPE_BY_OPERATION,
ISSUE_HANDLING_OPERATION, a copia a mao de operationIdOf e o register.ts de
side-effect — todas sincronizadas a mao, todas longe do controller. Agora cada
controller diz \`static mcpScopes\`, no idioma que middlewares ja usa.

O emitter le o static na propria varredura que ja fazia, nos DOIS pontos: o
x-mcp-scope por operacao E o x-mcp-scopes de RAIZ, que e contrato com o gerador
da SDK (ele lanca quando a contagem emitida diverge do manifesto publicado). O
Map de modulo do core sai junto: a declaracao agora CHEGA com o controller, nao
precisa atravessar a fronteira de pacote por side-effect.

RaiseStop ganha orchestration (decisao 8) — a unica mudanca de superficie desta
frente, e a unica diferenca no diff do openapi.json e da SDK.

mcp-manifest.test.ts morre e mcp-exposure.test.ts nasce no MESMO commit: o
primeiro nao compila sem o manifesto, e AC-16/AC-17 sao um par. O snapshot
dourado lista os tools por scope em nome de wire — tirar um static agora reprova
NOMEANDO a tool que sumiu.

Fusao de commit pelo precedente T5+T6 do B4 (o hook exige a suite 100% verde)."
```

---

## Task T7: `AgentIdentityMiddleware` plugado — `identity.ts` e `RunTokenMiddleware` morrem, `ForkIssue` lê `ctx.agentIdentity`

**Files to write:**
- Modify: `packages/api/typescript/core/src/types/Controller.ts` — a auto-aplicação em `executeMiddlewares` (D-G)
- Create: `packages/api/typescript/core/src/middlewares/AgentIdentityMiddleware.test.ts`
- Modify: `packages/api/typescript/src/agent/types/AgentRunIdentity.ts` — `AgentRunIdentityCtxSchema`, declarado UMA vez
- Modify: `packages/api/typescript/src/agent/controllers/ForkIssue.ts` — `RunClaimsCtxSchema` local morre; lê `ctx.agentIdentity`
- Modify: `packages/api/typescript/src/agent/controllers/SteerIssueTurn.ts` — idem
- Modify: `packages/api/typescript/src/agent/mcp/router.ts` — o walk sai (AC-14)
- Modify: `packages/api/typescript/src/agent/mcp/router.test.ts` — as asserções de identidade migram para o teste do middleware; ficam as de token/scope
- Delete: `packages/api/typescript/src/agent/mcp/identity.ts`, `packages/api/typescript/src/agent/middlewares/RunTokenMiddleware.ts`, `packages/api/typescript/src/agent/middlewares/index.ts` (a pasta fica vazia e some)

**Files to read:**
- `packages/api/typescript/core/src/types/Controller.ts:96-104` (`execute`, e por que `validated` sobrescreve o `ctx` cru) e `:149-175` (`executeMiddlewares`, o dedup por `constructor.name` e o `skipMiddlewares`)
- `packages/api/typescript/src/agent/controllers/ForkIssue.ts:17-29` — o docstring que explica POR QUE o schema local existia (Zod descarta chave não declarada), e que é a razão de o substituto ser um schema COMPARTILHADO e não nenhum schema
- `packages/api/typescript/src/agent/middlewares/RunTokenMiddleware.ts:36-45` — o bloco FAIL CLOSED que muda de postura, e a razão original
- `packages/api/typescript/src/agent/mcp/router.ts:110-200` — `rejectMismatchedIdentity` + `toolCallsIn`, os dois métodos que somem

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** opus
**Skills:** /middleware, /controller, /test
**Depends on:** T2, T4, T5
**Consumes (frozen):** de T2, verbatim — `AgentIdentityMiddleware` (`@singleton()`, `implements Middleware`, injeta `AgentIdentityService`), `compareIdentity`, `readAgentRunToken`, `AGENT_RUN_TOKEN_HEADER`. De T4, verbatim — `AgentRunIdentity`, e o binding de `AgentIdentityService` em `shared/registry.ts`. De T5, verbatim — `static mcpScopes` presente em 32 controllers, que é o predicado da auto-aplicação.
**Scope fence:** DONE: a auto-aplicação, a morte do walk genérico e do middleware app-side, e os dois controllers lendo `ctx.agentIdentity`. **MUDANÇA DE POSTURA NOMEADA:** `RunTokenMiddleware` era FAIL-CLOSED (token ausente ⇒ 401); `AgentIdentityMiddleware` não é (AC-11), porque agora ele roda em 32 controllers e 23 deles são leituras do console servidas a um humano sem run nenhum. A propriedade que o fail-closed protegia — `ForkIssue` nunca criar issue sem proveniência — **migra para o `handle()` do próprio `ForkIssue`**, que já rejeita `!entryId` hoje (`:100-106`) e passa a rejeitar também `!ctx.agentIdentity`. OUT: o adaptador (T8) — `McpRouterController` continua existindo e continua fazendo verify+scope match; só perde o walk.
**Gate:** `cd packages/api/typescript && bun test && bun x tsc -p tsconfig.build.json --noEmit` — exit 0 nos dois, e `grep -rn "IDENTITY_KEYS\|findIdentityMismatches\|assertIdentityMatches\|RunTokenMiddleware\|runClaims\|RunClaimsCtxSchema" packages/api/typescript` retorna **vazio** (AC-8, AC-10)

### Step T7.1 — Proposed file: Modify `core/src/types/Controller.ts` — a auto-aplicação

Substituir o início de `executeMiddlewares` (`:149-157`):

```typescript
	/**
	 * The middlewares that ACTUALLY run — the declared list, plus the ones a static on the class
	 * makes mandatory.
	 *
	 * `AgentIdentityMiddleware` is appended for any controller with a non-empty `static mcpScopes`,
	 * WITHOUT an entry in `middlewares`, and the asymmetry with `OperatorMiddleware` is the point:
	 * opting into "who is this daemon" is a routing choice, while a controller that declared itself
	 * model-callable has already said the dangerous thing, and a protection that must be remembered
	 * separately is one that can be forgotten exactly where it matters.
	 *
	 * It is appended HERE rather than in `MainRouter.configureRouterControllers` (which also merges
	 * middleware lists) because MainRouter is SKIPPABLE: spec emission never constructs it, and a test
	 * that calls `executeController` directly bypasses it entirely — `DetectProviders.test.ts` already
	 * does. A security boundary with a bypass is not one. This method is the only door `handle()` can
	 * be reached through.
	 *
	 * Appended LAST so `OperatorMiddleware` has already stamped `ctx.ownerId`, and skipped when the
	 * controller listed it explicitly, so the dedup rule is the same one the router applies.
	 */
	private get effectiveMiddlewares(): (Middleware | MiddlewareClass)[] {
		const scopes = (this.constructor as typeof Controller).mcpScopes
		if (!scopes || scopes.length === 0) return this.middlewares
		const declared = new Set(this.middlewares.map(m => (typeof m === 'function' ? m.name : m.constructor.name)))
		return declared.has(AgentIdentityMiddleware.name) ? this.middlewares : [...this.middlewares, AgentIdentityMiddleware]
	}

	private async executeMiddlewares(request: HttpControllerRequest<unknown>): Promise<Response | undefined> {
		const blacklist = new Set(
			this.skipMiddlewares.map(skip => {
				if (typeof skip === 'function') return skip.name
				return skip.constructor.name
			}),
		)

		for (const middlewareOrClass of this.effectiveMiddlewares) {
```

e o import no topo:

```typescript
import { AgentIdentityMiddleware } from '../middlewares/AgentIdentityMiddleware'
```

- [ ] **Conferir que não há ciclo de módulo:** `AgentIdentityMiddleware` importa `../types/{BaseError,Http,Middleware}`, `../errors/codes`, `../services/AgentIdentityService` e `../types/AgentIdentity` — **nenhum deles importa `Controller.ts`**. Verificar com `grep -rn "types/Controller" core/src/middlewares core/src/services/AgentIdentityService core/src/types/AgentIdentity.ts` → vazio
- [ ] `skipMiddlewares` continua funcionando: um controller que quisesse pular teria de listar `AgentIdentityMiddleware` em `skipMiddlewares` — possível, e visível no diff, que é a postura certa para um escape hatch

### Step T7.2 — Proposed file: Modify `src/agent/types/AgentRunIdentity.ts` — o schema de `ctx`, UMA vez

Acrescentar ao fim do arquivo:

```typescript
/**
 * WHAT `AgentIdentityMiddleware` STAMPS ON `ctx` — declared ONCE, composed by every controller that
 * reads it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * IT MUST BE DECLARED SOMEWHERE, AND THAT IS NOT A DESIGN CHOICE. `Controller.execute` validates the
 * whole request against `inputSchema` and merges the VALIDATED envelope over the raw one, and Zod
 * objects STRIP unknown keys — so a value a middleware injected but no schema named is silently
 * removed before `handle` ever sees it. That is not hypothetical: it cost a 500 on every fork, with
 * the middleware provably correct and the key simply gone.
 *
 * WHAT CHANGED IS THE COUNT. `ForkIssue` and `SteerIssueTurn` each carried their own verbatim copy
 * (`RunClaimsCtxSchema`), because there was nowhere shared to put it. There is now, and the third
 * controller that needs it composes instead of copying.
 *
 * OPTIONAL, because the middleware is NOT fail-closed: a `system` operation served to a human
 * operator carries no agent identity, and that is the normal case for 23 of the 32 exposed
 * controllers. A controller for which absence is a broken invariant says so in its own `handle()` —
 * which is where `ForkIssue` already rejects a run with no originating entry.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
export const AgentRunIdentityCtxSchema = z.object({
	agentIdentity: z
		.object({
			ownerId: z.uuid(),
			issueId: z.uuid().optional(),
			threadId: z.uuid(),
			entryId: z.uuid().optional(),
			scope: z.enum(McpScope),
		})
		.optional(),
})
```

- [ ] `ctx` nunca chega ao spec (`buildRequestParams` lê só `query`/`params`/`headers`; `grep -c "runClaims" public/docs/openapi.json` → 0 em HEAD), então esta forma não custa um byte de OpenAPI nem de SDK. Confirmar de novo após o regen do T8

### Step T7.3 — Proposed file: Modify `src/agent/controllers/ForkIssue.ts`

Três edições. **(a)** o `RunClaimsCtxSchema` local (`:17-29`, docstring incluído) é APAGADO e o `ctx` do input passa a compor o compartilhado:

```typescript
export const ForkIssueControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }).extend(AgentRunIdentityCtxSchema.shape),
		params: z.object({ threadId: z.uuid() }),
		body: z.object({
			/** What the operator asked for, in their words. Becomes the subagent's prompt and the issue title. */
			goal: z.string().trim().min(1).max(2000),
		}),
	})
	.example([
		{
			ctx: {
				ownerId: '00000000-0000-4000-8000-000000000001',
				agentIdentity: {
					ownerId: '00000000-0000-4000-8000-000000000001',
					threadId: '019e4d24-6524-7041-9e1c-8108180cddae',
					entryId: '019e4d24-6524-7041-9e1c-8108180cddb0',
					scope: McpScope.ORCHESTRATION,
				},
			},
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' },
			body: { goal: 'põe um toggle de dark mode nas configurações' },
		},
	])
```

**(b)** `middlewares` perde `RunTokenMiddleware`:

```typescript
	// `OperatorMiddleware` answers "who is this daemon" (`ctx.ownerId`). "Which run is speaking" is no
	// longer listed: `static mcpScopes` below makes `AgentIdentityMiddleware` mandatory, appended by
	// `Controller.executeMiddlewares`. A tool-callable door cannot be built without it.
	override middlewares = [OperatorMiddleware]
	static override readonly mcpScopes = [McpScope.ORCHESTRATION]
```

**(c)** o `handle()` (`:85-107`) — a leitura e o guard novo:

```typescript
	async handle(request: this['input']): Promise<this['output']> {
		const identity = request.ctx.agentIdentity
		const threadId = request.params.threadId

		// FAIL-CLOSED HERE, not in the middleware. `AgentIdentityMiddleware` serves 32 controllers and 23
		// of them are console reads a human operator makes with no run anywhere — refusing an absent
		// token there would take the console down to protect a surface no agent is calling. For THIS
		// door the absence is a broken invariant: it is reachable only from inside an orchestrator run,
		// and an issue forked with no run behind it has no provenance for its eventual answer to quote.
		if (!identity) {
			throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_TOKEN_INVALID', 'this operation is only reachable from inside an agent run')
		}

		// THREAD OWNERSHIP, asserted HERE because the generic comparison structurally cannot cover the
		// axis this scope does not carry. `compareIdentity` reads the keys the IDENTITY has, and an
		// `orchestration` identity deliberately has no `issueId`. `threadId` IS carried, so the generic
		// check already agrees with this line — it is kept because the rule of spec decision 4 is that a
		// controller confines what its identity does not, and a future scope may drop this axis too.
		if (identity.threadId !== threadId) {
			throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_SCOPE_MISMATCH', 'this run is not attached to that thread')
		}

		// The entry the operator's request arrived on. Its absence is a BROKEN INVARIANT, not a missing
		// optional: an orchestrator turn is scheduled by a mailbox item that always carries one, so an
		// identity without it was issued outside that path. Failing loudly beats forking an issue whose
		// finished answer would have nothing to quote.
		if (!identity.entryId) {
			throw new BaseError<AgentApplicationErrors>(
				'AGENT_TOOLS_UNSUPPORTED',
				'this run carries no originating message to attribute the issue to',
			)
		}

		// … o resto (`threads.findById`, o provider, o `useCase.execute`) fica IDÊNTICO, com
		// `originEntryId: identity.entryId` no lugar de `claims.entryId`.
```

- [ ] O docstring do topo do arquivo (`:10-16` e `:62-68`) é atualizado: some a frase "`RunTokenMiddleware` injeta das claims" e entra "`AgentIdentityMiddleware`, auto-aplicado pelo `static mcpScopes` abaixo, resolve a identidade e a estampa em `ctx`"

### Step T7.4 — Proposed file: Modify `src/agent/controllers/SteerIssueTurn.ts`

Mesmas três edições, com uma diferença que é o ponto da decisão 4:

- [ ] `RunClaimsCtxSchema` local (`:12-17`) apagado; `ctx` compõe `AgentRunIdentityCtxSchema.shape`
- [ ] `middlewares = [OperatorMiddleware]` + `static override readonly mcpScopes = [McpScope.ORCHESTRATION]`
- [ ] `handle()`: `const identity = request.ctx.agentIdentity`, o guard `if (!identity) throw AGENT_RUN_TOKEN_INVALID`, `identity.threadId !== threadId`, e **o check de ownership do `issueId` FICA EXATAMENTE COMO ESTÁ** (`openIssues.openIssues(threadId).some(...)`, `:88-92`). É o exemplar canônico da regra da decisão 4 — a identidade `orchestration` não carrega `issueId`, então quem confina é o `handle()` — e o docstring que explica isso é atualizado para citar `compareIdentity` no lugar de `assertIdentityMatchesClaims`
- [ ] `dedupKey: \`steer:${identity.entryId ?? issueId}:${issueId}\`` (`:107`)

### Step T7.5 — Proposed file: Modify `src/agent/mcp/router.ts` — o walk sai (AC-14)

- [ ] Apagar `rejectMismatchedIdentity` (`:145-185`) e `toolCallsIn` (`:188-200`) inteiros
- [ ] Apagar `JSONRPC_INVALID_PARAMS` (`:20`) e o import de `./identity` (`:9`) e de `HttpStatusCode` se ficar órfão
- [ ] O `handle()` perde 3 linhas — a leitura do corpo para inspeção some junto:

```typescript
		// The body is no longer consumed here. It used to be, so the identity walk could inspect it
		// BEFORE dispatching; that responsibility moved to `AgentIdentityMiddleware`, which runs at the
		// destination controller with `params` and `body` already separated by the HTTP layer. Reading a
		// Request body is one-shot, so not reading it means not having to rebuild the Request either.
		const transport = await this.buildTransport(scope)
		const baseUrl = `http://127.0.0.1:${Config.env.API_PORT}`
		return this.rawResponse(await withMcpRunContext({ token, baseUrl }, () => transport.handleRequest(raw)))
```

- [ ] **Atualizar o docstring do arquivo** — o bloco "IDENTITY IS CHECKED BEFORE THE TRANSPORT DISPATCHES" (`:44-51`) é substituído por uma nota que diz onde a checagem foi parar E por que o SCOPE MATCH ficou:

```
 * WHAT STAYED HERE AND WHY IT COULD NOT MOVE
 * The SCOPE MATCH. `tools/list` is answered by the MCP SDK itself, with no round trip back to any
 * HTTP controller — so a per-controller middleware structurally cannot see it, and this is the only
 * point where "was this credential issued for THIS surface" can be asked of EVERY JSON-RPC message
 * rather than only of `tools/call`. Without it an `issue-handling` token enumerates and calls the
 * twenty-three `system` operations.
 *
 * WHAT LEFT, AND WHERE IT WENT
 * The per-argument identity walk. It lived here because arguments had to be rejected BEFORE the
 * transport dispatched — the MCP SDK validates a tool's `outputSchema` AFTER the handler returns, so a
 * rejection inside a tool wrapper would arrive with the HTTP write already issued. That constraint is
 * satisfied a different way now: `AgentIdentityMiddleware` runs at the destination controller, BEFORE
 * its `handle()`, so the write is still never built. And it compares the keys the identity actually
 * carries against `params`/`body` already parsed, instead of walking a JSON-RPC body against a
 * hardcoded list of three names.
```

### Step T7.6 — Proposed file: Create `core/src/middlewares/AgentIdentityMiddleware.test.ts`

As asserções de identidade que estavam em `router.test.ts` migram para cá — mesma propriedade, camada nova. COMPLETE file:

```typescript
import { describe, expect, it } from 'bun:test'
import { BaseError } from '../types/BaseError'
import { AGENT_RUN_TOKEN_HEADER, type AgentIdentity } from '../types/AgentIdentity'
import { InMemoryAgentIdentityService } from '../services/AgentIdentityService'
import { AgentIdentityMiddleware } from './AgentIdentityMiddleware'
import type { HttpControllerRequest } from '../types/Http'

const ISSUE_A = '00000000-0000-4000-8000-0000000000a2'
const ISSUE_B = '00000000-0000-4000-8000-0000000000b2'
const THREAD_A = '00000000-0000-4000-8000-0000000000a3'
const THREAD_B = '00000000-0000-4000-8000-0000000000b3'

const identityForA = (): AgentIdentity => ({
	scope: 'issue-handling',
	ownerId: '00000000-0000-4000-8000-0000000000a1',
	issueId: ISSUE_A,
	threadId: THREAD_A,
	expiresAt: new Date(Date.now() + 60_000),
})

const requestWith = (token: string | undefined, params: Record<string, unknown>, body: Record<string, unknown> = {}) =>
	({
		...(token !== undefined && { headers: { [AGENT_RUN_TOKEN_HEADER]: token } }),
		params,
		body,
		ctx: {},
	}) as unknown as HttpControllerRequest<unknown>

/**
 * THE MANDATORY MITIGATION, AT ITS NEW LAYER (B2 — the property `agent/mcp/identity.ts` used to hold).
 *
 * The attack modelled is not hypothetical: an inbound WhatsApp message is attacker-authored text that
 * reaches a model holding six write tools, and "act on a different issue" is the first thing an
 * injected instruction would try. Three vectors, because a generated tool inherits its controller's
 * parameters AND its body — `RecordArtifact` takes `threadId` as a path parameter and carries an
 * `issueId` inside the payload, so a check that only compared the path would pass a cross-issue test
 * while the body still targeted issue B.
 */
describe('AgentIdentityMiddleware', () => {
	const build = () => {
		const identities = new InMemoryAgentIdentityService()
		const middleware = new AgentIdentityMiddleware(identities)
		return { identities, middleware }
	}

	it('AC-11 — NO token: the request passes untouched, and nothing is stamped', async () => {
		// The console's own reads. 23 of the 32 exposed controllers are served to a human operator with
		// no run anywhere; fail-closed here would take them all down to protect a surface no agent calls.
		const { middleware } = build()
		const request = requestWith(undefined, { threadId: THREAD_B })
		await expect(middleware.execute(request)).resolves.toEqual({})
		expect(request.ctx.agentIdentity).toBeUndefined()
	})

	it('a token that is PRESENT and dead is 401 — a late call from a run that already ended', async () => {
		const { identities, middleware } = build()
		const token = identities.issue(identityForA())
		identities.revoke(token)
		await expect(middleware.execute(requestWith(token, { threadId: THREAD_A }))).rejects.toThrow(
			expect.objectContaining({ name: 'UNAUTHORIZED' }) as BaseError,
		)
	})

	it('FALSEADOR — a PATH PARAM naming another thread is 403 and nothing is stamped', async () => {
		const { identities, middleware } = build()
		const request = requestWith(identities.issue(identityForA()), { threadId: THREAD_B })
		await expect(middleware.execute(request)).rejects.toThrow(expect.objectContaining({ name: 'FORBIDDEN' }) as BaseError)
		expect(request.ctx.agentIdentity).toBeUndefined()
	})

	it('FALSEADOR — a BODY field naming another issue is 403, on the same footing as a param', async () => {
		const { identities, middleware } = build()
		const request = requestWith(identities.issue(identityForA()), { threadId: THREAD_A }, { issueId: ISSUE_B })
		await expect(middleware.execute(request)).rejects.toThrow(expect.objectContaining({ name: 'FORBIDDEN' }) as BaseError)
	})

	it('a concordant call is stamped with the identity the controller then reads', async () => {
		const { identities, middleware } = build()
		const request = requestWith(identities.issue(identityForA()), { threadId: THREAD_A }, { issueId: ISSUE_A })
		await expect(middleware.execute(request)).resolves.toEqual({})
		expect(request.ctx.agentIdentity).toMatchObject({ threadId: THREAD_A, issueId: ISSUE_A })
	})

	it('an identity WITHOUT an axis does not gate that axis — and the controller is told to', async () => {
		// The orchestrator shape. This is the documented gap of spec decision 4, asserted so that a
		// future change which silently started rejecting here would be visible.
		const { identities, middleware } = build()
		const token = identities.issue({ scope: 'orchestration', threadId: THREAD_A, expiresAt: new Date(Date.now() + 60_000) })
		await expect(middleware.execute(requestWith(token, { threadId: THREAD_A, issueId: ISSUE_B }))).resolves.toEqual({})
	})

	it('`Authorization: Bearer` works too — an external MCP client may only be able to set that', async () => {
		const { identities, middleware } = build()
		const token = identities.issue(identityForA())
		const request = { headers: { authorization: `Bearer ${token}` }, params: { threadId: THREAD_A }, body: {}, ctx: {} } as unknown as HttpControllerRequest<unknown>
		await expect(middleware.execute(request)).resolves.toEqual({})
	})
})
```

### Step T7.7 — `router.test.ts` — o que fica e o que sai

- [ ] **SAI:** todo `it` que exercitava `findIdentityMismatches` / `assertIdentityMatches` e os `tools/call` com argumento divergente (a propriedade migrou para o Step T7.6 e é medida lá, na camada onde agora acontece)
- [ ] **FICA:** token ausente/desconhecido/expirado → 401; scope divergente → 403; e o `ObservableRouter` que conta dispatches. Estes são do adaptador e sobrevivem ao T8
- [ ] `router.write-isolation.test.ts` — o "nada foi escrito, contado" media a rejeição por identidade DENTRO do walk. Com o walk fora, o caso de rejeição que ele conta passa a ser o **SCOPE MISMATCH** (que continua no adaptador): o controle escreve, a chamada com scope errado não escreve, e a assimetria continua sendo a medida. Os 3 contadores (`artifacts`, `events`, `outbox`) e o `WritingRouter` ficam
- [ ] Rodar os dois e conferir que **nenhum** `it` foi só deletado sem contraparte: cada asserção removida tem um `it` correspondente no Step T7.6. Listar o mapeamento no artefato do T10

### Step T7.8 — Deleções, verde e greps

- [ ] `git rm packages/api/typescript/src/agent/mcp/identity.ts packages/api/typescript/src/agent/middlewares/RunTokenMiddleware.ts packages/api/typescript/src/agent/middlewares/index.ts`
- [ ] `bun test && bun x tsc -p tsconfig.build.json --noEmit` → exit 0
- [ ] `grep -rn "IDENTITY_KEYS\|findIdentityMismatches\|assertIdentityMatches\|RunTokenMiddleware\|runClaims\|RunClaimsCtxSchema" packages/api/typescript` → **vazio** (AC-8, AC-10)
- [ ] **AC-11 medido de ponta a ponta, não só no unit:** `bun test src/ui` → verde; e um caso explícito em `src/ui/usecases/GetHomeDashboard.test.ts` **não** é necessário (o controller já é exercitado sem header em toda a suíte de `ui`; o que prova o AC é a ausência de regressão + o `it` `AC-11` do Step T7.6). Registrar essa leitura no artefato do T10
- [ ] `bun emit-openapi && git diff --stat packages/api/typescript/public/docs/openapi.json` → **vazio** (o `ctx` não é emitido; a prova de que trocar `runClaims` por `agentIdentity` não custa spec)

### Step T7.9 — Commit

```bash
git add packages/api/typescript/core/src/types/Controller.ts \
        packages/api/typescript/core/src/middlewares/AgentIdentityMiddleware.test.ts \
        packages/api/typescript/src/agent/types/AgentRunIdentity.ts \
        packages/api/typescript/src/agent/controllers/ForkIssue.ts \
        packages/api/typescript/src/agent/controllers/SteerIssueTurn.ts \
        packages/api/typescript/src/agent/mcp \
        packages/api/typescript/src/agent/middlewares
git commit -m "refactor(core,agent): B2 T7 — a checagem de identidade vai para o destino, e e obrigatoria

O walk generico morava no router e varria o corpo JSON-RPC contra IDENTITY_KEYS,
tres strings hardcoded, PULANDO (nao rejeitando) a claim ausente. Era essa
lacuna que obrigava ForkIssue e SteerIssueTurn a checar ownership no handle().

Agora AgentIdentityMiddleware roda no controller de destino, compara as chaves
que a IDENTIDADE carrega contra params+body ja separados pela camada HTTP — os
mesmos tres eixos, um nivel adiante — e e AUTO-APLICADO por static mcpScopes,
sem entrada em middlewares. A aplicacao vive em Controller.executeMiddlewares e
nao no MainRouter porque MainRouter e pulavel (emissao nao o constroi, e um
teste que chama executeController direto o ignora — DetectProviders.test.ts ja
faz isso). Fronteira de seguranca com bypass nao e fronteira.

Deixa de ser fail-closed, e a razao e de escala: ele agora serve 32 controllers,
23 dos quais sao leituras do console para um humano sem run nenhum. A
propriedade que o fail-closed protegia migra para o handle() do ForkIssue, que
ja rejeitava entryId ausente.

ForkIssue le ctx.agentIdentity — fim da mutacao de argumento a distancia e das
duas copias verbatim de RunClaimsCtxSchema. O schema ainda existe (Zod descarta
chave nao declarada), mas UMA vez, composto.

O SCOPE MATCH nao se move: tools/list e respondido pelo SDK sem round-trip a
controller nenhum, entao o adaptador e o unico ponto que ve TODA mensagem."
```

---

## Task T8: O adaptador fino `/v1/mcp/:scope` substitui `McpRouterController`

**Files to write:**
- Create: `packages/api/typescript/core/src/types/McpAdapter.ts` — a base abstrata (parse do scope, resolve da identidade, SCOPE MATCH, entrega via loader abstrato)
- Modify: `packages/api/typescript/core/src/index.ts` — `export * from './types/McpAdapter'`
- Create: `packages/api/typescript/src/agent/mcp/door.ts` — `McpDoorController extends McpAdapter` (transporte + `GENERATED_SERVERS` + `withMcpRunContext`)
- Delete: `packages/api/typescript/src/agent/mcp/router.ts`
- Rename: `src/agent/mcp/router.test.ts` → `src/agent/mcp/door.test.ts`; `src/agent/mcp/router.write-isolation.test.ts` → `src/agent/mcp/door.write-isolation.test.ts`
- Modify: `src/agent/index.ts` — o mount, `src/agent/mcp/generated-server.test.ts` — o import de `loadGeneratedServer`

**Files to read:**
- `packages/api/typescript/src/agent/mcp/router.ts` (pós-T7, ~200 linhas) — os 3 docstrings que sobrevivem VERBATIM: o de "servidor por request" (`:203-232`, com o `Stateless transport cannot be reused` medido), o de `GENERATED_SERVERS` (`:234-247`, com o `ERR_UNSUPPORTED_DIR_IMPORT` medido) e o de `protected buildTransport` (a visibilidade é load-bearing para o teste de write-isolation)
- `packages/api/typescript/src/agent/index.ts:24-35` — a carve-out de OpenAPI, que passa a nomear a classe nova
- `packages/api/typescript/core/src/types/Controller.ts:60-90` — a base que `McpAdapter` estende

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** opus
**Skills:** /controller, /test
**Depends on:** T7
**Consumes (frozen):** de T7, verbatim — `router.ts` já sem `rejectMismatchedIdentity`/`toolCallsIn`/`JSONRPC_INVALID_PARAMS`, e `identity.ts` inexistente. De T2, verbatim — `AgentIdentityService`, `readAgentRunToken`, `AgentIdentity`.
**Scope fence:** DONE: a base de core, a subclasse fina do app, e o rename dos dois testes. **AC-15 é uma NÃO-mudança e é verificada:** `GENERATED_SERVERS` continua um `Record` de 3 imports ESTÁTICOS e o servidor continua construído POR REQUEST, sem memoização — as duas restrições são medidas e citadas nos docstrings que migram verbatim. OUT: mexer em exposição (T5/T6), em identidade (T4/T7) ou em qualquer controller de domínio. Nenhum path HTTP muda: o adaptador continua em `${MCP_ROUTE_PREFIX}/:scope`.
**Gate:** `cd packages/api/typescript && bun test src/agent/mcp && bun test && bun x tsc -p tsconfig.build.json --noEmit` — exit 0, e `grep -rn "McpRouterController" packages/api packages/e2e` retorna **vazio**

### Step T8.1 — Proposed file: Create `core/src/types/McpAdapter.ts`

COMPLETE file:

```typescript
import { z } from '../utils/schema'
import { Controller } from './Controller'
import type { HttpMethod, MimeTypes as MimeTypesType } from './Http'
import { MimeTypes } from './Http'
import type { AgentIdentity } from './AgentIdentity'
import { readAgentRunToken } from './AgentIdentity'
import { AgentIdentityService } from '../services/AgentIdentityService'

export const McpAdapterInputSchema = z.object({ params: z.object({ scope: z.string() }) })
export const McpAdapterOutputSchema = z.any()

/** Why the adapter refused — the product supplies the vocabulary, core supplies the taxonomy. */
export type McpRefusal = 'unknown-scope' | 'invalid-token' | 'scope-mismatch'

/**
 * THE MCP DOOR, as a template method (B2, spec decision 5/6).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT CORE OWNS: the AUTHORIZATION SHAPE of a JSON-RPC tool endpoint — parse the surface out of the
 * path, resolve the credential, and check that the credential was issued FOR THAT SURFACE. Three
 * steps, no transport, no MCP SDK. `@modelcontextprotocol/sdk` is a dependency of the api package and
 * deliberately not of core, so everything that touches a server or a transport is `abstract` and the
 * product supplies it.
 *
 * ### THE SCOPE MATCH IS THE ONLY CHECK LEFT HERE, AND IT COULD NOT MOVE
 * Every other identity check migrated to `AgentIdentityMiddleware`, which runs at the destination
 * controller. This one cannot, and the reason is mechanical rather than aesthetic: `tools/list` is
 * answered by the MCP SDK itself, from the generated server, with NO round trip back to any HTTP
 * controller. A per-controller middleware structurally never sees it. So this is the only point where
 * "was this credential issued for THIS surface" can be asked of EVERY JSON-RPC message rather than
 * only of the ones that reach a controller — and without it an `issue-handling` token both enumerates
 * and calls the `system` surface, whose operations are account administration.
 *
 * ### NO `OperatorMiddleware`, AND THE OMISSION IS THE DESIGN
 * It would stamp the daemon's own operator identity onto every call unconditionally — the
 * confused-deputy shape this whole file exists to prevent. Authority here comes from the run token and
 * from nothing else.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
export abstract class McpAdapter extends Controller<typeof McpAdapterInputSchema, typeof McpAdapterOutputSchema> {
	readonly method: HttpMethod[] = ['post', 'get', 'delete']
	readonly inputSchema = McpAdapterInputSchema
	readonly outputSchema = McpAdapterOutputSchema
	override readonly contentType: MimeTypesType = MimeTypes['.stream']
	override middlewares = []

	constructor(protected readonly identities: AgentIdentityService) {
		super()
	}

	/** The surfaces this product declares. A path segment outside it is refused, never guessed at. */
	protected abstract readonly scopes: readonly string[]

	/**
	 * Hand the request to the generated server for `scope` — the ONE abstract step, and the only one
	 * that touches an MCP transport. The identity is passed so the implementation can establish
	 * whatever ambient context its generated handlers read; it has already been authorized.
	 */
	protected abstract serve(scope: string, token: string, request: Request): Promise<Response>

	/**
	 * Raise the product's OWN error for a refusal. Core has no vocabulary for "this run token is dead"
	 * — that code, its HTTP status and its i18n key belong to the context that owns agent runs.
	 */
	protected abstract refuse(reason: McpRefusal, detail: string): never

	async handle(request: this['input']): Promise<this['output']> {
		// A surface that was never declared is not a typo to be guessed at: answering it with another
		// surface's tools would be exactly the accidental exposure the allowlist exists to prevent.
		const scope = this.scopes.find(name => name === request.params.scope)
		if (!scope) this.refuse('unknown-scope', `unknown MCP scope '${request.params.scope}'`)

		const token = readAgentRunToken(Object.fromEntries(request.raw.headers))
		const identity: AgentIdentity | null = token ? this.identities.resolve(token) : null
		if (!identity) this.refuse('invalid-token', 'missing, unknown, expired or revoked run token')

		// AUTHORIZATION, not authentication. A valid token proves WHICH RUN is calling; it must also
		// prove which SURFACE that run was granted. The token rides on the child CLI's argv, which the
		// model can read, so enforcing the surface only through `--allowedTools` puts the boundary on
		// the attacker's side of the wire.
		if (identity.scope !== scope) {
			this.refuse('scope-mismatch', `this credential was issued for the '${identity.scope}' tool surface and cannot be used against '${scope}'`)
		}

		return this.rawResponse(await this.serve(scope, token, request.raw))
	}
}
```

- [ ] Conferir o specifier real de `z` no core (`../utils/schema` vs `../utils/schema/index`) contra o que `Controller.ts` e `RateLimitMiddleware.ts` usam; alinhar
- [ ] `refuse` retorna `never`, então o `tsc` estreita `scope`/`identity` depois de cada guard sem `!` nem cast

### Step T8.2 — Proposed file: Create `src/agent/mcp/door.ts`

O que sobra do `router.ts` — e é pouco. COMPLETE file (docstrings longos abreviados aqui com `[VERBATIM de router.ts:<linhas>]`, que o executor cola sem reescrever):

```typescript
import { injectable } from 'tsyringe-neo'
import { Config, McpAdapter, BaseError, type McpRefusal } from '@codedm/core-typescript'
import { withMcpRunContext } from '@codedm/client-typescript/typescript/mcp/context'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { McpScope } from '@codedm/contracts-typescript/wire/enums'
import { AgentIdentityService } from '@codedm/core-typescript'
import type { AgentRunIdentity } from '../types/AgentRunIdentity'
import type { AgentInterfaceErrors } from '../errors'
import { MCP_ROUTE_PREFIX } from './route'

export { MCP_ROUTE_PREFIX }

/**
 * THE PRODUCT'S MCP DOOR — everything `McpAdapter` left abstract, and nothing else.
 *
 * [VERBATIM de router.ts:23-33 — "IT IS A REAL ROUTE THAT IS DELIBERATELY NOT IN THE SPEC" e
 *  "THE TOOLS ARE GENERATED, SO THIS FILE REGISTERS NOTHING"]
 *
 * WHAT SHRANK. This file used to be ~270 lines and carried, besides the three below, a generic
 * identity walk over the JSON-RPC body against a hardcoded list of three key names. That walk is
 * `AgentIdentityMiddleware` now, at the destination controller, comparing the keys the identity
 * actually carries. What remains here is the part that could not move, because `tools/list` never
 * reaches a controller.
 */
@injectable()
export class McpDoorController extends McpAdapter {
	readonly path = `${MCP_ROUTE_PREFIX}/:scope` as const
	readonly description = 'CodeDM MCP server (JSON-RPC) — not emitted to the OpenAPI/SDK'

	protected readonly scopes = Object.values(McpScope)

	constructor(identities: AgentIdentityService<AgentRunIdentity>) {
		super(identities)
	}

	/** 401 for a credential that is absent or dead, 403 for one aimed at the wrong surface. */
	protected refuse(reason: McpRefusal, detail: string): never {
		if (reason === 'scope-mismatch') throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_SCOPE_MISMATCH', detail)
		throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_TOKEN_INVALID', detail)
	}

	protected async serve(scope: string, token: string, request: Request): Promise<Response> {
		const transport = await this.buildTransport(scope)
		// [VERBATIM de router.ts:97-107 — por que o contexto é estabelecido EM VOLTA do dispatch inteiro,
		//  e por que a origem é este daemon e é um fato de runtime, não um literal de codegen]
		const baseUrl = `http://127.0.0.1:${Config.env.API_PORT}`
		return withMcpRunContext({ token, baseUrl }, () => transport.handleRequest(request))
	}

	/**
	 * [VERBATIM de router.ts:203-232 — "A FRESH server + transport for EVERY request", com o
	 *  `Stateless transport cannot be reused across requests` MEDIDO, e a nota de que `protected` é
	 *  load-bearing para o teste de write-isolation]
	 */
	protected async buildTransport(scope: string): Promise<WebStandardStreamableHTTPServerTransport> {
		const server = await loadGeneratedServer(scope as McpScope)
		const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
		await server.connect(transport)
		return transport
	}
}

/**
 * [VERBATIM de router.ts:234-247 — "one STATIC specifier each", com o `ERR_UNSUPPORTED_DIR_IMPORT`
 *  MEDIDO e a razão de ser um `Record<McpScope, …>` e não uma busca por string]
 */
const GENERATED_SERVERS: Record<McpScope, () => Promise<{ getServer: () => McpServer }>> = {
	[McpScope.ISSUE_HANDLING]: () => import('@codedm/client-typescript/typescript/mcp/scopes/issue-handling/server'),
	[McpScope.ORCHESTRATION]: () => import('@codedm/client-typescript/typescript/mcp/scopes/orchestration/server'),
	[McpScope.SYSTEM]: () => import('@codedm/client-typescript/typescript/mcp/scopes/system/server'),
}

/** [VERBATIM de router.ts:249-256 — por que o carregamento é isolado numa função que um teste pode chamar] */
export async function loadGeneratedServer(scope: McpScope): Promise<McpServer> {
	const module = await GENERATED_SERVERS[scope]()
	return module.getServer()
}
```

- [ ] **AC-15 verificado, não assumido:** `GENERATED_SERVERS` continua com 3 chaves e 3 `import(...)` de specifier LITERAL (chave computada `[McpScope.X]` é literal em tempo de bundle; se o bundler reclamar, voltar às chaves em string `'issue-handling'` — o valor do enum é a mesma string). `buildTransport` continua construindo servidor + transporte por request, sem cache
- [ ] Conferir que `Object.values(McpScope)` é `readonly string[]` compatível com `protected readonly scopes`

### Step T8.3 — O mount e os testes

- [ ] `src/agent/index.ts:4` — `import { McpRouterController } from './mcp/router'` → `import { McpDoorController } from './mcp/door'`; `:32` e `:35` — a chave do objeto de controllers vira `McpDoorController`. **A carve-out de `EMIT_OPENAPI` fica idêntica**
- [ ] `git mv src/agent/mcp/router.test.ts src/agent/mcp/door.test.ts` e `git mv src/agent/mcp/router.write-isolation.test.ts src/agent/mcp/door.write-isolation.test.ts`; nos dois, `McpRouterController` → `McpDoorController`, `ObservableRouter` → `ObservableDoor`, `WritingRouter` → `WritingDoor`. **A subclasse de teste continua sobrescrevendo `buildTransport`**, que é o que torna "nada foi despachado / nada foi escrito" mensurável
- [ ] `src/agent/mcp/generated-server.test.ts:6` — `import { loadGeneratedServer } from './router'` → `from './door'`
- [ ] `git rm src/agent/mcp/router.ts`

### Step T8.4 — Verde, greps e o spec intocado

- [ ] `bun test src/agent/mcp` → verde. **Um round trip real** já existe na suíte (`generated-server.test.ts` dirige um `Client` MCP in-memory); confirmar que continua verde, porque é ele que prova que o servidor gerado CARREGA (tsc verde nunca provou isso — o gerador emite imports sem `.js` que typecheckam e morrem em runtime)
- [ ] `bun test && bun x tsc -p tsconfig.build.json --noEmit` → exit 0
- [ ] `grep -rn "McpRouterController\|mcp/router" packages/api packages/e2e packages/client` → **vazio**
- [ ] `bun emit-openapi && git diff --stat packages/api/typescript/public/docs/openapi.json` → **vazio** (a porta MCP nunca foi emitida — a carve-out; e o rename de classe não pode ter vazado para o spec). Se aparecer QUALQUER coisa, a carve-out quebrou: **PARE e reporte**
- [ ] `cd packages/e2e && bun run test` NÃO roda aqui (é do Final Validation) — mas conferir por grep que `packages/e2e/tests/10-terminal-tool-frame.spec.ts:70,74,77` continua asseverando `mcp__codedm__TransitionIssueStatus` / `mcp__codedm__RecordArtifact`, dois nomes que o snapshot do T6 também lista. Se o snapshot e o e2e discordarem, o defeito é do T5

### Step T8.5 — Commit

```bash
git add packages/api/typescript/core/src/types/McpAdapter.ts \
        packages/api/typescript/core/src/index.ts \
        packages/api/typescript/src/agent/mcp \
        packages/api/typescript/src/agent/index.ts
git commit -m "refactor(core,agent): B2 T8 — o adaptador fino, com a unica carga que nao podia sair de la

McpRouterController tinha ~270 linhas e cinco responsabilidades. Quatro sairam
nas Tasks anteriores; a que ficou e o SCOPE MATCH, e ela ficou por um motivo
mecanico: tools/list e respondido pelo SDK do MCP a partir do servidor gerado,
sem round-trip de volta a controller nenhum — um middleware por controller
estruturalmente nao o ve. E o unico ponto que enxerga TODA mensagem JSON-RPC.

McpAdapter (core) fica com a forma de AUTORIZACAO: parse do scope, resolve da
credencial, scope match. Nada de transporte — o SDK do MCP e dependencia do
pacote api e deliberadamente nao do core, entao servir o servidor gerado e
abstract e o produto o supre.

McpDoorController (app) tem o que sobrou: o Record de 3 imports estaticos, o
transporte por request e o contexto ambiente do token. As duas restricoes
MEDIDAS sobrevivem com seus docstrings verbatim — ERR_UNSUPPORTED_DIR_IMPORT (o
bundler nao resolve import por template literal) e Stateless transport cannot be
reused across requests (sem memoizacao entre requests).

Nome: o docstring ja o chamava DOOR; Router e palavra tomada no core e o
artefato deixou de rotear quando o walk saiu."
```

---

## Task T9: As três skills aprendem os três padrões

**Files to write:**
- Modify: `.claude/skills/controller/typescript/registry.yaml` + `.claude/skills/controller/typescript/SKILL.md` — `static mcpScopes` como idioma de auto-declaração
- Modify: `.claude/skills/agent/typescript/registry.yaml` + `.claude/skills/agent/typescript/SKILL.md` — `static IdentitySchema` (parse no spawn, antes de `issue`) e o rename do serviço
- Modify: `.claude/skills/middleware/typescript/registry.yaml` + `.claude/skills/middleware/typescript/SKILL.md` — middleware auto-aplicado por metadado estático do controller

**Files to read:**
- `.claude/skills/controller/typescript/registry.yaml` — **ler uma entrada existente de `patterns` E uma de `bad_practices` ANTES de escrever**: o formato (`id`, `name`, `when`/`severity`, `mechanical`, `detect` como lista de regex, `rule`/`wrong`/`right`, `reason`) não é adivinhável, e o prefixo de id por variant é fixo (`CTRL-nn` / `CTRL-Cnn` / `bp-nn`)
- `.claude/skills/agent/typescript/registry.yaml:8-76` — os ids vão até `AGT-13`; o novo é `AGT-14`
- `.claude/skills/middleware/typescript/registry.yaml` — conferir o prefixo real de id daquele variant antes de numerar
- `.claude/registry.yaml` — confirmar que **nenhuma entrada nova de mapeamento arquivo→skill é necessária** (a spec afirma isso; verificar que `core/src/middlewares/*` e `core/src/services/*` já casam com as regras de `middleware`/`service`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /controller, /middleware, /review
**Depends on:** T7, T8
**Consumes (frozen):** os NOMES FINAIS que as entradas de registry citam, verbatim — `static mcpScopes` (slot em `core/src/types/Controller.ts`), `McpScope` de `@codedm/contracts-typescript/wire/enums`, `static IdentitySchema` + `AgentRunIdentitySchema` (`src/agent/types/AgentRunIdentity.ts`), `AgentIdentityService` com `issue`/`resolve`/`revoke` e `AgentIdentityMiddleware` (`@codedm/core-typescript`), `AgentRunIdentityCtxSchema`, e o predicado `Controller.executeMiddlewares` → `effectiveMiddlewares`. Uma entrada de skill que cite um nome morto (`RunTokenService`, `MCP_SCOPES`) ensina o que não compila.
**Scope fence:** DONE: uma entrada de `patterns` em cada uma das três skills, mais uma `bad_practices` na de controller (o oposto do padrão novo: declarar exposição fora do controller). OUT: tocar código; acrescentar entrada em `.claude/registry.yaml` (a spec diz explicitamente que não é preciso — **verificar e registrar a verificação**, não assumir); mexer nos variants `go`/`rust` dessas skills (o padrão é do runtime TypeScript e não existe nos outros dois backends).
**Gate:** `bun test:tooling` — exit 0 (carrega os registries e audita as regex de `detect:`), e `bun scripts/review.ts --backend --context agent` roda sem erro de parse

### Step T9.1 — Ler o formato antes de escrever

- [ ] Abrir `.claude/skills/controller/typescript/registry.yaml` e copiar a FORMA de `CTRL-07` (uma `patterns` com `when: always` + `rule` + `wrong`) e de `bp-02` (uma `bad_practices` com `severity` + `mechanical: true` + `detect:` + `wrong`/`right`)
- [ ] Conferir o último id de cada arquivo — o novo é o seguinte, sem buracos

### Step T9.2 — `controller/typescript`

`patterns`, id seguinte da série `CTRL-`:

```yaml
    - id: CTRL-12
      name: "MCP exposure is a static on the controller, not a list elsewhere"
      when: "the endpoint should be callable by a model as an MCP tool"
      reason: "It used to live in a central manifest with seven parallel structures kept in sync by hand, so 'what exactly can a model call?' was un-answerable without leaving the file. `middlewares` already established the idiom: a cross-cutting property of an endpoint is declared ON the endpoint. The OpenAPI emitter reads the static during the same walk that builds the path — no registry, no side-effect module."
      rule: "`static override readonly mcpScopes = [McpScope.X]`, right above `readonly path`, with `McpScope` from `@codedm/contracts-typescript/wire/enums`. ABSENT is the default and absent means NOT EXPOSED — measured: with no filter, `@kubb/plugin-mcp` turns every operation in the spec into a tool, so the security property comes entirely from this being opt-in."
      wrong: "adding the controller class to a central `MCP_SCOPES` record, or declaring the scope as a bare string literal instead of the contracts enum."
```

`bad_practices`, id seguinte da série `bp-`:

```yaml
    - id: bp-09
      name: "Declaring MCP exposure outside the controller"
      severity: critical
      mechanical: true
      detect:
        - 'MCP_SCOPES|MCP_SCOPE_BY_OPERATION|registerMcpScopes|mcpScopesFor'
      wrong: |
        // A central list, far from the endpoint it exposes — and one of seven structures
        // that had to agree with each other by hand.
        export const MCP_SCOPES = {
          'issue-handling': [CreateIssueController, RaiseStopController, /* … */],
        }
      right: |
        // On the controller, in the idiom `middlewares` already uses.
        @injectable()
        export class RaiseStopController extends Controller</* … */> {
          static override readonly mcpScopes = [McpScope.ISSUE_HANDLING, McpScope.ORCHESTRATION]
          readonly path = '/threads/:threadId/issues/:issueId/stops'
          // …
        }
```

### Step T9.3 — `agent/typescript`

`patterns`, `AGT-14` (a série vai até `AGT-13`):

```yaml
    - id: AGT-14
      name: "Identity is a static schema, parsed at spawn"
      when: "the agent declares an mcpScope"
      reason: "It replaced `SCOPE_CONFINEMENT`, a `Record<McpScope,'issue'|'thread'>` in a central manifest whose ONLY reader was one line in the base's mint site. That made 'which id does this surface require' a property of the SCOPE, kept far from every agent, with the weaker confinement as the silent default when a new scope was forgotten. The requirement did not go away — it became the agent's own."
      rule: "`static override readonly IdentitySchema = AgentRunIdentitySchema.extend({ issueId: z.uuid() })` for an agent confined to an issue; `.omit({ issueId: true })` for one that structurally has none. The base parses it inside `buildMcpInvocation` BEFORE calling `AgentIdentityService.issue(...)`, so an identity that does not parse never becomes a credential and the runner is never reached."
      wrong: "a scope→confinement record read at the mint site; an `if (!input.issueId) throw` in the agent; or parsing AFTER `.issue(` (the order is the property — a test that only asserts the throw stays green against an implementation that issued first)."
```

E um segundo, sobre o rename — o vocabulário mudou e um agente escrito contra o antigo não compila:

```yaml
    - id: AGT-15
      name: "The identity service is AgentIdentityService, with issue/resolve/revoke"
      when: always
      reason: "`RunTokenClaims` named an ENVELOPE that does not exist — the token is 32 random bytes and the identity never leaves the process. What travels is a lookup key. The abstract + the InMemory implementation live in `core` (they are a template capability); the product only narrows the type."
      rule: "`AgentIdentityService<AgentRunIdentity>` from `@codedm/core-typescript`, injected into the base `Agent`. `issue` is called ONLY by the base at spawn; `resolve` by the destination controller's middleware and by the MCP adapter's scope match; `revoke` by the runner at run end."
      wrong: "`RunTokenService`, `RunTokenClaims`, `.mint(`, `.verify(` — all dead names. A runner that issues is the named bad practice: it would have to be handed the identity the seam exists to keep out of it."
```

### Step T9.4 — `middleware/typescript`

`patterns`, id seguinte da série real do arquivo (conferir no Step T9.1):

```yaml
    - id: MW-<n>
      name: "A middleware may be auto-applied by a static on the controller"
      when: "the protection is implied by something the controller already declared"
      reason: "`OperatorMiddleware` is opted into per controller because 'who is this daemon' is a routing choice. `AgentIdentityMiddleware` is not: a controller with a non-empty `static mcpScopes` has already said the dangerous thing, and a protection that must be remembered on a SECOND line is one that can be forgotten exactly where it matters. This is the general shape, not a one-off — any future capability whose danger is declared by a static can use it."
      rule: "The predicate lives in `Controller.executeMiddlewares` (core), which appends the middleware LAST — after `OperatorMiddleware` has stamped `ctx` — and skips when the controller listed it explicitly, so the dedup rule matches the router's. `skipMiddlewares` remains the visible escape hatch."
      wrong: "applying it in `MainRouter.configureRouterControllers`. MainRouter is SKIPPABLE — spec emission never constructs it, and a test that calls `executeController` directly bypasses it. A security boundary with a bypass is not one."
```

E a nota que fecha o par com o `ctx`:

```yaml
    - id: MW-<n+1>
      name: "What a middleware stamps on ctx must be DECLARED in a schema — once, shared"
      when: "the middleware writes to request.ctx"
      reason: "`Controller.execute` validates against `inputSchema` and merges the VALIDATED envelope over the raw one, and Zod objects STRIP unknown keys. A value a middleware injected but no schema named is silently removed before `handle` sees it — measured: a 500 on every fork, with the middleware provably correct and the key simply gone."
      rule: "One shared ctx schema next to the identity type (`AgentRunIdentityCtxSchema`), composed by every controller that reads it: `ctx: z.object({ ownerId: z.uuid() }).extend(AgentRunIdentityCtxSchema.shape)`. `ctx` never reaches the OpenAPI spec (the emitter reads only body/query/params/headers), so the shape costs nothing downstream."
      wrong: "a verbatim copy of the ctx schema in each controller that reads it — the shape this repo had in two controllers before B2."
```

### Step T9.5 — Verificar (não assumir) que `.claude/registry.yaml` não muda

- [ ] Rodar `bun scripts/review.ts packages/api/typescript/core/src/middlewares/AgentIdentityMiddleware.ts packages/api/typescript/core/src/services/AgentIdentityService/AgentIdentityService.ts packages/api/typescript/src/agent/mcp/exposure.ts --no-cascade` e conferir a skill que cada arquivo recebeu
- [ ] Se `exposure.ts` cair em "não classificado" (não é controller, nem service, nem middleware — é um módulo de varredura em `mcp/`), isso é um ACHADO, não um problema a resolver aqui: registrar como observação no T10, não inventar regra nova
- [ ] `bun test:tooling` → exit 0

### Step T9.6 — Commit

```bash
git add .claude/skills/controller/typescript/registry.yaml \
        .claude/skills/controller/typescript/SKILL.md \
        .claude/skills/agent/typescript/registry.yaml \
        .claude/skills/agent/typescript/SKILL.md \
        .claude/skills/middleware/typescript/registry.yaml \
        .claude/skills/middleware/typescript/SKILL.md
git commit -m "docs(skills): B2 T9 — os tres padroes entram nas skills que os ensinam

controller: static mcpScopes como idioma de auto-declaracao (ao lado de
middlewares), com o oposto virando bad practice critica e mecanica — declarar
exposicao numa lista central.

agent: static IdentitySchema com parse no spawn ANTES de issue (a ordem e a
propriedade), e o rename RunTokenService -> AgentIdentityService com
issue/resolve/revoke, porque um agente escrito contra o vocabulario velho nao
compila mais.

middleware: a forma geral de middleware auto-aplicado por metadado estatico do
controller — AgentIdentityMiddleware e o primeiro caso, nao o unico que a forma
admite — e a regra pareada de que o que um middleware estampa em ctx TEM de
estar declarado num schema, uma vez, compartilhado."
```

---

## Task T10: Fechamento — os greps re-rodados, o mapa AC→teste e o artefato

**Files to write:**
- Create: `.plans/artifacts/2026-07-30-b2-mcp-core-service-closure.md`

**Files to read:**
- `.plans/artifacts/2026-07-30-b4-aggregate-boundaries-closure.md` — o molde do artefato de fechamento

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Depends on:** T1, T2, T3, T4, T5, T6, T7, T8, T9
**Consumes (frozen):** os caminhos e nomes que os greps de fechamento asseveram, verbatim — os arquivos que DEVEM existir (`packages/contracts/wire/enums/mcp-scope.tsp`, `core/src/types/{AgentIdentity,McpAdapter}.ts`, `core/src/services/AgentIdentityService/`, `core/src/middlewares/AgentIdentityMiddleware.ts`, `core/src/utils/McpExposure.ts`, `src/agent/mcp/{exposure,door}.ts`, `src/agent/types/AgentRunIdentity.ts`, `tests/architecture/mcp-exposure.test.ts` + seu `__snapshots__/`), os que NÃO devem (`src/agent/mcp/{manifest,register,router,identity,RunTokenService}.ts`, `src/agent/middlewares/`, `src/agent/services/RunTokenService/`, `core/src/utils/McpScopeRegistry.ts`, `tests/architecture/mcp-manifest.test.ts`), e os símbolos mortos (`MCP_SCOPES`, `MCP_SCOPE_NAMES`, `SCOPE_CONFINEMENT`, `TOOLS_IN_SCOPE`, `MCP_SCOPE_BY_OPERATION`, `ISSUE_HANDLING_OPERATION`, `IDENTITY_KEYS`, `RunTokenClaims`, `RunTokenService`, `runClaims`, `.mint(`, `.verify(`).
**Scope fence:** DONE: re-rodar os greps de fechamento com as saídas COLADAS, o mapa AC→teste e o registro das saídas dos falseadores. OUT: qualquer correção de código — se um grep achar resíduo, isso é um defeito da Task que o deixou e volta para lá, não vira uma emenda aqui.
**Gate:** todos os itens de `## Final Validation` verdes

### Step T10.1 — Os greps de fechamento (colar as saídas, não parafrasear)

```bash
cd /Users/work/Desktop/Projetos/pessoal/codedm

# AC-2 — as sete estruturas e os dois arquivos de infra não existem
grep -rn "mcp/manifest\|McpScopeRegistry\|registerMcpScopes\|mcpScopesFor\|mcpScopeRegistrySnapshot" packages/ --include="*.ts" | grep -v node_modules
grep -rn "MCP_SCOPES\|MCP_SCOPE_NAMES\|SCOPE_CONFINEMENT\|MCP_SCOPE_BY_OPERATION\|ISSUE_HANDLING_OPERATION\|scopeOperationIds" packages/ --include="*.ts" | grep -v node_modules
ls packages/api/typescript/src/agent/mcp/ packages/api/typescript/core/src/utils/ | grep -i "manifest\|register\|McpScopeRegistry\|router"

# AC-6/AC-7 — o vocabulário velho de identidade
grep -rn "RunTokenClaims\|RunTokenService\|RunTokenMiddleware\|\.mint(\|\.verify(" packages/api --include="*.ts" | grep -v node_modules

# AC-8 — o walk genérico
grep -rn "IDENTITY_KEYS\|findIdentityMismatches\|assertIdentityMatches" packages/ --include="*.ts" | grep -v node_modules

# AC-10 — a injeção de argumento à distância
grep -rn "runClaims\|RunClaimsCtxSchema" packages/ --include="*.ts" | grep -v node_modules

# AC-3 — os statics existem e são 32 classes / 34 pares
grep -rn "static override readonly mcpScopes" packages/api/typescript/src --include="*.ts" | wc -l

# AC-12 — o core não conhece o produto
grep -rn "McpScope\|AgentRunIdentity\|@codedm/client-typescript\|@agent/" packages/api/typescript/core/src/types/AgentIdentity.ts packages/api/typescript/core/src/types/McpAdapter.ts packages/api/typescript/core/src/services/AgentIdentityService packages/api/typescript/core/src/middlewares/AgentIdentityMiddleware.ts

# AC-15 — 3 imports estáticos, servidor por request
grep -n "import('@codedm/client-typescript/typescript/mcp/scopes" packages/api/typescript/src/agent/mcp/door.ts | wc -l
grep -n "buildTransport" packages/api/typescript/src/agent/mcp/door.ts

# AC-17 — o teste antigo não existe
ls packages/api/typescript/tests/architecture/ | grep mcp
```

- [ ] Os cinco primeiros devem retornar **vazio**; o de statics deve retornar **32**; o de imports estáticos, **3**; `ls .../tests/architecture | grep mcp` deve mostrar **só** `mcp-exposure.test.ts`
- [ ] Colar cada saída no artefato, com o comando acima dela

### Step T10.2 — As saídas dos falseadores

- [ ] Colar, verbatim, as 6 saídas de falseador que as Tasks produziram: T2.8 (a) `compareIdentity` neutralizado → 3 `it` vermelhos; T2.8 (b) expiry neutralizado → 1 vermelho; T3.5 default-is-exposed → 3 vermelhos; **T4.8 (a) o parse de identidade desligado → exatamente 2 `it` vermelhos**; **T4.8 (b) o parse movido para depois do `issue` → 1 `it` vermelho**; T6.3 o static removido de `TransitionIssueStatus` → snapshot vermelho NOMEANDO `mcp__codedm__TransitionIssueStatus`
- [ ] Para o falseador obrigatório (T4.8), registrar os TRÊS números: baseline em HEAD (`6 pass / 0 fail / 11 expect()`), o estado verde final (`N pass / 0 fail / M expect()`) e o estado com a validação desligada (`N-2 pass / 2 fail`)

### Step T10.3 — Proposed file: Create `.plans/artifacts/2026-07-30-b2-mcp-core-service-closure.md`

Seções: (1) os greps com saída colada; (2) as 6 saídas de falseador; (3) o mapa AC→teste do `## Final Validation`; (4) o inventário das 7 estruturas com o commit que matou cada uma; (5) o mapeamento `it`-a-`it` dos testes de `router.test.ts` que migraram para `AgentIdentityMiddleware.test.ts` (Step T7.7); (6) as observações que não viraram Task.

### Step T10.4 — Gates completos

- [ ] Rodar todo o `## Final Validation` abaixo e colar as saídas no artefato

### Step T10.5 — Commit

```bash
git add .plans/artifacts/2026-07-30-b2-mcp-core-service-closure.md
git commit -m "docs(plans): B2 — artefato de fechamento (greps citados + falseadores + mapa AC->teste)"
```

---

## Final Validation

- [ ] `bun tsc` — type check completo, exit 0
- [ ] `bun lint` — exit 0
- [ ] `bun run test` — 0 fail (todos os workspaces exceto e2e)
- [ ] `bun detect` — exit 0, sem findings novos
- [ ] `bun check:generated` — exit 0 (bindings de contracts + SDK + openapi.json não derivaram)
- [ ] `bun test:tooling` — exit 0 (os registries das três skills carregam; as regex de `detect:` compilam)
- [ ] `bun run --cwd packages/contracts test` — exit 0 (`bun test codegen/` + `test:rust` + `test:go`; o enum novo atravessa as 3 línguas)
- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` — exit 0 (o type-check autoritativo do backend, sem o ruído de `bun:test`)
- [ ] `cd packages/api/typescript/core && bun test` — exit 0
- [ ] `cd packages/api/go && go build ./... && go test ./...` — exit 0 (o enum novo gera `wire/enums.go`; nenhum arquivo Go à mão é tocado)
- [ ] `cd packages/app/react && bun x tsc --noEmit && bun test` — exit 0 nos dois. **Obrigatório mesmo parecendo alheio:** o T5 regenera a SDK (`RaiseStop` ganha `orchestration`), e o `tsconfig` do app exclui `*.test.tsx`, então os dois gates são necessários
- [ ] `cd packages/e2e && bun run test` — exit 0 (suíte completa; **`bun e2e` NÃO é usado neste repo**). O caso que importa é `tests/10-terminal-tool-frame.spec.ts`, que assevera `mcp__codedm__TransitionIssueStatus` e `mcp__codedm__RecordArtifact` — os dois nomes de wire que o snapshot do T6 também lista
- [ ] AC mapping (todo AC da spec → ≥1 caminho de teste):
  - AC-1 → `packages/contracts/wire/enums/mcp-scope.tsp` + o import em `wire/main.tsp` + os 3 bindings gerados; provado por `bun run --cwd packages/contracts test` e pelo grep do Step T1.4
  - AC-2 → Step T10.1, greps 1 e 2 vazios + `ls` sem `manifest.ts`/`register.ts`/`McpScopeRegistry.ts`
  - AC-3 → `tests/architecture/mcp-exposure.test.ts:"AC-3 — RaiseStop is in BOTH surfaces"` + o snapshot dourado (6/5/23) + o grep de 32 statics
  - AC-4 → `mcp-exposure.test.ts` (as 3 set-equalities por scope, bidirecionais) + a verificação dura do Step T5.7 (`git diff … | grep -v 'RaiseStop\|orchestration'` vazio)
  - AC-5 → `src/agent/types/Agent.identity.test.ts:"IssueWorkAgent.IdentitySchema requires issueId; OrchestratorAgent.IdentitySchema has no such field"`
  - AC-6 → Step T10.1, grep de `SCOPE_CONFINEMENT` vazio + `Agent.identity.test.ts:"FALSEADOR — and no credential was created"` (a ORDEM: o parse antes de `issue`) e o falseador T4.8(b)
  - AC-7 → Step T10.1, grep de `RunTokenClaims|RunTokenService|.mint(|.verify(` vazio + `core/src/services/AgentIdentityService/` com os 3 verbos + `core/src/types/AgentIdentity.test.ts:"InMemoryAgentIdentityService — issue / resolve / revoke"`
  - AC-8 → Step T10.1, grep de `IDENTITY_KEYS|findIdentityMismatches|assertIdentityMatches|RunTokenMiddleware` vazio
  - AC-9 → `core/src/middlewares/AgentIdentityMiddleware.ts` + `Controller.executeMiddlewares` (o getter `effectiveMiddlewares`) + `AgentIdentityMiddleware.test.ts` completo; nenhum controller lista o middleware em `middlewares`, provado pelo grep `grep -rn "AgentIdentityMiddleware" packages/api/typescript/src` → vazio
  - AC-10 → `src/agent/controllers/ForkIssue.ts` lendo `request.ctx.agentIdentity` + Step T10.1, grep de `runClaims|RunClaimsCtxSchema` vazio
  - AC-11 → `AgentIdentityMiddleware.test.ts:"AC-11 — NO token: the request passes untouched"` + a suíte de `src/ui` verde sem header algum (Step T7.8)
  - AC-12 → `core/src/types/McpAdapter.ts`, `core/src/types/AgentIdentity.ts` (com `compareIdentity`) e `core/src/services/AgentIdentityService/` (abstract + InMemory) existentes; Step T10.1, grep de `McpScope|AgentRunIdentity|@codedm/client-typescript|@agent/` nesses arquivos → vazio
  - AC-13 → `src/agent/mcp/door.test.ts` (os `it` de scope divergente → 403, herdados de `router.test.ts`) + `core/src/types/McpAdapter.ts#handle` fazendo o match ANTES de `serve()`, para toda mensagem
  - AC-14 → Step T10.1, grep de `findIdentityMismatches` vazio + `door.ts` sem `rejectMismatchedIdentity`/`toolCallsIn`/`JSONRPC_INVALID_PARAMS` (o arquivo inteiro cabe numa tela)
  - AC-15 → Step T10.1, `grep -c "import('@codedm/client-typescript/typescript/mcp/scopes"` = **3** + `buildTransport` construindo servidor+transporte por chamada, sem campo de cache; `src/agent/mcp/generated-server.test.ts` verde é a prova de RUNTIME (tsc verde nunca provou que o módulo gerado carrega)
  - AC-16 → `tests/architecture/mcp-exposure.test.ts` + `__snapshots__/mcp-exposure.test.ts.snap` commitado + os dois falseadores do Step T6.3 (remover um static → vermelho nomeando a tool; acrescentar um → vermelho ganhando a tool)
  - AC-17 → Step T10.1, `ls tests/architecture | grep mcp` → só `mcp-exposure.test.ts`
  - AC-18 → `src/agent/mcp/E2eMcpDriver.ts` sem import de `./manifest` (usa `operationIdOf(<Classe>)` de `./exposure`); o guard `!identity.entryId` (C8) preservado, provado pela suíte de e2e verde
  - AC-19 → os itens de `## Final Validation` acima

## Notes

- **`bun e2e` NÃO é usado neste repo** — o script é `cd packages/e2e && bun run test`. Nenhum Step deste plano o invoca.
- **A premissa "o `RaiseStopController` migrou para `thread/controllers` no B4" é FALSA** e o plano a corrige com prova (tabela de Ground, linha 1): a classe está em `src/agent/controllers/RaiseStop.ts` e sempre esteve; o que o B4 moveu foi o USE CASE homônimo (`issue/usecases/RaiseStop.ts` → `thread/usecases/RaiseStop.ts`, commit `6fd77b96`). O controller de `agent/` chama `agent/usecases/DeclareStop`, não o use case migrado. **Um plano que assumisse a premissa teria editado o arquivo errado e o `tsc` só reclamaria depois de o manifesto já ter sido apagado.**
- **O que MUDOU de endereço desde a spec, e é uma coisa só:** `GetNeedsYouPanelController` (`issue/controllers` → `thread/controllers`, `R100` no `6fd77b96`) — e o próprio B4 já atualizou o import no manifesto, com comentário inline. Nenhum outro controller de `MCP_SCOPES` mudou de arquivo. `ResolveStop`/`UpdateStopCriteria` também migraram no B4, mas **não são tools** e não aparecem em lugar nenhum desta frente.
- **O1 (achado, absorvido, NÃO virou desvio silencioso).** A spec descreve o emitter lendo o `Map` global em UM ponto (`buildOperation`). São **dois**: `generateSpecification:508-517` também publica o `x-mcp-scopes` de RAIZ a partir de `mcpScopeRegistrySnapshot()`, e `packages/client/generators/typescript.ts:60,356` o lê como autoridade e lança quando a contagem emitida diverge. Matar o `Map` sem reconstruir esse segundo ponto faria `bun sdk` emitir zero tools com build verde — a falha silenciosa que `mcp-manifest.test.ts` existia para impedir. O T5 reconstrói os dois.
- **O2 (achado, absorvido).** Apagar `manifest.ts` obriga a editar `src/shared/context-map.ts`: seis `POLICY_EXCEPTIONS` geradas por `.map()` citam o arquivo por caminho, e `context-map.test.ts` tem um teste "policy exceptions are ALIVE" que reprova quando o caminho não existe. Elas migram para `exposure.ts` com a justificativa reescrita (D-C) — de "declara a audiência" para "varre o static". O `ANNOTATED_CYCLES` de `agent ↔ ui` muda pelo mesmo motivo.
- **O3 (apertada nomeada, T5.4).** `OrchestratorAgent/prompt.ts:180` faz `const [createIssue] = TOOLS_IN_SCOPE.orchestration` — destructuring POSICIONAL do primeiro item de uma lista que era ordenada à mão. Com a varredura, a ordem passa a ser alfabética e `[0]` mudaria de significado **silenciosamente**. Vira `toolNameOf(ForkIssueController)`. Declarado aqui para o revisor de conformidade ler como correção obrigatória, não como scope creep.
- **O4 (mudança observável declarada, D-F).** `AgentIdentityMiddleware` lança `UNAUTHORIZED`/`FORBIDDEN` (códigos de core) onde `RunTokenMiddleware` lançava `AGENT_RUN_TOKEN_INVALID`/`AGENT_RUN_SCOPE_MISMATCH` (códigos do contexto `agent`). **Mesmos status HTTP.** Custo verificado em zero: não existe `RunTokenMiddleware.test.ts` (`ls src/agent/middlewares/` → 2 arquivos), os testes que asseveram os códigos do `agent` o fazem no adaptador (que continua app-side e continua lançando-os), e `ctx` não é emitido, então nenhum hook/SDK/react vê a diferença.
- **O5 (mudança de postura declarada, T7).** `RunTokenMiddleware` era fail-closed; `AgentIdentityMiddleware` não é (AC-11). A razão é de escala — ele passa a servir 32 controllers, 23 dos quais são leituras do console para um humano sem run algum. A propriedade que o fail-closed protegia (`ForkIssue` nunca criar issue sem proveniência) **migra para o `handle()` do `ForkIssue`**, que ganha um guard explícito de `!identity` além do `!entryId` que já tinha.
- **O6 (observação, NÃO virou Task).** `AGENT_RUN_TOKEN_HEADER` (core) e `MCP_RUN_TOKEN_HEADER` (SDK gerada) são duas declarações do mesmo byte, pinadas por uma asserção em `mcp-exposure.test.ts` (D-E). O single-sourcing real seria `packages/client/generators/typescript.ts` ler a constante do core, o que exige `packages/client` depender de `core` — decisão de topologia de pacotes, fora das Decisions desta spec. **Follow-up registrado.**
- **O7 (observação, NÃO virou Task).** A varredura por CLASSE não reproduz o sufixo multi-método de `buildOperationId` (uma classe não expõe `method`). É a mesma limitação que o `operationIdOf` do manifesto documentava, e o `it` `every operationId the scan derives really exists in the spec` (T6) a transforma em teste vermelho se um controller com scope ganhar um segundo método. Nenhum controller exposto tem mais de um hoje.
- **O8 (observação, NÃO virou Task).** `AgentIdentityService` fica bindado em `shared/registry.ts` e não em `agent/registry.ts` — não por pertencer ao `shared`, mas porque `Controller.executeMiddlewares` resolve pelo container RAIZ e um binding em container-filho resolveria em produção e explodiria em qualquer suíte que exercitasse um controller direto. Mesma prateleira de `CommandQueue` e `IdempotencyGuard`.
- **Follow-up de CLI (regra da casa "if you wrote it, the CLI should write it").** Descoberto escrevendo este plano: `bun cli controller` não emite `static mcpScopes`, e não tem flag para isso. Como a ausência do static É a exposição zero (o default seguro), a falta não é um bug — mas um `--mcp-scope=<scope>` que emitisse o static com o import do enum pouparia o próximo. Abrir antes do PR do B2 fechar.
- **Nenhuma Task deste plano toca `.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md` nem o stash** (`stash@{0}: lint-staged automatic backup`, presente em HEAD). Se algum gate reclamar de qualquer um dos dois, **PARE e reporte**.

### O que o `bun scripts/review-plan.ts` achou, e o veredito de cada achado

24 arquivos virtuais extraídos, **4 classificados e revisados** (`AgentIdentityService.ts`, `InMemoryAgentIdentityService.ts`, `AgentIdentityMiddleware.ts`, `ForkIssue.ts`), **14 não classificados** e 6 pulados (barris + `*.test.ts`). **Nenhum defeito real** — os 16 findings são todos falsos positivos, e cada um tem uma razão nomeada.

**Falsos positivos por SNIPPET PARCIAL** — a limitação documentada do próprio `review-plan.ts` (blocos alvo de `Modify`/`Create` são materializados isolados; checagens que exigem o arquivo vizinho não têm o que ler):

- **`SVC-02` / `SVC-P02` (critical/high) — "sem barrel"**. O barrel É deste plano: Step **T2.4**, `core/src/services/AgentIdentityService/index.ts`, re-exportando os dois. O revisor só recebeu o arquivo do abstract.
- **`SVCI-02` / `SVC-P03` / `SVC-P12` (critical) — "sem binding no registry"**. O binding É deste plano: Step **T4.6**, `src/shared/registry.ts`, nos três envs. `SVC-P12` reclama adicionalmente do caminho (`.review-plan-tmp/core/src/` em vez de `packages/api/typescript/src/`) — é o diretório temporário do próprio revisor.
- **`CTRL-P03` / `CTRL-P04` / `CTRL-P05` (critical/moderate) — "OutputSchema não mostrado"**. `ForkIssueControllerOutputSchema` existe em HEAD (`ForkIssue.ts:51-53`, derivado de `ForkIssueOutputSchema` com `.example()`) e **esta frente não o toca** — o bloco proposto no T7.3 é só o `ctx`/`middlewares`/`handle`.
- **`bp-06` / `bp-07` (critical) — "contexto não registrado no router" / "controller fora do barril"**. Não verificáveis de um snippet, e ambos já satisfeitos em HEAD: `agent` está em `ROUTERS` (`src/routers.ts:38`) e `ForkIssueController` no barril (garantido por WIRE-03, `wiring-completeness.test.ts`).

**Falsos positivos por REGRA DESATUALIZADA para este repo** (a skill descreve o template pré-colapso de auth / pré-core-services):

- **`CTRL-P01` (critical) — "`ctx` deve aninhar `session: { ownerId }`"**. Não neste repo: o colapso de auth deixou `OperatorMiddleware` estampando `ctx.ownerId` FLAT (`src/auth/middlewares/OperatorMiddleware.ts:18-22`), e **todos** os ~20 controllers de HEAD declaram `ctx: z.object({ ownerId: z.uuid() })`. Adotar a forma da regra exigiria reescrever o middleware de auth do produto inteiro para satisfazer um plano de MCP.
- **`CTRL-P16` (critical) — "acrescente `RequireOwner`"**. `RequireOwner` **não existe mais**: o docstring de `OperatorMiddleware` (`:6-8`) diz literalmente que ele "substitui AuthAccountMiddleware (session lookup) E RequireOwner (tenancy gate) depois do colapso de auth". A regra cita um artefato purgado.
- **`SVC-C03` / `SVC-P06` / `SVC-P11` (critical/high) — "falta um `MockAgentIdentityService`"**. **Deliberado, e é herança de HEAD com razão escrita.** `RunTokenService` é bindado a `InMemoryRunTokenService` nos TRÊS envs, e `agent/registry.ts:98-101` explica por quê: *"Bound in all three envs because the integration and mock suites exercise the router's 401/403 boundary directly, and a double would be a second implementation of the thing under test."* O serviço É in-memory por natureza (o token vive um run dentro de um daemon); um mock seria uma segunda cópia da mesma lógica trivial. O plano preserva a decisão e a repete no comentário do binding (T4.6).
- **`MID-03` (critical) — "parseie `request.ctx` com Zod antes de ler"**. O middleware **não lê** `ctx` — ele ESCREVE (`request.ctx = { ...request.ctx, agentIdentity: identity }`). Quem valida `ctx` é o `inputSchema` do controller, uma camada adiante, e é exatamente por isso que o T7.2 declara `AgentRunIdentityCtxSchema` (senão o Zod descarta a chave). A forma proposta é, byte a byte, a de `OperatorMiddleware:18-22` e a de `RateLimitMiddleware` — convenção viva, não desvio.

**14 arquivos NÃO CLASSIFICADOS — e isto é um achado do repo, não deste plano.** `core/src/types/{AgentIdentity,McpAdapter,Controller}.ts`, `core/src/utils/{McpExposure,OpenAPI}.ts`, `src/agent/types/{Agent,AgentRunIdentity}.ts` e `src/agent/mcp/{manifest,exposure,router,door}.ts` não casam com nenhuma `CLASSIFICATION_RULES` de `scripts/review.ts` — o guard de silent-drop do próprio script avisa isso em voz alta (*"this is exactly how jobs/ was silently dropped"*). Ou seja: **o core inteiro e a pasta `mcp/` são pontos cegos do `bun review`**, e os artefatos mais carregados desta frente caem neles. Registrado como observação **O9**; corrigir exige entradas novas em `.claude/registry.yaml` para `core/src/{types,utils}/**` e para `<ctx>/mcp/**`, que é decisão de escopo da ferramenta de review — **fora das Decisions desta spec**, e é por isso que o T9.5 manda VERIFICAR e registrar o resultado em vez de assumir que nada muda.
