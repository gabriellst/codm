// packages/app/react/src/routes/onboarding/-components/steps.test.ts
import { describe, expect, it } from 'bun:test'
import { SYSTEM_PRECONDITION_IDS } from '@/services'
import { STEP_COMPONENTS } from './step-components'
import { canComplete, onboardingSteps, STEP_IMPACTS, STEP_KINDS, STEP_TAXONOMY } from './steps'

/**
 * AC-4 — `onboardingSteps` é uma função PURA de `pending`: sem objeto de contexto, sem predicado
 * por passo (spec Decision 4). Testado direto, sem montar nada.
 */
describe('onboardingSteps — AC-4', () => {
	it('sem pendência: intro → setup → final', () => {
		expect(onboardingSteps([])).toEqual(['VALUE', 'HOW', 'CONTROL', 'CHANNEL', 'WORKSPACE', 'CONTACT', 'AGENTS', 'REVIEW', 'FINAL'])
	})

	it('com uma SystemPrecondition pendente: intro → setup → SystemPrecondition → final (Decision 5 — adjacente ao Concluir)', () => {
		expect(onboardingSteps(['FULL_DISK_ACCESS'])).toEqual([
			'VALUE',
			'HOW',
			'CONTROL',
			'CHANNEL',
			'WORKSPACE',
			'CONTACT',
			'AGENTS',
			'REVIEW',
			'FULL_DISK_ACCESS',
			'FINAL',
		])
	})
})

/**
 * AC-5 — `STEP_COMPONENTS` é exaustivo sobre `StepId`. A garantia dura é de tipo (`Record<StepId,
 * ReactNode>` — um id sem entrada para de compilar); este caso guarda a direção reversa — que
 * ninguém tenha somado uma chave que não é um `StepId` conhecido. `onboardingSteps(SYSTEM_PRECONDITION_IDS)`
 * enumera o universo INTEIRO de StepId (todo id de SystemPrecondition existente, não só os pendentes
 * agora), então comparar contra ele cobre exatamente o union.
 */
describe('STEP_COMPONENTS — AC-5', () => {
	it('tem exatamente uma entrada por StepId conhecido', () => {
		expect(Object.keys(STEP_COMPONENTS).sort()).toEqual([...onboardingSteps(SYSTEM_PRECONDITION_IDS)].sort())
	})
})

/**
 * AC-6 — os dois eixos carregam TODOS os valores da taxonomia, inclusive `REQUIRED` e `ADVISORY`,
 * que nenhum passo usa hoje (spec Decision 3, a pedido do founder — não "limpar").
 */
describe('taxonomia — AC-6', () => {
	it('STEP_KINDS carrega os três valores, incluindo REQUIRED (sem uso hoje)', () => {
		expect(STEP_KINDS).toEqual(['INFORMATIVE', 'REQUIRED', 'DEFERRABLE'])
	})

	it('STEP_IMPACTS carrega os dois valores, incluindo ADVISORY', () => {
		expect(STEP_IMPACTS).toEqual(['BLOCKING', 'ADVISORY'])
	})

	it('todo StepId tem uma entrada em STEP_TAXONOMY', () => {
		for (const id of onboardingSteps(SYSTEM_PRECONDITION_IDS)) {
			expect(STEP_TAXONOMY[id]).toBeDefined()
		}
	})
})

/**
 * AC-7/AC-8 — `canComplete` só é bloqueada por um passo REQUIRED insatisfeito, e por nada mais
 * (spec Decision 13). Como nenhum StepId real é REQUIRED hoje, a única forma de exercitar o branch
 * bloqueante é um passo REQUIRED DE MENTIRA — daí a genericidade sobre `Id` (mesmo padrão de
 * `SystemPreconditionList<Id extends string>`).
 */
describe('canComplete — AC-7/AC-8', () => {
	it('AC-7: um passo REQUIRED de mentira, insatisfeito, bloqueia', () => {
		const steps = [{ id: 'FAKE_REQUIRED', kind: 'REQUIRED' as const }]
		expect(canComplete(steps, [])).toBe(false)
	})

	it('REQUIRED satisfeito não bloqueia', () => {
		const steps = [{ id: 'FAKE_REQUIRED', kind: 'REQUIRED' as const }]
		expect(canComplete(steps, ['FAKE_REQUIRED'])).toBe(true)
	})

	it('AC-8: com todos os passos reais (todos DEFERRABLE/INFORMATIVE hoje) insatisfeitos, conclui', () => {
		const steps = onboardingSteps(SYSTEM_PRECONDITION_IDS).map(id => ({ id, kind: STEP_TAXONOMY[id].kind }))
		expect(canComplete(steps, [])).toBe(true)
	})
})
