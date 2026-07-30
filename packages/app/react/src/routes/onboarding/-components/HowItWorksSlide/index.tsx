import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

// Localized step copy — titles/descriptions come from the typed catalog, never inline literals.
const STEPS = [
	{ n: 1, titleKey: 'onboarding.stepChannelTitle', descKey: 'onboarding.stepChannelDesc' },
	{ n: 2, titleKey: 'onboarding.stepWorkspaceTitle', descKey: 'onboarding.stepWorkspaceDesc' },
	{ n: 3, titleKey: 'onboarding.stepThreadTitle', descKey: 'onboarding.stepThreadDesc' },
]

/** Slide 2 — how it works: the three cold-start chores as a numbered list. */
export function HowItWorksSlide({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	return (
		<div className={cn('flex w-full flex-col items-center gap-6', className)} {...props}>
			<h1 className="heading-display text-4xl text-foreground md:text-5xl">{t('onboarding.slide2Title')}</h1>
			<div className="flex w-full flex-col gap-5 text-left">
				{STEPS.map(step => (
					<div key={step.n} className="flex items-start gap-4">
						<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
							{step.n}
						</span>
						<div className="flex flex-col gap-0.5">
							<span className="font-semibold text-foreground">{t(step.titleKey)}</span>
							<span className="text-sm text-muted-foreground">{t(step.descKey)}</span>
						</div>
					</div>
				))}
			</div>
		</div>
	)
}
