import { injectable } from 'tsyringe-neo'
import { and, eq, isNull } from 'drizzle-orm'
import { DrizzleDatabaseDriver, Handler, z } from '@codm/core-typescript'
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
		private readonly driver: DrizzleDatabaseDriver,
		private readonly onboardingRepo: OnboardingRepository,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const [onboarding, connectedChannels, ownerWorkspaces, ownerThreads] = await Promise.all([
			this.onboardingRepo.findByOwnerId(input.ownerId),
			this.driver.db
				.select({ id: channels.id })
				.from(channels)
				.where(and(eq(channels.ownerId, input.ownerId), eq(channels.status, ChannelStatus.CONNECTED)))
				.limit(1),
			this.driver.db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerId, input.ownerId)).limit(1),
			// Uma thread apagada não conta (thread-deletion spec, decision 5): apagar a última conversa
			// devolve o passo ao estado anterior, em vez de deixá-lo marcado por uma linha que mais
			// nada no console enxerga.
			this.driver.db
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
