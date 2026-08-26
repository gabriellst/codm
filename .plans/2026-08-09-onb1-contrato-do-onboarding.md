# ONB-1 — O contrato do onboarding — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** O onboarding ganha começo e fim persistidos — uma linha por `ownerId` com `currentStep` e `completedAt` — e uma leitura só que conta a história inteira, substituindo o `setup-checklist` que hoje conta metade dela num segundo lugar.

**Architecture:** O contexto `ui`, hoje BFF de leitura pura, ganha seus primeiros `entities/`, `repositories/` e `middlewares/` (spec Decision 6). O agregado `Onboarding` guarda o progresso; `GetOnboarding` devolve esse progresso MAIS a satisfação dos passos de setup — derivada por consultas de existência, nunca persistida (Decision 8, AC-9). O `OnboardingMiddleware` barra o `GetHomeDashboard` enquanto não houver `completedAt`, e é isso que faz o console mandar o operador ao `/onboarding` (AC-1).

**Tech Stack:** TypeScript, Bun, Drizzle (SQLite), tsyringe-neo, TanStack Query, Zod, TypeSpec

**Spec:** .specs/2026-08-09-onboarding-wizard-e-system-preconditions-design.md
**Tasks:** 6
**Estimated minutes:** 300

---

## Task T1: O contrato de fio nasce — o enum dos passos que o servidor conhece

**Files to write:**
- Create: `packages/contracts/wire/enums/onboarding-step.tsp`
- Modify: `packages/contracts/wire/main.tsp` — acrescenta o import do enum novo
- Regen: `packages/contracts/generated/typescript/src/wire/enums/onboarding-step.ts` (e as cópias go/rust — geradas, nunca editadas à mão)

**Files to read:**
- `packages/contracts/wire/enums/attach-flow-style.tsp`
- `packages/contracts/wire/main.tsp`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum
**Depends on:** (none)
**Consumes (frozen):** nada — esta Task É o contrato. Ela CONGELA, para T2–T6, o enum `OnboardingStep` importável de `@codm/contracts-typescript/wire/enums` com EXATAMENTE estes nove membros, nesta ordem: `VALUE`, `HOW`, `CONTROL`, `CHANNEL`, `WORKSPACE`, `CONTACT`, `AGENTS`, `REVIEW`, `FINAL`.
**Scope fence:** OUT — nenhum arquivo em `packages/api/`, `packages/app/` ou `packages/contracts/db/` é tocado aqui. NÃO crie tabela, NÃO crie entidade. DONE elsewhere — nada; esta é a Task raiz.
**Gate:** `bun contracts` verde, e `grep -n "OnboardingStep" packages/contracts/generated/typescript/src/wire/enums/onboarding-step.ts` mostrando os nove membros.

### Step T1.1 — Escreva o enum TypeSpec

```
// packages/contracts/wire/enums/onboarding-step.tsp — arquivo completo
namespace TemplateContracts;

@doc("Onde o operador está no wizard de onboarding. SÓ os passos que o SERVIDOR conhece: os três informativos, os cinco de setup, e o final. Uma SystemPrecondition NUNCA entra aqui — o servidor não enxerga o TCC da máquina, e o mesmo ownerId em dois Macs teria respostas diferentes (spec Decision 8).")
enum OnboardingStep {
  VALUE: "VALUE",
  HOW: "HOW",
  CONTROL: "CONTROL",
  CHANNEL: "CHANNEL",
  WORKSPACE: "WORKSPACE",
  CONTACT: "CONTACT",
  AGENTS: "AGENTS",
  REVIEW: "REVIEW",
  FINAL: "FINAL",
}
```

### Step T1.2 — Registre o enum no main.tsp

Modifique `packages/contracts/wire/main.tsp`: junto dos demais `import "./enums/...";`, acrescente `import "./enums/onboarding-step.tsp";` em ordem alfabética entre os vizinhos existentes.

### Step T1.3 — Regenere os bindings

Run: `bun contracts`
Expected: sem erro; o `cargo check` do crate rust ao final também passa.

### Step T1.4 — Verifique o contrato congelado

```bash
grep -n "OnboardingStep" packages/contracts/generated/typescript/src/wire/enums/onboarding-step.ts
```

Expected: um `export const OnboardingStep = {...}` (ou `enum`) com os nove membros `VALUE`, `HOW`, `CONTROL`, `CHANNEL`, `WORKSPACE`, `CONTACT`, `AGENTS`, `REVIEW`, `FINAL`.

### Step T1.5 — Type check

Run: `bun tsc`
Expected: 0 erros (o enum ainda não tem consumidor).

### Step T1.6 — Commit

```bash
git add packages/contracts/wire/enums/onboarding-step.tsp \
        packages/contracts/wire/main.tsp \
        packages/contracts/generated/
git commit -m "feat(contracts): OnboardingStep — os passos que o servidor conhece (ONB-1 Task T1)"
```

---

## Task T2: O progresso do operador sobrevive ao refresh

**Files to write:**
- Modify: `packages/contracts/db/schema/owner.ts` — acrescenta a tabela `onboardings`
- Create: `packages/contracts/db/schema/migrations/00XX_*.sql` — gerada por `bun migrate:create`
- Create: `packages/api/typescript/src/ui/entities/Onboarding.ts`
- Create: `packages/api/typescript/src/ui/entities/index.ts`
- Create: `packages/api/typescript/src/ui/entities/Onboarding.test.ts`
- Create: `packages/api/typescript/src/ui/repositories/OnboardingRepository/OnboardingRepository.ts`
- Create: `packages/api/typescript/src/ui/repositories/OnboardingRepository/DrizzleOnboardingRepository.ts`
- Create: `packages/api/typescript/src/ui/repositories/OnboardingRepository/MockOnboardingRepository.ts`
- Create: `packages/api/typescript/src/ui/repositories/OnboardingRepository/index.ts`
- Create: `packages/api/typescript/src/ui/repositories/OnboardingRepository/DrizzleOnboardingRepository.test.ts`
- Create: `packages/api/typescript/src/ui/repositories/index.ts`
- Modify: `packages/api/typescript/src/ui/registry.ts` — liga `OnboardingRepository` (mock/real)

**Files to read:**
- `packages/api/typescript/src/owner/entities/Owner.ts`
- `packages/api/typescript/src/owner/repositories/OwnerRepository/DrizzleOwnerRepository.ts`
- `packages/contracts/db/schema/owner.ts`

**Agent:** database-architect
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /repository, /db-modelling, /migrate
**Depends on:** T1
**Consumes (frozen):** de T1, verbatim — `OnboardingStep` de `@codm/contracts-typescript/wire/enums`, com os membros `VALUE | HOW | CONTROL | CHANNEL | WORKSPACE | CONTACT | AGENTS | REVIEW | FINAL`. Esta Task CONGELA para T3–T6: a classe `Onboarding` (métodos `static create({ ownerId })`, `advanceTo(step)`, `complete()`, `isCompleted()`), a abstrata `OnboardingRepository` (`findByOwnerId(ownerId, tx?)`, `save(entity, tx?)`), e a tabela `onboardings` exportada de `@codm/contracts/db`.
**Scope fence:** DONE elsewhere — o enum de T1 (importe, nunca redeclare). OUT — nenhum use case, controller ou middleware nesta Task (T3/T4/T5 os criam); nada em `packages/app/`; NÃO delete o `GetSetupChecklist` (T4 faz isso).
**Gate:** `cd packages/api/typescript && bun test src/ui/entities/Onboarding.test.ts src/ui/repositories/OnboardingRepository/DrizzleOnboardingRepository.test.ts` verde, `bun run --cwd packages/contracts db:check-go` verde, e `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` com 0 erros.

### Step T2.1 — Escreva o teste da entidade (falhando)

```typescript
// packages/api/typescript/src/ui/entities/Onboarding.test.ts
import { describe, expect, it } from 'bun:test'
import { OnboardingStep } from '@codm/contracts-typescript/wire/enums'
import { Onboarding } from './Onboarding'

/**
 * O AGREGADO GUARDA A JORNADA, não o mundo. `currentStep` e `completedAt` são as duas únicas coisas
 * que o servidor sabe sobre o onboarding — a satisfação dos passos de setup é derivada do banco a
 * cada leitura (spec Decision 8), e uma SystemPrecondition nunca chega aqui.
 */
describe('Onboarding', () => {
	it('nasce no primeiro passo e não concluído', () => {
		const onboarding = Onboarding.create({ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' })

		expect(onboarding.currentStep).toBe(OnboardingStep.VALUE)
		expect(onboarding.completedAt).toBeUndefined()
		expect(onboarding.isCompleted()).toBe(false)
	})

	it('avança para o passo que o cliente reporta', () => {
		const onboarding = Onboarding.create({ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' })

		onboarding.advanceTo(OnboardingStep.CHANNEL)

		expect(onboarding.currentStep).toBe(OnboardingStep.CHANNEL)
	})

	/**
	 * AC-2. `complete()` é o ÚNICO caminho para `completedAt`, e ele não pergunta nada sobre passos de
	 * setup: a spec (Decision 13) manda bloquear a conclusão apenas por passo REQUIRED, e nenhum passo
	 * de hoje é REQUIRED — logo, do lado do servidor, concluir é sempre possível.
	 */
	it('concluir grava completedAt e leva ao passo final', () => {
		const onboarding = Onboarding.create({ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' })

		onboarding.complete()

		expect(onboarding.isCompleted()).toBe(true)
		expect(onboarding.completedAt).toBeInstanceOf(Date)
		expect(onboarding.currentStep).toBe(OnboardingStep.FINAL)
	})

	/** Concluir duas vezes não move a data — a segunda chamada é inerte, não um erro. */
	it('concluir de novo preserva a data da primeira conclusão', () => {
		const onboarding = Onboarding.create({ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' })
		onboarding.complete()
		const first = onboarding.completedAt

		onboarding.complete()

		expect(onboarding.completedAt).toEqual(first)
	})
})
```

### Step T2.2 — Rode o teste para vê-lo falhar

Run: `cd packages/api/typescript && bun test src/ui/entities/Onboarding.test.ts`
Expected: FAIL com `Cannot find module './Onboarding'`.

### Step T2.3 — Scaffold da entidade

```bash
bun cli entity ui Onboarding --aggregate
```

### Step T2.4 — Proposed file (o executor escreve por cima do scaffold)

```typescript
// packages/api/typescript/src/ui/entities/Onboarding.ts — arquivo final COMPLETO.
// MANTENHA a forma do scaffold: `static override schema`, a interface com declaration merging no fim.
import { AggregateRoot, z } from '@codm/core-typescript'
import Z from 'zod'
import { OnboardingStep } from '@codm/contracts-typescript/wire/enums'

/**
 * A JORNADA do operador pelo wizard — e SÓ ela.
 *
 * Duas coisas moram aqui porque só o servidor pode respondê-las: onde a pessoa parou
 * (`currentStep`) e se ela terminou (`completedAt`). Tudo o mais que o wizard mostra é derivado a
 * cada leitura: a satisfação dos passos de setup sai de consultas de existência no banco (um canal
 * apagado desfaz o passo — spec AC-9), e as pré-condições do sistema saem do host e NUNCA chegam
 * até aqui, porque o servidor não enxerga o TCC da máquina e o mesmo `ownerId` em dois Macs daria
 * respostas diferentes (spec Decision 8).
 *
 * SEM campo `state`: nenhum passo coleta dado que não tenha tabela própria, e um saco genérico seria
 * convite a preenchê-lo com o que não devia (spec Decision 6).
 */
export const OnboardingSchema = z.object({
	ownerId: z.uuid(),
	currentStep: z.enum(OnboardingStep),
	completedAt: z.instanceof(Date).optional(),
})

export type OnboardingProps = Z.infer<typeof OnboardingSchema>

export class Onboarding extends AggregateRoot<typeof OnboardingSchema> {
	static override schema = OnboardingSchema

	static create(data: { ownerId: string }): Onboarding {
		return new Onboarding({
			ownerId: data.ownerId,
			currentStep: OnboardingStep.VALUE,
			completedAt: undefined,
		})
	}

	isCompleted(): boolean {
		return !!this.completedAt
	}

	/**
	 * O cliente reporta onde está; o servidor guarda. Não há tabela de transições válidas: a ORDEM
	 * dos passos é decidida pela composição no console (spec Decision 4), que conhece as pendências
	 * do host — coisa que este lado não conhece. Validar transição aqui seria o servidor opinando
	 * sobre uma lista que ele não vê inteira.
	 */
	advanceTo(step: OnboardingStep): void {
		this.currentStep = step
		this.validate()
	}

	/**
	 * Idempotente de propósito: concluir de novo não remarca a data. Quem chama é um botão, e um
	 * duplo clique não deve reescrever quando o operador terminou.
	 */
	complete(): void {
		if (this.isCompleted()) return
		this.completedAt = new Date()
		this.currentStep = OnboardingStep.FINAL
		this.validate()
	}
}

export interface Onboarding extends OnboardingProps {}
```

### Step T2.5 — Barril das entidades

```typescript
// packages/api/typescript/src/ui/entities/index.ts — arquivo final COMPLETO (a pasta é nova).
export { Onboarding, OnboardingSchema, type OnboardingProps } from './Onboarding'
```

### Step T2.6 — Rode o teste da entidade

Run: `cd packages/api/typescript && bun test src/ui/entities/Onboarding.test.ts`
Expected: PASS — 4 testes.

### Step T2.7 — A tabela

Modifique `packages/contracts/db/schema/owner.ts`: ao final do arquivo, depois da tabela `owners`, acrescente a tabela abaixo. Ela vive neste arquivo porque é a fatia por dono, ao lado de `owner_owners` — o prefixo `owner_` do nome segue a convenção do arquivo.

```typescript
/**
 * `owner_onboardings` — uma linha por operador (spec Decision 7, AC-3). Guarda a JORNADA, nunca o
 * mundo: a satisfação dos passos de setup é derivada por consulta de existência a cada leitura, e
 * pré-condição do sistema não é assunto do servidor.
 */
export const onboardings = sqliteTable(
	'owner_onboardings',
	{
		id: text('id').primaryKey(),

		// Uma linha por dono — o índice único é o que garante a AC-3.
		ownerId: text('owner_id').notNull(),

		// OnboardingStep wire enum. text + CHECK, mesma forma de `owner_owners.kind`.
		currentStep: text('current_step').$type<OnboardingStep>().notNull(),

		// NULL = não concluído. É o único fato que barra a API (spec Decision 10).
		completedAt: integer('completed_at', { mode: 'timestamp_ms' }),

		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		version: integer('version').notNull().default(1),
	},
	t => [
		enumCheck('owner_onboardings_current_step_check', t.currentStep, Object.values(OnboardingStep)),
		uniqueIndex('onboardings_owner_id_idx').on(t.ownerId),
	],
)
```

No topo do mesmo arquivo, acrescente `OnboardingStep` ao import existente de `'../../generated/typescript/src/wire/enums'`, e `uniqueIndex` ao import de `'drizzle-orm/sqlite-core'`.

### Step T2.8 — Gere a migração e espelhe no Go

```bash
bun migrate:create
bun run --cwd packages/contracts db:sync-go
bun run --cwd packages/contracts db:check-go
```

Expected: um arquivo novo em `packages/contracts/db/schema/migrations/` com o `CREATE TABLE owner_onboardings`; `db:check-go` sai 0 (as duas cópias byte-a-byte iguais).

### Step T2.9 — Escreva o teste do repositório (falhando)

```typescript
// packages/api/typescript/src/ui/repositories/OnboardingRepository/DrizzleOnboardingRepository.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { OnboardingStep } from '@codm/contracts-typescript/wire/enums'
import { TestBed } from '@test/support'
import { Onboarding } from '../../entities/Onboarding'
import { OnboardingRepository } from './OnboardingRepository'

const OWNER = '019e4d24-6524-7041-9e1c-8108180cddae'
const OTHER_OWNER = '019e4d24-6524-7041-9e1c-8108180cddaf'

describe('DrizzleOnboardingRepository', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repo: OnboardingRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
		repo = testBed.resolve(OnboardingRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('salva e reidrata o progresso pelo ownerId', async () => {
		const onboarding = Onboarding.create({ ownerId: OWNER })
		onboarding.advanceTo(OnboardingStep.CHANNEL)
		await repo.save(onboarding)

		const found = await repo.findByOwnerId(OWNER)

		expect(found).toBeDefined()
		expect(found?.currentStep).toBe(OnboardingStep.CHANNEL)
		expect(found?.completedAt).toBeUndefined()
	})

	it('a conclusão sobrevive à reidratação', async () => {
		const onboarding = Onboarding.create({ ownerId: OWNER })
		onboarding.complete()
		await repo.save(onboarding)

		const found = await repo.findByOwnerId(OWNER)

		expect(found?.isCompleted()).toBe(true)
		expect(found?.currentStep).toBe(OnboardingStep.FINAL)
	})

	/**
	 * AC-3 — o progresso é por operador. Este é o caso que o app real nunca exercita (há um único
	 * OPERATOR_ID), e é exatamente por isso que ele existe aqui: a garantia é do repositório, não da
	 * sessão.
	 */
	it('AC-3: um segundo operador tem onboarding independente', async () => {
		const mine = Onboarding.create({ ownerId: OWNER })
		mine.complete()
		await repo.save(mine)

		const theirs = Onboarding.create({ ownerId: OTHER_OWNER })
		await repo.save(theirs)

		expect((await repo.findByOwnerId(OWNER))?.isCompleted()).toBe(true)
		expect((await repo.findByOwnerId(OTHER_OWNER))?.isCompleted()).toBe(false)
	})

	it('devolve undefined para um dono que nunca começou', async () => {
		expect(await repo.findByOwnerId(OTHER_OWNER)).toBeUndefined()
	})
})
```

### Step T2.10 — Rode o teste para vê-lo falhar

Run: `cd packages/api/typescript && bun test src/ui/repositories/OnboardingRepository/DrizzleOnboardingRepository.test.ts`
Expected: FAIL com `Cannot find module './OnboardingRepository'`.

### Step T2.11 — Scaffold do repositório

```bash
bun cli repository ui Onboarding
```

### Step T2.12 — Proposed file (a abstrata)

```typescript
// packages/api/typescript/src/ui/repositories/OnboardingRepository/OnboardingRepository.ts — arquivo final COMPLETO
import { Repository } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { Onboarding } from '../../entities/Onboarding'

/**
 * O vocabulário é mínimo de propósito: há UMA linha por dono, e todo caminho de leitura passa pelo
 * `ownerId`. Não existe `findById` porque ninguém tem o id do onboarding na mão — quem pergunta
 * tem o dono.
 */
export abstract class OnboardingRepository extends Repository<Onboarding> {
	abstract findByOwnerId(ownerId: string, tx?: Transaction): Promise<Onboarding | undefined>
}
```

### Step T2.13 — Proposed file (a implementação Drizzle)

```typescript
// packages/api/typescript/src/ui/repositories/OnboardingRepository/DrizzleOnboardingRepository.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@codm/core-typescript'
import { onboardings } from '@codm/contracts/db'
import { Onboarding } from '../../entities/Onboarding'
import { OnboardingRepository } from './OnboardingRepository'

@injectable()
export class DrizzleOnboardingRepository extends OnboardingRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findByOwnerId(ownerId: string, tx?: DrizzleClient): Promise<Onboarding | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(onboardings).where(eq(onboardings.ownerId, ownerId)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async save(entity: Onboarding, tx?: DrizzleClient): Promise<Onboarding> {
		entity.incrementVersion()
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbc
				.insert(onboardings)
				.values(data)
				.onConflictDoUpdate({
					target: onboardings.id,
					set: {
						currentStep: data.currentStep,
						completedAt: data.completedAt,
						updatedAt: new Date(),
						version: data.version,
					},
				})
			return entity
		})
		if (!result.success) throw result.error
		return result.data
	}

	async delete(id: string, tx?: DrizzleClient): Promise<void> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			await dbc.delete(onboardings).where(eq(onboardings.id, id))
		})
		if (!result.success) throw result.error
	}
}
```

### Step T2.14 — Proposed file (o dublê)

```typescript
// packages/api/typescript/src/ui/repositories/OnboardingRepository/MockOnboardingRepository.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codm/core-typescript'
import { Onboarding } from '../../entities/Onboarding'
import { OnboardingRepository } from './OnboardingRepository'

/** Em memória, chaveado por `ownerId` — a mesma unicidade que o índice do banco garante. */
@injectable()
export class MockOnboardingRepository extends OnboardingRepository {
	readonly rows = new Map<string, Onboarding>()

	async findByOwnerId(ownerId: string, _tx?: Transaction): Promise<Onboarding | undefined> {
		return this.rows.get(ownerId)
	}

	async save(entity: Onboarding, _tx?: Transaction): Promise<Onboarding> {
		entity.incrementVersion()
		this.rows.set(entity.ownerId, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		for (const [ownerId, row] of this.rows) if (row.id === id) this.rows.delete(ownerId)
	}
}
```

### Step T2.15 — Barris do repositório

```typescript
// packages/api/typescript/src/ui/repositories/OnboardingRepository/index.ts — arquivo final COMPLETO
export { OnboardingRepository } from './OnboardingRepository'
export { DrizzleOnboardingRepository } from './DrizzleOnboardingRepository'
export { MockOnboardingRepository } from './MockOnboardingRepository'
```

```typescript
// packages/api/typescript/src/ui/repositories/index.ts — arquivo final COMPLETO (a pasta é nova)
export { OnboardingRepository, DrizzleOnboardingRepository, MockOnboardingRepository } from './OnboardingRepository'
```

### Step T2.16 — Ligue o repositório no registry

Modifique `packages/api/typescript/src/ui/registry.ts`: acrescente
`import { OnboardingRepository, DrizzleOnboardingRepository, MockOnboardingRepository } from './repositories/OnboardingRepository'`
junto dos imports, e a linha
`{ token: OnboardingRepository, mock: MockOnboardingRepository, real: DrizzleOnboardingRepository },`
ao final do array passado a `expandBindings`.

### Step T2.17 — Rode os testes

Run: `cd packages/api/typescript && bun test src/ui/entities/Onboarding.test.ts src/ui/repositories/OnboardingRepository/DrizzleOnboardingRepository.test.ts`
Expected: PASS — 8 testes.

### Step T2.18 — Gates e commit

Run: `bun run --cwd packages/contracts db:check-go && cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`
Expected: 0 erros.

```bash
git add packages/contracts/db/schema/owner.ts \
        packages/contracts/db/schema/migrations/ \
        packages/api/go/ \
        packages/api/typescript/src/ui/entities/ \
        packages/api/typescript/src/ui/repositories/ \
        packages/api/typescript/src/ui/registry.ts
git commit -m "feat(ui): agregado Onboarding — a jornada persistida por operador (ONB-1 Task T2)"
```

---

## Task T3: O console pergunta uma vez e recebe a história inteira

**Files to write:**
- Create: `packages/api/typescript/src/ui/usecases/GetOnboarding.ts`
- Create: `packages/api/typescript/src/ui/usecases/GetOnboarding.test.ts`
- Create: `packages/api/typescript/src/ui/controllers/GetOnboarding.ts`
- Modify: `packages/api/typescript/src/ui/usecases/index.ts` — exporta `GetOnboarding` e seus schemas
- Modify: `packages/api/typescript/src/ui/controllers/index.ts` — exporta `GetOnboardingController`

**Files to read:**
- `packages/api/typescript/src/ui/usecases/GetSetupChecklist.ts`
- `packages/api/typescript/src/ui/controllers/GetSetupChecklist.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query, /controller, /schema
**Depends on:** T2
**Consumes (frozen):** de T1 — `OnboardingStep` de `@codm/contracts-typescript/wire/enums`. De T2 — a classe `Onboarding` de `../entities/Onboarding` e a abstrata `OnboardingRepository` de `../repositories/OnboardingRepository` (método `findByOwnerId(ownerId, tx?)`). Esta Task CONGELA para T4–T6: a rota `GET /ui/onboarding`, o `GetOnboardingOutputSchema` com os campos `currentStep`, `completedAt`, `channelDone`, `workspaceDone`, `threadDone`, e o hook SDK que T6 vai gerar como `useGetOnboarding`.
**Scope fence:** DONE elsewhere — entidade, repositório e tabela (T2); o enum (T1). OUT — NÃO delete o `GetSetupChecklist` nesta Task (T4 faz isso, junto com todos os seus consumidores); NÃO crie middleware (T5); nada em `packages/app/`.
**Gate:** `cd packages/api/typescript && bun test src/ui/usecases/GetOnboarding.test.ts` verde e `bun x tsc -p tsconfig.build.json --noEmit` com 0 erros.

### Step T3.1 — Escreva o teste da leitura (falhando)

```typescript
// packages/api/typescript/src/ui/usecases/GetOnboarding.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { OnboardingStep } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenAttachedThread } from '@test/support'
import { Onboarding } from '../entities/Onboarding'
import { OnboardingRepository } from '../repositories/OnboardingRepository'
import { GetOnboarding } from './GetOnboarding'

const OWNER = 'integration-tenant'

/**
 * UMA LEITURA, DUAS NATUREZAS DE DADO — e é isso que os casos abaixo separam.
 *
 * `currentStep`/`completedAt` são JORNADA: persistidos, só mudam quando alguém os escreve.
 * `channelDone`/`workspaceDone`/`threadDone` são MUNDO: derivados por consulta de existência a cada
 * chamada, nunca gravados. Um passo de setup que fosse persistido mentiria assim que a linha que o
 * satisfazia sumisse — que é exatamente o que a AC-9 prova.
 */
describe('GetOnboarding', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let usecase: GetOnboarding
	let repo: OnboardingRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
		usecase = testBed.resolve(GetOnboarding)
		repo = testBed.resolve(OnboardingRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('para um dono que nunca começou: nada concluído, primeiro passo, nada satisfeito', async () => {
		const result = await usecase.execute({ ownerId: OWNER })

		expect(result.completedAt).toBeNull()
		expect(result.currentStep).toBe(OnboardingStep.VALUE)
		expect(result.channelDone).toBe(false)
		expect(result.workspaceDone).toBe(false)
		expect(result.threadDone).toBe(false)
	})

	it('devolve a jornada que foi persistida', async () => {
		const onboarding = Onboarding.create({ ownerId: OWNER })
		onboarding.advanceTo(OnboardingStep.CHANNEL)
		await repo.save(onboarding)

		const result = await usecase.execute({ ownerId: OWNER })

		expect(result.currentStep).toBe(OnboardingStep.CHANNEL)
		expect(result.completedAt).toBeNull()
	})

	it('reporta os três derivados quando o setup está feito', async () => {
		await givenAttachedThread(testBed)

		const result = await usecase.execute({ ownerId: OWNER })

		expect(result.channelDone).toBe(true)
		expect(result.workspaceDone).toBe(true)
		expect(result.threadDone).toBe(true)
	})
})
```

### Step T3.2 — Rode o teste para vê-lo falhar

Run: `cd packages/api/typescript && bun test src/ui/usecases/GetOnboarding.test.ts`
Expected: FAIL com `Cannot find module './GetOnboarding'`.

> Se o helper `givenAttachedThread` não estiver exportado de `@test/support` com essa assinatura, use os helpers que estiverem — o objetivo do caso é ter um canal `CONNECTED`, um workspace e uma thread viva para o mesmo `ownerId`. Confira `packages/api/typescript/tests/support/given/index.ts` antes de escrever o caso.

### Step T3.3 — Scaffold da leitura e do controller

```bash
bun cli query GetOnboarding
bun cli controller ui GetOnboarding
```

### Step T3.4 — Proposed file (o use case)

```typescript
// packages/api/typescript/src/ui/usecases/GetOnboarding.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { and, eq, isNull } from 'drizzle-orm'
import { DrizzleClient, Handler, z } from '@codm/core-typescript'
import { channels, workspaces, threads } from '@codm/contracts/db'
import { ChannelStatus, OnboardingStep } from '@codm/contracts-typescript/wire/enums'
import { OnboardingRepository } from '../repositories/OnboardingRepository'

export const GetOnboardingInputSchema = z.object({ ownerId: z.uuid() })
export const GetOnboardingOutputSchema = z.object({
	currentStep: z.enum(OnboardingStep),
	completedAt: z.iso.datetime().nullable(),
	channelDone: z.boolean(),
	workspaceDone: z.boolean(),
	threadDone: z.boolean(),
})

/**
 * A LEITURA ÚNICA do onboarding — a que substituiu o `setup-checklist` (spec Decision 9). Antes, o
 * produto contava a história em dois lugares que não se conheciam: `/onboarding` era apresentação
 * sem estado, e o painel do dashboard tinha o progresso derivado. Uma história, um endpoint.
 *
 * Devolve dado de DUAS naturezas, e a diferença é o ponto:
 *   · `currentStep` / `completedAt` — JORNADA, lida do agregado. Só muda quando alguém escreve.
 *   · `channelDone` / `workspaceDone` / `threadDone` — MUNDO, derivado por consulta de existência a
 *     cada chamada. Nunca persistido: apagar o único canal desfaz o passo (spec AC-9), e é assim que
 *     tem de ser, porque o passo pergunta "existe um canal conectado?", não "você já passou por aqui".
 *
 * Um dono que nunca começou não tem linha, e isso NÃO é um erro — é o primeiro passo, não concluído.
 * Criar a linha na leitura seria escrever num GET; ela nasce no primeiro `SaveOnboardingStep`.
 */
@injectable()
export class GetOnboarding extends Handler<typeof GetOnboardingInputSchema, typeof GetOnboardingOutputSchema> {
	readonly name = 'get_onboarding' as const
	readonly inputSchema = GetOnboardingInputSchema
	readonly outputSchema = GetOnboardingOutputSchema

	constructor(
		private readonly db: DrizzleClient,
		private readonly onboardingRepo: OnboardingRepository,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const [onboarding, connectedChannels, ownerWorkspaces, ownerThreads] = await Promise.all([
			this.onboardingRepo.findByOwnerId(input.ownerId),
			this.db
				.select({ id: channels.id })
				.from(channels)
				.where(and(eq(channels.ownerId, input.ownerId), eq(channels.status, ChannelStatus.CONNECTED)))
				.limit(1),
			this.db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerId, input.ownerId)).limit(1),
			// Uma thread apagada não conta (thread-deletion spec, decision 5): apagar a última conversa
			// devolve o passo ao estado anterior, em vez de deixá-lo marcado por uma linha que mais
			// nada no console enxerga.
			this.db
				.select({ id: threads.id })
				.from(threads)
				.where(and(eq(threads.ownerId, input.ownerId), isNull(threads.deletedAt)))
				.limit(1),
		])

		return {
			currentStep: onboarding?.currentStep ?? OnboardingStep.VALUE,
			completedAt: onboarding?.completedAt?.toISOString() ?? null,
			channelDone: connectedChannels.length > 0,
			workspaceDone: ownerWorkspaces.length > 0,
			threadDone: ownerThreads.length > 0,
		}
	}
}
```

### Step T3.5 — Proposed file (o controller)

```typescript
// packages/api/typescript/src/ui/controllers/GetOnboarding.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetOnboarding, GetOnboardingOutputSchema } from '../usecases/GetOnboarding'

export const GetOnboardingControllerInputSchema = z
	.object({ ctx: z.object({ ownerId: z.uuid() }) })
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' } }])
export const GetOnboardingControllerOutputSchema = GetOnboardingOutputSchema

@injectable()
export class GetOnboardingController extends Controller<
	typeof GetOnboardingControllerInputSchema,
	typeof GetOnboardingControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system]
	readonly path = '/ui/onboarding'
	readonly method = 'get' as const
	readonly description = 'Onboarding — jornada persistida (currentStep/completedAt) + satisfação derivada dos passos de setup'
	readonly inputSchema = GetOnboardingControllerInputSchema
	readonly outputSchema = GetOnboardingControllerOutputSchema

	/**
	 * SEM `OnboardingMiddleware` — de propósito, e é a metade da spec Decision 10 que impede o beco
	 * sem saída: é justamente esta leitura que o wizard faz enquanto o onboarding NÃO está concluído.
	 * Barrá-la seria exigir a conclusão para poder descobrir o que falta concluir.
	 */
	override middlewares = [OperatorMiddleware]

	constructor(private query: GetOnboarding) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId })
		return { status: HttpStatusCode.OK, data }
	}
}
```

### Step T3.6 — Barris

Modifique `packages/api/typescript/src/ui/usecases/index.ts`: acrescente
`export { GetOnboarding, GetOnboardingInputSchema, GetOnboardingOutputSchema } from './GetOnboarding'`.

Modifique `packages/api/typescript/src/ui/controllers/index.ts`: acrescente
`export { GetOnboardingController } from './GetOnboarding'`.

### Step T3.7 — Rode o teste

Run: `cd packages/api/typescript && bun test src/ui/usecases/GetOnboarding.test.ts`
Expected: PASS — 3 testes.

### Step T3.8 — Type check e commit

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`
Expected: 0 erros.

```bash
git add packages/api/typescript/src/ui/usecases/GetOnboarding.ts \
        packages/api/typescript/src/ui/usecases/GetOnboarding.test.ts \
        packages/api/typescript/src/ui/controllers/GetOnboarding.ts \
        packages/api/typescript/src/ui/usecases/index.ts \
        packages/api/typescript/src/ui/controllers/index.ts
git commit -m "feat(ui): GET /ui/onboarding — a leitura única (ONB-1 Task T3)"
```

---

## Task T4: O operador conclui, e a conclusão fica

**Files to write:**
- Create: `packages/api/typescript/src/ui/usecases/CompleteOnboarding.ts`
- Create: `packages/api/typescript/src/ui/usecases/CompleteOnboarding.test.ts`
- Create: `packages/api/typescript/src/ui/usecases/SaveOnboardingStep.ts`
- Create: `packages/api/typescript/src/ui/controllers/CompleteOnboarding.ts`
- Create: `packages/api/typescript/src/ui/controllers/SaveOnboardingStep.ts`
- Modify: `packages/api/typescript/src/ui/usecases/index.ts` — exporta os dois comandos
- Modify: `packages/api/typescript/src/ui/controllers/index.ts` — exporta os dois controllers

**Files to read:**
- `packages/api/typescript/src/owner/usecases/UpdateOwnerSettings.ts`
- `packages/api/typescript/src/owner/controllers/UpdateOwnerSettings.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller, /schema
**Depends on:** T3
**Consumes (frozen):** de T1 — `OnboardingStep`. De T2 — `Onboarding` (`static create({ ownerId })`, `advanceTo(step)`, `complete()`, `isCompleted()`) e `OnboardingRepository` (`findByOwnerId`, `save`). De T3 — nada em código, mas a rota `/ui/onboarding` já existe e estes controllers ficam ao lado dela. Esta Task CONGELA para T6: as rotas `POST /ui/onboarding/complete` e `PATCH /ui/onboarding/step`.
**Scope fence:** DONE elsewhere — entidade, repositório, leitura (T2/T3). OUT — NÃO crie o middleware (T5); NÃO delete o `GetSetupChecklist` (T5); nada em `packages/app/`.
**Gate:** `cd packages/api/typescript && bun test src/ui/usecases/CompleteOnboarding.test.ts` verde e `bun x tsc -p tsconfig.build.json --noEmit` com 0 erros.

### Step T4.1 — Escreva o teste dos comandos (falhando)

```typescript
// packages/api/typescript/src/ui/usecases/CompleteOnboarding.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { OnboardingStep } from '@codm/contracts-typescript/wire/enums'
import { TestBed } from '@test/support'
import { OnboardingRepository } from '../repositories/OnboardingRepository'
import { CompleteOnboarding } from './CompleteOnboarding'
import { SaveOnboardingStep } from './SaveOnboardingStep'

const OWNER = 'integration-tenant'

/**
 * OS DOIS ÚNICOS CAMINHOS DE ESCRITA do onboarding, e ambos criam a linha se ela ainda não existe —
 * é assim que um operador que nunca abriu o wizard passa a ter progresso sem nenhum passo de
 * "inicializar" separado.
 *
 * Nenhum dos dois pergunta nada sobre passos de setup: a spec (Decision 13) bloqueia a conclusão
 * apenas por passo REQUIRED, nenhum passo de hoje é REQUIRED, e a decisão de deixar concluir vive no
 * console. Do lado do servidor, concluir é sempre possível — e a AC-8 é isso.
 */
describe('CompleteOnboarding / SaveOnboardingStep', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let complete: CompleteOnboarding
	let saveStep: SaveOnboardingStep
	let repo: OnboardingRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
		complete = testBed.resolve(CompleteOnboarding)
		saveStep = testBed.resolve(SaveOnboardingStep)
		repo = testBed.resolve(OnboardingRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	/** AC-2. */
	it('AC-2: concluir grava completedAt para aquele ownerId', async () => {
		await complete.execute({ ownerId: OWNER })

		const saved = await repo.findByOwnerId(OWNER)
		expect(saved?.isCompleted()).toBe(true)
		expect(saved?.currentStep).toBe(OnboardingStep.FINAL)
	})

	/** AC-8 — nenhum passo de setup satisfeito, e concluir mesmo assim funciona. */
	it('AC-8: concluir funciona com todo o setup por fazer', async () => {
		await complete.execute({ ownerId: OWNER })

		expect((await repo.findByOwnerId(OWNER))?.isCompleted()).toBe(true)
	})

	it('salvar o passo cria a linha na primeira vez e a atualiza depois', async () => {
		await saveStep.execute({ ownerId: OWNER, step: OnboardingStep.CHANNEL })
		expect((await repo.findByOwnerId(OWNER))?.currentStep).toBe(OnboardingStep.CHANNEL)

		await saveStep.execute({ ownerId: OWNER, step: OnboardingStep.AGENTS })
		expect((await repo.findByOwnerId(OWNER))?.currentStep).toBe(OnboardingStep.AGENTS)
	})

	it('concluir duas vezes não remarca a data', async () => {
		await complete.execute({ ownerId: OWNER })
		const first = (await repo.findByOwnerId(OWNER))?.completedAt

		await complete.execute({ ownerId: OWNER })

		expect((await repo.findByOwnerId(OWNER))?.completedAt).toEqual(first)
	})
})
```

### Step T4.2 — Rode o teste para vê-lo falhar

Run: `cd packages/api/typescript && bun test src/ui/usecases/CompleteOnboarding.test.ts`
Expected: FAIL com `Cannot find module './CompleteOnboarding'`.

### Step T4.3 — Scaffold dos comandos

```bash
bun cli usecase ui CompleteOnboarding
bun cli usecase ui SaveOnboardingStep
bun cli controller ui CompleteOnboarding
bun cli controller ui SaveOnboardingStep
```

### Step T4.4 — Proposed file (CompleteOnboarding)

```typescript
// packages/api/typescript/src/ui/usecases/CompleteOnboarding.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { Onboarding } from '../entities/Onboarding'
import { OnboardingRepository } from '../repositories/OnboardingRepository'

export const CompleteOnboardingInputSchema = z.object({ ownerId: z.uuid() })
export const CompleteOnboardingOutputSchema = z.void()

/**
 * O fim do wizard. Grava `completedAt`, que é o ÚNICO fato que destranca a API (spec Decision 10).
 *
 * NÃO verifica passo nenhum antes de concluir, e isso é a decisão e não um esquecimento: a spec
 * bloqueia a conclusão apenas por passo `REQUIRED` (Decision 13), nenhum passo de hoje é `REQUIRED`,
 * e a lista de passos que o operador vê é composta no console — que conhece as pendências do host,
 * coisa que este lado nunca conhece. Um servidor validando essa lista estaria opinando sobre o que
 * não enxerga.
 *
 * Cria a linha se ela não existir: quem clica em concluir pode nunca ter salvo passo nenhum.
 */
@injectable()
export class CompleteOnboarding extends Handler<typeof CompleteOnboardingInputSchema, typeof CompleteOnboardingOutputSchema> {
	readonly name = 'complete_onboarding' as const
	readonly inputSchema = CompleteOnboardingInputSchema
	readonly outputSchema = CompleteOnboardingOutputSchema

	constructor(private readonly onboardingRepo: OnboardingRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const onboarding = (await this.onboardingRepo.findByOwnerId(input.ownerId, tx)) ?? Onboarding.create({ ownerId: input.ownerId })

			onboarding.complete()

			await this.onboardingRepo.save(onboarding, tx)
		})
	}
}
```

### Step T4.5 — Proposed file (SaveOnboardingStep)

```typescript
// packages/api/typescript/src/ui/usecases/SaveOnboardingStep.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { OnboardingStep } from '@codm/contracts-typescript/wire/enums'
import { Onboarding } from '../entities/Onboarding'
import { OnboardingRepository } from '../repositories/OnboardingRepository'

export const SaveOnboardingStepInputSchema = z.object({
	ownerId: z.uuid(),
	step: z.enum(OnboardingStep),
})
export const SaveOnboardingStepOutputSchema = z.void()

/**
 * Onde o operador parou, para que fechar o app não o devolva ao primeiro slide.
 *
 * O servidor guarda o passo que o cliente reporta e não valida transição: a ORDEM dos passos é
 * composta no console (spec Decision 4) e depende das pendências do host, que este lado não vê.
 * Uma tabela de transições aqui rejeitaria saltos legítimos — como pular direto para o último passo
 * quando não há pendência nenhuma.
 */
@injectable()
export class SaveOnboardingStep extends Handler<typeof SaveOnboardingStepInputSchema, typeof SaveOnboardingStepOutputSchema> {
	readonly name = 'save_onboarding_step' as const
	readonly inputSchema = SaveOnboardingStepInputSchema
	readonly outputSchema = SaveOnboardingStepOutputSchema

	constructor(private readonly onboardingRepo: OnboardingRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const onboarding = (await this.onboardingRepo.findByOwnerId(input.ownerId, tx)) ?? Onboarding.create({ ownerId: input.ownerId })

			onboarding.advanceTo(input.step)

			await this.onboardingRepo.save(onboarding, tx)
		})
	}
}
```

### Step T4.6 — Proposed file (controller de conclusão)

```typescript
// packages/api/typescript/src/ui/controllers/CompleteOnboarding.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { CompleteOnboarding } from '../usecases/CompleteOnboarding'

export const CompleteOnboardingControllerInputSchema = z
	.object({ ctx: z.object({ ownerId: z.uuid() }) })
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' } }])
export const CompleteOnboardingControllerOutputSchema = z.void()

@injectable()
export class CompleteOnboardingController extends Controller<
	typeof CompleteOnboardingControllerInputSchema,
	typeof CompleteOnboardingControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system]
	readonly path = '/ui/onboarding/complete'
	readonly method = 'post' as const
	readonly description = 'Conclui o onboarding do operador — grava completedAt'
	readonly inputSchema = CompleteOnboardingControllerInputSchema
	readonly outputSchema = CompleteOnboardingControllerOutputSchema

	/** SEM `OnboardingMiddleware`: exigir onboarding concluído para poder concluí-lo seria um laço. */
	override middlewares = [OperatorMiddleware]

	constructor(private completeOnboarding: CompleteOnboarding) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		await this.completeOnboarding.execute({ ownerId: request.ctx.ownerId })
		return { status: HttpStatusCode.NO_CONTENT }
	}
}
```

### Step T4.7 — Proposed file (controller de passo)

```typescript
// packages/api/typescript/src/ui/controllers/SaveOnboardingStep.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { SaveOnboardingStep, SaveOnboardingStepInputSchema } from '../usecases/SaveOnboardingStep'

export const SaveOnboardingStepControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		// ownerId vem do ctx — fora da superfície HTTP.
		body: SaveOnboardingStepInputSchema.omit({ ownerId: true }),
	})
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, body: { step: 'CHANNEL' } }])
export const SaveOnboardingStepControllerOutputSchema = z.void()

@injectable()
export class SaveOnboardingStepController extends Controller<
	typeof SaveOnboardingStepControllerInputSchema,
	typeof SaveOnboardingStepControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system]
	readonly path = '/ui/onboarding/step'
	readonly method = 'patch' as const
	readonly description = 'Salva onde o operador parou no wizard'
	readonly inputSchema = SaveOnboardingStepControllerInputSchema
	readonly outputSchema = SaveOnboardingStepControllerOutputSchema

	/** SEM `OnboardingMiddleware`: o wizard escreve isto ENQUANTO o onboarding não está concluído. */
	override middlewares = [OperatorMiddleware]

	constructor(private saveOnboardingStep: SaveOnboardingStep) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		await this.saveOnboardingStep.execute({ ownerId: request.ctx.ownerId, step: request.body.step })
		return { status: HttpStatusCode.NO_CONTENT }
	}
}
```

### Step T4.8 — Barris

Modifique `packages/api/typescript/src/ui/usecases/index.ts`: acrescente
`export { CompleteOnboarding, CompleteOnboardingInputSchema, CompleteOnboardingOutputSchema } from './CompleteOnboarding'` e
`export { SaveOnboardingStep, SaveOnboardingStepInputSchema, SaveOnboardingStepOutputSchema } from './SaveOnboardingStep'`.

Modifique `packages/api/typescript/src/ui/controllers/index.ts`: acrescente
`export { CompleteOnboardingController } from './CompleteOnboarding'` e
`export { SaveOnboardingStepController } from './SaveOnboardingStep'`.

### Step T4.9 — Rode o teste

Run: `cd packages/api/typescript && bun test src/ui/usecases/CompleteOnboarding.test.ts`
Expected: PASS — 4 testes.

### Step T4.10 — Type check e commit

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`
Expected: 0 erros.

```bash
git add packages/api/typescript/src/ui/usecases/CompleteOnboarding.ts \
        packages/api/typescript/src/ui/usecases/CompleteOnboarding.test.ts \
        packages/api/typescript/src/ui/usecases/SaveOnboardingStep.ts \
        packages/api/typescript/src/ui/controllers/CompleteOnboarding.ts \
        packages/api/typescript/src/ui/controllers/SaveOnboardingStep.ts \
        packages/api/typescript/src/ui/usecases/index.ts \
        packages/api/typescript/src/ui/controllers/index.ts
git commit -m "feat(ui): concluir e salvar passo — os dois caminhos de escrita do onboarding (ONB-1 Task T4)"
```

---

## Task T5: Sem onboarding concluído, o console não abre

**Files to write:**
- Create: `packages/api/typescript/src/ui/middlewares/OnboardingMiddleware.ts`
- Create: `packages/api/typescript/src/ui/middlewares/OnboardingMiddleware.test.ts`
- Create: `packages/api/typescript/src/ui/middlewares/index.ts`
- Modify: `packages/api/typescript/src/ui/errors/index.ts` — `UiApplicationErrors` ganha `ONBOARDING_NOT_COMPLETED` e o `registerErrorCodes` ganha o mapeamento para `FORBIDDEN`
- Modify: `packages/api/typescript/src/ui/controllers/GetHomeDashboard.ts` — acrescenta `OnboardingMiddleware` ao `override middlewares`
- Delete: `packages/api/typescript/src/ui/usecases/GetSetupChecklist.ts`
- Delete: `packages/api/typescript/src/ui/controllers/GetSetupChecklist.ts`
- Modify: `packages/api/typescript/src/ui/usecases/index.ts` — remove o export de `GetSetupChecklist`
- Modify: `packages/api/typescript/src/ui/controllers/index.ts` — remove o export de `GetSetupChecklistController`
- Modify: `packages/api/typescript/src/ui/usecases/BffReads.test.ts` — remove os casos de `GetSetupChecklist`
- Modify: `packages/api/typescript/src/thread/usecases/DeletedThreadReads.test.ts` — repõe o caso sobre `GetOnboarding`
- Modify: `packages/api/typescript/tests/architecture/__snapshots__/mcp-exposure.test.ts.snap` — regenerado

**Files to read:**
- `packages/api/typescript/src/auth/middlewares/OperatorMiddleware.ts`
- `packages/api/typescript/src/ui/errors/index.ts`
- `packages/api/typescript/src/owner/errors/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /middleware, /errors, /test
**Depends on:** T4
**Consumes (frozen):** de T2 — `OnboardingRepository` (`findByOwnerId`). De T3 — o use case `GetOnboarding` de `../usecases/GetOnboarding` (usado no teste repontado de `DeletedThreadReads.test.ts`), com saída contendo `channelDone`/`workspaceDone`/`threadDone`. Esta Task CONGELA para T6: o código de erro `ONBOARDING_NOT_COMPLETED` e o fato de `GetSetupChecklist` não existir mais.
**Scope fence:** DONE elsewhere — entidade/repositório (T2), leitura (T3), comandos (T4). OUT — nada em `packages/app/` (T6 migra o console); NÃO acrescente o middleware a nenhum controller além do `GetHomeDashboard` (decisão do founder: o mínimo que prova a AC-1); NÃO toque nos controllers de `/ui/onboarding*`, que ficam deliberadamente sem o middleware.
**Gate:** `cd packages/api/typescript && bun test` verde (a contagem CAI, porque casos de `GetSetupChecklist` foram removidos — explique a queda no corpo do commit) e `bun x tsc -p tsconfig.build.json --noEmit` com 0 erros.

### Step T5.1 — Escreva o teste do middleware (falhando)

```typescript
// packages/api/typescript/src/ui/middlewares/OnboardingMiddleware.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { BaseError } from '@codm/core-typescript'
import { TestBed } from '@test/support'
import { OnboardingRepository } from '../repositories/OnboardingRepository'
import { Onboarding } from '../entities/Onboarding'
import { OnboardingMiddleware } from './OnboardingMiddleware'

const OWNER = 'integration-tenant'

/**
 * O PORTÃO, e o falseador dele: com a implementação desligada estes dois casos não podem passar ao
 * mesmo tempo — um exige recusa, o outro exige passagem, e os dois olham o MESMO estado exceto pelo
 * `completedAt`.
 */
describe('OnboardingMiddleware', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let middleware: OnboardingMiddleware
	let repo: OnboardingRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
		middleware = testBed.resolve(OnboardingMiddleware)
		repo = testBed.resolve(OnboardingRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	/** AC-1 — sem onboarding nenhum. */
	it('AC-1: recusa quando o operador nunca começou', async () => {
		const request = { ctx: { ownerId: OWNER } } as never

		expect(middleware.execute(request)).rejects.toThrow(BaseError)
	})

	/** AC-1 — começou mas não concluiu. */
	it('AC-1: recusa quando começou e não concluiu', async () => {
		await repo.save(Onboarding.create({ ownerId: OWNER }))
		const request = { ctx: { ownerId: OWNER } } as never

		expect(middleware.execute(request)).rejects.toThrow(BaseError)
	})

	/** AC-2 — concluído, passa. */
	it('AC-2: deixa passar depois de concluído', async () => {
		const onboarding = Onboarding.create({ ownerId: OWNER })
		onboarding.complete()
		await repo.save(onboarding)
		const request = { ctx: { ownerId: OWNER } } as never

		expect(await middleware.execute(request)).toEqual({})
	})
})
```

### Step T5.2 — Rode o teste para vê-lo falhar

Run: `cd packages/api/typescript && bun test src/ui/middlewares/OnboardingMiddleware.test.ts`
Expected: FAIL com `Cannot find module './OnboardingMiddleware'`.

### Step T5.3 — Acrescente o código de erro

Modifique `packages/api/typescript/src/ui/errors/index.ts`: mude
`export type UiApplicationErrors = 'CONTACT_AVATAR_NOT_FOUND'` para
`export type UiApplicationErrors = 'CONTACT_AVATAR_NOT_FOUND' | 'ONBOARDING_NOT_COMPLETED'`, e acrescente
`ONBOARDING_NOT_COMPLETED: HttpStatusCode.FORBIDDEN,` ao objeto passado a `registerErrorCodes`.

### Step T5.4 — Scaffold do middleware

```bash
bun cli middleware ui Onboarding
```

### Step T5.5 — Proposed file (o middleware)

```typescript
// packages/api/typescript/src/ui/middlewares/OnboardingMiddleware.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { BaseError, z } from '@codm/core-typescript'
import type { HttpControllerRequest, HttpMiddlewareResponse, Middleware } from '@codm/core-typescript'
import { OnboardingRepository } from '../repositories/OnboardingRepository'
import type { ApplicationErrors } from '../errors'

const CtxSchema = z.object({ ownerId: z.string().min(1) })

/**
 * O PORTÃO DE ENTRADA — o único efeito que `completedAt` tem sobre a API (spec Decision 10).
 *
 * É declarado POR CONTROLLER, nunca global, e essa é a metade da decisão que impede um beco sem
 * saída: os controllers de `/ui/onboarding*` e os que os passos de setup chamam (conectar canal,
 * criar workspace, vincular thread) NÃO o declaram, porque são justamente o que o operador precisa
 * executar ANTES de existir um `completedAt`. Barrá-los seria exigir a conclusão para poder concluir.
 *
 * Barrar a entrada uma vez é o modelo do Setup Assistant do macOS; o que NÃO se barra é a capacidade
 * depois, que fica a cargo de cada tela.
 */
@injectable()
export class OnboardingMiddleware implements Middleware {
	constructor(private readonly onboardingRepo: OnboardingRepository) {}

	async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
		const ctx = CtxSchema.safeParse(request.ctx)
		if (!ctx.success) throw new BaseError<ApplicationErrors>('ONBOARDING_NOT_COMPLETED')

		const onboarding = await this.onboardingRepo.findByOwnerId(ctx.data.ownerId)
		if (!onboarding?.isCompleted()) throw new BaseError<ApplicationErrors>('ONBOARDING_NOT_COMPLETED')

		return {}
	}
}
```

### Step T5.6 — Barril dos middlewares

```typescript
// packages/api/typescript/src/ui/middlewares/index.ts — arquivo final COMPLETO (a pasta é nova)
export { OnboardingMiddleware } from './OnboardingMiddleware'
```

### Step T5.7 — Aplique o middleware ao dashboard

Modifique `packages/api/typescript/src/ui/controllers/GetHomeDashboard.ts`: acrescente
`import { OnboardingMiddleware } from '../middlewares'` junto dos imports, e mude a linha
`override middlewares = [OperatorMiddleware]` para
`override middlewares = [OperatorMiddleware, OnboardingMiddleware]`.

### Step T5.8 — Rode o teste do middleware

Run: `cd packages/api/typescript && bun test src/ui/middlewares/OnboardingMiddleware.test.ts`
Expected: PASS — 3 testes.

### Step T5.9 — Mate o GetSetupChecklist e seus consumidores

Apague `packages/api/typescript/src/ui/usecases/GetSetupChecklist.ts` e
`packages/api/typescript/src/ui/controllers/GetSetupChecklist.ts`.

Modifique `packages/api/typescript/src/ui/usecases/index.ts`: remova a linha
`export { GetSetupChecklist, GetSetupChecklistInputSchema, GetSetupChecklistOutputSchema } from './GetSetupChecklist'`.

Modifique `packages/api/typescript/src/ui/controllers/index.ts`: remova a linha
`export { GetSetupChecklistController } from './GetSetupChecklist'`.

Modifique `packages/api/typescript/src/ui/usecases/BffReads.test.ts`: remova o import de
`GetSetupChecklist` e os casos que o exercitam. Não substitua por casos novos — `GetOnboarding` já
tem os seus próprios em `GetOnboarding.test.ts`.

Modifique `packages/api/typescript/src/thread/usecases/DeletedThreadReads.test.ts`: troque o import
de `GetSetupChecklist` por `GetOnboarding` (de `@ui/usecases`), resolva `GetOnboarding` no lugar, e
mantenha a asserção existente — apagar a última thread continua devolvendo `threadDone: false`, agora
lido do campo homônimo da leitura unificada. A intenção do caso não muda: só a leitura que ele
consulta.

### Step T5.10 — Regenere o snapshot de exposição MCP (AC-21)

Run: `cd packages/api/typescript && bun test tests/architecture/mcp-exposure.test.ts --update-snapshots`
Then: `grep -n "GetSetupChecklist\|GetOnboarding\|CompleteOnboarding\|SaveOnboardingStep" tests/architecture/__snapshots__/mcp-exposure.test.ts.snap`

Expected: `mcp__codm__GetSetupChecklist` SUMIU; aparecem `mcp__codm__GetOnboarding`,
`mcp__codm__CompleteOnboarding` e `mcp__codm__SaveOnboardingStep`.

### Step T5.11 — Suíte inteira e commit

Run: `cd packages/api/typescript && bun test`
Expected: verde. A contagem total CAI em relação ao baseline — os casos de `GetSetupChecklist` em
`BffReads.test.ts` foram removidos, e os novos vivem em `GetOnboarding.test.ts`,
`CompleteOnboarding.test.ts`, `Onboarding.test.ts`, `DrizzleOnboardingRepository.test.ts` e
`OnboardingMiddleware.test.ts`. Registre a queda e o motivo no corpo do commit.

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`
Expected: 0 erros.

```bash
git add packages/api/typescript/src/ui/middlewares/ \
        packages/api/typescript/src/ui/errors/index.ts \
        packages/api/typescript/src/ui/controllers/ \
        packages/api/typescript/src/ui/usecases/ \
        packages/api/typescript/src/thread/usecases/DeletedThreadReads.test.ts \
        packages/api/typescript/tests/architecture/__snapshots__/mcp-exposure.test.ts.snap
git commit -m "feat(ui): OnboardingMiddleware barra o dashboard; GetSetupChecklist morre (ONB-1 Task T5)"
```

---

## Task T6: Contract Lock — o console passa a ler a história única

**Files to write:**
- Regen: `packages/api/typescript/public/docs/openapi.json`
- Regen: `packages/client/dist/**`
- Modify: `packages/app/react/src/routes/(app)/dashboard/-components/HomeSection/index.tsx` — troca `useGetSetupChecklist` por `useGetOnboarding` e repõe a fiação de analytics
- Modify: `packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx` — passa a tipar contra a resposta nova
- Modify: `packages/app/react/src/services/AnalyticsService/AnalyticsService.ts` — atualiza o docblock que cita o hook antigo pelo nome

**Files to read:**
- `packages/app/react/src/routes/(app)/dashboard/-components/HomeSection/index.tsx`
- `packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /sdk, /component
**Depends on:** T5
**Consumes (frozen):** de T3/T4, via SDK regenerado — o hook `useGetOnboarding` de `@codm/client-typescript/typescript` e o tipo `GetOnboardingQueryResponse` com os campos `currentStep`, `completedAt`, `channelDone`, `workspaceDone`, `threadDone`. `useGetSetupChecklist` e `GetSetupChecklistQueryResponse` NÃO existem mais — este é o motivo de esta Task existir.
**Scope fence:** DONE elsewhere — todo o backend (T1–T5). OUT — NÃO toque em `routes/onboarding/` (o wizard é a frente ONB-3), NÃO renomeie nada de `Precondition*` (ONB-2), NÃO crie a guarda de UI (ONB-3). Esta Task só repõe os DOIS consumidores que o endpoint morto deixou órfãos.
**Gate:** `bun tsc` com 0 erros em todos os workspaces, `cd packages/app/react && bun test` verde, e `bun lint` limpo.

### Step T6.1 — Regenere OpenAPI e SDK

```bash
bun emit-openapi && bun sdk
```

### Step T6.2 — Verifique o que a regeneração produziu

```bash
git diff --stat packages/client/dist/ packages/api/typescript/public/docs/openapi.json
grep -rn "useGetOnboarding\|useGetSetupChecklist" packages/client/dist/typescript/src/typescript/hooks/ | head
```

Expected: `useGetOnboarding`, `useCompleteOnboarding` e `useSaveOnboardingStep` existem;
`useGetSetupChecklist` NÃO aparece mais em nenhum arquivo gerado.

> `bun sdk` (kubb) é incremental. Se `useGetSetupChecklist` sobreviver ao regen, force uma
> regeneração limpa apagando o diretório gerado do hook e rodando `bun sdk` de novo — o SDK não pode
> exportar um hook cujo endpoint não existe.

### Step T6.3 — Confirme o tsc quebrando nos dois consumidores

Run: `cd packages/app/react && bun x tsc --noEmit`
Expected: FAIL — erros em `HomeSection/index.tsx` e `SetupChecklist/index.tsx`, que importam o hook e
o tipo que acabaram de sumir. É exatamente o que os próximos passos consertam.

### Step T6.4 — Proposed file (HomeSection)

```typescript
// packages/app/react/src/routes/(app)/dashboard/-components/HomeSection/index.tsx — arquivo final
// COMPLETO. Preserve TODO o restante do componente como está hoje; o que muda é a origem do dado
// (useGetOnboarding no lugar de useGetSetupChecklist) e o objeto passado a setPersonProperties, que
// tem de continuar carregando as MESMAS três propriedades — perder uma é perder um funil de
// ativação no PostHog (spec AC-22).
//
// O executor deve abrir o arquivo atual, trocar:
//   · o import `useGetSetupChecklist` → `useGetOnboarding` (mesmo módulo, '@codm/client-typescript/typescript')
//   · a chamada `useGetSetupChecklist()` → `useGetOnboarding()`
//   · nada mais: `data.channelDone` / `data.workspaceDone` / `data.threadDone` têm o mesmo nome na
//     resposta nova, então o corpo de `setPersonProperties` e o `<SetupChecklist checklist={data} />`
//     continuam válidos por construção.
```

### Step T6.5 — Proposed file (SetupChecklist)

```typescript
// packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx — arquivo final
// COMPLETO. Uma única troca de tipo; o corpo do componente não muda, porque os três campos que ele
// lê mantiveram o nome.
//
// O executor deve trocar:
//   · `import type { GetSetupChecklistQueryResponse } from '@codm/client-typescript/typescript'`
//     → `import type { GetOnboardingQueryResponse } from '@codm/client-typescript/typescript'`
//   · a prop `checklist: GetSetupChecklistQueryResponse` → `checklist: GetOnboardingQueryResponse`
// O painel continua mostrando os três passos derivados. Mostrar os `DEFERRABLE` pendentes (AC-13,
// segunda metade) exige a taxonomia, que é a frente ONB-3 — não antecipe aqui.
```

### Step T6.6 — Atualize o docblock que cita o hook morto

Modifique `packages/app/react/src/services/AnalyticsService/AnalyticsService.ts`: no docblock que
menciona `useGetSetupChecklist`, troque o nome por `useGetOnboarding`. É comentário, mas um comentário
que nomeia um símbolo inexistente envelhece mal.

### Step T6.7 — Gates

Run: `cd packages/app/react && bun x tsc --noEmit`
Expected: 0 erros.

Run: `bun tsc`
Expected: 0 erros em todos os workspaces.

Run: `cd packages/app/react && bun test`
Expected: verde, sem regressão.

Run: `bun lint`
Expected: 0 findings.

### Step T6.8 — Commit

```bash
git add packages/api/typescript/public/docs/openapi.json \
        packages/client/dist/ \
        "packages/app/react/src/routes/(app)/dashboard/-components/HomeSection/index.tsx" \
        "packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx" \
        packages/app/react/src/services/AnalyticsService/AnalyticsService.ts
git commit -m "chore(sdk): regenera para /ui/onboarding e repõe os consumidores do checklist morto (ONB-1 Task T6)"
```

---

## Final Validation

- [ ] `bun tsc` — type check limpo em todos os workspaces
- [ ] `bun lint` — lint limpo
- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` — 0 erros
- [ ] `cd packages/api/typescript && bun test` — verde (queda de contagem explicada no commit da T5)
- [ ] `cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts --check` — o schema dumpado bate com o migrado
- [ ] `bun run --cwd packages/contracts db:check-go` — as duas cópias da migração byte-a-byte iguais
- [ ] `cd packages/contracts && bun test codegen/` — codegen verde
- [ ] `bun run test:tooling` · `bun check:generated` — verdes
- [ ] `cd packages/api/go && go build ./... && go test ./...` — verde
- [ ] `cd packages/app/react && bun test` — verde
- [ ] `cd packages/e2e && bun run test` — **esperado VERMELHO nesta frente**: `tests/06-onboarding-attach.spec.ts` importa `getSetupChecklist`, que deixou de existir. A reescrita dele é a frente ONB-5 (spec AC-13/AC-14). Registre o resultado; não conserte aqui.
- [ ] AC mapping:
  - AC-1 → `packages/api/typescript/src/ui/middlewares/OnboardingMiddleware.test.ts:"AC-1: recusa quando o operador nunca começou"` + `"AC-1: recusa quando começou e não concluiu"`
  - AC-2 → `packages/api/typescript/src/ui/usecases/CompleteOnboarding.test.ts:"AC-2: concluir grava completedAt para aquele ownerId"` + `packages/api/typescript/src/ui/middlewares/OnboardingMiddleware.test.ts:"AC-2: deixa passar depois de concluído"`
  - AC-3 → `packages/api/typescript/src/ui/repositories/OnboardingRepository/DrizzleOnboardingRepository.test.ts:"AC-3: um segundo operador tem onboarding independente"`
  - AC-8 (parcial, lado servidor) → `packages/api/typescript/src/ui/usecases/CompleteOnboarding.test.ts:"AC-8: concluir funciona com todo o setup por fazer"`
  - AC-9 → `packages/api/typescript/src/thread/usecases/DeletedThreadReads.test.ts` (repontado para `GetOnboarding`) + `packages/api/typescript/src/ui/usecases/GetOnboarding.test.ts:"reporta os três derivados quando o setup está feito"`
  - AC-13 (primeira metade — o endpoint morre e o painel migra) → `Step T5.9` + `Step T6.4`; a segunda metade (mostrar os `DEFERRABLE`) é ONB-3
  - AC-21 → `packages/api/typescript/tests/architecture/__snapshots__/mcp-exposure.test.ts.snap` sem `mcp__codm__GetSetupChecklist`
  - AC-22 → `Step T6.4` — `setPersonProperties` segue com as três propriedades

## Notes

**ACs que esta frente NÃO cobre, e onde elas ficam.** AC-4, AC-5, AC-6, AC-7, AC-10, AC-11 e AC-18 são
do wizard e da guarda de UI (ONB-3). AC-12, AC-16 e AC-17 são da renomeação e da poda (ONB-2). AC-14 é
dos passos de setup dentro do wizard (ONB-4). AC-15, AC-19 e AC-20 são de ONB-3/ONB-5. A AC-8 fica
parcialmente coberta aqui (o lado servidor: concluir não exige setup) e se completa na ONB-3, quando o
botão existir.

**O e2e fica vermelho ao fim desta frente, e isso é esperado.**
`packages/e2e/tests/06-onboarding-attach.spec.ts` importa `getSetupChecklist`. Consertá-lo aqui
significaria escrever, na frente do contrato, o teste de um wizard que ainda não existe. A frente
ONB-5 o reescreve. Registre o vermelho em vez de escondê-lo — e não abra exceção no gate de e2e para
as outras frentes por causa disto.

**A ordem T5 → T6 é obrigatória e não é estética.** A T5 apaga o endpoint e a T6 regenera o SDK e
repõe os consumidores. Inverter deixaria `bun tsc` vermelho no meio da frente, e o goal exige cada
frente 100% verde antes da próxima.

**Nenhum evento de domínio é criado.** A spec não pede reação a "onboarding concluído", e inventar um
`OnboardingCompletedEvent` sem assinante seria infraestrutura sem propósito. Se algum dia um contexto
precisar reagir, o evento nasce ali — com assinante.

**Os verbos do `bun cli` usados aqui foram verificados e existem todos**: `entity`, `repository`,
`usecase`, `controller`, `query`, `middleware`. Assinaturas: `query <name>` (sem contexto — a leitura
BFF sempre nasce em `ui/usecases/`), e `<verbo> <ctx> <Name>` para os demais. O scaffold cria o
esqueleto canônico; o bloco proposto no Step seguinte é o arquivo FINAL e é escrito por cima dele.
Não invente flags que o `bun cli <verbo> --help` não lista.
