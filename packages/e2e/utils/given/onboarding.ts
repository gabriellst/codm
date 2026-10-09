import { completeOnboarding, saveOnboardingStep } from '@codm/client-typescript/typescript'
import type { ApiSession } from './api'
import type { AttachedThread } from './thread'

/**
 * CONCLUI O ONBOARDING — pré-requisito de toda spec que NAVEGA para uma rota `(app)` gateada.
 *
 * ── POR QUE ISTO PASSOU A SER NECESSÁRIO ─────────────────────────────────────────────────────────
 * O `OnboardingGate` (`app/react/src/components/console/OnboardingGate.tsx`) manda para `/onboarding`
 * enquanto `completedAt` estiver ausente, e o backend recusa as leituras gateadas com
 * `ONBOARDING_NOT_COMPLETED` — que é o estado CORRETO de um operador novo.
 *
 * Antes da F7 nenhuma spec precisava disto, e não porque estivessem em dia: a identidade nunca
 * resolvia (`CLOUD_UNREACHABLE`), o gate caía no `!data` e RENDERIZAVA o console assim mesmo. As
 * telas apareciam por causa de um fail-open, não porque o operador tivesse direito a elas. Consertado
 * o fail-open (F7.6), o gate passou a fazer o que sempre prometeu — e as specs que dependiam do
 * atalho tiveram de passar a dizer o que precisam.
 *
 * ── POR QUE NÃO DENTRO DE `givenAttachedThread` ──────────────────────────────────────────────────
 * Ele cria canal + workspace + thread, que é exatamente o trio que a `06-onboarding-attach.spec.ts`
 * usa para provar que os FLAGS de setup completam sozinhos. Concluir o onboarding lá dentro
 * apagaria a distinção entre "os pré-requisitos existem" e "o operador concluiu", que é justamente
 * o que aquela spec separa. Quem precisa da tela pede a tela.
 */
export async function givenCompletedOnboarding(session: ApiSession, thread: AttachedThread): Promise<void> {
	// Desde o rascunho atômico (2026-08-26) `CompleteOnboarding` REVALIDA o rascunho do servidor, e um
	// `completeOnboarding` nu o apresenta vazio (`ONBOARDING_DRAFT_INCOMPLETE`). O rascunho é a thread que
	// o given acabou de anexar — o commit a REAPROVEITA (`findByChannelContact`/workspace existente), nunca
	// recria, então concluir não duplica nada.
	await saveOnboardingStep(
		{
			state: {
				contactRef: { channelId: thread.channelId, externalId: thread.contactExternalId, displayName: thread.displayName, kind: 'USER' },
				workspace: { existingWorkspaceId: thread.workspaceId },
				providers: thread.providers,
			},
		},
		{ client: session.client },
	)
	await completeOnboarding({ client: session.client })
}
