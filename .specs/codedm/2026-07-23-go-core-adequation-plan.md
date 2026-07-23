# Plano de execução — Core Adequation (codedm `api-go` → módulo `template/core-go`)

> Produzido por workflow de scoping read-only (wf_7c912361-095, 2026-07-23): 4 classificadores
> (shared-infra 113 arquivos, pkg-and-cmd 16, domain-shims 9, module-wiring) + síntese.
> Princípio reitor: mover ≠ convergir. Supersede deliberadamente a sanção #3 do audit de
> conformidade (layout sem split core/); preserva todas as demais sanções.

Sintetizado das 4 classificações de área (shared-infra 113 arquivos, pkg-and-cmd 16, domain-shims 9, module-wiring). Princípio reitor que resolve os conflitos entre áreas: **mover ≠ convergir**. Quase todo arquivo do kernel pode ser *movido fisicamente* para `packages/api/go/core/` com o conteúdo atual do codedm (import-swap); a *convergência semântica* com o conteúdo do template fica gateada por fase (union-slots, flat-events, schema-handoff, tenancy, pairing). Nenhum passo abaixo contradiz as sanções do audit `/Users/work/Desktop/Projetos/pessoal/codedm/.specs/codedm/2026-07-22-go-template-conformity-audit.md` — a sanção #3 (layout sem split core/) é **deliberadamente aposentada** por este plano (supersessão, não contradição); todas as demais (#4, #8, #9, #12–#18) são preservadas explicitamente nos lotes.

---

## 1. Receita de materialização do módulo `core-go` no codedm

Espelho exato do template: `/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/api/go/core/` é o módulo `template/core-go` (package `shared` na raiz), consumido pelo api-go via `replace` — **sem go.work** (o template prova que replace-only funciona, inclusive o load cross-module `NeedDeps` do walker; gitignorar qualquer go.work local).

1. **Criar `packages/api/go/core/go.mod`**: `module template/core-go`, `go 1.25.0`. Requires diretos: `validator/v10`, `golang-migrate/v4`, `uuid`, `pgx/v5`, `godotenv`, `go-redis/v9`, `fx`, `golang.org/x/tools`. **Omitir** a tool line orchestrion + árvore DataDog do template (Lote G do audit as mata) e `client-go`/`tsclient` (codedm não tem cliente Go→TS; quando adicionar, o `replace` será `../../../client/dist/go` — o nome `template/client-go` em `packages/client/dist/go/go.mod` já bate, **zero renames de módulo**: ambos os repos compartilham `goModulePrefix: 'template'` — codedm `template.config.ts:33` = template `template.config.ts:28`; `template/contracts-go` em `packages/contracts/generated/go/go.mod` idem).
2. **`git mv` por lotes** (seção 2) dos arquivos de `internal/shared/**` e `pkg/**` para `core/{config,db,entities,enums,errors,middleware,objects,repositories,services,types,pkg}` espelhando o layout do template; sed de imports `template/api-go/internal/shared/X → template/core-go/X` e `template/api-go/pkg/X → template/core-go/pkg/X` (~300 arquivos consumidores).
3. **Ficam para trás** (não entram no core): `internal/shared/controllers/listen_events.go`, `internal/shared/enums/platform.go` (→ `internal/channel/enums`, senão cai fora do scan de wire-enums), `internal/shared/events/*.go` (19 envelopes + `channel_event.go`), `internal/shared/middleware/{session,apikey}.go`, `internal/shared/repositories/pg_domain_event_repository_batch_test.go` (importa `internal/channel` — inversão de dependência; vira external test em api-go), `pkg/openapi/openapi_test.go` (o `findModuleRoot` na linha 20 resolve o go.mod mais próximo — dentro de core andaria por `core/internal` inexistente → spec vazio), `cmd/*`, `public/*`.
4. **`packages/api/go/go.mod`**: adicionar `require template/core-go v0.0.0` + `replace template/core-go => ./core`; manter require/replace de contracts-go. `go mod tidy` **primeiro em `core/`** (cria `core/go.sum`), depois no api-go (godotenv/migrate/redis/x-tools viram indirect; whatsmeow/tint/testify seguem diretos).
5. **`packages/api/go/project.json` — corrigir no MESMO commit do primeiro mv**: `go X ./...` **pula módulos aninhados** — todo teste movido para core/ desaparece do CI com verde silencioso. O template tem exatamente esse blind spot (sem project.json do core, sem go.work, sem script cobridor — verificado). Fix: todos os targets viram `go X ./... && go -C core X ./...`; os cache inputs `{projectRoot}/**/*.go` já cobrem core.
6. **Novo módulo fx api-go-local** (ex. `internal/app/module.go`): provide do `ListenEventsController` em `group:"controllers"`, `registerDocsRoutes(public.OpenAPIJSON)`, `registerSPA(public.AppFS)`, `Session(db)+APIKey` globais (sanção #18; template `core/module.go:84-85`: "auth middlewares são decisão de domínio"). `cmd/api/main.go` compõe `shared.Module` (core, importado como `shared "template/core-go"` — padrão do template `cmd/api/main.go:14`) + app module + `channel.Module` + `fx.Invoke(shared.StartHTTPServer)`.

**Ordem interna obrigatória**: go.mod+project.json → pacotes folha (types/errors/enums/objects/entities) → middleware/repositories/services → db+config → módulo fx → pkg/openapi (só pós union-slots).

**Gate de baseline (Lote 0, antes de qualquer mv)**: `go build ./... && go vet ./... && go test ./...` verdes no HEAD; `bun emit-openapi` e snapshot de `public/docs/openapi.json` (38 ops) como golden de referência; confirmação do estado do workflow union-slots em voo (últimos commits `de61a7d7`/`392eb9d8` tocaram `pkg/openapi/` há horas) e **freeze acordado sobre `pkg/openapi/`** enquanto os lotes 1–6 rodam.

---

## 2. Lotes de import-swap por risco crescente (cada lote = commit coeso; gate padrão: `go build ./... && go vet ./... && go test ./... && go -C core build ./... && go -C core vet ./... && go -C core test ./...`)

**Lote 1 — Fundação do módulo + folhas BYTE-IDENTICAL (risco mínimo).** `core/go.mod` + replace + project.json fix + mv de: `types/{controller,events,handler,middleware}.go` (`types/events.go` 179 linhas idênticas — os generics do envelope `IntegrationEvent[P]` já batem; o blocker flat-events vive em `emit-wire-go.ts`, não aqui), `errors/{app_error,mapper}.go` (inclui seam `RegisterErrorCodes`), `enums/{environment,log_level}.go` (**platform.go NÃO vai** — vai para `internal/channel/enums` neste lote), `objects/value_object.go`, `entities/base_entity.go` (puro import-swap; depende de `core-go/types` que entra junto). Também movem com conteúdo-codedm intacto (catch-up é commit separado, seção 3): `errors/codes.go`, `objects/id.go`, `types/accumulator.go`.

**Lote 2 — Camada de serviço BYTE-IDENTICAL.** `middleware/{cors,logging,recovery}.go`, `repositories/{domain_event_repository,optimistic_lock}.go`, `services/mediator/{internal_mediator,log_mediator,mediator,memory_mediator}.go`, `services/unitofwork/{noop_unit_of_work,pg_unit_of_work,unit_of_work}.go` (os 3 arquivos de UoW são byte-idênticos e trocam livremente — o entanglement schema-handoff do audit é de **wiring** — Noop UoW em produção em `internal/shared/module.go:32` — não de conteúdo), `repositories/testmain_test.go` (mantendo gate `CHANNEL_TEST_DATABASE_URL`, sanção #14).

**Lote 3 — DB + config (risco médio; conteúdo entangled move como-está).** `db/dbutil/{convert,migrationlock}.go`, `db/sql/{client,embedded,embedded_test,migrate}.go` **+ as 36 migrations `db/sql/migrations/001…018_*.sql`** (viajam JUNTO — `//go:embed migrations/*.sql` exige; sanção #13), `config/{config,config_test}.go` (flavor codedm: `CHANNEL_*` sanção #17, campos whatsmeow, `ServiceName`→search_path sanção #12). Também movem como-estão (convergência gateada): `repositories/pg_domain_event_repository.go`, `services/outbox/outbox_dispatcher.go`, `services/mediator/redis_mediator.go`. Gates extras: `cmd/migrate` ainda roda (import-swap para `core-go/db/sql`); testes embedded gateados por env passam; `pg_domain_event_repository_batch_test.go` re-alocado como external test em api-go compilando.

**Lote 4 — pkg/ seguro.** `pkg/httputil/{request,response}.go` (import-swap only), `pkg/validation/validation.go`. **`pkg/openapi/` NÃO entra** — pacote único (arquivos se referenciam intra-package, granularidade é o pacote inteiro) e concorrentemente owned pelo union-slots em voo. `cmd/openapi/main.go` continua importando `template/api-go/pkg/openapi` até o Lote 7.

**Lote 5 — httprouter.** `services/httprouter/http_router.go` move como-está (sem `{version}` — convergência é pairing); `RegisterSPA` é extensão codedm (mecanismo sanção #4) que o core do template não tem — sobrevive no arquivo movido, com nota de que na convergência pairing vira extensão api-go-local.

**Lote 6 — Split do módulo fx (maior risco pré-openapi).** `internal/shared/module.go` (124 difflines vs `core/module.go`) é DIVIDIDO: provides genéricos + `registerControllers` + `StartHTTPServer` (**mantendo o CORS wrap do codedm — o template não tem**) → `core/module.go`; SSE `ListenEventsController` + `registerDocsRoutes` + `registerSPA` + Session/APIKey globais → `internal/app/module.go`. `cmd/api/main.go` re-composto. Gates extras: boot real do serviço; smoke de request autenticada (Session/APIKey ativos) e preflight CORS; ordem de middlewares preservada.

**Lote 7 — pkg/openapi (SÓ após union-slots mergear; ver seção 4).** mv do pacote inteiro (`metadata,errors,controllers,walker,emit,enums,unions,schema,events`.go) para `core/pkg/openapi` + `events.go`/registro SSE mantidos via seam (sanção #15/#16); catch-ups obrigatórios do walker no mesmo commit: chave byPath `walker.go:148` `"template/api-go/internal/shared/types"` → `modulePrefix+"/core-go/types"` (template `walker.go:199`) senão a descoberta de Controllers falha → **spec vazio → wipe da SDK de 38 ops**; tier-1 do `enums.go` ganha prefixo `core-go/`; filtro do `unions.go` mantém `template/api-go/` + `template/contracts-go/` + adiciona `core-go/`; `openapi_test.go` vira external test em api-go (`package openapi_test` importando só API exportada) com goldens re-baselined **no mesmo commit**. Gate extra: `bun emit-openapi` + diff byte-a-byte de `public/docs/openapi.json` contra o snapshot do Lote 0 (38 ops, `ServerEvent` oneOf presente, `x-enum-varnames` intactos) + `cd packages/client && bun run build` (kubb) verde.

---

## 3. DRIFTED-MECHANICAL — diff-plan por arquivo (commits de catch-up separados dos mv)

| Arquivo (pós-move em `core/`) | Diff-plan |
|---|---|
| `errors/codes.go` | Adotar versão template (comentários + reorder de `CodeInvalidEntity/CodeBusinessRule/CodeInvalidID` no const block e init map); set de códigos e statuses idênticos pós-purge Lote G; zero impacto wire. Delete-and-adopt. |
| `objects/id.go` | Catch-up aditivo: `idNamespace` (UUIDv5 `f63cfbe6-…` lockado) + `IDFromSeed(parts...)` + `id_test.go` do template (chega de graça). **PRÉ-CONDIÇÃO**: verificar que o `Id.ts` do `@codedm/core-typescript` carrega o `BK_DASH_NAMESPACE` byte-idêntico ANTES do commit, senão entidades já ingeridas orfanam na fronteira poliglota. |
| `types/accumulator.go` | Template removeu retorno de erro de `Saver.Save`; grep mostra ZERO consumidores de `Accumulator` fora de shared/types no codedm (checar sync whatsmeow por via das dúvidas) → adopt trivial. |
| `pkg/validation/validation.go` | Adotar template verbatim: seam aditivo `RegisterValidation(tag, fn)` (linhas 11-16). |
| `db/sql/client.go` | 1 linha `cfg.ServiceName` vs `cfg.OtelServiceName`. **Manter codedm** (search_path via config = sanção #12); rename de campo só se/quando config convergir no pairing. |
| `db/sql/embedded_test.go` | Codedm é ESTRITAMENTE MELHOR (schema drop-on-exit, serialização via `dbutil.LockMigrations`, gate sanção #14) — **não reverter; candidato a upstream para o template**. |
| `repositories/testmain_test.go` | Manter gate `CHANNEL_TEST_DATABASE_URL` (sanção #14) — keep-local-patch, não revert. |
| `config/config.go` + `config_test.go` | Aplicar subset Lote B do audit já desbloqueado (env fallbacks, port 3032, `CODEDM_GATEWAY_WHATSMEOW_URL` morto, path do `.env`; `config_test.go:9-40` re-baseline). Campo `Version` e extração dos campos gateway-only (`WhatsmeowDatabaseURL`, `WhatsmeowLogLevel`, `GlobalAPIKey`) para um extension type api-go-local: **pairing** (seção 4). |
| `pkg/openapi/errors.go` (Lote 7) | Família de markers diverge wholesale (`x-unknown`/`x-enum-varnames`/`x-discriminators` vs `x-tpl-*`). shared-infra diz que nada consome (só `x-tpl-sse`, idêntico); module-wiring diz wire-visible p/ kubb. Decisão conservadora: **manter markers codedm agora**; a decisão de sed atômico (um passe + um golden re-baseline) fica DEPOIS do union-slots parar de reescrever esses arquivos, validada por diff do output kubb. |
| `pkg/openapi/controllers.go` (Lote 7) | Catch-up `responses["default"]` → `"4XX"` (progenitor 0.10 panics com `default`+204, template:109-112) — SDK-visível, re-baseline goldens no mesmo commit; comentário `buildFullPath` é doc-only (ambos dropam o prefixo no spec) — verificar contra o HttpRouter do codedm antes. |
| `pkg/openapi/walker.go` (Lote 7, obrigatório no mv) | Catch-ups já ordenados como Lote H do audit: const `modulePrefix` espelhando `template.config.ts goModulePrefix` (template walker.go:16-38), `ownsSchemaSource` (exclui `client-go` gerado do scan de enums), tolerância a `internal/` vazio (template:59-71,122-131), chave byPath :148 → `core-go/types`. Resíduo codedm: filtro hardcoded `template/api-go/` em walker.go:109-111. |
| `pkg/openapi/emit.go` (Lote 7, subset) | Só o mecânico agora: sed de title/description (`emit.go:1,107-108`, Lote A.9). `registerEvents` vs `registerOneofUnions`: ENTANGLED union-slots (seção 4). |
| `cmd/openapi/main.go` | Import-swap para `template/core-go/pkg/openapi` (espelha template `cmd/emit-openapi/main.go:21`). **NÃO renomear** para `cmd/emit-openapi` — nome + `public/docs/openapi.json` + CLI por flags = sanção #16 (BUILD-LOG a3f4df53). |
| `internal/shared/module.go` | Split (Lote 6) — o diff de 124 linhas é resolvido pela divisão core/app, não por sed. |

---

## 4. ENTANGLED por fase — com o gate exato que destrava

### union-slots (EM VOO — commits `de61a7d7` 2026-07-23 00:02 e `392eb9d8` 00:43 tocaram `pkg/openapi/` nas últimas horas)
**Gate**: merge do workflow union-slots (scanner two-tier estável + goldens `openapi_test.go` re-baselined pelo judge) + decisão do seam de registro de eventos (hook no core vs extensão api-go).
- `pkg/openapi/enums.go` — registry two-tier first-wins (api-go tier vence contracts-go; preserva aliases `type X = wire.X`, spec §2.2; golden pina precedência em `openapi_test.go:152`). Codedm está À FRENTE do template — swap cego para o `ownsSchemaSource` single-pass do core regride semântica de colisão **sem erro de compilação**. Edit no swap: tier-1 cobre também `core-go/`.
- `pkg/openapi/unions.go` — filtro do scanner: codedm `unions.go:38-41` scaneia `template/api-go/` + `template/contracts-go/` (structs wire estampadas; nota: a alegação do audit linha 115 de que contracts-go é excluído está STALE — código atual inclui); template só `modulePrefix+"/core-go/"`. Mutuamente incompatíveis hoje; o filtro É o seam union-slots.
- `pkg/openapi/schema.go` — `types.Unalias` (schema.go:216-217, bindings union-slots) + strip re-entrante de `type:["X","null"]` 3.1 (schema.go:337-358, superset que o template não tem) + `x-union-variant-missing`. Swap para template perde comportamento requerido.
- `pkg/openapi/emit.go` — `registerEvents` (SSE `ServerEvent` oneOf, sanção #15) vs `registerOneofUnions` do template. Swap ingênuo deleta a superfície SSE da SDK do gateway; requer extension seam desenhado no core-go.
- `pkg/openapi/events.go` — sem counterpart (template tem `oneof.go`/`oneof_test.go`, feature distinta que chega de graça na adoção). Destino (extensão api-go registrada num hook do core) decidido por union-slots/flat-events.
- `pkg/openapi/openapi_test.go` — goldens re-baselined pelo judge há 43 min (iteração 1, +28 linhas); audit §5: quebram no primeiro passe de harmonização se não re-baselined no mesmo commit. Maior probabilidade de colisão com o workflow em voo. Fica em api-go (findModuleRoot).
- `internal/shared/controllers/listen_events.go` — `listen_events.go:49-131` (`EventPayloads`) + `:162` — o gap-analysis diz que isto É a implementação union-slots; `:168` `http.Error` cru = fix Lote C. Estruturalmente api-go (importa `internal/channel`).
- `internal/{shared→channel}/enums/platform.go` — `Platform` → `ChannelKind` é o rename do discriminador da union (`platform.go:1-16`; `IsValid()` bloqueia alias); ≥12 consumidores (config.go, 6+ repositories, projections `{message,remote}.go`, `message_projector.go`, DTOs `create_channel`/`get_or_create_channel`); coluna `channels.platform`→`kind` é schema-handoff. Enum cross-boundary termina em contracts, nunca em core-go.

### flat-events
**Gate**: fix do mismatch de envelope em `emit-wire-go.ts` (blocker compartilhado do audit §3) + bindings gerados de `template/contracts-go/wire` ganharem consumers (hoje 0).
- `internal/shared/events/*.go` — 19 envelopes hand-rolled (`channel_message_received.go` + 18 siblings). Saem do kernel rumo a `template/contracts-go/wire`, **não** rumo ao core-go.
- `services/mediator/redis_mediator.go` — 169 linhas de divergência: codedm publish-only com `Register()` **no-op silencioso** (audit risco #5) vs consumer completo do template (XREADGROUP + `:dead` DLQ + `maxDeliveries=5` + lifecycle de consumer-group). Sanção #8 hoje *com tensão registrada* — REWRITE mandatório antes de qualquer ingress TS→Go (slot `delivery_requested`); BUILD-LOG:69 já ativou o mediator Redis do lado TS, tornando o pipe unilateral. Interim recomendado: fazer `Register` falhar ruidosamente.
- `openapi_test.go` goldens pinados em nomes pré-harmonização (`Platform`, `ChannelMessageReceivedPayload`) — re-baseline viaja com a fase.

### schema-handoff
**Gate**: transferência de ownership do schema para drizzle/contracts (audit classification :395-400) + decisão explícita do source-filter/ownership de dispatch do outbox + resolução do flag exactly-once (§3 FLAG AO PLANNER).
- `repositories/pg_domain_event_repository.go` ↔ `core/repositories/pg_domain_event_repository.go` — 24 linhas, todas schema-shaped: codedm escreve `shared.events(…, time, updated_at)` / `shared.outbox` 8 colunas vs core contracts-shaped `(…, source, occurred_at)` / 6 colunas + `entity_id` + const `eventSource`. Audit risco #1 — hazard VIVO ("column \"time\" does not exist"); core é a referência linha-a-linha. Deve aterrissar **atomicamente** com dispatcher + troca da fonte de migrations, ou eventos param de persistir.
- `services/outbox/outbox_dispatcher.go` — inversão semântica escondida: codedm faz poll `WHERE source='gateway'` (const `OutboxSource`, rename Lote A.5 pendente) + touches `updated_at` (`:164-168,321,329,340`); core drena TODAS as rows não processadas independente de source. Swap ingênuo faz o Go consumir rows escritas pelo TS (dispatch duplo/alheio).
- `db/sql/migrate.go` + `cmd/migrate/main.go` + 36 migrations + `db/dbutil/migrationlock.go` — o `//go:embed` no módulo core (pós Lote 3) mantém o bootstrap de teste vivo (sanção #13) até esta fase deletar as migrations e aposentar `cmd/migrate` (`main.go:1-39`); `migrationlock.go` (advisory lock 727274) morre junto ou sobe pro template.
- `repositories/pg_domain_event_repository_batch_test.go` — re-baseline com o repo swap.
- Wiring Noop-UoW-em-produção (`internal/shared/module.go:32`, herdado pelo `internal/app/module.go` pós-split) — trocado para `PgUnitOfWork` nesta fase.

### tenancy
**Gate**: decisão de placement do Session (global vs per-controller; sanção #18 blessa global via módulo api-go até lá) + fix antecipável das queries.
- `internal/shared/middleware/session.go` — audit risco #2: consulta `authentication.session`/`owner_id` vs reais `authentication.sessions`/`active_owner_id` (toda request de browser silenciosamente anônima); falta `r.Header.Del("X-Owner-Id")` (guard de spoof) + token logado em Debug (`:35,44`, Lote C). O audit recomenda **antecipar o fix de 2 identificadores** para o pairing; o placement fica tenancy-owned. Core não tem session middleware.

### pairing (ordem ratificada do audit, BUILD-LOG:124)
**Gate**: adoção coordenada de `/api/{version}` + re-emit da SDK de 38 ops no mesmo trem.
- `services/httprouter/http_router.go` — `NewHttpRouter(_ *config.Config)` descarta config, sem segmento `{version}` (`:33,50`); "invalida a SDK de 38 ops, tem que andar junto do rewire". `RegisterSPA` sobrevive como extensão api-go-local (sanção #4).
- `config/config.go` — campo `Version` + extração dos campos gateway-only para extension type local.
- Bundle `public/app/*`.

---

## 5. O que fica PARA SEMPRE em api-go (MEDSCALL-SPECIFIC)

- `cmd/api/main.go` — composition root do serviço (`channel.Module` whatsmeow-owned + slog handler `tint`); única edição é o import-swap `shared "template/core-go"`.
- `internal/shared/middleware/apikey.go` — auth é decisão de domínio (`core/module.go:81-86` do template); wiring global sanção #18, movido para `internal/app/module.go`.
- `internal/shared/events/channel_event.go` — carrier SSE `@union` Go-local (sanção #9, row LOCAL da classificação wire).
- `pkg/openapi/events.go` + `listen_events.go` — superfície SSE `ServerEvent` (sanções #15/#16); pós union-slots viram extensão api-go registrada em hook do core.
- `internal/shared/middleware/session.go` — permanece api-go (placement tenancy-owned).
- `public/embed.go` + `public/docs/openapi.json` (sanções #4/#16).
- `internal/channel/enums/platform.go` (→`ChannelKind`) e os 19 envelopes `events/*.go` — moradores temporários de api-go até union-slots/flat-events os substituírem por contracts; nunca passam pelo core.
- Lifetime-bounded (não "para sempre", mas nunca entram no core do template): 36 migrations SQL + `migrationlock.go` + `cmd/migrate/main.go` — vivem em `core/db/sql/` do codedm por imposição do go:embed até schema-handoff deletá-los.

---

## 6. Riscos + interação com union-slots em voo e nx/emit-openapi

1. **Split-brain com o workflow union-slots** — ele commitou em `pkg/openapi/` há horas (`de61a7d7`, `392eb9d8`) e é dono ativo de `enums/unions/schema/emit/events/openapi_test`. Mitigação: freeze protocolar sobre `pkg/openapi/` durante os Lotes 1–6; Lote 7 só após o merge; qualquer mudança de marker/`4XX`/path aterrissa com re-baseline dos goldens no MESMO commit. Este plano é read-only-agora: a execução também não pode colidir com o outro workflow que está commitando no repo.
2. **Blind spot do nx** — `go X ./...` não entra em módulo aninhado; sem o fix de `project.json` no primeiro commit, todos os testes movidos somem do CI com verde. Copiar o template exatamente aqui É o bug (ele tem o mesmo buraco).
3. **emit-openapi / spec vazio** — chave byPath errada no `walker.go:148` ou tier prefix errado no `enums.go` → spec vazio ou components contaminados → wipe silencioso da SDK de 38 ops. Gate: diff byte-a-byte de `public/docs/openapi.json` pós Lote 7 + build do kubb. Adotar o `core/pkg/openapi` do template wholesale em vez de mover o do codedm flipa `x-enum-varnames`→`x-tpl-*`, 3.1→3.0.3 e deleta `registerEvents` — quebra kubb + goldens + sanções #15/#16.
4. **`pg_domain_event_repository` + `outbox_dispatcher`** — o swap de maior alavancagem e o mais perigoso: colunas medscall (`time`) contra DB contracts-shaped (risco #1, hazard vivo) e inversão do source-filter (dispatch de rows do TS). Nunca em swap isolado; só atômico na fase schema-handoff.
5. **`redis_mediator.Register` no-op** — tudo compila, boota e loga "ready (publish-only)" enquanto ingress TS→Go morre invisível (risco #5); interim: fail-loud no `Register`.
6. **Split fx do `module.go`** — invoke errado dropa Session/APIKey (API sem auth) ou o CORS wrap (codedm embrulha em `StartHTTPServer`, template não); ordem de middlewares tem que sobreviver aos dois módulos. Smoke de boot + request autenticada no gate do Lote 6.
7. **Namespace UUIDv5 cross-language** — adotar `IDFromSeed` sem verificar o `BK_DASH_NAMESPACE` no `Id.ts` do codedm orfana entidades já ingeridas.
8. **sqlc**: n/a — nenhum dos lados Go usa (raw pgx; único grep hit é comentário SQL).

---

## 7. Estimativa de commits/batches

**Trilho principal (desbloqueado agora, ~2-3 sessões): 12–15 commits.**
- Lote 0 (baseline + snapshot openapi + freeze): 0 commits (verificação).
- Lote 1: 2 commits (go.mod+replace+project.json; mv folhas + platform.go→internal/channel/enums).
- Lote 2: 1 commit. Lote 3: 2 commits (db+migrations; config+repos entangled as-is). Lote 4: 1 commit. Lote 5: 1 commit. Lote 6: 2 commits (split core/module.go + internal/app/module.go; cmd/api rewire + smoke).
- Catch-ups DRIFTED (seção 3, fora de pkg/openapi): 3–4 commits pequenos (codes.go; id.go+verificação TS; validation+accumulator; Lote B config).

**Trilho gateado: +8–12 commits.**
- Pós union-slots (Lote 7): 2–3 commits (mv pkg/openapi + catch-ups walker/enums/unions + externalização do teste + re-baseline; decisão atômica de markers `x-*` vs `x-tpl-*` + `default`→`4XX`).
- flat-events: 2–3 (rewrite redis_mediator; deleção dos 19 envelopes ao adotar contracts bindings; goldens).
- schema-handoff: 2–3 (repo+dispatcher+migrations atômico; retirement cmd/migrate+migrationlock; Pg UoW em produção).
- tenancy: 1 (session fix — antecipável para o trem do pairing).
- pairing: 1–2 ({version}+config Version+SDK re-emit).

**Total: ~20–27 commits em 6 lotes principais + 5 follow-ups por fase.** 37 dos 41 arquivos Go não-medscall do kernel (27 BYTE-IDENTICAL + 10 DRIFTED da área shared-infra) trocam com edits imports-only/sed-grade; o resíduo concentra exatamente onde o audit previu: schema-handoff (writers de evento/outbox), flat-events (redis + envelopes), union-slots (miolo do emitter openapi), pairing (router/config), tenancy (session/wiring).