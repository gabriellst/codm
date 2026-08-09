// packages/app/react/src/routes/onboarding/-components/step-components.tsx — COMPLETE final file.
import type { ReactNode } from 'react'
import { ControlSlide } from './ControlSlide'
import { FullDiskAccessCard } from './FullDiskAccessCard'
import { HowItWorksSlide } from './HowItWorksSlide'
import type { StepId } from './steps'
import { StepPlaceholder } from './StepPlaceholder'
import { ValueSlide } from './ValueSlide'

/**
 * O DESPACHO id→componente do wizard (spec Decision 4). `Record<StepId, ReactNode>` — não
 * `Partial` — é exaustivo por construção: um `StepId` novo sem entrada aqui para de compilar, nunca
 * vira uma tela em branco em runtime (canon CMP-P18). `SystemPreconditionList`/`system-preconditions.ts`
 * fazem esse mesmo despacho hoje para as pré-condições sozinhas — este mapa os substitui por
 * completo (spec Decision 17): uma `SystemPrecondition` é só mais uma entrada aqui.
 *
 * CHANNEL/WORKSPACE/CONTACT/AGENTS/REVIEW/FINAL são PLACEHOLDERS MÍNIMOS nesta frente (ONB-3a) —
 * ver `StepPlaceholder` para o porquê e o que a frente ONB-4 substitui em cada um.
 */
export const STEP_COMPONENTS: Record<StepId, ReactNode> = {
	VALUE: <ValueSlide />,
	HOW: <HowItWorksSlide />,
	CONTROL: <ControlSlide />,
	CHANNEL: <StepPlaceholder titleKey="onboarding.channelStepTitle" bodyKey="onboarding.channelStepBody" />,
	WORKSPACE: <StepPlaceholder titleKey="onboarding.workspaceStepTitle" bodyKey="onboarding.workspaceStepBody" />,
	CONTACT: <StepPlaceholder titleKey="onboarding.contactStepTitle" bodyKey="onboarding.contactStepBody" />,
	AGENTS: <StepPlaceholder titleKey="onboarding.agentsStepTitle" bodyKey="onboarding.agentsStepBody" />,
	REVIEW: <StepPlaceholder titleKey="onboarding.reviewStepTitle" bodyKey="onboarding.reviewStepBody" />,
	FULL_DISK_ACCESS: <FullDiskAccessCard />,
	FINAL: <StepPlaceholder titleKey="onboarding.finalTitle" bodyKey="onboarding.finalBody" />,
}
