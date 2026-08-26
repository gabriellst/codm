// packages/api/typescript/src/ui/entities/Onboarding.ts — arquivo final COMPLETO.
// MANTENHA a forma do scaffold: `static override schema`, a interface com declaration merging no fim.
import { AggregateRoot, z } from '@codm/core-typescript'
import Z from 'zod'
import { OnboardingStep } from '@codm/contracts-typescript/wire/enums'
import { OnboardingDraftStateSchema, type OnboardingDraftState } from '../schemas/OnboardingDraftState'

/**
 * A JORNADA do operador pelo wizard — e o RASCUNHO que ela carrega.
 *
 * `currentStep` e `completedAt` só o servidor pode responder: onde a pessoa parou e se ela
 * terminou. Tudo o mais que o wizard mostra é derivado a cada leitura: a satisfação dos passos de
 * setup sai de consultas de existência no banco (um canal apagado desfaz o passo — spec AC-9), e as
 * pré-condições do sistema saem do host e NUNCA chegam até aqui, porque o servidor não enxerga o
 * TCC da máquina e o mesmo `ownerId` em dois Macs daria respostas diferentes (spec Decision 8).
 *
 * `state` (spec 2026-08-26) é o rascunho de `contactRef`/`workspace`/`providers` — o que os passos
 * WORKSPACE/CONTACT/AGENTS coletam antes do commit atômico. Continua NÃO sendo "o mundo": nenhum
 * passo de SETUP (canal conectado, workspace já registrado, thread já existente) é guardado aqui —
 * esses seguem derivados por consulta em `GetOnboarding`. `state` é só o que ainda NÃO virou
 * agregado de verdade, para sobreviver a um reboot no meio do wizard.
 */
export const OnboardingSchema = z.object({
	ownerId: z.uuid(),
	currentStep: z.enum(OnboardingStep),
	state: OnboardingDraftStateSchema,
	completedAt: z.instanceof(Date).optional(),
})

export type OnboardingProps = Z.infer<typeof OnboardingSchema>

export class Onboarding extends AggregateRoot<typeof OnboardingSchema> {
	static override schema = OnboardingSchema

	static create(data: { ownerId: string }): Onboarding {
		return new Onboarding({
			ownerId: data.ownerId,
			currentStep: OnboardingStep.VALUE,
			state: {},
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
	 * Mescla o rascunho — RASO, de propósito: `setState({ workspace: { path } })` SUBSTITUI o
	 * `workspace` inteiro que já existia, não funde `path` dentro dele. Cada passo do wizard manda o
	 * grupo COMPLETO que possui (`contactRef` inteiro, `workspace` inteiro, `providers` inteiro) —
	 * nunca um campo solto dentro de um desses grupos — então um merge profundo nunca teria o que
	 * resolver, e um raso é exatamente o que deixa um passo anterior (ex.: CONTACT) sobreviver
	 * quando um passo posterior (ex.: AGENTS) grava só `providers`.
	 */
	setState(partial: OnboardingDraftState): void {
		this.state = { ...this.state, ...partial }
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
