# Indicador "Pensando" — Implementation Plan

> **For agentic workers:** Execute via `/build`. Cada Task embrulha um comportamento
> observável em ciclo RED→GREEN. A base JÁ EXISTE e é sofisticada — leia os docblocks dos
> arquivos citados ANTES de editar: `SustainTypingPresence` (lease anti-dangling em fila
> durável), `StreamChannelReply`/`ReplyStreamer` (primeiro corte ENVIA, demais EDITAM,
> entrega final canônica), `ChannelSender` (send/edit/signalTyping prontos), gateway Go
> com `SendChatPresenceController`/`EditMessageController` prontos. NADA de reinventar
> essas peças; o trabalho é INTEGRAÇÃO.

**Goal:** Durante um run de agente: contato vê "digitando…" + mensagem "✻ Pensando — {verbo}"
que evolui por fase e termina editada como a resposta; console mostra o spinner ease; o
indicador de digitação nunca dangla (lease já existente, auditado).

**Architecture:** Cues (glifos+verbos+ease) num módulo FOLHA de core-typescript consumido
por daemon e console. O turn abre o stream de resposta JÁ com a mensagem "Pensando"
(registrando o messageId no ReplyStreamer) — assim os cortes de streaming e a entrega
final EDITAM a mesma mensagem por construção. Transições de fase (frames do
AgentRuntimeEvent) avançam o verbo por edição best-effort. Console: componente novo no
chat, dirigido pelo estado WORKING já streamado por SSE. Sem mudança de contrato.

**Tech Stack:** TypeScript, Bun, tsyringe, CommandQueue durável, React, Storybook, Playwright

**Spec:** .specs/2026-08-25-thinking-indicator.md
**Tasks:** 5
**Estimated minutes:** 240

---

## Task T1: Cues compartilhados — glifos, verbos PT e a curva ease

**Files to write:**
- Create: `packages/api/typescript/core/src/utils/ThinkingCues.ts`
- Create: `packages/api/typescript/core/src/utils/ThinkingCues.test.ts`
- Modify: `packages/api/typescript/core/src/index.ts` — export do módulo novo (uma linha no barrel)

**Files to read:**
- `packages/api/typescript/core/src/utils/` (idioma dos utils existentes)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** (none)
**Scope fence:** módulo FOLHA — ZERO imports (nem de dentro do core): é o que permite o
console importá-lo sem arrastar o kernel Node pro bundle (T3 valida com build-spa). OUT:
qualquer uso dos cues (T2/T3).
**Gate:** `cd packages/api/typescript && bun test core/src/utils/ThinkingCues.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T1.1 — Teste que falha (a matemática da spec)

```typescript
// packages/api/typescript/core/src/utils/ThinkingCues.test.ts
import { describe, expect, it } from 'bun:test'
import { THINKING_GLYPHS, THINKING_VERBS, easeSpinnerFrames, pickThinkingVerb } from './ThinkingCues'

describe('THINKING_GLYPHS', () => {
	it('é o ciclo rotacionado: começa e termina em ✻ (AC-4)', () => {
		expect(THINKING_GLYPHS[0]).toBe('✻')
		expect(THINKING_GLYPHS[THINKING_GLYPHS.length - 1]).toBe('✻')
		// os 26 glifos da diretiva + o retorno ao inicial
		expect(THINKING_GLYPHS.length).toBe(27)
		expect(new Set(THINKING_GLYPHS.slice(0, -1)).size).toBe(26)
	})
})

describe('easeSpinnerFrames', () => {
	it('rápido no meio, desacelera nas pontas (ease-in-out invertido em delay)', () => {
		const frames = easeSpinnerFrames(2000)
		expect(frames.length).toBe(THINKING_GLYPHS.length)
		const delays = frames.map(f => f.delayMs)
		const mid = Math.floor(delays.length / 2)
		expect(delays[0]).toBeGreaterThan(delays[mid])
		expect(delays[delays.length - 1]).toBeGreaterThan(delays[mid])
		// soma ≈ duração pedida (tolerância de arredondamento por frame)
		const total = delays.reduce((a, b) => a + b, 0)
		expect(Math.abs(total - 2000)).toBeLessThanOrEqual(frames.length)
	})
	it('primeiro e último frame carregam ✻', () => {
		const frames = easeSpinnerFrames(1000)
		expect(frames[0].glyph).toBe('✻')
		expect(frames[frames.length - 1].glyph).toBe('✻')
	})
})

describe('pickThinkingVerb', () => {
	it('nunca repete o verbo imediatamente anterior (AC-5)', () => {
		let prev = pickThinkingVerb()
		for (let i = 0; i < 200; i++) {
			const next = pickThinkingVerb(prev)
			expect(next).not.toBe(prev)
			expect(THINKING_VERBS).toContain(next)
			prev = next
		}
	})
	it('a lista tem ~60 verbos PT únicos terminados em -ndo', () => {
		expect(THINKING_VERBS.length).toBeGreaterThanOrEqual(55)
		expect(new Set(THINKING_VERBS).size).toBe(THINKING_VERBS.length)
		for (const v of THINKING_VERBS) expect(v).toMatch(/ndo$/)
	})
})
```

### Step T1.2 — Rodar e ver falhar

Run: `cd packages/api/typescript && bun test core/src/utils/ThinkingCues.test.ts`
Expected: FAIL — `Cannot find module './ThinkingCues'`

### Step T1.3 — Implementação (arquivo COMPLETO)

```typescript
// packages/api/typescript/core/src/utils/ThinkingCues.ts — MÓDULO FOLHA, zero imports.
// Consumido pelo daemon (mensagem de fase no canal) E pelo console (spinner do chat) —
// uma lista só (spec AC-5). A ausência de imports é CONTRATO: o bundle do console puxa
// este arquivo sem arrastar o kernel Node do core (validado pelo build-spa em T3).

/** Os 26 glifos da diretiva do founder, ROTACIONADOS para abrir em ✻, + o retorno a ✻. */
export const THINKING_GLYPHS = [
	'✻', '✼', '✽', '✾', '✿', '❀', '❁', '❂', '❃', '❄', '❅', '❆', '❇', '❈',
	'✦', '✧', '✱', '✲', '✳', '✴', '✵', '✶', '✷', '✸', '✹', '✺', '✻',
] as const

export interface SpinnerFrame {
	glyph: (typeof THINKING_GLYPHS)[number]
	delayMs: number
}

/**
 * Delays por frame com ease-in-out INVERTIDO em tempo: o ciclo acelera até o meio e
 * desacelera nas pontas ("rápida no meio e no final desacelera" — founder). O peso de cada
 * frame é 1 + amplitude·cos(2π·t) normalizado, distribuindo `totalMs` de forma que os
 * extremos (✻→ e →✻) durem mais que o miolo.
 */
export function easeSpinnerFrames(totalMs: number): SpinnerFrame[] {
	const n = THINKING_GLYPHS.length
	const weights = Array.from({ length: n }, (_, i) => {
		const t = i / (n - 1)
		return 1 + 0.85 * Math.cos(2 * Math.PI * (t - 0.5))
	})
	const sum = weights.reduce((a, b) => a + b, 0)
	return THINKING_GLYPHS.map((glyph, i) => ({ glyph, delayMs: Math.round((weights[i] / sum) * totalMs) }))
}

/** ~60 verbos PT (subset curado dos 185 built-in do claude-code-spinner-verbs). */
export const THINKING_VERBS = [
	'Pensando', 'Analisando', 'Arquitetando', 'Calculando', 'Cogitando', 'Compilando',
	'Compondo', 'Conectando', 'Conjurando', 'Considerando', 'Construindo', 'Costurando',
	'Criando', 'Decifrando', 'Deliberando', 'Destilando', 'Devaneando', 'Elaborando',
	'Encadeando', 'Engenhando', 'Esboçando', 'Esclarecendo', 'Escrevendo', 'Estruturando',
	'Examinando', 'Explorando', 'Fabricando', 'Fermentando', 'Formulando', 'Forjando',
	'Germinando', 'Idealizando', 'Iluminando', 'Imaginando', 'Improvisando', 'Intuindo',
	'Investigando', 'Lapidando', 'Malabarizando', 'Manifestando', 'Maquinando', 'Matutando',
	'Meditando', 'Mergulhando', 'Moldando', 'Orquestrando', 'Organizando', 'Ponderando',
	'Processando', 'Raciocinando', 'Refinando', 'Refletindo', 'Ruminando', 'Sintetizando',
	'Sonhando', 'Tecendo', 'Teorizando', 'Traduzindo', 'Tramando', 'Vislumbrando',
] as const

export type ThinkingVerb = (typeof THINKING_VERBS)[number]

/** Sorteia um verbo, nunca o imediatamente anterior (AC-5). */
export function pickThinkingVerb(previous?: string): ThinkingVerb {
	const pool = previous ? THINKING_VERBS.filter(v => v !== previous) : THINKING_VERBS
	return pool[Math.floor(Math.random() * pool.length)] as ThinkingVerb
}

/** A linha da mensagem de fase no canal: "✻ Pensando — Destilando…". */
export function thinkingLine(verb: ThinkingVerb, glyph: SpinnerFrame['glyph'] = '✻'): string {
	return `${glyph} Pensando — ${verb}…`
}
```

(No barrel `core/src/index.ts`: adicionar o export do módulo, uma linha, no bloco de utils.)

### Step T1.4 — Verde + tipos

Run: `cd packages/api/typescript && bun test core/src/utils/ThinkingCues.test.ts && bun x tsc -p tsconfig.build.json --noEmit`
Expected: PASS; tsc 0 erros.

### Step T1.5 — Commit

```bash
git add packages/api/typescript/core/src/utils/ThinkingCues.ts packages/api/typescript/core/src/utils/ThinkingCues.test.ts packages/api/typescript/core/src/index.ts
git commit -m "feat(core): cues do Pensando — glifos rotacionados, ease e ~60 verbos PT (Task T1)"
```

## Task T2: A mensagem "Pensando" abre o stream e evolui por fase até virar a resposta

**Files to write:**
- Modify: `packages/api/typescript/src/thread/services/ReplyStreamer/ReplyStreamer.ts` — o estado do stream ganha a noção de "aberto com placeholder" (messageId pré-registrado + verbo corrente); método para o turn abrir o placeholder e para avançar a fase
- Modify: o ponto onde o turn HOJE liga o typing e abre o stream (descobrir pelo uso de `ReplyStreamer.begin` + `sustain_typing_presence` — provavelmente `ConsumeInboundMessage`/`RunIssueTurn`/`RunOrchestratorTurn`): enviar `thinkingLine(pickThinkingVerb())` via `ChannelSender.send`, registrar o messageId no stream; no drain de `AgentRuntimeEvent`, na PRIMEIRA transição de fase observável (primeiro `frame` de ação/tool) e nas seguintes, editar best-effort com verbo novo (`tryCatchAsync`, nunca falha o turn); mudo após o primeiro corte real de texto (o sequence guard do stream já dá essa informação)
- Modify: caminho de erro terminal do turn (onde o run falha hoje) — se o stream foi aberto com placeholder e nenhum texto chegou, editar a mensagem para o erro amigável existente (AC-6)
- Test: teste colocado do comportamento (modo integration): turn stub → mensagem aberta com "✻ Pensando", fase avança (≥1 edição de verbo), primeiro corte substitui, entrega final = resposta; caso de erro edita para amigável

**Files to read:**
- `packages/api/typescript/src/thread/usecases/StreamChannelReply.ts` (docblock inteiro — decisões 2/6/7/8)
- `packages/api/typescript/src/thread/usecases/SustainTypingPresence.ts` (docblock inteiro)
- `packages/api/typescript/src/thread/usecases/DeliverChannelMessage.ts` (cancelamento + entrega canônica)
- `packages/api/typescript/src/thread/services/ChannelSender/ChannelSender.ts` (o port)
- `packages/api/typescript/src/agent/types/AgentRuntimeEvent.ts` + `AgentFrame` (o que é "fase")

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /service, /test
**Depends on:** T1
**Consumes (frozen):** `thinkingLine`, `pickThinkingVerb`, `THINKING_GLYPHS` de
`@codm/core-typescript` (T1); `ChannelSender.send/edit` e `signalTyping` (existentes);
`ReplyStreamer.begin/claimCut` + sequence guard (existentes); `AgentRuntimeEvent`
(`frame|fact|finished`).
**Scope fence:** NÃO tocar `SustainTypingPresence` (T4 audita), NÃO tocar o gateway Go,
NÃO criar comando/handler novo se a edição best-effort no drain resolver (YAGNI — decisão
do plano: edição direta com tryCatchAsync no caminho do turn, mesma doutrina best-effort
da streaming spec; um handler durável só se o executor PROVAR que o drain não tem acesso
ao contexto do canal — nesse caso reportar antes). Capability check: canal sem edit ⇒ NÃO
abrir placeholder (mesma degradação silenciosa do streaming — AC-6 da streaming spec).
OUT: console (T3), e2e (T5).
**Gate:** `cd packages/api/typescript && bun test src/thread && bun x tsc -p tsconfig.build.json --noEmit`

### Step T2.1 — Descobrir o ponto exato do turn (leitura, sem edição)

`grep -rn "sustain_typing_presence\|ReplyStreamer" packages/api/typescript/src --include="*.ts" | grep -v test` — o arquivo que ENFILEIRA o primeiro beat e abre o stream é o ponto de integração. Confirmar no docblock de SustainTypingPresence ("WHO TURNS IT ON — the turn").

### Step T2.2 — Teste que falha (comportamento ponta-a-ponta do placeholder)

Escrever no padrão dos testes de thread existentes (TestBed integration + sender fake do
registry mock): dispara o turn stub; assere que (a) a PRIMEIRA chamada de canal é `send`
com texto casando `/^✻ Pensando — .+…$/`; (b) uma transição de fase gera `edit` na MESMA
messageId com verbo diferente; (c) o primeiro corte de texto edita para o texto real;
(d) a entrega final deixa o texto canônico e NENHUMA mensagem extra foi enviada (uma
única messageId na conversa — AC-3); (e) run que falha antes do primeiro corte edita o
placeholder para a mensagem de erro amigável (AC-6).

### Step T2.3 — Implementação mínima

Placeholder: no ponto do turn, após enfileirar o typing e SE `capabilities.edit` do canal:
`const { messageId } = await sender.send({ …, text: thinkingLine(pickThinkingVerb()) }, ownerId)`
+ registrar no estado do stream (mesma linha de persistência que `claimCut` consulta — o
executor encontra o shape no ReplyStreamer; o registro faz claimCut responder EDIT desde o
primeiro corte). Fases: no drain, manter `lastVerb`; em cada frame de ação (primeiro
tool-use e mudanças subsequentes de ferramenta), `tryCatchAsync(() => sender.edit({ …,
messageId, text: thinkingLine(pickThinkingVerb(lastVerb), glyphAvançado) }, ownerId))`,
silenciar após o primeiro corte real (flag no estado do stream). Erro: no catch terminal
do turn, mesmo edit best-effort com a copy de erro que o caminho de erro já usa.

### Step T2.4 — Verde + tipos + commit

Run: gate do Task. Commit:
```bash
git add packages/api/typescript/src/thread packages/api/typescript/src/agent
git commit -m "feat(thread): mensagem Pensando abre o stream e evolui por fase ate virar a resposta (Task T2)"
```

## Task T3: O spinner do console enquanto o agente trabalha

**Files to write:**
- Create: `packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionChatSection/ThinkingIndicator.tsx`
- Create: `.../SessionChatSection/ThinkingIndicator.test.tsx`
- Modify: `.../SessionChatSection/index.tsx` — renderiza `<ThinkingIndicator />` quando o issue/thread está WORKING e nenhum texto do turno atual chegou (uma linha de composição no transcript)
- Story: exports novos em story existente do SessionChatSection OU story própria colocada

**Files to read:**
- `packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionChatSection/index.tsx` (de onde vem o estado WORKING/streaming)
- `packages/app/react/src/routes/(app)/threads/$threadId/thread.stories.tsx` (padrão connected)

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /component, /storybook
**Depends on:** T1
**Consumes (frozen):** `easeSpinnerFrames`, `pickThinkingVerb`, `THINKING_GLYPHS` de
`@codm/core-typescript` (módulo folha — T1); estado WORKING já existente no chat (SSE via
useThreadRealtime — o executor descobre o campo exato no index.tsx).
**Scope fence:** componente APRESENTACIONAL (glifo + verbo, `data-slot`); o loop de
animação usa os delays de `easeSpinnerFrames` num efeito com timeout encadeado (nunca
setInterval fixo); verbo troca a cada N ciclos completos (~3) via `pickThinkingVerb(prev)`.
NÃO tocar telas congeladas; screen-chat-* estão CONGELADAS — o indicador só aparece em
estado WORKING que as stories congeladas não mockam: confirmar drift zero na re-medição.
GATE EXTRA de bundle: `bun x nx run app-react:build-spa` limpo (prova que o import do
core não quebrou o bundle — contrato do módulo folha).
**Gate:** `cd packages/app/react && bun test "src/routes/(app)/threads/\$threadId/-components/SessionChatSection" && bun test tests/architecture/stories-smoke.test.tsx && bun x tsc --noEmit && bun x nx run app-react:build-spa`

### Step T3.1 — Scaffold

```bash
bun cli component "(app)/threads/$threadId" ThinkingIndicator --recipe=leaf
```
(Se o verbo/recipe divergirem, consultar `docs/CLI.md`; o alvo é um leaf component sob
`-components/SessionChatSection/`.)

### Step T3.2 — Proposed file (executor escreve por cima do scaffold)

```typescript
// .../SessionChatSection/ThinkingIndicator.tsx — COMPLETE final file (ajustar imports ao
// shape scaffoldado). Loop: efeito com setTimeout encadeado percorrendo easeSpinnerFrames
// (ciclo ~2s), reiniciando ao terminar; a cada 3 ciclos, verbo = pickThinkingVerb(prev).
import * as React from 'react'
import { THINKING_GLYPHS, easeSpinnerFrames, pickThinkingVerb } from '@codm/core-typescript'
import { cn } from '@/lib/utils'

const FRAMES = easeSpinnerFrames(2000)
const CYCLES_PER_VERB = 3

interface ThinkingIndicatorProps extends React.ComponentProps<'div'> {}

export function ThinkingIndicator({ className, ...props }: ThinkingIndicatorProps) {
	const [frame, setFrame] = React.useState(0)
	const [verb, setVerb] = React.useState(() => pickThinkingVerb())
	const cycles = React.useRef(0)

	React.useEffect(() => {
		const id = setTimeout(() => {
			const next = (frame + 1) % FRAMES.length
			if (next === 0) {
				cycles.current += 1
				if (cycles.current % CYCLES_PER_VERB === 0) setVerb(v => pickThinkingVerb(v))
			}
			setFrame(next)
		}, FRAMES[frame].delayMs)
		return () => clearTimeout(id)
	}, [frame])

	return (
		<div data-slot="thinking-indicator" className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)} {...props}>
			<span aria-hidden className="inline-block w-4 text-center text-primary">{FRAMES[frame].glyph}</span>
			<span className="italic">{verb}…</span>
		</div>
	)
}
```

### Step T3.3 — Teste + integração no chat + story

Teste: renderiza, mostra um glifo do ciclo e um verbo da lista; avança frame com timers
fake (bun test + happy-dom). Integração: no index.tsx do SessionChatSection, renderizar o
indicador sob a condição WORKING-sem-texto (descobrir o estado exato; composição de uma
linha). Story: export novo (ex.: `Pensando`) com o mock no estado WORKING, comentário
acima do export (armadilha 16).

### Step T3.4 — Gates + commit

Run: gate do Task (inclui build-spa).
```bash
git add "packages/app/react/src/routes/(app)/threads/\$threadId/-components/SessionChatSection"
git commit -m "feat(console): spinner Pensando no chat — ease, glifos e verbos compartilhados (Task T3)"
```

## Task T4: Auditoria anti-dangling — o relato do founder contra o lease existente

**Files to write:**
- Test: `packages/api/typescript/src/thread/usecases/SustainTypingPresence.test.ts` — estender (ou criar caso não exista) com os casos AC-1/AC-2
- Modify: SOMENTE se a auditoria provar bug (com o falseador no relatório)

**Files to read:**
- `packages/api/typescript/src/thread/usecases/SustainTypingPresence.ts`
- `packages/api/typescript/src/thread/utils/ChannelCues.ts` (teto TYPING_MAX_DURATION_MS, slots)
- `packages/api/typescript/src/thread/usecases/DeliverChannelMessage.ts` (cancelamento)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** (none)
**Scope fence:** o desenho existente JÁ É o da spec (silêncio-é-off) — a auditoria procura
o bug do RELATO do founder ("digitando ficou dangling no fim do stream"): candidatos a
verificar (a) teto alto demais p/ turn sem reply; (b) caminho de erro do turn que não
cancela e deixa o lease correr até o teto (quanto é? se minutos, o founder VIU dangling
real dentro do teto — a correção é cancelar beats no erro terminal também, espelhando o
cancelamento da entrega); (c) paused explícito ausente (spec Decision 1: transições
terminais mandam paused — hoje só cancela beats; avaliar acrescentar `paused` best-effort
no cancelamento). Mudança mínima e provada; NADA além do que a auditoria demonstrar.
**Gate:** `cd packages/api/typescript && bun test src/thread/usecases/SustainTypingPresence.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T4.1 — Auditar e escrever os testes dos casos-limite

Casos: beat após teto = no-op sem re-arme; beat com deadline próximo não arma sucessor;
cancelamento na entrega cancela AMBOS os slots; **caso do relato**: turn que erra (ou nunca
entrega) — o que acontece entre o erro e o teto? Se o intervalo observável for maior que a
expiração da plataforma (~10s), escrever o teste RED do cancelamento-no-erro + `paused`
explícito e implementar o fix mínimo.

### Step T4.2 — Verde + commit

```bash
git add packages/api/typescript/src/thread
git commit -m "fix(thread): auditoria anti-dangling do typing — cancelamento no erro + paused explicito (Task T4)"
```
(Mensagem ajustada ao que a auditoria de fato encontrou.)

## Task T5: Prova ponta-a-ponta — presença corta, fases editam, resposta final única

**Files to write:**
- Modify: `packages/e2e/tests/05-whisper-direct.spec.ts` OU spec nova `13-thinking-indicator.spec.ts` (decidir pelo que a suíte já cobre de turn inbound→reply; ordem-dependência da suíte respeitada)
- Modify (se necessário p/ observar): seam `/v1/_test/gateway` (TS, e2e-only) ganhando leitura das chamadas de presença/edição registradas pelo overlay — OU o overlay Go registrando; MENOR mudança que torne AC-1/AC-3 assertáveis; e2e-only, fora da SDK
- Modify (se necessário p/ fase): `E2eStubAgentRunner` emitindo UM frame de ação entre início e resposta (coluna e2e apenas), para AC-3 ter ≥2 fases observáveis

**Files to read:**
- `packages/e2e/tests/05-whisper-direct.spec.ts` + `06-onboarding-attach.spec.ts` (padrões)
- `packages/api/typescript/src/agent/services/AgentRunner/E2eStubAgentRunner/`
- `packages/api/go/internal/channel/overlay.go` (o roteiro)
- `packages/e2e/utils/given/gateway.ts` (o seam existente)

**Agent:** qa-tester
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /e2e, /test
**Depends on:** T2, T4
**Consumes (frozen):** o comportamento de T2 (placeholder `/^✻ Pensando — .+…$/`, edições
por fase, entrega final na MESMA messageId) e de T4 (cancelamento+paused no terminal);
`injectInboundMessage`/seam `/v1/_test/gateway`; roteiro `defaultE2eScenario`.
**Scope fence:** mudanças de produção = ZERO (stub runner e seam são coluna e2e; overlay é
mock). Assertar: (AC-1) composing observado ≤2s após inbound e paused/cessação após a
entrega; (AC-2 é coberto pelo teste de processo de T4 — aqui só a cessação normal);
(AC-3) ≥2 estados da mensagem (Pensando→verbo novo→resposta) e histórico final com UMA
mensagem do bot; (AC-6) cenário de erro do stub edita para amigável.
**Gate:** `cd packages/e2e && bun scripts/run-e2e.ts <spec> && bun scripts/run-e2e.ts` (spec isolada + suíte completa verde)

### Step T5.1 — Investigar observabilidade e escrever a spec RED

Ver o que o overlay/seam já registra; adicionar a leitura e2e-only mínima se faltar; spec
com os asserts acima no padrão da suíte (fixtures test/goto, t(), sem sleeps além dos
budgets documentados).

### Step T5.2 — Verde + commit

```bash
git add packages/e2e packages/api/typescript/src/agent/services/AgentRunner/E2eStubAgentRunner packages/api/typescript/src/external
git commit -m "test(e2e): Pensando ponta-a-ponta — presenca corta, fases editam, resposta unica (Task T5)"
```

## Final Validation

- [ ] `bun tsc` — clean
- [ ] `bun lint` — clean
- [ ] `cd packages/api/typescript && bun test src/thread && cd ../../app/react && bun run test` — verdes
- [ ] `cd packages/e2e && bun scripts/run-e2e.ts` — suíte completa verde
- [ ] `bun x nx run app-react:build-spa` — bundle ok com o import do core (contrato do módulo folha)
- [ ] `bun fidelity` — screen-chat-* congeladas sem drift (indicador só em WORKING não-mockado)
- [ ] AC mapping:
  - AC-1 → spec e2e T5 (composing ≤2s + cessação pós-entrega)
  - AC-2 → `SustainTypingPresence.test.ts` (T4: teto, no-op, cancelamento; morte por silêncio é desenho + teste de parada)
  - AC-3 → teste integration T2 (única messageId, ≥2 fases) + spec e2e T5
  - AC-4 → `ThinkingCues.test.ts` (T1: ✻ nas pontas, delays ease) + story/teste T3
  - AC-5 → `ThinkingCues.test.ts` (T1: no-repeat, lista única consumida por T2 e T3)
  - AC-6 → teste T2 (erro edita amigável) + cenário de erro T5
  - AC-7 → Final Validation acima (sem contrato novo — Send/Edit/Presence já existem nos 2 lados)

## Notes

- **Sem Contract Lock**: nenhuma mudança de controller/schema — `SendChatPresenceController`,
  `EditMessageController` (Go) e a SDK go-client (`sendChatPresence`, `editMessage`) já existem.
- **/task-breakdown não invocado** (limiar tangenciado): 5 tasks coesos, 2 waves óbvias
  (T1‖T4 → T2‖T3 → T5); o overhead do overlay de 4 fases não paga aqui.
- A streaming spec anterior (decisões 2/6/7/8/10/12 citadas nos docblocks) é leitura
  OBRIGATÓRIA dos executores de T2/T4 — os invariantes de lá (best-effort, sequence guard,
  silêncio-é-off) são fronteiras, não sugestões.
