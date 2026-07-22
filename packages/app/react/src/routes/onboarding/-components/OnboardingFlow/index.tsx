import { type ReactNode, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowRight } from '@tabler/icons-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/console/Logo'
import { useOnboardingStore } from '../../-stores/useOnboardingStore'
import { ValueSlide } from '../ValueSlide'
import { HowItWorksSlide } from '../HowItWorksSlide'
import { ControlSlide } from '../ControlSlide'

// Slide sequence as a const-asserted tuple; dispatched through a Record map, never a switch chain.
const SLIDES = ['VALUE', 'HOW', 'CONTROL'] as const
type SlideId = (typeof SLIDES)[number]

const SLIDE_COMPONENTS: Record<SlideId, ReactNode> = {
	VALUE: <ValueSlide />,
	HOW: <HowItWorksSlide />,
	CONTROL: <ControlSlide />,
}

/** First-run intro (T01): value prop, how it works, the control plane — 3 slides that slide. */
export function OnboardingFlow() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { currentSlide, direction, setCurrentSlide, setDirection, reset } = useOnboardingStore()

	// Fresh intro on every entry (the store persists across navigations).
	useEffect(() => reset(), [reset])

	const lastIndex = SLIDES.length - 1
	const slideId = SLIDES[currentSlide] ?? SLIDES[0]
	const done = () => navigate({ to: '/dashboard' })

	const goTo = (index: number) => {
		setDirection(index < currentSlide ? -1 : 1)
		setCurrentSlide(Math.min(lastIndex, Math.max(0, index)))
	}

	return (
		<div className="flex min-h-dvh flex-col bg-route-background text-foreground">
			<header className="flex items-center justify-between px-6 py-6 md:px-10">
				<Logo />
				<Link to="/dashboard" className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
					{t('onboarding.skip')}
				</Link>
			</header>

			<main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
				<div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
					<div
						key={slideId}
						className={cn(
							'flex w-full flex-col items-center gap-8 text-center',
							'animate-in fade-in duration-300 ease-out',
							direction === 1 ? 'slide-in-from-right-10' : 'slide-in-from-left-10',
						)}
					>
						{SLIDE_COMPONENTS[slideId]}
					</div>

					<div className="flex items-center gap-2">
						{SLIDES.map((id, i) => (
							<span
								key={id}
								className={cn('h-2 rounded-full transition-all duration-300', i === currentSlide ? 'w-6 bg-primary' : 'w-2 bg-border')}
							/>
						))}
					</div>

					<div className="flex items-center gap-3">
						{currentSlide > 0 && (
							<Button variant="outline" onClick={() => goTo(currentSlide - 1)}>
								{t('onboarding.back')}
							</Button>
						)}
						{currentSlide < lastIndex ? (
							<Button onClick={() => goTo(currentSlide + 1)}>
								{t('onboarding.next')} <IconArrowRight data-icon="inline-end" />
							</Button>
						) : (
							<Button onClick={done}>
								{t('onboarding.getStarted')} <IconArrowRight data-icon="inline-end" />
							</Button>
						)}
					</div>
				</div>
			</main>
		</div>
	)
}
