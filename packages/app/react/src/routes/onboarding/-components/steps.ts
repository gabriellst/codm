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

// `REQUIRED` e `ADVISORY` não têm NENHUM passo usando-os hoje — deliberado e a pedido do founder
// (spec Decision 3): o vocabulário é para ser documentado e usado, e um membro de union sem uso em
// TypeScript não dispara lint. NÃO "limpe" isso.

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
 * (spec Decision 4). Espelha o `wizardSteps(type)` do medscall. Uma `SystemPrecondition` está na
 * lista porque está em `pending`, e sai porque saiu.
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
 * Hoje: os três passos de intro são INFORMATIVE/ADVISORY (ver é cumprir; nada quebra por não ver).
 * Os cinco passos de setup e `FULL_DISK_ACCESS` são DEFERRABLE/BLOCKING (conclui sem, mas alguma
 * capacidade real não funciona enquanto isso). `FINAL` é INFORMATIVE/ADVISORY.
 */
export const STEP_TAXONOMY: Record<StepId, StepTaxonomy> = {
	VALUE: { kind: 'INFORMATIVE', impact: 'ADVISORY' },
	HOW: { kind: 'INFORMATIVE', impact: 'ADVISORY' },
	CONTROL: { kind: 'INFORMATIVE', impact: 'ADVISORY' },
	CHANNEL: { kind: 'DEFERRABLE', impact: 'BLOCKING' },
	WORKSPACE: { kind: 'DEFERRABLE', impact: 'BLOCKING' },
	CONTACT: { kind: 'DEFERRABLE', impact: 'BLOCKING' },
	AGENTS: { kind: 'DEFERRABLE', impact: 'BLOCKING' },
	REVIEW: { kind: 'DEFERRABLE', impact: 'BLOCKING' },
	FULL_DISK_ACCESS: { kind: 'DEFERRABLE', impact: 'BLOCKING' },
	FINAL: { kind: 'INFORMATIVE', impact: 'ADVISORY' },
}

// Referência nomeada em vez de literal solto na comparação (bp-14) — `STEP_KINDS[1]` é a mesma
// fonte única de verdade que tipa `StepKind`, só que endereçada por nome no ponto de uso.
const REQUIRED_KIND: StepKind = STEP_KINDS[1]

/**
 * Concluir é bloqueado APENAS por um passo REQUIRED insatisfeito, e por nada mais (spec Decision
 * 13). Genérica sobre `Id` (mesmo padrão de `SystemPreconditionList<Id extends string>`) porque o
 * ÚNICO jeito de provar o branch bloqueante hoje é injetar um passo REQUIRED que não existe em
 * produção — nenhum `StepId` real carrega `kind: 'REQUIRED'` ainda.
 *
 * Como nenhum passo é REQUIRED hoje, esta função sempre devolve `true` na prática — não porque a
 * regra foi relaxada aqui, mas como CONSEQUÊNCIA da tabela `STEP_TAXONOMY` acima.
 */
export function canComplete<Id extends string>(steps: readonly { id: Id; kind: StepKind }[], satisfied: readonly Id[]): boolean {
	return steps.every(step => step.kind !== REQUIRED_KIND || satisfied.includes(step.id))
}

/** A ordem "de conteúdo" que o `OnboardingStep` do servidor enxerga — sem as `SystemPrecondition`s,
 *  que o servidor nunca vê (spec Decision 8). É contra ESTA ordem que `currentStep` é posicionado. */
const CONTENT_STEPS = [...INTRO_STEPS, ...SETUP_STEPS, 'FINAL'] as const
type ContentStepId = (typeof CONTENT_STEPS)[number]

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
 *     (Decision 8/9), nunca pela posição: `channelDone`/`workspaceDone` mapeiam 1:1; `CONTACT`,
 *     `AGENTS` e `REVIEW` são os três passos do `/attach` que produzem uma thread (Decision 11), e
 *     por isso compartilham `threadDone` — nenhum dos três tem satisfação própria hoje.
 *   · `FINAL` e `SystemPrecondition` — nunca "vencem" por aqui de propósito: `FINAL` é o destino de
 *     fallback quando tudo o mais já venceu, e uma `SystemPrecondition` só existe dentro de `steps`
 *     ENQUANTO pendente (Decision 4 — a composição já filtra por `pending`), então "vencer" para ela
 *     é sair da lista, não um estado que se observa de dentro dela. É o que faz "depois de concluir,
 *     os passos de conteúdo já estão vencidos, e o primeiro não vencido é a pendência" (Decision 12)
 *     cair para fora deste `switch` sem um branch dedicado: com `currentStep === 'FINAL'` todo passo
 *     de intro vence pela posição, cada setup vence pelo seu flag, e o que sobra é a precondição.
 */
// Referências nomeadas em vez de literais soltos na comparação (bp-14) — `SETUP_STEPS` é a mesma
// fonte única de verdade que compõe o wizard, só que endereçada por nome no ponto de uso.
const [CHANNEL_STEP, WORKSPACE_STEP, CONTACT_STEP, AGENTS_STEP, REVIEW_STEP] = SETUP_STEPS

export function firstUnvanquishedStep(steps: readonly StepId[], progress: OnboardingProgress): StepId {
	const currentIndex = CONTENT_STEPS.indexOf(progress.currentStep)

	const vanquished = (id: StepId): boolean => {
		if ((INTRO_STEPS as readonly string[]).includes(id)) return CONTENT_STEPS.indexOf(id as ContentStepId) < currentIndex
		if (id === CHANNEL_STEP) return progress.channelDone
		if (id === WORKSPACE_STEP) return progress.workspaceDone
		if (id === CONTACT_STEP || id === AGENTS_STEP || id === REVIEW_STEP) return progress.threadDone
		return false
	}

	return steps.find(id => !vanquished(id)) ?? steps[steps.length - 1]
}
