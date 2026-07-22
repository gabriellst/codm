import { useTranslation } from 'react-i18next'

/** Slide 3 — you stay in control: the stop/steer/take-over promise. */
export function ControlSlide() {
	const { t } = useTranslation()
	return (
		<div className="flex flex-col items-center gap-6">
			<h1 className="heading-display text-4xl text-foreground md:text-5xl">{t('onboarding.slide3Title')}</h1>
			<p className="text-muted-foreground">{t('onboarding.slide3Body')}</p>
		</div>
	)
}
