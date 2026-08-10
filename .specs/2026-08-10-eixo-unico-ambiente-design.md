# O Eixo Único de Ambiente — boot herdado, registry declarativo, morte dos eixos paralelos — Design Spec

**Date:** 2026-08-10
**Status:** Approved
**Bounded Context:** cross-context: shared (composition root), core, agent, auth + tests/support (api-typescript) + tests/support (app-react) + packages/e2e
**Kind:** chore
**Story Points:** 13 — refatoração do composition root de produção + coluna nova no eixo de ambiente atravessando ~10 registries + codegen novo com gate + sweep mecânico de 41 arquivos. *Pode ser dividida?* Sim (a onda de higiene é separável), mas tudo converge nos mesmos arquivos (`shared/registry.ts`, boot) — duas specs conflitariam na mesma região; uma spec com plano em ondas é mais barata.

## Context

A consolidação de testes de frontend (`.specs/2026-08-10-consolidacao-teste-frontend-design.md`, entregue nesta mesma data) criou o harness de integração: o console testa contra o backend real em-processo. A correção do founder durante aquela build ("herdar, não redeclarar") extraiu `assembleMainRouter` para `packages/api/typescript/src/server.ts` — mas a herança parou aí. O `tests/support/integration-server.ts` ainda re-implementa a coreografia de boot inteira, e seus próprios docblocks (notas 1–5) confessam cada desvio: migra à mão contra o driver de `integration` porque `migrateEmbeddedDatabase()` (em `src/shared/registry.ts`) mira o driver `real` fixo; registra `FastifyHttpRouter` à mão porque o registry declara `HttpRouter: { integration: null }`; replica a ordem migra→importa→monta porque `src/index.ts` é script com side-effects de import (`./boot`, watchdog, `start().catch()` no fim do arquivo), não função chamável.

Ao redor do boot, a mesma doença em outras formas. `CODM_E2E` é um eixo de ambiente paralelo disfarçado de boolean: 6 sites de `if (process.env.CODM_E2E === 'true')` trocam binding de mediator, factory de agent runner (`FixedAgentRunnerFactory` em `agent/registry.ts`), e montam 2 controllers de teste (`TestIngressController`, `TestRunIssueTurnController` em `agent/index.ts`). `getRealDatabaseDriver()` mantém singletons de escopo de módulo com `new LibsqlDriver({...})` à mão em vez de deixar o container ser dono do ciclo de vida (`LibsqlDriver extends DrizzleDatabaseDriver`, confirmado em `core/src/db/drivers/LibsqlDriver.ts:138`). O registry usa `useFactory` para projeções de propriedade (`DrizzleClient` → `.db`, 41 consumidores; `UnitOfWorkFactory` → 2 consumidores) e para o fallback de logging (`createLoggingServiceFactory`). Há 17 sites de `process.env.` cru em `src/` fora do Config — um comentário em `FileCloudSession.ts:66` confessa a dívida. `DataDirLockedError` é classe bespoke apesar de `BaseInfrastructureErrors` existir em `core/src/errors/codes.ts`.

No lado do consumo: o subpath `/testing` exporta 2 dos 16 givens (linha 177 do integration-server), sendo um deles a facade `@deprecated` (`createGivenHelpers`, TST-18); o harness do react declara `IntegrationTestingModule` à mão com `Promise<unknown>` — redeclaração paralela enfraquecida, sem gate. E o `configureClient` do harness aponta a URL do Go para o servidor TS: qualquer endpoint do gateway responde 404 silencioso — foi isso (não falta de given) que deixou 3 componentes só-visuais nas migrações T9–T11.

## Problem

1. **O boot existe duas vezes.** `src/index.ts` (produção) e `tests/support/integration-server.ts` (harness) re-implementam a mesma coreografia com desvios documentados um a um — cada mudança de boot precisa ser feita e conferida em dois lugares, e os desvios já divergem (o harness não sobe o MailboxDispatcher; o drain de produção e o `stop()` do harness são sequências irmãs mantidas à parte).
2. **Eixos de ambiente paralelos.** `CODM_E2E` (6 ifs), `EMIT_OPENAPI` (carve-outs em módulo), e seleção de driver por função ad-hoc coexistem com o eixo declarado `mock/integration/real` — violação direta do Non-Negotiable 5 (edge case legítimo vira campo declarado, nunca desvio de fluxo).
3. **Registry imperativo onde deveria ser declarativo.** Singletons de módulo, `useFactory` para projeção de propriedade, factory de logging com fallback — fiação à mão que o container resolveria por declaração.
4. **A superfície de teste exportada é magra e mal tipada.** 2/16 givens; tipos `Promise<unknown>` redeclarados à mão no react; consumidor recebe `unknown` e não navega o retorno sem cast.
5. **A fronteira do Go mente.** URL do Go → servidor TS → 404 que parece bug do teste.
6. **17 `process.env.` crus** fora do Config tipado; `DataDirLockedError` fora da taxonomia de erros.

## Goal

Um único eixo de ambiente declarado (`mock/integration/real/e2e`) e uma única função de boot (`start({env, port})`) herdada por todos os consumidores — produção, harness de teste do console, e2e. O registry vira declaração pura (classes e colunas; `useFactory` só onde agregação exige). A superfície `/testing` exporta o catálogo completo de givens com tipos derivados da fonte (nunca redeclarados), e a fronteira do Go falha alto com erro legível. Depois desta spec: mudar o boot é mudar um lugar; adicionar comportamento por ambiente é preencher uma coluna; nenhum `if` de flag de ambiente sobrevive fora do lookup.

## Decisions

1. **`start(options: { env: BoundedContextEnvironment; port?: number }): Promise<RunningServer>`** vive em `src/server.ts`, com `RunningServer = { url, container, stop() }`. Corpo: `setBoundedContextEnvironment(env)` (seletor da T2, já existe) → migração (D3) → `await import('./routers')` → filtro de cloud-profile → `openapi.generateSpecification` (carve-out `EMIT_OPENAPI` intacto, é comportamento de boot) → `assembleMainRouter` → `.start(port)` → MailboxDispatcher (guard de cloud-profile; o harness passa a herdá-lo — seguro sob `integration`, que vincula `StubAgentRunnerFactory`).
2. **Uma única sequência de drain.** `stop()` devolvido por `start()` = o `shutdown()` de produção sem `process.exit` (http → agent runs → mailbox → outbox → mediators → db). `index.ts` chama `stop()` e dá exit; o harness chama `stop()` e segue vivo.
3. **Migração por resolve, driver como classe declarada.** `start()` migra via `container.resolve(DrizzleDatabaseDriver).runMigrations()`. `migrateEmbeddedDatabase()` e `getRealDatabaseDriver()` (com seus singletons de módulo) morrem. O driver `real` vira classe declarada no registry — `FileLibsqlDriver extends LibsqlDriver` cujo construtor chama `super({ schema, migrationsDir, dbPath: <de Config> })` — singleton do **container**. O carve-out `EMIT_OPENAPI` (driver inerte) vira decisão declarada no mesmo lugar, não if de módulo.
4. **O registry declara o transporte.** `HttpRouter: { integration: FastifyHttpRouter, e2e: FastifyHttpRouter }` (era `null` + bind manual no harness). Suítes de TestBed nunca resolvem o token; binding lazy, custo zero.
5. **`index.ts` vira casca de processo** (~40 linhas): import de `./boot` (lock de data-dir), sinais, watchdog, telemetria, `start({ env: Config.env.CODM_ENV }).catch(exit)`. **`/testing` vira casca de teste**: cache por processo + `start({ env: 'integration', port: 0 })` + `configureClient` + `reset()`/`asTestBed()`. `integration-server.ts` como inicialização separada **morre**.
6. **O eixo ganha a coluna `e2e`; `CODM_E2E` morre.** Coluna omitida espelha `integration` (precedente: "integration omitida espelha real" já existe no kernel do registry). Só quem diverge declara: `FixedAgentRunnerFactory`, montagem de `TestIngressController`/`TestRunIssueTurnController`, data dir de arquivo. Os 6 `if (process.env.CODM_E2E)` viram lookups/colunas. Mapeamento 1:1 com o comportamento atual do CODM_E2E — o e2e não muda de semântica, muda de mecanismo.
7. **Seleção de ambiente por processo via Config tipado.** `EnvSchema` ganha `CODM_ENV: 'real' | 'e2e'` (default `real`) — `index.ts` repassa ao `start()`. `mock`/`integration` continuam seleção programática (TestBed/harness), nunca por env var. A recusa "não-real sob NODE_ENV=production" (falsificador da T2) cobre `e2e` também; a guarda do `boot.ts` colapsa nela.
8. **Givens: catálogo completo, superfície coerente.** `/testing` exporta os 15 `givenX` soltos + `GIVEN_MENTION_TAG`. A facade `@deprecated createGivenHelpers` sai da superfície pública; os call sites do react migram para os soltos.
9. **Tipos derivados, não declarados.** Um `.d.ts` achatado e commitado da superfície `/testing` (aliases resolvidos, zero imports), gerado por script com **gate de frescor** byte-a-byte — precedente `db:sync-go`/`db:check-go`. A `IntegrationTestingModule` (`Promise<unknown>`) do react morre. Spike decide a ferramenta (dts-bundle-generator primeiro); se engasgar nos decorators, fallback registrado: gate de assignabilidade (`satisfies` no backend) — redeclaração gateada, nunca solta.
10. **A fronteira do Go falha alto.** O harness deixa de apontar a URL do Go para o servidor TS: aponta para um stub que responde erro legível ("gateway não participa do harness — comportamento gateway-owned é visual-only ou e2e"). O harness Go real (eixo de ambiente no fx + subprocesso sobre o mesmo SQLite) fica como spec futura; os 3 componentes só-visuais são o caso de negócio.
11. **`useFactory` só onde agregação exige.** `UnitOfWorkFactory` (2 consumidores) morre — consumidores injetam o driver. `DrizzleClient` (41 consumidores) morre por sweep mecânico guiado por tsc — repositórios injetam `DrizzleDatabaseDriver` e leem `.db`. Exceção única sancionada: `HealthService` (agregação via `resolveAll`, documentada no registry).
12. **`DataDirLockedError` → `DATA_DIR_LOCKED`** em `BaseInfrastructureErrors`; a classe bespoke morre.
13. **Logging vira classe única declarada.** Uma `LoggingService` cujo construtor lê o Config e delega — OTLP quando `OTEL_COLLECTOR_LOG_URL` presente, console senão. `createLoggingServiceFactory` e o binding por factory morrem.
14. **`process.env.` proibido fora do módulo Config.** Os 17 sites migram para `Config.env` tipado (`CODM_PROFILE`, `EMIT_OPENAPI` entram no `EnvSchema`); rail novo em `tests/architecture/` com fixture negativa proíbe regressão.

## User Stories

- **Story 1:** Como desenvolvedor mudando o boot do backend, quero mudar UM lugar, para que produção, harness e e2e nunca divirjam.
  - Given `start()` em `server.ts`, when adiciono um passo de boot, then produção, harness do console e e2e o herdam sem edição adicional (AC-1).
- **Story 2:** Como desenvolvedor escrevendo teste de console, quero semear qualquer agregado com tipos reais, para asseverar sem cast.
  - Given o `/testing` com catálogo completo tipado por `.d.ts` derivado, when chamo `givenIssue(backend.asTestBed(), {...})`, then o retorno é navegável tipado e o tsc do react não desce no grafo do backend (AC-5).
- **Story 3:** Como desenvolvedor cujo teste toca endpoint do gateway Go, quero um erro que diga a verdade, para não caçar um 404 fantasma.
  - Given o stub da fronteira, when a SDK chama endpoint do Go no harness, then a falha nomeia a fronteira e aponta visual-only/e2e (AC-6).
- **Story 4:** Como operador do template, quero comportamento por ambiente declarado em colunas, para que um fork adicione ambiente preenchendo o registry, nunca caçando ifs.
  - Given a coluna `e2e`, when o Playwright sobe o backend com `CODM_ENV=e2e`, then os bindings/controllers de e2e montam por lookup e `grep CODM_E2E` no repo retorna zero (AC-2, AC-3).

## Acceptance Criteria

- [ ] AC-1: `start({env, port})` é a única coreografia de boot — `tests/support/integration-server.ts` deletado; `src/index.ts` sem migração/importação/montagem próprias (só casca de processo); harness e produção chamam a mesma função.
- [ ] AC-2: `CODM_E2E` não existe no repo (grep = 0 fora de `.specs`/`.plans`); e2e roda com `CODM_ENV=e2e` e a suíte e2e permanece verde sem mudança de asserção.
- [ ] AC-3: `shared/registry.ts` sem `useFactory` exceto `HealthService`; sem singletons de módulo para drivers; `HttpRouter` com colunas `integration`/`e2e` declaradas.
- [ ] AC-4: zero `process.env.` em `packages/api/typescript/src/` fora do módulo Config — rail em `tests/architecture/` com fixture negativa (falseado: adicionar um site cru → rail vermelho).
- [ ] AC-5: `/testing` exporta os 15 givens soltos + `GIVEN_MENTION_TAG` (sem a facade deprecated); o react não declara nenhum tipo do harness à mão; o `.d.ts` commitado tem gate de frescor (falseado: mudar assinatura de um given sem regenerar → gate vermelho).
- [ ] AC-6: chamada SDK a endpoint do Go dentro do harness falha com erro legível que nomeia a fronteira (teste dedicado).
- [ ] AC-7: `DataDirLockedError` não existe; boot com data dir travado lança `BaseError` com `DATA_DIR_LOCKED`; teste existente do lock ajustado e verde.
- [ ] AC-8: `UnitOfWorkFactory` e `DrizzleClient` não existem como tokens; 41+2 consumidores injetam o driver; `bun tsc` 0.
- [ ] AC-9: bateria completa verde — `bun tsc`, `bun lint`, api 1366+, react 257+, tooling, e2e — com tempos de boot do harness registrados antes×depois (o delta do MailboxDispatcher + openapi medido).

## Risks & Migration

- **Boot de produção é caminho crítico.** O e2e (que sobe via `index.ts`) é o gate de não-regressão; a Validação Final o exige verde. O desktop shell (Tauri) também consome este boot — smoke manual do shell antes de fechar a frente.
- **Coluna `e2e` mapeia 1:1 o CODM_E2E atual** — qualquer divergência de comportamento do e2e é defeito, não melhoria. O plano deve listar os 6 sites e seu destino um a um.
- **Sweep dos 41 consumidores de `DrizzleClient`** é mecânico e guiado por tsc, mas infla o diff — onda própria, commit próprio.
- **Boot do harness fica mais gordo** (MailboxDispatcher + openapi generation herdados): medir; se degradar visivelmente (>2s), a decisão de carve-out volta ao founder com números.
- **Spike do `.d.ts`**: ferramenta pode engasgar em decorators — fallback (gate de assignabilidade) já decidido, sem bloqueio.
- Convenção de commits da frente anterior: ondas coesas, tooling portável separado de aplicações.

## Open Questions

- Nenhuma bloqueante. Ferramenta do `.d.ts` e mecanismo exato de montagem de controllers por coluna (`agent/index.ts` hoje monta por spread condicional) são decisões de plano com os arquivos abertos.
