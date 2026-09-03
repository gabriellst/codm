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
 *
 * ── POR QUE PRECISA DO `AttachedThread` (consertado aqui) ───────────────────────────────────────
 * Este helper chamava `completeOnboarding` NU, e desde a reescrita de draft/commit atômico o
 * `CompleteOnboarding` REVALIDA um rascunho do lado do servidor: sem `contactRef`, `workspace` e
 * `providers` gravados, o commit é recusado com `ONBOARDING_DRAFT_INCOMPLETE`. O helper vinha
 * reprovando TODA spec que o usa (medido: `11-artifact-preview` falha idêntico num checkout limpo),
 * e o defeito era o próprio helper não dizer o que precisa — a mesma crítica que o docblock acima
 * faz aos atalhos.
 *
 * O rascunho é montado a partir do `AttachedThread` que a spec já criou, e não inventado: o mesmo
 * canal, o mesmo contato e o MESMO workspace por `existingWorkspaceId` (nunca um `path` novo, que
 * faria `CompleteOnboarding` registrar um segundo workspace para o mesmo diretório). `providers`
 * espelha o default de `givenAttachedThread`, que é o que o detector canônico do e2e reporta.
 */
export async function givenCompletedOnboarding(session: ApiSession, attached: AttachedThread): Promise<void> {
	await saveOnboardingStep(
		{
			state: {
				contactRef: {
					channelId: attached.channelId,
					externalId: attached.contactExternalId,
					displayName: attached.contactDisplayName,
					kind: 'USER',
				},
				workspace: { existingWorkspaceId: attached.workspaceId },
				providers: ['CLAUDE_CODE'],
			},
		},
		{ client: session.client },
	)
	await completeOnboarding({ client: session.client })
}
