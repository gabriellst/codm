# UI Fidelity F0 — motor offline da régua — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each Task wraps one observable behavior in an outer RED→GREEN cycle.
>
> **Natureza deste plano: PORT.** A fonte é o repo irmão
> `~/Projetos/bk-products` (leitura permitida; NUNCA escrever lá).
> Os Tasks copiam arquivos de lá (`cp` com caminho absoluto) e aplicam adaptações PONTUAIS
> descritas por região — o conteúdo copiado é a verdade; as adaptações listadas são exaustivas
> (se algo mais parecer "errado" no arquivo copiado, NÃO conserte — reporte).

**Goal:** O motor offline da régua de UI Fidelity portado do bk-products, parametrizado para o
codm e inerte-mas-verde: `bun fidelity` roda ponta-a-ponta e sai 0 com scoreboard vazio, motor
de score calibrado por testes, `bun probe`/`bun design:lint` operacionais, decorator
`fidelity.kind` no preview.

**Architecture:** Scripts em `packages/app/react/scripts/` (já no tsconfig `include` e no
`bun test` do pacote). Runner descobre stories marcadas com `parameters.fidelity` em
`src/**`, builda o Storybook via novo target nx `app-react:storybook-build`, screenshota com
Playwright e pixel-diffa contra `design/fidelity/targets/**` (inexistentes até F1 → curto-
circuito inerte). Allowlists moram num módulo de dados irmão, vazias. O compilador de tokens é
portado mas NÃO ligado ao `tokens.css` atual (isso é F2).

**Tech Stack:** TypeScript, Bun, Playwright, pixelmatch, pngjs, Storybook 10, Nx

**Spec:** .specs/2026-08-24-extracao-ui-fidelity.md
**Tasks:** 6
**Estimated minutes:** 175

---

## Task T1: Motor de score portado e calibrado

**Files to write:**
- Create: `packages/app/react/scripts/fidelity.ts`
- Create: `packages/app/react/scripts/fidelity-allowlists.ts`
- Create: `packages/app/react/scripts/fidelity.test.ts`
- Modify: `packages/app/react/package.json` — devDeps `pixelmatch`/`pngjs` + types

**Files to read:**
- `~/Projetos/bk-products/packages/app/ui/scripts/fidelity.ts`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** (none)
**Scope fence:** DONE em F0 nenhum target/story marcada existe — NÃO criar targets, NÃO marcar
stories, NÃO tocar `.storybook/` (T2), NÃO tocar `packages/app/styles/`. OUT: nx target e
scripts raiz (T2).
**Gate:** `cd packages/app/react && bun test scripts/fidelity.test.ts && bun x tsc --noEmit`

### Step T1.1 — Instalar dependências do motor

```bash
cd packages/app/react && bun add -d pixelmatch@^7.1.0 pngjs@^7.0.0 @types/pixelmatch@^5.2.6 @types/pngjs@^6.0.5
```

Expected: `package.json` do app-react ganha as 4 devDeps; lockfile da raiz atualizado.
(`playwright ^1.59.1` já existe nas devDependencies da RAIZ — não adicionar de novo.)

### Step T1.2 — Copiar o motor + teste de calibração da fonte

```bash
cp ~/Projetos/bk-products/packages/app/ui/scripts/fidelity.ts packages/app/react/scripts/fidelity.ts
cp ~/Projetos/bk-products/packages/app/ui/scripts/fidelity.test.ts packages/app/react/scripts/fidelity.test.ts
```

### Step T1.3 — Rodar o teste copiado para ver o estado (RED esperado só se a adaptação faltar)

Run: `cd packages/app/react && bun test scripts/fidelity.test.ts`
Expected: PASS já nesta etapa (o teste exercita só `computeScore`/`storyId`, puros) — se
falhar por import, as adaptações do T1.4 resolvem.

### Step T1.4 — Adaptar `fidelity.ts` ao codm (edições exaustivas, nada além destas)

Modify `packages/app/react/scripts/fidelity.ts`:

1. **Bloco de caminhos** (constantes no topo, logo após os imports): substituir o bloco
   `REPO_ROOT`…`REPORT_PATH` por:

```typescript
const REPO_ROOT = join(import.meta.dir, '..', '..', '..', '..')
const REACT_ROOT = join(REPO_ROOT, 'packages', 'app', 'react')
const REACT_SRC = join(REACT_ROOT, 'src')
const STORYBOOK_STATIC = join(REACT_ROOT, 'storybook-static')
const FIDELITY_ROOT = join(REPO_ROOT, 'design', 'fidelity')
const TARGETS_DIR = join(FIDELITY_ROOT, 'targets')
const CURRENT_DIR = join(FIDELITY_ROOT, 'current')
const DELTAS_DIR = join(FIDELITY_ROOT, 'deltas')
const SCOREBOARD_PATH = join(FIDELITY_ROOT, 'scoreboard.json')
const REPORT_PATH = join(FIDELITY_ROOT, 'report.html')
```

   (Some `UI_COMPONENTS_DIR` e `EXTENSION_POPUP_DIR` — o codm não tem esses workspaces; os
   docblocks colados a elas saem junto.)

2. **Allowlists → import de dados.** Deletar as três constantes inline
   `ITEM_THRESHOLD_OVERRIDES`, `ITEM_TILE_ALLOWLIST`, `ITEM_REGION_LANE_ACCEPTED` (com seus
   conteúdos do bk-products: breadcrumb, web-04-*, ext-07-*, onb-01-*, onb-05-*, web-07b-*) e
   substituir por:

```typescript
import { ITEM_REGION_LANE_ACCEPTED, ITEM_THRESHOLD_OVERRIDES, ITEM_TILE_ALLOWLIST } from './fidelity-allowlists'
```

   Manter os docblocks de DOUTRINA (ratchet, why obrigatório) — eles se mudam para o novo
   arquivo de dados no T1.5.

3. **Discovery em `main()`**: onde a fonte agrega múltiplos roots
   (`discoverFidelityItems(REACT_SRC)` + `UI_COMPONENTS_DIR` + `EXTENSION_POPUP_DIR`), chamar
   somente `await discoverFidelityItems(REACT_SRC)`.

4. **Build do storybook em `main()`**: trocar o comando
   `bun x nx run app-react:storybook-build --skip-nx-cache` por
   `bun x nx run app-react:storybook-build` e REMOVER o comentário-why do `--skip-nx-cache`
   (o input do cache no codm cobre `src/**` via `production` — T2 declara o target assim; o
   hack do bk existia porque as stories moravam fora do projeto nx).

5. **Prosa de caminho nos docblocks**: onde o cabeçalho cita `packages/app/ui`, ajustar para
   `packages/app/react/scripts` (comentário apenas — sem efeito de runtime).

### Step T1.5 — Arquivo de dados das allowlists (nasce vazio)

Create `packages/app/react/scripts/fidelity-allowlists.ts` — COMPLETE final file:

```typescript
// packages/app/react/scripts/fidelity-allowlists.ts — os RATCHETS da régua, separados do motor.
//
// Doutrina (portada de bk-products docs/UI-FIDELITY.md, "Pista 2" regra 5 + técnicas):
// toda entrada aqui é um RATCHET — entra RARO, só depois de esgotar as alavancas legítimas de
// implementação, sempre com `why` gravado verbatim (ele aparece no scoreboard.json e no
// report.html — nada é varrido para baixo do tapete), e SAI quando o resíduo desaparecer
// (alvo re-exportado, mudança de fonte, wave dedicada). Baixar threshold exige why; subir não.
//
// As três listas nascem VAZIAS no codm: nenhuma dívida foi medida ainda (F0 é o motor inerte).
// A primeira entrada real só existe depois de uma wave de F3 iterar de verdade sobre um item.

/** Threshold por item ABAIXO do default (components 0.90 / screens 0.85) — só components. */
export const ITEM_THRESHOLD_OVERRIDES: Record<string, { threshold: number; why: string }> = {}

/** Tiles individuais aceitos por conteúdo LEGITIMAMENTE dinâmico/indisponível — nunca estilo errado. */
export const ITEM_TILE_ALLOWLIST: Record<string, { x: number; y: number; why: string }[]> = {}

/** Aceite INTEGRAL da pista de região de uma tela — decisão explícita do founder, why datado. */
export const ITEM_REGION_LANE_ACCEPTED: Record<string, { why: string }> = {}
```

### Step T1.6 — Verificar calibração e tipos

Run: `cd packages/app/react && bun test scripts/fidelity.test.ts && bun x tsc --noEmit`
Expected: todos os testes de calibração PASS (tolerância ±1px, tile floor, lane de cor,
shift-annotation); tsc 0 erros.

### Step T1.7 — Commit

```bash
git add packages/app/react/scripts/fidelity.ts packages/app/react/scripts/fidelity-allowlists.ts \
        packages/app/react/scripts/fidelity.test.ts packages/app/react/package.json bun.lock
git commit -m "feat(fidelity): port do motor de score do bk-products, allowlists como dados vazios (Task T1)"
```

## Task T2: `bun fidelity` roda inerte de ponta a ponta

**Files to write:**
- Modify: `packages/app/react/.storybook/preview.tsx` — decorator ganha os branches `fidelity.kind`
- Modify: `packages/app/react/project.json` — novo target `storybook-build`; `scripts/**` nos inputs de `test`
- Modify: `package.json` — scripts raiz `fidelity`, `design:lint`, `probe`
- Modify: `.gitignore` — artefatos regeneráveis de `design/fidelity/`

**Files to read:**
- `~/Projetos/bk-products/packages/app/react/.storybook/preview.tsx`
- `packages/app/react/.storybook/preview.tsx`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /storybook
**Depends on:** T1
**Consumes (frozen):** `packages/app/react/scripts/fidelity.ts` (runner com entrypoint
`import.meta.main`, discovery em `src/**`, nx target literal `app-react:storybook-build`,
saídas `design/fidelity/{scoreboard.json,report.html}`); contrato do decorator: `context.parameters.fidelity`
com shape `{ slug: string; kind?: 'components' | 'screens' }`.
**Scope fence:** DONE em T1 (motor, allowlists — não editar). OUT: probe (T3), design-lint
(T4), generate-tokens (T5). NÃO marcar nenhuma story com `parameters.fidelity` — F0 é inerte.
**Gate:** `bun fidelity` sai 0 escrevendo scoreboard vazio; `cd packages/app/react && bun test tests/architecture/stories-smoke.test.tsx && bun x tsc --noEmit`

### Step T2.1 — Decorator `fidelity.kind` no preview

Modify `packages/app/react/.storybook/preview.tsx`, primeiro decorator (o wrapper de
theme+i18n): imediatamente após o `React.useEffect` do locale, inserir o bloco portado do
bk-products (adaptando só a prosa; o código é idêntico):

```typescript
			// Contrato do runner de fidelity (scripts/fidelity.ts): story `kind: 'components'`
			// renderiza EXATAMENTE UM filho sob #storybook-root — o próprio componente (screenshot
			// do tight bounding box contra alvo tight-crop do Pencil). O wrapper min-h-screen p-6
			// estica o bounding box para a largura do iframe → mismatch de dimensão (score 0).
			// `kind: 'screens'` screenshota #storybook-root inteiro: mantém a div de tema, perde o
			// sizing/padding. Alvos do Pencil têm canvas transparente — body fica transparente
			// durante story de componente para o diff não comparar transparência contra fundo opaco.
			const fidelity = context.parameters.fidelity as { slug?: string; kind?: string } | undefined
			const isFidelityItem = Boolean(fidelity?.slug)
			const isComponentFidelity = isFidelityItem && (fidelity?.kind ?? 'components') === 'components'
			const isScreenFidelity = isFidelityItem && fidelity?.kind === 'screens'
			React.useEffect(() => {
				if (!isComponentFidelity) return
				const prev = document.body.style.backgroundColor
				document.body.style.backgroundColor = 'transparent'
				return () => {
					document.body.style.backgroundColor = prev
				}
			}, [isComponentFidelity])
			if (isComponentFidelity) return <Story />
			if (isScreenFidelity)
				return (
					<div className={theme === 'dark' ? 'dark' : ''}>
						<Story />
					</div>
				)
```

O `return` existente (wrapper completo) permanece como caminho default logo abaixo.

### Step T2.2 — Target nx `storybook-build` + inputs de `test`

Modify `packages/app/react/project.json`:

1. Adicionar target (irmão de `build`):

```json
"storybook-build": {
	"executor": "nx:run-commands",
	"cache": true,
	"//inputs": "mesma superfície do bundle vite de `build` + .storybook/** (main.ts/preview.tsx dirigem o que é buildado). Com as stories DENTRO deste projeto, o cache invalida certo — é por isso que scripts/fidelity.ts NÃO precisa de --skip-nx-cache (o bk precisava porque as stories moravam noutro workspace fora dos inputs).",
	"inputs": ["production", "^production", "{projectRoot}/.storybook/**/*"],
	"outputs": ["{projectRoot}/storybook-static"],
	"options": {
		"command": "storybook build",
		"cwd": "packages/app/react"
	}
}
```

2. No target `test`, ampliar `inputs` para incluir os testes dos scripts:
   `"inputs": ["{projectRoot}/src/**/*", "{projectRoot}/tests/**/*", "{projectRoot}/scripts/**/*", "{projectRoot}/bunfig.toml"]`.

### Step T2.3 — Scripts raiz + gitignore

Modify `package.json` (raiz): dentro de `"scripts"`, após a entrada `"e2e"`, adicionar:

```json
"fidelity": "bun packages/app/react/scripts/fidelity.ts",
"design:lint": "bun packages/app/react/scripts/design-lint.ts",
"probe": "bun packages/app/react/scripts/probe-geometry.ts",
```

(`design:lint` e `probe` apontam para arquivos que T3/T4 criam — o script raiz é declarado
uma vez aqui para o diff de wiring ficar em um único Task; até lá os dois comandos falham
com "module not found", o que é aceitável dentro da wave.)

Modify `.gitignore`: ao final, adicionar o bloco:

```
# UI Fidelity — artefatos regeneráveis por `bun fidelity` (targets/ são commitados, F1)
design/fidelity/current/
design/fidelity/deltas/
design/fidelity/scoreboard.json
design/fidelity/report.html
```

### Step T2.4 — Rodar o runner inerte (o teste de aceitação do Task)

Run: `bun fidelity`
Expected: exit 0; stdout informa 0 itens marcados; `design/fidelity/scoreboard.json` existe
com lista vazia e `design/fidelity/report.html` existe; `git status` NÃO mostra nenhum dos
dois (gitignore correto).

### Step T2.5 — Rail de stories continua verde + tipos

Run: `cd packages/app/react && bun test tests/architecture/stories-smoke.test.tsx && bun x tsc --noEmit`
Expected: PASS (nenhuma story existente muda de render — só stories com `parameters.fidelity`
entram nos branches novos, e não há nenhuma) e tsc 0 erros.

### Step T2.6 — Commit

```bash
git add packages/app/react/.storybook/preview.tsx packages/app/react/project.json package.json .gitignore
git commit -m "feat(fidelity): runner inerte ponta-a-ponta — decorator fidelity.kind, target storybook-build, wiring raiz (Task T2)"
```

## Task T3: Sonda de geometria (`bun probe`)

**Files to write:**
- Create: `packages/app/react/scripts/probe-geometry.ts`

**Files to read:**
- `~/Projetos/bk-products/packages/app/ui/scripts/probe-geometry.ts`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /storybook
**Depends on:** T2
**Consumes (frozen):** saída `packages/app/react/storybook-static` do target
`app-react:storybook-build` (T2); script raiz `probe` já declarado em T2 apontando para este
arquivo.
**Scope fence:** cópia com UMA adaptação de caminho. NÃO tocar fidelity.ts, preview, nem
adicionar CLI flags novas.
**Gate:** `bun probe <storyId-existente>` imprime a geometria dos filhos do body.

### Step T3.1 — Copiar e adaptar

```bash
cp ~/Projetos/bk-products/packages/app/ui/scripts/probe-geometry.ts packages/app/react/scripts/probe-geometry.ts
```

Modify `packages/app/react/scripts/probe-geometry.ts`: trocar a constante
`const STORYBOOK_STATIC = join(import.meta.dir, '..', '..', 'react', 'storybook-static')` por
`const STORYBOOK_STATIC = join(import.meta.dir, '..', 'storybook-static')` (o script agora
mora DENTRO do pacote react). Nenhuma outra edição.

### Step T3.2 — Verificar contra uma story real

Run (o `storybook-static` de T2.4 já existe):

```bash
bun probe components-badge--default 2>/dev/null || bun probe $(ls packages/app/react/storybook-static/index.json >/dev/null 2>&1 && bun -e "const j=await Bun.file('packages/app/react/storybook-static/index.json').json(); console.log(Object.keys(j.entries)[0])")
```

Expected: saída tabular com tag/slot/top/left/width/height dos filhos do body da story.
(O primeiro id vindo do `index.json` garante um id válido sem depender de nome específico.)

### Step T3.3 — Tipos + commit

Run: `cd packages/app/react && bun x tsc --noEmit`
Expected: 0 erros.

```bash
git add packages/app/react/scripts/probe-geometry.ts
git commit -m "feat(fidelity): porta a sonda de geometria bun probe (Task T3)"
```

## Task T4: Design-lint inerte com falsificadores

**Files to write:**
- Create: `packages/app/react/scripts/design-lint.ts`
- Create: `packages/app/react/scripts/design-lint.test.ts`

**Files to read:**
- `~/Projetos/bk-products/packages/app/ui/scripts/design-lint.ts`
- `~/Projetos/bk-products/packages/app/ui/scripts/design-lint.test.ts`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T2
**Consumes (frozen):** script raiz `design:lint` (declarado em T2) apontando para este
arquivo; convenção de dados `design/system/pen/{components,screens}/*.json` + `tokens.json`
(inexistentes até F1 — `loadSpecs` já devolve `[]` quando o diretório não existe).
**Scope fence:** cópia com adaptação de caminho e prosa. As 5 regras (R1–R5) vêm INTACTAS —
não afinar regra nenhuma para o codm antes de existir design extraído (F1).
**Gate:** `bun design:lint` sai 0; `cd packages/app/react && bun test scripts/design-lint.test.ts` PASS.

### Step T4.1 — Copiar

```bash
cp ~/Projetos/bk-products/packages/app/ui/scripts/design-lint.ts packages/app/react/scripts/design-lint.ts
cp ~/Projetos/bk-products/packages/app/ui/scripts/design-lint.test.ts packages/app/react/scripts/design-lint.test.ts
```

### Step T4.2 — Adaptar caminho e prosa

Modify `packages/app/react/scripts/design-lint.ts`:
1. `const DESIGN_ROOT = join(import.meta.dir, '..', '..', '..', '..', 'design', 'system', 'pen')`
   — a profundidade da fonte (`app/ui/scripts`) é a MESMA de `app/react/scripts`; conferir e
   manter o valor, ajustando apenas o comentário de cabeçalho que cita `packages/app/ui`.
2. Mensagens que citam decisões do bk ("decisão do founder, F8", `bk-reviews-extension`):
   manter o conteúdo da REGRA, trocar a referência de prosa por "ver docs/UI-FIDELITY.md".

### Step T4.3 — Verificar

Run: `bun design:lint && cd packages/app/react && bun test scripts/design-lint.test.ts && bun x tsc --noEmit`
Expected: lint sai 0 com "nada a lintar" (sem `design/system/pen/`); falsificadores
sintéticos PASS (cada regra pega seu defeito plantado em mkdtemp E não acusa os
falsos-positivos documentados); tsc 0 erros.

### Step T4.4 — Commit

```bash
git add packages/app/react/scripts/design-lint.ts packages/app/react/scripts/design-lint.test.ts
git commit -m "feat(fidelity): porta o design-lint (inerte ate F1) com falsificadores (Task T4)"
```

## Task T5: Compilador de tokens portado (fixture, sem ligar o carrier)

**Files to write:**
- Create: `packages/app/react/scripts/generate-tokens.ts`
- Create: `packages/app/react/scripts/generate-tokens.test.ts`

**Files to read:**
- `~/Projetos/bk-products/packages/app/ui/scripts/generate-tokens.ts`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T1
**Consumes (frozen):** nenhuma API de T1 — a dependência é só de wave (mesmo diretório,
`package.json` já tocado por T1 não é tocado aqui).
**Scope fence:** o compilador NÃO roda contra o repo em F0: `design/system/pen/tokens.json`
não existe e `packages/app/styles/tokens.css` NÃO pode ser tocado (Decision 2 da spec — o
cascade atual continua mandando até F2). Teste usa fixture sintética em tmpdir. NÃO portar o
golden test do bk (pressupõe tokens.json commitado).
**Gate:** `cd packages/app/react && bun test scripts/generate-tokens.test.ts && bun x tsc --noEmit`

### Step T5.1 — Copiar e parametrizar

```bash
cp ~/Projetos/bk-products/packages/app/ui/scripts/generate-tokens.ts packages/app/react/scripts/generate-tokens.ts
```

Modify `packages/app/react/scripts/generate-tokens.ts`:
1. Caminhos:

```typescript
const REPO_ROOT = join(import.meta.dir, '..', '..', '..', '..')
export const TOKENS_JSON_PATH = join(REPO_ROOT, 'design/system/pen/tokens.json')
export const TOKENS_CSS_PATH = join(REPO_ROOT, 'packages', 'app', 'styles', 'tokens.generated.css')
```

2. **`LEGACY_VAR_MAP` → vazio**: substituir o mapa inteiro (as ~45 vars legadas do bk:
   sidebar/rail/composer/chat/bubble/chart/brand-purple etc.) por `{}` mantendo o docblock
   adaptado: o mapa do CODM será derivado das vars hard-written de
   `packages/app/styles/tokens.css` na F2 (grep de `var(--` nos consumidores × chaves do pen),
   nunca copiado do bk.
3. **Entrypoint defensivo**: no bloco `import.meta.main`, se `TOKENS_JSON_PATH` não existir,
   imprimir `generate-tokens: design/system/pen/tokens.json ainda não existe (F1 extrai do
   .pen) — nada a gerar` e sair 0 (a função `generateTokensCss(tokens)` pura permanece
   exportada e testável).
4. Docblock de cabeçalho: trocar citações a `bk-reviews-extension.lib.pen`/`app/ui/styles`
   pelos equivalentes codm (`design/codm.pen`, `packages/app/styles/tokens.generated.css`).

### Step T5.2 — Teste de fixture (novo — substitui o golden do bk)

Create `packages/app/react/scripts/generate-tokens.test.ts` — COMPLETE final file:

```typescript
// generate-tokens.test.ts — o compilador é puro e testável sem design/ existir (F0).
// O golden byte-a-byte contra o carrier COMMITADO (como no bk-products) entra na F2, quando
// design/system/pen/tokens.json for extraído e packages/app/styles/tokens.generated.css nascer.
import { describe, expect, it } from 'bun:test'
import { generateTokensCss, type TokensJson } from './generate-tokens'

const FIXTURE: TokensJson = {
	variables: {
		bg: { type: 'color', value: '#101010' },
		primary: { type: 'color', value: '#65a30d' },
		'radius-md': { type: 'number', value: 8 },
		'font-sans': { type: 'string', value: 'Inter' },
	},
}

describe('generateTokensCss', () => {
	it('emite todo token de cor como --color-* dentro de @theme inline', () => {
		const css = generateTokensCss(FIXTURE)
		expect(css).toContain('@theme inline')
		expect(css).toContain('--color-bg')
		expect(css).toContain('--color-primary')
		expect(css).toContain('#65a30d')
	})

	it('emite tokens não-cor (number/string) com o valor resolvido', () => {
		const css = generateTokensCss(FIXTURE)
		expect(css).toContain('radius-md')
		expect(css).toContain('Inter')
	})

	it('é determinístico e idempotente (mesma entrada → byte-igual)', () => {
		expect(generateTokensCss(FIXTURE)).toBe(generateTokensCss(FIXTURE))
	})
})
```

**Nota de adaptação:** se na fonte a função pura tiver outro nome/assinatura (ex.: recebe
caminho em vez de objeto), ajustar o TESTE para a assinatura real exportada — a regra é: o
teste exercita a função PURA exportada com a fixture acima; não refatorar o script para
agradar o teste além de exportar a função pura se ainda não for exportada.

### Step T5.3 — Verificar

Run: `cd packages/app/react && bun test scripts/generate-tokens.test.ts && bun x tsc --noEmit && bun scripts/generate-tokens.ts`
Expected: 3 testes PASS; tsc 0 erros; a execução direta sai 0 com a mensagem de "nada a
gerar" e NENHUM arquivo novo em `packages/app/styles/` (conferir com `git status`).

### Step T5.4 — Commit

```bash
git add packages/app/react/scripts/generate-tokens.ts packages/app/react/scripts/generate-tokens.test.ts
git commit -m "feat(fidelity): porta o compilador de tokens (carrier so na F2) (Task T5)"
```

## Task T6: `docs/UI-FIDELITY.md` adaptado ao codm

**Files to write:**
- Create: `docs/UI-FIDELITY.md`

**Files to read:**
- `~/Projetos/bk-products/docs/UI-FIDELITY.md`
- `.specs/2026-08-24-extracao-ui-fidelity.md`

**Agent:** claude
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** (none)
**Depends on:** T2, T3, T4, T5
**Consumes (frozen):** nomes de comando reais deste repo: `bun fidelity`, `bun design:lint`,
`bun probe <storyId>`, target `app-react:storybook-build`; caminhos
`packages/app/react/scripts/*`, `design/fidelity/**`, `design/system/pen/**`,
`packages/app/styles/tokens.generated.css`; estado F0 (allowlists vazias, targets inexistentes).
**Scope fence:** portar o CONHECIMENTO, não o estado: o cânon de armadilhas (39 itens) e as
"técnicas provadas" vêm ÍNTEGROS (itens específicos do bk viram exemplos citados como
"medido no bk-products"); as seções "Estado & histórico" e allowlists/telas do bk NÃO vêm —
o histórico do codm começa em F0. Seção nova curta "Estado no codm" aponta a spec e as fases
F1–F3 pendentes.
**Gate:** `bun lint` (o doc não entra em rail, mas o commit passa a bateria normal).

### Step T6.1 — Escrever o doc

Estrutura obrigatória (espelho do bk com paths/comandos do codm):
1. Cabeçalho: por que existe + fontes de verdade (`design/codm.pen`,
   `design/system/pen/**` [F1], `design/fidelity/targets/**` [F1]).
2. Pista 1 (gates G1–G4 — marcados "F2, ainda não implementados aqui") e Pista 2 (a régua,
   thresholds 0.90/0.85, 3 lanes, allowlists-ratchet em `fidelity-allowlists.ts`).
3. O loop operacional + operação em waves (medição SERIAL, workers nunca comitam).
4. Nomeação semântica; fonte de estilo = spec do MCP, nunca o olho; hierarquia de verdade
   spec JSON > PNG > olho.
5. **Cânon de armadilhas (39) completo** + técnicas provadas (band-scan, foto-fixture,
   medir-o-pixel, sonda de geometria = `bun probe`, bisseção, varredura por literal).
6. O critério de RELEVÂNCIA (a régua serve ao olho — as 3 perguntas).
7. "Estado no codm": F0 concluída (motor inerte), F1–F3 pendentes, link para a spec; MCP
   alvo = Pen.app desktop (`--app desktop`).

### Step T6.2 — Commit

```bash
git add docs/UI-FIDELITY.md
git commit -m "docs(fidelity): processo UI-FIDELITY adaptado ao codm — canon integral, estado F0 (Task T6)"
```

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `cd packages/app/react && bun run test` — suíte do pacote (inclui scripts/*.test.ts e rails) verde
- [ ] `bun fidelity` — exit 0, scoreboard vazio, nada novo no `git status`
- [ ] AC mapping:
  - AC-1 → `packages/app/react/scripts/fidelity.test.ts` (suíte de calibração completa, T1)
  - AC-2 → gate do T2 (`bun fidelity` inerte, Step T2.4)
  - AC-3 → `packages/app/react/tests/architecture/stories-smoke.test.tsx` (Step T2.5) + decorator (Step T2.1)
  - AC-4 → `packages/app/react/scripts/design-lint.test.ts` + gate `bun design:lint` (T4)
  - AC-5 → gate do T3 (`bun probe`, Step T3.2)
  - AC-6 → `packages/app/react/scripts/generate-tokens.test.ts` (T5)
  - AC-7 → Steps T2.3/T2.4 (gitignore + git status limpo) e Final Validation acima

## Notes

- **Fonte do port**: `~/Projetos/bk-products` — LEITURA apenas.
  Nunca `cd` para lá com comando de escrita; nunca commitar lá.
- **E2E não se aplica**: F0 não tem superfície de produto — o `bun e2e --grep` padrão do
  Final Validation é dispensado nesta fase (nenhuma jornada nova).
- **`boxBlur3` no motor**: a fonte exporta uma função morta (resultado negativo registrado —
  blur pré-diff testado e descartado). MANTER na cópia com o docblock: é conhecimento, e a
  régua v3 (bump futuro documentado no UI-FIDELITY.md do bk) volta a usá-la.
- Sem worktree: sessão configurada para trabalhar in-place; commits por Task em fatias
  atômicas já dão a reversibilidade.
