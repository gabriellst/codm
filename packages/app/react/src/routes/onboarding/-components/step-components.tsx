// packages/app/react/src/routes/onboarding/-components/step-components.tsx — COMPLETE final file.
import type { ReactNode } from 'react'
import { ConnectChannelForm } from '@/routes/(app)/channels/-components/ConnectChannelForm'
import { ControlSlide } from './ControlSlide'
import { FullDiskAccessCard } from './FullDiskAccessCard'
import { HowItWorksSlide } from './HowItWorksSlide'
import { OnboardingAgentsStep } from './OnboardingAgentsStep'
import { OnboardingContactStep } from './OnboardingContactStep'
import { OnboardingFinalStep } from './OnboardingFinalStep'
import { OnboardingReviewStep } from './OnboardingReviewStep'
import { OnboardingWorkspaceStep } from './OnboardingWorkspaceStep'
import type { StepId } from './steps'
import { ValueSlide } from './ValueSlide'

/**
 * The DESPACHO id→componente do wizard (spec Decision 4). `Record<StepId, ReactNode>` — não
 * `Partial` — é exaustivo por construção: um `StepId` novo sem entrada aqui para de compilar, nunca
 * vira uma tela em branco em runtime (canon CMP-P18). `SystemPreconditionList`/`system-preconditions.ts`
 * fazem esse mesmo despacho hoje para as pré-condições sozinhas — este mapa os substitui por
 * completo (spec Decision 17): uma `SystemPrecondition` é só mais uma entrada aqui.
 *
 * CHANNEL/WORKSPACE/CONTACT/AGENTS/REVIEW são as PEÇAS REAIS (frente ONB-4b), reusadas SEM
 * modificação (spec Decision 11): `ConnectChannelForm`/`AddWorkspaceForm` (ONB-4a, ambas já aceitam
 * montagem standalone via `onDone?`) e `ContactStep`/`AgentsStep`/`ReviewStep` de `/attach` (por trás
 * de um adaptador fino cada, porque essas três precisam de uma seleção ACUMULADA entre passos que se
 * desmontam por completo a cada navegação — ver `useOnboardingSetupStore`). `FINAL` ganha um painel de
 * fechamento de verdade (`OnboardingFinalStep`). Nenhuma entrada aqui aponta mais para um placeholder.
 */
export const STEP_COMPONENTS: Record<StepId, ReactNode> = {
	VALUE: <ValueSlide />,
	HOW: <HowItWorksSlide />,
	CONTROL: <ControlSlide />,
	CHANNEL: <ConnectChannelForm />,
	WORKSPACE: <OnboardingWorkspaceStep />,
	CONTACT: <OnboardingContactStep />,
	AGENTS: <OnboardingAgentsStep />,
	REVIEW: <OnboardingReviewStep />,
	FULL_DISK_ACCESS: <FullDiskAccessCard />,
	FINAL: <OnboardingFinalStep />,
}
