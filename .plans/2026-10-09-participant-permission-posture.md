# Permission Posture por Participante — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** O operador escolhe, por pessoa e por thread, quem pode liberar ações sem filtro; uma ordem (ou um APPROVE) de quem tem essa permissão faz o turno seguinte rodar em bypass, pedidos de quem não tem continuam em `auto`, e quando o filtro barra algo o sistema para na hora e pede aprovação no chat.

**Architecture:** `PermissionPosture { AUTO, BYPASS }` e `StopKind.PERMISSION_DENIED` entram no contrato TypeSpec (Phase 0). A postura nasce de QUEM disparou o trabalho — `Participant.canElevate` no roster da thread, decidido pelo agregado `Thread.postureOf` — e viaja numa coluna tipada de `agent_mailbox` (`DEFAULT 'AUTO'`, que é a regra do item legado feita declarativa), pelo dispatcher, pelo envelope do agente (`BaseAgentInputSchema.posture`) até `AgentRunRequest.posture` (argv por runner via `Record<PermissionPosture, …>`) e até o claim do run token (lido por `ForkIssue`/`SteerIssueTurn`/`ResolveStop` só de `ctx.agentIdentity`). A negação vira `PERMISSION_DENIED` (o runner lê `safety_stops`/`permission_denials` do frame `result`), uma parada de TRANSPORTE que um mapa declarado (`TRANSPORT_STOP_RETRIES`) manda registrar já, sem requeue.

**Tech Stack:** TypeScript, Bun, Drizzle (SQLite), tsyringe, Zod, TypeSpec, Kubb, TanStack Query/Router, Base UI, Playwright, Go (mirror only)

**Spec:** .specs/2026-10-08-participant-permission-posture-design.md
**Tasks:** 16
**Estimated minutes:** 705

---

## Ordenação

Plano com ≥3 contextos (contracts, thread, agent, app-react) e ≥10 artefatos — fases explícitas:

- **Phase 0 — Contract Lock:** **T1** (enum + `StopKind` + mapas exaustivos + SDK) → **T2** (migrações: rebuild de `issue_stops`, coluna da política, coluna `posture` do mailbox, backfill do roster, espelho Go). Nada mais começa antes de T2: toda Task seguinte lê ou escreve uma coluna que só T2 cria.
- **Phase 1 — Behavior slices:**
  - onda A: **T3** (canElevate no backend) e **T6** (o turno roda com a postura do item) — independentes entre si, ambos dependem de T2.
  - onda B: **T4** (SDK) ← T3; **T7** (argv por runner) ← T6; **T8** (produtores carimbam postura) ← T3, T6.
  - onda C: **T5** (toggle no console + e2e) ← T4; **T9** (APPROVE eleva) ← T8; **T10** (runner detecta a negação) ← T7.
  - onda D: **T11** (negação para a issue na hora) ← T8, T10.
  - folha: **T12** (prompts) ← T6 (só porque os fixtures carregam o envelope com `posture`).
- **Phase 2 — Invariantes isolados (falseadores):** **T13** (argumento de tool não muda postura) ← T8; **T14** (resolução nunca concede mais do que o resolvedor tem) ← T9; **T15** (membro admitido entra sem elevação) ← T3; **T16** (item legado roda AUTO) ← T6.

Caminho crítico: `T1 → T2 → T6 → T8 → T9 → T14` (empatado com `T1 → T2 → T6 → T7 → T10 → T11`).

**Ambiente para todo comando `bun`:** rode com `env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID` (variáveis herdadas da sessão quebram três suítes em código verde). Testes de backend rodam de `packages/api/typescript` (o `bunfig.toml` do pacote faz o preload do reflect-metadata). Type-check autoritativo do backend: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` — ele INCLUI os `*.test.ts`, então todo literal de teste que um campo novo obrigatório quebra aparece nele.

---

## Task T1: O contrato conhece a postura e a negação de permissão

**Files to write:**
- Create: `packages/contracts/src/wire/enums/permission-posture.tsp`
- Modify: `packages/contracts/src/wire/enums/stop-kind.tsp` — novo membro `PERMISSION_DENIED`
- Modify: `packages/contracts/src/wire/main.tsp` — importa `permission-posture.tsp`
- Regen: `packages/contracts/generated/typescript/src/wire/enums/permission-posture.ts`
- Regen: `packages/contracts/generated/typescript/src/wire/enums/stop-kind.ts`
- Regen: `packages/contracts/generated/go/wire/enums.go`
- Regen: `packages/contracts/generated/rust/src/wire/enums.rs`
- Regen: `packages/contracts/generated/openapi/contracts.openapi.yaml`
- Modify: `packages/api/typescript/src/agent/enums/TransportStopKind.ts` — `PERMISSION_DENIED` entra na metade TRANSPORT
- Modify: `packages/api/typescript/src/agent/enums/TransportStopKind.typecheck.ts` — asserção positiva do membro novo
- Modify: `packages/api/typescript/src/thread/utils/StopResolutions.ts` — `PERMISSION_DENIED → [APPROVE, DENY, TAKE_OVER]`
- Modify: `packages/api/typescript/src/thread/utils/StopChannelNotice.ts` — `PERMISSION_DENIED → true`
- Modify: `packages/api/typescript/src/thread/i18n/messages.ts` — títulos PT/EN do kind novo
- Modify: `packages/api/typescript/src/thread/usecases/RaiseStop.ts` — `POLICY_KEY[PERMISSION_DENIED] = 'permissionDenied'`
- Modify: `packages/api/typescript/src/thread/repositories/StopPolicyConfigRepository/StopPolicyConfigRepository.ts` — chave `permissionDenied`
- Modify: `packages/api/typescript/src/thread/repositories/StopPolicyConfigRepository/LibSqlStopPolicyConfigRepository.ts` — lê `permissionDenied`
- Modify: `packages/api/typescript/src/thread/usecases/UpdateStopCriteriaConfig.ts` — `permissionDenied` no input
- Modify: `packages/api/typescript/src/thread/controllers/UpdateStopCriteria.ts` — `permissionDenied` no example
- Modify: `packages/api/typescript/src/ui/usecases/GetSettings.ts` — `permissionDenied` no output
- Modify: `packages/contracts/src/db/sqlite/issue.ts` — coluna `permission_denied` em `issue_stop_policy_config`
- Modify: `packages/app/react/src/locales/pt.json` — `enums.StopKind.PERMISSION_DENIED`
- Modify: `packages/app/react/src/locales/en.json` — `enums.StopKind.PERMISSION_DENIED`
- Modify: `packages/api/typescript/tests/flows/stop-control-plane.flow.test.ts` — literal de política ganha `permissionDenied`
- Modify: `packages/api/typescript/src/issue/usecases/IssueLifecycle.test.ts` — literal de política ganha `permissionDenied`
- Regen: `packages/api/typescript/public/docs/openapi.json`
- Regen: `packages/api/go/public/docs/openapi.json`
- Regen: `packages/client/dist/**`

**Files to read:**
- `packages/contracts/src/wire/enums/mailbox-target-kind.tsp`
- `packages/contracts/src/db/sqlite/issue.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum, /sdk, /db-modelling
**Depends on:** (none)
**Consumes (frozen):** (none) — esta Task CONGELA: `PermissionPosture.AUTO` / `PermissionPosture.BYPASS` e `StopKind.PERMISSION_DENIED` de `@codm/contracts-typescript/wire/enums`; `TransportStopKind` = `AUTH_REQUIRED | SERVER_ERROR | PERMISSION_DENIED`; `StopPolicy.permissionDenied: boolean` (default `true`); coluna drizzle `stopPolicyConfig.permissionDenied` (`permission_denied`).
**Scope fence:** DONE — nada. LEFT — o contrato, os bindings gerados, a SDK, e o MÍNIMO para a árvore compilar (cada `Record<StopKind, …>` exaustivo ganha a entrada nova; `StopPolicy` ganha a chave). OUT — a migração SQL (T2 a gera; esta Task só declara a coluna drizzle e o CHECK muda sozinho por `Object.values(StopKind)`); o mapa re-tentar-vs-registrar (`TRANSPORT_STOP_RETRIES`, T11); qualquer leitura de `safety_stops` (T10). Até T2 commitar, `packages/contracts/src/db/schema-drift.test.ts` e os testes que tocam `issue_stop_policy_config` ficam vermelhos — é esperado, por isso o Gate desta Task não roda testes de banco.
**Gate:** `cd packages/contracts && bun test codegen/ && cd ../api/typescript && bun x tsc -p tsconfig.build.json --noEmit && cd ../../app/react && bun x tsc --noEmit`

### Step T1.1 — Write the failing (type) test

Modify `packages/api/typescript/src/agent/enums/TransportStopKind.typecheck.ts`: logo abaixo de `export const serverErrorIsTransport: TransportStopKind = StopKind.SERVER_ERROR`, adicione

```typescript
// PERMISSION_DENIED is TRANSPORT (participant-permission-posture spec, Decision 9): the RUNNER observes
// it on the terminal `result` frame (`safety_stops` / `permission_denials`) — no tool declares it.
export const permissionDeniedIsTransport: TransportStopKind = StopKind.PERMISSION_DENIED
```

### Step T1.2 — Run it to see it fail

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`
Expected: FAIL — `Property 'PERMISSION_DENIED' does not exist on type 'typeof StopKind'`.

### Step T1.3 — Author the TypeSpec contract

Create `packages/contracts/src/wire/enums/permission-posture.tsp`:

```typespec
namespace TemplateContracts;

@doc("Under which permission regime an agent turn runs. AUTO = the provider CLI's own graduated mode (its classifier may block an action); BYPASS = no permission filter. Decided by WHO triggered the turn (Participant.canElevate), never by the model; each runner maps it to its own argv through a declared table.")
enum PermissionPosture {
  AUTO: "AUTO",
  BYPASS: "BYPASS",
}
```

Modify `packages/contracts/src/wire/enums/stop-kind.tsp` — complete final file:

```typespec
namespace TemplateContracts;

@doc("Why an agent stopped and flagged the thread 'Needs you'. Each kind admits a specific set of resolutions (see StopResolution). Only kinds enabled in StopPolicyConfig can be raised.")
enum StopKind {
  SERVER_ERROR: "SERVER_ERROR",
  BLOCKED_BY_CLASSIFICATION: "BLOCKED_BY_CLASSIFICATION",
  HUMAN_REQUESTED: "HUMAN_REQUESTED",
  APPROVAL_NEEDED: "APPROVAL_NEEDED",
  // Phase-10 amendment: the provider CLI needs re-authentication (e.g. claude asks for /login).
  // Raised by the terminal engine when a session cannot proceed without the human re-authing the
  // CLI; admissible resolutions are RETRY (after re-login) and TAKE_OVER (see RESOLUTIONS_BY_KIND).
  AUTH_REQUIRED: "AUTH_REQUIRED",
  // Participant-permission-posture amendment: the CLI's permission filter blocked an action in a turn
  // running under PermissionPosture.AUTO. TRANSPORT — observed by the runner on the terminal frame
  // (`safety_stops` / `permission_denials`), never declared by a tool. Recorded at once, never retried
  // (a retry under the same posture repeats the denial); resolutions APPROVE / DENY / TAKE_OVER.
  PERMISSION_DENIED: "PERMISSION_DENIED",
}
```

Modify `packages/contracts/src/wire/main.tsp`: logo após `import "./enums/stop-resolution.tsp";`, adicione

```typespec
// The permission regime an agent turn runs under — cross-boundary because the mailbox column, the run
// token claim and every runner's argv table are typed by it.
import "./enums/permission-posture.tsp";
```

### Step T1.4 — Regenerate the bindings

```bash
env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun contracts
```

Expected: `packages/contracts/generated/typescript/src/wire/enums/permission-posture.ts` existe com `export enum PermissionPosture { AUTO = 'AUTO', BYPASS = 'BYPASS' }`; `stop-kind.ts`, `generated/go/wire/enums.go`, `generated/rust/src/wire/enums.rs` e `generated/openapi/contracts.openapi.yaml` ganham `PERMISSION_DENIED`/`PermissionPosture`; o `cargo check` do crate rust passa (`cargo` precisa estar no PATH: `export PATH="$HOME/.cargo/bin:$PATH"`).

### Step T1.5 — Extend the transport half

Modify `packages/api/typescript/src/agent/enums/TransportStopKind.ts` — complete final file:

```typescript
import { StopKind } from '@codm/contracts-typescript/wire/enums'

/**
 * The TRANSPORT half of the frozen `StopKind` value-set (GOAL-agent-abstraction §4.3).
 *
 * NOT A NEW ENUM — and that is the whole point. §8 rule 5 forbids redeclaring a value-set that
 * contracts already owns, so this is a `type` + an `as const` tuple built FROM `StopKind`. Adding a
 * member here is impossible without adding it to `stop-kind.tsp` first; the compiler enforces it.
 *
 * The partition it encodes, and why the partition is real:
 *
 * | group     | values                                                          | who raises it                                             | FactSource |
 * |-----------|-----------------------------------------------------------------|-----------------------------------------------------------|------------|
 * | TRANSPORT | AUTH_REQUIRED, SERVER_ERROR, PERMISSION_DENIED                  | the RUNNER, observing the process/stream (CLI asked for   | INFERRED   |
 * |           |                                                                 | `/login`, the process died, the permission filter blocked |            |
 * |           |                                                                 | an action on the terminal `result` frame)                 |            |
 * | DOMAIN    | APPROVAL_NEEDED, HUMAN_REQUESTED, BLOCKED_BY_CLASSIFICATION     | ONLY `RaiseStop` / `AskOperator` (§4.4) | DECLARED   |
 *
 * `AgentRunResult.stop` is typed with THIS type, not with `StopKind`, so the type system states the
 * consequence the goal spells out: a run with NO tool scope can still end in `AUTH_REQUIRED` — a
 * transport stop never needed a tool — but it can never manufacture a DOMAIN stop, because
 * `raise_stop` does not exist without tools.
 */
export type TransportStopKind = typeof StopKind.AUTH_REQUIRED | typeof StopKind.SERVER_ERROR | typeof StopKind.PERMISSION_DENIED

/** Iterable form of the same subset — for exhaustiveness checks and runtime membership tests. */
export const TRANSPORT_STOP_KINDS = [StopKind.AUTH_REQUIRED, StopKind.SERVER_ERROR, StopKind.PERMISSION_DENIED] as const

/** True when a wire `StopKind` belongs to the transport half — i.e. the runner is allowed to raise it. */
export function isTransportStopKind(kind: StopKind): kind is TransportStopKind {
	return (TRANSPORT_STOP_KINDS as readonly StopKind[]).includes(kind)
}
```

### Step T1.6 — Fix every exhaustive map so the tree compiles

Modify `packages/api/typescript/src/thread/utils/StopResolutions.ts` — complete final file:

```typescript
import { StopKind, StopResolution } from '@codm/contracts-typescript/wire/enums'

/**
 * The per-kind resolution vocabulary — which `StopResolution`s are applicable to which `StopKind`.
 * Drives both the `Thread.resolveStop` invariant (`RESOLUTION_NOT_APPLICABLE`) and the T14 Needs-You
 * panel's `availableResolutions`. TAKE_OVER (hand the conversation to the human, pausing the thread)
 * applies to every stop; APPROVE/DENY are exclusive to the two kinds that ask for a permission.
 *
 * Lives in `thread/` since B4: the Stop is a child of the Thread aggregate, and the applicability rule
 * is an invariant `Thread.resolveStop` enforces — so the table has to sit inside the context that owns
 * the aggregate raising it, not in the one that used to own the table.
 */
export const RESOLUTIONS_BY_KIND: Record<StopKind, StopResolution[]> = {
	[StopKind.SERVER_ERROR]: [StopResolution.RETRY, StopResolution.TAKE_OVER],
	[StopKind.BLOCKED_BY_CLASSIFICATION]: [StopResolution.RETRY, StopResolution.REVIEW_AND_SEND, StopResolution.TAKE_OVER],
	[StopKind.HUMAN_REQUESTED]: [StopResolution.REVIEW_AND_SEND, StopResolution.TAKE_OVER],
	[StopKind.APPROVAL_NEEDED]: [StopResolution.APPROVE, StopResolution.DENY, StopResolution.TAKE_OVER],
	// AUTH_REQUIRED (phase-10 amendment): the provider CLI needs re-login. RETRY re-runs the issue
	// once the human has re-authed the CLI; TAKE_OVER hands the conversation to the human.
	[StopKind.AUTH_REQUIRED]: [StopResolution.RETRY, StopResolution.TAKE_OVER],
	// PERMISSION_DENIED (participant-permission-posture, Decision 9): the permission filter blocked an
	// action. It is a question of PERMISSION, so it is answered like APPROVAL_NEEDED — APPROVE resumes
	// with the resolver's posture, DENY resumes in AUTO.
	[StopKind.PERMISSION_DENIED]: [StopResolution.APPROVE, StopResolution.DENY, StopResolution.TAKE_OVER],
}

export function resolutionsForKind(kind: StopKind): StopResolution[] {
	return RESOLUTIONS_BY_KIND[kind] ?? [StopResolution.TAKE_OVER]
}

export function isResolutionApplicable(kind: StopKind, resolution: StopResolution): boolean {
	return resolutionsForKind(kind).includes(resolution)
}
```

Modify `packages/api/typescript/src/thread/utils/StopChannelNotice.ts` — complete final file:

```typescript
import { StopKind } from '@codm/contracts-typescript/wire/enums'

/**
 * Quais stops viram mensagem no canal — e o critério NÃO é a gravidade, é a VOZ.
 *
 * Notifica quando o orquestrador não conseguiria ter contado: `SERVER_ERROR` (o turno morreu),
 * `AUTH_REQUIRED` (o CLI pede login e a sessão não anda), `BLOCKED_BY_CLASSIFICATION` (a resposta do
 * agente foi barrada, então o operador não ouviu nada) e `PERMISSION_DENIED` (o filtro de permissões
 * barrou uma ação; o turno termina parado e o pedido de aprovação só chega ao celular por aqui).
 *
 * Não notifica quando houve fala: `HUMAN_REQUESTED` e `APPROVAL_NEEDED` nascem de um turno que rodou e
 * disse alguma coisa — `RecordStopFromExecution` inclusive usa o texto do agente COMO título nesses
 * casos. Uma notificação mecânica ali duplicaria a mensagem que o operador já recebeu.
 *
 * É uma TABELA e não uma cadeia de `if` pela mesma razão que `RESOLUTIONS_BY_KIND` ao lado: um membro
 * novo em `StopKind` quebra a compilação até alguém declarar se ele fala. Um `if` deixaria o kind novo
 * silencioso por omissão, que é o defeito que esta frente existe para corrigir.
 */
export const NOTIFIES_ON_CHANNEL: Record<StopKind, boolean> = {
	[StopKind.SERVER_ERROR]: true,
	[StopKind.AUTH_REQUIRED]: true,
	[StopKind.BLOCKED_BY_CLASSIFICATION]: true,
	[StopKind.PERMISSION_DENIED]: true,
	[StopKind.HUMAN_REQUESTED]: false,
	[StopKind.APPROVAL_NEEDED]: false,
}
```

Modify `packages/api/typescript/src/thread/i18n/messages.ts`:
- em `STOP_TITLES_PT`, após a entrada `AUTH_REQUIRED`, adicione `[StopKind.PERMISSION_DENIED]: 'Uma ação foi barrada pelo filtro de permissões — ela precisa da sua aprovação',`
- em `STOP_TITLES_EN`, após a entrada `AUTH_REQUIRED`, adicione `[StopKind.PERMISSION_DENIED]: 'An action was blocked by the permission filter — it needs your approval',`

Modify `packages/api/typescript/src/thread/usecases/RaiseStop.ts`: em `POLICY_KEY`, após `[StopKind.AUTH_REQUIRED]: 'authRequired',`, adicione `[StopKind.PERMISSION_DENIED]: 'permissionDenied',`.

### Step T1.7 — Thread the new policy key through the stop policy

Modify `packages/contracts/src/db/sqlite/issue.ts`: em `stopPolicyConfig`, logo após a linha `authRequired: integer('auth_required', { mode: 'boolean' }).notNull().default(true),`, adicione

```typescript
	// PERMISSION_DENIED (participant-permission-posture, Decision 9) — on by default like every other
	// criterion; turning it off records nothing when the permission filter blocks an action.
	permissionDenied: integer('permission_denied', { mode: 'boolean' }).notNull().default(true),
```

Modify `packages/api/typescript/src/thread/repositories/StopPolicyConfigRepository/StopPolicyConfigRepository.ts` — complete final file:

```typescript
import type { Transaction } from '@codm/core-typescript'

export interface StopPolicy {
	serverErrors: boolean
	blockedByClassification: boolean
	humanRequested: boolean
	approvalNeeded: boolean
	authRequired: boolean
	/** Whether a `PERMISSION_DENIED` stop (the permission filter blocked an action) is recorded. */
	permissionDenied: boolean
}

export const DEFAULT_STOP_POLICY: StopPolicy = {
	serverErrors: true,
	blockedByClassification: true,
	humanRequested: true,
	approvalNeeded: true,
	authRequired: true,
	permissionDenied: true,
}

/**
 * The global (per-owner) stop-criteria toggles — demoted from an aggregate to a settings row.
 *
 * Lives in `thread/` since B4. A settings row has no parent aggregate to justify it in, which is why
 * this justification sits on the repository itself; what B4 fixes is the ADDRESS — the policy now sits
 * in the context that owns the stops it gates, and `Thread.raiseStop`'s caller reads it from here.
 */
export abstract class StopPolicyConfigRepository {
	abstract get(ownerId: string, tx?: Transaction): Promise<StopPolicy>
	abstract upsert(ownerId: string, policy: StopPolicy, tx?: Transaction): Promise<void>
}
```

Modify `packages/api/typescript/src/thread/repositories/StopPolicyConfigRepository/LibSqlStopPolicyConfigRepository.ts` — complete final file:

```typescript
import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { LibSqlDatabaseDriver, LibSqlTransaction } from '@codm/core-typescript'
import { stopPolicyConfig } from '@codm/contracts/db'
import { StopPolicyConfigRepository, type StopPolicy, DEFAULT_STOP_POLICY } from './StopPolicyConfigRepository'

@injectable()
export class LibSqlStopPolicyConfigRepository extends StopPolicyConfigRepository {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	async get(ownerId: string, tx?: LibSqlTransaction): Promise<StopPolicy> {
		const dbc = tx ?? this.driver.db
		const rows = await dbc.select().from(stopPolicyConfig).where(eq(stopPolicyConfig.ownerId, ownerId)).limit(1)
		const row = rows[0]
		if (!row) return { ...DEFAULT_STOP_POLICY }
		return {
			serverErrors: row.serverErrors,
			blockedByClassification: row.blockedByClassification,
			humanRequested: row.humanRequested,
			approvalNeeded: row.approvalNeeded,
			authRequired: row.authRequired,
			permissionDenied: row.permissionDenied,
		}
	}

	async upsert(ownerId: string, policy: StopPolicy, tx?: LibSqlTransaction): Promise<void> {
		const dbc = tx ?? this.driver.db
		await dbc
			.insert(stopPolicyConfig)
			.values({ ownerId, ...policy })
			.onConflictDoUpdate({ target: stopPolicyConfig.ownerId, set: { ...policy, updatedAt: new Date() } })
	}
}
```

Modify `packages/api/typescript/src/thread/usecases/UpdateStopCriteriaConfig.ts`: em `stopCriteria: z.object({...})`, após `authRequired: z.boolean(),` adicione `permissionDenied: z.boolean(),`.

Modify `packages/api/typescript/src/thread/controllers/UpdateStopCriteria.ts`: no `.example`, o objeto `stopCriteria` ganha `permissionDenied: true` após `authRequired: true`.

Modify `packages/api/typescript/src/ui/usecases/GetSettings.ts`: em `GetSettingsOutputSchema.stopCriteria`, após `authRequired: z.boolean(),` adicione `permissionDenied: z.boolean(),`.

Modify `packages/api/typescript/tests/flows/stop-control-plane.flow.test.ts` e `packages/api/typescript/src/issue/usecases/IssueLifecycle.test.ts`: todo literal `StopPolicy` (os objetos com `authRequired: …`) ganha `permissionDenied: true` — o tsc do Step T1.9 aponta cada um.

### Step T1.8 — Human labels for the new kind

Modify `packages/app/react/src/locales/pt.json`: em `enums.StopKind`, entre `HUMAN_REQUESTED` e `SERVER_ERROR` (ordem alfabética do bloco), adicione `"PERMISSION_DENIED": "Permissão negada",`.

Modify `packages/app/react/src/locales/en.json`: mesma posição, `"PERMISSION_DENIED": "Permission denied",`.

(`enums.*` é namespace reservado — `bun cli i18n` recusa escrevê-lo; a edição é manual por convenção da casa.)

### Step T1.9 — Regenerate OpenAPI + SDK (contract lock)

```bash
env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun sdk
git diff --stat packages/client/dist/ packages/api/typescript/public/docs/openapi.json packages/api/go/public/docs/openapi.json
```

Expected: `StopKind` ganha `PERMISSION_DENIED` nos schemas da SDK; `GetSettings`/`UpdateStopCriteria` ganham `permissionDenied`.

### Step T1.10 — Type-check

Run: `cd packages/contracts && bun test codegen/ && cd ../api/typescript && bun x tsc -p tsconfig.build.json --noEmit && cd ../../app/react && bun x tsc --noEmit`
Expected: PASS, 0 errors (o `permissionDeniedIsTransport` do Step T1.1 agora compila).

### Step T1.11 — Commit

```bash
git add packages/contracts/src/wire/enums/permission-posture.tsp \
        packages/contracts/src/wire/enums/stop-kind.tsp \
        packages/contracts/src/wire/main.tsp \
        packages/contracts/generated/ \
        packages/contracts/src/db/sqlite/issue.ts \
        packages/api/typescript/src/agent/enums/TransportStopKind.ts \
        packages/api/typescript/src/agent/enums/TransportStopKind.typecheck.ts \
        packages/api/typescript/src/thread/utils/StopResolutions.ts \
        packages/api/typescript/src/thread/utils/StopChannelNotice.ts \
        packages/api/typescript/src/thread/i18n/messages.ts \
        packages/api/typescript/src/thread/usecases/RaiseStop.ts \
        packages/api/typescript/src/thread/repositories/StopPolicyConfigRepository/StopPolicyConfigRepository.ts \
        packages/api/typescript/src/thread/repositories/StopPolicyConfigRepository/LibSqlStopPolicyConfigRepository.ts \
        packages/api/typescript/src/thread/usecases/UpdateStopCriteriaConfig.ts \
        packages/api/typescript/src/thread/controllers/UpdateStopCriteria.ts \
        packages/api/typescript/src/ui/usecases/GetSettings.ts \
        packages/api/typescript/tests/flows/stop-control-plane.flow.test.ts \
        packages/api/typescript/src/issue/usecases/IssueLifecycle.test.ts \
        packages/app/react/src/locales/pt.json packages/app/react/src/locales/en.json \
        packages/api/typescript/public/docs/openapi.json packages/api/go/public/docs/openapi.json \
        packages/client/dist/
git commit -m "feat(contracts): PPP — PermissionPosture e StopKind.PERMISSION_DENIED no contrato (Task T1)"
```

---

## Task T2: O banco aceita a negação, guarda a postura do item e semeia canElevate

**Files to write:**
- Modify: `packages/contracts/src/db/sqlite/agent.ts` — coluna `posture` (`DEFAULT 'AUTO'`, CHECK) em `agent_mailbox`
- Create: `packages/contracts/src/db/sqlite/migrations/0029_*.sql` — gerada por `bun migrate:create` + backfill do roster adicionado à mão no topo
- Create: `packages/contracts/src/db/sqlite/migrations/meta/0029_snapshot.json` — gerado
- Modify: `packages/contracts/src/db/sqlite/migrations/meta/_journal.json` — gerado
- Create: `packages/api/go/core/db/sqlite/migrations/0029_*.sql` — espelho `//go:embed` por `db:sync-go`
- Regen: `packages/api/go/core/db/sqlite/schema.sql`
- Regen: `packages/api/go/core/db/sqlite/schema.core.sql`
- Regen: `packages/api/go/internal/shared/db/sqlite/schema.app.sql`
- Regen: `packages/api/go/internal/shared/db/sqlite/gen/models.go`
- Test: `packages/contracts/src/db/participants-can-elevate.backfill.test.ts`

**Files to read:**
- `packages/contracts/src/db/sqlite/migrations/0028_mighty_speed_demon.sql` (precedente de bloco de dados à mão + rebuild)
- `packages/contracts/src/db/sqlite/migrations/0007_high_aaron_stack.sql` (precedente do rebuild de `issue_stops`)
- `.claude/skills/migrate/SKILL.md`

**Agent:** database-architect
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /db-modelling, /migrate
**Depends on:** T1
**Consumes (frozen):** `PermissionPosture` de `packages/contracts/generated/typescript/src/wire/enums` (T1); `StopKind.PERMISSION_DENIED` (o CHECK de `issue_stops.kind` é `enumCheck(..., Object.values(StopKind))` em `packages/contracts/src/db/sqlite/thread.ts:299`, então o rebuild sai do drizzle sozinho); coluna drizzle `stopPolicyConfig.permissionDenied` (T1); o sentinela do operador no roster é a string `'operator'` (`OPERATOR_PARTICIPANT_ID`, `packages/api/typescript/src/thread/objects/TranscriptSpeaker.ts`).
**Scope fence:** DONE — enum, CHECK implícito e coluna da política já declarados (T1). LEFT — a coluna `agent_mailbox.posture`, a migração única (rebuild de `issue_stops`, `ADD permission_denied`, rebuild de `agent_mailbox`, backfill do JSON `thread_threads.participants`), o espelho Go e os schemas derivados do Go. OUT — qualquer leitura/escrita de `posture` em código TS (T6/T8); o campo `canElevate` no VO `Participant` e no tipo `ThreadParticipant` (T3); o Go NÃO ganha código além do espelho — nenhum consumidor Go lê essas colunas.
**Gate:** `bun run --cwd packages/contracts db:check-go && cd packages/contracts && bun test src/db/ && cd ../api/typescript && bun scripts/dump-sqlite-schema.ts --check && bun test core/src/db/libsql/drivers/LibSqlDriver.test.ts && cd ../go && go build ./... && go test ./core/db/sqlite/...`

### Step T2.1 — Write the failing backfill test

Create `packages/contracts/src/db/participants-can-elevate.backfill.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The `canElevate` BACKFILL of `thread_threads.participants` (participant-permission-posture spec,
 * Decision 2 / AC-2) — asserted against the COMMITTED migration bytes, the same file both runtimes
 * apply at boot (`LibsqlDriver` and the Go `SqliteStore`), never against a copy of the SQL.
 *
 * The rule: the `operator` sentinel gains `canElevate: true`, every other participant `false`; a
 * participant that ALREADY carries the key is never touched — which is also what makes a second pass
 * a byte-for-byte no-op (idempotency), the property a boot migrator applying on a reopened file needs.
 */
const MIGRATIONS = join(import.meta.dir, 'sqlite', 'migrations')

function backfillStatements(): string[] {
	const file = readdirSync(MIGRATIONS)
		.filter(name => name.endsWith('.sql'))
		.sort()
		.find(name => readFileSync(join(MIGRATIONS, name), 'utf8').includes("'$.canElevate'"))
	if (!file) throw new Error('no committed migration carries the canElevate backfill')
	return readFileSync(join(MIGRATIONS, file), 'utf8')
		.split('--> statement-breakpoint')
		.map(chunk =>
			chunk
				.split('\n')
				.filter(line => !line.trimStart().startsWith('--'))
				.join('\n')
				.trim(),
		)
		.filter(statement => statement.startsWith('UPDATE `thread_threads`'))
}

function freshDb(): Database {
	const db = new Database(':memory:')
	db.run('CREATE TABLE `thread_threads` (`id` text PRIMARY KEY NOT NULL, `participants` text NOT NULL)')
	return db
}

const seed = (db: Database, id: string, participants: unknown[]) =>
	db.run('INSERT INTO `thread_threads` (`id`, `participants`) VALUES (?, ?)', [id, JSON.stringify(participants)])

const apply = (db: Database) => {
	for (const statement of backfillStatements()) db.run(statement)
}

const raw = (db: Database, id: string): string =>
	(db.query('SELECT `participants` FROM `thread_threads` WHERE `id` = ?').get(id) as { participants: string }).participants

const roster = (db: Database, id: string) =>
	JSON.parse(raw(db, id)) as Array<{ participantId: string; canInvoke: boolean; canElevate?: boolean }>

const OPERATOR = { participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true }
const MEMBER = { participantId: '5511900000011@s.whatsapp.net', name: 'Ada', source: 'Channel group member', canInvoke: true }
const OBSERVER = { participantId: '5511900000012@s.whatsapp.net', name: 'Bob', source: 'Channel group member', canInvoke: false }

describe('participants backfill — canElevate (AC-2)', () => {
	it('the migration carries exactly ONE backfill statement', () => {
		expect(backfillStatements()).toHaveLength(1)
	})

	it('the operator gains canElevate=true, every other participant false — order and the other fields intact', () => {
		const db = freshDb()
		seed(db, 't1', [OPERATOR, MEMBER, OBSERVER])

		apply(db)

		const after = roster(db, 't1')
		expect(after.map(p => p.participantId)).toEqual([OPERATOR.participantId, MEMBER.participantId, OBSERVER.participantId])
		expect(after.map(p => p.canElevate)).toEqual([true, false, false])
		// canInvoke is a SEPARATE axis (Decision 2) — the backfill must not derive one from the other.
		expect(after.map(p => p.canInvoke)).toEqual([true, true, false])
	})

	it('a participant that already carries canElevate is never overwritten', () => {
		const db = freshDb()
		seed(db, 't2', [
			{ ...OPERATOR, canElevate: false },
			{ ...MEMBER, canElevate: true },
		])

		apply(db)

		expect(roster(db, 't2').map(p => p.canElevate)).toEqual([false, true])
	})

	it('is idempotent — a second pass changes no byte', () => {
		const db = freshDb()
		seed(db, 't3', [OPERATOR, MEMBER])

		apply(db)
		const once = raw(db, 't3')
		apply(db)

		expect(raw(db, 't3')).toBe(once)
	})

	it('writes JSON booleans, never 0/1 — the TS VO parses `z.boolean()`', () => {
		const db = freshDb()
		seed(db, 't4', [OPERATOR])

		apply(db)

		expect(raw(db, 't4')).toContain('"canElevate":true')
	})
})
```

### Step T2.2 — Run it to verify it fails

Run: `cd packages/contracts && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test src/db/participants-can-elevate.backfill.test.ts`
Expected: FAIL — `no committed migration carries the canElevate backfill`.

### Step T2.3 — Declare the mailbox posture column

Modify `packages/contracts/src/db/sqlite/agent.ts`:
- adicione `PermissionPosture` ao import de enums já existente de `'../../../generated/typescript/src/wire/enums'`;
- em `agentMailbox`, logo após a linha `kind: text('kind').$type<MailboxItemKind>().notNull(),`, adicione

```typescript
		/**
		 * The PERMISSION POSTURE of the turn this item schedules (participant-permission-posture spec,
		 * Decision 4) — stamped by the producer from WHO triggered the work, never by a model.
		 *
		 * A COLUMN, not a key inside `payload`: the payload is opaque to the queue, and a key no producer
		 * is forced to write is a key somebody forgets. `DEFAULT 'AUTO'` is the legacy rule made
		 * declarative — an item enqueued before this column existed reads as AUTO, the least privilege,
		 * with no branch anywhere in the reader.
		 */
		posture: text('posture').$type<PermissionPosture>().notNull().default(PermissionPosture.AUTO),
```

- na lista de constraints (`t => [...]`), após `enumCheck('agent_mailbox_kind_check', t.kind, Object.values(MailboxItemKind)),`, adicione `enumCheck('agent_mailbox_posture_check', t.posture, Object.values(PermissionPosture)),`.

### Step T2.4 — Generate the migration

```bash
env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun migrate:create
```

Expected: UM arquivo novo `packages/contracts/src/db/sqlite/migrations/0029_<duas-palavras>.sql` (+ `meta/0029_snapshot.json` e `_journal.json`) contendo exatamente: o rebuild `__new_agent_mailbox` (coluna `posture` `DEFAULT 'AUTO' NOT NULL` + `agent_mailbox_posture_check`, com o `INSERT INTO ... SELECT` SEM `posture` na lista — as linhas existentes ganham o DEFAULT — e os índices `agent_mailbox_dedup_unq` / `agent_mailbox_pending_idx ... WHERE dead_at IS NULL` recriados), o `ALTER TABLE issue_stop_policy_config ADD permission_denied integer DEFAULT true NOT NULL`, e o rebuild `__new_issue_stops` com `'PERMISSION_DENIED'` no CHECK de `kind` e os índices `stops_issue_id_idx` / `stops_thread_id_idx` recriados. Se aparecer QUALQUER outra tabela, PARE e reporte (drift prévio).

### Step T2.5 — Hand-add the roster backfill at the top of the generated file

Edite o `0029_*.sql` gerado: ANTES da primeira linha gerada, insira (o precedente é o bloco de dados à mão no topo de `0028_mighty_speed_demon.sql`):

```sql
-- HAND-ADDED (participant-permission-posture spec, Decision 2 / AC-2): every roster participant gains
-- `canElevate` — the `operator` sentinel true, everyone else false. The VO parses `z.boolean()` with no
-- default, so a roster without the key would refuse to rehydrate. A participant that already carries
-- the key is left alone, which is also what makes a second pass a no-op (idempotent under the shared
-- `_sqlite_migrations` ledger, whichever runtime boots first). Pinned by
-- `packages/contracts/src/db/participants-can-elevate.backfill.test.ts`.
UPDATE `thread_threads` SET `participants` = (SELECT json_group_array(CASE WHEN json_type(value, '$.canElevate') IS NOT NULL THEN json(value) ELSE json_set(value, '$.canElevate', json(CASE WHEN json_extract(value, '$.participantId') = 'operator' THEN 'true' ELSE 'false' END)) END) FROM json_each(`thread_threads`.`participants`)) WHERE EXISTS (SELECT 1 FROM json_each(`thread_threads`.`participants`) WHERE json_type(value, '$.canElevate') IS NULL);--> statement-breakpoint
```

### Step T2.6 — Run the backfill test

Run: `cd packages/contracts && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test src/db/`
Expected: PASS — os 5 casos do backfill e o `schema-drift.test.ts` (o snapshot 0029 agora bate com o schema).

### Step T2.7 — Mirror into the Go embed and re-derive the Go schemas

```bash
env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun run --cwd packages/contracts db:sync-go
env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun run --cwd packages/contracts db:check-go
cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun scripts/dump-sqlite-schema.ts && cd ../../..
env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun scripts/db/split-sqlite-schema.ts
command -v sqlc && (cd packages/api/go/core/db/sqlite && sqlc generate) && (cd packages/api/go/internal/shared/db/sqlite && sqlc generate)
```

Expected: o `0029_*.sql` aparece byte-idêntico em `packages/api/go/core/db/sqlite/migrations/`; `schema.sql` / `schema.app.sql` passam a listar `PERMISSION_DENIED` no CHECK de `issue_stops`, `permission_denied` na política e `posture` no mailbox (NOTA: `dump-sqlite-schema.ts --check` já está vermelho em HEAD por causa da 0028 — TERRA/LUNA — e esta regeneração também conserta isso); com `sqlc` instalado, `gen/models.go` ganha `PermissionDenied int64` em `IssueStopPolicyConfig` e `Posture string` em `AgentMailbox`. Sem `sqlc` no PATH, o `models.go` fica para o CI e o `scripts/sqlc-parity.test.ts` pula com aviso — reporte isso no PR, não edite `models.go` à mão.

### Step T2.8 — Verify both runtimes apply it

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test core/src/db/libsql/drivers/LibSqlDriver.test.ts && bun scripts/dump-sqlite-schema.ts --check && cd ../go && go build ./... && go test ./core/db/sqlite/...`
Expected: PASS — a migração aplica do zero nos dois migradores e o segundo passe aplica zero; `schema.sql matches the migrations`.

### Step T2.9 — Commit

```bash
git add packages/contracts/src/db/sqlite/agent.ts \
        packages/contracts/src/db/sqlite/migrations/ \
        packages/contracts/src/db/participants-can-elevate.backfill.test.ts \
        packages/api/go/core/db/sqlite/migrations/ \
        packages/api/go/core/db/sqlite/schema.sql \
        packages/api/go/core/db/sqlite/schema.core.sql \
        packages/api/go/internal/shared/db/sqlite/schema.app.sql \
        packages/api/go/internal/shared/db/sqlite/gen/models.go
git commit -m "feat(db): PPP — PERMISSION_DENIED em issue_stops, posture no mailbox e backfill de canElevate (Task T2)"
```

---

## Task T3: O operador decide quem pode liberar ações sem filtro (backend)

**Files to write:**
- Modify: `packages/api/typescript/src/thread/entities/Thread.ts` — `canElevate` no VO `Participant`; `admitParticipant` admite sem elevação; `setParticipantElevation`
- Modify: `packages/contracts/src/db/sqlite/thread.ts` — `canElevate` no tipo `ThreadParticipant`
- Modify: `packages/api/typescript/src/thread/usecases/AttachThread.ts` — semeia `operator=true`, demais `false`
- Modify: `packages/api/typescript/src/thread/usecases/ConfigureThreadSettings.ts` — use case `SetParticipantElevation` + admissão compartilhada
- Create: `packages/api/typescript/src/thread/controllers/SetParticipantElevation.ts`
- Modify: `packages/api/typescript/src/thread/controllers/index.ts` — barrel registra o controller novo
- Modify: `packages/api/typescript/src/thread/usecases/GetThreadSettings.ts` — read model expõe `canElevate`
- Modify: `packages/api/typescript/tests/support/given/threads.ts` — roster padrão com `canElevate`
- Modify: `packages/api/typescript/testing.d.ts` — `SeedParticipant.canElevate`
- Modify: `packages/api/typescript/src/thread/entities/Thread.test.ts` — literais do roster ganham `canElevate`
- Modify: `packages/api/typescript/src/thread/usecases/GetThreadSettings.test.ts` — literais do roster ganham `canElevate`
- Modify: `packages/api/typescript/src/thread/usecases/ConfigureThreadSettings.test.ts` — literais do roster ganham `canElevate`
- Modify: `packages/api/typescript/src/thread/usecases/DeletedThreadWrites.test.ts` — literais do roster ganham `canElevate`
- Modify: `packages/api/typescript/src/thread/usecases/IngestChannelMessage.test.ts` — literais do roster ganham `canElevate`
- Modify: `packages/api/typescript/src/thread/usecases/ChannelCues.test.ts` — literais do roster ganham `canElevate`
- Modify: `packages/api/typescript/src/thread/handlers/ConsumeInboundMessage.test.ts` — literais do roster ganham `canElevate`
- Test: `packages/api/typescript/src/thread/usecases/SetParticipantElevation.test.ts`

**Files to read:**
- `packages/api/typescript/src/thread/controllers/SetParticipantInvocation.ts`
- `packages/api/typescript/src/thread/usecases/ConfigureThreadSettings.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /usecase, /controller, /query, /test
**Depends on:** T2
**Consumes (frozen):** o JSON `thread_threads.participants` já carrega `canElevate` em toda linha (backfill da T2); `OPERATOR_PARTICIPANT_ID` (`'operator'`) de `packages/api/typescript/src/thread/objects/TranscriptSpeaker.ts`; `DomainErrors` `'PARTICIPANT_NOT_FOUND'` (existente); `GroupMemberReader.isMember(channelId, groupId, memberId)` (existente).
**Scope fence:** DONE — a coluna/backfill (T2). LEFT — o VO, o agregado, o use case, o controller `PUT /threads/:threadId/participants/:participantId/elevation`, o read model e os givens. OUT — `Thread.postureOf` (T8 — quem LÊ `canElevate` para decidir postura); a regeneração da SDK (T4); qualquer UI (T5). Sem invariante "último elevador" (Decision 2).
**Gate:** `cd packages/api/typescript && bun test src/thread/ && bun x tsc -p tsconfig.build.json --noEmit`

### Step T3.1 — Write the failing test

Create `packages/api/typescript/src/thread/usecases/SetParticipantElevation.test.ts`:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { BaseError } from '@codm/core-typescript'
import { ContactKind, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenRemote, givenRemoteMembership, givenThread, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ChannelConnectivity } from '../services/ChannelConnectivity'
import { SetParticipantElevationController } from '../controllers/SetParticipantElevation'
import { AttachThread } from './AttachThread'
import { GetThreadSettings } from './GetThreadSettings'
import { SetParticipantElevation } from './ConfigureThreadSettings'

const GROUP_CHANNEL = '019e4d24-0000-7041-9e1c-0000000000f1'
const GROUP_ID = '120363222222222222@g.us'
const MEMBER_A = '5511900000021@s.whatsapp.net'
const MEMBER_B = '5511900000022@s.whatsapp.net'

/**
 * AC-2 / AC-3 (participant-permission-posture spec) — `canElevate` is a per-participant, per-thread
 * grant the operator controls. The operator is born with it, every member without it, and the
 * console door persists a flip, refuses an unknown participant, and admits a live group member the
 * JSON roster never recorded (the same admission `SetParticipantInvocation` already has).
 */
describe('SetParticipantElevation — who may run turns with no permission filter', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
		testBed.override(ChannelConnectivity, { isConnected: async () => true, anyConnected: async () => true } as ChannelConnectivity)
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const settingsFor = (threadId: string) => testBed.resolve(GetThreadSettings).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId })

	const groupThread = async () => {
		await givenRemote(testBed, { channelId: GROUP_CHANNEL, remoteId: GROUP_ID, type: ContactKind.GROUP, name: 'BK DASH BOT' })
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		return givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			workspaceId: workspace.id.value,
			channelId: GROUP_CHANNEL,
			contactExternalId: GROUP_ID,
			contactKind: ContactKind.GROUP,
			participants: [
				{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true, canElevate: true },
				{ participantId: MEMBER_A, name: MEMBER_A, source: 'Channel group member', canInvoke: true, canElevate: false },
			],
		})
	}

	it('AC-2 — AttachThread seeds the operator WITH elevation and every group member WITHOUT', async () => {
		await givenRemoteMembership(testBed, { channelId: GROUP_CHANNEL, groupId: GROUP_ID, memberId: MEMBER_A })
		await givenRemoteMembership(testBed, { channelId: GROUP_CHANNEL, groupId: GROUP_ID, memberId: MEMBER_B })
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		const out = await testBed.resolve(AttachThread).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			contactRef: { channelId: GROUP_CHANNEL, externalId: GROUP_ID, displayName: 'BK DASH BOT', kind: ContactKind.GROUP },
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})

		const thread = await testBed.resolve(ThreadRepository).findById(out.threadId)
		const byId = new Map(thread?.participants.map(p => [p.participantId, p.canElevate]))
		expect(byId.get('operator')).toBe(true)
		expect(byId.get(MEMBER_A)).toBe(false)
		expect(byId.get(MEMBER_B)).toBe(false)
	})

	it('AC-2 — a 1:1 thread seeds the counterparty WITHOUT elevation', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const out = await testBed.resolve(AttachThread).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			contactRef: { channelId: GROUP_CHANNEL, externalId: 'contact-1', displayName: 'Ada', kind: ContactKind.USER },
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})

		const thread = await testBed.resolve(ThreadRepository).findById(out.threadId)
		expect(thread?.participants.find(p => p.participantId === 'contact-1')?.canElevate).toBe(false)
		expect(thread?.participants.find(p => p.participantId === 'operator')?.canElevate).toBe(true)
	})

	it('AC-3 — granting a member persists, and the settings read reflects it on reopen', async () => {
		const thread = await groupThread()
		await givenRemoteMembership(testBed, { channelId: GROUP_CHANNEL, groupId: GROUP_ID, memberId: MEMBER_A })

		await testBed
			.resolve(SetParticipantElevation)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, participantId: MEMBER_A, canElevate: true })

		const reloaded = await testBed.resolve(ThreadRepository).findById(thread.id.value)
		expect(reloaded?.participants.find(p => p.participantId === MEMBER_A)?.canElevate).toBe(true)
		const settings = await settingsFor(thread.id.value)
		expect(settings.participants.find(p => p.participantId === MEMBER_A)?.canElevate).toBe(true)
		expect(settings.participants.find(p => p.participantId === 'operator')?.canElevate).toBe(true)
	})

	it('AC-3 — an id that is neither on the roster nor a live member is refused with PARTICIPANT_NOT_FOUND', async () => {
		const thread = await groupThread()

		const failure = await testBed
			.resolve(SetParticipantElevation)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, participantId: 'stranger@s.whatsapp.net', canElevate: true })
			.then(
				() => undefined,
				(error: unknown) => error as BaseError,
			)

		expect(failure?.name).toBe('PARTICIPANT_NOT_FOUND')
	})

	it('admits a LIVE group member the JSON roster never recorded, then grants it', async () => {
		const thread = await groupThread()
		await givenRemoteMembership(testBed, { channelId: GROUP_CHANNEL, groupId: GROUP_ID, memberId: MEMBER_B })

		await testBed
			.resolve(SetParticipantElevation)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, participantId: MEMBER_B, canElevate: true })

		const reloaded = await testBed.resolve(ThreadRepository).findById(thread.id.value)
		const admitted = reloaded?.participants.find(p => p.participantId === MEMBER_B)
		expect(admitted?.canElevate).toBe(true)
		// Admission does not grant INVOCATION — the two axes stay independent.
		expect(admitted?.canInvoke).toBe(false)
	})

	it('canElevate is independent of canInvoke — the operator may drop elevation and keep invoking', async () => {
		const thread = await groupThread()

		await testBed
			.resolve(SetParticipantElevation)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, participantId: 'operator', canElevate: false })

		const operator = (await testBed.resolve(ThreadRepository).findById(thread.id.value))?.participants.find(p => p.participantId === 'operator')
		expect(operator?.canElevate).toBe(false)
		expect(operator?.canInvoke).toBe(true)
	})

	it('the console door answers 204 and writes through the use case', async () => {
		const thread = await groupThread()

		const response = await testBed.resolve(SetParticipantElevationController).handle({
			ctx: { ownerId: MOCK_CLOUD_OWNER_ID },
			params: { threadId: thread.id.value, participantId: MEMBER_A },
			body: { canElevate: true },
		})

		expect(response.status).toBe(204)
		const reloaded = await testBed.resolve(ThreadRepository).findById(thread.id.value)
		expect(reloaded?.participants.find(p => p.participantId === MEMBER_A)?.canElevate).toBe(true)
	})
})
```

### Step T3.2 — Run test to verify it fails

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test src/thread/usecases/SetParticipantElevation.test.ts`
Expected: FAIL — `Cannot find module '../controllers/SetParticipantElevation'`.

### Step T3.3 — The VO and the aggregate

Modify `packages/api/typescript/src/thread/entities/Thread.ts`:
- substitua o comentário e a declaração de `ParticipantSchema` por

```typescript
// Participant VO — everyone in the conversation. Two INDEPENDENT grants: `canInvoke` decides who may
// trigger agents; `canElevate` decides whose trigger runs the turn with NO permission filter
// (PermissionPosture.BYPASS). No invariant ties one to the other (participant-permission-posture,
// Decision 2): a thread where nobody may elevate simply runs every turn in AUTO.
export const ParticipantSchema = z.object({
	participantId: z.string().min(1),
	name: z.string().min(1),
	source: z.string(),
	canInvoke: z.boolean(),
	canElevate: z.boolean(),
})
```

- substitua o método `admitParticipant` (mantendo o docblock acima dele) por

```typescript
	admitParticipant(participant: Omit<Participant, 'canElevate'>): void {
		if (this.participants.some(p => p.participantId === participant.participantId)) return
		// ADMITTED WITHOUT ELEVATION, always — the grant is not even accepted here, and the explicit
		// `false` is written AFTER the spread so a caller that smuggles one in still loses it. Elevation
		// is something the operator grants on purpose (`setParticipantElevation`), never a side effect of
		// joining the roster.
		this.participants = [...this.participants, { ...participant, canElevate: false }]
	}
```

- logo após o método `setParticipantInvocation`, adicione

```typescript
	/**
	 * Grant or withdraw the right to run this conversation's turns with NO permission filter.
	 *
	 * Independent of `canInvoke` (participant-permission-posture, Decision 2): there is no "last
	 * elevator" invariant — a thread where nobody may elevate runs every turn in AUTO, which is the safe
	 * state, not a broken one.
	 */
	setParticipantElevation(participantId: string, canElevate: boolean): void {
		const participant = this.participants.find(p => p.participantId === participantId)
		if (!participant) throw new BaseError<DomainErrors>('PARTICIPANT_NOT_FOUND', `no participant ${participantId}`)
		participant.canElevate = canElevate
		// Reassign to trigger the embedded-array persistence path.
		this.participants = [...this.participants]
	}
```

Modify `packages/contracts/src/db/sqlite/thread.ts`: no tipo `ThreadParticipant`, após `canInvoke: boolean`, adicione `canElevate: boolean`.

Modify `packages/api/typescript/src/thread/usecases/AttachThread.ts`: no roster semeado, o literal do operador ganha `canElevate: true`; os três literais de membro/contato (`'Channel group member'`, `'Channel group'`, `'Channel contact'`) ganham `canElevate: false`. Atualize o comentário acima ("the operator always invokes") para "the operator always invokes and may elevate; everyone else observes and may not".

### Step T3.4 — Scaffold the controller

```bash
bun cli controller thread SetParticipantElevation -m put -p '/threads/:threadId/participants/:participantId/elevation'
```

### Step T3.5 — Proposed controller (executor writes this over the scaffold)

```typescript
// packages/api/typescript/src/thread/controllers/SetParticipantElevation.ts — COMPLETE final file
import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { CloudSessionMiddleware } from '@shared/middlewares'
import {
	SetParticipantElevation,
	SetParticipantElevationInputSchema,
	SetParticipantElevationOutputSchema,
} from '../usecases/ConfigureThreadSettings'

export const SetParticipantElevationControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: SetParticipantElevationInputSchema.pick({ threadId: true, participantId: true }),
		body: SetParticipantElevationInputSchema.pick({ canElevate: true }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', participantId: '5511999999999' },
			body: { canElevate: true },
		},
	])
export const SetParticipantElevationControllerOutputSchema = SetParticipantElevationOutputSchema

/**
 * The console's second per-participant toggle (participant-permission-posture, Decision 3) — whether
 * an order from this person runs the turn with no permission filter. Molded on
 * `SetParticipantInvocationController`: same door shape, same admission of a live group member the JSON
 * roster never recorded, a separate sub-resource because it is a separate grant.
 *
 * NOT an MCP tool, on purpose: no `static mcpScopes`. Granting elevation is the operator's decision in
 * the console; an agent that could call it could elevate itself.
 */
@injectable()
export class SetParticipantElevationController extends Controller<
	typeof SetParticipantElevationControllerInputSchema,
	typeof SetParticipantElevationControllerOutputSchema
> {
	readonly path = '/threads/:threadId/participants/:participantId/elevation'
	readonly method = 'put' as const
	readonly description = 'Toggle whether an order from a participant runs with no permission filter'
	readonly inputSchema = SetParticipantElevationControllerInputSchema
	readonly outputSchema = SetParticipantElevationControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: SetParticipantElevation) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			participantId: request.params.participantId,
			canElevate: request.body.canElevate,
		})
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
```

Modify `packages/api/typescript/src/thread/controllers/index.ts`: ao lado de cada uma das três ocorrências de `SetParticipantInvocationController` (o `export { … } from`, o `import { … } from` e a entrada no array de controllers), adicione a linha equivalente para `SetParticipantElevationController` de `'./SetParticipantElevation'`.

### Step T3.6 — The use case, sharing the admission with its sibling

Modify `packages/api/typescript/src/thread/usecases/ConfigureThreadSettings.ts`:
- adicione `import type { Thread } from '../entities/Thread'` aos imports;
- logo ACIMA do comentário `// C13 SetParticipantInvocation`, adicione a função de módulo

```typescript
/**
 * Admit a LIVE group member the JSON roster has never recorded — the door both per-participant
 * toggles share. One copy, because the rule is one: an id is admitted only after
 * `GroupMemberReader.isMember` confirms it against the live projection, so the admission never becomes
 * a way to grant anything to an arbitrary id. An id that fails the check falls through untouched, and
 * the aggregate's own guard raises `PARTICIPANT_NOT_FOUND` for it.
 */
async function admitLiveGroupMember(thread: Thread, groupMembers: GroupMemberReader, participantId: string): Promise<void> {
	const onJsonRoster = thread.participants.some(p => p.participantId === participantId)
	if (onJsonRoster || thread.contactRef.kind !== ContactKind.GROUP) return
	const isLiveMember = await groupMembers.isMember(thread.channelId, thread.contactRef.externalId, participantId)
	if (!isLiveMember) return
	thread.admitParticipant({ participantId, name: participantId, source: 'Channel group member', canInvoke: false })
}
```

- em `SetParticipantInvocation.handle`, substitua o bloco `const onJsonRoster = … }` (do `onJsonRoster` até o fechamento do `if` que chama `thread.admitParticipant`) por `await admitLiveGroupMember(thread, this.groupMembers, input.participantId)`;
- logo APÓS a classe `SetParticipantInvocation`, adicione

```typescript
// SetParticipantElevation — whose order runs this conversation's turns with NO permission filter.
export const SetParticipantElevationInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	participantId: z.string().min(1),
	canElevate: z.boolean(),
})
export const SetParticipantElevationOutputSchema = z.void()

/**
 * SetParticipantElevation (participant-permission-posture, Decision 3) — the second per-participant
 * grant, molded on C13: same tenancy check, same admission of a live group member the JSON roster has
 * never recorded (`admitLiveGroupMember`), then the aggregate flips the grant. No "last elevator" rule.
 */
@injectable()
export class SetParticipantElevation extends Handler<typeof SetParticipantElevationInputSchema, typeof SetParticipantElevationOutputSchema> {
	readonly name = 'set_participant_elevation' as const
	readonly inputSchema = SetParticipantElevationInputSchema
	readonly outputSchema = SetParticipantElevationOutputSchema
	constructor(
		private readonly threads: ThreadRepository,
		private readonly groupMembers: GroupMemberReader,
	) {
		super()
	}
	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const thread = await this.threads.findById(input.threadId)
		if (!thread || thread.ownerId !== input.ownerId)
			throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)
		await admitLiveGroupMember(thread, this.groupMembers, input.participantId)
		thread.setParticipantElevation(input.participantId, input.canElevate)
		await this.withTransaction(tx, async tx => this.threads.save(thread, tx))
	}
}
```

### Step T3.7 — The read model

Modify `packages/api/typescript/src/thread/usecases/GetThreadSettings.ts`:
- no schema `participants: z.array(z.object({...}))`, após `canInvoke: z.boolean(),` adicione `canElevate: z.boolean(),`;
- no `rosterIds.map(...)`, após a linha `canInvoke: json?.canInvoke ?? false,` adicione

```typescript
				// Same default for the same reason: a live member the JSON never recorded was never GRANTED
				// anything — `Thread.admitParticipant` writes `false` the first time a toggle admits them.
				canElevate: json?.canElevate ?? false,
```

### Step T3.8 — Givens and the test sweep

Modify `packages/api/typescript/tests/support/given/threads.ts`: o roster padrão vira

```typescript
		participants: overrides.participants ?? [
			{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true, canElevate: true },
			{ participantId: contactExternalId, name: 'Test Contact', source: 'Channel contact', canInvoke: false, canElevate: false },
		],
```

Modify `packages/api/typescript/testing.d.ts`: em `interface SeedParticipant`, após `canInvoke: boolean`, adicione `canElevate: boolean`.

Sweep: rode `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`; cada literal de participante que ele apontar (nos testes listados em **Files to write**) ganha `canElevate` com a MESMA regra do `AttachThread`: `true` exatamente quando `participantId` é `'operator'`, `false` em todos os outros.

### Step T3.9 — Run tests to verify they pass

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test src/thread/ && bun x tsc -p tsconfig.build.json --noEmit`
Expected: PASS — os 7 casos novos e toda a suíte de `src/thread/`; 0 erros de tipo.

### Step T3.10 — Commit

```bash
git add packages/api/typescript/src/thread/entities/Thread.ts \
        packages/contracts/src/db/sqlite/thread.ts \
        packages/api/typescript/src/thread/usecases/AttachThread.ts \
        packages/api/typescript/src/thread/usecases/ConfigureThreadSettings.ts \
        packages/api/typescript/src/thread/controllers/SetParticipantElevation.ts \
        packages/api/typescript/src/thread/controllers/index.ts \
        packages/api/typescript/src/thread/usecases/GetThreadSettings.ts \
        packages/api/typescript/tests/support/given/threads.ts \
        packages/api/typescript/testing.d.ts \
        packages/api/typescript/src/thread/usecases/SetParticipantElevation.test.ts \
        packages/api/typescript/src/thread/entities/Thread.test.ts \
        packages/api/typescript/src/thread/usecases/GetThreadSettings.test.ts \
        packages/api/typescript/src/thread/usecases/ConfigureThreadSettings.test.ts \
        packages/api/typescript/src/thread/usecases/DeletedThreadWrites.test.ts \
        packages/api/typescript/src/thread/usecases/IngestChannelMessage.test.ts \
        packages/api/typescript/src/thread/usecases/ChannelCues.test.ts \
        packages/api/typescript/src/thread/handlers/ConsumeInboundMessage.test.ts
git commit -m "feat(thread): PPP — canElevate por participante, configurável pelo console (Task T3)"
```

---

## Task T4: Contract Lock — SDK regen para a elevação por participante

**Files to write:**
- Regen: `packages/api/typescript/public/docs/openapi.json`
- Regen: `packages/client/dist/**`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** T3
**Consumes (frozen):** `SetParticipantElevationController` (`PUT /threads/:threadId/participants/:participantId/elevation`, body `{ canElevate }`) e o campo `participants[].canElevate` de `GetThreadSettingsOutputSchema` (T3).
**Scope fence:** DONE — o backend da T3. LEFT — só regenerar. OUT — qualquer edição à mão em `packages/client/dist/`.
**Gate:** `bun tsc` (0 erros) + presença de `useSetParticipantElevation` e `setParticipantElevationMutationRequestSchema` em `packages/client/dist/typescript/src/typescript/`.

### Step T4.1 — Regenerate OpenAPI + SDK

```bash
env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun emit-openapi && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun sdk
```

### Step T4.2 — Verify regen produced the expected artifacts

```bash
git diff --stat packages/client/dist/ packages/api/typescript/public/docs/openapi.json
grep -rl "useSetParticipantElevation\|setParticipantElevationMutationRequestSchema" packages/client/dist/typescript/src/typescript/ | head
```

Expected: `openapi.json` mudou; `hooks/useSetParticipantElevation.ts`, `client/setParticipantElevation.ts` e `zod/setParticipantElevationSchema.ts` existem; o tipo de `GetThreadSettings` traz `canElevate: boolean` nos participantes.

### Step T4.3 — Type-check after regen

Run: `env -u NODE_ENV bun tsc`
Expected: FAIL apenas em `packages/app/react` onde mocks de stories/testes montam participantes sem `canElevate` — esses são da T5. Todos os outros workspaces: 0 erros.

### Step T4.4 — Commit

```bash
git add packages/api/typescript/public/docs/openapi.json packages/client/dist/
git commit -m "chore(sdk): PPP — regenera openapi+sdk para a elevação por participante (Task T4)"
```

---

## Task T5: O console mostra e alterna "pode liberar" por participante

**Files to write:**
- Modify: `packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx` — `ParticipantsSection` ganha o segundo toggle
- Modify: `packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.stories.tsx` — participantes do mock com `canElevate`
- Modify: `packages/app/react/src/routes/(app)/threads/$threadId/thread-config.stories.tsx` — participantes do mock com `canElevate`
- Modify: `packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.test.tsx` — teste de comportamento do toggle
- Modify: `packages/app/react/src/locales/pt.json` — `session.canElevateToggle`, `session.canElevateToggleFor`
- Modify: `packages/app/react/src/locales/en.json` — idem
- Create: `packages/e2e/tests/15-participant-elevation.spec.ts`

**Files to read:**
- `packages/e2e/tests/11-artifact-preview.spec.ts` (setup do navegador: `authenticateCloudSession` + `givenCompletedOnboarding`)

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /component, /storybook, /e2e
**Depends on:** T4
**Consumes (frozen):** `useSetParticipantElevation` (mutate `{ threadId, participantId, data: { canElevate } }`), `setParticipantElevation(threadId, participantId, { canElevate }, { client })`, `getThreadSettings`, `getThreadSettingsQueryKey`, e `participants[].canElevate` do output de `useGetThreadSettings` — todos de `@codm/client-typescript/typescript` (T4).
**Scope fence:** DONE — backend e SDK (T3, T4). LEFT — o toggle, os mocks das stories, o teste de comportamento, as chaves i18n e a spec e2e. OUT — qualquer mudança em `useSetParticipantInvocation` ou no cabeçalho da seção além de envolver cada switch no seu próprio `<label>` (dois controles num `<label>` só fariam o clique na linha alternar o primeiro).
**Gate:** `cd packages/app/react && bun x tsc --noEmit && bun test 'src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.test.tsx' && bun run storybook:build && cd ../../e2e && bun run test -- tests/15-participant-elevation.spec.ts`

### Step T5.1 — Locale keys (CLI writer)

```bash
bun cli i18n session --keys=canElevateToggle,canElevateToggleFor --with-pt='canElevateToggle=Pode liberar;canElevateToggleFor=Pode liberar ações sem filtro: {{name}}' --with-en='canElevateToggle=Can approve;canElevateToggleFor=Can approve unfiltered actions: {{name}}'
```

Expected: `pt.json` e `en.json` ganham as duas chaves sob `session`, em lock-step.

### Step T5.2 — Write the failing behavior test

Modify `packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.test.tsx`: dentro de `describe('ThreadSettingsDialog — contra o backend real', …)`, logo após o teste `'a resposta em tempo real nasce ligada e desligar persiste no backend real'`, adicione

```tsx
	/**
	 * "PODE LIBERAR" (participant-permission-posture, AC-3) — o operador nasce podendo liberar e o membro
	 * não (a semente de `AttachThread`/`givenThread`), e ligar o membro persiste no backend real: a prova
	 * é a releitura via SDK, não o estado do switch.
	 */
	it('o operador nasce podendo liberar, o membro não, e ligar o membro persiste no backend real', async () => {
		const threadId = await seedThread()
		await mount(threadId)

		const seeded = await getThreadSettings(threadId)
		const operator = seeded.participants.find(p => p.participantId === 'operator')
		const member = seeded.participants.find(p => p.participantId !== 'operator')
		expect(operator).toBeDefined()
		expect(member).toBeDefined()

		const toggleFor = (name: string) =>
			document.querySelector<HTMLElement>(`[aria-label="${i18n.t('session.canElevateToggleFor', { name })}"]`)

		expect(toggleFor(operator!.name)?.getAttribute('aria-checked')).toBe('true')
		expect(toggleFor(member!.name)?.getAttribute('aria-checked')).toBe('false')

		await act(async () => {
			toggleFor(member!.name)?.click()
		})

		await mounted!.settled(() => toggleFor(member!.name)?.getAttribute('aria-checked') === 'true', 'o switch do membro refletir ligado')

		const persisted = await getThreadSettings(threadId)
		expect(persisted.participants.find(p => p.participantId === member!.participantId)?.canElevate).toBe(true)
		// O outro eixo não se move: liberar não é invocar.
		expect(persisted.participants.find(p => p.participantId === member!.participantId)?.canInvoke).toBe(false)
	})
```

### Step T5.3 — Run test to verify it fails

Run: `cd packages/app/react && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test 'src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.test.tsx'`
Expected: FAIL — `expect(received).toBe(expected)` com `null` (não existe switch com o aria-label de liberar).

### Step T5.4 — The second toggle

Modify `packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx`:
- adicione `useSetParticipantElevation,` à lista importada de `@codm/client-typescript/typescript` (logo após `useSetParticipantInvocation,`);
- substitua a função `ParticipantsSection` inteira (do docblock `/** Participantes — quem pode invocar…` até o `}` que a fecha) por

```tsx
/**
 * Participantes — quem pode invocar e quem pode LIBERAR ações sem filtro. Dois eixos independentes
 * (participant-permission-posture, Decision 2), dois switches por linha; cada um no seu próprio
 * `<label>`, porque um `<label>` com dois controles alterna sempre o primeiro.
 */
function ParticipantsSection({ threadId, className, ...props }: { threadId: string } & ComponentProps<'section'>) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isLoading } = useGetThreadSettings(threadId)
	const setInvocation = useSetParticipantInvocation()
	const setElevation = useSetParticipantElevation()

	const invalidate = () => queryClient.invalidateQueries({ queryKey: getThreadSettingsQueryKey(threadId) })

	if (isLoading || !data) {
		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-7 rounded-lg" />
				<Skeleton className="h-10 rounded-lg" />
				<Skeleton className="h-10 rounded-lg" />
			</div>
		)
	}

	return (
		<section className={cn('flex flex-col gap-2', className)} {...props}>
			<h3 className={sectionLabel}>{t('session.participantsWhoCanInvoke')}</h3>
			{/* Plain rows, no bordered card: the heading's rule already groups them, and a second box
			    inside a modal is one frame too many. The avatar is what makes a roster scannable. */}
			<div className="flex flex-col">
				{data.participants.map(participant => (
					<div key={participant.participantId} className="flex items-center gap-3 py-1.5">
						{/* A CARA do participante quando a agenda do gateway tem uma — o `operator` nunca tem
						    (é uma palavra, não um JID), e um membro que a sincronização ainda não escreveu
						    também não: os dois caem nas iniciais sem caso especial aqui. */}
						<ThreadAvatar
							name={participant.name}
							src={participant.hasAvatar ? contactAvatarUrl(participant.channelId, participant.participantId) : undefined}
						/>
						<div className="flex min-w-0 flex-1 flex-col gap-0.5">
							<span className="truncate text-sm font-bold text-foreground">{participant.name}</span>
							<span className="truncate text-xs text-muted-foreground">{participant.source}</span>
						</div>
						<label className="flex shrink-0 items-center gap-2">
							<span className="text-xs text-muted-foreground">{t('session.canInvokeToggle')}</span>
							<Switch
								checked={participant.canInvoke}
								onCheckedChange={value =>
									setInvocation.mutate(
										{ threadId, participantId: participant.participantId, data: { canInvoke: value } },
										{ onSuccess: invalidate },
									)
								}
							/>
						</label>
						<label className="flex shrink-0 items-center gap-2">
							<span className="text-xs text-muted-foreground">{t('session.canElevateToggle')}</span>
							<Switch
								checked={participant.canElevate}
								aria-label={t('session.canElevateToggleFor', { name: participant.name })}
								onCheckedChange={value =>
									setElevation.mutate(
										{ threadId, participantId: participant.participantId, data: { canElevate: value } },
										{ onSuccess: invalidate },
									)
								}
							/>
						</label>
					</div>
				))}
			</div>
		</section>
	)
}
```

### Step T5.5 — Stories

Modify `packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.stories.tsx`: no mock de `getThreadSettingsQueryOptions`, o participante `operator` ganha `canElevate: true` e o `ada` ganha `canElevate: false` (os dois estados do switch novo aparecem na story).

Modify `packages/app/react/src/routes/(app)/threads/$threadId/thread-config.stories.tsx`: cada participante do mock (as linhas com `canInvoke: true`) ganha `canElevate`, `true` só para `participantId: 'operator'` e `false` para os demais — `bun x tsc --noEmit` aponta cada um.

### Step T5.6 — Run the behavior test + stories

Run: `cd packages/app/react && bun x tsc --noEmit && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test 'src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.test.tsx' && bun run storybook:build`
Expected: PASS — 0 erros de tipo, o teste novo e os existentes verdes, storybook compila.

### Step T5.7 — Write the e2e spec

Create `packages/e2e/tests/15-participant-elevation.spec.ts`:

```typescript
import { expect } from '@playwright/test'
import { getThreadSettings, setParticipantElevation } from '@codm/client-typescript/typescript'
import { test } from '../utils/test'
import { givenAttachedThread, givenCompletedOnboarding, givenFreshUser } from '../utils/given'
import { authenticateCloudSession } from '../utils/given/cloud'
import { t } from '../utils/i18n'

/** The switch's accessible name — the same interpolated copy the console renders, read from the bundle. */
const elevationToggle = (name: string) => t('session.canElevateToggleFor').replace('{{name}}', name)

/**
 * Story 1 (participant-permission-posture, AC-2 / AC-3) — the operator marks who may approve actions
 * with no filter, and the choice survives reopening the dialog.
 *
 * Drives the REAL stack: the thread is attached through the real `AttachThread` (the seed under test
 * for AC-2), the toggle is clicked in the real console, and persistence is proven by re-reading through
 * the SDK and by a reload — never by the switch's own state.
 */
test('o operador marca quem pode liberar ações sem filtro, e a escolha sobrevive a reabrir', async ({ page, goto }) => {
	test.setTimeout(60_000)

	const user = await givenFreshUser({})
	const thread = await givenAttachedThread(user.session, { displayName: 'Ada' })
	await givenCompletedOnboarding(user.session)
	const client = user.session.client

	// AC-2 — the seed: the operator WITH elevation, the counterparty WITHOUT.
	const seeded = await getThreadSettings(thread.threadId, { client })
	const operator = seeded.participants.find(p => p.participantId === 'operator')
	const member = seeded.participants.find(p => p.participantId === thread.contactExternalId)
	expect(operator?.canElevate).toBe(true)
	expect(member?.canElevate).toBe(false)

	await authenticateCloudSession(page)
	await goto('/threads/$threadId', { threadId: thread.threadId })
	await page.getByRole('button', { name: t('session.threadSettings') }).click()

	const memberToggle = page.getByRole('switch', { name: elevationToggle(member!.name) })
	await expect(memberToggle).toHaveAttribute('aria-checked', 'false')
	await expect(page.getByRole('switch', { name: elevationToggle(operator!.name) })).toHaveAttribute('aria-checked', 'true')

	await memberToggle.click()
	await expect(memberToggle).toHaveAttribute('aria-checked', 'true')

	// AC-3 — persisted, read back through the SDK.
	await expect
		.poll(
			async () =>
				(await getThreadSettings(thread.threadId, { client })).participants.find(p => p.participantId === thread.contactExternalId)
					?.canElevate,
			{ timeout: 5_000, message: 'the elevation flip never reached the backend' },
		)
		.toBe(true)

	// …and on reopen.
	await page.reload()
	await page.getByRole('button', { name: t('session.threadSettings') }).click()
	await expect(page.getByRole('switch', { name: elevationToggle(member!.name) })).toHaveAttribute('aria-checked', 'true')

	// AC-3 — an id that is not a participant is refused (PARTICIPANT_NOT_FOUND), never silently admitted.
	await expect(setParticipantElevation(thread.threadId, 'nobody@s.whatsapp.net', { canElevate: true }, { client })).rejects.toThrow()
})
```

### Step T5.8 — Run the e2e spec

Run: `cd packages/e2e && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun run test -- tests/15-participant-elevation.spec.ts`
Expected: PASS — 1 test.

### Step T5.9 — Commit

```bash
git add 'packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx' \
        'packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.stories.tsx' \
        'packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.test.tsx' \
        'packages/app/react/src/routes/(app)/threads/$threadId/thread-config.stories.tsx' \
        packages/app/react/src/locales/pt.json packages/app/react/src/locales/en.json \
        packages/e2e/tests/15-participant-elevation.spec.ts
git commit -m "feat(app): PPP — toggle 'pode liberar' por participante no ThreadSettingsDialog (Task T5)"
```

---

## Task T6: O turno roda com a postura do item que consumiu

**Files to write:**
- Modify: `packages/api/typescript/core/src/utils/schema/ExtraTypes.ts` — `posture` no envelope `BaseAgentInputSchema`
- Modify: `packages/api/typescript/src/agent/types/AgentRunRequest.ts` — `posture: PermissionPosture` obrigatório
- Modify: `packages/api/typescript/src/agent/types/AgentRunIdentity.ts` — claim `posture` em `AgentRunIdentitySchema` e em `AgentRunIdentityCtxSchema`
- Modify: `packages/api/typescript/src/agent/types/Agent.ts` — a base carimba `request.posture` e o claim a partir do envelope
- Modify: `packages/api/typescript/src/agent/agents/IssueWorkAgent/IssueWorkAgent.ts` — `buildRequest` omite `posture`
- Modify: `packages/api/typescript/src/agent/agents/OrchestratorAgent/OrchestratorAgent.ts` — `buildRequest` omite `posture`
- Modify: `packages/api/typescript/src/agent/repositories/MailboxRepository/MailboxRepository.ts` — `ClaimedMailboxItem.posture`
- Modify: `packages/api/typescript/src/agent/repositories/MailboxRepository/LibSqlMailboxRepository.ts` — `claimNext` devolve a coluna
- Modify: `packages/api/typescript/src/agent/repositories/MailboxRepository/MockMailboxRepository.ts` — gêmeo do DEFAULT
- Modify: `packages/api/typescript/src/agent/services/MailboxDispatcher/LibSqlMailboxDispatcher.ts` — repassa `item.posture` aos dois turnos
- Modify: `packages/api/typescript/src/agent/usecases/RunIssueTurn.ts` — `posture` no input, repassado ao envelope
- Modify: `packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts` — `posture` no input, repassado ao envelope
- Modify: `packages/api/typescript/src/agent/controllers/ForkIssue.ts` — `posture` no `.example` do `agentIdentity`
- Modify: `packages/api/typescript/src/agent/controllers/SteerIssueTurn.ts` — `posture` no `.example` do `agentIdentity`
- Modify: `.claude/skills/agent/typescript/registry.yaml` — snippet do `buildRequest` omite `posture`
- Modify: `scripts/cli/backend/typescript/__fixtures__/agent.class.txt` — golden do scaffold idem
- Modify: `packages/api/typescript/src/agent/types/Agent.identity.test.ts` — envelope de teste ganha `posture`
- Modify: `packages/api/typescript/src/agent/agents/IssueWorkAgent/IssueWorkAgent.test.ts` — idem
- Modify: `packages/api/typescript/src/agent/agents/OrchestratorAgent/OrchestratorAgent.test.ts` — idem
- Modify: `packages/api/typescript/src/agent/usecases/RunIssueTurn.test.ts` — `baseInput` ganha `posture`
- Modify: `packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.test.ts` — idem
- Modify: `packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.thinking.test.ts` — idem
- Modify: `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.test.ts` — `request()` ganha `posture`
- Modify: `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/cancellation.test.ts` — idem
- Modify: `packages/api/typescript/src/agent/services/AgentRunner/CodexAgentRunner/CodexAgentRunner.run.test.ts` — idem
- Modify: `packages/api/typescript/src/agent/mcp/door.test.ts` — `.issue({…})` ganha `posture`
- Modify: `packages/api/typescript/src/agent/mcp/door.write-isolation.test.ts` — idem
- Modify: `packages/api/typescript/src/thread/controllers/ResolveStop.test.ts` — idem
- Modify: `packages/api/typescript/src/thread/controllers/ConfigureModel.test.ts` — idem
- Modify: `packages/api/typescript/src/thread/controllers/ConfigurePrompt.test.ts` — idem
- Modify: `packages/api/typescript/src/thread/controllers/ThreadLoops.test.ts` — idem
- Modify: `packages/api/typescript/tests/flows/agent-session-resume.flow.test.ts` — idem
- Test: `packages/api/typescript/src/agent/services/MailboxDispatcher/LibSqlMailboxDispatcher.posture.test.ts`

**Files to read:**
- `packages/api/typescript/src/agent/services/MailboxDispatcher/LibSqlMailboxDispatcher.test.ts` (o molde dos espiões de turno no container, `'a escolha de modelo da thread chega ao turno…'`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** opus
**Skills:** /agent, /usecase, /repository, /service, /schema, /test
**Depends on:** T2
**Consumes (frozen):** `PermissionPosture` de `@codm/contracts-typescript/wire/enums` (T1); coluna drizzle `agentMailbox.posture` com `DEFAULT 'AUTO'` (T2, `packages/contracts/src/db/sqlite/agent.ts`).
**Scope fence:** DONE — enum e coluna. LEFT — o CANAL inteiro da postura do item ao processo e ao token: `ClaimedMailboxItem.posture` → dispatcher → `RunIssueTurn`/`RunOrchestratorTurn` → envelope → `AgentRunRequest.posture` + claim. OUT — os runners ainda IGNORAM `request.posture` (o argv é da T7; o Claude continua emitindo `--permission-mode auto` até lá); `EnqueueMailboxItem.posture` e todo produtor (T8 — até lá o item nasce com o DEFAULT da coluna); `ResolveStop` (T9). Nenhum argumento de tool ganha `posture`.
**Gate:** `cd packages/api/typescript && bun test src/agent/ tests/flows/ && bun x tsc -p tsconfig.build.json --noEmit && cd ../../.. && bun test scripts/cli`

### Step T6.1 — Write the failing test

Create `packages/api/typescript/src/agent/services/MailboxDispatcher/LibSqlMailboxDispatcher.posture.test.ts`:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import type { ZodType } from 'zod'
import { AgentIdentityService, LibSqlDatabaseDriver, LoggingService } from '@codm/core-typescript'
import { agentMailbox } from '@codm/contracts/db'
import { MailboxItemKind, MailboxTargetKind, PermissionPosture, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenThread, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { CloudSession } from '@shared/services/CloudSession'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { WorkspaceRepository } from '@workspace/repositories/WorkspaceRepository'
import { AgentSessionRepository } from '../../repositories/AgentSessionRepository'
import { MailboxRepository } from '../../repositories/MailboxRepository'
import { RunOrchestratorTurn } from '../../usecases/RunOrchestratorTurn'
import { RunIssueTurn } from '../../usecases/RunIssueTurn'
import { AgentRunner } from '../AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '../AgentRunnerFactory'
import { AgentRunOutcome } from '../../enums'
import type { AgentRunRequest } from '../../types/AgentRunRequest'
import type { AgentRuntimeEvent } from '../../types/AgentRuntimeEvent'
import { LibSqlMailboxDispatcher } from './LibSqlMailboxDispatcher'

/** Captures the request the AGENT assembled, so what reaches the seam is what gets asserted. */
class CapturingRunner extends AgentRunner {
	readonly requests: AgentRunRequest<ZodType | undefined>[] = []
	async *run<OutputSchema extends ZodType | undefined = undefined>(request: AgentRunRequest<OutputSchema>): AsyncIterable<AgentRuntimeEvent> {
		this.requests.push(request)
		yield { type: 'finished', result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'ok', sessionId: 'sess-posture', failed: false } }
	}
	async shutdown(): Promise<void> {}
}

/**
 * AC-5 / AC-6 (participant-permission-posture) — the posture of the item the dispatcher CLAIMED is the
 * posture the turn runs under: it reaches the use case, then the runner request, then the run token
 * the tool doors read back. One item per turn (`claimNext` + `.limit(1)`), so there is nothing to
 * combine — the claimed item's posture IS the turn's.
 *
 * Items are inserted straight into `agent_mailbox` because what is under test is the READ side; the
 * producers that stamp the column are their own Task.
 */
describe('a turn runs with the posture of the item it consumed', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const insertItem = (values: {
		targetKind: MailboxTargetKind
		targetId: string
		kind: MailboxItemKind
		payload: unknown
		posture: PermissionPosture
	}) =>
		testBed
			.resolve(LibSqlDatabaseDriver)
			.db.insert(agentMailbox)
			.values({ id: uuidv7(), ownerId: MOCK_CLOUD_OWNER_ID, dedupKey: `posture:${uuidv7()}`, ...values })

	it('the dispatcher hands the claimed posture to the orchestrator turn AND to the issue turn', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value, providers: [ProviderKind.CLAUDE_CODE] })

		const seen: Record<string, PermissionPosture | undefined> = {}
		const spy = (label: string) => ({
			bindContainer() {
				return this
			},
			async execute(input: { posture: PermissionPosture }) {
				seen[label] = input.posture
				return { spoke: true }
			},
		})
		const spyContainer = testContainer.createChildContainer()
		spyContainer.registerInstance(RunOrchestratorTurn as never, spy('thread') as never)
		spyContainer.registerInstance(RunIssueTurn as never, spy('issue') as never)

		await insertItem({
			targetKind: MailboxTargetKind.THREAD,
			targetId: thread.id.value,
			kind: MailboxItemKind.OPERATOR_MESSAGE,
			payload: { kind: MailboxItemKind.OPERATOR_MESSAGE, entryId: uuidv7(), speaker: 'operator', text: 'troca a moeda' },
			posture: PermissionPosture.BYPASS,
		})
		await insertItem({
			targetKind: MailboxTargetKind.ISSUE,
			targetId: uuidv7(),
			kind: MailboxItemKind.WORK,
			payload: { threadId: thread.id.value, key: 'moeda', title: 'moeda', goal: 'troca a moeda', provider: ProviderKind.CLAUDE_CODE },
			posture: PermissionPosture.BYPASS,
		})

		const dispatcher = new LibSqlMailboxDispatcher(
			testBed.resolve(MailboxRepository),
			testBed.resolve(ThreadRepository),
			testBed.resolve(WorkspaceRepository),
			testBed.resolve(AgentSessionRepository),
			testBed.resolve(LoggingService),
			testBed.resolve(CloudSession),
		).bind(spyContainer)
		await dispatcher.drain()

		expect(seen.thread).toBe(PermissionPosture.BYPASS)
		expect(seen.issue).toBe(PermissionPosture.BYPASS)
	})

	it('RunIssueTurn puts the posture on the runner request AND on the run token the tools read back', async () => {
		const runner = new CapturingRunner()
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))

		await testBed.resolve(RunIssueTurn).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			issueId: uuidv7(),
			threadId: uuidv7(),
			key: 'moeda',
			title: 'Troca a moeda',
			provider: ProviderKind.CLAUDE_CODE,
			workspacePath: '/tmp/workspace',
			prompt: 'troca a moeda da Loja 01',
			turnKind: MailboxItemKind.WORK,
			messageId: uuidv7(),
			posture: PermissionPosture.BYPASS,
		})

		const request = runner.requests[0]
		expect(request?.posture).toBe(PermissionPosture.BYPASS)
		expect(testBed.resolve(AgentIdentityService).resolve(request?.mcp?.token ?? '')?.posture).toBe(PermissionPosture.BYPASS)
	})

	it('RunOrchestratorTurn does the same for the orchestrator — AUTO stays AUTO', async () => {
		const runner = new CapturingRunner()
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		await testBed.resolve(RunOrchestratorTurn).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			workspacePath: '/tmp/workspace',
			provider: ProviderKind.CLAUDE_CODE,
			item: { kind: MailboxItemKind.OPERATOR_MESSAGE, entryId: uuidv7(), speaker: 'Ada', text: 'libera a conta X' },
			entryId: uuidv7(),
			posture: PermissionPosture.AUTO,
		})

		const request = runner.requests[0]
		expect(request?.posture).toBe(PermissionPosture.AUTO)
		expect(testBed.resolve(AgentIdentityService).resolve(request?.mcp?.token ?? '')?.posture).toBe(PermissionPosture.AUTO)
	})
})
```

### Step T6.2 — Run test to verify it fails

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test src/agent/services/MailboxDispatcher/LibSqlMailboxDispatcher.posture.test.ts`
Expected: FAIL — `expect(received).toBe(expected)`: `seen.thread` é `undefined` (o dispatcher não repassa postura) e `request.posture` é `undefined`.

### Step T6.3 — The envelope (core)

Modify `packages/api/typescript/core/src/utils/schema/ExtraTypes.ts`:
- adicione `import { PermissionPosture } from '@codm/contracts-typescript/wire/enums'` aos imports;
- em `BaseAgentInputSchema`, logo após `entryId: z.uuid().optional(),` (e seu docblock), adicione

```typescript
	/**
	 * The PERMISSION POSTURE this run executes under — decided by WHO triggered it, never by the model.
	 *
	 * On the envelope for the same reason `entryId` is: it becomes a RUN TOKEN CLAIM at the single,
	 * generic mint site, and it shapes the argv every runner builds — both read it off an input whose
	 * schema they cannot see under constraint erasure. REQUIRED: a run that nobody gave a posture would
	 * otherwise default to something, and a silent default is exactly what this field exists to remove.
	 */
	posture: z.enum(PermissionPosture),
```

### Step T6.4 — The request and the claim

Modify `packages/api/typescript/src/agent/types/AgentRunRequest.ts`:
- troque o import de tipos de enums para `import type { AgentModelId, PermissionPosture } from '@codm/contracts-typescript/wire/enums'`;
- em `AgentRunRequest`, logo após `agentName: AgentName`, adicione

```typescript
	/**
	 * The permission posture this run executes under — REQUIRED (participant-permission-posture,
	 * Decision 8). Stamped by the base `Agent` from the input envelope (who triggered the turn), never by
	 * `buildRequest`; each runner maps it to its own argv through a declared `Record<PermissionPosture, …>`.
	 * Per spawn: every turn is a new process with `--resume`, so a posture never outlives its turn.
	 */
	posture: PermissionPosture
```

Modify `packages/api/typescript/src/agent/types/AgentRunIdentity.ts`:
- troque o import de enums para `import { McpScope, PermissionPosture } from '@codm/contracts-typescript/wire/enums'`;
- em `AgentRunIdentitySchema`, após `entryId: z.uuid().optional(),`, adicione

```typescript
	/**
	 * The posture the run was minted with (participant-permission-posture, Decision 6) — WHO triggered
	 * the turn, read back by the tool doors that schedule MORE work (`ForkIssue`, `SteerIssueTurn`,
	 * `ResolveStop`) so that work inherits it. Same un-forgeability argument as `entryId`: no tool schema
	 * names it, so there is no argument a model could set.
	 */
	posture: z.enum(PermissionPosture),
```

- em `AgentRunIdentityCtxSchema`, no objeto interno de `agentIdentity`, após `entryId: z.uuid().optional(),`, adicione `posture: z.enum(PermissionPosture),` (sem isto o Zod REMOVE a chave antes do `handle` — o mesmo motivo do docblock do schema).

### Step T6.5 — The base stamps it

Modify `packages/api/typescript/src/agent/types/Agent.ts`:
- substitua o corpo de `run()` por

```typescript
	async *run(runner: AgentRunner, input: this['input']): AsyncIterable<AgentRuntimeEvent> {
		const request = {
			...this.buildRequest(input),
			agentName: (this.constructor as typeof Agent).NAME,
			// The POSTURE is the base's to stamp, like the identity: it comes from the envelope — who
			// triggered the turn — so no agent's `buildRequest` can widen or narrow it.
			posture: input.posture,
		}
		// The scope is passed DOWN rather than re-read off `this` inside the callee: it is what confines
		// the minted credential (D6-8), and threading the already-narrowed value is what makes "a token
		// is always bound to a scope" hold by type instead of by a cast.
		yield* runner.run({ ...request, ...(this.mcpScope && { mcp: this.buildMcpInvocation(input, request, this.mcpScope) }) })
	}
```

- em `buildMcpInvocation`, no objeto passado a `IdentitySchema.safeParse({...})`, após `entryId: input.entryId,` adicione

```typescript
			// The claim the tool doors read to stamp the work THEY schedule (Decision 6). From the envelope,
			// never from a tool argument — see `AgentRunIdentitySchema.posture`.
			posture: input.posture,
```

- a assinatura abstrata vira `protected abstract buildRequest(input: this['input']): Omit<AgentRunRequest<OutputSchema>, 'mcp' | 'agentName' | 'posture'>` e o docblock acima dela passa a dizer "WITHOUT `mcp`, WITHOUT identity and WITHOUT posture".

Modify `packages/api/typescript/src/agent/agents/IssueWorkAgent/IssueWorkAgent.ts` e `packages/api/typescript/src/agent/agents/OrchestratorAgent/OrchestratorAgent.ts`: a assinatura de `buildRequest` vira `Omit<AgentRunRequest, 'mcp' | 'agentName' | 'posture'>` (nenhum corpo muda).

Modify `.claude/skills/agent/typescript/registry.yaml` e `scripts/cli/backend/typescript/__fixtures__/agent.class.txt`: a linha `protected buildRequest(input: this['input']): Omit<AgentRunRequest, 'mcp' | 'agentName'> {` vira `… Omit<AgentRunRequest, 'mcp' | 'agentName' | 'posture'> {` e o comentário acima dela ("No `mcp`, no `agentName` — the base stamps both.") vira "No `mcp`, no `agentName`, no `posture` — the base stamps all three." (o golden do scaffold e o snippet da skill andam juntos; `bun test scripts/cli` é o rail).

### Step T6.6 — The queue hands it over

Modify `packages/api/typescript/src/agent/repositories/MailboxRepository/MailboxRepository.ts`:
- troque o import para `import type { MailboxItemKind, MailboxTargetKind, PermissionPosture } from '@codm/contracts-typescript/wire/enums'`;
- em `ClaimedMailboxItem`, após `payload: unknown`, adicione

```typescript
	/**
	 * The posture the turn this item schedules runs under — the `posture` column, whose `DEFAULT 'AUTO'`
	 * is what an item enqueued before the column existed reads as.
	 */
	posture: PermissionPosture
```

Modify `packages/api/typescript/src/agent/repositories/MailboxRepository/LibSqlMailboxRepository.ts`: no `.returning({...})` de `claimNext`, após `payload: agentMailbox.payload,` adicione `posture: agentMailbox.posture,`.

Modify `packages/api/typescript/src/agent/repositories/MailboxRepository/MockMailboxRepository.ts`:
- adicione `import { PermissionPosture } from '@codm/contracts-typescript/wire/enums'`;
- no objeto devolvido por `claimNext`, após `payload: row.payload,` adicione

```typescript
			// The in-memory twin of the column's DEFAULT — what every item reads as until a producer stamps one.
			posture: PermissionPosture.AUTO,
```

Modify `packages/api/typescript/src/agent/services/MailboxDispatcher/LibSqlMailboxDispatcher.ts`:
- em `runThreadTurn`, no objeto passado a `RunOrchestratorTurn.execute`, após `model: thread.modelFor(provider),` adicione

```typescript
			// WHO TRIGGERED IT decides how far the turn may go (participant-permission-posture, Decision 5):
			// one item per turn, so the claimed item's posture IS the turn's — there is nothing to combine.
			posture: item.posture,
```

- em `runIssueWork`, no objeto passado a `RunIssueTurn.execute`, após `model: thread.modelFor(provider),` adicione `posture: item.posture,`.

### Step T6.7 — The use cases carry it into the envelope

Modify `packages/api/typescript/src/agent/usecases/RunIssueTurn.ts`:
- adicione `PermissionPosture` ao import de `@codm/contracts-typescript/wire/enums`;
- em `RunIssueTurnInputSchema`, após `model: z.enum(AgentModelId).optional(),`, adicione

```typescript
	/**
	 * The permission posture of the mailbox item that scheduled this turn — WHO triggered it. REQUIRED
	 * and undefaulted for the same reason `turnKind` is: a default here would make "nobody decided"
	 * silently mean something.
	 */
	posture: z.enum(PermissionPosture),
```

- em `drainRun`, no objeto passado a `this.agent.run(runner, {...})`, após `caps: detection.caps,` adicione `posture: input.posture,`.

Modify `packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts`:
- adicione `PermissionPosture` ao import de `@codm/contracts-typescript/wire/enums`;
- em `RunOrchestratorTurnInputSchema`, após `model: z.enum(AgentModelId).optional(),`, adicione o mesmo campo `posture: z.enum(PermissionPosture),` com o mesmo docblock;
- no objeto passado a `this.agent.run(runner, {...})`, após `caps: detection.caps,` adicione `posture: input.posture,`.

Modify `packages/api/typescript/src/agent/controllers/ForkIssue.ts` e `packages/api/typescript/src/agent/controllers/SteerIssueTurn.ts`: adicione `PermissionPosture` ao import de enums e, no `.example`, o objeto `agentIdentity` ganha `posture: PermissionPosture.AUTO` após `scope: McpScope.orchestration`.

### Step T6.8 — The test sweep

Rode `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`. Para cada erro nos testes listados em **Files to write**:
- fixture que monta `AgentRunRequest` (`request()` dos runners, `cancellation.test.ts`), input de agente (`input()`/`baseInput`/`drain`), input de `RunIssueTurn`/`RunOrchestratorTurn` → acrescente `posture: PermissionPosture.AUTO`;
- `InMemoryAgentIdentityService.issue({…})` → acrescente `posture: PermissionPosture.AUTO`.
`AUTO` em todos: nenhum teste existente afirma nada sobre postura, e AUTO é o comportamento que eles já exercitavam.

### Step T6.9 — Run tests to verify they pass

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test src/agent/ tests/flows/ && bun x tsc -p tsconfig.build.json --noEmit && cd ../../.. && env -u NODE_ENV bun test scripts/cli`
Expected: PASS — os 3 casos novos e as suítes existentes; o golden do scaffold de agente verde.

### Step T6.10 — Commit

```bash
git add packages/api/typescript/core/src/utils/schema/ExtraTypes.ts \
        packages/api/typescript/src/agent/types/AgentRunRequest.ts \
        packages/api/typescript/src/agent/types/AgentRunIdentity.ts \
        packages/api/typescript/src/agent/types/Agent.ts \
        packages/api/typescript/src/agent/agents/IssueWorkAgent/IssueWorkAgent.ts \
        packages/api/typescript/src/agent/agents/OrchestratorAgent/OrchestratorAgent.ts \
        packages/api/typescript/src/agent/repositories/MailboxRepository/MailboxRepository.ts \
        packages/api/typescript/src/agent/repositories/MailboxRepository/LibSqlMailboxRepository.ts \
        packages/api/typescript/src/agent/repositories/MailboxRepository/MockMailboxRepository.ts \
        packages/api/typescript/src/agent/services/MailboxDispatcher/LibSqlMailboxDispatcher.ts \
        packages/api/typescript/src/agent/services/MailboxDispatcher/LibSqlMailboxDispatcher.posture.test.ts \
        packages/api/typescript/src/agent/usecases/RunIssueTurn.ts \
        packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts \
        packages/api/typescript/src/agent/controllers/ForkIssue.ts \
        packages/api/typescript/src/agent/controllers/SteerIssueTurn.ts \
        .claude/skills/agent/typescript/registry.yaml \
        scripts/cli/backend/typescript/__fixtures__/agent.class.txt \
        packages/api/typescript/src/agent/types/Agent.identity.test.ts \
        packages/api/typescript/src/agent/agents/IssueWorkAgent/IssueWorkAgent.test.ts \
        packages/api/typescript/src/agent/agents/OrchestratorAgent/OrchestratorAgent.test.ts \
        packages/api/typescript/src/agent/usecases/RunIssueTurn.test.ts \
        packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.test.ts \
        packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.thinking.test.ts \
        packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.test.ts \
        packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/cancellation.test.ts \
        packages/api/typescript/src/agent/services/AgentRunner/CodexAgentRunner/CodexAgentRunner.run.test.ts \
        packages/api/typescript/src/agent/mcp/door.test.ts \
        packages/api/typescript/src/agent/mcp/door.write-isolation.test.ts \
        packages/api/typescript/src/thread/controllers/ResolveStop.test.ts \
        packages/api/typescript/src/thread/controllers/ConfigureModel.test.ts \
        packages/api/typescript/src/thread/controllers/ConfigurePrompt.test.ts \
        packages/api/typescript/src/thread/controllers/ThreadLoops.test.ts \
        packages/api/typescript/tests/flows/agent-session-resume.flow.test.ts
git commit -m "feat(agent): PPP — a postura do item chega ao request do runner e ao claim do run token (Task T6)"
```

---

## Task T7: Cada runner traduz a postura no próprio argv

**Files to write:**
- Modify: `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.ts` — `CLAUDE_PERMISSION_ARGS` e `ClaudeBuildArgsOptions.posture`
- Modify: `packages/api/typescript/src/agent/services/AgentRunner/CodexAgentRunner/CodexAgentRunner.ts` — `CODEX_PERMISSION_ARGS` e `CodexBuildArgsOptions.posture`
- Modify: `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/buildArgs.test.ts` — `opts()` ganha `posture: AUTO`
- Modify: `packages/api/typescript/src/agent/services/AgentRunner/CodexAgentRunner/CodexAgentRunner.test.ts` — os `base` ganham `posture: AUTO`
- Test: `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/buildArgs.posture.test.ts`
- Test: `packages/api/typescript/src/agent/services/AgentRunner/CodexAgentRunner/buildArgs.posture.test.ts`

**Files to read:**
- `.specs/codedm/codex-smoke/raw/help-exec.txt` (linha 61) e `.specs/codedm/codex-smoke/raw/help-exec-resume.txt` (linha 44) — o flag de bypass existe nos DOIS formatos

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** T6
**Consumes (frozen):** `AgentRunRequest.posture: PermissionPosture` (T6); `PermissionPosture.AUTO`/`.BYPASS` (T1).
**Scope fence:** DONE — a postura já chega ao request (T6). LEFT — as duas tabelas tipadas e o repasse `request.posture → buildArgs`. OUT — leitura de `safety_stops`/`permission_denials` (T10); qualquer `if (posture === …)` — a tradução é SÓ lookup na tabela.
**Gate:** `cd packages/api/typescript && bun test src/agent/services/AgentRunner/ && bun x tsc -p tsconfig.build.json --noEmit`

### Step T7.1 — Write the failing tests

Create `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/buildArgs.posture.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import { MockLoggingService, InMemoryAgentIdentityService } from '@codm/core-typescript'
import { PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { AgentMessageRole, AgentName } from '../../../enums'
import type { AgentProcess, AgentProcessSpec } from './AgentProcess'
import { ClaudeAgentRunner } from './ClaudeAgentRunner'

/**
 * AC-8 (participant-permission-posture) — `claude`'s argv per posture: AUTO → `--permission-mode auto`,
 * BYPASS → `--permission-mode bypassPermissions`. FALSIFIER: map BYPASS to `auto` (or drop the posture
 * on the way to `buildArgs`) and the BYPASS cases below go red; map AUTO to `bypassPermissions` and the
 * "AUTO never bypasses" case goes red.
 */
const argv = (posture: PermissionPosture) => ClaudeAgentRunner.buildArgs({ cwd: '/w', caps: {}, posture })

const modeOf = (args: readonly string[]): string[] =>
	args.flatMap((arg, i) => (arg === '--permission-mode' ? [args[i + 1] ?? '<missing>'] : []))

describe('ClaudeAgentRunner.buildArgs — the permission mode is the posture', () => {
	it('AUTO → exactly one `--permission-mode auto`', () => {
		expect(modeOf(argv(PermissionPosture.AUTO))).toEqual(['auto'])
	})

	it('BYPASS → exactly one `--permission-mode bypassPermissions`', () => {
		expect(modeOf(argv(PermissionPosture.BYPASS))).toEqual(['bypassPermissions'])
	})

	it('AUTO never carries the bypass — the least-privilege half of the table', () => {
		expect(argv(PermissionPosture.AUTO)).not.toContain('bypassPermissions')
	})

	it('every posture the contract declares maps to exactly one permission mode', () => {
		for (const posture of Object.values(PermissionPosture)) expect(modeOf(argv(posture))).toHaveLength(1)
	})

	it('the posture is the ONLY thing that moves between the two argvs', () => {
		const auto = argv(PermissionPosture.AUTO)
		const bypass = argv(PermissionPosture.BYPASS)
		expect(auto.filter(a => a !== 'auto')).toEqual(bypass.filter(a => a !== 'bypassPermissions'))
	})
})

describe('ClaudeAgentRunner.run — request.posture reaches the spawned argv', () => {
	it('a BYPASS request spawns with bypassPermissions', async () => {
		let spawned: AgentProcessSpec | undefined
		const spawner = (spec: AgentProcessSpec): AgentProcess => {
			spawned = spec
			return {
				stdout: (async function* () {})(),
				stderr: (async function* () {})(),
				write() {},
				endStdin() {},
				kill() {},
				exited: Promise.resolve(0),
			}
		}
		const runner = ClaudeAgentRunner.withOptions(new MockLoggingService(), new InMemoryAgentIdentityService(), {
			spawner,
			inactivityMs: 1_000,
			postMortemMs: 10,
		})

		for await (const _ of runner.run({
			agentName: AgentName.ISSUE_WORK,
			cwd: '/tmp/w',
			binaryPath: '/opt/bin/claude',
			messages: [{ role: AgentMessageRole.USER, content: 'faz' }],
			posture: PermissionPosture.BYPASS,
		})) {
			// drain
		}

		expect(modeOf(spawned?.cmd ?? [])).toEqual(['bypassPermissions'])
	})
})
```

Create `packages/api/typescript/src/agent/services/AgentRunner/CodexAgentRunner/buildArgs.posture.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { CodexAgentRunner } from './CodexAgentRunner'

/**
 * AC-8 (participant-permission-posture) — `codex`'s argv per posture: AUTO → no permission flag at all
 * (today's behaviour), BYPASS → `--dangerously-bypass-approvals-and-sandbox`, on BOTH shapes (`exec` and
 * `exec resume` publish it: `help-exec.txt:61`, `help-exec-resume.txt:44`). FALSIFIER: drop the table
 * lookup and the BYPASS cases go red; put the flag under AUTO and the AUTO case goes red.
 */
const BYPASS_FLAG = '--dangerously-bypass-approvals-and-sandbox'
const SESSION = '01a04541-3924-75f1-9f7e-221f3f57cee8'

function repoRoot(): string {
	let dir = import.meta.dir
	while (!existsSync(join(dir, '.specs'))) {
		const parent = dirname(dir)
		if (parent === dir) throw new Error('repo root (the directory holding .specs/) not found above this file')
		dir = parent
	}
	return dir
}
const help = (file: string) => readFileSync(join(repoRoot(), '.specs', 'codedm', 'codex-smoke', 'raw', file), 'utf8')

describe('CodexAgentRunner.buildArgs — the bypass flag is the posture', () => {
	it('AUTO passes no permission flag (unchanged behaviour)', () => {
		expect(CodexAgentRunner.buildArgs({ cwd: '/w', posture: PermissionPosture.AUTO })).not.toContain(BYPASS_FLAG)
		expect(CodexAgentRunner.buildArgs({ cwd: '/w', resumeSessionId: SESSION, posture: PermissionPosture.AUTO })).not.toContain(BYPASS_FLAG)
	})

	it('BYPASS passes the flag on the plain `exec` shape', () => {
		expect(CodexAgentRunner.buildArgs({ cwd: '/w', posture: PermissionPosture.BYPASS })).toContain(BYPASS_FLAG)
	})

	it('BYPASS passes the flag on the `exec resume` shape too — and the session id stays the trailing positional', () => {
		const args = CodexAgentRunner.buildArgs({ cwd: '/w', resumeSessionId: SESSION, posture: PermissionPosture.BYPASS })
		expect(args).toContain(BYPASS_FLAG)
		expect(args.at(-1)).toBe(SESSION)
	})

	it('both help captures publish the flag — the binary really has it', () => {
		expect(help('help-exec.txt')).toContain(BYPASS_FLAG)
		expect(help('help-exec-resume.txt')).toContain(BYPASS_FLAG)
	})
})
```

### Step T7.2 — Run tests to verify they fail

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test src/agent/services/AgentRunner/ClaudeAgentRunner/buildArgs.posture.test.ts src/agent/services/AgentRunner/CodexAgentRunner/buildArgs.posture.test.ts`
Expected: FAIL — `bypassPermissions` nunca aparece (Claude emite `auto` incondicional) e o flag do codex nunca aparece.

### Step T7.3 — Claude's table

Modify `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.ts`:
- adicione `PermissionPosture` ao import de `@codm/contracts-typescript/wire/enums`;
- logo após `CLAUDE_MODEL_ALIASES`, adicione

```typescript
/**
 * `PermissionPosture` → this CLI's permission flag (participant-permission-posture, Decision 8). A typed
 * table, total over the enum: a posture added to the contract fails compilation HERE until somebody
 * declares what it means for `claude` — never a branch on a posture's name. `auto` is the CLI's own
 * graduated mode (its classifier may block an action); `bypassPermissions` lifts the filter, and is only
 * ever reached when the turn was triggered by a participant the operator allowed to elevate.
 */
const CLAUDE_PERMISSION_ARGS: Record<PermissionPosture, readonly string[]> = {
	[PermissionPosture.AUTO]: ['--permission-mode', 'auto'],
	[PermissionPosture.BYPASS]: ['--permission-mode', 'bypassPermissions'],
}
```

- em `ClaudeBuildArgsOptions`, após `caps: ProviderCapabilities` (e seu comentário), adicione `/** Which permission regime this spawn runs under — looked up in `CLAUDE_PERMISSION_ARGS`. */` + `posture: PermissionPosture`;
- em `buildArgs`, o destructuring ganha `posture`, e as duas últimas linhas antes de `return args` (o comentário "Last, and unconditional…" e `args.push('--permission-mode', 'auto')`) viram

```typescript
		// Last: headless `-p` has no TTY to render a permission prompt on, so the mode is settled here at
		// spawn — by the POSTURE of whoever triggered the turn, through the table above.
		args.push(...CLAUDE_PERMISSION_ARGS[posture])
```

- no docblock de `buildArgs`, o bullet que começa em "`--permission-mode auto` deletes the trust-prompt keystroke injection" ganha, ao final, a frase "Which mode is no longer a constant: it is `CLAUDE_PERMISSION_ARGS[posture]`, and `auto` is what every turn not triggered by an elevating participant still gets.";
- em `run()`, no objeto passado a `ClaudeAgentRunner.buildArgs({...})`, após `caps: request.caps ?? {},` adicione `posture: request.posture,`.

### Step T7.4 — Codex's table

Modify `packages/api/typescript/src/agent/services/AgentRunner/CodexAgentRunner/CodexAgentRunner.ts`:
- adicione `PermissionPosture` ao import de `@codm/contracts-typescript/wire/enums`;
- logo após `CODEX_MODEL_ALIASES`, adicione

```typescript
/**
 * `PermissionPosture` → this CLI's permission flag (participant-permission-posture, Decision 8). AUTO is
 * NO flag — codex's own defaults, exactly what every run passed before postures existed. BYPASS is the
 * binary's full bypass, which BOTH shapes publish (`help-exec.txt:61`, `help-exec-resume.txt:44`), so it
 * lives outside the resume guard like `-m` does.
 */
const CODEX_PERMISSION_ARGS: Record<PermissionPosture, readonly string[]> = {
	[PermissionPosture.AUTO]: [],
	[PermissionPosture.BYPASS]: ['--dangerously-bypass-approvals-and-sandbox'],
}
```

- em `CodexBuildArgsOptions`, adicione `/** Which permission regime this spawn runs under — looked up in `CODEX_PERMISSION_ARGS`. */` + `posture: PermissionPosture`;
- em `buildArgs`, o destructuring ganha `posture`; logo após `if (mcp) args.push(...renderMcpOverrides(mcp))` e ANTES de `if (resumeSessionId) args.push(resumeSessionId)`, adicione `args.push(...CODEX_PERMISSION_ARGS[posture])`;
- em `run()`, no objeto passado a `CodexAgentRunner.buildArgs({...})`, após `outputSchemaPath: schema?.path,` adicione `posture: request.posture,`.

### Step T7.5 — Existing argv tests state their posture

Modify `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/buildArgs.test.ts`: em `opts()`, após `caps: {},` adicione `posture: PermissionPosture.AUTO,` (+ import de `PermissionPosture`) — a linha de base continua terminando em `'--permission-mode', 'auto'`.

Modify `packages/api/typescript/src/agent/services/AgentRunner/CodexAgentRunner/CodexAgentRunner.test.ts`: os dois `const base = {…}` e os `buildArgs({ cwd: '/w', … })` avulsos ganham `posture: PermissionPosture.AUTO` (+ import) — `bun x tsc` aponta cada um.

### Step T7.6 — Run tests to verify they pass

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test src/agent/services/AgentRunner/ && bun x tsc -p tsconfig.build.json --noEmit`
Expected: PASS — os casos novos e os golden de argv existentes.

### Step T7.7 — Commit

```bash
git add packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.ts \
        packages/api/typescript/src/agent/services/AgentRunner/CodexAgentRunner/CodexAgentRunner.ts \
        packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/buildArgs.test.ts \
        packages/api/typescript/src/agent/services/AgentRunner/CodexAgentRunner/CodexAgentRunner.test.ts \
        packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/buildArgs.posture.test.ts \
        packages/api/typescript/src/agent/services/AgentRunner/CodexAgentRunner/buildArgs.posture.test.ts
git commit -m "feat(agent): PPP — tabela PermissionPosture→argv no claude e no codex (Task T7)"
```

---

## Task T8: Todo item enfileirado carrega a postura de quem disparou o trabalho

**Files to write:**
- Modify: `packages/api/typescript/src/agent/repositories/MailboxRepository/MailboxRepository.ts` — `EnqueueMailboxItem.posture` obrigatório
- Modify: `packages/api/typescript/src/agent/repositories/MailboxRepository/LibSqlMailboxRepository.ts` — grava a coluna
- Modify: `packages/api/typescript/src/agent/repositories/MailboxRepository/MockMailboxRepository.ts` — devolve a postura gravada
- Modify: `packages/api/typescript/src/thread/entities/Thread.ts` — `Thread.postureOf(participantId)`
- Modify: `packages/api/typescript/src/thread/usecases/IngestChannelMessage.ts` — postura do remetente
- Modify: `packages/api/typescript/src/thread/usecases/SteerThread.ts` — sussurro = postura do operador; loop = AUTO
- Modify: `packages/api/typescript/src/agent/usecases/RunIssueTurn.ts` — `ISSUE_RESULT` = AUTO
- Modify: `packages/api/typescript/src/agent/usecases/ForkIssue.ts` — `posture` no input → item `WORK`
- Modify: `packages/api/typescript/src/agent/controllers/ForkIssue.ts` — repassa `identity.posture`
- Modify: `packages/api/typescript/src/agent/usecases/SteerIssueTurn.ts` — `posture` no input → item `STEER`
- Modify: `packages/api/typescript/src/agent/controllers/SteerIssueTurn.ts` — repassa `identity.posture`
- Modify: `packages/api/typescript/src/thread/handlers/ResumeIssueOnStopResolved.ts` — retomada = AUTO (T9 a eleva)
- Modify: `packages/api/typescript/src/agent/repositories/MailboxRepository/MailboxRepository.test.ts` — `enqueue` de teste ganha `posture`
- Modify: `packages/api/typescript/src/agent/services/MailboxDispatcher/LibSqlMailboxDispatcher.test.ts` — idem
- Modify: `packages/api/typescript/src/agent/usecases/ReconcileStalledIssues.test.ts` — idem
- Modify: `packages/api/typescript/tests/flows/issue-result.flow.test.ts` — idem
- Modify: `packages/api/typescript/tests/flows/issue-resume.flow.test.ts` — `agentIdentity` de teste ganha `posture`
- Modify: `packages/api/typescript/tests/flows/steer.flow.test.ts` — idem
- Test: `packages/api/typescript/tests/flows/permission-posture.flow.test.ts`

**Files to read:**
- `packages/api/typescript/tests/flows/issue-resume.flow.test.ts` (molde do `claimAll` e da chamada direta a `SteerIssueTurnController.handle`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** opus
**Skills:** /usecase, /controller, /handler, /entity, /repository, /test
**Depends on:** T3, T6
**Consumes (frozen):** `Participant.canElevate` (T3); `ClaimedMailboxItem.posture` e o claim `ctx.agentIdentity.posture` de `AgentRunIdentityCtxSchema` (T6); `PermissionPosture` (T1); `OPERATOR_PARTICIPANT_ID` (`'operator'`).
**Scope fence:** DONE — a leitura da postura do item até o runner (T6). LEFT — o campo obrigatório no `enqueue` e os SETE produtores: `IngestChannelMessage`, `SteerThread` (dois pontos), `RunIssueTurn.enqueueResult`, `ForkIssue`, `SteerIssueTurn`, `ResumeIssueOnStopResolved`. OUT — a postura da retomada vinda do evento de resolução (T9 — aqui ela fica AUTO, que é exatamente o comportamento pré-feature); a falseabilidade do "argumento de tool" (T13). `ForkIssue`/`SteerIssueTurn` leem postura SÓ de `ctx.agentIdentity` — nunca de `body`.
**Gate:** `cd packages/api/typescript && bun test src/agent/ src/thread/ tests/flows/ && bun x tsc -p tsconfig.build.json --noEmit`

### Step T8.1 — Write the failing flow test

Create `packages/api/typescript/tests/flows/permission-posture.flow.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import type { ZodType } from 'zod'
import { TestBed, GIVEN_MENTION_TAG, givenIssue, givenThread, givenWorkspace } from '@test/support'
import { MailboxItemKind, MailboxTargetKind, PermissionPosture, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ForkIssueController } from '@agent/controllers/ForkIssue'
import { SteerIssueTurnController } from '@agent/controllers/SteerIssueTurn'
import { MailboxRepository, type ClaimedMailboxItem } from '@agent/repositories/MailboxRepository'
import { RunIssueTurn } from '@agent/usecases/RunIssueTurn'
import { AgentRunner } from '@agent/services/AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '@agent/services/AgentRunnerFactory'
import { AgentRunOutcome } from '@agent/enums'
import type { AgentRunRequest } from '@agent/types/AgentRunRequest'
import type { AgentRuntimeEvent } from '@agent/types/AgentRuntimeEvent'
import { IngestChannelMessage } from '@thread/usecases/IngestChannelMessage'
import { SteerThread } from '@thread/usecases/SteerThread'
import { SetParticipantElevation } from '@thread/usecases/ConfigureThreadSettings'

class CompletingRunner extends AgentRunner {
	async *run<OutputSchema extends ZodType | undefined = undefined>(_request: AgentRunRequest<OutputSchema>): AsyncIterable<AgentRuntimeEvent> {
		yield { type: 'finished', result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'feito', sessionId: 's', failed: false } }
	}
	async shutdown(): Promise<void> {}
}

const MEMBER = '5511900000031@s.whatsapp.net'

/**
 * AC-4 / AC-5 / AC-6 (participant-permission-posture, Decision 4) — every item carries the posture of
 * WHO triggered it: a message typed in the channel by its sender's `canElevate`; a console whisper by
 * the `operator`'s; a loop tick and an `ISSUE_RESULT` always AUTO; work queued from INSIDE a turn by
 * the posture the run token was minted with.
 */
describe('Flow (integration): the posture is stamped by whoever triggered the work', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const claimAll = async (): Promise<ClaimedMailboxItem[]> => {
		const mailbox = testBed.resolve(MailboxRepository)
		const claimed: ClaimedMailboxItem[] = []
		for (;;) {
			const item = await mailbox.claimNext('posture-test', 60_000)
			if (!item) return claimed
			claimed.push(item)
			await mailbox.complete(item.id)
		}
	}

	const roomThread = async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		return givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
			participants: [
				{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true, canElevate: true },
				{ participantId: MEMBER, name: 'Ada', source: 'Channel group member', canInvoke: true, canElevate: false },
			],
		})
	}

	const ingest = (threadId: string, senderExternalId: string) =>
		testBed.resolve(IngestChannelMessage).execute({
			threadId,
			senderExternalId,
			text: `${GIVEN_MENTION_TAG} troca a moeda da Loja 01`,
			receivedAt: new Date(),
		})

	it('AC-4 — a message from a participant WITH canElevate queues BYPASS; one WITHOUT queues AUTO', async () => {
		const thread = await roomThread()

		await ingest(thread.id.value, 'operator')
		await ingest(thread.id.value, MEMBER)

		const postures = (await claimAll()).map(item => item.posture)
		expect(postures).toEqual([PermissionPosture.BYPASS, PermissionPosture.AUTO])
	})

	it('AC-4/AC-5 — a console whisper follows the operator`s canElevate; a loop tick is always AUTO', async () => {
		const thread = await roomThread()

		await testBed.resolve(SteerThread).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, text: 'pode seguir' })
		await testBed
			.resolve(SteerThread)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, text: 'bom dia', firedByLoop: 'seg 09:00' })

		expect((await claimAll()).map(item => item.posture)).toEqual([PermissionPosture.BYPASS, PermissionPosture.AUTO])
	})

	it('AC-4 — after the operator withdraws their own elevation, their whisper queues AUTO', async () => {
		const thread = await roomThread()
		await testBed
			.resolve(SetParticipantElevation)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, participantId: 'operator', canElevate: false })

		await testBed.resolve(SteerThread).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, text: 'pode seguir' })

		expect((await claimAll()).map(item => item.posture)).toEqual([PermissionPosture.AUTO])
	})

	it('AC-5 — SteerThread`s STEER items to open issues carry the operator`s posture too', async () => {
		const thread = await roomThread()
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'moeda' })

		await testBed.resolve(SteerThread).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, text: 'usa BRL' })

		const steer = (await claimAll()).find(item => item.targetKind === MailboxTargetKind.ISSUE && item.targetId === issue.id.value)
		expect(steer?.kind).toBe(MailboxItemKind.STEER)
		expect(steer?.posture).toBe(PermissionPosture.BYPASS)
	})

	it('AC-6 — ForkIssue stamps the WORK item with the run token`s posture', async () => {
		const thread = await roomThread()

		for (const posture of [PermissionPosture.BYPASS, PermissionPosture.AUTO]) {
			await testBed.resolve(ForkIssueController).handle({
				ctx: {
					ownerId: MOCK_CLOUD_OWNER_ID,
					agentIdentity: { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, entryId: uuidv7(), scope: 'orchestration', posture },
				},
				params: { threadId: thread.id.value },
				body: { goal: `troca a moeda (${posture})` },
			} as Parameters<ForkIssueController['handle']>[0])
		}

		const work = (await claimAll()).filter(item => item.kind === MailboxItemKind.WORK)
		expect(work.map(item => item.posture)).toEqual([PermissionPosture.BYPASS, PermissionPosture.AUTO])
	})

	it('AC-6 — SteerIssueTurn stamps the STEER item with the run token`s posture', async () => {
		const thread = await roomThread()
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'moeda' })

		await testBed.resolve(SteerIssueTurnController).handle({
			ctx: {
				ownerId: MOCK_CLOUD_OWNER_ID,
				agentIdentity: {
					ownerId: MOCK_CLOUD_OWNER_ID,
					threadId: thread.id.value,
					entryId: uuidv7(),
					scope: 'orchestration',
					posture: PermissionPosture.BYPASS,
				},
			},
			params: { threadId: thread.id.value, issueId: issue.id.value },
			body: { text: 'usa BRL' },
		} as Parameters<SteerIssueTurnController['handle']>[0])

		const steer = (await claimAll()).find(item => item.targetId === issue.id.value)
		expect(steer?.posture).toBe(PermissionPosture.BYPASS)
	})

	it('AC-4 — the ISSUE_RESULT a BYPASS issue turn queues back to the orchestrator is AUTO', async () => {
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(new CompletingRunner()))
		const thread = await roomThread()

		await testBed.resolve(RunIssueTurn).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			issueId: uuidv7(),
			threadId: thread.id.value,
			key: 'moeda',
			title: 'Troca a moeda',
			provider: ProviderKind.CLAUDE_CODE,
			workspacePath: '/tmp/workspace',
			prompt: 'troca a moeda',
			turnKind: MailboxItemKind.WORK,
			messageId: uuidv7(),
			posture: PermissionPosture.BYPASS,
		})

		const result = (await claimAll()).find(item => item.kind === MailboxItemKind.ISSUE_RESULT)
		expect(result?.posture).toBe(PermissionPosture.AUTO)
	})
})
```

### Step T8.2 — Run it to verify it fails

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test tests/flows/permission-posture.flow.test.ts`
Expected: FAIL — todo item volta `AUTO` (o DEFAULT da coluna), então os casos BYPASS ficam vermelhos.

### Step T8.3 — The queue requires it

Modify `packages/api/typescript/src/agent/repositories/MailboxRepository/MailboxRepository.ts`: em `EnqueueMailboxItem`, após `payload: unknown`, adicione

```typescript
	/**
	 * The posture the scheduled turn runs under — REQUIRED, so no producer can forget to say who
	 * triggered the work (participant-permission-posture, Decision 4). Derived by the producer from the
	 * trigger: a sender's `canElevate`, the `operator`'s for a console whisper, the run token's claim for
	 * work queued from inside a turn, AUTO for a loop tick or an `ISSUE_RESULT`.
	 */
	posture: PermissionPosture
```

Modify `packages/api/typescript/src/agent/repositories/MailboxRepository/LibSqlMailboxRepository.ts`: em `enqueue`, no `.values({...})`, após `payload: item.payload,` adicione `posture: item.posture,`.

Modify `packages/api/typescript/src/agent/repositories/MailboxRepository/MockMailboxRepository.ts`: em `claimNext`, troque `posture: PermissionPosture.AUTO,` (e o comentário acima) por `posture: row.posture,`, e remova o import de `PermissionPosture` se ficar sem uso.

### Step T8.4 — The aggregate answers "what posture does this person grant"

Modify `packages/api/typescript/src/thread/entities/Thread.ts`:
- adicione `PermissionPosture` à lista importada de `@codm/contracts-typescript/wire/enums`;
- logo após o método `setParticipantElevation`, adicione

```typescript
	/**
	 * The posture a turn TRIGGERED by this participant runs under (participant-permission-posture,
	 * Decision 4). The roster is the only authority: BYPASS exactly when the participant is on it AND was
	 * granted `canElevate`; anyone else — including a sender the roster never recorded — is AUTO.
	 *
	 * The owner arrives here as `OPERATOR_PARTICIPANT_ID`, never as their phone-number JID:
	 * `ConsumeInboundMessage` maps `fromMe` to the sentinel before ingest, and the console whisper names
	 * the sentinel directly — so the owner's own JID sitting in a group roster without the grant never
	 * decides the operator's posture.
	 */
	postureOf(participantId: string): PermissionPosture {
		const participant = this.participants.find(p => p.participantId === participantId)
		return participant?.canElevate ? PermissionPosture.BYPASS : PermissionPosture.AUTO
	}
```

### Step T8.5 — The producers

Modify `packages/api/typescript/src/thread/usecases/IngestChannelMessage.ts`: no `this.mailbox.enqueue({...})`, após `kind: MailboxItemKind.OPERATOR_MESSAGE,` (o do item, não o do payload), adicione

```typescript
						// WHO SENT IT decides how far the turn may go (Decision 4): the sender's `canElevate`.
						posture: thread.postureOf(input.senderExternalId),
```

Modify `packages/api/typescript/src/thread/usecases/SteerThread.ts`:
- adicione `PermissionPosture` ao import de `@codm/contracts-typescript/wire/enums`;
- logo antes de `return this.withTransaction(tx, async tx => {`, adicione

```typescript
		// WHO TRIGGERED IT (Decision 4): a console whisper is the authenticated owner, so it carries the
		// `operator` participant's grant; a loop tick is a timer, and a timer is never elevated.
		const posture = input.firedByLoop ? PermissionPosture.AUTO : thread.postureOf(OPERATOR_PARTICIPANT_ID)
```

- nos DOIS `this.mailbox.enqueue({...})` (o `STEER` por issue e o `OPERATOR_MESSAGE` sem issue aberta), após a linha `kind: MailboxItemKind.…,` do item, adicione `posture,`.

Modify `packages/api/typescript/src/agent/usecases/RunIssueTurn.ts`: em `enqueueResult`, no `this.mailbox.enqueue({...})`, após `kind: MailboxItemKind.ISSUE_RESULT,` (o do item) adicione

```typescript
				// AUTO, always (Decision 4): the orchestrator turn this schedules REPORTS a result — nobody
				// triggered it, so nobody's grant applies, whatever posture the issue turn itself ran under.
				posture: PermissionPosture.AUTO,
```

Modify `packages/api/typescript/src/agent/usecases/ForkIssue.ts`:
- adicione `PermissionPosture` ao import de enums;
- em `ForkIssueInputSchema`, após `originEntryId: z.uuid(),` (e seu docblock), adicione

```typescript
	/**
	 * The posture of the run that forked it — `ctx.agentIdentity.posture`, INJECTED from the run token
	 * like `originEntryId`, never an argument the model supplies (Decision 6). The issue's first turn
	 * runs under it.
	 */
	posture: z.enum(PermissionPosture),
```

- no `this.mailbox.enqueue({...})`, após `kind: MailboxItemKind.WORK,` adicione `posture: input.posture,`.

Modify `packages/api/typescript/src/agent/controllers/ForkIssue.ts`: em `handle`, no objeto passado a `this.useCase.execute({...})`, após `originEntryId: identity.entryId,` adicione

```typescript
			// From the run token, never from `body` — the body is `{ goal }` and nothing else (Decision 6).
			posture: identity.posture,
```

Modify `packages/api/typescript/src/agent/usecases/SteerIssueTurn.ts`:
- adicione `PermissionPosture` ao import de enums;
- em `SteerIssueTurnInputSchema`, após `entryId: z.uuid().optional(),`, adicione `/** The steering run's posture — `ctx.agentIdentity.posture`, never a tool argument (Decision 6). */` + `posture: z.enum(PermissionPosture),`;
- no `this.mailbox.enqueue({...})`, após `kind: MailboxItemKind.STEER,` adicione `posture: input.posture,`.

Modify `packages/api/typescript/src/agent/controllers/SteerIssueTurn.ts`: em `handle`, no objeto passado a `this.steerIssueTurn.execute({...})`, após `entryId: identity.entryId,` adicione `posture: identity.posture,` com o comentário `// From the run token, never from `body` (Decision 6).`.

Modify `packages/api/typescript/src/thread/handlers/ResumeIssueOnStopResolved.ts`:
- adicione `PermissionPosture` ao import de enums;
- no `this.mailbox.enqueue({...})`, após `kind: MailboxItemKind.STEER,` adicione `posture: PermissionPosture.AUTO,` com o comentário `// The resume's own posture (who resolved, and how) is carried by the resolution fact — until it does, a resume runs as it always has: AUTO.`

### Step T8.6 — The test sweep

Rode `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`; todo `mailbox.enqueue({…})` de teste (em **Files to write**) ganha `posture: PermissionPosture.AUTO`, e todo `agentIdentity` montado à mão em teste (`issue-resume.flow.test.ts`, `steer.flow.test.ts`) ganha `posture: PermissionPosture.AUTO`.

### Step T8.7 — Run tests to verify they pass

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test src/agent/ src/thread/ tests/flows/ && bun x tsc -p tsconfig.build.json --noEmit`
Expected: PASS — os 7 casos do fluxo novo e todas as suítes existentes.

### Step T8.8 — Commit

```bash
git add packages/api/typescript/src/agent/repositories/MailboxRepository/MailboxRepository.ts \
        packages/api/typescript/src/agent/repositories/MailboxRepository/LibSqlMailboxRepository.ts \
        packages/api/typescript/src/agent/repositories/MailboxRepository/MockMailboxRepository.ts \
        packages/api/typescript/src/thread/entities/Thread.ts \
        packages/api/typescript/src/thread/usecases/IngestChannelMessage.ts \
        packages/api/typescript/src/thread/usecases/SteerThread.ts \
        packages/api/typescript/src/agent/usecases/RunIssueTurn.ts \
        packages/api/typescript/src/agent/usecases/ForkIssue.ts \
        packages/api/typescript/src/agent/controllers/ForkIssue.ts \
        packages/api/typescript/src/agent/usecases/SteerIssueTurn.ts \
        packages/api/typescript/src/agent/controllers/SteerIssueTurn.ts \
        packages/api/typescript/src/thread/handlers/ResumeIssueOnStopResolved.ts \
        packages/api/typescript/src/agent/repositories/MailboxRepository/MailboxRepository.test.ts \
        packages/api/typescript/src/agent/services/MailboxDispatcher/LibSqlMailboxDispatcher.test.ts \
        packages/api/typescript/src/agent/usecases/ReconcileStalledIssues.test.ts \
        packages/api/typescript/tests/flows/issue-result.flow.test.ts \
        packages/api/typescript/tests/flows/issue-resume.flow.test.ts \
        packages/api/typescript/tests/flows/steer.flow.test.ts \
        packages/api/typescript/tests/flows/permission-posture.flow.test.ts
git commit -m "feat(agent): PPP — todo produtor do mailbox carimba a postura de quem disparou (Task T8)"
```

---

## Task T9: APPROVE de quem pode liberar faz a retomada subir em bypass

**Files to write:**
- Modify: `packages/api/typescript/src/thread/utils/StopResolutions.ts` — `RESUMES_WITH_RESOLVER_POSTURE`
- Modify: `packages/api/typescript/src/thread/events/ThreadStopResolvedEvent.ts` — o evento carrega `posture`
- Modify: `packages/api/typescript/src/thread/entities/Thread.ts` — `resolveStop(stop, resolution, resolverPosture)`
- Modify: `packages/api/typescript/src/thread/usecases/ResolveStop.ts` — `runPosture`; console resolve como `operator`
- Modify: `packages/api/typescript/src/thread/controllers/ResolveStop.ts` — repassa `ctx.agentIdentity?.posture`
- Modify: `packages/api/typescript/src/thread/handlers/ResumeIssueOnStopResolved.ts` — a retomada carrega a postura do evento
- Modify: `packages/api/typescript/src/thread/entities/Thread.test.ts` — chamadas a `resolveStop` ganham a postura
- Modify: `packages/api/typescript/tests/flows/issue-resume.flow.test.ts` — o `ThreadStopResolvedEvent` montado à mão ganha `posture`
- Test: `packages/api/typescript/tests/flows/approve-elevates.flow.test.ts`

**Files to read:**
- `packages/api/typescript/src/thread/controllers/ResolveStop.test.ts` (middleware + controller compostos à mão, mesma instância de `InMemoryAgentIdentityService`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /event, /usecase, /controller, /handler, /test
**Depends on:** T8
**Consumes (frozen):** `Thread.postureOf(participantId)` e `EnqueueMailboxItem.posture` (T8); claim `ctx.agentIdentity.posture` (T6); `StopKind.PERMISSION_DENIED` admitindo `APPROVE`/`DENY` (T1).
**Scope fence:** DONE — produtores e claim. LEFT — a regra "a retomada carrega a postura de quem resolveu; DENY sempre AUTO" (dado declarado), o evento com `posture`, e o repasse no handler. OUT — o `hasPending` NÃO muda (quando já há item pendente, vale a postura dele — Decision 7); paradas de thread sem issue continuam sem retomada (`ResumeIssueOnStopResolved` já as ignora); o evento de INTEGRAÇÃO `integration.thread.stop_resolved` NÃO ganha campo (a ponte copia campo a campo).
**Gate:** `cd packages/api/typescript && bun test src/thread/ tests/flows/ && bun x tsc -p tsconfig.build.json --noEmit && cd ../../.. && env -u NODE_ENV bun emit-openapi && git diff --exit-code packages/api/typescript/public/docs/openapi.json`

### Step T9.1 — Write the failing flow test

Create `packages/api/typescript/tests/flows/approve-elevates.flow.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { TestBed, givenIssue, givenStop, givenThread, givenWorkspace } from '@test/support'
import {
	AGENT_RUN_TOKEN_HEADER,
	AgentIdentityMiddleware,
	DomainEventRepository,
	InMemoryAgentIdentityService,
	OutboxDispatcher,
	type HttpControllerRequest,
} from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind, McpScope, PermissionPosture, ProviderKind, StopKind, StopResolution } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository, type ClaimedMailboxItem } from '@agent/repositories/MailboxRepository'
import { ResumeIssueOnStopResolved } from '@thread/handlers/ResumeIssueOnStopResolved'
import { ThreadStopResolvedEvent } from '@thread/events/ThreadStopResolvedEvent'
import { ResolveStopController } from '@thread/controllers/ResolveStop'
import { ResolveStop } from '@thread/usecases/ResolveStop'

/**
 * AC-7 (participant-permission-posture, Decision 7) — "APPROVE" has to mean the resumed turn may do
 * what was blocked. The resume carries the posture of WHO resolved: the console (the authenticated
 * owner, resolving as the `operator` participant) grants the operator's `canElevate`; an orchestrator
 * run grants the posture its token was minted with. The fact carries it, so the handler that queues
 * the resume never has to recompute it.
 */
describe('Flow (integration): an APPROVE from someone who may elevate resumes in BYPASS', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		await testBed.reset()
		await testBed.spy.register(testBed.resolve(ResumeIssueOnStopResolved))
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const givenStoppedIssue = async (kind: StopKind = StopKind.APPROVAL_NEEDED) => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value, providers: [ProviderKind.CLAUDE_CODE] })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'moeda' })
		const stop = await givenStop(testBed, { threadId: thread.id.value, issueId: issue.id.value, kind, detail: 'Posso gravar em produção?' })
		return { thread, issue, stop }
	}

	const resumeOf = async (issueId: string): Promise<ClaimedMailboxItem | undefined> => {
		await testBed.resolve(OutboxDispatcher).flush()
		const mailbox = testBed.resolve(MailboxRepository)
		for (;;) {
			const item = await mailbox.claimNext('approve-test', 60_000)
			if (!item) return undefined
			await mailbox.complete(item.id)
			if (item.targetKind === MailboxTargetKind.ISSUE && item.targetId === issueId) return item
		}
	}

	const viaRun = async (threadId: string, stopId: string, resolution: StopResolution, posture: PermissionPosture) => {
		const identities = new InMemoryAgentIdentityService()
		const token = identities.issue({
			scope: McpScope.orchestration,
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId,
			entryId: uuidv7(),
			posture,
			expiresAt: new Date(Date.now() + 60_000),
		})
		const request = {
			headers: { [AGENT_RUN_TOKEN_HEADER]: token },
			params: { stopId },
			body: { resolution },
			ctx: { ownerId: MOCK_CLOUD_OWNER_ID },
		} as unknown as HttpControllerRequest<unknown>
		await new AgentIdentityMiddleware(identities).execute(request)
		await testBed.resolve(ResolveStopController).execute(request)
	}

	it('AC-7 — APPROVE from the CONSOLE, with the operator allowed to elevate, resumes BYPASS', async () => {
		const { issue, stop } = await givenStoppedIssue()

		await testBed.resolve(ResolveStop).execute({ ownerId: MOCK_CLOUD_OWNER_ID, stopId: stop.stopId, resolution: StopResolution.APPROVE })

		expect((await resumeOf(issue.id.value))?.posture).toBe(PermissionPosture.BYPASS)
	})

	it('AC-7 — the same holds for a PERMISSION_DENIED stop', async () => {
		const { issue, stop } = await givenStoppedIssue(StopKind.PERMISSION_DENIED)

		await testBed.resolve(ResolveStop).execute({ ownerId: MOCK_CLOUD_OWNER_ID, stopId: stop.stopId, resolution: StopResolution.APPROVE })

		expect((await resumeOf(issue.id.value))?.posture).toBe(PermissionPosture.BYPASS)
	})

	it('AC-7 — APPROVE from a BYPASS orchestrator run (via MCP) resumes BYPASS', async () => {
		const { thread, issue, stop } = await givenStoppedIssue()

		await viaRun(thread.id.value, stop.stopId, StopResolution.APPROVE, PermissionPosture.BYPASS)

		expect((await resumeOf(issue.id.value))?.posture).toBe(PermissionPosture.BYPASS)
	})

	it('AC-7 — ThreadStopResolvedEvent carries the resolved posture', async () => {
		const { stop } = await givenStoppedIssue()

		await testBed.resolve(ResolveStop).execute({ ownerId: MOCK_CLOUD_OWNER_ID, stopId: stop.stopId, resolution: StopResolution.APPROVE })

		const [fact] = await testBed.resolve(DomainEventRepository).findByType(ThreadStopResolvedEvent)
		expect(fact?.payload.posture).toBe(PermissionPosture.BYPASS)
	})

	it('Decision 7 — when an item is already pending for the issue, the pending item`s posture is what runs', async () => {
		const { thread, issue, stop } = await givenStoppedIssue()
		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issue.id.value,
			kind: MailboxItemKind.STEER,
			payload: { issueId: issue.id.value, threadId: thread.id.value, key: 'moeda', title: 'moeda', text: 'pode gravar' },
			posture: PermissionPosture.BYPASS,
			dedupKey: `steer:${uuidv7()}`,
		})

		await testBed.resolve(ResolveStop).execute({ ownerId: MOCK_CLOUD_OWNER_ID, stopId: stop.stopId, resolution: StopResolution.DENY })

		const pending = await resumeOf(issue.id.value)
		expect(pending?.posture).toBe(PermissionPosture.BYPASS)
		// …and the DENY scheduled nothing of its own (`hasPending` rode the pending steer).
		expect(await resumeOf(issue.id.value)).toBeUndefined()
	})
})
```

### Step T9.2 — Run it to verify it fails

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test tests/flows/approve-elevates.flow.test.ts`
Expected: FAIL — a retomada volta `AUTO` e `fact.payload.posture` é `undefined`.

### Step T9.3 — The rule, as data

Modify `packages/api/typescript/src/thread/utils/StopResolutions.ts`: ao final do arquivo, adicione

```typescript
/**
 * Whether the resume a resolution schedules runs with the RESOLVER's posture, or always in AUTO
 * (participant-permission-posture, Decision 7). A table, total over `StopResolution`, so a resolution
 * added to the contract fails compilation here until somebody decides whether it may elevate.
 *
 * DENY never elevates: "no" must not be the answer that lifts the filter. TAKE_OVER schedules no resume
 * at all (`ResumeIssueOnStopResolved` returns first), so its value is the safe one rather than a
 * meaningful one.
 */
export const RESUMES_WITH_RESOLVER_POSTURE: Record<StopResolution, boolean> = {
	[StopResolution.RETRY]: true,
	[StopResolution.REVIEW_AND_SEND]: true,
	[StopResolution.APPROVE]: true,
	[StopResolution.DENY]: false,
	[StopResolution.TAKE_OVER]: false,
}
```

### Step T9.4 — The fact carries it

Modify `packages/api/typescript/src/thread/events/ThreadStopResolvedEvent.ts` — complete final file:

```typescript
import { BaseDomainEvent, z } from '@codm/core-typescript'
import { PermissionPosture, StopResolution } from '@codm/contracts-typescript/wire/enums'

/**
 * A stop was resolved by the operator. Raised by `Thread.resolveStop` and bridged to
 * `integration.thread.stop_resolved` by `PublishThreadIntegrationEvents` (TAKE_OVER additionally pauses
 * the thread).
 *
 * Renamed and relocated from `issue/events/IssueStopResolvedEvent` in B4: events live in the context
 * that owns the aggregate raising them, and since spec decision 4 the Stop is a child of `Thread`.
 *
 * `issueId` is OPTIONAL, mirroring the column: a thread-level stop (the orchestrator's needs-approval,
 * before any issue exists) has none. `threadId` is always present — it is the aggregate's id.
 *
 * `posture` (participant-permission-posture, Decision 7) is the posture the RESUME runs under — already
 * resolved by the aggregate (the resolver's posture, or AUTO for a DENY), so the handler that queues
 * the resume copies it rather than recomputing who resolved. It is NOT bridged to the integration event:
 * nobody outside this process schedules turns. A fact persisted before this field existed arrives
 * without it, and the mailbox column's `DEFAULT 'AUTO'` is what that resume runs under.
 */
export const ThreadStopResolvedEventSchema = z.domainEvent({
	stopId: z.string(),
	issueId: z.string().optional(),
	threadId: z.string(),
	resolution: z.enum(StopResolution),
	posture: z.enum(PermissionPosture),
})
export class ThreadStopResolvedEvent extends BaseDomainEvent<typeof ThreadStopResolvedEventSchema> {
	static override readonly name = 'thread.stop_resolved' as const
	static readonly schema = ThreadStopResolvedEventSchema
}
```

### Step T9.5 — The aggregate decides it

Modify `packages/api/typescript/src/thread/entities/Thread.ts`:
- troque `import { isResolutionApplicable } from '../utils/StopResolutions'` por `import { isResolutionApplicable, RESUMES_WITH_RESOLVER_POSTURE } from '../utils/StopResolutions'`;
- a assinatura de `resolveStop` vira `resolveStop(stop: Stop, resolution: StopResolution, resolverPosture: PermissionPosture): void`, e o `payload` do `new ThreadStopResolvedEvent({...})` vira

```typescript
				payload: {
					stopId: stop.stopId,
					issueId: stop.issueId,
					threadId: this.id.value,
					resolution,
					// How far the resume may go (Decision 7): the resolver's posture when the resolution is one
					// that resumes with it, AUTO otherwise — DENY never lifts the filter.
					posture: RESUMES_WITH_RESOLVER_POSTURE[resolution] ? resolverPosture : PermissionPosture.AUTO,
				},
```

- no docblock de `resolveStop`, acrescente o parágrafo: "`resolverPosture` is WHO resolved — a run's minted posture, or the `operator` participant's grant for the console — and the fact carries the posture the resume will run under, already reduced by `RESUMES_WITH_RESOLVER_POSTURE`."

Modify `packages/api/typescript/src/thread/entities/Thread.test.ts`: toda chamada `t.resolveStop(stop, resolution)` ganha o terceiro argumento `PermissionPosture.AUTO` (+ import) — `bun x tsc` aponta cada uma.

### Step T9.6 — The use case and the door

Modify `packages/api/typescript/src/thread/usecases/ResolveStop.ts`:
- troque o import de enums para `import { PermissionPosture, StopResolution } from '@codm/contracts-typescript/wire/enums'` e adicione `import { OPERATOR_PARTICIPANT_ID } from '../entities/Thread'`;
- em `ResolveStopInputSchema`, após `runThreadId: z.uuid().optional(),`, adicione

```typescript
	/**
	 * The posture of the run resolving it — `ctx.agentIdentity.posture`, present ⟺ the caller is an
	 * orchestration run (the same presence rule as `runThreadId`). Absent ⟺ the console, where the
	 * authenticated owner resolves as the `operator` participant of the thread (Decision 7).
	 */
	runPosture: z.enum(PermissionPosture).optional(),
```

- dentro de `handle`, logo antes de `await this.withTransaction(tx, async tx => {`, adicione

```typescript
		// WHO RESOLVED decides how far the resume may go (Decision 7): a run resolves with the posture it
		// was minted with; the console resolves as the `operator` participant of THIS thread.
		const resolverPosture = input.runPosture ?? thread.postureOf(OPERATOR_PARTICIPANT_ID)
```

- e a chamada vira `thread.resolveStop(stop, input.resolution, resolverPosture)`.

Modify `packages/api/typescript/src/thread/controllers/ResolveStop.ts`: no objeto passado a `this.useCase.execute({...})`, após `runThreadId: request.ctx.agentIdentity?.threadId,` adicione

```typescript
			// Same presence rule as `runThreadId`: the run's posture when a run resolves, absent for the
			// console — never anything from `body`, which is `{ resolution }` and nothing else.
			runPosture: request.ctx.agentIdentity?.posture,
```

### Step T9.7 — The resume copies the fact

Modify `packages/api/typescript/src/thread/handlers/ResumeIssueOnStopResolved.ts`:
- em `handle`, troque a desestruturação para `const { stopId, issueId, threadId, resolution, posture } = event.payload`;
- no `this.mailbox.enqueue({...})`, troque `posture: PermissionPosture.AUTO,` (e o comentário acima dele) por

```typescript
			// The posture the FACT carries (Decision 7): the resolver's, reduced by the resolution — an APPROVE
			// from someone who may elevate resumes in BYPASS, a DENY always in AUTO.
			posture,
```

- remova o import de `PermissionPosture` se ficar sem uso.

Modify `packages/api/typescript/tests/flows/issue-resume.flow.test.ts`: o `new ThreadStopResolvedEvent({...})` do caso "AC-6 — the same resolution delivered twice" ganha `posture: PermissionPosture.AUTO` no `payload`.

### Step T9.8 — Run tests to verify they pass

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test src/thread/ tests/flows/ && bun x tsc -p tsconfig.build.json --noEmit && cd ../../.. && env -u NODE_ENV bun emit-openapi && git diff --exit-code packages/api/typescript/public/docs/openapi.json`
Expected: PASS — os 5 casos novos; o `openapi.json` não muda (o controller só ganhou leitura de `ctx`, que não vai ao fio). Se mudar, rode `bun sdk` e inclua `packages/client/dist/` no commit.

### Step T9.9 — Commit

```bash
git add packages/api/typescript/src/thread/utils/StopResolutions.ts \
        packages/api/typescript/src/thread/events/ThreadStopResolvedEvent.ts \
        packages/api/typescript/src/thread/entities/Thread.ts \
        packages/api/typescript/src/thread/usecases/ResolveStop.ts \
        packages/api/typescript/src/thread/controllers/ResolveStop.ts \
        packages/api/typescript/src/thread/handlers/ResumeIssueOnStopResolved.ts \
        packages/api/typescript/src/thread/entities/Thread.test.ts \
        packages/api/typescript/tests/flows/issue-resume.flow.test.ts \
        packages/api/typescript/tests/flows/approve-elevates.flow.test.ts
git commit -m "feat(thread): PPP — APPROVE de quem pode liberar retoma em bypass; DENY sempre auto (Task T9)"
```

---

## Task T10: O runner reconhece a negação do filtro como PERMISSION_DENIED

**Files to write:**
- Modify: `packages/api/typescript/src/agent/services/StreamJsonCodec/FrameDecoder.ts` — `safetyStops` e `permissionDenials` no `TerminalResultRecord`
- Modify: `packages/api/typescript/src/agent/services/StreamJsonCodec/CodexFrameDecoder.ts` — codex declara "sem sinal" (0 / [])
- Modify: `packages/api/typescript/src/agent/services/StreamJsonCodec/index.ts` — exporta `PermissionDenial`
- Modify: `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.ts` — `classifyStop` devolve `PERMISSION_DENIED`
- Test: `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/permissionDenied.test.ts`

**Files to read:**
- `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/fixtures/auto-no-tool.result.json` — campos `safety_stops: 0`, `permission_denials: []`, `is_error: false`, `subtype: "success"`
- `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/fixtures/auto-classifier-block.result.json` — campos `safety_stops: 2`, `permission_denials: []`, `is_error: false`, `num_turns: 2`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** T7
**Consumes (frozen):** `StopKind.PERMISSION_DENIED` ∈ `TransportStopKind` (T1); os dois frames terminais medidos (Decision 10), JÁ commitados em `ClaudeAgentRunner/fixtures/` — não regrave nem edite.
**Scope fence:** DONE — `TerminalOutputAccumulator.outcome()` já repassa `result.stop.kind` como `STOPPED` (nenhuma mudança nele; o teste aqui só prova). LEFT — ler os dois campos do frame `result` e classificar. OUT — o que acontece DEPOIS do stop (registrar já vs re-tentar, T11); o codex não expõe sinal de negação no stream medido — fica `0`/`[]`, declarado, nunca inferido de texto.
**Gate:** `cd packages/api/typescript && bun test src/agent/services/ && bun x tsc -p tsconfig.build.json --noEmit`

### Step T10.1 — Write the failing test

Create `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/permissionDenied.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { InMemoryAgentIdentityService, MockLoggingService } from '@codm/core-typescript'
import { PermissionPosture, StopKind } from '@codm/contracts-typescript/wire/enums'
import { AgentMessageRole, AgentName } from '../../../enums'
import type { AgentRunResult, AgentRuntimeEvent } from '../../../types/AgentRuntimeEvent'
import { StreamJsonCodec } from '../../StreamJsonCodec'
import { TerminalOutputAccumulator } from '../../TerminalOutputAccumulator'
import type { AgentProcess, AgentProcessSpec } from './AgentProcess'
import { ClaudeAgentRunner } from './ClaudeAgentRunner'

/**
 * AC-9 (participant-permission-posture, Decisions 9 + 10) — a turn the permission filter blocked ends
 * `STOPPED(PERMISSION_DENIED)`. The two MEASURED terminal frames (claude 2.1.295, headless `auto`) are
 * the fixtures: the classifier's block shows up in `safety_stops`, NOT in `permission_denials` — so the
 * runner reads both, and a turn where the model refused on its own (no tool call) is NOT a stop.
 *
 * FALSIFIER: drop the `safetyStops > 0` half of the predicate and the classifier-block case goes red;
 * drop the `permissionDenials` half and the synthetic-denials case goes red; widen it to "any non-empty
 * reply" and the no-tool case goes red.
 */
const fixture = (name: string): Record<string, unknown> =>
	JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8')) as Record<string, unknown>

const line = (value: unknown): string => `${JSON.stringify(value)}\n`

/** A child that prints `lines` and exits 0 once stdout runs dry — no real CLI is ever spawned. */
function fakeSpawner(lines: string[]) {
	return (_spec: AgentProcessSpec): AgentProcess => {
		let reap: (code: number) => void = () => {}
		const exited = new Promise<number>(resolve => {
			reap = resolve
		})
		return {
			stdout: (async function* () {
				for (const l of lines) yield l
				reap(0)
			})(),
			stderr: (async function* () {})(),
			write() {},
			endStdin() {},
			kill() {
				reap(0)
			},
			exited,
		}
	}
}

async function runOn(terminalFrame: Record<string, unknown>): Promise<AgentRunResult> {
	const runner = ClaudeAgentRunner.withOptions(new MockLoggingService(), new InMemoryAgentIdentityService(), {
		spawner: fakeSpawner([line({ type: 'system', subtype: 'init', session_id: 'sess-p', model: 'claude' }), line(terminalFrame)]),
		inactivityMs: 5_000,
		postMortemMs: 50,
	})
	const events: AgentRuntimeEvent[] = []
	for await (const event of runner.run({
		agentName: AgentName.ISSUE_WORK,
		cwd: '/tmp/w',
		binaryPath: '/opt/bin/claude',
		messages: [{ role: AgentMessageRole.USER, content: 'grava em produção' }],
		posture: PermissionPosture.AUTO,
	}))
		events.push(event)
	const finished = events.find(event => event.type === 'finished')
	if (finished?.type !== 'finished') throw new Error('the run produced no terminal event')
	return finished.result
}

describe('the terminal frame — what the codec reads off it', () => {
	it('carries safety_stops and permission_denials (tool name + input KEYS only — never values)', () => {
		const [decoded] = new StreamJsonCodec().push(
			line({
				...fixture('auto-no-tool.result.json'),
				permission_denials: [{ tool_name: 'Bash', tool_use_id: 'tu_1', tool_input: { command: 'psql $PROD_URL', description: 'x' } }],
			}),
		)
		expect(decoded?.terminal?.safetyStops).toBe(0)
		expect(decoded?.terminal?.permissionDenials).toEqual([{ tool: 'Bash', inputKeys: ['command', 'description'] }])
	})

	it('reads the measured classifier block as two safety stops', () => {
		const [decoded] = new StreamJsonCodec().push(line(fixture('auto-classifier-block.result.json')))
		expect(decoded?.terminal?.safetyStops).toBe(2)
		expect(decoded?.terminal?.permissionDenials).toEqual([])
	})
})

describe('ClaudeAgentRunner — a blocked action is a PERMISSION_DENIED transport stop', () => {
	it('AC-9 — the measured classifier block (safety_stops: 2) stops the turn with PERMISSION_DENIED', async () => {
		const result = await runOn(fixture('auto-classifier-block.result.json'))
		expect(result.stop?.kind).toBe(StopKind.PERMISSION_DENIED)
		// The agent's own final words ride the detail — that is the approval request the operator reads.
		expect((result.stop?.detail ?? '').length).toBeGreaterThan(0)
	})

	it('AC-9 — a non-empty permission_denials stops it too, and the detail names the denied tool', async () => {
		const result = await runOn({
			...fixture('auto-no-tool.result.json'),
			permission_denials: [{ tool_name: 'Write', tool_use_id: 'tu_2', tool_input: { file_path: '/etc/hosts', content: 'secret' } }],
		})
		expect(result.stop?.kind).toBe(StopKind.PERMISSION_DENIED)
		expect(result.stop?.detail).toContain('Write')
		expect(result.stop?.detail).toContain('file_path')
		// The input's VALUES never reach the detail — an input can carry a credential.
		expect(result.stop?.detail).not.toContain('secret')
	})

	it('AC-9 — the measured self-refusal (safety_stops: 0, no denials) is NOT a stop', async () => {
		const result = await runOn(fixture('auto-no-tool.result.json'))
		expect(result.stop).toBeUndefined()
	})

	it('AC-9 — TerminalOutputAccumulator.outcome() reports STOPPED(PERMISSION_DENIED)', async () => {
		const result = await runOn(fixture('auto-classifier-block.result.json'))
		const accumulator = new TerminalOutputAccumulator({ issueId: '00000000-0000-4000-8000-0000000000cc' })
		accumulator.feed({ type: 'finished', result })
		expect(accumulator.outcome()).toMatchObject({ kind: 'STOPPED', stopKind: StopKind.PERMISSION_DENIED })
	})
})
```

### Step T10.2 — Run it to verify it fails

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test src/agent/services/AgentRunner/ClaudeAgentRunner/permissionDenied.test.ts`
Expected: FAIL — `decoded.terminal.safetyStops` é `undefined` e `result.stop` é `undefined` para o frame bloqueado.

### Step T10.3 — The codec reads the two fields

Modify `packages/api/typescript/src/agent/services/StreamJsonCodec/FrameDecoder.ts`:
- logo ANTES de `export interface TerminalResultRecord`, adicione

```typescript
/** One tool call the CLI's permission layer refused — WHAT was refused, never what it carried. */
export interface PermissionDenial {
	/** `tool_name` on the wire. */
	tool: string
	/**
	 * The KEYS of `tool_input`, never its values: an input can carry a credential (a connection string,
	 * a token in a command line), and this list ends up in a Needs-you card and a channel message.
	 */
	inputKeys: readonly string[]
}
```

- em `TerminalResultRecord`, após `apiErrorStatus: string | number | null` (e seu docblock), adicione

```typescript
	/**
	 * `safety_stops` — how many tool calls the auto-mode CLASSIFIER blocked this turn. MEASURED
	 * (participant-permission-posture, Decision 10, claude 2.1.295): the classifier's block shows up HERE
	 * and NOT in `permission_denials`. 0 when absent (`count`'s rule).
	 */
	safetyStops: number
	/** `permission_denials` — tool calls the CLI's permission layer refused. `[]` when absent or malformed. */
	permissionDenials: readonly PermissionDenial[]
```

- logo após a função `readUsage`, adicione

```typescript
/** `permission_denials` is an array of `{ tool_name, tool_input }` — anything else degrades to nothing. */
function readDenials(raw: unknown): PermissionDenial[] {
	if (!Array.isArray(raw)) return []
	return raw.filter(isRecord).map(entry => ({
		tool: str(entry.tool_name) ?? 'unknown tool',
		inputKeys: isRecord(entry.tool_input) ? Object.keys(entry.tool_input) : [],
	}))
}
```

- em `decodeResult`, no objeto `terminal: {...}`, após `apiErrorStatus: apiErrorStatus(raw.api_error_status),` adicione

```typescript
				safetyStops: count(raw.safety_stops),
				permissionDenials: readDenials(raw.permission_denials),
```

Modify `packages/api/typescript/src/agent/services/StreamJsonCodec/CodexFrameDecoder.ts`: nos DOIS objetos `terminal: {...}` (`decodeTurnCompleted` e `decodeTurnFailed`), após `apiErrorStatus: null,` adicione

```typescript
				// codex's stream carries no permission-denial signal in any capture (`raw/*.jsonl`) — declared
				// absent here rather than guessed from the agent's prose.
				safetyStops: 0,
				permissionDenials: [],
```

Modify `packages/api/typescript/src/agent/services/StreamJsonCodec/index.ts`: a linha do `FrameDecoder` vira `export { FrameDecoder, type DecodedLine, type PermissionDenial, type TerminalResultRecord } from './FrameDecoder'`.

### Step T10.4 — The runner classifies it

Modify `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.ts`:
- no método `classifyStop`, substitua o bloco `if (observed.terminal) { return observed.terminal.isError ? … : undefined }` por

```typescript
		if (observed.terminal) {
			if (observed.terminal.isError) {
				return { kind: StopKind.SERVER_ERROR as TransportStopKind, detail: observed.terminal.text || 'provider reported an error result' }
			}
			// THE PERMISSION FILTER BLOCKED SOMETHING (participant-permission-posture, Decision 9). Both signals,
			// because the measurement (Decision 10) found the auto-mode classifier reporting in `safety_stops`
			// while `permission_denials` stayed empty. TRANSPORT evidence — the CLI's own counters on the
			// terminal frame, never the model's prose.
			if (observed.terminal.safetyStops > 0 || observed.terminal.permissionDenials.length > 0) {
				return { kind: StopKind.PERMISSION_DENIED, detail: permissionDeniedDetail(observed.terminal) }
			}
			return undefined
		}
```

- ao lado das outras funções de módulo (logo após `function failure(…)`), adicione

```typescript
/**
 * The Needs-you text of a PERMISSION_DENIED stop: the agent's own final words (its approval request) and
 * then, when the CLI listed them, WHICH tools were refused — by name and input keys, never input values.
 */
function permissionDeniedDetail(terminal: TerminalResultRecord): string {
	const denied = terminal.permissionDenials.map(d => `- ${d.tool}${d.inputKeys.length > 0 ? ` (${d.inputKeys.join(', ')})` : ''}`)
	const lines = [terminal.text.trim(), ...(denied.length > 0 ? ['Negado pelo filtro de permissões:', ...denied] : [])].filter(l => l.length > 0)
	return lines.length > 0 ? lines.join('\n') : 'o filtro de permissões barrou uma ação'
}
```

- no docblock de `buildResult` ("Only TRANSPORT stops can be raised here (`AUTH_REQUIRED`, `SERVER_ERROR`)"), a lista vira "(`AUTH_REQUIRED`, `SERVER_ERROR`, `PERMISSION_DENIED`)".

### Step T10.5 — Run tests to verify they pass

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test src/agent/services/ && bun x tsc -p tsconfig.build.json --noEmit`
Expected: PASS — os 6 casos novos; os testes existentes de codec/runner seguem verdes (qualquer literal de `TerminalResultRecord` em teste que o tsc apontar ganha `safetyStops: 0, permissionDenials: []`).

### Step T10.6 — Commit

```bash
git add packages/api/typescript/src/agent/services/StreamJsonCodec/FrameDecoder.ts \
        packages/api/typescript/src/agent/services/StreamJsonCodec/CodexFrameDecoder.ts \
        packages/api/typescript/src/agent/services/StreamJsonCodec/index.ts \
        packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.ts \
        packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/permissionDenied.test.ts \
        packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/fixtures/auto-no-tool.result.json \
        packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/fixtures/auto-classifier-block.result.json
git commit -m "feat(agent): PPP — safety_stops/permission_denials viram stop PERMISSION_DENIED (Task T10)"
```

---

## Task T11: Uma negação para o trabalho na hora, sem re-tentar

**Files to write:**
- Modify: `packages/api/typescript/src/agent/enums/TransportStopKind.ts` — `TRANSPORT_STOP_RETRIES` + `retriesInPlace`
- Modify: `packages/api/typescript/src/agent/usecases/RunIssueTurn.ts` — só re-tenta o que a tabela manda; o resto vira fato já
- Modify: `packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts` — idem; registra parada de thread
- Test: `packages/api/typescript/tests/flows/permission-denied.flow.test.ts`

**Files to read:**
- `packages/api/typescript/src/agent/services/MailboxDispatcher/LibSqlMailboxDispatcher.ts` (`runTurn`: `transportStop && !spoke` → `recordFailure`; sem `transportStop` → `complete`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /enum, /test
**Depends on:** T8, T10
**Consumes (frozen):** `TransportStopKind`/`TRANSPORT_STOP_KINDS`/`isTransportStopKind` (T1); `StopPolicy.permissionDenied` + `POLICY_KEY` (T1); `RaiseStop` (`@thread/usecases/RaiseStop`, já importado pelo dispatcher — aresta agent→thread existente); `EnqueueMailboxItem.posture` (T8); `AgentRunResult.stop.kind === StopKind.PERMISSION_DENIED` vindo do runner (T10); `RESOLUTIONS_BY_KIND`, `NOTIFIES_ON_CHANNEL` (T1).
**Scope fence:** DONE — o runner já devolve `PERMISSION_DENIED` (T10). LEFT — a tabela declarada re-tentar-vs-registrar e o consumo dela nos dois use cases. OUT — o dispatcher NÃO muda (ele já completa todo turno que não reporta `transportStop`); `raiseStopForPoisoned` continua `SERVER_ERROR`; nenhum `if (kind === StopKind.PERMISSION_DENIED)` — só lookup na tabela.
**Gate:** `cd packages/api/typescript && bun test tests/flows/permission-denied.flow.test.ts src/agent/ && bun x tsc -p tsconfig.build.json --noEmit`

### Step T11.1 — Write the failing flow test

Create `packages/api/typescript/tests/flows/permission-denied.flow.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import type { ZodType } from 'zod'
import { DomainEventRepository, LibSqlDatabaseDriver } from '@codm/core-typescript'
import { agentMailbox } from '@codm/contracts/db'
import {
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	ProviderKind,
	StopKind,
	StopResolution,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenThread, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { AgentRunner } from '@agent/services/AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '@agent/services/AgentRunnerFactory'
import { MailboxDispatcher } from '@agent/services/MailboxDispatcher'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { RunIssueTurn } from '@agent/usecases/RunIssueTurn'
import { RunOrchestratorTurn } from '@agent/usecases/RunOrchestratorTurn'
import { AgentRunStopRaisedEvent } from '@agent/events/AgentRunStopRaisedEvent'
import { AgentRunOutcome, FactSource, TRANSPORT_STOP_KINDS, TRANSPORT_STOP_RETRIES } from '@agent/enums'
import type { AgentRunRequest } from '@agent/types/AgentRunRequest'
import type { AgentRuntimeEvent } from '@agent/types/AgentRuntimeEvent'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { DEFAULT_STOP_POLICY, StopPolicyConfigRepository } from '@thread/repositories/StopPolicyConfigRepository'
import { RESOLUTIONS_BY_KIND } from '@thread/utils/StopResolutions'
import { NOTIFIES_ON_CHANNEL } from '@thread/utils/StopChannelNotice'

/** Every run ends the way the runner reports a blocked action — and counts how many times it was asked. */
class DenyingRunner extends AgentRunner {
	calls = 0
	async *run<OutputSchema extends ZodType | undefined = undefined>(_request: AgentRunRequest<OutputSchema>): AsyncIterable<AgentRuntimeEvent> {
		this.calls += 1
		yield {
			type: 'finished',
			result: {
				outcome: AgentRunOutcome.STOPPED,
				replyText: '',
				sessionId: 'sess-denied',
				failed: false,
				stop: { kind: StopKind.PERMISSION_DENIED, detail: 'Preciso gravar em produção — me libera?\n- Bash (command)' },
			},
		}
	}
	async shutdown(): Promise<void> {}
}

/**
 * AC-10 (participant-permission-posture, Decision 9) — PERMISSION_DENIED is a TRANSPORT stop that is
 * RECORDED AT ONCE: a retry under the same posture only repeats the denial. The issue turn mints the
 * stop on the first occurrence (issue → NEEDS_INPUT downstream), the item is consumed rather than
 * requeued, the orchestrator turn raises a thread-level stop, and `StopPolicy.permissionDenied` is
 * respected. Retry-vs-record is DATA (`TRANSPORT_STOP_RETRIES`), never a branch on a kind's name.
 */
describe('Flow (integration): a permission denial stops the work at once', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let runner: DenyingRunner

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		await testBed.reset()
		runner = new DenyingRunner()
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const roomThread = async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		return givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value, providers: [ProviderKind.CLAUDE_CODE] })
	}

	it('AC-10 — the vocabulary: transport, APPROVE/DENY/TAKE_OVER, notifies, and NOT retried', () => {
		expect(TRANSPORT_STOP_KINDS).toContain(StopKind.PERMISSION_DENIED)
		expect(RESOLUTIONS_BY_KIND[StopKind.PERMISSION_DENIED]).toEqual([StopResolution.APPROVE, StopResolution.DENY, StopResolution.TAKE_OVER])
		expect(NOTIFIES_ON_CHANNEL[StopKind.PERMISSION_DENIED]).toBe(true)
		expect(TRANSPORT_STOP_RETRIES[StopKind.PERMISSION_DENIED]).toBe(false)
		// The two transport stops that DO retry keep doing so — the table changed one row, not the rule.
		expect(TRANSPORT_STOP_RETRIES[StopKind.SERVER_ERROR]).toBe(true)
		expect(TRANSPORT_STOP_RETRIES[StopKind.AUTH_REQUIRED]).toBe(true)
	})

	it('AC-10 — an issue turn mints the stop on the FIRST occurrence and reports no transport retry', async () => {
		const thread = await roomThread()

		const out = await testBed.resolve(RunIssueTurn).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			issueId: uuidv7(),
			threadId: thread.id.value,
			key: 'moeda',
			title: 'Troca a moeda',
			provider: ProviderKind.CLAUDE_CODE,
			workspacePath: '/tmp/workspace',
			prompt: 'troca a moeda',
			turnKind: MailboxItemKind.WORK,
			messageId: uuidv7(),
			posture: PermissionPosture.AUTO,
		})

		expect(out.transportStop).toBeUndefined()
		const [fact] = await testBed.resolve(DomainEventRepository).findByType(AgentRunStopRaisedEvent)
		expect(fact?.payload.kind).toBe(StopKind.PERMISSION_DENIED)
		expect(fact?.payload.source).toBe(FactSource.INFERRED)
		expect(fact?.payload.detail).toContain('me libera?')
		// No ISSUE_RESULT: the stop's channel notice is the voice (NOTIFIES_ON_CHANNEL), not a composed reply.
		expect(await testBed.resolve(MailboxRepository).claimNext('denied-test', 60_000)).toBeUndefined()
	})

	it('AC-10 — through the dispatcher the item is CONSUMED after one run, never requeued', async () => {
		const thread = await roomThread()
		const issueId = uuidv7()
		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issueId,
			kind: MailboxItemKind.WORK,
			payload: { issueId, threadId: thread.id.value, key: 'moeda', title: 'Troca a moeda', goal: 'troca a moeda', provider: ProviderKind.CLAUDE_CODE },
			posture: PermissionPosture.AUTO,
			dedupKey: `work:${issueId}`,
		})

		await testBed.resolve(MailboxDispatcher).bind(testContainer).drain()

		// A requeued item would be claimed again in the SAME drain — three runs and a SERVER_ERROR poison.
		expect(runner.calls).toBe(1)
		const [row] = await testBed.resolve(LibSqlDatabaseDriver).db.select().from(agentMailbox)
		expect(row?.consumedAt).not.toBeNull()
		expect(row?.deadAt).toBeNull()
		expect(row?.lastError).toBeNull()
		const stops = await testBed.resolve(ThreadRepository).openStops(thread.id.value)
		expect(stops.map(stop => stop.kind)).not.toContain(StopKind.SERVER_ERROR)
	})

	it('AC-10 — an orchestrator turn raises a THREAD-level PERMISSION_DENIED stop and notifies the channel', async () => {
		const thread = await roomThread()

		const out = await testBed.resolve(RunOrchestratorTurn).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			workspacePath: '/tmp/workspace',
			provider: ProviderKind.CLAUDE_CODE,
			item: { kind: MailboxItemKind.OPERATOR_MESSAGE, entryId: uuidv7(), speaker: 'operator', text: 'grava em produção' },
			posture: PermissionPosture.AUTO,
		})

		expect(out.transportStop).toBeUndefined()
		const stops = await testBed.resolve(ThreadRepository).openStops(thread.id.value)
		expect(stops).toHaveLength(1)
		expect(stops[0]?.kind).toBe(StopKind.PERMISSION_DENIED)
		expect(stops[0]?.issueId).toBeUndefined()
		const entries = await testBed.resolve(ThreadRepository).listEntries(thread.id.value)
		expect(entries.some(entry => entry.kind === TranscriptKind.SYSTEM)).toBe(true)
	})

	it('AC-10 — with StopPolicy.permissionDenied OFF the orchestrator turn records nothing and does not fail', async () => {
		const thread = await roomThread()
		await testBed.resolve(StopPolicyConfigRepository).upsert(MOCK_CLOUD_OWNER_ID, { ...DEFAULT_STOP_POLICY, permissionDenied: false })

		const out = await testBed.resolve(RunOrchestratorTurn).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			workspacePath: '/tmp/workspace',
			provider: ProviderKind.CLAUDE_CODE,
			item: { kind: MailboxItemKind.OPERATOR_MESSAGE, entryId: uuidv7(), speaker: 'operator', text: 'grava em produção' },
			posture: PermissionPosture.AUTO,
		})

		expect(out.transportStop).toBeUndefined()
		expect(await testBed.resolve(ThreadRepository).openStops(thread.id.value)).toHaveLength(0)
	})
})
```

### Step T11.2 — Run it to verify it fails

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test tests/flows/permission-denied.flow.test.ts`
Expected: FAIL — `TRANSPORT_STOP_RETRIES` não existe; com ele, `out.transportStop` vem definido e o dispatcher roda o turno 3 vezes.

### Step T11.3 — The declared table

Modify `packages/api/typescript/src/agent/enums/TransportStopKind.ts`: ao final do arquivo, adicione

```typescript
/**
 * RETRY vs RECORD, per transport kind (participant-permission-posture, Decision 9) — DATA, never a branch
 * on a kind's name. `true`: the turn returns to the queue (`fail()`), and only exhaustion turns it into a
 * stop (`raiseStopForPoisoned`) — right for a process that died or a CLI that asked for a login, where a
 * second attempt can succeed. `false`: the stop is recorded on the FIRST occurrence and the item is
 * consumed — right for PERMISSION_DENIED, where a retry under the same posture only repeats the denial.
 * Total over the type: a transport kind added to the contract fails compilation here until somebody
 * decides which it is.
 */
export const TRANSPORT_STOP_RETRIES: Record<TransportStopKind, boolean> = {
	[StopKind.AUTH_REQUIRED]: true,
	[StopKind.SERVER_ERROR]: true,
	[StopKind.PERMISSION_DENIED]: false,
}

/** True when a stop of this kind goes back to the queue instead of being recorded now. */
export function retriesInPlace(kind: StopKind): boolean {
	return isTransportStopKind(kind) && TRANSPORT_STOP_RETRIES[kind]
}
```

### Step T11.4 — The issue turn records it now

Modify `packages/api/typescript/src/agent/usecases/RunIssueTurn.ts`:
- troque `import { isTransportStopKind } from '../enums/TransportStopKind'` por `import { isTransportStopKind, retriesInPlace, TRANSPORT_STOP_RETRIES } from '../enums/TransportStopKind'`;
- em `handle`, o cálculo de `transportStop` vira

```typescript
		// Only a transport stop the table says to RETRY goes back to the dispatcher as `transportStop`; one
		// it says to RECORD (PERMISSION_DENIED) was already minted by `persistOutcome` and consumes the item.
		const transportStop =
			observed.outcome.kind === 'STOPPED' && retriesInPlace(observed.outcome.stopKind) ? { detail: observed.outcome.detail } : undefined
```

- substitua o método `persistOutcome` inteiro (corpo E docblock) por

```typescript
	/**
	 * Persist the run's conclusion — and this is where §4.3 rule 7 (ONE producer per fact) is enforced.
	 *
	 * ### A TRANSPORT stop: retried, or recorded NOW — the table decides
	 * The runner observes it on the process/stream, so it never depended on a tool and is always
	 * `INFERRED`. `TRANSPORT_STOP_RETRIES` says what happens next. A kind that RETRIES (`AUTH_REQUIRED`,
	 * `SERVER_ERROR`) is not a fact yet: nothing is queued or minted here, `handle` reports it as
	 * `transportStop`, and the dispatcher `fail()`s and retries — the stop only appears, via
	 * `raiseStopForPoisoned`, once attempts run out. A kind that RECORDS (`PERMISSION_DENIED`) is minted
	 * on the first occurrence (issue → NEEDS_INPUT downstream) and the item is consumed — a retry under
	 * the same posture would only repeat the denial. Neither queues an `ISSUE_RESULT`: the stop's channel
	 * notice (`NOTIFIES_ON_CHANNEL`) is what tells the operator, exactly as for a poisoned item.
	 *
	 * ### Every other conclusion goes back to the conversation
	 * The result is queued in THIS transaction, beside the outcome facts (§6.3, B1): an outcome that
	 * commits always has a result queued, and one that rolls back queues nothing.
	 *
	 * ### The predicate for the completion fact is the agent's TOOL SCOPE
	 * With a non-empty scope the agent DECLARES its conclusion (`TransitionIssueStatus` / `RaiseStop`),
	 * which already raise these exact event classes with `FactSource.DECLARED`; minting a second one from
	 * the terminal outcome would publish the frozen `integration.issue.completed` TWICE. `request.mcp`
	 * present ⟺ `agent.tools.length > 0`, and the use case can only see the latter.
	 */
	private async persistOutcome(input: this['input'], outcome: TerminalOutcome, stopId: string | undefined, tx: Transaction): Promise<void> {
		if (outcome.kind === 'STOPPED' && isTransportStopKind(outcome.stopKind)) {
			if (TRANSPORT_STOP_RETRIES[outcome.stopKind]) return
			await this.domainEventRepository.save(
				new AgentRunStopRaisedEvent({
					entityId: input.issueId,
					ownerId: input.ownerId,
					payload: {
						stopId: stopId ?? uuidv7(),
						issueId: input.issueId,
						threadId: input.threadId,
						kind: outcome.stopKind,
						detail: outcome.detail,
						source: FactSource.INFERRED,
					},
				}),
				tx,
			)
			return
		}

		await this.enqueueResult(input, outcome, tx)

		if (outcome.kind === 'COMPLETED') {
			if (this.agent.tools.length > 0) {
				// O turno acabou e o agente NÃO declarou nada — nem `TransitionIssueStatus`, nem `RaiseStop`,
				// nem `AskOperator`. Continua sendo um `return`: inferir a conclusão aqui publicaria
				// `integration.issue.completed` uma segunda vez (o fato declarado já a publicou), e inferir um
				// stop aqui é impossível de fazer certo — a declaração chega por uma ferramenta MCP que commita
				// fora deste fluxo, então ler o estado daqui responde a pergunta errada. Quem fecha a issue
				// travada é `ReconcileStalledIssues`, pela ausência de trabalho em voo.
				//
				// O que muda é o SILÊNCIO. Até 2026-08-26 este caminho não deixava rastro em lugar nenhum, e um
				// turno que encerrou prometendo "volto com o veredito" custou 1h22 de issue marcada como viva
				// sem nada rodando. Esta linha é o que aponta a causa em segundos.
				this.logging.warn({
					content: {
						message: 'turn ended without a declared outcome — the reconcile sweep will close the issue',
						issueId: input.issueId,
						threadId: input.threadId,
						turnKind: input.turnKind,
					},
				})
				return
			}
			await this.domainEventRepository.save(
				new AgentRunCompletedEvent({
					entityId: input.issueId,
					ownerId: input.ownerId,
					payload: {
						issueId: input.issueId,
						threadId: input.threadId,
						key: input.key,
						completedAt: new Date(),
						source: FactSource.INFERRED,
					},
				}),
				tx,
			)
			return
		}

		// A DOMAIN stop can only reach this line if the accumulator's type narrowing were broken; with tools,
		// the agent declared it itself, so minting it again would be the double-publish rule 7 forbids.
		if (this.agent.tools.length > 0) return
		await this.domainEventRepository.save(
			new AgentRunStopRaisedEvent({
				entityId: input.issueId,
				ownerId: input.ownerId,
				payload: {
					stopId: stopId ?? uuidv7(),
					issueId: input.issueId,
					threadId: input.threadId,
					kind: outcome.stopKind,
					detail: outcome.detail,
					source: FactSource.INFERRED,
				},
			}),
			tx,
		)
	}
```

- no docblock do schema de saída, o comentário de `transportStop` ("Present only for a TRANSPORT stop kind") vira "Present only for a transport stop kind that RETRIES (`TRANSPORT_STOP_RETRIES`)".

### Step T11.5 — The orchestrator turn records a thread stop

Modify `packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts`:
- adicione `import { RaiseStop } from '@thread/usecases/RaiseStop'`, troque `import { isTransportStopKind } from '../enums/TransportStopKind'` por `import { retriesInPlace } from '../enums/TransportStopKind'`, e adicione `StopKind` ao import de `@codm/contracts-typescript/wire/enums`;
- no construtor, logo após `private readonly session: CloudSession,`, adicione

```typescript
		/**
		 * Records a non-retried transport stop (PERMISSION_DENIED) as a THREAD-level stop on the first
		 * occurrence — the same use case the dispatcher already calls for a poisoned item.
		 */
		private readonly raiseStop: RaiseStop,
```

- no bloco `if (outcome.kind !== 'COMPLETED') { … }`, substitua o `return { text: '', spoke, ...(isTransportStopKind(…) ? … : {}) }` por

```typescript
			// RETRY vs RECORD is DATA (`TRANSPORT_STOP_RETRIES`). A retried stop goes back to the dispatcher;
			// anything else (PERMISSION_DENIED) becomes a thread-level stop NOW and the item is consumed.
			if (retriesInPlace(outcome.stopKind)) return { text: '', spoke, transportStop: { detail: outcome.detail ?? outcome.stopKind } }
			await this.recordThreadStop(input, outcome.stopKind, outcome.detail)
			return { text: '', spoke }
```

- logo após o método `closeCuesOnNoDelivery`, adicione

```typescript
	/**
	 * A stop the orchestrator's own turn ran into, recorded on the THREAD (it has no issue). Its Needs-you
	 * card and channel notice carry the agent's own words, which is the approval request. A criterion the
	 * operator turned off (`STOP_CRITERION_DISABLED`) is the sanctioned no-op — logged, never a failed turn
	 * (a throw here would send the item back to the queue and repeat the denial). Anything else rethrows.
	 */
	private async recordThreadStop(input: this['input'], kind: StopKind, detail: string): Promise<void> {
		const raised = await tryCatchAsync(() => this.raiseStop.execute({ stopId: uuidv7(), threadId: input.threadId, kind, detail }))
		if (raised.success) return
		if (raised.error instanceof BaseError && raised.error.name === 'STOP_CRITERION_DISABLED') {
			this.logging.warn({ content: { message: 'stop not recorded — the operator disabled this criterion', threadId: input.threadId, kind } })
			return
		}
		throw raised.error
	}
```

### Step T11.6 — Run tests to verify they pass

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test tests/flows/permission-denied.flow.test.ts src/agent/ && bun x tsc -p tsconfig.build.json --noEmit`
Expected: PASS — os 5 casos novos; os testes existentes de stop de transporte (`SERVER_ERROR` re-tenta, item mudo volta à fila) seguem verdes.

### Step T11.7 — Commit

```bash
git add packages/api/typescript/src/agent/enums/TransportStopKind.ts \
        packages/api/typescript/src/agent/usecases/RunIssueTurn.ts \
        packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts \
        packages/api/typescript/tests/flows/permission-denied.flow.test.ts
git commit -m "feat(agent): PPP — PERMISSION_DENIED vira parada na primeira ocorrência, sem requeue (Task T11)"
```

---

## Task T12: Os prompts mandam pedir aprovação na conversa

**Files to write:**
- Modify: `packages/api/typescript/src/agent/agents/IssueWorkAgent/prompt.ts` — seção "WHEN AN ACTION IS BLOCKED"
- Modify: `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.ts` — seção "WHEN AN ACTION IS BLOCKED"
- Test: `packages/api/typescript/src/agent/agents/IssueWorkAgent/prompt.test.ts`
- Test: `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.blockedActions.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /agent, /test
**Depends on:** T6
**Consumes (frozen):** o campo `posture: PermissionPosture` do envelope de agente (T6 — os fixtures de prompt o carregam); `StopKind.PERMISSION_DENIED` levantado pelo runner (T10/T11) — por isso o prompt NÃO manda chamar RaiseStop para bloqueio do filtro (evita card duplicado).
**Scope fence:** DONE — nada. LEFT — um parágrafo por prompt + teste. OUT — qualquer outra seção do prompt; nenhum tool novo.
**Gate:** `cd packages/api/typescript && bun test src/agent/agents/ && bun x tsc -p tsconfig.build.json --noEmit`

### Step T12.1 — Write the failing tests

Create `packages/api/typescript/src/agent/agents/IssueWorkAgent/prompt.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import { MailboxItemKind, PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { IssueWorkPromptBuilder } from './prompt'

/**
 * AC-11 (participant-permission-posture, Decision 11) — a blocked action is answered by STOPPING and
 * asking for approval in the conversation, never by coaching a human through manual steps on the
 * machine (the improvised shift+tab / `/permissions` / `export` of 2026-10-08).
 */
const input = {
	ownerId: '00000000-0000-4000-8000-0000000000aa',
	issueId: '00000000-0000-4000-8000-0000000000cc',
	threadId: '00000000-0000-4000-8000-0000000000bb',
	cwd: '/Users/dev/project',
	binaryPath: '/usr/local/bin/claude',
	prompt: 'troca a moeda da Loja 01',
	turnKind: MailboxItemKind.WORK as const,
	speaker: 'operator',
	now: new Date('2026-10-09T12:00:00.000Z'),
	timezone: 'America/Sao_Paulo',
	key: 'moeda',
	title: 'Troca a moeda',
	posture: PermissionPosture.AUTO,
}

describe('IssueWorkPromptBuilder — a blocked action', () => {
	const system = new IssueWorkPromptBuilder().system(input)

	it('tells the agent to stop and ask for approval in this conversation, without raising a second stop', () => {
		expect(system).toContain('WHEN AN ACTION IS BLOCKED')
		expect(system).toContain('stop and ask for approval in this conversation')
		// The runner already raises PERMISSION_DENIED for a filter block (Decision 9); a RaiseStop here
		// would put a second approval card in front of the operator for the same refusal.
		expect(system).toContain('do not raise a stop for it')
	})

	it('never suggests shift+tab, /permissions or an `export`', () => {
		expect(system).not.toMatch(/shift\s*\+\s*tab/i)
		expect(system).not.toContain('/permissions')
		expect(system).not.toMatch(/\bexport\s+[A-Z_]+=/)
	})
})
```

Create `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.blockedActions.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import { ContactKind, Language, MailboxItemKind, PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { OrchestratorPromptBuilder } from './prompt'

/** AC-11 — the orchestrator half of the same instruction (Decision 11). */
const turn = {
	ownerId: '00000000-0000-4000-8000-0000000000aa',
	threadId: '00000000-0000-4000-8000-0000000000bb',
	cwd: '/Users/dev/project',
	binaryPath: '/usr/local/bin/claude',
	contactKind: ContactKind.GROUP,
	mentionTag: '@codm',
	window: { seeded: true, entries: [] },
	openStops: [],
	timezone: 'America/Sao_Paulo',
	availableModels: [],
	language: Language.PT_BR,
	now: new Date('2026-10-09T12:00:00.000Z'),
	posture: PermissionPosture.AUTO,
	item: {
		kind: MailboxItemKind.OPERATOR_MESSAGE,
		entryId: '00000000-0000-4000-8000-0000000000dd',
		speaker: 'operator',
		text: 'troca a moeda da Loja 01',
	},
} as const

describe('OrchestratorPromptBuilder — a blocked action', () => {
	const system = new OrchestratorPromptBuilder().system(turn)

	it('tells the agent to stop and ask for approval in this conversation', () => {
		expect(system).toContain('WHEN AN ACTION IS BLOCKED')
		expect(system).toContain('stop and ask for approval in this conversation')
	})

	it('never suggests shift+tab, /permissions or an `export`', () => {
		expect(system).not.toMatch(/shift\s*\+\s*tab/i)
		expect(system).not.toContain('/permissions')
		expect(system).not.toMatch(/\bexport\s+[A-Z_]+=/)
	})
})
```

(Se `availableModels: []` com `as const` não tipar contra o input do builder, troque o `as const` do objeto por anotações pontuais — `turnKind`/`kind` literais — sem `as never`.)

### Step T12.2 — Run them to verify they fail

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test src/agent/agents/IssueWorkAgent/prompt.test.ts src/agent/agents/OrchestratorAgent/prompt.blockedActions.test.ts`
Expected: FAIL — `WHEN AN ACTION IS BLOCKED` não está em nenhum dos dois prompts.

### Step T12.3 — The two paragraphs

Modify `packages/api/typescript/src/agent/agents/IssueWorkAgent/prompt.ts`:
- em `system()`, logo após `...this.declarationInstruction(input),`, adicione `...this.blockedActions(input),`;
- logo após o método `declarationInstruction`, adicione

```typescript
	/**
	 * A BLOCKED ACTION (participant-permission-posture, Decision 11). The permission filter can refuse an
	 * action in a turn running under AUTO, and the improvised answer of 2026-10-08 was to coach a human
	 * through shift+tab, `/permissions` and `export` — steps that do not apply to a headless run. The
	 * only lever that works is in the conversation: whoever may elevate approves there, and the next turn
	 * runs with what they granted. Rendered under the same predicate as `declarationInstruction`, because
	 * it speaks about this issue's turn. It deliberately does NOT name RaiseStop: the runner already raises
	 * PERMISSION_DENIED for a filter block, and a declared APPROVAL_NEEDED would duplicate the card.
	 */
	private blockedActions(input: IssueWorkInput): string[] {
		if (!input.issueId) return []
		return [
			'',
			'WHEN AN ACTION IS BLOCKED',
			'Some actions are blocked by a permission filter before they run. When that happens, stop and ask for approval in this ' +
				'conversation: end your turn saying exactly what you were about to do and why it needs approval. The system turns that ' +
				'block into the approval request on its own — do not raise a stop for it, and do not try to work around it.',
			'Never tell anyone to take manual steps on the computer to get around it — no keyboard shortcuts, no editing settings or ' +
				'permission files, no environment variables. Whoever can grant it answers in the conversation, and your next turn runs ' +
				'with what they granted.',
		]
	}
```

Modify `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.ts`:
- em `system()`, logo após `...this.askingTheOperator(),`, adicione `...this.blockedActions(),`;
- logo após o método `askingTheOperator`, adicione

```typescript
	/**
	 * A BLOCKED ACTION (participant-permission-posture, Decision 11) — the orchestrator's half of the same
	 * rule the working agent gets. Stop, ask here in one line; never coach a human through manual steps on
	 * the machine. When the filter itself stopped the turn, the system turns these words into the
	 * approval request the operator receives.
	 */
	private blockedActions(): string[] {
		return [
			'',
			'WHEN AN ACTION IS BLOCKED',
			'Some actions are blocked by a permission filter before they run. When that happens, stop and ask for approval in this ' +
				'conversation: say in one line what you were about to do and why it needs approval.',
			'Never tell anyone to take manual steps on the computer to get around it — no keyboard shortcuts, no editing settings or ' +
				'permission files, no environment variables. Whoever can grant it answers here, and the next turn runs with what they granted.',
		]
	}
```

### Step T12.4 — Run tests to verify they pass

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test src/agent/agents/ && bun x tsc -p tsconfig.build.json --noEmit`
Expected: PASS — os 4 casos novos e os testes de prompt existentes.

### Step T12.5 — Commit

```bash
git add packages/api/typescript/src/agent/agents/IssueWorkAgent/prompt.ts \
        packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.ts \
        packages/api/typescript/src/agent/agents/IssueWorkAgent/prompt.test.ts \
        packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.blockedActions.test.ts
git commit -m "feat(agent): PPP — prompts pedem aprovação na conversa quando o filtro barra (Task T12)"
```

---

## Task T13: Invariante — nenhum argumento de tool muda a postura

**Files to write:**
- Test: `packages/api/typescript/src/agent/controllers/posture-from-identity.test.ts`

**Agent:** qa-tester
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T8
**Consumes (frozen):** `ForkIssueController`, `SteerIssueTurnController` lendo `identity.posture` (T8); `AgentIdentityMiddleware` + `InMemoryAgentIdentityService` de `@codm/core-typescript`; `AGENT_RUN_TOKEN_HEADER`; `PermissionPosture`; `MailboxRepository.claimNext().posture`.
**Scope fence:** DONE — toda a implementação (T6, T8). LEFT — SÓ o teste do invariante e a demonstração do falseador. OUT — qualquer mudança de código de produção; se o teste ficar vermelho com o código como está, isso é um defeito da T8 a reportar, não a corrigir aqui.
**Gate:** `cd packages/api/typescript && bun test src/agent/controllers/posture-from-identity.test.ts`

### Step T13.1 — Write the invariant test

Create `packages/api/typescript/src/agent/controllers/posture-from-identity.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import {
	AGENT_RUN_TOKEN_HEADER,
	AgentIdentityMiddleware,
	InMemoryAgentIdentityService,
	type BaseError,
	type HttpControllerRequest,
} from '@codm/core-typescript'
import { MailboxItemKind, McpScope, PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository } from '../repositories/MailboxRepository'
import { ForkIssueController } from './ForkIssue'
import { SteerIssueTurnController } from './SteerIssueTurn'

/**
 * INVARIANT (participant-permission-posture, Decision 6 / AC-6): the posture of work queued from inside
 * a turn comes ONLY from `ctx.agentIdentity` — the run token — never from a tool argument. A model that
 * could pass `posture: 'BYPASS'` would elevate itself.
 *
 * Two lines of defence, both pinned:
 *  1. The controller reads `identity.posture`; a `posture` smuggled into `body` is never read. FALSIFIER:
 *     change `ForkIssueController.handle` to `posture: (request.body as { posture?: PermissionPosture }).posture ?? identity.posture`
 *     and the first two cases go RED (the WORK item becomes BYPASS under an AUTO token).
 *  2. Through the real middleware, a `posture` argument that contradicts the token is refused outright
 *     (`compareIdentity` walks the identity's keys, and `posture` is one of them) — nothing is queued.
 */
describe('INVARIANT — a tool argument cannot set the posture', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const identity = (threadId: string, posture: PermissionPosture) => ({
		ownerId: MOCK_CLOUD_OWNER_ID,
		threadId,
		entryId: uuidv7(),
		scope: McpScope.orchestration,
		posture,
	})

	const queued = async () => {
		const item = await testBed.resolve(MailboxRepository).claimNext('invariant-test', 60_000)
		return item
	}

	it('ForkIssue — an AUTO token with `posture: BYPASS` in the body queues AUTO', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		await testBed.resolve(ForkIssueController).handle({
			ctx: { ownerId: MOCK_CLOUD_OWNER_ID, agentIdentity: identity(thread.id.value, PermissionPosture.AUTO) },
			params: { threadId: thread.id.value },
			body: { goal: 'grava em produção', posture: PermissionPosture.BYPASS },
		} as Parameters<ForkIssueController['handle']>[0])

		const item = await queued()
		expect(item?.kind).toBe(MailboxItemKind.WORK)
		expect(item?.posture).toBe(PermissionPosture.AUTO)
	})

	it('SteerIssueTurn — an AUTO token with `posture: BYPASS` in the body queues AUTO', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'moeda' })

		await testBed.resolve(SteerIssueTurnController).handle({
			ctx: { ownerId: MOCK_CLOUD_OWNER_ID, agentIdentity: identity(thread.id.value, PermissionPosture.AUTO) },
			params: { threadId: thread.id.value, issueId: issue.id.value },
			body: { text: 'pode gravar', posture: PermissionPosture.BYPASS },
		} as Parameters<SteerIssueTurnController['handle']>[0])

		expect((await queued())?.posture).toBe(PermissionPosture.AUTO)
	})

	it('the token is the source in BOTH directions — a BYPASS token with `posture: AUTO` in the body queues BYPASS', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		await testBed.resolve(ForkIssueController).handle({
			ctx: { ownerId: MOCK_CLOUD_OWNER_ID, agentIdentity: identity(thread.id.value, PermissionPosture.BYPASS) },
			params: { threadId: thread.id.value },
			body: { goal: 'troca a moeda', posture: PermissionPosture.AUTO },
		} as Parameters<ForkIssueController['handle']>[0])

		expect((await queued())?.posture).toBe(PermissionPosture.BYPASS)
	})

	it('through the real middleware, a contradicting `posture` argument is REFUSED and nothing is queued', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const identities = new InMemoryAgentIdentityService()
		const token = identities.issue({ ...identity(thread.id.value, PermissionPosture.AUTO), expiresAt: new Date(Date.now() + 60_000) })
		const request = {
			headers: { [AGENT_RUN_TOKEN_HEADER]: token },
			params: { threadId: thread.id.value },
			body: { goal: 'grava em produção', posture: PermissionPosture.BYPASS },
			ctx: { ownerId: MOCK_CLOUD_OWNER_ID },
		} as unknown as HttpControllerRequest<unknown>

		const failure = await new AgentIdentityMiddleware(identities).execute(request).then(
			() => undefined,
			(error: unknown) => error as BaseError,
		)

		expect(failure?.name).toBe('FORBIDDEN')
		expect(await queued()).toBeUndefined()
	})
})
```

### Step T13.2 — Run it (green on the implemented code)

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test src/agent/controllers/posture-from-identity.test.ts`
Expected: PASS — 4 casos.

### Step T13.3 — Demonstrate the falsifier, then restore

Edite TEMPORARIAMENTE `packages/api/typescript/src/agent/controllers/ForkIssue.ts`: troque `posture: identity.posture,` por `posture: (request.body as { posture?: PermissionPosture }).posture ?? identity.posture,`. Rode o mesmo comando: Expected FAIL nos casos 1 e 3. Restaure com `git checkout -- packages/api/typescript/src/agent/controllers/ForkIssue.ts` e rode de novo: PASS. Registre as duas saídas no corpo do commit.

### Step T13.4 — Commit

```bash
git add packages/api/typescript/src/agent/controllers/posture-from-identity.test.ts
git commit -m "test(agent): PPP — invariante: argumento de tool não muda a postura (Task T13)"
```

---

## Task T14: Invariante — uma resolução nunca concede mais do que o resolvedor tem

**Files to write:**
- Test: `packages/api/typescript/tests/flows/resolution-posture.flow.test.ts`

**Agent:** qa-tester
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T9
**Consumes (frozen):** `ResolveStop` com `runPosture` e `Thread.resolveStop(stop, resolution, resolverPosture)`; `RESUMES_WITH_RESOLVER_POSTURE`; `ThreadStopResolvedEvent.payload.posture`; `ResumeIssueOnStopResolved` copiando a postura do fato (T9); `SetParticipantElevation` (T3).
**Scope fence:** DONE — toda a implementação. LEFT — SÓ os testes negativos e a demonstração do falseador. OUT — código de produção.
**Gate:** `cd packages/api/typescript && bun test tests/flows/resolution-posture.flow.test.ts`

### Step T14.1 — Write the invariant test

Create `packages/api/typescript/tests/flows/resolution-posture.flow.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { TestBed, givenIssue, givenStop, givenThread, givenWorkspace } from '@test/support'
import {
	AGENT_RUN_TOKEN_HEADER,
	AgentIdentityMiddleware,
	InMemoryAgentIdentityService,
	OutboxDispatcher,
	type HttpControllerRequest,
} from '@codm/core-typescript'
import { MailboxTargetKind, McpScope, PermissionPosture, ProviderKind, StopKind, StopResolution } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository, type ClaimedMailboxItem } from '@agent/repositories/MailboxRepository'
import { ResumeIssueOnStopResolved } from '@thread/handlers/ResumeIssueOnStopResolved'
import { ResolveStopController } from '@thread/controllers/ResolveStop'
import { ResolveStop } from '@thread/usecases/ResolveStop'
import { SetParticipantElevation } from '@thread/usecases/ConfigureThreadSettings'

/**
 * INVARIANT (participant-permission-posture, Decision 7 / AC-7): a resolution never grants more than the
 * resolver holds, and "no" never lifts the filter.
 *  - An APPROVE from an AUTO orchestrator run resumes AUTO — even though the operator of the thread may
 *    elevate. FALSIFIER: make `ResolveStop` ignore `runPosture` (`thread.postureOf(OPERATOR_PARTICIPANT_ID)`
 *    always) and that case goes RED.
 *  - A DENY resumes AUTO even from the console of an operator who may elevate. FALSIFIER: flip
 *    `RESUMES_WITH_RESOLVER_POSTURE[DENY]` to `true` and the DENY cases go RED.
 *  - An APPROVE from the console of an operator who may NOT elevate resumes AUTO.
 */
describe('INVARIANT — a resolution never grants more than the resolver holds', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		await testBed.reset()
		await testBed.spy.register(testBed.resolve(ResumeIssueOnStopResolved))
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const givenStoppedIssue = async (kind: StopKind = StopKind.APPROVAL_NEEDED) => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value, providers: [ProviderKind.CLAUDE_CODE] })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'moeda' })
		const stop = await givenStop(testBed, { threadId: thread.id.value, issueId: issue.id.value, kind, detail: 'Posso gravar em produção?' })
		return { thread, issue, stop }
	}

	const resumeOf = async (issueId: string): Promise<ClaimedMailboxItem | undefined> => {
		await testBed.resolve(OutboxDispatcher).flush()
		const mailbox = testBed.resolve(MailboxRepository)
		for (;;) {
			const item = await mailbox.claimNext('resolution-invariant', 60_000)
			if (!item) return undefined
			await mailbox.complete(item.id)
			if (item.targetKind === MailboxTargetKind.ISSUE && item.targetId === issueId) return item
		}
	}

	const viaRun = async (threadId: string, stopId: string, resolution: StopResolution, posture: PermissionPosture) => {
		const identities = new InMemoryAgentIdentityService()
		const token = identities.issue({
			scope: McpScope.orchestration,
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId,
			entryId: uuidv7(),
			posture,
			expiresAt: new Date(Date.now() + 60_000),
		})
		const request = {
			headers: { [AGENT_RUN_TOKEN_HEADER]: token },
			params: { stopId },
			body: { resolution },
			ctx: { ownerId: MOCK_CLOUD_OWNER_ID },
		} as unknown as HttpControllerRequest<unknown>
		await new AgentIdentityMiddleware(identities).execute(request)
		await testBed.resolve(ResolveStopController).execute(request)
	}

	it('APPROVE from an AUTO orchestrator run does NOT elevate — even with an operator who may', async () => {
		const { thread, issue, stop } = await givenStoppedIssue()

		await viaRun(thread.id.value, stop.stopId, StopResolution.APPROVE, PermissionPosture.AUTO)

		expect((await resumeOf(issue.id.value))?.posture).toBe(PermissionPosture.AUTO)
	})

	it('DENY from the console never elevates', async () => {
		const { issue, stop } = await givenStoppedIssue()

		await testBed.resolve(ResolveStop).execute({ ownerId: MOCK_CLOUD_OWNER_ID, stopId: stop.stopId, resolution: StopResolution.DENY })

		expect((await resumeOf(issue.id.value))?.posture).toBe(PermissionPosture.AUTO)
	})

	it('DENY from a BYPASS orchestrator run never elevates', async () => {
		const { thread, issue, stop } = await givenStoppedIssue(StopKind.PERMISSION_DENIED)

		await viaRun(thread.id.value, stop.stopId, StopResolution.DENY, PermissionPosture.BYPASS)

		expect((await resumeOf(issue.id.value))?.posture).toBe(PermissionPosture.AUTO)
	})

	it('APPROVE from the console of an operator who may NOT elevate resumes AUTO', async () => {
		const { thread, issue, stop } = await givenStoppedIssue()
		await testBed
			.resolve(SetParticipantElevation)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, participantId: 'operator', canElevate: false })

		await testBed.resolve(ResolveStop).execute({ ownerId: MOCK_CLOUD_OWNER_ID, stopId: stop.stopId, resolution: StopResolution.APPROVE })

		expect((await resumeOf(issue.id.value))?.posture).toBe(PermissionPosture.AUTO)
	})
})
```

### Step T14.2 — Run it (green on the implemented code)

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test tests/flows/resolution-posture.flow.test.ts`
Expected: PASS — 4 casos.

### Step T14.3 — Demonstrate both falsifiers, then restore

(a) Em `packages/api/typescript/src/thread/usecases/ResolveStop.ts`, troque TEMPORARIAMENTE `input.runPosture ?? thread.postureOf(OPERATOR_PARTICIPANT_ID)` por `thread.postureOf(OPERATOR_PARTICIPANT_ID)` → rode: FAIL no caso 1. (b) Em `packages/api/typescript/src/thread/utils/StopResolutions.ts`, troque TEMPORARIAMENTE `[StopResolution.DENY]: false` por `true` → rode: FAIL nos casos 2 e 3. Restaure os dois arquivos com `git checkout --` e rode de novo: PASS. Registre as saídas no corpo do commit.

### Step T14.4 — Commit

```bash
git add packages/api/typescript/tests/flows/resolution-posture.flow.test.ts
git commit -m "test(thread): PPP — invariante: resolução não concede mais do que o resolvedor tem (Task T14)"
```

---

## Task T15: Invariante — membro admitido entra sem elevação

**Files to write:**
- Test: `packages/api/typescript/src/thread/entities/Thread.admission.test.ts`

**Agent:** qa-tester
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /test
**Depends on:** T3
**Consumes (frozen):** `Thread.admitParticipant(participant: Omit<Participant, 'canElevate'>)` escrevendo `canElevate: false` DEPOIS do spread; `SetParticipantInvocation` admitindo um membro vivo de grupo (T3).
**Scope fence:** DONE — implementação (T3). LEFT — SÓ o teste e a demonstração do falseador. OUT — código de produção.
**Gate:** `cd packages/api/typescript && bun test src/thread/entities/Thread.admission.test.ts`

### Step T15.1 — Write the invariant test

Create `packages/api/typescript/src/thread/entities/Thread.admission.test.ts`:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { ContactKind, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenRemote, givenRemoteMembership, givenThread, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { SetParticipantInvocation } from '../usecases/ConfigureThreadSettings'
import { Thread } from './Thread'

const MEMBER = '5511900000041@s.whatsapp.net'

/**
 * INVARIANT (participant-permission-posture, Decision 2 / AC-2): a participant ADMITTED to the roster —
 * a live group member the JSON never recorded — enters WITHOUT elevation, whatever the caller handed in.
 * Elevation is only ever an explicit operator grant.
 *
 * FALSIFIER: in `Thread.admitParticipant`, write `{ canElevate: false, ...participant }` (spread AFTER the
 * default) and the smuggled-grant case goes RED.
 */
describe('INVARIANT — an admitted member enters without elevation', () => {
	const base = {
		ownerId: '00000000-0000-4000-8000-000000000001',
		channelId: '00000000-0000-4000-8000-0000000000aa',
		contactRef: { externalId: 'g1', displayName: 'Grupo', kind: ContactKind.GROUP },
		workspaceId: '00000000-0000-4000-8000-0000000000bb',
		providers: [ProviderKind.CLAUDE_CODE],
		mentionTag: '@base',
		participants: [{ participantId: 'operator', name: 'Operator', source: 'Mac', canInvoke: true, canElevate: true }],
	}

	it('a caller that smuggles canElevate=true still admits the member with false', () => {
		const thread = Thread.create(base)
		// Assigned to a variable first: the parameter type does not accept the key, and this is exactly the
		// runtime shape a careless caller could still hand over.
		const smuggled = { participantId: MEMBER, name: MEMBER, source: 'Channel group member', canInvoke: false, canElevate: true }

		thread.admitParticipant(smuggled)

		expect(thread.participants.find(p => p.participantId === MEMBER)?.canElevate).toBe(false)
	})

	it('admitting an id already on the roster changes nothing — the existing grant stands', () => {
		const thread = Thread.create(base)

		thread.admitParticipant({ participantId: 'operator', name: 'Operator', source: 'Mac', canInvoke: true })

		expect(thread.participants.find(p => p.participantId === 'operator')?.canElevate).toBe(true)
	})

	describe('through the use case that admits (SetParticipantInvocation)', () => {
		let testBed: TestBed
		let testContainer: DependencyContainer
		const GROUP_CHANNEL = '019e4d24-0000-7041-9e1c-0000000000a1'
		const GROUP_ID = '120363333333333333@g.us'

		beforeAll(async () => {
			testContainer = container.createChildContainer()
			testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		})
		beforeEach(async () => {
			await testBed.reset()
		})
		afterAll(async () => {
			await testBed.destroy()
		})

		it('granting INVOCATION to a live member admits them without ELEVATION', async () => {
			await givenRemote(testBed, { channelId: GROUP_CHANNEL, remoteId: GROUP_ID, type: ContactKind.GROUP, name: 'BK DASH BOT' })
			const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
			const thread = await givenThread(testBed, {
				ownerId: MOCK_CLOUD_OWNER_ID,
				workspaceId: workspace.id.value,
				channelId: GROUP_CHANNEL,
				contactExternalId: GROUP_ID,
				contactKind: ContactKind.GROUP,
				participants: [{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true, canElevate: true }],
			})
			await givenRemoteMembership(testBed, { channelId: GROUP_CHANNEL, groupId: GROUP_ID, memberId: MEMBER })

			await testBed
				.resolve(SetParticipantInvocation)
				.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, participantId: MEMBER, canInvoke: true })

			const member = (await testBed.resolve(ThreadRepository).findById(thread.id.value))?.participants.find(p => p.participantId === MEMBER)
			expect(member?.canInvoke).toBe(true)
			expect(member?.canElevate).toBe(false)
		})
	})
})
```

### Step T15.2 — Run it (green on the implemented code)

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test src/thread/entities/Thread.admission.test.ts`
Expected: PASS — 3 casos.

### Step T15.3 — Demonstrate the falsifier, then restore

Em `packages/api/typescript/src/thread/entities/Thread.ts`, troque TEMPORARIAMENTE `{ ...participant, canElevate: false }` por `{ canElevate: false, ...participant }` → rode: FAIL no caso 1. Restaure com `git checkout -- packages/api/typescript/src/thread/entities/Thread.ts` → PASS. Registre as saídas no corpo do commit.

### Step T15.4 — Commit

```bash
git add packages/api/typescript/src/thread/entities/Thread.admission.test.ts
git commit -m "test(thread): PPP — invariante: membro admitido entra sem elevação (Task T15)"
```

---

## Task T16: Invariante — item legado sem postura roda AUTO

**Files to write:**
- Test: `packages/api/typescript/src/agent/repositories/MailboxRepository/MailboxRepository.legacyPosture.test.ts`

**Agent:** qa-tester
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /test
**Depends on:** T6
**Consumes (frozen):** coluna `agent_mailbox.posture` `NOT NULL DEFAULT 'AUTO'` (T2); `ClaimedMailboxItem.posture` (T6); a migração `0029_*.sql` com o rebuild de `agent_mailbox` (T2).
**Scope fence:** DONE — implementação (T2, T6). LEFT — SÓ o teste e a demonstração do falseador. OUT — código de produção e a migração.
**Gate:** `cd packages/api/typescript && bun test src/agent/repositories/MailboxRepository/MailboxRepository.legacyPosture.test.ts`

### Step T16.1 — Write the invariant test

Create `packages/api/typescript/src/agent/repositories/MailboxRepository/MailboxRepository.legacyPosture.test.ts`:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { LibSqlDatabaseDriver } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind, PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { TestBed } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository } from './MailboxRepository'

/**
 * INVARIANT (participant-permission-posture, Decision 4 / AC-5): an item enqueued BEFORE the posture
 * existed — a row whose INSERT never named the column — is claimed as AUTO, the least privilege. The rule
 * lives in the schema (`DEFAULT 'AUTO'`), not in a branch of the reader.
 *
 * The row is written with RAW SQL that omits the column, exactly as a pre-deploy producer did.
 *
 * FALSIFIER: drop `.default(PermissionPosture.AUTO)` from `agentMailbox.posture` and the `DEFAULT 'AUTO'`
 * from the migration — the legacy INSERT then fails `NOT NULL` and this test goes RED.
 */
describe('INVARIANT — a legacy item with no posture runs AUTO', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('a row inserted without the column is claimed as AUTO', async () => {
		const id = uuidv7()
		await testBed.resolve(LibSqlDatabaseDriver).db.run(
			sql`INSERT INTO agent_mailbox (id, owner_id, target_kind, target_id, kind, payload, dedup_key, attempts, created_at)
			    VALUES (${id}, ${MOCK_CLOUD_OWNER_ID}, ${MailboxTargetKind.ISSUE}, ${uuidv7()}, ${MailboxItemKind.STEER},
			            ${JSON.stringify({ threadId: uuidv7(), key: 'k', title: 't', text: 'legado' })}, ${`legacy:${id}`}, 0, ${Date.now()})`,
		)

		const claimed = await testBed.resolve(MailboxRepository).claimNext('legacy-test', 60_000)

		expect(claimed?.id).toBe(id)
		expect(claimed?.posture).toBe(PermissionPosture.AUTO)
	})
})
```

(Se `LibSqlDatabaseDriver.db` não expuser `.run`, use o mesmo `sql` via `db.all(sql\`…\`)` — o ponto é um INSERT cru sem a coluna `posture`.)

### Step T16.2 — Run it (green on the implemented code)

Run: `cd packages/api/typescript && env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID bun test src/agent/repositories/MailboxRepository/MailboxRepository.legacyPosture.test.ts`
Expected: PASS — 1 caso.

### Step T16.3 — Demonstrate the falsifier, then restore

Em `packages/contracts/src/db/sqlite/migrations/0029_*.sql`, remova TEMPORARIAMENTE o `DEFAULT 'AUTO'` da coluna `posture` do `__new_agent_mailbox` (o TestBed aplica as migrações do disco) → rode: FAIL (`NOT NULL constraint failed: agent_mailbox.posture`). Restaure com `git checkout -- packages/contracts/src/db/sqlite/migrations/` → PASS. Registre as saídas no corpo do commit.

### Step T16.4 — Commit

```bash
git add packages/api/typescript/src/agent/repositories/MailboxRepository/MailboxRepository.legacyPosture.test.ts
git commit -m "test(agent): PPP — invariante: item legado sem postura roda AUTO (Task T16)"
```

---

## Final Validation

Todos com `env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID` e `export PATH="$HOME/.cargo/bin:$PATH"`:

- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` — type-check autoritativo do backend
- [ ] `cd packages/api/typescript && bun test` — suíte do backend
- [ ] `bun tsc` — type-check de todos os workspaces
- [ ] `bun lint` — lint limpo
- [ ] `bun run test:tooling` — inclui `db:check-go`, golden do CLI (`scripts/cli`), `sqlc-parity` e `union-parity`
- [ ] `bun check:generated` — contracts + SDK + openapi.json em dia
- [ ] `cd packages/contracts && bun test codegen/` — bindings gerados
- [ ] `cd packages/api/go && go build ./... && go test ./...` — Go compila e aplica a migração espelhada
- [ ] `cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts --check` — `schema.sql` do Go em dia (estava vermelho em HEAD pela 0028; T2 o regenera)
- [ ] `cd packages/app/react && bun x tsc` — type-check do console
- [ ] `cd packages/app/react && bun run storybook:build` — stories do dialog compilam
- [ ] `cd packages/e2e && bun run test` — e2e (inclui `15-participant-elevation.spec.ts`)
- [ ] AC mapping (every spec AC → ≥1 test path):
  - AC-1 → `packages/api/typescript/src/agent/enums/TransportStopKind.typecheck.ts:"permissionDeniedIsTransport"` + `packages/contracts/codegen/` (via `cd packages/contracts && bun test codegen/`) + `bun check:generated`
  - AC-2 → `packages/api/typescript/src/thread/usecases/SetParticipantElevation.test.ts:"AC-2 — AttachThread seeds the operator WITH elevation and every group member WITHOUT"`, `packages/contracts/src/db/participants-can-elevate.backfill.test.ts:"is idempotent — a second pass changes no byte"`, `packages/api/typescript/src/thread/entities/Thread.admission.test.ts:"a caller that smuggles canElevate=true still admits the member with false"`
  - AC-3 → `packages/api/typescript/src/thread/usecases/SetParticipantElevation.test.ts:"AC-3 — an id that is neither on the roster nor a live member is refused with PARTICIPANT_NOT_FOUND"`, `packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.test.tsx:"o operador nasce podendo liberar, o membro não, e ligar o membro persiste no backend real"`, `packages/e2e/tests/15-participant-elevation.spec.ts:"o operador marca quem pode liberar ações sem filtro, e a escolha sobrevive a reabrir"`
  - AC-4 → `packages/api/typescript/tests/flows/permission-posture.flow.test.ts:"AC-4 — a message from a participant WITH canElevate queues BYPASS; one WITHOUT queues AUTO"`, `…:"AC-4/AC-5 — a console whisper follows the operator`s canElevate; a loop tick is always AUTO"`, `…:"AC-4 — the ISSUE_RESULT a BYPASS issue turn queues back to the orchestrator is AUTO"`
  - AC-5 → `packages/api/typescript/src/agent/services/MailboxDispatcher/LibSqlMailboxDispatcher.posture.test.ts:"the dispatcher hands the claimed posture to the orchestrator turn AND to the issue turn"`, `packages/api/typescript/src/agent/repositories/MailboxRepository/MailboxRepository.legacyPosture.test.ts:"a row inserted without the column is claimed as AUTO"`, `packages/api/typescript/tests/flows/permission-posture.flow.test.ts:"AC-5 — SteerThread`s STEER items to open issues carry the operator`s posture too"`
  - AC-6 → `packages/api/typescript/src/agent/services/MailboxDispatcher/LibSqlMailboxDispatcher.posture.test.ts:"RunIssueTurn puts the posture on the runner request AND on the run token the tools read back"`, `packages/api/typescript/tests/flows/permission-posture.flow.test.ts:"AC-6 — ForkIssue stamps the WORK item with the run token`s posture"`, `packages/api/typescript/src/agent/controllers/posture-from-identity.test.ts:"ForkIssue — an AUTO token with `posture: BYPASS` in the body queues AUTO"`
  - AC-7 → `packages/api/typescript/tests/flows/approve-elevates.flow.test.ts:"AC-7 — APPROVE from the CONSOLE, with the operator allowed to elevate, resumes BYPASS"`, `…:"AC-7 — ThreadStopResolvedEvent carries the resolved posture"`, `packages/api/typescript/tests/flows/resolution-posture.flow.test.ts:"APPROVE from an AUTO orchestrator run does NOT elevate — even with an operator who may"`, `…:"DENY from the console never elevates"`
  - AC-8 → `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/buildArgs.posture.test.ts:"BYPASS → exactly one `--permission-mode bypassPermissions`"`, `packages/api/typescript/src/agent/services/AgentRunner/CodexAgentRunner/buildArgs.posture.test.ts:"BYPASS passes the flag on the `exec resume` shape too — and the session id stays the trailing positional"`
  - AC-9 → `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/permissionDenied.test.ts:"AC-9 — the measured classifier block (safety_stops: 2) stops the turn with PERMISSION_DENIED"`, `…:"AC-9 — the measured self-refusal (safety_stops: 0, no denials) is NOT a stop"`, `…:"AC-9 — TerminalOutputAccumulator.outcome() reports STOPPED(PERMISSION_DENIED)"`
  - AC-10 → `packages/api/typescript/tests/flows/permission-denied.flow.test.ts:"AC-10 — through the dispatcher the item is CONSUMED after one run, never requeued"`, `…:"AC-10 — with StopPolicy.permissionDenied OFF the orchestrator turn records nothing and does not fail"`, `…:"AC-10 — the vocabulary: transport, APPROVE/DENY/TAKE_OVER, notifies, and NOT retried"` + `bun run --cwd packages/contracts db:check-go`
  - AC-11 → `packages/api/typescript/src/agent/agents/IssueWorkAgent/prompt.test.ts:"never suggests shift+tab, /permissions or an `export`"`, `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.blockedActions.test.ts:"tells the agent to stop and ask for approval in this conversation"`
  - AC-12 → `bun tsc`, `bun lint`, `bun run test` (as linhas acima)

## Notes

### Research inventory — every `enqueue(` producer and how it gets its posture

| Producer | Item | Posture source |
|---|---|---|
| `packages/api/typescript/src/thread/usecases/IngestChannelMessage.ts` (`mailbox.enqueue`, ~:137) | `OPERATOR_MESSAGE` (mensagem digitada no canal) | `thread.postureOf(input.senderExternalId)` — o dono chega como `OPERATOR_PARTICIPANT_ID` porque `ConsumeInboundMessage.ts:103` mapeia `fromMe` antes do ingest |
| `packages/api/typescript/src/thread/usecases/SteerThread.ts` (~:85) | `STEER` para cada issue aberta | sussurro: `thread.postureOf(OPERATOR_PARTICIPANT_ID)`; `firedByLoop` (via `FireDueLoops`): `AUTO` |
| `packages/api/typescript/src/thread/usecases/SteerThread.ts` (~:115) | `OPERATOR_MESSAGE` (sussurro sem issue aberta) | mesma regra da linha acima |
| `packages/api/typescript/src/agent/usecases/RunIssueTurn.ts` `enqueueResult` (~:529) | `ISSUE_RESULT` | sempre `AUTO` |
| `packages/api/typescript/src/agent/usecases/ForkIssue.ts` (~:109) | `WORK` | `ctx.agentIdentity.posture` via `ForkIssueController` |
| `packages/api/typescript/src/agent/usecases/SteerIssueTurn.ts` (~:64) | `STEER` (de dentro de um turno) | `ctx.agentIdentity.posture` via `SteerIssueTurnController` |
| `packages/api/typescript/src/thread/handlers/ResumeIssueOnStopResolved.ts` (~:69) | `STEER` de retomada | `ThreadStopResolvedEvent.payload.posture` (resolvedor reduzido por `RESUMES_WITH_RESOLVER_POSTURE`; `ResolveStop` sem `ctx.agentIdentity` → `operator`); com item pendente (`hasPending`) nada é enfileirado e vale a postura do pendente |

Nenhum produtor Go escreve em `agent_mailbox` (verificado: só o TS). Linhas legadas: `DEFAULT 'AUTO'` da coluna.

### Research inventory — every runner spawn site

| Spawn site | Posture source |
|---|---|
| `Agent.run()` (`packages/api/typescript/src/agent/types/Agent.ts`) — único ponto que chama `runner.run` em produção, template method | `input.posture` do envelope (`BaseAgentInputSchema.posture`) |
| ↳ via `RunIssueTurn.drainRun` (`IssueWorkAgent`) | `RunIssueTurnInputSchema.posture` ← `item.posture` (`LibSqlMailboxDispatcher.runIssueWork`) |
| ↳ via `RunOrchestratorTurn` (`OrchestratorAgent`) | `RunOrchestratorTurnInputSchema.posture` ← `item.posture` (`LibSqlMailboxDispatcher.runThreadTurn`) |
| `ClaudeAgentRunner.run` → `buildArgs` | `request.posture` → `CLAUDE_PERMISSION_ARGS` |
| `CodexAgentRunner.run` → `buildArgs` | `request.posture` → `CODEX_PERMISSION_ARGS` |
| `E2eStubAgentRunner` | consome o request, não monta argv — nada a mudar |
| `scripts/phase3-smoke.ts`, `scripts/phase6-mcp-smoke.ts` | excluídos do `tsconfig.build.json` (registro pontual); não fazem parte dos gates |

### Go only mirrors

O Go recebe SÓ o espelho da migração (`db:sync-go`) e os schemas derivados (`schema.sql`, `schema.core.sql`, `schema.app.sql`, `gen/models.go` via sqlc). Não existe regra de skill agnóstica de linguagem envolvida e nenhum consumidor Go lê `posture`, `permission_denied` ou `canElevate`. `sqlc` não está instalado nesta máquina (verificado em 2026-10-09): sem ele, `gen/models.go` não regenera localmente e `scripts/sqlc-parity.test.ts` pula com aviso — o executor reporta isso no PR em vez de editar o gerado.

### Decisões de projeto tomadas no plano (fora do texto da spec)

- **Postura como COLUNA de `agent_mailbox`, não chave do `payload`.** O `payload` é `unknown`/opaco; uma chave lá dentro depende de cada produtor lembrar. `EnqueueMailboxItem.posture` obrigatório + `DEFAULT 'AUTO'` torna os sete produtores verificados pelo compilador e a regra do item legado declarativa (Non-negotiable 5).
- **`posture` no envelope do core (`BaseAgentInputSchema`).** O canon da skill `agent` exige `z.agentInput()`, e o mint do token é genérico sobre o input — mesmo motivo documentado para `entryId`. O core passa a importar `PermissionPosture` de `@codm/contracts-typescript` (precedente: `OutboxSource` em `LibSqlDomainEventRepository`).
- **`PERMISSION_DENIED` de issue não enfileira `ISSUE_RESULT`.** A voz da parada é o aviso de canal (`NOTIFIES_ON_CHANNEL = true`, exigido pela Decision 9); enfileirar também o resultado faria o orquestrador repetir a mesma notícia — o mesmo critério de "voz" que o arquivo `StopChannelNotice.ts` documenta.
- **Turno do orquestrador negado vira parada de THREAD** (`RaiseStop` sem `issueId`), honrando `STOP_CRITERION_DISABLED` como no-op. Consequência: APPROVE numa parada de thread não agenda retomada (`ResumeIssueOnStopResolved` ignora paradas sem issue, comportamento pré-existente) — a elevação acontece quando quem pode liberar responde no chat (novo `OPERATOR_MESSAGE` em BYPASS).
- **Phase 2 (ack interativo da estrutura de arquivos) não foi feito**: o plano foi autorado por subagente com instruções fechadas do chamador.

### Riscos para quem revisar

- O prompt do `IssueWorkAgent` manda chamar `RaiseStop(APPROVAL_NEEDED)` quando o filtro barra; quando o classificador barra de fato (`safety_stops > 0`), o runner TAMBÉM fecha o turno em `PERMISSION_DENIED` — o operador pode ver dois cards para o mesmo bloqueio. Ambos resolvem com APPROVE; a segunda retomada colapsa no `hasPending`.
- O claim `posture` (string) participa do `compareIdentity`: qualquer tool futura com um argumento chamado `posture` que divirja do token é recusada com `FORBIDDEN` (pinado em T13). É defesa em profundidade, mas é uma colisão de nome a lembrar.
- O codex não expõe sinal de negação no stream medido: `PERMISSION_DENIED` é detectado só no Claude.
- Entre os commits de T1 e T2 a árvore tem drift de schema (testes de banco vermelhos) — os dois devem sair no mesmo push.
