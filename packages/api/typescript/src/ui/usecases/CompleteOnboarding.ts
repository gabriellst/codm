import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { WorkspaceRepository } from '@workspace/repositories/WorkspaceRepository'
import { AddWorkspace } from '@workspace/usecases/AddWorkspace'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { AttachThread } from '@thread/usecases/AttachThread'
import { Onboarding } from '../entities/Onboarding'
import { OnboardingRepository } from '../repositories/OnboardingRepository'
import { OnboardingCompleteDraftSchema, type OnboardingCompleteDraft } from '../schemas/OnboardingDraftState'
import type { ApplicationErrors } from '../errors'

export const CompleteOnboardingInputSchema = z.object({ ownerId: z.uuid() })
export const CompleteOnboardingOutputSchema = z.void()

/**
 * O COMMIT ATÔMICO do wizard (spec 2026-08-26) — o fim de "cada passo escreve na hora, e um reboot
 * no meio perde tudo que só existia em memória". Nada dos passos WORKSPACE/CONTACT/AGENTS vira
 * agregado de verdade (`Workspace`, `Thread`) até ESTA transação: até lá, o que o operador preencheu
 * mora só no rascunho (`Onboarding.state`, ver `SaveOnboardingStep`).
 *
 * ### Por que revalidar em vez de confiar no que já foi salvo
 * `state` foi salvo por PATCHes incrementais, um `OnboardingDraftStateSchema` que aceita qualquer
 * subconjunto — nunca a forma que autoriza materializar um `Workspace`/`Thread`. Este use case é o
 * ÚNICO ponto que impõe a forma completa (`OnboardingCompleteDraftSchema`): sem `contactRef` +
 * `workspace` (path OU existingWorkspaceId) + `providers`, não há o que passar a `AddWorkspace`/
 * `AttachThread`, e a resposta é um erro NOMEADO — nunca um `undefined` silencioso chegando lá dentro.
 *
 * ### Por que IDEMPOTENTE, e não só atômico
 * Atômico garante que ESTA chamada não deixa metade escrita. Não protege um RETRY depois de a
 * transação já ter comitado uma vez (o processo caiu entre o commit e a resposta chegar ao console,
 * por exemplo) — aí uma segunda chamada bateria em `AddWorkspace`/`AttachThread` com o MESMO
 * rascunho e tomaria `WORKSPACE_ALREADY_REGISTERED`/`THREAD_ALREADY_ATTACHED`, dois erros que não
 * dizem "já está pronto", dizem "colisão". Por isso os dois lookups por baixo (`findByOwnerAndPath`,
 * `findByChannelContact`) ANTES de chamar os use cases: um dono/caminho ou canal/contato que já
 * virou agregado é reaproveitado, nunca recriado.
 *
 * ### Por que os use cases de OUTRO contexto, e não HTTP a si mesmo
 * `AddWorkspace` e `AttachThread` são importados e chamados com a MESMA `tx` desta transação — o
 * padrão que `SteerIssueTurn` (agent → issue) já segue. Uma chamada HTTP à própria SDK seria um
 * ciclo, e não commitaria atomicamente com `onboarding.complete()`.
 */
@injectable()
export class CompleteOnboarding extends Handler<typeof CompleteOnboardingInputSchema, typeof CompleteOnboardingOutputSchema> {
	readonly name = 'complete_onboarding' as const
	readonly inputSchema = CompleteOnboardingInputSchema
	readonly outputSchema = CompleteOnboardingOutputSchema

	constructor(
		private readonly onboardingRepo: OnboardingRepository,
		private readonly workspaces: WorkspaceRepository,
		private readonly addWorkspace: AddWorkspace,
		private readonly threads: ThreadRepository,
		private readonly attachThread: AttachThread,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const onboarding = (await this.onboardingRepo.findByOwnerId(input.ownerId, tx)) ?? Onboarding.create({ ownerId: input.ownerId })

			// Idempotente: concluir de novo não repete o commit nem remarca a data (mesma regra de
			// `Onboarding.complete`), e sobretudo não revalida um rascunho que pode já ter sido
			// esvaziado/alterado depois da primeira conclusão.
			if (onboarding.isCompleted()) return

			const draft = this.parseDraft(onboarding.state)

			const workspaceId = await this.resolveWorkspaceId(input.ownerId, draft.workspace, tx)
			await this.ensureThreadAttached(input.ownerId, draft, workspaceId, tx)

			onboarding.complete()
			await this.onboardingRepo.save(onboarding, tx)
		})
	}

	private parseDraft(state: unknown): OnboardingCompleteDraft {
		const draft = OnboardingCompleteDraftSchema.safeParse(state)
		if (!draft.success) {
			throw new BaseError<ApplicationErrors>(
				'ONBOARDING_DRAFT_INCOMPLETE',
				`onboarding draft is incomplete: ${draft.error.issues.map(i => i.message).join('; ')}`,
			)
		}
		return draft.data
	}

	/** Reaproveita um workspace já materializado (idempotência) antes de pedir a `AddWorkspace` para criar um. */
	private async resolveWorkspaceId(ownerId: string, workspace: OnboardingCompleteDraft['workspace'], tx: Transaction): Promise<string> {
		if (workspace.existingWorkspaceId) return workspace.existingWorkspaceId

		// O refine de `OnboardingCompleteDraftSchema` já garante path OU existingWorkspaceId — chegar
		// aqui sem `path` seria esse invariante quebrado, e é tratado como o MESMO erro nomeado do
		// resto do método, nunca uma asserção silenciosa.
		if (!workspace.path) {
			throw new BaseError<ApplicationErrors>(
				'ONBOARDING_DRAFT_INCOMPLETE',
				'onboarding draft workspace has neither path nor existingWorkspaceId',
			)
		}

		const existing = await this.workspaces.findByOwnerAndPath(ownerId, workspace.path, tx)
		if (existing) return existing.id.value

		const created = await this.addWorkspace.execute({ ownerId, path: workspace.path }, tx)
		return created.workspaceId
	}

	/** Reaproveita uma thread LIVE já anexada a este contato (idempotência) antes de pedir a `AttachThread`. */
	private async ensureThreadAttached(ownerId: string, draft: OnboardingCompleteDraft, workspaceId: string, tx: Transaction): Promise<void> {
		const existing = await this.threads.findByChannelContact(draft.contactRef.channelId, draft.contactRef.externalId, tx)
		if (existing && !existing.deletedAt) return

		await this.attachThread.execute({ ownerId, contactRef: draft.contactRef, workspaceId, providers: draft.providers }, tx)
	}
}
