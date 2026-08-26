// packages/api/typescript/src/ui/schemas/OnboardingDraftState.ts — arquivo final COMPLETO.
import { z } from '@codm/core-typescript'
import Z from 'zod'
import { AddWorkspaceInputSchema } from '@workspace/usecases/AddWorkspace'
import { AttachThreadInputSchema } from '@thread/usecases/AttachThread'

/**
 * O RASCUNHO do wizard — tudo que os passos WORKSPACE/CONTACT/AGENTS coletam ANTES do commit
 * atômico (spec 2026-08-26, ver `CompleteOnboarding`). Hoje cada um desses passos escrevia no
 * próprio agregado NA HORA (AddWorkspace/AttachThread); um reboot no meio do wizard perdia contato e
 * providers, que só viviam em memória no console. O rascunho fecha esse buraco: os três passos
 * escrevem aqui via `PATCH /ui/onboarding/step`, e só `CompleteOnboarding` materializa os agregados.
 *
 * COMPOSTO dos MESMOS schemas que `AddWorkspace` e `AttachThread` já expõem — nunca redigitado —
 * porque é exatamente o payload que `CompleteOnboarding` revalida e repassa a eles no commit.
 *
 * TUDO opcional: um rascunho parcial é válido em qualquer ponto do wizard — é o que permite salvar
 * o passo 2 sem ter preenchido o 3. A forma que AUTORIZA o commit é `OnboardingCompleteDraftSchema`,
 * abaixo — mais estrita, e nunca exposta no fio.
 */
export const OnboardingDraftWorkspaceSchema = z.object({
	// Um workspace NOVO a registrar — mesmo campo (mesma regex de caminho absoluto) de
	// `AddWorkspaceInputSchema`.
	path: AddWorkspaceInputSchema.shape.path.optional(),
	// OU um workspace JÁ registrado — o wizard deixa escolher um existente em vez de recriar.
	existingWorkspaceId: z.uuid().optional(),
})

export const OnboardingDraftStateSchema = z.object({
	contactRef: AttachThreadInputSchema.shape.contactRef.optional(),
	workspace: OnboardingDraftWorkspaceSchema.optional(),
	providers: AttachThreadInputSchema.shape.providers.optional(),
})

export type OnboardingDraftState = Z.infer<typeof OnboardingDraftStateSchema>

/**
 * A forma que AUTORIZA o commit — usada SÓ dentro de `CompleteOnboarding`, nunca registrada no fio
 * (nunca `registerSchemas`, nunca parte de um InputSchema de controller). `workspace` exige `path`
 * OU `existingWorkspaceId`: sem um dos dois não há como `CompleteOnboarding` saber qual workspace
 * anexar à thread.
 */
export const OnboardingCompleteDraftSchema = z.object({
	contactRef: AttachThreadInputSchema.shape.contactRef,
	workspace: OnboardingDraftWorkspaceSchema.refine(
		w => !!w.path || !!w.existingWorkspaceId,
		'workspace requires either path or existingWorkspaceId',
	),
	providers: AttachThreadInputSchema.shape.providers,
})

export type OnboardingCompleteDraft = Z.infer<typeof OnboardingCompleteDraftSchema>
