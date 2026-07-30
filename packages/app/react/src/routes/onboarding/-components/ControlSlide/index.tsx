import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/** Slide 3 — you stay in control: the stop/steer/take-over promise. */
export function ControlSlide({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	return (
		<div className={cn('flex flex-col items-center gap-6', className)} {...props}>
			<h1 className="heading-display text-4xl text-foreground md:text-5xl">{t('onboarding.slide3Title')}</h1>
			<p className="text-muted-foreground">{t('onboarding.slide3Body')}</p>
		</div>
	)
}
