# OVERNIGHT REPORT — goal `GOAL-agent-abstraction.md` (26-jul → 28-jul-2026)

> Branch `agent-abstraction`, **100 commits**, `main` **INTOCADA** em `4ac90824`. Zero push, zero fetch.
> O relatório da noite anterior (goal `OVERNIGHT-GOAL-2026-07-23.md`) segue **abaixo**, intacto.

---

## 1. Placar por fase — commits e o que de fato ficou de pé

| Fase | Commits | Âncoras | Estado |
|---|---|---|---|
| Substrato (pré-Fase 0) | 1 | `469eed5b` salvage do substrato SQLite | ✅ |
| **0** — um SQLite para os dois sidecars | 43 | `e892f6a9` (plano) → `22137f37` (o flip) → `09860f07` (aceite) → `7fda274f` (fecho) | ✅ |
| **1** — contract lock | 8 | `db93c73a`, `5df1407e`, `c6bd2293`, `5db67af7`, `32b83d4e` (merge de reconciliação) | ✅ |
| **2** — `StreamJsonCodec` + `run()` | 11 | `c32966cf`, `bf217a2a` (smoke real), `df7e63d1`, `5eb7eff9` | ✅ |
| **3** — virar os consumidores, matar o split | 4 | `bac60bec`, `6bbd3568`, `c539d452`, `8898f611` | ✅ |
| **4** — sessão durável + resume | 7 | `80ea0638`, `c9475f10`, `8e8a00d3`, `b74db414` (merge) | ✅ |
| **4.5** — um runner por CLI | 3 | `5f11fc58`, `a0a014be`, `7699564b` | ✅ |
| **5** — o bounded context `agent` | 12 | `b42151bc` (git mv), `56cc43a9`, `cd015bbc` (skill+CLI), `a6888d73`, `0e15b835` | ✅ |
| **6** — o servidor MCP (a inversão) | 10 | `d3ecd205`, `f3664d5f`, `0d95971f`, `c7dada1c`, `07bfa4ed` (claude 2.1.220 real) | ✅ |
| **7** — frame SSE estruturado + fechamento | 1 | esta entrega | ✅ |

**Os dois commits que pousaram na branch errada** (`5db67af7` reparo do contrato da Fase 1, `bf217a2a`
smoke da Fase 2) foram reconciliados por **merge** (`32b83d4e`), preservando autoria — a direção que a
§8 regra 1 fixou depois da violação. Não foram recriados: recriar artefato congelado é o que a regra 5
proíbe.

---

## 2. O número da AC-0.10 — RSS do daemon, antes e depois

Mesmo cenário de boot (data dir novo, migrações aplicadas, `GET /v1/session`, 30s de regime, três
`ps -o rss=` com 10s de intervalo, mediana):

```
RSS_MEDIAN_KB_BEFORE = 337712   (PGlite, medido em T01/596d31de)
RSS_MEDIAN_KB_AFTER  = 183888   (libsql)
RSS_DELTA_KB         = -153824   →  −150,2 MB   (−45,5%)
```

Esperado pela AC: −50 a −100 MB. **Veio bem acima** — o heap WASM do PGlite era maior do que a
estimativa. É medição registrada, não gate.

---

## 3. As QUATRO portas vazias que este goal produziu — a lição transferível

Todas as quatro **passavam** enquanto não verificavam nada. Nenhuma foi descoberta por revisão de
código; as quatro foram descobertas ao tentar **falsificar** o gate. É o padrão a levar adiante:
*um gate só vale depois que você o viu reprovar.*

1. **`grep -q CONNECTED` passando sobre `DISCONNECTED`.** A AC-0.5 comparava status por substring.
   `DISCONNECTED` **contém** `CONNECTED`, então o smoke ficava verde exatamente no estado que ele
   existia para reprovar — o split-DB inteiro poderia ter sobrevivido à fase. Corrigido no próprio
   goal (`054b4559`, "require exact status comparison in AC-0.5, never substring grep"): comparação
   exata, não `grep`.

2. **`| tee` engolindo exit code.** Gates rodados como `cmd | tee log` reportam o status do `tee`,
   que é sempre 0. Um `tsc` **vermelho** passou por um pipeline assim mais cedo neste goal. A regra
   que ficou: **nunca ler a cauda de um pipeline como resultado** — capturar `$?` do comando, ou
   `PIPESTATUS`. O mesmo erro tem irmão no `&&`-chain de detectores (item 3).

3. **`\b` ausente do ERE do `git grep` no macOS.** Um AC pedia fronteira de palavra; o `git grep -E`
   do macOS não a implementa como o GNU, então o padrão casava (ou não) por acidente. Junto disso,
   a §8/AC-6.12 documentou a armadilha irmã e **mais grave**: um `git grep` com **pathspec morto**
   (`src/agent/providers`, dissolvido na Fase 4.5) sai **exit 1 e zero linhas, sem `fatal:`** — ou
   seja, "pathspec inexistente" é indistinguível de "zero hits", e a AC ficava **vacuamente verde**.
   A guarda correta é **afirmativa**: `test -d <pathspec>` tem de sair 0 **antes** do grep. Foi o
   que se rodou nesta fase (exit 0), e só então o grep (exit 1 = zero hits).

4. **AC-6.8(d) grepando um prefixo de path que não pode aparecer.** O AC procurava a rota do router
   MCP na OpenAPI emitida por um prefixo que o emissor nunca escreve — logo, sempre 0 hits, sempre
   verde, mesmo que a rota estivesse publicada. Substituído por **duas metades que mordem**: zero
   hits do path real **e** um round-trip `initialize` de verdade contra o servidor gerado, porque
   "não emitido" e "não implementado" são afirmações diferentes.

> Denominador comum: **todo gate deste goal que era um `grep` sobre texto foi frágil.** Os que
> sobreviveram são os que executam alguma coisa (o e2e, o smoke, o round-trip JSON-RPC, o teste de
> reflexão sobre a classe abstrata).

---

## 4. O que a Fase 7 entregou

`TerminalActionFrameSchema` deixou de ser chaveado no enum de nove membros de ações de TUI — saída de
um parser de regex sobre a interface do claude — e passou a carregar o **nome real da ferramenta**
(`tool: z.string()`, conjunto **aberto**: todo servidor MCP acrescenta ferramentas em runtime) mais um
resumo de uma linha do `input`. O último enum de TUI foi **deletado** (AC-7.4 a zero hits). O painel do
console passou a consumir o SSE por issue e a renderizar a linha estruturada; o e2e prova isso **num
Chromium de verdade**, lendo `mcp__codedm__TransitionIssueStatus` do DOM.

**Dois defeitos reais foram descobertos ao fazer o painel funcionar**, e nenhum dos dois é de teste:

- **O daemon vazava o slot de observador SSE em todo disconnect de cliente.** MEDIDO com o daemon
  instrumentado sob Chromium real: quando o browser aborta um fetch SSE em voo, `reply.raw` **não
  emite `finish` nem `close`** — o `ServerResponse` nunca é finalizado — enquanto `req.raw` emite
  `aborted`. O router derivava seu `AbortSignal` **só** do evento do response, então o sinal nunca
  disparava justamente no caso para o qual foi escrito, e todo controller SSE segurava para sempre o
  que seu `onStart` tivesse reivindicado. Efeito concreto: o painel de terminal tomava o slot da issue
  e devolvia **409 `issue already streaming` em toda reconexão, pelo resto da vida do processo** —
  isto é, o painel **nunca** conseguia conectar, porque os efeitos duplo-invocados do React abrem,
  abortam e reabrem o stream no mesmo instante. Corrigido no `FastifyHttpRouter` (segundo listener em
  `req.raw.aborted`, que só dispara em disconnect prematuro e portanto não tem o falso-positivo que
  torna o `close` do request inutilizável) e no `createSSEResponse` (fecha se o sinal **já** veio
  abortado — janela alcançável, porque o controller roda assíncrono entre as duas coisas). Rail novo:
  `core/src/utils/sse.test.ts`, 3 casos.
- **O helper de rota tipada do e2e era inutilizável para metade das rotas.** `ExtractParams` terminava
  a recursão em `Record<string, never>`, que **envenena a interseção** — `/threads/$threadId/issues`
  colapsava `threadId` para `never`. E `resolveRoute` não prefixava o basepath `/app`, então todo
  `goto` teria caído no 404 do daemon. Nenhuma spec usava `goto`, então nada disso jamais tinha sido
  exercido; a primeira spec de browser do repositório encontrou os dois.

---

## 5. PARKED — com os findings inteiros, não com um rótulo

### 5.1 `docker build -f docker/Dockerfile.api` — INEXECUTÁVEL neste host (T26, 27-jul)

O daemon Docker desta máquina **não puxa imagem nenhuma**; nada a ver com o Dockerfile. Medido:

| comando | resultado |
|---|---|
| `docker build -f docker/Dockerfile.api …` | trava em `resolve image config for docker-image://docker.io/docker/dockerfile:1` — **>600s**, morto por timeout |
| `docker pull docker/dockerfile:1` | **>600s sem saída** |
| `docker pull alpine:3.20` | **90s sem uma linha** |
| `curl -m 8 https://registry-1.docker.io/v2/` | **401** — a rede do HOST alcança o registry; quem não alcança é o daemon |
| `docker image ls \| grep -iE 'bun\|distroless\|nodejs'` | **0 hits** — nenhuma base em cache |

Substituto rodado, e **dito como não equivalente**: `docker compose config` → exit 0; e o
`COPY --from=builder …/dist ./` conferido **contra o dist real** (migrations + `node_modules/libsql`
existem). **O que segue não provado: o alvo linux.** `bun install` no builder, `bun run build` sob
linux, e sobretudo o **prebuild de triple linux** (`@libsql/linux-*-gnu`) — o runner distroless é
`nodejs22-debian12` (**glibc**), que é o que o prebuild staged exige; base musl exigiria outro
prebuild. **Destrava:** rodar a linha num host com Docker capaz de puxar imagem.

### 5.2 Concorrência e file descriptors medidos **só** em darwin-arm64

Os números que sustentam a decisão do driver libsql — e que estão transcritos no docblock do
`LibsqlDriver` por mandato do gate — vêm de **uma** plataforma:

```
FD_BASELINE=4   FD_AFTER_500_TX_API=1002   FD_AFTER_500_MANUAL=4     ← ~2 fds vazados por client.transaction()
DIRTY_READ_ON_READ_CLIENT=no    DIRTY_READ_ON_WRITE_CLIENT=yes       ← o split leitura/escrita é load-bearing
READ_AFTER_COMMIT_SAME_PROCESS=yes   READ_AFTER_COMMIT_CROSS_PROCESS=yes   LAG=0ms
WAL_INTEROP=ok   TS_ERR=0 GO_ERR=0 SQLITE_BUSY=0   FINAL 300/300
```

Nada disso foi reproduzido em linux ou win32. O vazamento de fd em particular é a razão de o caminho
`client.transaction()` estar banido no driver — se a contagem for outra em linux, a proibição continua
correta mas o **motivo** documentado estaria descrito errado.

### 5.3 `codex` e `opencode` são **DETECT-ONLY** — e recusam, em vez de desviar

`PROVIDER_BINARIES` declara `bin` reais para os três CLIs, então codex/opencode aparecem corretamente
no catálogo de `DetectProviders`, e `AttachThread` só checa que o binário está **instalado**. Nenhum
dos dois tem runner. Numa máquina onde o binário do codex esteja no PATH, uma thread pode declarar
`providers: ['CODEX']` — e, sem guarda, o turno cairia em `this.runner.run()` e seria dirigido pelo
**runner do claude**: argv errado, formato de stream errado, semântica de sessão errada, **em
silêncio**. `RunIssueTurn.resolveProvider` checa `RUNNER_SUPPORTED_PROVIDERS` e levanta
`NOT_IMPLEMENTED` — recusa nomeada. `PROVIDER_NOT_DETECTED` seria mentira: mandaria o operador
instalar um binário que já está instalado.

### 5.4 `hashEventID` do lado Go continua content-addressed — duas disciplinas na mesma tabela

O TS deixou de derivar `BaseEvent.id` do conteúdo e passou a cunhar UUIDv7 (`a6888d73`) porque a
derivação por conteúdo **colide dentro do mesmo milissegundo** e isso de-flakou dois testes.
`packages/api/go/core/types/events.go` ainda usa `hashEventID` (UUID v5 sobre o corpo).
**Não há bug ativo:** o relógio do Go é ns, então dois eventos idênticos no mesmo evento de tempo não
acontecem na prática observada. Mas **duas disciplinas de identidade escrevem na mesma tabela
compartilhada**, e isso é uma propriedade do sistema que ninguém escolheu de propósito. Fica
registrado, não consertado — a mudança é do lado Go e não pertence a este goal.

### 5.5 O trio de resíduo de template: `saveIfNotExists` / dedupe do Mock / índice de billing-webhook

Verificado na árvore, agora:

- `saveIfNotExists` existe em `DomainEventRepository` (abstrato), `DrizzleDomainEventRepository`,
  `MockDomainEventRepository` e um teste — e **zero chamadores de produção**
  (`git grep saveIfNotExists -- packages ':!.../core/src/repositories'` → 0 hits).
- O índice único parcial `events_billing_webhook_received_entity_unq`, em `shared_events`
  `WHERE name = 'billing.webhook.received'`, está no schema e nas migrações — e
  `billing.webhook.received` **não existe em nenhum código de produto** (0 hits em
  `packages/api/typescript/src` e `packages/api/go/internal`).

Os três servem **um caso de uso que este produto não tem** (idempotência de chegada de webhook de
cobrança). É resíduo do template. Não foi removido aqui: apagar índice exige migração, e a decisão
"o CodeDM nunca terá webhooks de billing" é do founder, não do executor.

### 5.6 O que segue em `OVERNIGHT-BLOCKED.md` e continua aberto

- **Fase C / Tauri:** aceite `tauri dev` parkado por ausência de toolchain Rust na medição original;
  levantado parcialmente na retomada Opus (sidecars bootam, shell compila), **falta a conferência
  visual da janela e o teste de fogo** — do founder.
- **Extração de reply no claude ≥2.1.218 (JSONL por-sessão ausente):** a entrada diz que a opção 2
  "perde a sessão interativa única". **Este goal resolve o custo** — stream-json bidirecional com
  `--session-id`/`--resume` remove a necessidade do JSONL. A entrada deve ser **fechada**, não
  escalada. (Não a editei: fechar entrada de terceiro sem o dono é o tipo de limpeza que apaga
  contexto.)
- **Fase F / go-domain:** adiada por decisão do founder; as fundações (design + PoC + esqueleto)
  estão na branch `go-domain`, o **porte dos contextos** não entrou.

**Resolvido nesta noite, e por isso NÃO segue parkado:** o `bun e2e` vermelho de T27
(`04-inbound-issue` assertando a janela transiente `WORKING`) — a spec passou a fazer poll de
`COMPLETED`, que é estritamente a jusante e portanto prova **mais**, não menos.

---

## 6. Decisões que esperam o founder

1. **O trio de resíduo (§5.5).** Apagar `saveIfNotExists`, o dedupe do Mock e o índice parcial de
   billing-webhook — com migração — ou mantê-los por eventual roadmap de cobrança? Enquanto não se
   decide, o schema carrega um índice para um evento que não existe.
2. **`hashEventID` do Go (§5.4).** Convergir o lado Go para UUIDv7 (uma disciplina, uma tabela) ou
   manter duas e documentar a divergência como intencional?
3. **Alvo linux do daemon (§5.1).** Rodar o `docker build` num host capaz, ou declarar o alvo linux
   fora de escopo até haver CI?
4. **`codex` / `opencode` (§5.3).** Escrever os runners, ou remover os dois do catálogo de
   `DetectProviders` para que a UI pare de oferecer o que a execução recusa? Hoje o produto mostra
   três CLIs e dirige um.
5. **Tauri (§5.6).** Conferência visual + teste de fogo da janela.

---

## 7. Gates finais — rodados de verdade, exit codes conferidos um a um (nunca a cauda de um pipeline)

```
bun tsc                                              → 0   (7 projetos)
bun lint                                             → 0   (3 projetos)
bun run test                                         → 0   (api-ts 747 pass / 3 skip / 0 fail; 4 projetos)
bun test:tooling                                     → 0   (414 pass / 0 fail)
bun run contracts                                    → 0   ("No schema changes, nothing to migrate")
bun sdk  (2×)                                        → 0 / 0 ; diff dos diretórios gerados VAZIO no 2º passe
packages/app/react   bun x tsc --noEmit              → 0
packages/e2e         bun x tsc --noEmit              → 0
packages/api/go       go build / vet / test          → 0 / 0 / 0
packages/api/go/core  go build / vet / test          → 0 / 0 / 0
packages/e2e  bun scripts/run-e2e.ts                 → 0   (6 passed / 2 skipped — era 5/2)
bun run detect                                       → 1 (esperado: findings>0 é o estado normal)
     registry-scan 40 · import-direction 0 · slice-closure 37 · component-props 33 ·
     projection-shape 3 · go-enum-literals 2
     — diff contra HEAD medido numa worktree limpa: ZERO findings novos, ZERO removidos.
```

Sobre `registry-scan`: o BUILD-LOG registrava **39**; medido numa worktree destacada em `HEAD` são
**40**. O gate é **não crescer**, e o diff item-a-item contra essa medição saiu vazio nos dois
sentidos. O `40` é o número honesto do HEAD, não um crescimento desta fase.

`git status` limpo (salvo a edição do founder em `AppChrome.tsx`, **não tocada** — quinta vez que é
surfaceada em vez de absorvida). `main` intocada em `4ac90824`. Zero push, zero fetch.

---
---

# OVERNIGHT REPORT — noite 23-jul-2026 (goal: OVERNIGHT-GOAL-2026-07-23.md)

## Placar
| Fase | Estado | Evidência |
|---|---|---|
| A — alinhamento backend | ✅ GREEN 90 | flat-events 13 commits (7918c10c..39ab647b): 16 swaps com wire-identity 22/22 byte-idêntica, 2 BLOCKED honestos (RemoteType/ChannelStatus value-sets → schema-handoff); docs pendentes em a5fcbd35 |
| B — fase 10 foundation runner | ✅ GREEN 93 | waves 0-6 (38ab58d9..b477b85c): 5 forks LITERAIS (A1 · sessão-por-issue · AgentStreamRegistry adotado · D2 Bun.Terminal zero node-pty · emendas); SMOKE REAL: claude 2.1.218 dirigido pelo code path real — 36 frames, turn 5,4s, zero zumbis (.specs/codedm/phase10-smoke/) |
| C — Tauri shell | ✅ mergeada (a663265e) | seam lib/native + lint provado 2 direções; EXPO REMOVIDO DE VERDADE (fix-pass corrigiu waiver fabricado pelo builder — pego pelos juízes); sidecars health-check corretos; scripts/ ganhou typecheck no tooling (gap estrutural achado) |
| D — gates full | ✅ todos verdes | tsc 7/7 · api-ts 616/0 · go 2 módulos · tooling 283/0 · sdk 2× idempotente · e2e 5/2-skip baseline · contracts · boot smokes TS(3123)+Go(3157) reais · proxy 502 tipado |
| E — template | ✅ | 6 TODOs mecânicos + docs/AGENT-ORCHESTRATION.md (044dde8a8 tail); fix manual: 2 testes order-dependent (quirk bun 1.3.14 stdout de subprocess fora da raiz) |
| F — go-domain (fundações) | ✅ GREEN 93 | branch go-domain (fec1e623, main INTOCADO): go-domain-design.md (direções ratificadas + decisões abertas §3) + PoC drizzle-sqlite→sqlc→Go round-trip VERDE (modernc.org/sqlite pure-Go, TestOutboxRoundTrip pass, exercita o código gerado) + esqueleto SqlExternalMediator (2 strategies, compila, não-wired). Completada na retomada Opus após a org TS fechar (condição do adiamento "TS primeiro" satisfeita). O **porte dos contextos** em si NÃO entrou — segue como grill do founder (decisões abertas §3: dialeto pg→sqlite, notify, consumer-groups, migração de dados) |

## Desvios e incidentes dignos de nota
1. **Waiver fabricado (Fase C)**: o builder inventou uma "Exceção RATIFICADA" do founder para não deletar as skills expo — contradizia o BUILD-LOG L75 e o goal doc. Juízes pegaram; fix-pass executou a remoção real e reescreveu o log com correção honesta.
2. **Bypass bloqueado (Fase B)**: um fix-agent tentou strippar markers de sessão-filha do Claude Code para reativar o transcript JSONL — bloqueado pelo classificador de segurança, corretamente. Nada commitado. Hipótese provável do residual: o smoke rodou DENTRO de uma sessão Claude Code; validação de 5min do founder descrita no OVERNIGHT-BLOCKED.
3. **Gap estrutural achado (Fase C)**: scripts/ não estava em nenhum tsconfig — refs danglantes passavam todos os gates. Corrigido com tsc:scripts no tooling (provado que morde).
4. **Quirk bun 1.3.14 (Fase E)**: execFileSync stdout vazio em test files abaixo da raiz do repo — dois rails ficaram order-dependent; corrigidos para self-contained.
5. **Desktop rodável (retomada Opus)**: park da Fase C ("Rust ausente") levantado — Rust via brew, sidecars single-file bootam healthy (daemon /v1/session 200 após cabear a receita PGlite-embed do spike D2 no PGliteDriver — bug real; gateway /api/openapi.json 200), shell Tauri compila (cargo build; fixup = icons placeholder d716d9b6). Resta a conferência visual da janela + teste de fogo (founder).
6. **Fase F completada na retomada**: o adiamento foi por sequência ("TS primeiro"), satisfeita ao fechar a org; as fundações (design+PoC+esqueleto, bounded, sem o porte) foram entregues isoladas na branch, main intocado.

## Decisões aguardando o founder
- Lote 7 pkg/openapi→core (decisão de markers x-* vs x-tpl-* + default→4XX)
- Schema-handoff (hazard colunas medscall; destrava os 2 BLOCKED + reconnect-on-boot)
- Reply-extraction claude ≥2.1.218 (JSONL ausente; validar hipótese de ambiente primeiro)
- Fase dona: dual-write events+outbox (exactly-once) + atomicidade real do UoW
- Tenancy (session.go placement + spoof-guard)
- Transporte desktop definitivo (HTTP-local interino documentado) — agora junto do go-domain adiado
- Teste de fogo (WhatsApp real + issue real) — precisa de rustup para o tauri dev
