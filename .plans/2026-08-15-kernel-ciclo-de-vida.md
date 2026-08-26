# Ciclo de vida no kernel — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`) syntax for tracking.
> Each Task wraps one observable behavior in an outer RED→GREEN cycle.

**Goal:** Dar ao kernel do codm `start`/`shutdown` por contexto e os estáticos `startAll`/`shutdownAll`, e fazer a composição devolver as instâncias — o pré-requisito da DC3.

**Architecture:** Porte downstream do `template-fullstack`. `BoundedContextOptions` ganha dois hooks opcionais; a instância guarda-os e expõe `start()` idempotente e `shutdown()`; dois estáticos varrem a lista com assimetria deliberada (ligar falha rápido, desligar drena tudo e coleciona). `composeContexts` passa a devolver `contexts` de forma aditiva.

**Tech Stack:** TypeScript, Bun, tsyringe-neo

**Spec:** .specs/2026-08-15-kernel-ciclo-de-vida-design.md
**Tasks:** 3
**Estimated minutes:** 55

---

## Task T1: O kernel liga e desliga contextos, com assimetria

**Files to write:**
- Modify: `packages/api/typescript/core/src/types/BoundedContext.ts` — `start?`/`shutdown?` em `BoundedContextOptions`, `ShutdownFailure`, campo `started`, métodos `start()`/`shutdown()`, estáticos `startAll`/`shutdownAll`
- Test: `packages/api/typescript/core/src/types/BoundedContext.lifecycle.test.ts`

**Files to read:**
- `packages/api/typescript/core/src/types/BoundedContext.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** (none)
**Consumes (frozen):** `BoundedContext`, `BoundedContextOptions`, `DependencyContainer` (tsyringe-neo) — já existentes em `core/src/types/BoundedContext.ts`.
**Scope fence:** DONE elsewhere — nada. OUT — mover lifecycle de contexto (DC3), apagar `mounted.includes('agent')` (DC3), mover `registerJobs` de fase (follow-up nomeado, spec D6).
**Gate:** `cd packages/api/typescript && bun test core/src/types/BoundedContext.lifecycle.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T1.1 — Escrever o teste que falha

```typescript
// packages/api/typescript/core/src/types/BoundedContext.lifecycle.test.ts
import { describe, expect, it } from 'bun:test'
import { container } from 'tsyringe-neo'
import { BoundedContext, type ShutdownFailure } from './BoundedContext'

// Um contexto mínimo: sem controllers, sem registry, sem jobs. O que se prova aqui é a
// MECÂNICA de ligar e desligar, não a composição.
const make = (name: string, hooks: { start?: () => void | Promise<void>; shutdown?: () => void | Promise<void> } = {}) =>
	BoundedContext.create({
		name,
		controllers: {},
		start: hooks.start ? async () => hooks.start?.() : undefined,
		shutdown: hooks.shutdown ? async () => hooks.shutdown?.() : undefined,
	})

describe('BoundedContext — ciclo de vida', () => {
	it('AC-6: contexto sem hooks passa por startAll/shutdownAll como no-op', async () => {
		const ctx = await make('sem-hooks')
		await BoundedContext.startAll([ctx])
		expect(await BoundedContext.shutdownAll([ctx])).toEqual([])
	})

	it('AC-3 / F-1: startAll FALHA RÁPIDO — o contexto seguinte NÃO roda', async () => {
		let seguinte = 0
		const quebrado = await make('quebrado', {
			start: () => {
				throw new Error('pump quebrado')
			},
		})
		const depois = await make('depois', { start: () => void seguinte++ })

		await expect(BoundedContext.startAll([quebrado, depois])).rejects.toThrow(/quebrado/)
		// A testemunha: o contador do SEGUINTE ficou em 0. Sem o `throw`, ele seria 1.
		expect(seguinte).toBe(0)
	})

	it('AC-4 / F-2: shutdownAll DRENA TUDO — isola a falha e devolve a lista', async () => {
		let drenado = 0
		const quebrado = await make('quebrado', {
			shutdown: () => {
				throw new Error('recurso preso')
			},
		})
		const outro = await make('outro', { shutdown: () => void drenado++ })

		// LIFO: `outro` foi criado depois, então drena primeiro; `quebrado` falha e não interrompe.
		const failures: ShutdownFailure[] = await BoundedContext.shutdownAll([quebrado, outro])

		expect(failures).toHaveLength(1)
		expect(failures[0]?.context).toBe('quebrado')
		expect(drenado).toBe(1)
	})

	it('AC-4: shutdownAll drena em LIFO — o inverso da ordem de composição', async () => {
		const ordem: string[] = []
		const primeiro = await make('primeiro', { shutdown: () => void ordem.push('primeiro') })
		const segundo = await make('segundo', { shutdown: () => void ordem.push('segundo') })

		await BoundedContext.shutdownAll([primeiro, segundo])

		expect(ordem).toEqual(['segundo', 'primeiro'])
	})

	it('AC-5 / F-3: start() é idempotente — o hook roda uma vez só', async () => {
		let vezes = 0
		const ctx = await make('idempotente', { start: () => void vezes++ })

		await ctx.start()
		await ctx.start()

		expect(vezes).toBe(1)
	})
})

// Mantém o container raiz limpo entre execuções da suíte inteira.
container.reset()
```

### Step T1.2 — Rodar e ver falhar

Run: `cd packages/api/typescript && bun test core/src/types/BoundedContext.lifecycle.test.ts`
Expected: FAIL — `BoundedContext.startAll is not a function` (e `ShutdownFailure` não exportado).

### Step T1.3 — Implementar

Modify `packages/api/typescript/core/src/types/BoundedContext.ts`:

1. Em `BoundedContextOptions`, logo abaixo de `setup?`, acrescentar os dois hooks com os docblocks que portam a medição do template:

```typescript
	/**
	 * A FASE DE START — o que este contexto LIGA quando o boot manda (pumps: pollers, consumers,
	 * transportes). Declarado aqui, executado por `startAll()` — nunca dentro do `create`. A razão
	 * é medida (template, S2/F0): quando isto era `setup` em import-time, o `OutboxDispatcher`
	 * pollava antes de o schema existir em TODO boot, e o `emit-openapi` conectava transporte só
	 * para gerar um JSON. Import registra; fase liga.
	 */
	start?: (container: DependencyContainer) => void | Promise<void>
	/**
	 * O INVERSO do `start`, e existe porque a assimetria custava caro: enquanto a devolução do que
	 * um contexto adquire mora na raiz de composição, a raiz precisa SABER o que cada contexto
	 * ligou — e um contexto novo que adquira recurso não tem onde devolvê-lo, então ele vaza no
	 * encerramento sem ninguém avisar.
	 *
	 * Roda em LIFO (ver `shutdownAll`), então um contexto sempre se desfaz antes daquele de quem
	 * depende. Não feche pool de banco aqui: isso é de processo, é o ÚLTIMO passo, e é da raiz.
	 */
	shutdown?: (container: DependencyContainer) => void | Promise<void>
```

2. Acima da classe, o tipo do resultado:

```typescript
/** O que falhou ao desligar. `shutdownAll` devolve isto; quem decide o exit code é a raiz. */
export interface ShutdownFailure {
	context: string
	error: unknown
}
```

3. Na classe: campo `started`, guardar `name` e os hooks no construtor, e os quatro métodos. O construtor privado passa a receber `name`, `onStart` e `onShutdown`; `create` passa `options.name`, `options.start` e `options.shutdown` ao `new BoundedContext(...)`.

```typescript
	private started = false

	/** Liga o que este contexto declarou. PERMANENTE e idempotente: segundo start é no-op. */
	async start(): Promise<void> {
		if (this.started) return
		this.started = true
		await this.onStart?.(this.container)
	}

	/** Devolve o que este contexto adquiriu. Sem hook declarado, é no-op. */
	async shutdown(): Promise<void> {
		await this.onShutdown?.(this.container)
	}

	/**
	 * Liga em FIFO — a ordem de composição. ASSIMETRIA DELIBERADA com o shutdown: desligamento
	 * DRENA tudo e coleciona falhas; ligamento FALHA RÁPIDO — um boot com pump quebrado não pode
	 * meio-subir.
	 */
	static async startAll(contexts: readonly BoundedContext[]): Promise<void> {
		for (const context of contexts) {
			try {
				await context.start()
			} catch (error) {
				throw new Error(`BoundedContext.startAll: o start de '${context.name}' falhou — boot abortado`, { cause: error })
			}
		}
	}

	/**
	 * Desliga em LIFO — o inverso da ordem de composição, de modo que um contexto sempre se desfaz
	 * antes daquele de quem depende.
	 *
	 * MECANISMO, NÃO POLÍTICA. Cada contexto é isolado num try/catch para que um recurso quebrado
	 * não aborte a drenagem dos outros, e as falhas voltam numa lista. Decidir se isso vira exit 1
	 * é da raiz de composição, que é quem conhece o processo.
	 */
	static async shutdownAll(contexts: readonly BoundedContext[]): Promise<ShutdownFailure[]> {
		const failures: ShutdownFailure[] = []
		for (const context of [...contexts].reverse()) {
			try {
				await context.shutdown()
			} catch (error) {
				failures.push({ context: context.name, error })
			}
		}
		return failures
	}
```

### Step T1.4 — Rodar e ver passar

Run: `cd packages/api/typescript && bun test core/src/types/BoundedContext.lifecycle.test.ts`
Expected: PASS — 5 testes.

### Step T1.5 — Falseador provado

Comentar o `throw` dentro do `catch` de `startAll` → o teste `F-1` fica VERMELHO (`seguinte` vira 1). Restaurar → verde. Registrar os dois números no commit.

### Step T1.6 — Gate

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun test`
Expected: 0 erros; contagem de testes sobe em 5.

### Step T1.7 — Commit

```bash
git add packages/api/typescript/core/src/types/BoundedContext.ts \
        packages/api/typescript/core/src/types/BoundedContext.lifecycle.test.ts
git commit -m "feat(kernel): o contexto declara o que liga e o que apaga (DC0 T1)"
```

---

## Task T2: A cadência do job pode morar no próprio job

**Files to write:**
- Modify: `packages/api/typescript/core/src/types/BoundedContext.ts` — `JobDefinition.repeat` vira opcional; `registerJobs` lê `static repeat` do handler como fallback
- Test: `packages/api/typescript/core/src/types/BoundedContext.jobs.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T1
**Consumes (frozen):** `JobDefinition`, `BoundedContext.create` — de T1/existente.
**Scope fence:** DONE — o ciclo de vida (T1). OUT — migrar qualquer job real para `static repeat` (é DC2), e mover `registerJobs` de fase (follow-up, spec D6).
**Gate:** `cd packages/api/typescript && bun test core/src/types/BoundedContext.jobs.test.ts`

### Step T2.1 — Teste que falha

```typescript
// packages/api/typescript/core/src/types/BoundedContext.jobs.test.ts
import { describe, expect, it } from 'bun:test'
import { resolveJobCadence } from './BoundedContext'

class ComEstatico {
	static repeat = { every: 60_000 }
}
class SemEstatico {}

describe('resolveJobCadence — a cadência pode morar no job', () => {
	it('AC-8: usa o `static repeat` do handler quando o JobDefinition não traz `repeat`', () => {
		expect(resolveJobCadence({ handler: ComEstatico as never })).toEqual({ every: 60_000 })
	})

	it('AC-8: o `repeat` explícito do JobDefinition VENCE o estático', () => {
		expect(resolveJobCadence({ handler: ComEstatico as never, repeat: { every: 5_000 } })).toEqual({ every: 5_000 })
	})

	it('F-4: sem `repeat` em lugar nenhum, devolve undefined — o chamador decide', () => {
		expect(resolveJobCadence({ handler: SemEstatico as never })).toBeUndefined()
	})
})
```

### Step T2.2 — Rodar e ver falhar

Run: `cd packages/api/typescript && bun test core/src/types/BoundedContext.jobs.test.ts`
Expected: FAIL — `resolveJobCadence` não exportado.

### Step T2.3 — Implementar

Modify `packages/api/typescript/core/src/types/BoundedContext.ts`: `JobDefinition.repeat` vira `repeat?`, e nasce a função pura (exportada, para ter testemunha sem montar contexto):

```typescript
/**
 * A cadência de um job pode ser declarada no próprio job (`static repeat`) em vez de na lista do
 * contexto — é o mesmo movimento de `Projector.events`, que declara os eventos que assina em vez
 * de depender de uma lista central. O `repeat` explícito do `JobDefinition` vence quando ambos
 * existem, para que a lista continue podendo sobrescrever um caso.
 */
export function resolveJobCadence(job: JobDefinition): { every: number } | undefined {
	return job.repeat ?? (job.handler as { repeat?: { every: number } }).repeat
}
```

E `registerJobs` passa a usar `resolveJobCadence(job)`; um job sem cadência em lugar nenhum é registrado como handler de comando sem `repeat` (comportamento atual quando `repeat` estava ausente é impossível hoje, porque era obrigatório — então este é o caminho novo).

### Step T2.4 — Rodar e ver passar

Run: `cd packages/api/typescript && bun test core/src/types/BoundedContext.jobs.test.ts`
Expected: PASS — 3 testes.

### Step T2.5 — Falseador provado

Trocar `job.repeat ?? (…)` por `job.repeat` → o primeiro teste fica VERMELHO. Restaurar → verde.

### Step T2.6 — Commit

```bash
git add packages/api/typescript/core/src/types/BoundedContext.ts \
        packages/api/typescript/core/src/types/BoundedContext.jobs.test.ts
git commit -m "feat(kernel): a cadência do job pode morar no próprio job (DC0 T2)"
```

---

## Task T3: A composição devolve as instâncias que o shutdown precisa

**Files to write:**
- Modify: `packages/api/typescript/src/compose.ts` — `composeContexts` devolve `{ mounted, routers, contexts }`
- (nenhuma mudança em `src/server.ts` — ver T3.1)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none)
**Depends on:** T1
**Consumes (frozen):** `BoundedContext` (com `shutdownAll`, de T1), `composeContexts`, `MANIFEST`, `criteria`.
**Scope fence:** DONE — kernel (T1). OUT — usar `contexts` para qualquer coisa; apagar `step()` ou os `mounted.includes('agent')` é DC3. Esta Task só torna a coleção ALCANÇÁVEL.
**Gate:** `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun test`

### Step T3.1 — Implementar

Modify `packages/api/typescript/src/compose.ts`: no laço de `composeContexts`, acumular as instâncias e devolvê-las junto. O tipo de retorno vira `Promise<{ mounted: ContextModule[]; routers: Router[]; contexts: BoundedContext[] }>`; `routers` e `mounted` permanecem intactos, e o docblock ganha a razão:

> `contexts` é aditivo e existe porque `BoundedContext.shutdownAll` precisa das INSTÂNCIAS, não dos routers. Antes desta linha, a composição criava cada contexto e descartava tudo menos `.router` — e a devolução do que cada um adquire tinha de morar na raiz, sabendo o que cada contexto ligou.

**`src/server.ts` NÃO muda.** O retorno é aditivo, então a desestruturação de `:137` continua válida sem tocar em nada. Desestruturar `contexts` aqui só para não usá-lo seria variável morta — falha de lint, e entrega nenhuma. Quem consome a coleção é a DC3, e é ela que muda esta linha.

### Step T3.2 — Gate

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun test`
Expected: 0 erros; contagem de testes igual à de T2 (esta Task não acrescenta teste — a testemunha é o `tsc`, que reprovaria se `contexts` não existisse no tipo de retorno).

### Step T3.3 — Commit

```bash
git add packages/api/typescript/src/compose.ts packages/api/typescript/src/server.ts
git commit -m "feat(compose): a composição devolve as instâncias, não só os routers (DC0 T3)"
```

---

## Final Validation

- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` — 0 erros
- [ ] `cd packages/api/typescript && bun test` — 1438 + 8 = 1446 pass / 0 fail
- [ ] `bun tsc` — todos os workspaces
- [ ] `bun lint`
- [ ] Falseadores provados e números citados em commit: F-1 (`seguinte` 0→1), F-2 (`failures` 1), F-3 (`vezes` 1→2), F-4 (cadência estática some)
- [ ] AC mapping:
  - AC-1, AC-2, AC-6 → `core/src/types/BoundedContext.lifecycle.test.ts:"contexto sem hooks passa por startAll/shutdownAll como no-op"`
  - AC-3 → `…:"startAll FALHA RÁPIDO — o contexto seguinte NÃO roda"`
  - AC-4 → `…:"shutdownAll DRENA TUDO"` + `…:"drena em LIFO"`
  - AC-5 → `…:"start() é idempotente"`
  - AC-7 → `tsc` verde após T3
  - AC-8 → `core/src/types/BoundedContext.jobs.test.ts` (3 casos)

## Notes

`e2e` não entra: esta frente não tem superfície exercitável por Playwright — é contrato de kernel, e a condição diz isso em vez de fingir cobertura.
