// packages/app/react/src/routes/onboarding/-components/steps.ts — COMPLETE final file.
import type { SystemPreconditionId } from '@/services'

/**
 * DOIS EIXOS ORTOGONAIS descrevem um passo, e cada um governa uma superfície diferente (spec
 * Decision 3). Mantê-los separados é o que impede o wizard de saber de dashboard e vice-versa.
 */

/** O que acontece se o passo ficar por fazer — governa o WIZARD. */
export const STEP_KINDS = ['INFORMATIVE', 'REQUIRED', 'DEFERRABLE'] as const
export type StepKind = (typeof STEP_KINDS)[number]

/** O que fica quebrado enquanto isso — governa o DASHBOARD. */
export const STEP_IMPACTS = ['BLOCKING', 'ADVISORY'] as const
export type StepImpact = (typeof STEP_IMPACTS)[number]

// `ADVISORY`-sem-`BLOCKING` não tem NENHUM passo usando-o hoje — deliberado e a pedido do founder
// (spec Decision 3): o vocabulário é para ser documentado e usado, e um membro de union sem uso em
// TypeScript não dispara lint. NÃO "limpe" isso.
//
// `REQUIRED` TINHA zero passos usando-o (a nota original desta seção) até 2026-08-26: o founder
// reportou que "Próximo" avançava sem canal conectado, sem contato/provider escolhido e sem revisão
// completa — a spec Decision 13 original ("nenhum passo bloqueia Concluir") foi REVOGADA para esses
// cinco passos por decisão do founder nessa data. Ver `STEP_TAXONOMY` abaixo.

const INTRO_STEPS = ['VALUE', 'HOW', 'CONTROL'] as const
const SETUP_STEPS = ['CHANNEL', 'WORKSPACE', 'CONTACT', 'AGENTS', 'REVIEW'] as const

/**
 * Um `SystemPrecondition` não é um caso especial — é só mais uma espécie de `StepId` (spec Decision
 * 1/2). `SystemPreconditionId` vem do registro do host (`@/services`), então somar uma pré-condição
 * nova amplia este union sozinho, sem editar nada aqui.
 */
export type StepId = (typeof INTRO_STEPS)[number] | (typeof SETUP_STEPS)[number] | SystemPreconditionId | 'FINAL'

/**
 * A composição do wizard — uma função PURA de `pending`, sem context bag e sem predicado por passo
 * (spec Decision 4). Uma `SystemPrecondition` está na lista porque está em `pending`, e sai porque
 * saiu.
 *
 * A ORDEM é `intro → setup → SystemPrecondition → final` (spec Decision 5): a pendência do sistema
 * fica ADJACENTE ao "Concluir" — é onde ela mais dói se ignorada — em vez de abrir o fluxo, como no
 * desenho anterior.
 */
export const onboardingSteps = (pending: readonly SystemPreconditionId[]): readonly StepId[] => [
	...INTRO_STEPS,
	...SETUP_STEPS,
	...pending,
	'FINAL',
]

interface StepTaxonomy {
	kind: StepKind
	impact: StepImpact
}

/**
 * Cada passo declara `kind` e `impact` (spec AC-6). `Record<StepId, …>` — não `Partial` — para que
 * um `StepId` novo sem entrada pare de compilar, não vire um cartão em branco em runtime.
 *
 * Os três passos de intro e `FINAL` são INFORMATIVE/ADVISORY (ver é cumprir; nada quebra por não
 * ver). `WORKSPACE` é DEFERRABLE/BLOCKING (o operador pode concluir sem workspace e adicionar um
 * depois pelo dashboard — a única peça de setup que continua adiável).
 *
 * `CHANNEL`/`CONTACT`/`AGENTS`/`REVIEW`/`FULL_DISK_ACCESS` são REQUIRED/BLOCKING desde 2026-08-26
 * (decisão do founder, REVOGANDO a Decision 13 original da spec só para estes cinco): sem canal
 * pareado, sem contato, sem provider e sem a thread revisada+anexada, o produto não tem nada pra
 * fazer — e sem Full Disk Access o host não lê os arquivos que o agente precisa. `canComplete`
 * (abaixo) agora bloqueia "Concluir" de verdade nestes cinco; `WORKSPACE` continua fora dessa lista
 * de propósito. O gate de "Próximo" (`CAN_CONTINUE` em `OnboardingFlow`) é uma camada SEPARADA que
 * já cobria `WORKSPACE` mesmo DEFERRABLE — dentro do passo, avançar sem selecionar nada continua
 * bloqueado; só "Concluir" sem workspace nenhum é permitido.
 */
export const STEP_TAXONOMY: Record<StepId, StepTaxonomy> = {
	VALUE: { kind: 'INFORMATIVE', impact: 'ADVISORY' },
	HOW: { kind: 'INFORMATIVE', impact: 'ADVISORY' },
	CONTROL: { kind: 'INFORMATIVE', impact: 'ADVISORY' },
	CHANNEL: { kind: 'REQUIRED', impact: 'BLOCKING' },
	WORKSPACE: { kind: 'DEFERRABLE', impact: 'BLOCKING' },
	CONTACT: { kind: 'REQUIRED', impact: 'BLOCKING' },
	AGENTS: { kind: 'REQUIRED', impact: 'BLOCKING' },
	REVIEW: { kind: 'REQUIRED', impact: 'BLOCKING' },
	FULL_DISK_ACCESS: { kind: 'REQUIRED', impact: 'BLOCKING' },
	FINAL: { kind: 'INFORMATIVE', impact: 'ADVISORY' },
}

// Referência nomeada em vez de literal solto na comparação (bp-14) — `STEP_KINDS[1]` é a mesma
// fonte única de verdade que tipa `StepKind`, só que endereçada por nome no ponto de uso.
const REQUIRED_KIND: StepKind = STEP_KINDS[1]

// Mesmo canon acima, para o outro extremo do union — `OnboardingFlow` usa este para achar o
// primeiro passo ACIONÁVEL (o primeiro que não é só leitura) ao computar o alvo do "Pular".
export const INFORMATIVE_KIND: StepKind = STEP_KINDS[0]

/**
 * Concluir é bloqueado APENAS por um passo REQUIRED insatisfeito, e por nada mais (spec Decision
 * 13 — parcialmente revogada 2026-08-26, ver `STEP_TAXONOMY` acima). Genérica sobre `Id` (mesmo
 * padrão de `SystemPreconditionList<Id extends string>`) porque o chamador (`OnboardingFlow`) monta
 * a lista `satisfied` a partir do MESMO mapa que gate o "Próximo" de cada passo — `canComplete` em si
 * não sabe nada sobre canal/contato/provider, só compara `kind` contra a lista que recebe.
 *
 * Cinco `StepId` reais carregam `kind: 'REQUIRED'` hoje (`CHANNEL`/`CONTACT`/`AGENTS`/`REVIEW`/
 * `FULL_DISK_ACCESS`) — esta função agora bloqueia de verdade em produção quando um deles está
 * insatisfeito, não só no teste com o `FAKE_REQUIRED` de mentira.
 */
export function canComplete<Id extends string>(steps: readonly { id: Id; kind: StepKind }[], satisfied: readonly Id[]): boolean {
	return steps.every(step => step.kind !== REQUIRED_KIND || satisfied.includes(step.id))
}

/** A ordem "de conteúdo" que o `OnboardingStep` do servidor enxerga — sem as `SystemPrecondition`s,
 *  que o servidor nunca vê (spec Decision 8). É contra ESTA ordem que `currentStep` é posicionado. */
const CONTENT_STEPS = [...INTRO_STEPS, ...SETUP_STEPS, 'FINAL'] as const
export type ContentStepId = (typeof CONTENT_STEPS)[number]

/** Um `StepId` é persistível como `currentStep` do servidor sse for um `ContentStepId` — uma
 *  `SystemPrecondition` (ex.: `FULL_DISK_ACCESS`) nunca é, porque o servidor não a enxerga (spec
 *  Decision 8, mesma razão de `CONTENT_STEPS` acima). `OnboardingFlow` usa isto para decidir, a cada
 *  avanço de passo, se vale a pena mandar `PATCH { currentStep }` (2026-08-26 fix — o console nunca
 *  chamava `SaveOnboardingStep`, então um reboot sempre reabria em `VALUE`). */
export function isContentStep(id: StepId): id is ContentStepId {
	return (CONTENT_STEPS as readonly string[]).includes(id)
}

/** O que o wizard precisa saber do servidor + do banco para decidir onde reabrir (spec Decision 12). */
export interface OnboardingProgress {
	currentStep: ContentStepId
	completedAt: string | null
	channelDone: boolean
	workspaceDone: boolean
	threadDone: boolean
}

/**
 * O PRIMEIRO PASSO NÃO VENCIDO — a posição de abertura do wizard (spec Decision 12 / AC-10). NUNCA
 * "índice 0": reabrir do zero um fluxo em andamento, ou reapresentar passos de conteúdo que o
 * operador já viu depois de concluir, é exatamente o custo que a Decision 7 da spec anterior tinha
 * aceitado e que esta elimina.
 *
 * Satisfação por tipo de passo:
 *   · intro (`VALUE`/`HOW`/`CONTROL`) — pela POSIÇÃO do `currentStep` do servidor: um passo de
 *     intro está vencido se vem ANTES de `currentStep` em `CONTENT_STEPS`. Cobre sozinho o "antes de
 *     concluir, é o currentStep" (Decision 12): antes de concluir `currentStep` ainda não é `FINAL`,
 *     então os passos de intro vencidos são exatamente os que o operador já passou.
 *   · setup (`CHANNEL`/`WORKSPACE`/`CONTACT`/`AGENTS`/`REVIEW`) — pela satisfação DERIVADA do banco
 *     (Decision 8/9) OU pela POSIÇÃO de `currentStep`, o que vier primeiro (2026-08-26 fix, rascunho/
 *     commit atômico): `channelDone`/`workspaceDone` mapeiam 1:1 ao fato real; `CONTACT`, `AGENTS` e
 *     `REVIEW` compartilham `threadDone` (Decision 11, os três produzem a MESMA thread). Mas desde o
 *     commit atômico, WORKSPACE/CONTACT/AGENTS/REVIEW podem estar bem à frente do fato real —
 *     `workspace.path`/`contactRef`/`providers` vivem só no RASCUNHO (`Onboarding.state`) até
 *     `CompleteOnboarding`, então `workspaceDone`/`threadDone` ficam `false` o wizard INTEIRO até o
 *     "Concluir" final, mesmo depois de o operador já ter passado esses passos. Sem o fallback de
 *     posição, um reboot no meio (ex.: `currentStep=AGENTS`) reabriria sempre em `WORKSPACE` (o
 *     primeiro cujo flag de banco é `false`) — exatamente o "reabre do zero" que este fix elimina.
 *     O flag de banco continua tendo precedência semântica (um passo cujo fato JÁ é real nunca
 *     precisa da posição para se provar vencido), a posição é só o COMPLEMENTO para o que ainda é
 *     rascunho.
 *   · `FINAL` e `SystemPrecondition` — nunca "vencem" por aqui de propósito: `FINAL` é o destino de
 *     fallback quando tudo o mais já venceu, e uma `SystemPrecondition` só existe dentro de `steps`
 *     ENQUANTO pendente (Decision 4 — a composição já filtra por `pending`), então "vencer" para ela
 *     é sair da lista, não um estado que se observa de dentro dela. É o que faz "depois de concluir,
 *     os passos de conteúdo já estão vencidos, e o primeiro não vencido é a pendência" (Decision 12)
 *     cair para fora deste `switch` sem um branch dedicado: com `currentStep === 'FINAL'` todo passo
 *     de intro vence pela posição, cada setup vence pelo seu flag (ou pela posição, ambos `true`
 *     quando `currentStep` é o último), e o que sobra é a precondição.
 */
// Referências nomeadas em vez de literais soltos na comparação (bp-14) — `SETUP_STEPS` é a mesma
// fonte única de verdade que compõe o wizard, só que endereçada por nome no ponto de uso.
const [CHANNEL_STEP, WORKSPACE_STEP, CONTACT_STEP, AGENTS_STEP, REVIEW_STEP] = SETUP_STEPS

export function firstUnvanquishedStep(steps: readonly StepId[], progress: OnboardingProgress): StepId {
	const currentIndex = CONTENT_STEPS.indexOf(progress.currentStep)

	// O fato de banco OU a posição já ter passado este passo — o que vier primeiro (ver docblock).
	const setupVanquished = (id: ContentStepId, done: boolean): boolean => done || CONTENT_STEPS.indexOf(id) < currentIndex

	const vanquished = (id: StepId): boolean => {
		if ((INTRO_STEPS as readonly string[]).includes(id)) return CONTENT_STEPS.indexOf(id as ContentStepId) < currentIndex
		if (id === CHANNEL_STEP) return setupVanquished(id, progress.channelDone)
		if (id === WORKSPACE_STEP) return setupVanquished(id, progress.workspaceDone)
		if (id === CONTACT_STEP || id === AGENTS_STEP || id === REVIEW_STEP) return setupVanquished(id, progress.threadDone)
		return false
	}

	return steps.find(id => !vanquished(id)) ?? steps[steps.length - 1]
}
