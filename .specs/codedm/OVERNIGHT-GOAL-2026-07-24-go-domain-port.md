> **⚠️ SUPERSEDED (2026-07-26)** — o port do domínio para Go foi ABANDONADO (branch arquivado em
> `archive/go-domain-port-2026-07-26`). Este doc fica apenas como histórico. O que sobreviveu do
> port foi o substrato SQLite, salvo em **`469eed5b`**; o contrato vigente é
> **`.specs/codedm/GOAL-agent-abstraction.md`**.

# GOAL — Noite CodeDM: PORT go-domain — domínio em Go + SQLite, um sidecar só

> Este documento é o CONTRATO do goal noturno (founder, 2026-07-24). O `/goal` da sessão aponta
> para cá; em divergência entre resumo e este doc, este doc vence.

## Objetivo (o alvo, em uma frase)

Reescrever o **domínio** (hoje em `packages/api/typescript/src`) como **novos contextos Go** sobre o
kernel `template/core-go`, colapsando **2 sidecars + 2 bancos + Redis → UM sidecar Go + UM SQLite
(WAL)**. SQLite escrito como **implementação concreta (não gambiarra)**, com a inicialização do
data-dir **encapsulada no construtor do store** (nada leaky). O **contrato OpenAPI é o invariante** —
o console react e o e2e sobrevivem intactos. Trabalho num **branch REAL (checkout, não worktree)** para
**e2e contínuo** — provar incrementalmente que tudo funciona end-to-end.

## Fontes da verdade (LEIA antes de agir — estado DERIVADO de `git log`, nunca presumido)

- **`.specs/codedm/go-domain-design.md`** (branch/worktree `go-domain`, `fec1e623`) — direções
  RATIFICADAS + decisões abertas (§3), aqui FECHADAS (ver "Decisões fechadas" abaixo).
- **`packages/api/go/internal/channel/`** = o **shape de referência** de "contexto Go sobre o core"
  (controllers/entities/enums/events/handlers/repositories/usecases + `module.go` fx). Cada contexto
  novo nasce limpo — sem herdar débitos do channel (spoof-guard/tenancy, Noop UoW).
- **As skills Go** (`.claude/skills/<skill>/go/`) + **a CLI** (`bun cli`, `docs/CLI.md`) = os
  playbooks de scaffolding. Todo componente nasce por skill/CLI, não à mão.
- **`packages/contracts/wire/` (TypeSpec) + a OpenAPI emitida** = o invariante (mesma disciplina
  wire-identity da flat-events). Enums do domínio TS a portar: `packages/contracts/wire/enums/`.
- **Fundações da branch `go-domain`** a PROMOVER pra concreto: `packages/contracts/db-sqlite-poc/`
  (pipeline Drizzle-sqlite→migration→sqlc→Go, round-trip verde, `modernc.org/sqlite` puro-Go) +
  `packages/contracts/go-domain-poc/mediator/` (esqueleto `SqlExternalMediator`).
- **`.specs/codedm/2026-07-24-fundamentals-and-upstream.md`** — o handoff da sessão (E1 = este port).

## Inventário do porte (o que vira contexto Go novo)

Domínio hoje em `packages/api/typescript/src/`: `artifact · auth · external · issue · owner · shared ·
terminal · thread · ui · workspace`. Go hoje: `internal/{channel, shared}`.

| Origem TS | Vira | Nota |
|---|---|---|
| `workspace · thread · issue · artifact` | **contexto Go novo** | o coração do domínio |
| `ui` (BFF/home-dashboard/attach-wizard) | **query services Go** (contexto `ui`) | read-models; a lista de channels passa a ler o MESMO store do gateway → split-DB morre |
| `owner · auth` (single-operator) | **middleware/operator fino em Go** | `OPERATOR_ID` const (founder decision 2); sem better-auth |
| `external` (ChannelProxy) | **ELIMINADO** | binário único — o channel vive no mesmo processo; sem proxy cross-service |
| `terminal` (Bun.Terminal engine) | **spike-first** (ver decisão (e)) | contexto de MAIOR risco |
| `shared` (mediators/outbox) | **já é `core-go`** | promover o `SqlExternalMediator` |
| `channel` (gateway) | **fica Go** | migra de Postgres → o MESMO SQLite |

## Decisões fechadas (o founder resolveu as abertas do §3 do design)

- **(a) Dialeto pg→sqlite → Opção A (dialeto SQLite único).** Reescrever `packages/contracts/db/schema/`
  em `drizzle-orm/sqlite-core`; namespaces viram prefixo de tabela (`thread_threads`, `issue_issues`,
  `gateway_channels`, `shared_outbox`, …); enums = `text` + `CHECK (col IN (...))`. Mapeamento de tipos
  (o shape do PoC): `uuid`→`text`, `timestamptz`→`integer { mode:'timestamp_ms' }`, `jsonb`→`text
  { mode:'json' }`, `bigint`→`integer`. O schema pg é **substituído** (fresh start, ver (d)).
- **(b) Notify → InternalMediator in-process** (alvo = binário único). `SqliteWalPollingStrategy`
  fica apenas para o modo desktop-multi-processo interino; se Go colapsa tudo num processo, o
  in-process cobre a entrega.
- **(c) Consumer-groups → (iii) SEM grupos.** Single-operator: um consumidor por direção; o dedup
  UNIQUE no destino (`consumed_messages` + `ON CONFLICT DO NOTHING`, já provado) cobre redelivery =
  exactly-once. Claim de outbox = `UPDATE … SET claimed_by/lease_until WHERE id IN (SELECT … WHERE
  processed_at IS NULL AND (lease_until IS NULL OR lease_until<now) LIMIT n)` sob txn IMMEDIATE.
- **(d) Migração de dados → Opção C (fresh start).** NÃO migrar PGlite→SQLite (pré-multi-usuário;
  mensagens/remotes re-sincam do WhatsApp). Só o SCHEMA nasce squashed da fonte Drizzle-sqlite.
- **(e) Terminal → spike-first.** Provar paridade `Bun.Terminal` em Go (`creack/pty` + ConPTY no
  Windows) contra o **claude real** (método D1/D2 da fase 10) ANTES de portar. Paridade → portar o
  contexto `terminal` em Go. **Sem paridade numa janela limitada → exceção HONESTA documentada**
  (terminal fica TS como sidecar por ora + founder decide). O alvo é "só Go", mas o terminal é o §3(e)
  — respeitar o risco.

## Regras de processo (invioláveis)

1. **Branch REAL, não worktree:** `git checkout -b go-domain-port` a partir do `main` completo. Sequencial;
   e2e contínuo. UM committer.
2. Fase substantiva = **workflow**: builder + 2 juízes opus adversariais (bar ≥90 sem critical) + fix loop
   ≤2. Below-bar após fix extra → **PARKEAR** com findings completos no BUILD-LOG e seguir.
3. **Contexto novo = skills Go + CLI**, nunca à mão. `internal/channel` é o shape; cada contexto nasce
   limpo. Ordem por dependência.
4. **OpenAPI wire-identity é o invariante:** a OpenAPI emitida pelo Go (`cmd/openapi`) bate com o contrato
   (mesmo shape/enums/returns). **Enums do domínio Go ALIAS das wire enums do contrato** — nunca
   redeclarar value-set. `bun sdk` regenera; **`react tsc` + `e2e tsc` nos gates** (a lição do ripple de
   enum: `PlatformEnum`/`CONTACT`).
5. **SQLite concreto:** `modernc.org/sqlite` puro-Go (sem cgo), **WAL**, `//go:embed migrations/*.sql`.
   **Data-dir init ENCAPSULADO no construtor do store** — o caller passa um path (ou nada → default por
   plataforma); o store cria o dir, aplica WAL, roda as migrations embutidas, adquire o lock. **Zero
   `CODEDM_DATA_DIR` vazando pelas camadas.** Não é gambiarra: é o `Store` dono do seu ciclo de vida.
6. `--no-verify` só com gates à mão + justificados no commit; **pathspec staging** (nunca `git add -A`);
   **BUILD-LOG por fase**; commits convencionais; `git mv` preserva história; **tudo local** (zero
   push/fetch).
7. **e2e CONTÍNUO:** após cada contexto portado, rodar o **boot smoke** (um binário Go boota, SQLite migra
   pelo `//go:embed`) + o **e2e** + a **OpenAPI wire-identity**. O app funciona end-to-end incrementalmente
   — é o ponto de o founder ter pedido checkout real.
8. Decisão genuína de founder emergindo → `.specs/codedm/OVERNIGHT-BLOCKED.md` + BUILD-LOG, pular SÓ aquela
   fatia, continuar. NUNCA inventar.

## Fase 0 — Substrato: SQLite + mediator + pipeline (fundações → concreto)

- **Schema em dialeto SQLite (Opção A):** reescrever `packages/contracts/db/schema/*.ts` em `sqlite-core`
  (tabelas prefixadas, enums text+CHECK, mapeamento de tipos de (a)). `drizzle-kit generate` (dialeto
  sqlite) → migrations SQL squashed. As migrations pg golang-migrate/drizzle NÃO se portam (fresh start).
- **`SqliteStore` concreto** (`core-go`, `modernc.org/sqlite`): construtor `NewSqliteStore(dataDir string)`
  encapsula mkdir + WAL PRAGMA + `//go:embed migrations` aplicadas no boot + lock single-instance. Sem env
  leaky. Promover o `db-sqlite-poc` para este store real.
- **`SqlExternalMediator` concreto** (`core-go`): outbox-as-transport, `InternalMediator` in-process para o
  binário único, `SqliteWalPollingStrategy` só pro interino. **Redis eliminado** (`redis_mediator.go`
  removido/aposentado). Claim de outbox conforme (c).
- **`sqlc` PULL** do schema sqlite → structs+queries tipadas (gotchas do PoC: schema normalizado, colunas
  explícitas, `sqlc.arg()`, sem `RETURNING` → `:exec`+Get).
- Gate: pipeline round-trip verde; `SqliteStore` boota+migra num tmpdir; o mediator entrega um evento via
  outbox (teste); `go build/vet/test` verdes.

## Fase 1..N — Port dos contextos (novos contextos Go, e2e contínuo)

Por dependência: **owner/auth (operator fino) → workspace → thread → issue → artifact → ui (BFF)**.
`external`/ChannelProxy **eliminado**. Para CADA contexto:
- Scaffold por **skill Go + CLI** (entity/value-object/enum/schema/usecase/query/controller/repository/
  service/event/handler/projector + `module.go` fx), shape do `internal/channel`, contexto limpo.
- **Enums** = alias das wire enums do contrato. **Repositórios** = queries sqlc sobre o `SqliteStore`
  (queries dinâmicas à mão sobre os structs gerados; casts de tipo corretos — a lição do outbox
  `uuid`).
- **OpenAPI wire-identity:** `cmd/openapi` emite o shape do contrato; `bun sdk` regenera; `react tsc` +
  `e2e tsc` verdes. Os controllers retornam o MESMO shape/enums/status que o TS retornava (o console não
  muda).
- **e2e + boot smoke** após o contexto entrar. O `ui` (home-dashboard) lendo o MESMO SQLite do gateway é o
  momento em que **a lista de channels passa a mostrar CONNECTED** (split-DB morto).

## Fase T — Terminal (spike-first, o contexto de maior risco)

- **Spike primeiro:** provar paridade `Bun.Terminal`↔Go (`creack/pty` + ConPTY) contra o **binário claude
  real** (mesmo método D1/D2 da fase 10 — spike ANTES de ratificar). Cobrir os gotchas caros já
  conhecidos (ESC→`\r`, markers whitespace-squashed, `encodeCwd` realpath, env scrub CLAUDECODE/*).
- Paridade → portar o contexto `terminal` em Go. **Sem paridade na janela → PARKEAR** (terminal fica TS,
  exceção documentada no OVERNIGHT-BLOCKED, founder decide) — e o "um sidecar só" vira "um sidecar Go +
  o runner de PTY TS interino", honestamente reportado.

## Fase C — Colapso dos sidecars

- **UM binário Go + UM SQLite.** O daemon TS é aposentado (ou reduzido só ao runner de terminal se o spike
  falhou). `channel` + os contextos de domínio + o mediator num só binário; o shell Tauri supervisiona
  **UM** processo. `//go:embed migrations` nativo (a dor do `bun --compile`/wasm-embed some).
- Reconciliar com a máquina de sidecar do desktop (o manifesto de sidecars vira 1 entrada Go). A OpenAPI e o
  console não mudam.

## Fase D — Fechamento

- Gates FULL na branch: `go build/vet/test` nos 2 módulos (`api-go` + `go -C core`); **OpenAPI wire-identity**
  (emitida == contrato); `bun sdk` 2x idempotente + **`react tsc` + `e2e tsc`**; **e2e** (o invariante — o
  app funciona); **boot smoke** (um binário boota, SQLite migra, `resolve` → 200 + eventos fluem → a **lista
  de channels mostra CONNECTED**, split-DB eliminado).
- BUILD-LOG por fase; **`.specs/codedm/OVERNIGHT-REPORT.md`** (commits por fase, PARKED com findings,
  decisões aguardando founder); `git status` limpo. **`main` INTOCADO** — o port vive na branch
  `go-domain-port`.

## Critérios de conclusão (o avaliador verifica TODOS)

1. Branch `go-domain-port` existe (checkout REAL, não worktree); `main` intocado.
2. **Substrato concreto:** SQLite `modernc` puro-Go + WAL + `//go:embed`, **data-dir encapsulado no
   construtor** (zero env leaky); pipeline Drizzle-sqlite→sqlc verde; `SqlExternalMediator` concreto;
   **Redis eliminado**.
3. Contextos portados como **NOVOS contextos Go** via **skills+CLI** (não à mão), shape do `channel`;
   **enums = alias das wire enums**; **OpenAPI wire-identity** batendo o contrato.
4. Terminal portado em Go **OU** exceção honesta documentada (spike executado).
5. **Um sidecar Go + um SQLite**; daemon TS aposentado (ou só terminal); shell supervisiona um processo.
6. **e2e verde end-to-end**; boot smoke (`resolve` 200 + eventos → lista CONNECTED); **split-DB eliminado**
   (o `ui` lê o mesmo store do gateway).
7. Gates full verdes; OVERNIGHT-REPORT + BUILD-LOG; git limpo; **zero push remoto**; zero escopo proibido
   (contrato OpenAPI shape, tenancy, push).
