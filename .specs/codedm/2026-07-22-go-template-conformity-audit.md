# Relatório de Conformidade — codedm `packages/api/go` (porte verbatim medscall)


> Produzido por workflow de auditoria read-only (wf_2995db88-803, 2026-07-22): 8 auditores
> dimensionais + síntese, ~1.12M tokens. Normativo: skills go-variant do codedm →
> template-fullstack packages/api/go (core + internal/activity) → docs/BACKEND.md.
> Classificação: CONFORMANT | FIX-NOW | REWRITE(fase) | SANCTIONED(citação).
Síntese das 8 auditorias dimensionais contra: (1) skills go-variant do codedm; (2) referência template-fullstack (`core/` + `internal/activity`); (3) `docs/BACKEND.md`; com sanções de `.specs/codedm/channel-wire-classification.md` e gaps de `.specs/codedm/2026-07-22-pairing-medscall-and-port-gap-analysis.md` §3.

---

## 1. Matriz de conformidade

| Dimensão | % conformant | #FIX-NOW | #REWRITE | #SANCTIONED | Nota |
|---|---|---|---|---|---|
| controllers-http | ~85% | 9 | 2 | 4 | Shape Metadata/Handle/fx-group 38/38 limpo; sweep gofmt+Errors toca ~75% dos arquivos |
| tests-openapi | ~80% | 8 | 2 | 2 | Superfície mais conformante; emitter drifted dos seams novos do template |
| usecases-services | ~70% | 9 | 6 | 2 | Erros tipados ~95%; UoW só em 3/11 use cases que escrevem no DB |
| domain | ~70% | 6 | 6 | 2 | `remote.go`/`message.go` exemplares; débito concentrado em 4 arquivos |
| consumers-handlers | ~70% | 5 | 5 | 1 | 0/23 handlers com interface check; 4/6 arquivos de infra byte-idênticos ao template |
| persistence | ~70% | 9 | 11 | 2 | Mecânica tx/not-found/idempotência ~90%; débito = schema medscall + granularidade de projectors |
| di-config | ~70% | 9 | 6 | 3 | Esqueleto fx template-shaped; resíduo em config.go + junk de porte |
| events-outbox | ~62% | 6 | 6 | 4 | Core (envelopes, UUIDv5, outbox loop) byte-idêntico ao template; massa não-conforme = 19 envelopes hand-rolled |
| **Total (com dups cross-dimensão)** | **~70%** | **~61** | **~44** | **~24** | Dups marcados nos lotes abaixo |

Conflitos de classificação entre auditorias (registrados, não resolvidos por invenção):
- `redis_mediator.go:25-39` — events-outbox: SANCTIONED (egress-only, §A); consumers-handlers: REWRITE/flat-events (Register no-op mata o slot dormante `integration.channel.delivery_requested`, §A.2). Consolidação: sancionado **hoje**, REWRITE obrigatório antes de qualquer ingress TS→Go. BUILD-LOG:69 registra ativação do RedisExternalMediator no lado TS (fase 9) — reforça o lado REWRITE.
- `delete_channel.go:49-59` (evento construído no use case) — events-outbox: FIX-NOW (mover pra `Channel.Delete()`); usecases-services: REWRITE/flat-events. Mantido em flat-events com nota de que a versão aditiva é viável antes.
- `cmd/openapi` + `public/docs/openapi.json` — di-config: SANCTIONED (BUILD-LOG a3f4df53); tests-openapi: FIX-NOW. Consolidação: código fica (blessed), **doc sed** em `docs/BACKEND.md:572` + resíduo `emit.go:1,107-108`.

---

## 2. FIX-NOW consolidados — lotes mecânicos (ordenados por alavancagem)

### Lote A — Sweep de harmonização de nomes (sed-grade, maior superfície)
1. `Name()` → snake_case + "Instance"→"Channel" nos 37 use cases (`create_channel.go:43` "CreateInstance", `send_text.go:43` "SendText", …) — BP-GO-UC-05 dispara em todo arquivo.
2. Resíduo "instance" em ~25 sites: `create_channel.go:49`, `send_text.go:51,54,59`, `delete_channel.go:42`, `edit_message.go:46`, `registry_service_impl.go:46,64,72`.
3. `package instance` → `channel` nos 7 arquivos de `repositories/channel/*.go:1` (REPO-GO-01).
4. `ListInstancesRequest` → rename (`list_channels.go:11`) + regen SDK (vaza no schema OpenAPI).
5. `OutboxSource = "channel"` → `"gateway"` (`outbox_dispatcher.go:30`).
6. `ChannelNewSpecialPlatformEvent` → `NewChannelSpecialPlatformEvent` (`channel_special_platform_event.go:12`, 1 call site `gateway_platform_event_handler.go:28`).
7. Rename dos 11 `*_integration_handler.go` (publishers, não consumers — skill §File naming).
8. Consumer-group default `"medscall-channel"` → `codedm-gateway` (`config.go:38`).
9. `"Channel API"` / "emitted by channel/pkg/openapi" (`emit.go:107-108`) + comentário "3.1 emitter" (`emit.go:1`) + `docs/BACKEND.md:569,572`.
10. Comentários stale "Skips if DATABASE_URL" (`pg_message_repository_test.go:29`, `pg_channel_projection_repository_test.go:25`, `pg_remote_repository_test.go:28`).

### Lote B — Purge de config.go (1 arquivo, fecha o deferral BUILD-LOG:108)
- `godotenv.Load("../../.env")` → adicionar `../../../.env` (`config.go:30`).
- Port default `"3031"` → `3032` (`config.go:34` vs `.env.example:41`).
- DB URLs `channel:channel@…/channel` → alinhar `.env.example:52` (`config.go:35-36` + `config_test.go:9-40` que pina o default stale).
- Matar a chave morta `CODEDM_GATEWAY_WHATSMEOW_URL` (`config.go:36` vs `.env.example:55` / `template.config.ts:351`).
- Elimina a classe de falha "boot sem env cai no universo medscall".

### Lote C — Segurança + erros silenciosos (poucas linhas, alto valor)
- `session.go:35,44` — parar de logar token de sessão em Debug.
- `session.go:16-22` — adicionar `r.Header.Del("X-Owner-Id")` (spoof guard, paridade template).
- 3 `Publish` com erro descartado: `channel_connected_handler.go:94`, `channel_disconnected_handler.go:79`, `channel_logged_out_handler.go:79` (HDL-GO-07).
- `create_channel.go:47` — guard de unicidade engole erro do repo (`existing, _ :=`).
- `uuid.Parse` blank-discarded em `connect_channel.go:51`, `restart_channel.go:50`, `delete_channel.go:46`, `logout_channel.go:47`, `set_presence.go:45`.
- `listen_events.go:168` — `http.Error` cru → `httputil.RespondError`.

### Lote D — Interface checks compile-time (puramente aditivo)
- 23 arquivos de `internal/channel/handlers/` (`var _ mediator.DomainEventHandler = (*X)(nil)` — HDL-GO-02, 0/23 hoje).
- Projectors (`projections/projectors/*.go`, template tem em `activity_entry_projector.go:42`).
- Services: `ChannelRegistryImpl` (`registry_service_impl.go:18`), `WhatsmeowChannel`, `WhatsmeowChannelFactory` (SVC-GO-02).
- 37 controllers (`var _ types.Controller`, cf. template `list_activity.go:38`).
- `remote_projector_test.go:20` — assertion no mock (TEST-GO-BP-03 high).

### Lote E — Sweep de controllers
- `gofmt -w` nos 27 arquivos de `internal/channel/controllers/`.
- `Metadata.Errors` nos 29 controllers que omitem (ex. `send_text.go:26-38`, `connect_channel.go:23-35`).
- 9× `w.WriteHeader(http.StatusNoContent)` → `httputil.RespondJSON(w, 204, nil)`: `pin_remote.go:60`, `unpin_remote.go:60`, `archive_remote.go:60`, `unarchive_remote.go:60`, `mute_remote.go:62`, `unmute_remote.go:60`, `mark_remote_as_seen.go:60`, `mark_remote_as_unread.go:60`, `set_presence.go:55`.
- Cast lambda → `fx.As(new(types.Controller))` em `shared/module.go:51-55`.

### Lote F — UoW mecânico (11 sites, mesmo padrão)
- `delete_channel.go:52-67` — envolver `Save`+`Delete` no UoW (única dupla-escrita genuinamente não-atômica, viola o contrato do próprio repo em `pg_channel_repository.go:206-207`).
- `create_channel.go:46-59` — guard + criação pra dentro do `uow.Execute` (TOCTOU).
- 8 `SaveAll(ctx)` sem UoW: `pin_remote.go:61`, `unpin_remote.go:55`, `archive_remote.go:55`, `unarchive_remote.go:55`, `mute_remote.go:65`, `unmute_remote.go:55`, `mark_remote_as_unread.go:55`, `mark_remote_as_seen.go:60` (UC-GO-02 `when: always`). Caveat: atomicidade real depende do Noop UoW → schema-handoff.

### Lote G — Purge de dead code e resíduo de porte (deleções zero-risco)
- Kernel genérico morto: 7 VOs (`shared/objects/{cpf,cnpj,address,phone,person_name,money,email}.go`), 3 enums (`shared/enums/{country,currency,language}.go` — anti-mirror de contracts), códigos órfãos (`shared/errors/codes.go:7-14`), `HashedID` (`id.go:47-64`) — zero consumers, grep-verificado.
- Loops de evento mortos: `create_channel.go:66-70`; re-drains em `channel_connected_handler.go:81-85`, disconnected:66-70, logged_out:66-70 (EVT-GO-06).
- `ChannelProjectionRepository` morto (`channel_projection_repository.go:14-18` + `projections/channel.go:5-7` comentário de projector fantasma).
- `cmd/check_types/main.go`, `packages/api/go/docs/` (10 docs medscall), `packages/api/go/scripts/cli.ts`, orchestrion (`go.mod:5` + `orchestrion.tool.go`).
- 3 `@union` sem variant (`gateway_connected.go:15`, `gateway_disconnected.go:15`, `gateway_logged_out.go:15` — oneOf vazio).
- Closure `check` morta (`openapi_test.go:159-163`).

### Lote H — OpenAPI/walker + hygiene residual
- Const `modulePrefix` em `walker.go:109,148` roteando `enums.go:30`/`unions.go:38` (pré-posiciona o seam de union-slots — template `walker.go:16-21`).
- Tolerância a `internal/` vazio (`walker.go:33-84` vs template `walker.go:59-71,122-131`).
- `openapi_test.go:1` → pacote externo `_test` (TEST-GO-02).
- 6 comentários `// Values:` faltando (`direction.go:8`, `group_role.go:8`, `membership_action.go:8`, `history_sync_type.go:10`, `remote_type.go:4`, `platform.go:3`).
- Guards `IsValid` nos casts DB→enum (`pg_channel_repository.go:328,331`, `pg_remote_repository.go:107`, `pg_message_projection_repository.go:433`).
- `FindAllActive` → `txOrDB(ctx)` (`pg_channel_repository.go:170`, bp-GO-REPO-08 critical).
- `CodeChannelInvalidParams` aditivo + swap em `channel.go:37` (código de erro de aggregate errado).
- Mover projection repos pra `projections/`, 6 `mock_*.go` colocados, construtores retornando interface.
- `fx.Provide` + `fx.Invoke(registerHandlers)` em vez de construção inline (`internal/channel/module.go:321-389`) — mecânico, dup entre consumers-handlers/di-config/persistence.

---

## 3. REWRITE por fase — alinhado à ordem ratificada (BUILD-LOG:124)

Ordem: **pairing-proxy ∥ union-slots (passos 1-2) ∥ pré-trabalho envelope flat → piloto `message_received` → rail → migração 14 flat + 3 connection → schema-handoff**. Tenancy fica por último (deferral §G.3, decisões abertas do founder gap §5).

### Fase: pairing (paralela, ortogonal a contracts)
- Router sem `{version}`: `http_router.go:33,50` (`NewHttpRouter` descarta config; template usa `cfg.Version`) — invalida a SDK de 38 ops, tem que andar junto do rewire.
- `persistConnecting` fora de UoW + erro engolido: `connect_channel.go:96-101`, `restart_channel.go:78-83` — é exatamente o fluxo connect/QR que pairing-direct retrabalha.
- Códigos de erro legados `INTEGRATION_*` no wire: `internal/channel/errors/errors.go:10-13` (+ prune dos 7 códigos nunca levantados em `errors.go:13-19`) — muda valor de wire, anda com o error-mapping do client (gap §5.4).
- Orquestração use-case-grade dentro dos connection handlers: `channel_connected_handler.go:52-90` (+ disconnected/logged_out mesmo shape).
- SPA medscall embutida: `public/embed.go:8-9` + `public/app/*` + `shared/module.go:88-95` — decisão de serving pertence a pairing-direct (mecanismo RegisterSPA em si é verbatim-sanctioned).

### Fase: union-slots (piloto = `message_received`, BUILD-LOG:117)
- Superfície SSE hand-rolled: `listen_events.go:49-131` (`EventPayloads`) + `:162` — o gap-analysis diz que isto **é** a implementação union-slots (spec §2.2/§2.4).
- `@union/@variant` em payloads Go-locais: `events/message_received.go:17-31`, `message_sent.go:14-28`, `gateway_platform_event.go:22-23`.
- Filtro de prefixo do scanner exclui `template/contracts-go/`: `unions.go:38-39` + `enums.go:30` (a alegação "scanner sem alteração" é falsa — gap §4).
- `Platform` → `ChannelKind`: `shared/enums/platform.go:1-16` (discriminador da union; `IsValid()` bloqueia alias) + colunas/filtros `projections/message.go:23`, `projections/remote.go:19`, `message_projector.go:40,91` + DTOs `create_channel.go:17`, `get_or_create_channel.go:17`.
- (`oneof.go` ausente vira REWRITE aqui só se `@oneof` for adotado — hoje CONFORMANT.)

### Fase: flat-events (rail → 14 flat + 3 connection)
- 19 envelopes de integração hand-rolled (`internal/shared/events/*.go`, ex. `channel_message_delivered.go:10-13`) — bindings gerados têm **0 consumers**; **blocker compartilhado**: mismatch de envelope em `emit-wire-go.ts` (struct flat `wire.IntegrationEvent` vs `types.IntegrationEvent[Payload]`) — resolver primeiro destrava 17/19.
- `redis_mediator.go:25-39` — restaurar consumer XREADGROUP + dead-letter do template (ou fazer `Register` falhar alto até lá); gate de qualquer ingress TS→Go (`delivery_requested`).
- Idempotência dos sync handlers: `channel_sync_handler.go:38,72,105` (fact rows duplicadas em redelivery, HDL-GO-06).
- Consolidar 22 projectors → 3 (`message_projector.go:24,75,127,166,207,261`; `remote_projector.go` ×14; `membership_projector.go:20,64`) — canon 1-por-projection (header do skill + template `activity_entry_projector.go:33-46`); resolve junto: stub-row (`remote_projector.go:147-163`), lógica de transição duplicada (`projections/remote.go:40-55` vs `pg_remote_projection_repository.go:659-` + `remote_projector.go:403,412,493,502`), e o parágrafo stale do próprio SKILL.md (linha 48) que ainda recomenda per-event.
- Golden assertions pinadas em nomes pré-harmonização: `openapi_test.go:49,80` (`Platform`, `ChannelMessageReceivedPayload`).
- Bypass de entity: `edit_message.go:40-64`, `delete_message.go:71-81` (métodos `Message.Edit`/`Delete` em `entities/message.go:111,138` existem e são ignorados); `delete_channel.go:52-59` (`AddDomainEvent` direto → `Channel.Delete()`).

### Fase: schema-handoff (contracts-wins, one migration source)
- **Hazard vivo**: `pg_domain_event_repository.go:100-118` escreve colunas medscall (`time`, `updated_at`, id TEXT `:123-128`) — DB real é contracts-shaped → `column "time" does not exist` no primeiro `go test`; template core dá a referência line-for-line (§D.2-D.3, §G.3).
- Polling filtrado `WHERE source = $1` + `updated_at` touches: `outbox_dispatcher.go:164-168,321,329,340` (§D.3).
- Colunas de `channels` (medscall `platform`/`name`/`credentials`/`version` vs contracts `gateway.channels` `kind`/`account_detail`): `pg_channel_repository.go:59-60,229-241` + `projections/channel.go:9-17` (colapso T6 documentado).
- Boot hook `FindAllActive` lê shape medscall — reconnect-on-boot morto: `internal/channel/module.go:275-319` (WRN `column "platform" does not exist`, boot smoke §4).
- `cmd/migrate/main.go:1-39` + 36 migrations embutidas — ownership de schema passa pra drizzle/contracts (classification :395-400).
- Credentials cruas no DTO de saída: `get_channel.go:54` (gap §5.3; contracts derruba a coluna).
- `ChannelStatus` 5 valores → 3 (`channel_status.go:6-12`, §C.1/§G.3) + guards de invariante nos setters anêmicos `channel.go:90-131` (ENT-GO-05) + campos públicos mutáveis `channel.go:19-27` (ENT-GO-C01).
- `RemoteType`/USER → `ContactKind`/CONTACT: `remote_type.go:6-10`, `projections/remote.go:18`, `pg_remote_repository.go:105,148` (~40 assertions).
- Seam repo-Save-owns-events (`pg_channel_repository.go:213-219`) invertendo UC-GO-03 + `Save` sem `IncrementVersion` (versão SQL-side, coluna `version` cai em contracts) + `FindAll` paginado em repo de domínio (`channel_repository.go:22`, bp-GO-REPO-06).
- Noop UoW em produção (`shared/module.go:32`) — comentários "inside transaction" dos handlers são fictícios; decisão de atomicidade real mora aqui.
- **FLAG AO PLANNER (sem fase dona)**: dual-write events+outbox não-transacional nos 8 use cases control-plane + `whatsmeow_channel.go:790` — o único buraco real de exactly-once (crash entre INSERTs = fact row sem dispatch); auditoria mapeou pra schema-handoff como fase mais próxima.

### Fase: tenancy (deferida — decisões do founder, gap §5.2/§5.10)
- `session.go:38-41` — query em `authentication.session`/`owner_id` vs schema real `authentication.sessions`/`active_owner_id` (`contracts/db/schema/auth.ts:32-44`) — falha em toda request, browser-direct fica anônimo. **Nota di-config**: o fix de 2 identificadores é barato e pré-requisito de pairing — recomendado antecipar a query, deixando só o *placement* pra tenancy.
- Wiring global de Session+APIKey em `shared/module.go:71-78` vs regra do template `core/module.go:81-86` ("auth middlewares são decisão de domínio").
- `pg_message_repository.go:95,103-104` — `Find` fabrica `OwnerID: ""` (+ defaults `PlatformWhatsApp`/`MessageTypeText`) → aggregate reidratado levanta eventos tenant-unscoped.
- (Os 26 controllers sem `X-Owner-Id` seguem SANCTIONED até esta fase — ver §4.)

---

## 4. Deviations SANCTIONED (com a bênção citada)

| # | Deviation | Bênção |
|---|---|---|
| 1 | 26 controllers id-keyed sem `X-Owner-Id` (ex. `connect_channel.go:11-13`, todos os send_*) + inputs de use case tenant-unscoped (`create_channel.go:18` omitempty; `delete_channel.go:14-16` etc.) | §G.3: "Não corrigir no verbatim agora"; gap §5.10 |
| 2 | `Metadata.Context: "messaging"` em 20 controllers (`send_text.go:28`) preservando URL surface medscall | Mandato de cópia verbatim da classification (mudança só via pairing) |
| 3 | Layout `internal/shared/*` + `pkg/*` sem split `core/` (módulo `template/api-go`) | Header da classification ("copied verbatim, module-renamed only") + BUILD-LOG fase-7 |
| 4 | `RegisterSPA` embutido (`http_router.go:90-113` + `public/embed.go`) — o *mecanismo* | Verbatim (o *bundle* medscall stale é REWRITE/pairing) |
| 5 | 8 comandos `remote_*` thin, eventos hand-rolled sem aggregate (`pin_remote.go:55-60` etc.) | §B: control-plane events LOCAL, projection-only |
| 6 | Valores lowercase em enums de wire (`chat_presence_type.go:11-13`, `group_role.go:11-13`, `membership_action.go:11-14`) | §C.1: byte-idênticos ao `.tsp` congelado — contracts vence o lint local |
| 7 | `receipt_type.go:7-10` lowercase | §C.3: interno ao adapter whatsmeow, espelha protocolo externo |
| 8 | `redis_mediator.go` publish-only (egress-only, zero ingress hoje) | §A + mandato verbatim §G — *com tensão registrada* (vira REWRITE/flat-events pro ingress) |
| 9 | `channel_event.go:5-35` union carrier `@union` Go-local | §A (row LOCAL) |
| 10 | Nomes de evento 2-segmentos / não-past-tense (`channel.gateway.history_sync` etc.) | §B + §G (LOCAL-untouched) |
| 11 | Ingest do gateway via mapper→SaveAll sem entity (`mapper/*.go`, `whatsmeow_channel.go:790`) | Canon do pipeline de ingestão (Controller→Mapper→Event→outbox→Handler) |
| 12 | Queries schema-unqualified via `search_path=gateway` (`client.go:47-54`) | §G.1: "rename confined to config — no query edits" |
| 13 | 36 migrations embutidas retidas em `internal/shared/db/sql/migrations/` | §G.2: referência histórica + bootstrap de teste isolado |
| 14 | Gate de teste `CHANNEL_TEST_DATABASE_URL` + skip + sweep `test_*` schema | §G.2: convenção de throwaway-DB dedicado abençoada |
| 15 | `pkg/openapi/events.go` + `emit.go:48-50` emitindo `ServerEvent` oneOf na OpenAPI | §B: whitelist SSE = superfície própria do serviço Go, não wire fact de contracts |
| 16 | `cmd/openapi` + `public/docs/openapi.json` (vs template `cmd/emit-openapi`/`public/openapi.json`) | BUILD-LOG a3f4df53 (raciocínio explícito; consumers convergem) — resta doc sed (Lote A.9) |
| 17 | Env naming `CHANNEL_*` com fallbacks (`config.go:34-46`) | Commit 22f9086a + `.env.example:40-50` |
| 18 | Session global no shared module (per skill codedm de middleware, vs template per-controller) | Skill codedm = fonte normativa #1 vence o template (auditoria controllers-http) |

---

## 5. Top-10 riscos

1. **`column "time" does not exist` — hazard vivo em todo write path** (`pg_domain_event_repository.go:101,111`): o único writer atrás de todo `Save` escreve colunas medscall num DB contracts-shaped. Primeiro `go test`/boot real contra o DB de verdade quebra. (schema-handoff, alavancagem máxima: 1 arquivo com referência line-for-line no template.)
2. **Toda request browser-direct é silenciosamente anônima** (`session.go:38-41` consulta `authentication.session`/`owner_id` — tabela/coluna não existem; erro é debug-logged). Pré-requisito duro de pairing-direct; fix de 2 identificadores.
3. **Buraco de exactly-once sem fase dona**: dual-write events+outbox não-transacional nos 8 use cases control-plane (`pin_remote.go:55-61` et al.) + `whatsmeow_channel.go:790` — crash entre INSERTs = audit row sem dispatch. Nenhum dos phase docs mapeia; flag explícita ao planner.
4. **Egress de conexão perdido invisivelmente**: 3 handlers descartam o erro de `externalMediator.Publish` (`channel_connected_handler.go:94`, `channel_disconnected_handler.go:79`, `channel_logged_out_handler.go:79`) — exatamente os eventos `connected/disconnected/logged_out` da UX de pairing; falha de Redis ali é totalmente silenciosa.
5. **`redis_mediator.go:39` `Register` é no-op silencioso** — qualquer ingress TS→Go (slot dormante `delivery_requested`, §A.2) não funciona e não avisa; BUILD-LOG:69 ativa o Redis mediator no TS, tornando o pipe unilateral.
6. **Boot sem env cai no universo medscall** (`config.go:30` carrega `packages/.env` inexistente → defaults `medscall-channel`, porta 3031, `channel:channel@…/channel`; `config_test.go:9-40` pina o stale). Deferral BUILD-LOG:108 aberto.
7. **Credenciais cruas de gateway no DTO de saída** (`get_channel.go:54`) — risco founder aberto (gap §5.3); contracts derruba a coluna no handoff.
8. **Spoof de `X-Owner-Id` + token de sessão em log**: sem `r.Header.Del("X-Owner-Id")` (`session.go:16-22`) o header do cliente vaza pros 11 controllers owner-bound; `session.go:35,44` loga o token em Debug. Dois fixes de 1-2 linhas.
9. **Reconnect-on-boot morto** (`internal/channel/module.go:275-319` lê `channels` shape medscall — WRN `column "platform" does not exist` no boot smoke): degrada gracioso, mas a feature está silenciosamente ausente até o schema-handoff.
10. **Aggregate `Message` reidratado tenant-unscoped** (`pg_message_repository.go:95,103-104` — `OwnerID: ""` + defaults fabricados de `Platform`/`MessageType`): eventos de domínio levantados por edit/delete saem sem owner, contaminando o audit trail (tenancy).

Riscos estruturais de segunda ordem (fora do top-10, mas gating de fase): filtro do scanner `unions.go:38` exclui `template/contracts-go/` — a premissa "scanner sem alteração" da migração union-slots é falsa (gap §4); mismatch de envelope em `emit-wire-go.ts` bloqueia todas as 19 trocas de integration event (gap §3 blocker i); golden tests `openapi_test.go:49,80` quebram no primeiro passo de harmonização se não forem re-baselined junto.