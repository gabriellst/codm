// packages/app/react/src/routes/onboarding/-components/OnboardingFinalStep/index.tsx — COMPLETE final file.
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconCircleCheck } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

/**
 * The wizard's closing panel (spec Decision 4/AC-14) — replaces the ONB-3a placeholder component with
 * real content. `FINAL` is `INFORMATIVE`/`ADVISORY` (`STEP_TAXONOMY`): there is nothing to satisfy
 * here, "Concluir" (`OnboardingFlow`'s own button, not rendered by this component) is what actually
 * ends the flow.
 */
export function OnboardingFinalStep({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	return (
		<div className={cn('flex flex-col items-center gap-6', className)} {...props}>
			<IconCircleCheck className="size-16 text-primary" />
			<h1 className="heading-display text-4xl text-foreground md:text-5xl">{t('onboarding.finalTitle')}</h1>
			<p className="text-muted-foreground">{t('onboarding.finalBody')}</p>
		</div>
	)
}
