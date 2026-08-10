# Consolidação do teste de frontend — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** A story vira a fixture única executável, os testes de comportamento batem por padrão num backend real em processo (`integration`), e a camada inteira ganha canon, rails e governança — com todo o tooling num único commit atômico portável (spec Decision 15).

**Architecture:** O core do backend ganha um seletor de ambiente guardado (`setBoundedContextEnvironment`); um harness do lado do api (`@codm/api-typescript/testing`) sobe o `MainRouter` com bindings `integration` em porta aleatória e expõe o container do servidor + um adaptador `asTestBed()` para os givens existentes; o console consome via casca fina + `configureClient`. Stories executam no `bun test` por `composeStories` (smoke de todas + `play` de comportamento), e dois rails em `packages/app/react/tests/architecture/` fecham as armadilhas medidas (RouterProvider sem `load()`, stub manual de `fetch` com inventário). A onda B varre os 36 por falseamento e migra os 15 com tela.

**Tech Stack:** TypeScript, Bun, tsyringe-neo, Fastify, TanStack Router/Query, Storybook 10 (`composeStories`), MSW, happy-dom

**Spec:** .specs/2026-08-10-consolidacao-teste-frontend-design.md
**Tasks:** 11
**Estimated minutes:** 540

> **Protocolo de commit — DIFERENTE do padrão `/build`, por força da spec Decision 15.**
> As Tasks T1–T6 NÃO commitam (deixam a árvore suja de propósito). A T7 monta O commit atômico de
> tooling e verifica a AC-11. Exceção: se a T1 encontrar stories quebradas, os CONSERTOS delas são
> commits de produto feitos DENTRO da T1, antes de tudo. T8–T11 são commits de produto normais.
> Ordem de ondas: T1 (sonda+onda 0) → T2→T3 (seam+harness, sequenciais) ∥ T4 ∥ T5 (paralelizáveis
> entre si — arquivos disjuntos) → T6 → T7 (o commit) → T8 → T9 ∥ T10 ∥ T11.

---

## Task T1: O smoke sonda o estado real das stories antes de qualquer commit

**Files to write:**
- Create: `packages/app/react/tests/architecture/stories-smoke.test.tsx` (fica NÃO COMMITADO até a T7)
- Modify: stories do produto que a sonda revelar quebradas — commits de produto imediatos, um por conserto

**Files to read:**
- `packages/app/react/.storybook/preview.tsx`
- `packages/app/react/src/storybook/index.ts`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /storybook
**Depends on:** (none)
**Consumes (frozen):** nada — Task raiz. CONGELA para T4/T7: o caminho `packages/app/react/tests/architecture/stories-smoke.test.tsx` e sua forma (Bun.Glob + import dinâmico + `composeStories` + render de cada story).
**Scope fence:** OUT — não criar `tests/support/storybook.ts` ainda (T4 o faz; se o smoke precisar de `setProjectAnnotations`, declare inline neste arquivo e a T4 extrai). Não tocar em rails, harness, skill.
**Gate:** `cd packages/app/react && bun test tests/architecture/stories-smoke.test.tsx` roda até o fim (verde OU com a lista de stories quebradas reportada); consertos commitados deixam-no verde.

### Step T1.1 — Escreva a sonda

```tsx
// packages/app/react/tests/architecture/stories-smoke.test.tsx — arquivo final COMPLETO.
// NOTA: se `setProjectAnnotations` com o preview real falhar sob bun (import de CSS), aplique a
// mitigação descrita no comentário do bloco `annotations` abaixo e REGISTRE o achado — a T4
// consome essa decisão.
import { describe, expect, it } from 'bun:test'
import { composeStories, setProjectAnnotations } from '@storybook/react'
import { Glob } from 'bun'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

/**
 * TODA STORY É EXECUTÁVEL — o gate que não existia.
 *
 * `storybook:build` não roda em gate nenhum: uma story podia quebrar de vez e ninguém saberia até
 * abrir o Storybook. Este smoke fecha o buraco pelo runner que já roda em todo commit: compõe cada
 * story com as anotações do projeto e a RENDERIZA. Não assevera aparência — assevera que ela
 * existe, compila e monta. `play` é asserção dos arquivos de story; aqui só a montagem.
 *
 * Genérico por construção (Bun.Glob — nenhuma story nomeada), portanto TOOLING (spec Decision 15):
 * um fork herda o gate sem herdar nenhuma story do CODM.
 */

// As anotações do projeto (decorators de tema/i18n/msw do preview). Se o import do preview real
// puxar CSS e o bun engasgar, o fallback é importar aqui apenas os decorators exportáveis de
// `@/storybook` e registrar o achado para a T4 mover o CSS para fora do caminho do preview.
import * as previewAnnotations from '../../.storybook/preview'

setProjectAnnotations(previewAnnotations.default ?? previewAnnotations)

const glob = new Glob('src/**/*.stories.tsx')
const storyFiles = [...glob.scanSync({ cwd: import.meta.dir + '/../..' })].sort()

describe('smoke: toda story compõe e renderiza', () => {
	expect(storyFiles.length).toBeGreaterThan(0)

	for (const file of storyFiles) {
		it(file, async () => {
			const module_ = await import(`../../${file}`)
			const composed = composeStories(module_)
			for (const [name, Story] of Object.entries(composed)) {
				const host = document.createElement('div')
				document.body.appendChild(host)
				const root = createRoot(host)
				await act(async () => {
					root.render(<Story />)
				})
				await act(async () => {
					await Promise.resolve()
				})
				expect(host, `${file} :: ${name} montou vazio`).toBeTruthy()
				act(() => root.unmount())
				host.remove()
			}
		})
	}
})
```

### Step T1.2 — Rode a sonda e inventarie

Run: `cd packages/app/react && bun test tests/architecture/stories-smoke.test.tsx`
Expected: ou verde (siga ao T1.4), ou uma lista de stories vermelhas com o erro de cada uma.

### Step T1.3 — Conserte as quebradas (onda 0, commits de produto)

Para CADA story vermelha: conserte a story (nunca o smoke), rode o smoke de novo, e commite o
conserto sozinho: `git add <story> && git commit -m "fix(storybook): <componente> volta a montar (onda 0)"`.
Se a falha for do MECANISMO (CSS no preview sob bun, anotação incompatível), NÃO é onda 0 — registre
o achado no relato da Task; a T4 resolve o mecanismo.

### Step T1.4 — Deixe o smoke NA ÁRVORE, sem commitar

O arquivo fica uncommitted até a T7 (Decision 15). Verifique: `git status --short` mostra
`?? packages/app/react/tests/architecture/stories-smoke.test.tsx`.

---

## Task T2: O backend aceita subir em `integration` por escolha explícita — e recusa em produção

**Files to write:**
- Modify: `packages/api/typescript/core/src/types/BoundedContext.ts` — seletor de ambiente
- Create: `packages/api/typescript/core/src/types/BoundedContext.environment.test.ts`

**Files to read:**
- `packages/api/typescript/core/src/types/BoundedContext.ts`
- `packages/api/typescript/core/src/types/Registry.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** (none)
**Consumes (frozen):** nada de ondas anteriores. CONGELA para T3: `setBoundedContextEnvironment(env: 'real' | 'integration'): void` e `getBoundedContextEnvironment(): 'real' | 'integration'`, exportados de `@codm/core-typescript` (via o barril que já exporta `BoundedContext`).
**Scope fence:** OUT — nenhum arquivo fora dos dois listados; NÃO tocar `src/boot.ts` (a recusa vive no seletor, no core — o core não pode importar `src/`); NÃO tocar TestBed. DONE elsewhere — nada.
**Gate:** `cd packages/api/typescript && bun test core/src/types/BoundedContext.environment.test.ts` verde E `bun test` inteiro verde (nada regrediu) E `bun x tsc -p tsconfig.build.json --noEmit` 0 erros. NÃO COMMITAR (T7).

### Step T2.1 — Escreva o teste falhando

```typescript
// packages/api/typescript/core/src/types/BoundedContext.environment.test.ts — arquivo final COMPLETO
import { afterEach, describe, expect, it } from 'bun:test'
import { getBoundedContextEnvironment, setBoundedContextEnvironment } from './BoundedContext'

/**
 * A COSTURA DA SPEC (Decision 6) E SEUS DOIS FALSEADORES.
 *
 * O boot de produção era `registry.real` hardcoded; agora é uma SELEÇÃO com default `real` — o
 * caller de produção não muda uma linha e não pode ser mudado por env var ambiente (a seleção é
 * uma CHAMADA explícita, o oposto de configuração ambiente). `integration` é recusado sob
 * NODE_ENV=production: um servidor de produção com bindings em memória é o desastre silencioso
 * que este teste existe para tornar barulhento.
 */
describe('seleção de ambiente do BoundedContext', () => {
	const originalNodeEnv = process.env.NODE_ENV

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv
		setBoundedContextEnvironment('real')
	})

	it('o default é real — produção não muda uma linha', () => {
		expect(getBoundedContextEnvironment()).toBe('real')
	})

	it('a seleção explícita de integration vale fora de produção', () => {
		process.env.NODE_ENV = 'test'
		setBoundedContextEnvironment('integration')
		expect(getBoundedContextEnvironment()).toBe('integration')
	})

	it('FALSEADOR: integration sob NODE_ENV=production é recusado, alto', () => {
		process.env.NODE_ENV = 'production'
		expect(() => setBoundedContextEnvironment('integration')).toThrow(/production/)
		expect(getBoundedContextEnvironment()).toBe('real')
	})
})
```

### Step T2.2 — Rode para vê-lo falhar

Run: `cd packages/api/typescript && bun test core/src/types/BoundedContext.environment.test.ts`
Expected: FAIL — `setBoundedContextEnvironment` não existe.

### Step T2.3 — A costura

Modifique `packages/api/typescript/core/src/types/BoundedContext.ts`. ANTES da classe, adicione:

```typescript
/**
 * SELEÇÃO DE AMBIENTE DO BOOT (spec Decision 6). O default é `real` e o caller de produção não
 * muda: a seleção é uma CHAMADA explícita feita ANTES dos imports dos contextos (os boots são
 * side-effect de módulo), nunca uma env var ambiente. `integration` sob produção é recusado —
 * um servidor real com bindings em memória seria o desastre silencioso.
 * Consumidor: o harness de integração do console (`@codm/api-typescript/testing`).
 */
export type BoundedContextEnvironment = 'real' | 'integration'

let selectedEnvironment: BoundedContextEnvironment = 'real'

export function setBoundedContextEnvironment(env: BoundedContextEnvironment): void {
	if (env === 'integration' && process.env.NODE_ENV === 'production') {
		throw new Error('setBoundedContextEnvironment: integration é recusado sob NODE_ENV=production')
	}
	selectedEnvironment = env
}

export function getBoundedContextEnvironment(): BoundedContextEnvironment {
	return selectedEnvironment
}
```

E troque, dentro de `create` (linha ~60):
`registerAll(options.root ? container : rootContainer, options.registry.real)` por
`registerAll(options.root ? container : rootContainer, options.registry[selectedEnvironment])`.

Se o barril de `@codm/core-typescript` não reexportar automaticamente, adicione os dois exports lá
(uma linha, aditiva).

### Step T2.4 — Gates

Run: `cd packages/api/typescript && bun test core/src/types/BoundedContext.environment.test.ts` → 3 pass.
Run: `cd packages/api/typescript && bun test` → verde, sem regressão (o default preserva o comportamento).
Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` → 0 erros. NÃO commite.

---

## Task T3: O console sobe o backend de verdade dentro do próprio teste (SPIKE + harness)

**Files to write:**
- Create: `packages/api/typescript/tests/support/integration-server.ts`
- Modify: `packages/api/typescript/package.json` — export `"./testing": "./tests/support/integration-server.ts"`
- Create: `packages/app/react/tests/support/integration-harness.ts` (casca fina)
- Modify: `packages/app/react/package.json` — devDependency `"@codm/api-typescript": "workspace:*"`
- Modify: `packages/app/react/tsconfig.json` — paths do api (opção (a) ratificada)
- Modify: `packages/app/react/tests/setup.ts` — `import 'reflect-metadata'` como PRIMEIRA linha
- Create: `packages/app/react/tests/support/integration-harness.spike.test.tsx` — o spike que mede

**Files to read:**
- `packages/api/typescript/src/index.ts` (a montagem do MainRouter, linhas ~92–107)
- `packages/api/typescript/src/routers.ts`
- `packages/api/typescript/tests/support/TestBed.ts`
- `packages/api/typescript/tests/support/given/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test, /desktop-shell
**Depends on:** T2
**Consumes (frozen):** de T2 — `setBoundedContextEnvironment` / `getBoundedContextEnvironment` de `@codm/core-typescript`. Existentes: `ALL_ROUTERS` de `src/routers.ts`; `MainRouter`, `HttpRouter`, `Config` de `@codm/core-typescript`; `createGivenHelpers(testBed)` de `tests/support/given`; `OPERATOR_ID` de `@auth/operator`; `configureClient` de `@codm/client-typescript/http`. CONGELA para T9–T11: `startIntegrationBackend(): Promise<IntegrationBackend>` com `{ url, container, asTestBed(), reset(), stop() }`, exportado de `@codm/api-typescript/testing` e re-exportado pela casca `packages/app/react/tests/support/integration-harness.ts`.
**Scope fence:** DONE elsewhere — o seletor (T2). OUT — mountRouter e rails (T5), composeStories (T4), skill/docs (T6). O harness NÃO conhece nenhum given nomeado (spec AC-3): expõe `asTestBed()` e quem compõe é o consumidor. NÃO usar `TestBed.create` dentro do harness — nasceriam DOIS containers e DOIS bancos, e o seed iria para um banco que o servidor não lê.
**Gate:** `cd packages/app/react && bun test tests/support/integration-harness.spike.test.tsx` verde COM as três medições impressas (boot ms, round-trip ms, delta do `bun x tsc --noEmit`); `bun tsc` 0 erros em todos os workspaces; `cd packages/api/typescript && bun test` verde. NÃO COMMITAR (T7).

### Step T3.1 — O servidor de integração (lado api)

```typescript
// packages/api/typescript/tests/support/integration-server.ts — arquivo final COMPLETO
import 'reflect-metadata'
import {
	Config,
	HttpRouter,
	MainRouter,
	rootContainer,
	setBoundedContextEnvironment,
} from '@codm/core-typescript'

/**
 * O BACKEND DE VERDADE DENTRO DO PROCESSO DE TESTE DO CONSOLE (spec Decision 5).
 *
 * Mock, mesmo tipado, devolve o que foi semeado e obriga o teste a asseverar por procuração;
 * aqui a requisição da SDK atravessa controller, middleware e use case REAIS sobre banco em
 * processo — a asserção vira o comportamento.
 *
 * TRÊS regras de construção, todas com motivo medido:
 * 1. A seleção de ambiente acontece ANTES do import de ALL_ROUTERS — os contextos bootam em
 *    side-effect de módulo, e importá-los primeiro registraria `real` (o hardcode que a T2
 *    removeu virou seleção, mas a ORDEM continua sendo do caller).
 * 2. `process.env.API_PORT` é setado ANTES do import — `MainRouter.start()` escuta
 *    `Config.env.API_PORT`, e o Config é lido no import.
 * 3. NUNCA `TestBed.create` aqui: ele registra num CHILD container — nasceriam dois bancos, e o
 *    seed iria para o que o servidor não lê. O adaptador `asTestBed()` expõe o container DO
 *    SERVIDOR com a superfície (duck-typed) que `createGivenHelpers` consome.
 *
 * PORTÁVEL (spec Decision 15): nenhum given nomeado, nenhum conhecimento de produto — quem compõe
 * givens é o teste consumidor: `createGivenHelpers(backend.asTestBed())`.
 */

export interface TestBedLike {
	resolve<T>(token: unknown): T
	readonly ownerId: string
}

export interface IntegrationBackend {
	url: string
	container: typeof rootContainer
	asTestBed(): TestBedLike
	reset(): Promise<void>
	stop(): Promise<void>
}

let booted: IntegrationBackend | null = null

export async function startIntegrationBackend(options?: { ownerId?: string }): Promise<IntegrationBackend> {
	if (booted) return booted

	// (2) porta aleatória alta ANTES de qualquer leitura de Config; colisão é rara e o retry cobre.
	const port = 30000 + Math.floor(Math.random() * 20000)
	process.env.API_PORT = String(port)
	process.env.NODE_ENV ??= 'test'

	// (1) seleção ANTES do import dos contextos.
	setBoundedContextEnvironment('integration')

	// Import DINÂMICO — agora os contextos bootam em integration: driver em processo, migrações
	// reais no setup do shared, outbox Drizzle sobre o mesmo banco, mediator em memória.
	const { ALL_ROUTERS } = await import('../../src/routers')

	const httpRouter = rootContainer.resolve(HttpRouter as never) as HttpRouter
	const mainRouter = new MainRouter({ httpRouter, version: Config.version, routers: ALL_ROUTERS })
	await mainRouter.start()

	const { DrizzleDatabaseDriver } = await import('@codm/core-typescript')
	const driver = rootContainer.resolve(DrizzleDatabaseDriver as never) as { reset(): Promise<void> }
	const { OPERATOR_ID } = await import('@auth/operator')

	booted = {
		url: `http://127.0.0.1:${port}`,
		container: rootContainer,
		asTestBed: () => ({
			resolve: token => rootContainer.resolve(token as never),
			ownerId: options?.ownerId ?? OPERATOR_ID,
		}),
		reset: () => driver.reset(),
		stop: async () => {
			await mainRouter.stop()
			booted = null
		},
	}
	return booted
}
```

> Ajustes esperados no spike (registre cada um no relato, não os esconda): nomes exatos dos exports
> de `@codm/core-typescript` (`rootContainer`, `DrizzleDatabaseDriver`, a superfície de `reset()`),
> e o conjunto mínimo de env vars que `Config.env` exige além de `API_PORT` — sete o que faltar
> ANTES do import, com valores de teste, documentando cada um.

### Step T3.2 — Export do pacote e a casca do console

Modifique `packages/api/typescript/package.json`: adicione ao objeto `exports` (crie-o se não
existir, preservando o export raiz atual): `"./testing": "./tests/support/integration-server.ts"`.

```typescript
// packages/app/react/tests/support/integration-harness.ts — arquivo final COMPLETO
import { configureClient } from '@codm/client-typescript/http'
import { startIntegrationBackend, type IntegrationBackend } from '@codm/api-typescript/testing'

/**
 * A casca do console sobre o servidor de integração: sobe (uma vez por processo — o servidor
 * cacheia), aponta a SDK para ele e devolve o backend. Givens são compostos pelo TESTE
 * (`createGivenHelpers(backend.asTestBed())`) — a casca não os conhece (spec AC-3).
 */
export type { IntegrationBackend }

export async function useIntegrationBackend(): Promise<IntegrationBackend> {
	const backend = await startIntegrationBackend()
	configureClient({ typescript: backend.url, go: backend.url })
	return backend
}
```

Modifique `packages/app/react/package.json`: `devDependencies` ganha `"@codm/api-typescript": "workspace:*"`; rode `bun install`.

Modifique `packages/app/react/tsconfig.json` (opção (a) ratificada): `compilerOptions.paths` ganha os
aliases do api apontando para os fontes dele — espelhe os do `packages/api/typescript/tsconfig.json`
(`"@*": ["../../api/typescript/src/*"]`, `"@test/*": ["../../api/typescript/tests/*"]`, ajustando os
prefixos para não colidir com o `@/*` do react; se colidir, use os caminhos relativos completos no
harness e registre). Meça o delta do `tsc` no spike.

Modifique `packages/app/react/tests/setup.ts`: `import 'reflect-metadata'` como PRIMEIRA linha do
arquivo (antes do happy-dom — decorators do backend são avaliados em import).

### Step T3.3 — O spike que mede (e é um teste de verdade)

```tsx
// packages/app/react/tests/support/integration-harness.spike.test.tsx — arquivo final COMPLETO
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createGivenHelpers } from '@test/support/given'
import { getOnboarding } from '@codm/client-typescript/typescript'
import { useIntegrationBackend, type IntegrationBackend } from './integration-harness'

/**
 * O SPIKE DA SPEC (Risks: "duas apostas a validar ANTES da massa") — e ao mesmo tempo a prova
 * ponta a ponta do harness: seed backend-style, leitura via SDK real, asserção no computado.
 * IMPRIME as medições que a AC-10 exige registrar.
 */
describe('harness de integração — spike', () => {
	let backend: IntegrationBackend

	beforeAll(async () => {
		const t0 = performance.now()
		backend = await useIntegrationBackend()
		console.log(`[spike] boot do backend integration: ${Math.round(performance.now() - t0)}ms`)
	})
	afterAll(async () => {
		await backend.stop()
	})

	it('a SDK atravessa o servidor real e volta com o computado', async () => {
		await backend.reset()
		const t0 = performance.now()
		const onboarding = await getOnboarding({})
		console.log(`[spike] round-trip SDK→Fastify→SQLite: ${Math.round(performance.now() - t0)}ms`)

		// Sem linha => primeiro passo, não concluído — COMPUTADO pelo GetOnboarding real, não semeado.
		expect(onboarding.completedAt).toBeNull()
		expect(onboarding.channelDone).toBe(false)
	})

	it('given do backend semeia o MESMO banco que o servidor lê', async () => {
		await backend.reset()
		const given = createGivenHelpers(backend.asTestBed() as never)
		await given.thread({})

		const onboarding = await getOnboarding({})
		expect(onboarding.threadDone).toBe(true) // o servidor VIU o seed — um banco só.
	})
})
```

> O nome/assinatura reais dos givens (`given.thread` vs `givenThread(testBed, …)`) saem da leitura
> de `tests/support/given/index.ts` — ajuste a CHAMADA, nunca a asserção. Se `getOnboarding` exigir
> shape de chamada diferente, idem.

### Step T3.4 — Gates + medições

Run: `cd packages/app/react && bun test tests/support/integration-harness.spike.test.tsx` → 2 pass,
com as duas linhas `[spike]` impressas. Meça também: `time (cd packages/app/react && bun x tsc --noEmit)`
antes e depois do paths — registre o delta no relato. `bun tsc` na raiz → 0 erros. NÃO commite.

---

## Task T4: Stories executam no bun test — `composeStories` + a prova do MSW sob bun

**Files to write:**
- Create: `packages/app/react/tests/support/storybook.ts`
- Modify: `packages/app/react/tests/architecture/stories-smoke.test.tsx` — passa a importar as anotações do support
- Create: `packages/app/react/tests/support/storybook.spike.test.tsx` — prova `play` + MSW sob bun
- Modify: `packages/app/react/.storybook/preview.tsx` — SÓ se o spike da T1 tiver registrado o problema do CSS: extrair as anotações para módulo sem CSS que o preview importa

**Files to read:**
- `packages/app/react/.storybook/preview.tsx`
- `packages/app/react/src/storybook/{index,mock}.ts`
- relato da T1 (o achado sobre CSS/anotações)

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /storybook
**Depends on:** T1
**Consumes (frozen):** de T1 — o caminho e a forma do smoke. Existentes: `composeStories`/`setProjectAnnotations` de `@storybook/react`; os mocks tipados de `@/storybook` (`mockQuery`, `mockMutation`, `loadingQuery`, `errorQuery`, `mockSession`); `msw` (para `setupServer` de `msw/node`, se necessário). CONGELA para T9–T11: `composeConsoleStories(module)` exportado de `packages/app/react/tests/support/storybook.ts` — aplica as anotações uma vez e devolve as stories compostas prontas para `await Story.run()`/render.
**Scope fence:** DONE elsewhere — o smoke (T1). OUT — mountRouter/rails (T5), harness (T3), skill (T6). NÃO migrar nenhum teste de produto (T9–T11).
**Gate:** `cd packages/app/react && bun test tests/support/storybook.spike.test.tsx tests/architecture/stories-smoke.test.tsx` verde, com o veredito do MSW-sob-bun impresso (`[spike] msw/node sob bun: OK` ou o fallback ativado e registrado); `bun x tsc --noEmit` 0 erros. NÃO COMMITAR (T7).

### Step T4.1 — O support

```typescript
// packages/app/react/tests/support/storybook.ts — arquivo final COMPLETO
import { composeStories, setProjectAnnotations } from '@storybook/react'
import * as previewAnnotations from '../../.storybook/preview'

/**
 * STORY COMO FIXTURE ÚNICA (spec Decisions 2/3): o Storybook mostra, o bun test executa. Este
 * módulo aplica as anotações do projeto UMA vez e expõe o compositor que o smoke, os specs de
 * `play` e as migrações (T9–T11) consomem. Se o preview real não puder ser importado sob bun
 * (CSS), o preview é refatorado para importar de um módulo de anotações sem CSS — e este arquivo
 * importa DESSE módulo; o Storybook continua lendo o preview normalmente.
 */
let applied = false

export function ensureProjectAnnotations(): void {
	if (applied) return
	setProjectAnnotations(previewAnnotations.default ?? previewAnnotations)
	applied = true
}

export function composeConsoleStories<T>(storiesModule: T): ReturnType<typeof composeStories<T>> {
	ensureProjectAnnotations()
	return composeStories(storiesModule)
}
```

### Step T4.2 — O spike de `play` + MSW

```tsx
// packages/app/react/tests/support/storybook.spike.test.tsx — arquivo final COMPLETO
import { describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { composeConsoleStories } from './storybook'
// A story real mais conectada que já existe — usa os mocks tipados + msw:
import * as stories from '../../src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.stories.tsx'

/**
 * A SEGUNDA APOSTA DA SPEC (Risks): o `play` composto roda no processo do bun, onde MSW precisa
 * dos interceptors node — mecanismo DIFERENTE do service worker do Storybook. Este spike compõe
 * uma story real com handlers msw e a monta; se a rede mockada não responder, ativa-se o fallback
 * registrado na spec (harness para estados semeáveis + dublê fino só para o improduzível) e o
 * achado é REGISTRADO no relato para a T6 documentar na skill.
 */
describe('composeStories + msw sob bun — spike', () => {
	it('uma story conectada real monta com seus handlers', async () => {
		const composed = composeConsoleStories(stories)
		const [name, Story] = Object.entries(composed)[0]!
		const host = document.createElement('div')
		document.body.appendChild(host)
		const root = createRoot(host)
		await act(async () => {
			root.render(<Story />)
		})
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 50))
		})
		console.log(`[spike] msw/node sob bun: ${host.textContent ? 'OK' : 'VAZIO — investigar'} (story: ${name})`)
		expect(host.textContent).toBeTruthy()
		act(() => root.unmount())
		host.remove()
	})
})
```

> Se os handlers msw da story NÃO interceptarem sob bun, o caminho é `setupServer` de `msw/node`
> em `ensureProjectAnnotations` (start com `onUnhandledRequest: 'bypass'`, handlers da story via
> `parameters.msw`). Se nem isso funcionar sob bun, REGISTRE e siga com o fallback da spec — a
> decisão de ajuste é do founder com o spike na mão, não sua.

### Step T4.3 — Religue o smoke ao support

Modifique `stories-smoke.test.tsx`: troque o bloco local de anotações por
`import { ensureProjectAnnotations, composeConsoleStories } from '../support/storybook'` e use-os.

### Step T4.4 — Gates

Run: `cd packages/app/react && bun test tests/support/storybook.spike.test.tsx tests/architecture/stories-smoke.test.tsx` → verde.
Run: `bun x tsc --noEmit` → 0 erros. NÃO commite.

---

## Task T5: `mountRouter` + os dois rails — as armadilhas medidas viram impossíveis

**Files to write:**
- Create: `packages/app/react/tests/support/mountRouter.tsx`
- Create: `packages/app/react/tests/architecture/router-load.test.ts`
- Create: `packages/app/react/tests/architecture/fetch-stub.test.ts`

**Files to read:**
- `packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.test.tsx` (o exemplar do canon)
- `packages/api/typescript/tests/architecture/mcp-exposure.test.ts` (a forma de um rail)

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /storybook, /test
**Depends on:** (none)
**Consumes (frozen):** nada de ondas anteriores (arquivos disjuntos de T2–T4). CONGELA para T9–T11: `mountRouter(ui, opts?)` de `packages/app/react/tests/support/mountRouter.tsx` devolvendo `{ router, host, settled, unmount }`.
**Scope fence:** OUT — NÃO reescrever nenhum teste existente para usar o mountRouter (os 5 atuais com RouterProvider já chamam `router.load()` e passam no rail; a adoção do helper é T9–T11). NÃO tocar harness/composeStories/skill.
**Gate:** `cd packages/app/react && bun test tests/architecture/ tests/support/` verde; falseadores dos DOIS rails executados e registrados (remover um `router.load()` → rail vermelho nomeando; adicionar um stub de fetch fora do inventário → rail vermelho nomeando); `bun x tsc --noEmit` 0 erros. NÃO COMMITAR (T7).

### Step T5.1 — mountRouter

```tsx
// packages/app/react/tests/support/mountRouter.tsx — arquivo final COMPLETO
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
	RouterProvider,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	type AnyRouter,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'

/**
 * O CANON DE MONTAGEM DE ROTA, EMPACOTADO (spec Decision 11) — quem monta rota em teste não
 * consegue esquecer o `router.load()`, porque não escreve essa parte.
 *
 * A armadilha que isto mata, medida em 10/08: sem `load()` o RouterProvider monta VAZIO e só
 * resolve num tick futuro. O build de produção do React descarrega o render sem honrar `act()` e
 * mascarava o buraco; o de desenvolvimento (que o nx ativa via NODE_ENV do .env) o expõe — 18
 * testes passavam por acidente. O rail irmão (`tests/architecture/router-load.test.ts`) pega quem
 * montar na mão.
 */
export interface MountedRouter {
	router: AnyRouter
	host: HTMLDivElement
	/** Espera POR CONDIÇÃO — nunca sleep fixo. Falha nomeando o que ficou pendurado. */
	settled(predicate: () => boolean, label?: string): Promise<void>
	unmount(): void
}

export async function mountRouter(
	ui: ReactNode,
	options?: { path?: string; extraPaths?: string[] },
): Promise<MountedRouter> {
	const host = document.createElement('div')
	document.body.appendChild(host)

	const rootRoute = createRootRoute({ component: () => <>{ui}</> })
	const children = (options?.extraPaths ?? ['/dashboard', '/onboarding']).map(path =>
		createRoute({ getParentRoute: () => rootRoute, path, component: () => null }),
	)
	const router = createRouter({
		routeTree: rootRoute.addChildren(children),
		history: createMemoryHistory({ initialEntries: [options?.path ?? '/'] }),
	})

	// A LINHA que este helper existe para ninguém esquecer:
	await router.load()

	let root: Root | null = null
	await act(async () => {
		root = createRoot(host)
		root.render(<RouterProvider router={router} />)
	})
	await act(async () => {
		await Promise.resolve()
	})

	return {
		router,
		host,
		async settled(predicate, label = 'condição') {
			for (let attempt = 0; attempt < 100; attempt++) {
				if (predicate()) return
				await act(async () => {
					await new Promise(resolve => setTimeout(resolve, 10))
				})
			}
			throw new Error(`mountRouter.settled: ${label} nunca aconteceu`)
		},
		unmount() {
			act(() => root?.unmount())
			host.remove()
		},
	}
}
```

### Step T5.2 — O rail do router.load

```typescript
// packages/app/react/tests/architecture/router-load.test.ts — arquivo final COMPLETO
import { describe, expect, it } from 'bun:test'
import { Glob } from 'bun'

/**
 * RAIL (spec Decision 12, padrão de packages/api/typescript/tests/architecture/): todo teste que
 * monta `RouterProvider` NA MÃO precisa de `router.load()` no mesmo arquivo. O mountRouter torna o
 * erro difícil; este rail o torna impossível de passar. Falseado removendo um `load()` — o teste
 * fica vermelho NOMEANDO o arquivo.
 */
describe('rail: RouterProvider exige router.load()', () => {
	it('nenhum teste monta RouterProvider sem load()', () => {
		const glob = new Glob('src/**/*.test.{ts,tsx}')
		const offenders: string[] = []
		for (const file of glob.scanSync({ cwd: `${import.meta.dir}/../..` })) {
			const source = require('node:fs').readFileSync(`${import.meta.dir}/../../${file}`, 'utf8') as string
			if (source.includes('<RouterProvider') && !source.includes('router.load()') && !source.includes('mountRouter(')) {
				offenders.push(file)
			}
		}
		expect(offenders).toEqual([])
	})
})
```

### Step T5.3 — O rail do stub de fetch, com inventário

```typescript
// packages/app/react/tests/architecture/fetch-stub.test.ts — arquivo final COMPLETO.
// O INVENTÁRIO abaixo é preenchido NO MOMENTO DA EXECUÇÃO desta Task: rode o glob uma vez, liste
// os ofensores REAIS de hoje (esperados: os testes atuais que fazem `globalThis.fetch =`), e cole
// os caminhos. A onda B esvazia a lista; o estado final é [] (spec AC-5).
import { describe, expect, it } from 'bun:test'
import { Glob } from 'bun'

/**
 * RAIL COM INVENTÁRIO (spec AC-5, padrão da varredura de rename): stub manual de
 * `globalThis.fetch` fora do inventário falha nomeando o arquivo. O inventário nasce com os
 * ofensores de HOJE — sem ele, o commit atômico de tooling jamais sairia verde sozinho
 * (Decision 15) — e a onda B o esvazia até []. A fronteira de rede sancionada é o harness de
 * integração (padrão) ou MSW (estados improduzíveis + Storybook).
 */
const INVENTORY: readonly string[] = [
	// PREENCHER NA EXECUÇÃO: caminhos relativos a src/ dos testes que hoje fazem `globalThis.fetch =`.
]

describe('rail: stub manual de fetch só no inventário (que só encolhe)', () => {
	it('nenhum ofensor fora do inventário', () => {
		const glob = new Glob('src/**/*.test.{ts,tsx}')
		const offenders: string[] = []
		for (const file of glob.scanSync({ cwd: `${import.meta.dir}/../..` })) {
			const source = require('node:fs').readFileSync(`${import.meta.dir}/../../${file}`, 'utf8') as string
			if (/globalThis\.fetch\s*=/.test(source) && !INVENTORY.includes(file)) offenders.push(file)
		}
		expect(offenders).toEqual([])
	})

	it('o inventário não acumula entradas mortas', () => {
		const fs = require('node:fs')
		const stale = INVENTORY.filter(file => {
			const path = `${import.meta.dir}/../../${file}`
			return !fs.existsSync(path) || !/globalThis\.fetch\s*=/.test(fs.readFileSync(path, 'utf8'))
		})
		expect(stale).toEqual([])
	})
})
```

### Step T5.4 — Falseie os dois rails

(1) Remova temporariamente um `router.load()` de um teste existente → rail vermelho nomeando o
arquivo → restaure. (2) Adicione `globalThis.fetch = fetch` num teste fora do inventário → rail
vermelho nomeando → remova. Registre as quatro contagens (RED/GREEN de cada) no relato.

### Step T5.5 — Gates

Run: `cd packages/app/react && bun test tests/architecture/ tests/support/` → verde.
Run: `bun x tsc --noEmit` → 0 erros. NÃO commite.

---

## Task T6: A governança — skill, classificação, docs

**Files to write:**
- Rewrite: `.claude/skills/storybook/SKILL.md`
- Rewrite: `.claude/skills/storybook/registry.yaml`
- Modify: `.claude/registry.yaml` — classificação de `packages/app/react/src/**/*.test.{ts,tsx}` → skill `storybook`
- Modify: `docs/FRONTEND.md` — nova seção `## Frontend Testing — layers & boundary rule`

**Files to read:**
- `.claude/skills/storybook/SKILL.md` e `registry.yaml` atuais
- `.claude/registry.yaml` (a entrada de stories, linha ~223–232, como molde)
- relatos de T3/T4/T5 (medições e achados que a skill documenta)

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /storybook
**Depends on:** T3, T4, T5
**Consumes (frozen):** os nomes congelados — `useIntegrationBackend`, `startIntegrationBackend`, `asTestBed()`, `composeConsoleStories`, `ensureProjectAnnotations`, `mountRouter`, os dois rails — exatamente como T3/T4/T5 os criaram (verifique nos arquivos, não invente variações).
**Scope fence:** OUT — nenhum código de produto ou de teste; só os quatro artefatos de governança. DONE elsewhere — todo o tooling (T1–T5).
**Gate:** `bun run test:tooling` verde (valida os registries); `bun review` de um teste do console devolve checklist da skill storybook (AC-8 — rode `bun scripts/review.ts packages/app/react/src/hooks/useSystemPreconditionProbe.test.tsx --print` e confirme a skill resolvida); grep da seção nova em `docs/FRONTEND.md` com os cinco elementos do canon. NÃO COMMITAR (T7).

### Step T6.1 — SKILL.md

Reescreva `.claude/skills/storybook/SKILL.md` mantendo TODO o conteúdo atual sobre stories
(dumb→args, connected→mocks tipados, `parameters.route`/`stores`) e adicionando as seções novas, na
voz do arquivo atual:

1. **Scope** (nova abertura): a skill cobre TODO teste de frontend — stories, `play` via
   `composeConsoleStories`, testes colocados, o harness de integração e os rails. A regra de
   fronteira: *tem tela → story com play; ausência/decisão sem tela → teste colocado; atravessa a
   pilha → e2e*.
2. **Behavior in stories**: `play` + `composeConsoleStories(module)`; smoke garante que toda story
   monta; asserções de comportamento batem no harness por padrão, MSW só para estados improduzíveis
   e para o contexto visual do Storybook (com o veredito do spike da T4 registrado).
3. **The integration harness**: `useIntegrationBackend()` → SDK real contra backend `integration`;
   seeding via `createGivenHelpers(backend.asTestBed())`; nunca `TestBed.create` (dois bancos);
   as medições da T3 (boot/round-trip) como expectativa de custo.
4. **Colocated test canon** (os cinco itens da spec Decision 10, com a razão medida de cada):
   montar o real contra o Container real; asseverar na fronteira que responde à pergunta; `mountRouter`
   (nunca `RouterProvider` na mão — rail); esperar por condição; happy-dom não mede layout.
5. **Rails**: os dois, com a instrução de que o inventário do fetch-stub SÓ encolhe.

### Step T6.2 — registry.yaml da skill

Reescreva `.claude/skills/storybook/registry.yaml` preservando os patterns/bad_practices atuais de
stories e adicionando (ids na sequência existente): pattern *story-as-fixture* (`play` +
`composeConsoleStories`; `.test.tsx` de componente com tela só como import de composeStories);
pattern *integration-harness-default* (comportamento → harness; MSW → improduzível/visual); pattern
*mount-via-helper* (`mountRouter`, nunca RouterProvider manual); bad_practice *manual-fetch-stub*
(`globalThis.fetch =` — mechanical: true, aponta o rail); bad_practice *sleep-based-wait* (espera
fixa em vez de condição); bad_practice *testbed-in-harness* (`TestBed.create` num teste do console —
dois bancos). `canonical_snippet`: o teste de três fases (given → mount/click → assert
comportamento) da spec.

### Step T6.3 — Classificação global + docs

Modifique `.claude/registry.yaml`: duplique a forma da entrada de stories (linha ~223–232) numa
entrada nova para `packages/app/react/src/**/*.test.{ts,tsx}` → skill `storybook`, note: *"Frontend
tests — colocated behavior tests + composeStories; canon/harness/rails na skill."*

Modifique `docs/FRONTEND.md`: nova seção `## Frontend Testing — layers & boundary rule` após
`## Onboarding Step Taxonomy`, cobrindo: a tabela das quatro camadas (story+play / colocado /
harness — como os colocados e plays acessam rede / e2e) com o que cada uma garante e não garante;
a regra de fronteira; o harness (o quê, por quê, custo medido); os dois rails; ponteiro para a
skill. Em inglês, na voz do arquivo.

### Step T6.4 — Gates

Run: `bun run test:tooling` → verde. Run: `bun scripts/review.ts packages/app/react/src/hooks/useSystemPreconditionProbe.test.tsx --print`
→ o cabeçalho resolve para a skill `storybook`. NÃO commite.

---

## Task T7: O commit atômico de tooling

**Files to write:**
- Commit único contendo EXATAMENTE os arquivos de T1(smoke)+T2+T3+T4+T5+T6

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /commit
**Depends on:** T1, T2, T3, T4, T5, T6
**Consumes (frozen):** a lista de arquivos das seis Tasks anteriores, verbatim de `git status`.
**Scope fence:** NENHUM arquivo de produto entra (componente, story, teste de componente específico) — os consertos da onda 0 JÁ foram commitados na T1. Se `git status` mostrar qualquer arquivo fora da lista de tooling, PARE e reporte.
**Gate:** a bateria completa ANTES do commit: `bun tsc` · `bun lint` · `cd packages/api/typescript && bun test` · `cd packages/app/react && bun test` · `bun run test:tooling` — tudo verde; depois do commit, `git show --stat HEAD` listando SÓ tooling (AC-11) e `git status` limpo.

### Step T7.1 — Confira a árvore

`git status --short` deve listar exatamente: os 3 arquivos de `tests/architecture/`, os 4 de
`tests/support/` (react), `tests/setup.ts`, `tsconfig.json` e `package.json` do react,
`BoundedContext.ts` + `.environment.test.ts` e `package.json` + `tests/support/integration-server.ts`
do api, os 2 da skill storybook, `.claude/registry.yaml`, `docs/FRONTEND.md`, e o lockfile do
`bun install`. Qualquer extra → PARE.

### Step T7.2 — Bateria completa

Rode os cinco gates listados acima. Vermelho → volte à Task dona, não commite.

### Step T7.3 — O commit

```bash
git add <a lista exata do T7.1>
git commit -m "feat(testing): frontend-test tooling — story executável, harness integration, canon e rails

Commit ATÔMICO e portável (spec Decision 15): um fork faz cherry-pick disto
sem arrastar nada do produto. Contém: seletor de ambiente do BoundedContext
(default real, integration recusado em produção), harness de integração
(@codm/api-typescript/testing — MainRouter real em porta efêmera, bindings
integration, asTestBed() para os givens), composeStories no bun test (smoke
de toda story + play), mountRouter, rail de RouterProvider sem load(), rail
de fetch-stub com inventário, skill /storybook ampliada, classificação de
*.test.tsx no registry e a seção de camadas em docs/FRONTEND.md.

Medições do spike (AC-10): boot <X>ms · round-trip <Y>ms · delta tsc <Z>s ·
veredito msw-sob-bun: <OK/fallback>.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Substitua `<X>/<Y>/<Z>/<veredito>` pelos números REAIS dos relatos de T3/T4.

### Step T7.4 — Verifique a AC-11

`git show --stat HEAD` — nenhum caminho de componente/story/teste-de-componente do produto. Registre a saída no relato.

---

## Task T8: A varredura por falseamento dos 21 sem tela

**Files to write:**
- Create: `.specs/2026-08-10-consolidacao-teste-frontend-VARREDURA.md` — a tabela teste → veredito
- Delete: os testes que a varredura reprovar (mínimo já medido: o caso "tem exatamente uma entrada por StepId conhecido" de `packages/app/react/src/routes/onboarding/-components/steps.test.ts`)
- Modify: sobreviventes que precisem do canon (`mountRouter`, espera por condição) — só onde a varredura apontar

**Files to read:**
- os 21 listados na spec (Context, parágrafo do recorte)
- `packages/app/react/tests/support/mountRouter.tsx`

**Agent:** qa-tester
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /storybook, /test
**Depends on:** T7
**Consumes (frozen):** de T5 — `mountRouter`; de T7 — o tooling commitado. A lista dos 21: `useThreadRealtime`, `useDeepLinkAuth`, `useSystemPreconditionProbe`, `useAnalyticsConsent`, `useAnalyticsIdentity` (hooks); `steps.test.ts`, `lib/format`, `lib/enums`, `lib/errors`, `errors.toast`, `locales/parity`, `taxonomy-doc` (puros); `container`, `ServicesProvider` (DI); `SupervisionGate`, `OnboardingGate`, `SupervisionBanner`, `UpdateReadyPill`, `badge`, `virtual-list` (console); `BrowserSystemPreconditionsService` (porta).
**Scope fence:** OUT — NENHUM dos 15 com tela (T9–T11); não mexer no tooling commitado.
**Gate:** para CADA um dos 21, o protocolo executado e a linha na tabela: quebra dirigida na implementação → contagem RED → restaura → contagem GREEN; teste que ficou VERDE com a implementação quebrada = descartado com o motivo. `cd packages/app/react && bun test` verde ao final; commit de produto único com a tabela + descartes + ajustes de canon.

### Step T8.1 — O protocolo, por teste

Para cada arquivo: (1) identifique a invariante central; (2) quebre a implementação dela do jeito
mais barato (inverter uma condição, remover uma linha); (3) rode SÓ aquele teste; (4) registre
RED (esperado) ou VERDE (o teste não prova nada); (5) restaure; (6) rode de novo (GREEN). Verde no
passo 4 → o caso (ou o arquivo) é descartado, com o motivo na tabela. O descarte já medido de
`steps.test.ts` executa-se primeiro.

### Step T8.2 — Commit de produto

```bash
git add .specs/2026-08-10-consolidacao-teste-frontend-VARREDURA.md <descartes e ajustes>
git commit -m "test(console): varredura por falseamento dos 21 sem tela — tabela + descartes (onda B)"
```

---

## Task T9: Migração — attach + settings viram stories com play

**Files to write:**
- Create/Modify: stories com `play` para `ContactStep`, `AgentsStep`, `ReviewStep`, `StepHeading`, `WorkspaceStep` (em `routes/attach/-components/*/`) e `ProvidersSection` (em `routes/(app)/settings/-components/`)
- Delete: os `.test.tsx` correspondentes (ou reduzir a import de `composeConsoleStories` quando houver asserção que o `play` não expresse)
- Modify: `packages/app/react/tests/architecture/fetch-stub.test.ts` — remover do INVENTORY os arquivos migrados

**Files to read:**
- os 6 testes atuais + stories existentes desses componentes
- `packages/app/react/tests/support/{storybook,integration-harness,mountRouter}.tsx|ts`
- `.claude/skills/storybook/SKILL.md` (reescrita na T6 — o canon a seguir)

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /storybook
**Depends on:** T7, T8
**Consumes (frozen):** `composeConsoleStories`, `useIntegrationBackend`, `createGivenHelpers(backend.asTestBed())`, `mountRouter` — nomes exatos de T3/T4/T5. O protocolo de migração por componente: (1) varredura por falseamento dos casos atuais (o que não prova, não migra); (2) variantes visuais → story com mocks tipados; (3) comportamento → `play` batendo no harness (MSW só para o improduzível, com comentário dizendo por quê); (4) apagar o `.test.tsx`; (5) tirar o arquivo do INVENTORY do rail.
**Scope fence:** OUT — threads (T10), onboarding/dashboard/header (T11), tooling (commitado).
**Gate:** `cd packages/app/react && bun test` verde (smoke cobre as stories novas; contagem de casos de comportamento ≥ sobreviventes da varredura — nenhuma asserção sobrevivente perdida, listado no relato); rail do fetch-stub verde com INVENTORY menor; commit de produto.

### Step T9.1 — Exemplar (aplicar a mesma forma aos 6)

```tsx
// ContactStep/index.stories.tsx — a FORMA (o executor adapta aos dados reais do componente):
export const Default: Story = {
	parameters: { msw: contactHandlers },     // visual: mocks tipados de @/storybook
}

export const SelecionaContato: Story = {
	parameters: { msw: contactHandlers },
	play: async ({ canvasElement }) => {
		// comportamento que era do .test.tsx, agora executável pelo bun via composeConsoleStories
	},
}
```

E os casos de comportamento que precisem de contrato real (submit, corrida) vão num bloco
`describe` mínimo ao lado da story usando o harness — só quando o `play` mockado não bastar,
com o motivo em comentário.

### Step T9.2 — Commit

`git commit -m "test(console): attach+settings migram para stories com play (onda B)"` com a lista
sobrevivente↔migrado no corpo.

---

## Task T10: Migração — threads viram stories com play

**Files to write:**
- Create/Modify: stories com `play` para `ArtifactPreview`, `Composer`, `SessionChatSection`, `ThreadSettingsDialog`, `TranscriptBubble` (em `routes/(app)/threads/$threadId/-components/*/`)
- Delete/reduce: os `.test.tsx` correspondentes
- Modify: `fetch-stub.test.ts` — INVENTORY menor

**Files to read:** os 5 testes + stories atuais; o support de T3/T4/T5; a skill da T6.

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /storybook
**Depends on:** T7, T8
**Consumes (frozen):** os mesmos nomes e o mesmo protocolo de 5 passos da T9 — aplicados a estes 5 arquivos. `ThreadSettingsDialog` é o exemplar do canon antigo: suas asserções de fronteira (o PUT que sai, o DELETE que NÃO dispara requisição) migram para o harness (a ausência assevera-se com o backend real: a thread apagada de verdade responde 404/não responde) ou permanecem num `.test.tsx` reduzido de `composeConsoleStories` — o que expressar melhor, com o porquê no relato.
**Scope fence:** OUT — attach/settings (T9), onboarding/dashboard/header (T11), tooling.
**Gate:** idem T9; commit de produto próprio.

### Step T10.1 — Protocolo

O mesmo de T9, arquivo a arquivo, com a tabela sobrevivente↔migrado no relato.

---

## Task T11: Migração — onboarding + dashboard + header, e o inventário zera

**Files to write:**
- Create/Modify: stories com `play` para `FullDiskAccessCard`, `OnboardingFlow`, `SetupChecklist`, `UserProfile`
- Delete/reduce: os `.test.tsx` correspondentes
- Modify: `fetch-stub.test.ts` — INVENTORY final `[]` (AC-5)

**Files to read:** os 4 testes + stories atuais; o support; a skill.

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /storybook
**Depends on:** T9, T10
**Consumes (frozen):** os mesmos nomes e protocolo. `OnboardingFlow` carrega o teste de regressão do bug "concluir duas vezes": a migração o REESCREVE como comportamento no harness — seed `completedAt: null`, clicar concluir, asseverar que a navegação vai E FICA em `/dashboard` (o backend real devolve o `completedAt` recém-gravado ao gate) — e o falseia removendo a invalidação, registrando RED/GREEN.
**Scope fence:** OUT — tudo o mais; este é o fechamento.
**Gate:** `INVENTORY: []` no rail e ele verde (AC-5 final); `cd packages/app/react && bun test` verde; `bun tsc && bun lint` limpos; commit de produto final com a tabela.

---

## Final Validation

- [ ] `bun tsc` — 0 erros em todos os workspaces (inclui o delta do paths medido e aceito)
- [ ] `bun lint` — limpo
- [ ] `cd packages/api/typescript && bun test` — verde (o seletor não regrediu nada)
- [ ] `cd packages/app/react && bun test` — verde; tempo total registrado (AC-10, antes × depois)
- [ ] `bun run test:tooling` — verde (registries válidos)
- [ ] `cd packages/e2e && bun run test` — verde e SEM mudança de ambiente (AC-10: diff vazio de `playwright.config.ts`)
- [ ] AC mapping:
  - AC-1 → `packages/app/react/tests/architecture/stories-smoke.test.tsx` (falseado quebrando uma story na T1/T4)
  - AC-2 → Tasks T9–T11: nenhum `.test.tsx` independente dos 15; relatos com a tabela sobrevivente↔migrado
  - AC-3 → `packages/app/react/tests/support/integration-harness.spike.test.tsx:"given do backend semeia o MESMO banco que o servidor lê"`
  - AC-4 → `packages/api/typescript/core/src/types/BoundedContext.environment.test.ts:"FALSEADOR: integration sob NODE_ENV=production é recusado, alto"`
  - AC-5 → `packages/app/react/tests/architecture/fetch-stub.test.ts` com `INVENTORY: []` ao fim da T11, falseado na T5
  - AC-6 → `packages/app/react/tests/architecture/router-load.test.ts`, falseado na T5; `mountRouter` em `tests/support/`
  - AC-7 → `.specs/2026-08-10-consolidacao-teste-frontend-VARREDURA.md` (T8) + descartes commitados
  - AC-8 → gate da T6: `bun scripts/review.ts <teste> --print` resolvendo para a skill storybook
  - AC-9 → `docs/FRONTEND.md` § "Frontend Testing — layers & boundary rule"
  - AC-10 → medições nos relatos de T3/T4 e no corpo do commit da T7; diff vazio no e2e
  - AC-11 → `git show --stat` do commit da T7, registrado no relato

## Notes

**O protocolo de commit desta frente é excepcional e intencional** (spec Decision 15): T1–T6 não
commitam; T7 é o único commit de tooling; onda 0 (se existir) e T8–T11 são commits de produto. Um
executor `/build` deve honrar os campos `Gate` que dizem "NÃO COMMITAR" — commitar por task aqui é
defeito, não zelo.

**Os dois spikes decidem, não travam.** Se o MSW não funcionar sob bun (T4) ou o delta do `tsc`
da opção (a) for ruim (T3), os fallbacks estão na spec (Risks) — registre o número e siga pelo
fallback; a decisão de ajuste fino é do founder com os números na mão, nunca do executor no escuro.

**Os blocos de código de T3/T4/T5 são a forma final INTENCIONAL, mas nomes de exports do core
(`rootContainer`, superfícies de driver) devem ser verificados contra o código real** — ajuste a
FIAÇÃO, nunca o contrato congelado (nomes das funções públicas do harness/support), e registre
todo ajuste no relato.

**Nenhum verbo de `bun cli` se aplica** — os artefatos são test-support, rails e governança, fora
do domínio do scaffolder (PR-27 exempt).
