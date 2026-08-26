// packages/app/react/src/routes/onboarding/-components/steps.test.ts
import { describe, expect, it } from 'bun:test'
import { SYSTEM_PRECONDITION_IDS } from '@/services'
import { canComplete, firstUnvanquishedStep, onboardingSteps, STEP_IMPACTS, STEP_KINDS, STEP_TAXONOMY } from './steps'

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

	/**
	 * 2026-08-26 founder override — REVOGA a Decision 13 original só para estes cinco: "Próximo"
	 * avançava sem canal conectado, sem contato/provider escolhido e sem revisão completa. `WORKSPACE`
	 * fica de fora de propósito (continua DEFERRABLE — o operador pode concluir sem workspace e
	 * adicionar um depois pelo dashboard).
	 */
	it('CHANNEL/CONTACT/AGENTS/REVIEW/FULL_DISK_ACCESS são REQUIRED desde 2026-08-26', () => {
		expect(STEP_TAXONOMY.CHANNEL.kind).toBe('REQUIRED')
		expect(STEP_TAXONOMY.CONTACT.kind).toBe('REQUIRED')
		expect(STEP_TAXONOMY.AGENTS.kind).toBe('REQUIRED')
		expect(STEP_TAXONOMY.REVIEW.kind).toBe('REQUIRED')
		expect(STEP_TAXONOMY.FULL_DISK_ACCESS.kind).toBe('REQUIRED')
	})

	it('WORKSPACE continua DEFERRABLE — a única peça de setup que não bloqueia Concluir', () => {
		expect(STEP_TAXONOMY.WORKSPACE.kind).toBe('DEFERRABLE')
	})

	it('os três slides de intro e FINAL continuam INFORMATIVE', () => {
		expect(STEP_TAXONOMY.VALUE.kind).toBe('INFORMATIVE')
		expect(STEP_TAXONOMY.HOW.kind).toBe('INFORMATIVE')
		expect(STEP_TAXONOMY.CONTROL.kind).toBe('INFORMATIVE')
		expect(STEP_TAXONOMY.FINAL.kind).toBe('INFORMATIVE')
	})
})

/**
 * AC-7/AC-8 — `canComplete` só é bloqueada por um passo REQUIRED insatisfeito, e por nada mais
 * (spec Decision 13 — parcialmente revogada 2026-08-26). O primeiro par de casos usa um passo
 * REQUIRED DE MENTIRA (a genericidade sobre `Id`, mesmo padrão de `SystemPreconditionList<Id extends
 * string>`, existe por causa deles) para isolar a regra pura de qualquer `StepId` real; o describe
 * "taxonomia — AC-6" acima já cobre QUAIS `StepId`s reais carregam `kind: 'REQUIRED'` hoje, e os
 * casos logo abaixo ("AC-8 invertido" em diante) provam o comportamento com o `STEP_TAXONOMY` real.
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

	/**
	 * AC-8 INVERTIDO em 2026-08-26 (founder override — ver o describe "taxonomia" acima): cinco passos
	 * reais agora são REQUIRED, então "com todos os passos insatisfeitos, conclui" deixou de ser
	 * verdade — é exatamente o comportamento anterior que permitia "Próximo"/"Concluir" avançarem sem
	 * canal/contato/provider/revisão/FDA, o bug que esta mudança fecha.
	 */
	it('AC-8 invertido: com todos os passos reais insatisfeitos, NÃO conclui (os REQUIRED bloqueiam)', () => {
		const steps = onboardingSteps(SYSTEM_PRECONDITION_IDS).map(id => ({ id, kind: STEP_TAXONOMY[id].kind }))
		expect(canComplete(steps, [])).toBe(false)
	})

	it('com só WORKSPACE insatisfeito (o único DEFERRABLE) e os cinco REQUIRED satisfeitos, conclui', () => {
		const steps = onboardingSteps(SYSTEM_PRECONDITION_IDS).map(id => ({ id, kind: STEP_TAXONOMY[id].kind }))
		const satisfied = ['CHANNEL', 'CONTACT', 'AGENTS', 'REVIEW', 'FULL_DISK_ACCESS'] as const
		expect(canComplete(steps, satisfied)).toBe(true)
	})

	it('faltando UM REQUIRED (CONTACT) entre os outros quatro satisfeitos, ainda bloqueia', () => {
		const steps = onboardingSteps(SYSTEM_PRECONDITION_IDS).map(id => ({ id, kind: STEP_TAXONOMY[id].kind }))
		const satisfied = ['CHANNEL', 'AGENTS', 'REVIEW', 'FULL_DISK_ACCESS'] as const
		expect(canComplete(steps, satisfied)).toBe(false)
	})
})

/**
 * AC-10 — a posição de abertura do wizard é o primeiro passo NÃO vencido, nunca "índice 0" (spec
 * Decision 12). `firstUnvanquishedStep` é a função pura por trás disso; `OnboardingFlow` só chama
 * `steps.indexOf(...)` sobre o resultado.
 */
describe('firstUnvanquishedStep — AC-10 / Decision 12', () => {
	it('sem progresso nenhum, abre em VALUE — o mesmo que currentStep de um onboarding que nunca começou', () => {
		const steps = onboardingSteps([])
		const progress = { currentStep: 'VALUE' as const, completedAt: null, channelDone: false, workspaceDone: false, threadDone: false }
		expect(firstUnvanquishedStep(steps, progress)).toBe('VALUE')
	})

	it('antes de concluir, é o currentStep do servidor (Decision 12) — aqui, CONTACT', () => {
		const steps = onboardingSteps([])
		const progress = { currentStep: 'CONTACT' as const, completedAt: null, channelDone: true, workspaceDone: true, threadDone: false }
		expect(firstUnvanquishedStep(steps, progress)).toBe('CONTACT')
	})

	it('Story 3 / AC-10: com completedAt e uma SystemPrecondition pendente, os passos de conteúdo já venceram e abre na pendência', () => {
		const steps = onboardingSteps(['FULL_DISK_ACCESS'])
		const progress = {
			currentStep: 'FINAL' as const,
			completedAt: '2026-08-09T00:00:00.000Z',
			channelDone: true,
			workspaceDone: true,
			threadDone: true,
		}
		expect(firstUnvanquishedStep(steps, progress)).toBe('FULL_DISK_ACCESS')
		expect(steps.indexOf(firstUnvanquishedStep(steps, progress))).not.toBe(0)
	})

	/**
	 * 2026-08-26 fix (rascunho/commit atômico) — `WORKSPACE`/`CONTACT`/`AGENTS` podem estar bem à
	 * frente do fato de banco: `workspace.path`/`contactRef`/`providers` vivem só no rascunho até
	 * `CompleteOnboarding`, então `workspaceDone`/`threadDone` continuam `false` o wizard INTEIRO.
	 * Sem o fallback de posição, um reboot com `currentStep=AGENTS` reabriria em `WORKSPACE` (o
	 * primeiro cujo flag é `false`) — perdendo dois passos que o operador já tinha passado.
	 */
	it('com o rascunho à frente do fato de banco (currentStep=AGENTS, nada materializado ainda), reabre em AGENTS — nunca WORKSPACE/CONTACT', () => {
		const steps = onboardingSteps([])
		const progress = { currentStep: 'AGENTS' as const, completedAt: null, channelDone: true, workspaceDone: false, threadDone: false }
		expect(firstUnvanquishedStep(steps, progress)).toBe('AGENTS')
	})

	it('com tudo vencido e nada pendente, cai no FINAL — o fallback quando não há mais o que reabrir', () => {
		const steps = onboardingSteps([])
		const progress = {
			currentStep: 'FINAL' as const,
			completedAt: '2026-08-09T00:00:00.000Z',
			channelDone: true,
			workspaceDone: true,
			threadDone: true,
		}
		expect(firstUnvanquishedStep(steps, progress)).toBe('FINAL')
	})
})
