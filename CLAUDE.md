# Claude Code Configuration — template-fullstack

## Project Overview

template-fullstack is a polyglot fullstack platform template built across **TypeScript + Bun** and **Go**, with two frontends — **React web (TanStack Start + Vite)** and **Astro 5 landing/blog** — backed by a **single Postgres** with **Drizzle migrations** and **TypeSpec-sourced contracts** generating cross-language SDKs. The desktop surface is the react console hosted inside a **Tauri v2** shell (`packages/app/tauri`).

Domain-agnostic: the base ships **auth, multi-tenancy (single `ownerId` axis), billing + quota, notifications** — a product grafts its own bounded contexts on top. Membership/roles live as a Tier-3 exemplar in `examples/tenant-membership`.

## Workspaces

| Path | Stack | Role |
|---|---|---|
| `packages/contracts` | TypeSpec + Drizzle | Source of truth: cross-boundary enums, integration events, DB schema |
| `packages/contracts/generated/{ts,go,rust}` | codegen output | Per-language wire bindings consumed by services (rust = crate standalone `codm-contracts-rust`, path dep do shell Tauri) |
| `packages/api/typescript` | Bun + Drizzle + tsyringe | Auth, reads, projections, BFF queries |
| `packages/api/go` | Go + database/sql + fx + net/http | Workers, indexers, schedulers |
| `packages/app/react` | React + Vite + TanStack Router/Start | App (`/app/...`) — auth, dashboards, mutations |
| `packages/app/astro` | Astro 5 + MDX + Tailwind 4 | Landing pages + blog + SEO (served at `/`, with locale prefixes) |
| `packages/app/tauri` | Tauri v2 (Rust shell) | Desktop shell hosting the react console + TS/Go sidecars (see `.claude/skills/desktop-shell/SKILL.md`) |
| `packages/app/styles` | CSS (design tokens) | Shared tokens consumed by `app-react` + `app-astro` (`@codm/app-styles/tokens.css`). |
| `packages/client/{ts,go,rust}` | Kubb / oapi-codegen / progenitor | Symmetric SDKs (each consumes all 2 backends; rust = crate standalone `codm-client-rust`, enums de contrato deduplicados via `codm-contracts-rust`) |
| `packages/e2e` | Playwright | Cross-stack E2E |

Build orchestrated by **Nx** for TS targets + **Go modules** for Go.

A arquitetura é **DDD + Clean Architecture + CQRS + Event-Driven**. Todas as regras existem para manter bounded contexts independentes e o sistema evoluir sem reescritas.

> Profundidade arquitetural por lado: **`docs/BACKEND.md`** e **`docs/FRONTEND.md`**. Sempre leia o doc do lado que você está tocando antes de escrever ou revisar código.

## Non-Negotiables

These hold regardless of framework, language, or feature. Everything else bends to them.

1. **Fix the cause, never dodge the symptom.** A `tsc` or contract error is a real defect — resolve it at its source. Never widen a type, add `as any` / `as never` / `as unknown`, suppress with `@ts-expect-error` / `@ts-ignore`, or fork a parallel schema to make an error disappear. Contract defects (per-endpoint Kubb enums, loose BFF DTOs) get fixed at the SDK/DTO level, not patched downstream.
2. **The wire contract is the single source of truth.** The SDK schema (controller Zod → OpenAPI → Kubb) is what both sides obey. The frontend validates against `xxxMutationRequestSchema` / DTOs from `@codm/client-typescript` — never a hand-rolled parallel schema, never a raw `fetch`. A schema duplicated across layers is a red flag; compose or extract instead. See `.specs/2026-06-05-form-issues-dossier.md`.
3. **Discriminated backend operation ⇒ variant-specific frontend UI.** When the contract models an operation as a discriminated union (genuinely different shapes per discriminant), the frontend reflects the cases — the discriminant is the selector/filter, each variant validates against its concrete member. Never flatten a union into one all-optional catch-all form. See form skill `FRM-P43`/`FRM-P44` and component skill `CMP-P18`.
4. **Only wire-safe schemas cross the wire.** `registerSchemas` exposes a schema's full field set **and** its `.refine()` source (`fn.toString()`) into the public `openapi.json` + client SDK. Register **only** shared value objects + contract DTOs — never entity (write-model) schemas. Keep sensitive invariants server-side. See `.claude/skills/schema/SKILL.md` + bounded-context `bp-05`.
5. **Contrato antes de implementação — REGRA GERAL de porting/melhorias/tooling.** Toda informação estrutural (workspace, linguagem, consumo de env, contexto, camada) é declarada num contrato tipado ANTES do código que a consome — nunca inferida de convenção de nome/formato de string.
   - **Linguagem é first-class citizen**: um workspace declara `lang` (`REPO.workspaces`); o NOME de pasta/pacote nunca implica linguagem (o backend TS de um fork pode se chamar `main-back`; um serviço Go, `channel`). Ferramentas resolvem workspace→propriedades por lookup, não por parse de path.
   - **Consumo é relação declarada**: quem usa o quê (env key→workspaces consumidores, contexto→contexto) vive no manifesto; a avaliação é álgebra de conjuntos/lookup uniforme sobre a relação.
   - **Proibido if de edge-case sobre convenção**: se você escreveu `if (x === 'go')`, um boolean solto (`go: true`) ou um regex esperando que uma string tenha certo formato para desviar de um caso — o MODELO está errado. Mova a informação para o contrato e torne a avaliação uniforme, sem desvios. Edge case legítimo vira campo declarado com semântica nomeada (ex.: `advanced`, `consumers`), nunca um desvio de fluxo.
   - Derive o que é derivável; declare só decisões; redeclaração inevitável ganha GATE (rail em `tests/architecture/` com fixture negativa). Ver `.plans/2026-07-21-declarative-repo.md`.

---

## Environment Setup

Pré-requisitos: `bun >= 1.0`, `docker`, `go` (para o api-go), `cargo`/`rustup` (não é só pro shell Tauri: `bun sdk` compila o `rust-codegen` via `cargo build` e `bun contracts` roda `cargo check` — sem cargo os dois falham).

```bash
# 1. Variáveis de ambiente — único arquivo na raiz, lido por todos os workspaces (api-typescript, api-go, apps).
cp .env.example .env
# Preencher: JWT_SECRET, BETTER_AUTH_SECRET; manter BILLING_SANDBOX=true

# 2. Pacotes (workspaces Bun)
bun install

# 3. Infra local em Docker (redis + lgtm para traces/logs/metrics — NÃO há Postgres:
#    a persistência é um único arquivo SQLite em $CODM_DATA_DIR, compartilhado
#    pelo daemon TS e pelo gateway Go)
bun docker:compose

# 4. Migrações: NÃO há passo manual. O daemon TS (LibsqlDriver) e o gateway Go
#    (SqliteStore) aplicam packages/contracts/db/schema/migrations no BOOT,
#    idempotentes sobre a MESMA ledger `_sqlite_migrations` — quem sobe primeiro aplica,
#    o segundo é no-op. Para AUTORAR uma migração nova: `bun migrate:create`.

# 5. SDK — precisa rodar uma vez antes do app compilar
bun sdk

# 6. Tudo em paralelo (api-ts:3030 + api-go:3032 + app-react:5173 + app-astro:4321)
bun dev
```

Notas:
- O `.env` na raiz é a **única** fonte de verdade. Não há `.env` por workspace.
- Apenas `VITE_*` chegam ao browser.
- Para testes TS, o banco roda em-processo (PGlite). Docker só é necessário para `bun dev` e para o smoke cross-stack.
- LGTM (Grafana 3000, Loki 3100, Tempo 3200, Mimir 9009) recebe traces dos dois backends via OTLP (4317/4318).

---

## Commands

```bash
# Desenvolvimento
bun dev                  # api-ts + api-go + app-react + app-astro em paralelo
bun dev:api              # somente os 2 backends
bun dev:api:typescript   # api-ts only
bun dev:api:go           # api-go only
bun dev:app:react        # app-react only (TanStack Start, served under /app)
bun dev:app:astro        # app-astro only (landing + blog, served at /)

# Build / qualidade
bun run build        # task graph completo (cacheado)
bun tsc              # type-check de todos os workspaces TS
bun run test         # todos os testes (exceto e2e)
bun lint             # lint em todos os workspaces

# SDK + OpenAPI + contracts
bun sdk              # regenera SDK (client:generate + emit-openapi upstream)
bun emit-openapi     # regenera só os openapi.json (api-ts + api-go)
bun contracts        # regenera bindings de contracts (TypeSpec → ts/go/rust + fixtures; roda cargo check no crate rust)

# Banco de dados (um arquivo SQLite; o boot migra sozinho — `migrate:dev` é só conveniência)
bun migrate:create           # AUTORA uma migração SQLite (drizzle-kit generate →
                             # packages/contracts/db/schema/migrations)
bun migrate:dev              # APLICA no $CODM_DATA_DIR sem subir servidor (mesmo aplicador do
                             # boot, mesmo ledger `_sqlite_migrations`). Só tabelas Drizzle —
                             # whatsmeow_* nasce quando o gateway conecta.
bun run --cwd packages/contracts db:sync-go    # espelha o SQL novo na cópia //go:embed do gateway
bun run --cwd packages/contracts db:check-go   # gate: as duas cópias são byte-a-byte iguais

# E2E (Playwright sobe os dev servers via webServer)
bun e2e
bun test:e2e:headed

# Review automatizado
bun review                   # revisa arquivos alterados no git diff
bun review:all               # revisa todo o repo

# Nx direto (quando os scripts de raiz não cobrem)
bun x nx graph
bun x nx run <project>:<target>
bun x nx run-many -t <target>
bun x nx affected -t tsc lint test build --base=dev
bun x nx reset               # limpa cache local
```

---

## Frontend scaffolding

The frontend has a unified scaffolder at `bun cli` (entry: `scripts/cli.ts`, frontend code in `scripts/cli/frontend/`). It's the **first thing to reach for** when creating a route, component, dialog, form, onboarding step, translation key, or input mask. Skills' `scaffold:` lines are the canonical invocations.

Full reference: **`docs/CLI.md`**.

**House rule — "if you wrote it, the CLI should write it":** if during a task you hand-write a shape that would have benefited from a CLI flag, recipe, or new artifact (i.e. you found yourself replicating boilerplate the CLI doesn't yet cover), open a ticket and add it to the CLI before the PR that introduces the hand-written code lands. The CLI exists so that the *next* engineer doesn't re-discover the same shape. If extending the CLI before shipping the feature would block the feature, file the gap as a follow-up issue, link it from the PR, and resolve it within one week.

The CLI is a **scaffolder**, not a code generator — `tsc` errors immediately after generation are expected (missing imports, unknown SDK identifiers). The agent wires them up. See `docs/CLI.md` §1 for the philosophy.

---

## First-Class Citizens

A composição do código é sempre a mesma — em cada contexto e em cada feature. Esta lista decide **onde** o problema de negócio cabe. Foco no **propósito de negócio**; detalhes técnicos vivem em `docs/BACKEND.md` / `docs/FRONTEND.md`.

### Backend

**BoundedContext** — uma fatia de negócio (`patient`, `appointment`, `clinic`, `doctor`...). Tudo que se refere a essa área vive numa pasta com o mesmo formato. Modelando uma área nova (ex.: `billing`) → cria um novo bounded context.

**Entity / AggregateRoot** — a "coisa" do negócio com identidade e regras: `Patient`, `Appointment`, `Clinic`. É a entidade que decide se uma mudança é válida (status, atribuições, datas). Onde moram as invariantes do tipo *"um agendamento não pode ser confirmado depois de cancelado"*. **Levanta domain events** quando algo importante acontece.

**Value Object** — um conceito definido pelo valor, sem identidade: `CPF`, `Email`, `Money`, `DateRange`. Auto-validado: um CPF inválido não existe. Vive dentro de entidades.

**Enum** — lista fechada de estados: `AppointmentStatus`, `DayOfWeek`, `PaymentType`. Quando o negócio diz "isso só pode ser A, B ou C", você codifica como enum. Sempre pareado com `pgEnum` no banco.

**Schema (Zod)** — a forma de qualquer dado em runtime. Schemas não são um detalhe de controller — são o vocabulário estrutural compartilhado por todo lugar que precisa validar entrada, descrever um payload ou inferir um tipo:

- **Entities** descrevem sua própria forma com Zod (`AppointmentSchema`); o `.create()` valida primitivos contra esse schema antes de construir a instância. A migração do banco é **derivada** desse schema, não o contrário.
- **Value Objects** validam o valor de entrada (`CPFSchema`, `EmailSchema`) — um VO inválido nunca chega a existir.
- **Use cases** declaram `InputSchema` (primitivos) e `OutputSchema` que viram o contrato chamável.
- **Controllers** declaram schemas expressivos (regex, `.refine()`, cross-field) — são esses que viram a SDK via OpenAPI.
- **Domain events** e **integration events** carregam payload tipado por `z.domainEvent({...})` / `z.integrationEvent({...})`.
- **Forms no frontend** consomem o **mesmo** schema que o controller — uma fonte de verdade, validação simétrica.

Heurística: precisa validar entrada ou definir estrutura em runtime? **Escreva um schema.** Schemas duplicados entre camadas são bandeira vermelha — extraia para `shared/` ou componha (`.and()`, `.pick()`, `.extend()` quando legítimo) em vez de redigitar.

**Error (Domain / Application)** — o vocabulário do que pode dar errado no negócio. **Toda invariante violável é um erro nomeado**, não uma string solta nem um `throw new Error("...")`.

- **DomainErrors** — invariantes de negócio: `APPOINTMENT_ALREADY_CONFIRMED`, `INSUFFICIENT_STOCK`, `INVALID_CPF`, `DOCTOR_NOT_AVAILABLE_AT_TIME`. Levantados **por entidades e value objects** quando algo viola uma regra do domínio. Se você está escrevendo um método em `Appointment` e precisa dizer "isso não pode acontecer porque...", você está descobrindo um `DomainError`.
- **ApplicationErrors** — condições da camada de aplicação: `PATIENT_NOT_FOUND`, `ALREADY_EXISTS`, `UNAUTHORIZED`. Levantados **por use cases e handlers** ao orquestrar (lookup falhou, recurso ausente, autorização inválida).

Cada erro carrega código + status HTTP + chave i18n — mapeados centralmente no `GlobalErrorMapper`. O frontend recebe o código e exibe a tradução; o teste assertiva no código, nunca na mensagem. Quem dispara: `throw new BaseError<DomainErrors>('APPOINTMENT_ALREADY_CONFIRMED')`.

> Erros são a fronteira entre "regra de negócio" e "comportamento do sistema". Se você se pegou validando algo num controller que poderia ser uma invariante, esse algo provavelmente quer virar um `DomainError` levantado pela entidade.

**Use Case (command)** — **uma operação de negócio**: `CreateAppointment`, `ConfirmAppointment`, `CancelSubscription`. **Um por intenção.** É chamado pelo controller, que é disparado pelo frontend quando o usuário clica num botão. Orquestra: carrega entidades via repositórios, chama métodos nelas, salva, persiste eventos. Tudo dentro de um `UnitOfWork` (transação). **Se você precisa modelar algo de negócio, é aqui que vai parar.**

**Query Use Case** — leitura específica para uma tela. Vive no contexto `ui` (BFF pattern). Não passa por entidades — fala direto com Drizzle para montar o DTO que a UI quer. Perfeito para listagens, dashboards, detalhes.

**Controller** — a porta HTTP. Recebe o request, valida com Zod, chama um use case, devolve a resposta. **Não pensa.** Nunca toca repositório.

**Repository** — a ponte entre entidade e banco. `findById`, `save`, `delete`, mais buscas por identificador (`findByEmail`, `findByCpf`). Devolve entidade rehidratada, recebe entidade para salvar.

**Service** — lógica que não cabe em uma entidade (cálculos cross-entity, integrações externas, regras transversais). Use cases compõem services + entidades.

**Domain Event** — fato passado dentro de **um** bounded context: `AppointmentConfirmed`, `PatientRegistered`. A entidade levanta; o handler interno reage. **Não cruza serviço.**

**Integration Event** — fato que cruza contextos ou serviços (Go ↔ TS): `shared.appointmentConfirmed` é ouvido pelo api-go para disparar a notificação de confirmação. **Publicado somente por handlers**, nunca por use cases.

**Handler (internal / external)** — onde os side-effects do **write-side** vivem.
- `internal.ts` reage a domain events do **próprio** contexto. Pode publicar um integration event para outros, ou disparar outro use case interno.
- `external.ts` reage a integration events vindos de outros contextos/serviços.
- Padrão típico: *"quando um paciente se registra, mande email de boas-vindas e crie a primeira sessão"*.

**Projection** — o "espelho de leitura" de uma área. Uma tabela materializada otimizada para uma view específica (ex.: `messages`, `MonthlyStats`). **Free record, sem base class** — classe simples com `constructor(public props: <Name>ProjectionProps)`. Schema Zod flat define a forma; **sem invariantes**, sem regras de negócio. A Projection é a **fonte de verdade** do que muda nela:
- Exporta `type <Name>ProjectionEvent = A | B | C` — union de todos os eventos que afetam ela. O Projector importa esse tipo como generic.
- **Criação (`static create(event)`)** — **método overloaded** — uma signature por evento que pode criar a row (ex.: `static create(event: MessageReceivedEvent)`, `static create(event: MessageSentEvent)`), uma implementação que faz `switch (event.name)` e constrói via `new MessageProjection({...})`. Type system enforça "só esses eventos podem me criar".
- **Mutação (`applyEvent(event)`)** — **método overloaded** — uma signature por evento que muta state (ex.: `applyEvent(event: MessageEditedEvent)`, `applyEvent(event: MessageDeletedEvent)`), uma implementação com `switch (event.name)` mutando `this.props`. Caminho canônico: `find → applyEvent → save`.
- **Sem método pra eventos atômicos** (`markDeliveredMany`, `incrementUnreadCount`) — esses são edge cases que vivem direto no repo, justificados por hot row / bulk / monotonic / conditional / cache-mirror.

Vive em `<ctx>/projections/<Name>.ts`. Existe quando o read-model é diferente do write-model (denormalização, agregação, cache cross-contexto). **Cross-aggregate cross-context** (read shape que spans contextos) vive em `ui/projections/`, não nos contextos de origem.

**ProjectionRepository** — o vocabulário **atômico** para escrever na projection: `insertIfNew`, `upsertMany`, `incrementUnreadCount`, `markDeliveredMany`, `setIfGreater*`. É aqui que a atomicidade mora — em vez de `find → mutate → save` (que causa N+1 e race), Projectors chamam ops atômicas que o banco resolve num único `INSERT ... ON CONFLICT DO UPDATE`. Sem base interface — cada repo declara as ops que precisa, igual ao Repository do write-side.

**Projector** — o **handler do read-side**. Uma classe por Projection, escuta múltiplos eventos. Diferente do Handler (write-side effects ou publica integration events), o Projector **só** escreve em projeções via sua `ProjectionRepository`. **Async via outbox por default**, **inline opcional** dentro de um use case quando precisa de read-after-write na mesma request. Vive em `<ctx>/projections/projectors/<Name>Projector.ts`. Shape:
- A generic vem **da Projection**: `extends Projector<MessageProjectionEvent>`. O Projector não declara união local.
- Implementa `handle(event, tx?)` com um **plain `switch (event.name)`**. Discriminated-union narrowing por `case`, exhaustiveness via `default: const _: never = event`. **Sem mapped types, sem record, sem magia TS.** Declara `events: readonly string[]` listando os nomes registrados.
- **Caminho canônico para mutação: `find → projection.applyEvent(event) → save`.** A Projection é dona da lógica de transição; o repo só precisa de `findByKey` + `save` + `insertIfNew` pra atender o canon.
- **Criação**: `repo.insertIfNew(MessageProjection.create(event), tx)` — `MessageProjection.create` é overloaded e escolhe a branch certa pelo `event.name`.
- **Atomic ops são edge cases**. Adiciona um método atômico ao repo só quando algum trigger justifica: hot row contention, bulk over N rows, monotonic constraint (set-if-greater), conditional update, ou cache-mirror upsert. Caso contrário, segue no `find → applyEvent → save`.

**Middleware** — cross-cutting de HTTP (auth, tenant, logging). Defaults por contexto, override por controller.

**UnitOfWork / Outbox / Mediators** — infra de evento: a transação que salva entidade + evento atomicamente, o despachante que lê o outbox e dispara o handler, o mediator que entrega o evento. O detalhe está em `docs/BACKEND.md` ("Event Architecture").

### Frontend

**Route** — uma URL (ex.: `/clinics/$clinicId/patients`). É uma **casca fina**: define o contrato da URL (path, search params, breadcrumb, errorComponent), monta o layout e decide **quais** componentes aparecem. **Não busca dado para passar pra baixo.**

**Component** — vive em `-components/` da route. Cada componente **dona seus próprios dados**: lê search params via `routeApi.useSearch()`, lê estado de cliente via Zustand, dispara queries/mutations SDK por si só. Sem prop-drilling de dado, search ou callback. Quando precisa do estado "carregando", renderiza skeleton inline; UI estática permanece visível enquanto os dados chegam. Quando a tela reflete uma operação discriminada do backend, o componente troca o sub-componente por variante a partir do discriminante (lido do descriptor/store) — dispatch por mapa, nunca cadeia de `if` (ver `CMP-P18`).
- Componentes "container" (que orquestram uma seção da tela) usam o **sufixo `Section`** apenas como convenção de nome (`PatientListSection`) — vivem em `-components/` como qualquer outro. Não é uma pasta separada nem uma camada extra.
- Componentes folha (renderizados N vezes num `.map()`: cards, rows, badges) **recebem o item por prop** — o pai dono da lista mapeia.

**Primitive** (`@/components/ui/*`) — átomo de design system (Button, Card, Dialog) sobre Base UI + CVA.

**Form** — TanStack Form + schema da SDK. Mesmo Zod que o backend valida — zero sincronização manual. Body com union discriminada: o discriminante vira seletor e cada variante valida contra seu membro concreto (`FRM-P43`/`FRM-P44`) — nunca um form achatado com tudo opcional.

**Store (Zustand)** — estado interativo do cliente que não cabe em URL (IDs selecionados compartilhados entre componentes, toggles de UI, dialog aberto). Para persistir entre refreshes, use `persist`.

**Hook** — helper transversal (`useDebouncedSearch`, `useDialogStore`, `useSession`).

### Como eles se ligam — fluxo de exemplo

> Usuário clica "Confirmar agendamento" no app:

1. **Component** (ex.: `AppointmentCardSection`) chama `useConfirmAppointment()` (mutation gerada pela SDK).
2. SDK bate em **Controller** `POST /appointments/:id/confirm`.
3. Controller valida com **Schema** Zod e chama **Use Case** `ConfirmAppointment`.
4. Use case carrega `Appointment` via **Repository**, chama `appointment.confirm()` (regra na **Entity**).
5. Entity valida invariante, muda status (**Enum** `AppointmentStatus`), levanta **Domain Event** `AppointmentConfirmed`.
6. Use case salva entidade + evento na **mesma transação** (UnitOfWork → outbox).
7. **OutboxDispatcher** lê o outbox e entrega o evento ao `InternalMediator`, que faz fan-out para **todos** os assinantes registrados naquele evento:
   - **Handler interno** do contexto `appointment` publica **Integration Event** `shared.appointmentConfirmed` nos Redis streams (`ExternalMediator`).
   - **Projector** `PatientProjector` (mora em `patient/projections/projectors/`, escuta `AppointmentConfirmed` para advancing o `nextAppointmentAt` na `PatientProjection`) chama `patientProjectionRepo.setIfGreaterNextAppointment(...)` — op atômica, sem find.
8. **api-go** consome o integration event dos Redis streams, e seu handler externo dispara um use case interno que manda a notificação.
9. No `api-go`, quando a notificação volta como `MessageSent`, o `MessageProjector` (Go) insere a linha na projection de mensagens via `repo.insertIfNew(...)` — outra op atômica.

Cada citizen tem **uma responsabilidade** no fluxo: entity decide se a mudança é válida, use case orquestra a transação, handler propaga side-effects no write-side, projector atualiza read-models, integration event atravessa contextos/serviços. Nenhum deles sabe sobre os outros diretamente — todos se conhecem por eventos.

---

## SDK — o tendão entre backend e frontend

A SDK não é "um cliente HTTP". Ela é **o contrato compartilhado** que permite backend e frontend serem desenvolvidos em paralelo sem se atropelarem.

```
Controller (Zod schema)
    └─► api emite openapi.json
            └─► Kubb gera hooks + schemas + tipos + query keys
                    └─► app importa de '@codm/client-typescript/typescript'
```

**O que a SDK exporta para o frontend:**

- Hooks React Query (`useListPatients`, `useCreateAppointment`, `useConfirmAppointment`).
- Schemas Zod prontos para `validators` do TanStack Form.
- Tipos TS para `defaultValues`, props, etc.
- Enums (`AppointmentStatus`) — mesma fonte que o banco.
- Query keys para `invalidateQueries`.

**Por que isso destrava trabalho paralelo:**

1. Backend modela controller + schema → roda `bun sdk`.
2. Frontend já tem hook tipado para chamar — mesmo antes do use case existir, dá pra trabalhar contra um mock.
3. Mudou o schema do backend? `bun sdk` e o `tsc` do app reclama nos pontos exatos que precisam adaptar.

**Regras duras:**

- Frontend **só** consome dados do backend pela SDK. Nunca `fetch` direto.
- Dentro do **mesmo** serviço, nunca use o cliente HTTP da SDK para ler outro contexto — importe o `Repository` dele (chamada HTTP a si mesmo = ciclo). **Entre serviços** (api-ts ↔ gateway Go), S2S via SDK é permitido: `client.<service>.method(...)` quando dois serviços precisam se comunicar, e import de **schemas/types gerados** do subpath do serviço dono para compor contratos (ex.: `ListenEvents` compondo `z.discriminatedUnion` dos schemas zod do `/go`) — zero redeclaração de formas. (Ratificado pelo founder, 2026-07-22.)
  - **Duas condições operacionais na chamada S2S** (a permissão é de direção, não de forma). (a) **Atrás de uma porta:** a chamada mora numa implementação de `Service` abstrato bound por ambiente, para `mock`/`integration` nunca abrirem socket — um teste não pode depender do outro serviço estar de pé. (b) **Identidade explícita:** o hop carrega o dono (`X-Owner-Id`), como `forwardToChannel` já faz; o serviço chamado nunca infere dono.
- Sempre rode `bun sdk` depois de mexer em controller/schema.
- Rode `cd packages/app/react && bun tsr generate` depois de criar/mover rota.

**Schemas nomeados na OpenAPI.** Formas que cruzam a fronteira podem ser registradas como componentes OpenAPI reutilizáveis via `openapi.registerSchemas({ ...sharedObjects, ...sharedSchemas })` — o nome do componente é inferido da chave de export menos `Schema` (`MoneySchema` → `Money`), sem `.meta({id})` no ponto de definição. **Fronteira de segurança:** registre **apenas** `shared/objects` + `shared/schemas` (value objects + DTOs de contrato, já no fio) — **nunca** schemas de entidade/write-model. O `.refine()` de um schema registrado é emitido verbatim (`fn.toString()` → `x-tpl-zod-refinements`) no `openapi.json` público + SDK do cliente, junto do conjunto completo de campos; mantenha invariantes sensíveis na entidade/use-case. Detalhes: `.claude/skills/schema/SKILL.md` + bounded-context `bp-05`.

> Convenções OpenAPI (enums como `$ref`, `x-zod-refinements`, discriminadores `const`) e a pipeline Kubb estão em `docs/BACKEND.md`.

---

## Testing — TDD, Red/Green, Given, Sandbox

Tests are first-class. Substituem boa parte da "documentação viva" da arquitetura.

### Ciclo Red / Green / Refactor

1. **Red** — escreva o teste do comportamento que ainda não existe (entity, use case, handler). Deve falhar com erro útil.
2. **Green** — implementação mínima para passar.
3. **Refactor** — colha os testes como rede de segurança.

### As 4 camadas de teste

| Tipo | Onde | Modo DI | Quando usar |
|---|---|---|---|
| **Unit** | `src/**/Entity.test.ts` | nenhum (instanciação direta) | Invariantes de entidades / value objects |
| **Repository** | `src/**/Drizzle*Repository.test.ts` | `integration` | `save / findById / delete` + queries complexas |
| **Use case / Handler** | colocado `*.test.ts` | `integration` | Comportamento end-to-end de uma operação |
| **Flow** | `packages/api/typescript/tests/flows/` | `mock` | Coreografias entre use cases (sagas) |

### Sandbox: banco em-processo

Testes não dependem de Docker. O `DrizzleDatabaseDriver` no modo `integration` usa **PGlite** — Postgres rodando dentro do processo. `reset()` zera o estado entre testes, e as mesmas migrations da produção são aplicadas — então o que passa no teste passa no Postgres real.

```ts
beforeAll(async () => {
  testContainer = container.createChildContainer()      // DI isolada por suite
  testBed = await TestBed.create('integration', {
    testContainer,
    ownerId: 'integration-tenant',
  })
})
beforeEach(async () => { await testBed.reset() })       // estado limpo por teste
afterAll(async () => { await testBed.destroy() })
```

### Interfaces e DI por ambiente

Cada contexto exporta um `registry.ts` com bindings para três ambientes:

- `mock` — `MockUnitOfWorkFactory`, `MockOutboxDispatcher`, `OutboxAwareMockDomainEventRepository`, mediators em memória. **Flow tests** usam isso.
- `integration` — driver PGlite + outbox e mediators reais. Testes de repositório, use case e handler usam isso.
- `real` — `NodePgDriver`, `RedisExternalMediator`, `BullMQ`. Produção.

O teste resolve dependências via `child container`. Você troca uma implementação só para a suíte sem afetar o resto.

### Given helpers — montando estado sem use case

Em `packages/api/tests/support/given/` há helpers compostos que criam estado **direto via repositórios** — nunca via use case. Isso garante que um teste de `CancelAppointment` não dependa de `CreateAppointment` estar correto.

```ts
const { appointment, clinic, patient } = await givenAppointment(testBed, {
  // overrides opcionais
})
```

Helpers se aninham: `givenAppointment` → `givenClinicWithOwner` → `givenUserWithAccount` → `givenUser` + `givenAccount`.

### Eventos em teste

No modo `integration`, o outbox e o `OutboxDispatcher` rodam de verdade. Você pode:

- Disparar um use case.
- Esperar o handler reagir.
- Assertar que o evento foi salvo, despachado e o handler tratou.

Para isolar a unidade testada, o `MockExternalMediator` (no modo `mock`) captura integration events sem publicar — útil em flow tests.

### Regra de ouro

Testes de **use case não repetem** os casos de `VALIDATION_ERROR` — esses são cobertos pelos testes de entidade. Use case testa orquestração, não regra de campo.

> Detalhes completos: `.claude/skills/test/SKILL.md`.

---

## Quality Gates: lint, test, tsc

Antes de commitar / abrir PR:

```bash
bun lint       # biome + eslint nos workspaces
bun tsc        # type-check end-to-end
bun run test   # todos os testes (exceto e2e)
```

Em CI, prefira o modo afetado para velocidade:

```bash
bun x nx affected -t tsc lint test build --base=dev
```

`pre-commit` hook (em `.githooks/`) já roda `lint-staged` (biome + eslint) automaticamente nos arquivos staged.

---

## Review

Code review tem dois canais:

**Manual / interativo:** skill `/review` carrega o checklist da `registry.yaml` da skill correspondente ao artefato e devolve uma lista priorizada de bad practices encontrados.

**Em batch (CLI):** `scripts/review.ts` revisa arquivos em paralelo com agentes Claude, usando os registries compilados em checklists compactos.

```bash
bun review                                 # git diff
bun review:all                             # repo inteiro
bun scripts/review.ts --staged             # arquivos staged
bun scripts/review.ts --pr                 # branch atual vs dev
bun scripts/review.ts --backend --context billing
bun scripts/review.ts --frontend --all
```

Opções úteis: `--parallel N`, `--output dir/`, `--thorough` (Opus em vez de Sonnet), `--no-cascade`.

A saída inclui **análise de cascata**: rastreia imports bottom-up para indicar quais correções resolvem várias violações ao mesmo tempo (`_cascade-analysis.md`).

---

## Skills & Registries

A arquitetura é codificada como **skills** em `.claude/skills/<name>/`. Cada skill tem:

- `SKILL.md` — o playbook normativo do artefato.
- `registry.yaml` — checklist estruturado: `depends_on`, `context_reads`, `bad_practices`, `patterns` (com `when: always` ou condicional), `canonical_snippet`, `scaffold` (`bun cli`).

E há dois registries de mais alto nível:

- **`.claude/registry.yaml`** — índice global: padrão de arquivo → tipo de componente → skill responsável. É o que `/review` e `bun review` usam para classificar e checklist-ar.
- **`<ctx>/registry.ts`** (TS) / **`<ctx>/module.go`** (Go) — wiring de bounded context. Em TS o ponto-de-entrada usa `BoundedContext.create({...})` lendo `INSTANCE_REGISTRY` com chaves `mock` / `integration` / `real`. Go usa `fx.Module`.

### Skill dispatch by language / target

A maioria das skills de backend tem **duas variantes** (uma por backend) e a maioria das skills de frontend tem **duas variantes** (uma por target — react/astro). O layout é:

```
.claude/skills/<skill>/
├── SKILL.md            # dispatch hub: filosofia lang/platform-agnóstica + ponteiros
├── typescript/         # backend variant — packages/api/typescript/
│   ├── SKILL.md
│   └── registry.yaml
├── go/                 # backend variant — packages/api/go/
│   ├── SKILL.md
│   └── registry.yaml
├── react/              # frontend variant — packages/app/react/
└── astro/              # frontend variant — packages/app/astro/ (component, primitive, route only)
```

**Como o dispatch funciona:**

| Arquivo (extensão / caminho) | Lang resolvida | Playbook carregado |
|---|---|---|
| `.ts` / `.tsx` em `packages/api/typescript/` | `typescript` | `<skill>/typescript/{SKILL,registry}` |
| `.go` em `packages/api/go/` | `go` | `<skill>/go/{SKILL,registry}` |
| `.tsx` em `packages/app/react/` | `react` | `<skill>/react/{SKILL,registry}` |
| `.astro` ou `.tsx` em `packages/app/astro/` | `astro` | `<skill>/astro/{SKILL,registry}` |

Quando uma skill ainda não tem variantes (por exemplo `bounded-context`, `db-modelling`, `migrate`, `sdk`, `store`), o dispatcher cai no `<skill>/SKILL.md` + `<skill>/registry.yaml` flat na raiz.

**Onde isso é implementado:** a detecção de linguagem vive em `scripts/lib/repo-model.ts` (`detectLang` — o workspace que contém o arquivo decide, derivado de `template.config.ts` `REPO.workspaces`; extensão só como fallback fora de workspaces), consumida por `scripts/review.ts` e pelo hook classify-edit. O `getCompiledChecklist(skill, lang, artifact)` carrega o `registry.yaml` específico via `resolveRegistryPath()` (existsSync no variant — sem listas de variantes). Cada batch é chaveado por `(skill, lang, artifact)` — `component-react` nunca é misturado com `component-astro` no mesmo prompt.

**Quais skills têm variantes de backend** (16): `entity`, `value-object`, `enum`, `errors`, `schema`, `usecase`, `query`, `controller`, `repository`, `service`, `event`, `handler`, `projection`, `projector`, `middleware`, `test`.

**Quais skills têm variantes de frontend:**

| Skill | react | astro |
|---|---|---|
| `component` | ✅ | ✅ |
| `primitive` | ✅ | ✅ |
| `route` | ✅ | ✅ |
| `form` | ✅ | — (use a react island on astro) |

**Frontend single-flavor (no variants):** `store` (react only — n/a on astro), `prototype`, `design-system`, `storybook` (react-only — `*.stories.tsx`: dumb→`args`, connected→typed SDK mocks via `@/storybook`), `desktop-shell` (flat — `packages/app/tauri` + the react `lib/native` seam).

**Lang-agnostic (no variants):** `bounded-context`, `db-modelling`, `migrate`, `sdk`, `commit`, `review`, `prd`, `user-stories`, `task-breakdown`, `spec-review`, `ddd-modeling`, `trace-analysis`, `clean-branch`, `e2e`.

Ao escrever ou revisar código, **carregue a skill correspondente para a sua lang/platform** (`<skill>/typescript/SKILL.md`, `<skill>/astro/SKILL.md`, etc.) e cheque o diff contra os `bad_practices` e `patterns` daquele variant. A filosofia compartilhada vive no `<skill>/SKILL.md` raiz.

---

## Modeling from another system (porting many bounded contexts at once)

> When the task is "port system X into this template" or "model these N contexts" — i.e. a structural job that spans **multiple bounded contexts and/or both backends at once** — follow this workflow. It is distilled from the bk-dash → polyglot port, where skipping these steps caused repeated full-context rewrites. Full rationale: `.specs/2026-05-26-audit-distillation-what-we-got-wrong.md`.

**The source system is the source of truth — read it before designing.**
- Derive every aggregate's shape from the **source system's domain model**, never from the lean wire-event payload and never from this template's *existing* registry/seed data. (Order ≠ its `OrderUpdated` payload — it has nested `OrderLine[]`, `MonetaryAmount` VOs.)
- Derive every enum value, platform categorization, and Drizzle column from the source system. Don't invent columns; don't trust the template's current platform list (CartPanda/Yampi were miscategorized as sales-channels when the source treats them as checkouts).
- If a reference implementation exists on disk (e.g. `go-worker-monorepo`, `bk-dash-backend`, `bk-dash` channel), **read it and mirror its structure** (folders, event envelope, controller shape, persistence pattern) — do not design Go/worker/webhook layouts from first principles.

**Decide ownership and the high-level flow before any leaf code.**
- For each canonical projection, decide **who writes it** (Go sync worker vs TS backend) before specing commands. Webhook ingest writes belong to the owner that runs the pipeline, not the BFF.
- For ingestion/choreography, confirm the pipeline shape with the user first: `Controller → Mapper(factory by platform) → Event → outbox → Handler → entity.method`. Don't build entities/repos before the flow is agreed.

**Question every aggregate before modeling it.** Default to the leanest option:
- Has identity + lifecycle + invariants + a *confirmed* need? → aggregate.
- "A thing that happened" → **domain event** (already persisted in the outbox/events table — no entity, no repo, no audit table).
- Embedded data with no identity → **value object** on the parent (Customer → fields on Order).
- Fixed tiers / config → **code enum + quotas** (Plan), not a persisted aggregate.
- Auth tokens, sessions, password resets → **owned by better-auth**, not modeled.
- UI-only state (onboarding flags, query prefs) → UI/BFF layer or query param, not a domain field.
- Read shape that's just a join → **QueryService**, not a projection. Add projections only when denormalization/cross-context aggregation is actually required.

**Phase 0 — Contract Lock (enables parallelism).** Author and **freeze** all cross-boundary enums + integration events in `packages/contracts` (TypeSpec) *before* implementing any BC. Once frozen, treat them as immutable. This is what lets multiple contexts be built in parallel without serializing through the contracts file. Generate per-language bindings (`bun sdk` / contracts codegen) once, then build against them.

**Build big slices with fresh-context subagents + load-bearing handoffs — not one marathon agent.** Measured: a single agent building a 7+-deliverable vertical slice in one context reliably **drops the tail** — it finishes the early phases and then stubs the last artifacts (the create dialog, the e2e spec) under end-of-context budget pressure. This is a *capacity* limit, not a knowledge gap (each dropped artifact passes its own isolated probe). The fix is to decompose along the frozen Phase-0 contract and hand each slice to a **fresh-context subagent** — **but the win lives entirely in the handoff's quality, not the spawning.** A fresh agent handed a *precise* handoff (EXACT SDK identifiers like `createPurchaseOrderMutationRequestSchema` / `PurchaseOrderRecordedEventName`, the frozen contract, scope fences DONE/LEFT/OUT, each deliverable mapped to the canon it must satisfy, the close-out gates) builds the tail the monolith dropped — and respects the contract instead of rebuilding it. A fresh agent handed a *vague* one ("build the frontend") re-derives shapes, hand-rolls schemas, and drifts, with no shared context to recover from. So: freeze the contract, then for every fannable slice author a handoff you could paste into a fresh `claude -p` and expect a canon-clean result. The `task-breakdown` skill's Step 4.5 (`TaskHandoff`) is the operational form; `synthetic-fullstack-handoff` is the executable check.

**One naming-harmonization pass to the target ubiquitous language.** Decide the canonical terms up front and apply them everywhere; never propagate the source system's legacy coupling names. Project-wide conventions: `platform` (not `provider`), `XQueryService` (not `XLookupService`), `status` (not `externalStatus`), `*ExternalId`, `ConnectionMode { OAUTH, CREDENTIALS, MANUAL }`. Define every platform/enum constant in one typed enum before any code uses it (mismatched spellings across modules cause silent misrouting).

**Apply schema layer-boundary rules at generation time across ALL layers.** Don't defer them to a later audit — widespread violations mean a systemic miss, not isolated oversights. `z.instance(Id)` ONLY on entity + value-object schemas; events/use-cases/controllers/query-DTOs keep `z.uuid()`/`z.string()`. `z.enum(Enum)` for every closed set. Controller `InputSchema` keys are only `body`/`query`/`params`/`ctx`. Shared VOs (MonetaryAmount) live in `shared/objects`, never duplicated inline.

**Scope discipline.**
- Don't speculatively add bounded contexts, commands, or read-models the source/user hasn't confirmed. Strip to the confirmed need.
- When a single spec grows past ~7 deliverables, **stop and propose a split** — don't self-flag and continue.
- For any structural multi-context change: **grill the design and write a `.plans/` plan before touching code** (`/brainstorm` → `/plan`). See [[feedback_design_before_big_refactor]].

**Workspace & process hygiene for big batches.**
- Step 0: confirm `tsc` + tests are green at HEAD before starting; if tracked files are missing from the working tree, `git checkout HEAD -- <path>` before assuming it's someone's parallel work.
- Run a cross-BC schema/id/enum audit before declaring the port "done" — `bun review` + `bun tsc`; mark nothing `done` while violations remain.
- Stage specific files (never `git add -A`); commit/regen before `git stash`; surface (don't silently absorb) any worktree-isolation break.

---

## Worktree Development

Background jobs and isolated feature work run in git worktrees under `.claude/worktrees/<name>/`. These rules are what make a worktree build as cleanly as the main checkout.

**Base branch.** Worktrees branch from your **current** branch's HEAD, not the repo default (`v1.4`) — enforced by `"worktree": { "baseRef": "head" }` in `.claude/settings.json`. By hand: `git worktree add <path> -b <branch> HEAD` (never let it default to `origin/<default>`, or you get an empty/wrong base).

**Dependencies — lightweight overlay.** A fresh worktree has no `node_modules` and doesn't need one: it lives under the main checkout, so Node/Bun module resolution falls through to the main repo's hoisted `node_modules`. `bun tsc` / `bun lint` / `bun test` work immediately, with **no install**.
- Add a **shared** dependency in the **main checkout** (`bun add X`) — the shared lockfile + `node_modules` carry it and every worktree sees it via fall-through.
- Only when a worktree genuinely needs its **own/divergent** deps, run `bun install` inside it to materialize a worktree-local `node_modules` (full install; rare).

**Nx.** `.claude/worktrees/` is gitignored, which also hides worktree copies from Nx project discovery (Nx honors `.gitignore`) — that is what stopped the `MultipleProjectsWithSameNameError` that used to break every `nx` target from the main repo. So inside a worktree the normal commands work: `bun tsc`, `bun lint`, `bun run test`, `bun x nx run <project>:<target>`. Authoritative backend type-check (skips the `bun:test` noise raw `tsc` emits for test files): `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`. Run `bun test` from the **package dir** (`packages/api/typescript`) so the `bunfig.toml` reflect-metadata preload applies.

**Generated workspace packages — their `name` must match THIS repo's scope (`@codm/*`, from `template.config.ts`), never a stale foreign scope (`@bk-dash/*` from an un-regenerated copy, or another fork's `@berzerk/*` / `@medscall/*`).** The SDK + contracts bindings are committed at `packages/client/dist/typescript` (`@codm/client-typescript`) and `packages/contracts/generated/typescript` (`@codm/contracts-typescript`). Their package `name` **must** match the `@codm/*` specifiers consumers import; a mismatch makes a fresh `bun install` fail for the **whole** workspace (`Workspace dependency "@codm/..." not found`) — which is exactly why a worktree (forced fresh resolve) breaks while the main checkout limps along on stale `node_modules` symlinks. Regenerate via `bun sdk` / `bun contracts`. Note `bun sdk` (kubb) is **incremental** — when a rename doesn't propagate to every generated file, force a clean regen or substitute across `dist/`. Never hand-rename a generated package by hand — regenerate (`bun sdk` / `bun contracts`) so its name stays in lockstep with the specifiers consumers import.

**Lifecycle.** Create from HEAD → work → `bun tsc` / `bun lint` / `bun test` → stage specific files → commit → merge/PR. Never `git stash` across a `bun sdk` / `bun contracts` regen (the generators rewrite tracked files; the pop conflicts and silently drops applied edits). Surface (don't silently absorb) any worktree-isolation break.

---

## Documentation Map

- **`docs/BACKEND.md`** — arquitetura backend (bounded contexts, dependency direction, event architecture, DI & registries, schema strategy, autorização, projections, SDK pipeline, testing reference).
- **`docs/FRONTEND.md`** — arquitetura frontend (composição route→component→primitive, state management, dialog pattern, SDK usage, forms, session).
- **`docs/CLI.md`** — frontend scaffolder reference (verbs, recipes, blocks, flags, worked examples, cookbook).
- **`docs/CORRECTNESS.md`** — the optimization system behind the patterns: rung ladder (eliminate > detect > document > measure), axes/canons/carriers/detectors/probes and how they relate, the eval loop protocols, and how the rails change the building process.
- **`docs/COMPONENTS.md`** — primitivos de UI.
- **`docs/RELEASE.md`** — canais stable/beta, auto-update, e as DUAS assinaturas do desktop (minisign do updater × Developer ID da Apple): por que a assinatura do shell é a permissão de disco dos agentes, como emitir, recuperar e reconceder o Acesso Total ao Disco.
- **`.specs/`** — design specs (event-sourcing playbook, projection architecture, etc.). See `.specs/2026-05-26-audit-distillation-what-we-got-wrong.md` for the distilled cross-session rework retrospective behind many of the rules here.
- **`.plans/`** — implementation plans (histórico).
- **`.claude/skills/<name>/SKILL.md`** — playbook por artefato.
- **`.claude/registry.yaml`** — bad practices transversais.

---

## Skills Learning

Sempre que o usuário ensinar algo novo sobre uma skill (padrões, correções, boas práticas), adicione essa informação diretamente no arquivo da skill correspondente em `.claude/skills/<name>/SKILL.md`.
