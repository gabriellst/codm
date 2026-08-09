// packages/app/react/src/routes/onboarding/-components/StepPlaceholder/index.tsx — COMPLETE final file.
// MANTENHA a forma do scaffold: export nomeado, props estendendo ComponentProps, `{ className, ...props }`, `cn(...)`.
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface StepPlaceholderProps extends ComponentProps<'div'> {
	titleKey: string
	bodyKey: string
}

/**
 * O CONTEÚDO MÍNIMO dos cinco passos de setup e do `FINAL` NESTA FRENTE (ONB-3a) — só título e
 * corpo, o suficiente para o wizard compilar e navegar ponta a ponta. A frente ONB-4 substitui cada
 * slot em `STEP_COMPONENTS` pela peça real: o QR de `ConnectChannelDialog` (CHANNEL), o seletor de
 * pasta de `AddWorkspaceDialog` (WORKSPACE), e `ContactStep`/`AgentsStep`/`ReviewStep` reusados do
 * `/attach` (CONTACT/AGENTS/REVIEW) — ver spec Decision 11.
 */
export function StepPlaceholder({ titleKey, bodyKey, className, ...props }: StepPlaceholderProps) {
	const { t } = useTranslation()
	return (
		<div className={cn('flex flex-col items-center gap-6', className)} {...props}>
			<h1 className="heading-display text-4xl text-foreground md:text-5xl">{t(titleKey)}</h1>
			<p className="text-muted-foreground">{t(bodyKey)}</p>
		</div>
	)
}
