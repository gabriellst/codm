# Relatório final — Pairing medscall, delta codedm e o porte Go→contracts

Estado do codedm: main @ `7afc3350` (3 commits à frente do wip `ecb65b22`, só astro-landing) — a árvore mid-cleanup É o main de hoje. `PairingQrCache.ts`, `ConsumeChannelPairingQr.ts` e o SSE `pairing_qr_updated` já foram deletados sem referências penduradas.

> Produzido por workflow de análise (wf_ea52a6ef-d69, 2026-07-22): 5 leitores paralelos +
> 3 verificadores adversariais + síntese. Vereditos: fluxo medscall CONFIRMED · gap do porte
> CONFIRMED · ordenação union-slots-primeiro PARTIAL. Fonte medscall:
> /Users/work/Desktop/Projetos/medscall/software/monorepo.

---

## 1. Como o medscall resolve o pairing (fluxo verificado, veredito CONFIRMED)

**Arquitetura em uma linha:** o browser NUNCA fala com o Go. Um único controller wildcard no TS API proxeia tudo, injetando identidade via header.

**O contexto `external` (TS API) — um proxy genérico, zero controllers por endpoint:**
- Contexto registrado em `packages/api/src/external/index.ts:7-11`, montado em `packages/api/src/routers.ts:33,50`. Único controller: `ChannelProxy` com `path = '/channel/*'` e os 5 métodos HTTP (`packages/api/src/external/controllers/ChannelProxy.ts:31-32`) → rota única `/api/external/channel/*` (composição em `packages/api/src/shared/types/MainRouter.ts:66`).
- `handle()` pega `ctx.session.ownerId` e chama `forwardToChannel(request.raw, ownerId)` (`ChannelProxy.ts:38-41`), que strippa o prefixo `/api/external/channel`, mira `CHANNEL_BASE_URL` (`.env.example:21` = `http://localhost:3031/api`) e injeta **`X-Owner-Id`** (`packages/api/src/external/utils/forwardToChannel.ts:12-18`). **Nenhum apikey é enviado** pelo TS (grep confirmado zero).
- Forwarder genérico `packages/api/src/shared/utils/ForwardRequest.ts:38-83`: copia headers (cookie viaja junto, :45), strippa hop-by-hop (:53-55, :74-77), streaming unbuffered com `duplex:'half'` (:60-66), e propaga abort do cliente via `signal` (:68-71 — sem isso cada SSE proxeado vira conexão zumbi até esgotar o pool de 256 fetches do Bun). `ChannelProxy.ts:36` seta `contentType = MimeTypes['.stream']` para desligar o timeout por request do Bun (SSE longo).
- **Auth no hop TS**: middlewares do router external = `[AuthAccountMiddleware, AuthActorMiddleware]` (`packages/api/src/external/middlewares/index.ts:4`). `AuthAccountMiddleware.ts:20-65` resolve a sessão better-auth do cookie e seta `ownerId`; `AuthActorMiddleware.ts:26-55` valida DOCTOR/COLLABORATOR. "O Go nunca precisa de auth próprio" (`ChannelProxy.ts:21-24`).

**configureClient / configureChannelClient:**
- Nenhum dos dois é codegen — são módulos http escritos à mão, um por spec, cada um com seu próprio symbol global: `src/http/index.ts:7` (`Symbol.for('@medscall/monorepo-sdk')`) e `src/http/channel.ts:7` (`Symbol.for('@channel/sdk')`), ambos da factory `createConfigManager` (`src/http/config.ts:14-56`). `configureChannelClient` é só **alias de import** no call site: `packages/app/src/main.tsx:6-7,16-22`.
- `packages/app/src/lib/config.ts:2-3` (minúsculo — errata do verdict): `channelBaseUrl = ${VITE_API_URL}/external/channel` → aponta pro **proxy TS** (:3030), nunca pro Go (:3031). A URL do Go vive só server-side.
- SDK do channel é Kubb gerado **do openapi do Go** (`packages/channel/project.json:7-20` — `go run ./cmd/openapi`), consumido via subpath `@medscall/monorepo-sdk/channel/app` (23 imports no app), com `credentials:'include'` (`packages/client/src/http/channel.ts:~182`).

**Fluxo QR (SSE-pushed, sem polling):**
1. Loader pré-aquece `getOrCreateChannel` (`whatsapp/chat/route.tsx:47-49`) → `GET .../external/channel/channel/channels/resolve?platform=whatsapp` → Go `/api/channel/channels/resolve` (`http_router.go:45-52`, `get_or_create_channel.go:27`).
2. Connect: `POST .../channels/<id>/connect` → Go retorna `{id, state: CONNECTING, qrCode}` (`usecases/connect_channel.go:90-91`) → painel mostra QR (`ConnectionPanel/index.tsx:88-98` — que vive em `whatsapp/chat/-components/`, errata do verdict).
3. Um único stream SSE no layout: `fetchEventSource(channelBaseUrl + '/events')` com cookie (`useServerEvents.ts:22-24`), proxeado unbuffered até Go `/api/events` (`listen_events.go:151-153`, whitelist :29-48). Refresh de QR chega via `integration.channel_special_platform_event.received` filtrando `QrCodeUpdated` (`ConnectionPanel/index.tsx:75-86`).
4. Scan → `integration.channel.connected` no mesmo stream → status flip + invalidação de query keys (:54-73).

**Auth/apikey/CORS no Go:** `module.go:71-78` monta `Session(db)` (lê cookie better-auth e (re)seta `X-Owner-Id`, `middleware/session.go:14-52` — fallback para deploy direto) e `APIKey` **só quando `CHANNEL_GLOBAL_API_KEY` está setado** (`middleware/apikey.go:12-35`) — o proxy TS não envia apikey, então setups proxeados rodam com ele vazio. CORS só importa no TS (`FastifyHttpRouter.ts:258-273`, `CORS_WHITELIST` default `['*']`).

**Errata importante do verdict (REFUTED sub-claim):** NÃO é verdade que "todo controller Go binda X-Owner-Id" — `connect_channel.go:11-13` binda só `ID` (tenant-unscoped, acha channel por UUID). Muitos bindam (`get_or_create_channel.go:13`, `list_channels.go:14`, 12+ arquivos), mas o medscall mesmo furou nisso. **No porte: enforce, não assuma.**

---

## 2. Delta codedm → padrão medscall

### O que DELETAR (proxy TS remanescente)
| Artefato | Path |
|---|---|
| Usecases proxy | `packages/api/typescript/src/ui/usecases/ConnectChannel.ts`, `GetChannelPairingStatus.ts` |
| Controllers | `src/ui/controllers/ConnectChannel.ts` (POST `/ui/channels/connect`), `GetChannelPairingStatus.ts` (GET `/ui/channels/pairing-status`) |
| Normalizador órfão | `src/ui/channelStatus.ts` (5-valores gateway → 3-valores contracts, :20-31; únicos consumidores são os usecases acima) |
| Barrels | `ui/controllers/index.ts:8-9`, `ui/usecases/index.ts:7-8` |
| Erro | `GATEWAY_UNAVAILABLE` em `ui/errors/index.ts:11,23` (decisão pendente — §5) |
| DI do SDK Client | `shared/registry.ts:38,54-71` (os 2 usecases são os únicos consumidores) |
| Env key | `CODEDM_GATEWAY_API_KEY` em `core/src/utils/Config.ts:50`, `template.config.ts:344`, `.env.example:32` |
| Regen | openapi.json:2512,:2736 + SDK TS (`connectChannel`/`getChannelPairingStatus` client/hooks/types/zod) + `client.gen.go:1090-1091,1523-1527` — via `bun emit-openapi` + `bun sdk` com **regen limpo forçado** (kubb `clean:false` deixa órfãos, BUILD-LOG.md:96) |
| Comentário stale | `ListenEvents.ts:63-65` ("proxied by ui/ConnectChannel") — editar |

### O que CRIAR
1. **Per-service http config isolado** (padrão medscall): hoje o codedm tem UM registry compartilhado keyed por string (`dist/typescript/src/http/config.ts:15,28`) e um só `configureClient({typescript, rust, go})` apontando tudo pra :3030 (`router.tsx:9-13`). Mirror do medscall = módulo http por serviço com symbol próprio (`createConfigManager(Symbol.for(...))`, medscall `src/http/config.ts:14`) e alias `configureGatewayClient` no import — esse nome não existe em lugar nenhum do codedm hoje.
2. **`VITE_GATEWAY_URL`**: `.env.example:58-60` só tem `VITE_PORT`/`VITE_API_URL`; o gateway escuta em `CHANNEL_PORT=3032`. Apontar `configureClient({ go: VITE_GATEWAY_URL })`.
3. **Proxy external? NÃO no padrão codedm-direto.** O medscall USA o proxy (`ChannelProxy` wildcard) — mas o plano do codedm é browser→gateway **direto** via SDK `/go`. Se o founder preferir replicar o medscall literalmente, o artefato seria um `ChannelProxy` wildcard + `forwardToChannel` no api-ts; a análise do codedm assume direto (por isso CORS/X-Owner-Id viram questões, §5). **Isso é uma bifurcação de decisão** — ver §5.1.

### Mapeamento operação-a-operação (tudo já existe em `@codedm/client-typescript/go`, 38 ops)
| Deletado (TS proxy) | Substituto (gateway SDK) | Endpoint Go |
|---|---|---|
| `ConnectChannel` passo 1 (`client.go.getOrCreateChannel`) | `useGetOrCreateChannel({platform:'WHATSAPP'})` (`go/client/getOrCreateChannel.ts:12`) | `GET /channel/channels/resolve` — requer `X-Owner-Id` (`get_or_create_channel.go:13`, `swaggerignore`) |
| `ConnectChannel` passo 2 | go `connectChannel(id)` / `useConnectChannel` (`go/types/ConnectChannelOutput.ts`) | `POST /channel/channels/{id}/connect` → `{id, qrCode?, state}` — QR síncrono |
| `GetChannelPairingStatus` (poll 2s) | `getChannel(id)` / `useGetChannel` (`go/client/getChannel.ts:12`) — retorna enum 5-valores; dialog só precisa `=== 'CONNECTED'` ou porta `normalizeChannelStatus` client-side | `GET /channel/channels/{id}` |
| Import do dialog | `ConnectChannelDialog/index.tsx:6`: `/typescript` → `/go`; **manter** `getHomeDashboardQueryKey` de `/typescript` | — |

### KEEP (não tocar)
SSE `ListenEvents.ts` inteiro (`connected/disconnected/remotes_synced` :67-71) + `BrowserFrameEnricher`; `ConsumeChannelRemotesSynced` + `handlers/external.ts`; leituras BFF `GetHomeDashboard.ts:90` / `GetSetupChecklist.ts:35-44` (tabela `gateway.channels`); todo o gateway Go verbatim; console `ChannelsSection`/`ChannelsCard`/locales.

---

## 3. Gap do porte Go→contracts (veredito CONFIRMED)

WIRE-NEW = 0 — todos os 19 integration events publicados têm slot em contracts (`channel-wire-classification.md:53-71`); 6 slots dormentes. Contracts hoje: 31 wire enums, 36 events (25 `channel-*`). `@unionSlot`/`@variant` existem em ZERO lugares — spec ratificada (`union-slots-spec.md:3`) mas não implementada (`HANDOFF.md:55`, na raiz do repo).

| Enum/evento | Onde vive hoje | Destino no modelo | Bloqueado por union-slots? |
|---|---|---|---|
| 7 enums exact-match (MessageType, Direction, ChatPresenceType, PresenceType, GroupRole, MembershipAction, HistorySyncType) | Aliases `type X = wire.Y` (`internal/channel/enums/*.go`, ex. `message_type.go:3,10`) | contracts | **NÃO — FEITO** (`ef0fffaa`) |
| `ChannelStatus` | Go-local (`channel_status.go:3`): CREATED/CONNECTING/CONNECTED/DISCONNECTED/DELETED | `channel-status.tsp`: DISCONNECTED/PAIRING/CONNECTED — harmonização de valores | Não — deferred pro schema-ownership handoff (`channel-wire-classification.md:401-402`; off-wire) |
| `Platform` (WHATSAPP/INTERNAL) | Go-local (`shared/enums/platform.go:3`) com `IsValid()` :10 que bloqueia alias | `channel-kind.tsp` `ChannelKind` (INTERNAL ausente) | **PARCIALMENTE** — é o discriminador das unions; a reconciliação anda junto da migração union-slot (spec §2.1) |
| `RemoteType` (USER/GROUP/BROADCAST) | Go-local (`remote_type.go:4`) | `contact-kind.tsp` `ContactKind` (USER→CONTACT, ~40 asserções de teste) | Não — harmonização de valores, deferred (:404-406) |
| 14/19 integration events flat (delivered, seen, presence, remotes, memberships, syncs…) | Envelopes hand-rolled `types.IntegrationEvent[Payload]` (`internal/shared/events/*.go`); bindings gerados em `generated/go/wire/events.go` (ex. :242) **não consumidos** (grep contracts = 0) | Swap para bindings gerados | **NÃO** (verdict PARTIAL do ordering) — vários .tsp já são near-exact match (`channel-message-delivered.tsp` ≡ `message_delivered.go:23-31`); bloqueios reais são ortogonais: binding flat vs `IntegrationEvent[Payload]` (`emit-wire-go.ts:136-153`), harmonização de enums, filtro de prefixo do scanner |
| `channel_message.received` (2 slots, 13 variants — `message_received.go:17-31`) | Go-local anotado `@union` | Binding com anotações stampadas | **SIM — o único genuinamente bloqueado** |
| `channel_special_platform_event.received` (1 slot, 1 variant) | Go-local | Contracts JÁ tem declaração opaca `payloadJson: string` (`channel-special-platform-event-received.tsp`) | Fracamente — só se narrowing tipado for exigido já |
| `channel.connected/disconnected/logged_out` | `@union` **sem variants** (`gateway_connected.go:15` etc.) | Contracts já dropou `platformData` (`channel-connected.tsp`) | **NÃO** — union sem variant = oneOf vazio, make-work; migráveis hoje |
| Variant shapes (WhatsAppTextContent…, WhatsAppQRCodeUpdated) | Go-only (`internal/channel/events/`) | FICAM no Go (owner `apiGo`); contracts só registra slot+variant via decorators | Sim — a maquinaria decorator/stamping não existe |
| Surface SSE (`ServerEvent`/`EventPayloads` → SDK) | Scanner AST lê `@union` em structs locais (`pkg/openapi/unions.go:25-79`) | Scanner lendo anotações em bindings + `ListenEvents` composto de schemas gerados | Sim — isso É a implementação union-slots (§5) |
| Tabela `channels` + `shared.events`/`outbox` | Shape medscall via migrações embedded; sqlc espera colunas medscall (hazard vivo: DB real já é contracts-shaped, primeiro `go test` falha em `column "time" does not exist`, :395-400) | Shapes de contracts (`gateway.channels`, `infrastructure.ts`) | Não — handoff phase |
| SDK go barrel RED (40× TS2300) | `dist/typescript/src/go/index.ts:120,501` — 20 identificadores exportados 2× | Kubb deve compilar; causa: `x-enum-varnames` em exatamente 20 schemas do spec Go faz kubb nomear const = type | **NÃO — bug independente, corrigível JÁ** (strippar varnames em `lib/preprocess.ts` ou dedup no barrel) |

---

## 4. Ordem de execução recomendada

O verdict PARTIAL muda a fila do founder (union-slots → pairing): **union-slots NÃO é pré-requisito do pairing nem da maioria do porte de eventos.**

**Union-slots §5 é pré-requisito estrito de exatamente:**
- Swap do binding de `channel_message.received` (o único evento publicado genuinamente bloqueado).
- Surface SSE tipada (`ListenEvents` compondo `z.discriminatedUnion` de schemas gerados, spec §2.2/§2.4) + union-parity rail.
- Reconciliação `Platform`→`ChannelKind` (discriminador de union).

**Pode andar em paralelo / antes (não bloqueado):**
1. **Fix do tsc RED** (kubb `x-enum-varnames`) — desbloqueia tudo que depende de `bun tsc` verde; independente de tudo.
2. **Pairing-direct** — **ortogonal a contracts e union-slots**. Usa o gateway SDK já gerado (38 ops), com o enum 5-valores wire do gateway como está. Não toca em integration events nem em contracts. Depende só do fix do tsc (o SDK `/go` precisa compilar) + das decisões do §5 (CORS/X-Owner-Id). **Pode ser promovido para antes ou junto de union-slots na fila.**
3. **Porte dos 14 eventos flat** — bloqueado não por union-slots mas pelos blockers universais: (i) mismatch binding-flat vs `IntegrationEvent[Payload]` (resolver com payload-struct no codegen ou mudança no alias pattern — afeta TODOS os 19 igualmente), (ii) filtro de prefixo do scanner (`unions.go:38` exclui `template/contracts-go/` — a alegação da spec de "scanner sem alteração" é falsa), (iii) harmonização `RemoteType`/`ChannelStatus`. Resolvidos esses, os 14 migram sem esperar decorators.
4. **Harmonizações de enum** (`ChannelStatus`, `ContactKind`) — deferred pro handoff, sem dependência de union-slots.

**Sequência sugerida:**
1. Fix kubb varnames (tsc verde).
2. Em paralelo: (a) **pairing-direct** (delete proxy TS + rewire dialog + VITE_GATEWAY_URL + CORS); (b) union-slots §5 steps 1-2 (decorators + stamping — com os fixes que a análise de readiness exige: bridge decorator→`x-` extensions no YAML, filtro do scanner, payload-struct); (c) pré-trabalho dos flat events (resolver o mismatch de envelope, que serve aos 19).
3. Union-slots step 3 pilot `message_received` (nota do verdict: `gateway_platform_event` com 1 variant seria pilot de menor risco — defensável nos dois sentidos) → step 4 ListenEvents → step 5 rail.
4. Porte dos 14 flat + 3 connection events (sem union) assim que envelope+enums resolvidos — antes ou durante o step 6.
5. Handoff de schema (channels/events/outbox) por último.

**Correções à spec union-slots que qualquer executor precisa saber** (da análise de readiness): subpath real é `/go`, não `/gateway`; nomes de schema gerados são `channelMessageReceivedPayloadWhatsapp*Schema`, não `whatsAppTextContentSchema`; envelope é `extends IntegrationEvent`, `EnvelopeFields` não existe; nenhuma infra de decorator TypeSpec existe; rail vive em `packages/api/typescript/tests/architecture/`, fora do `test:tooling` sweep.

---

## 5. Riscos e decisões do founder

1. **Proxy vs direto (a decisão-mãe do pairing).** Medscall = proxy wildcard TS (browser nunca vê o Go, auth no hop TS, sem CORS no Go, sem X-Owner-Id no browser). CodeDM-direto = browser→:3032, que exige: adicionar `X-Owner-Id` ao `Access-Control-Allow-Headers` (hoje só `Content-Type, Authorization`, `cors.go:22` — preflight FALHA sem isso), e decidir quem stampa o owner — hardcode `OPERATOR_ID` (`src/auth/operator.ts:15`) no console, já que o `session.go` do gateway espera cookie better-auth que não existe mais no codedm. O proxy medscall evitaria tudo isso ao custo de recriar um contexto `external` no api-ts. **Recomendo decidir isso antes de deletar qualquer coisa.**
2. **apikey story.** Com browser direto, `CHANNEL_GLOBAL_API_KEY` não-vazio é inviável (secret no browser + preflight). Confirmar que allow-all local é a postura permanente single-operator. (No modelo proxy, o apikey poderia ser honrado server-side.)
3. **Vazamento de credentials.** `GET /channel/channels/{id}` retorna `credentials: any` (`go/types/GetChannelOutput.ts`) — aceitável browser-facing? Medscall também serve isso ao próprio app, mas vale confirmar redação.
4. **Erro de gateway indisponível.** Direto = network error, não `BaseError` — `extractErrorCode` degrada bem? A tradução `GATEWAY_UNAVAILABLE` (en.json:455) sobrevive como mapping client-side ou morre?
5. **Fate do `Client` binding** (`shared/registry.ts:38,54-71`): dead code a strippar, ou rail de template para futuros S2S?
6. **E2E**: nenhum spec dirige o dialog hoje; sob `CODEDM_E2E` o dialog direto bate num :3032 inexistente — stub browser-side ou aceitar untested por ora?
7. **Pilot de union-slots**: `message_received` (o mais rico, per spec) vs `gateway_platform_event` (1 variant, menor risco) — escolha deliberada a ratificar.
8. **Rail de arquitetura** (union-parity): morar com os 13 siblings em `tests/architecture/` ou crescer o `test:tooling` sweep (`package.json:67`)?
9. **api-ts importando zod do SDK derivado do Go** (step 4 de union-slots): CLAUDE.md proíbe o **cliente HTTP** da SDK dentro do api; import de schemas gerados é type-only mas deve ser ratificado explicitamente.
10. **Enforcement de X-Owner-Id no Go**: o medscall furou (`connect_channel` é tenant-unscoped). No codedm single-operator o risco é baixo hoje, mas se multi-tenant voltar, `connect`/`getChannel` id-keyed viram furo de tenancy — anotar como dívida.