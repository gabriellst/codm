import { type ComponentProps, type ReactNode, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowRight } from '@tabler/icons-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/console/Logo'
import { usePreconditionsStore } from '@/stores/usePreconditionsStore'
import { useOnboardingStore } from '../../-stores/useOnboardingStore'
import { ValueSlide } from '../ValueSlide'
import { HowItWorksSlide } from '../HowItWorksSlide'
import { ControlSlide } from '../ControlSlide'
import { PreconditionsSlide } from '../PreconditionsSlide'

// Sequência de slides como tupla const-asserted; despachada por um Record, nunca por cadeia de if.
const INTRO_SLIDES = ['VALUE', 'HOW', 'CONTROL'] as const
const BLOCKED_SLIDES = ['PRECONDITIONS', ...INTRO_SLIDES] as const
type SlideId = (typeof BLOCKED_SLIDES)[number]

const SLIDE_COMPONENTS: Record<SlideId, ReactNode> = {
	PRECONDITIONS: <PreconditionsSlide />,
	VALUE: <ValueSlide />,
	HOW: <HowItWorksSlide />,
	CONTROL: <ControlSlide />,
}

/**
 * O fluxo de entrada (T01) — e, desde a spec de pré-condições, também o de PENDÊNCIA. A rota
 * `/onboarding` deixou de significar "primeira execução" e passou a significar "há algo faltando"
 * (spec Decision 6): não existe flag de "já vi", então primeira execução e revogação posterior são
 * o mesmo caso, com uma superfície só.
 *
 * A CONSEQUÊNCIA ACEITA (spec Decision 7): quando uma permissão cai, o operador revê a apresentação
 * inteira. Isso é deliberado e está registrado para ninguém "consertar" depois achando que foi
 * descuido — o slide da pendência entra no fluxo existente em vez de virar uma tela paralela.
 *
 * ENQUANTO HÁ PENDÊNCIA NÃO HÁ SAÍDA, e essa é a única forma que não vira laço: o
 * `PreconditionsGate` traz o operador de volta para cá a cada tentativa de sair, então um "Pular"
 * ativo seria um botão que devolve a pessoa ao ponto de partida — e, se o gate fosse afrouxado para
 * evitar isso, o resultado seria o console aberto sem a permissão, que é a falha de origem. O
 * destravamento não depende de o operador apertar nada: o gate re-sonda quando a janela reganha
 * foco, então conceder nos Ajustes e voltar já basta.
 */
export function OnboardingFlow({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { currentSlide, direction, setCurrentSlide, setDirection, reset } = useOnboardingStore()
	const pending = usePreconditionsStore(state => state.pending)

	// Fresh intro on every entry (the store persists across navigations).
	useEffect(() => reset(), [reset])

	const blocked = (pending?.length ?? 0) > 0
	const slides: readonly SlideId[] = blocked ? BLOCKED_SLIDES : INTRO_SLIDES

	const lastIndex = slides.length - 1
	// Clamp, e não só fallback: quando a pendência é resolvida no meio do fluxo a lista ENCOLHE, e o
	// índice guardado no store pode passar do fim.
	const index = Math.min(currentSlide, lastIndex)
	const slideId = slides[index] ?? slides[0]
	const done = () => navigate({ to: '/dashboard' })

	const goTo = (target: number) => {
		setDirection(target < index ? -1 : 1)
		setCurrentSlide(Math.min(lastIndex, Math.max(0, target)))
	}

	return (
		// `min-h-full`, not `min-h-dvh`: sized against the box the root layout left under the AppChrome
		// title bar, never against the viewport (which no longer belongs entirely to the route).
		<div className={cn('flex min-h-full flex-col bg-route-background text-foreground', className)} {...props}>
			<header className="flex items-center justify-between px-6 py-6 md:px-10">
				<Logo />
				{!blocked && (
					<Link to="/dashboard" className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
						{t('onboarding.skip')}
					</Link>
				)}
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
						{slides.map((id, i) => (
							<span
								key={id}
								className={cn('h-2 rounded-full transition-all duration-300', i === index ? 'w-6 bg-primary' : 'w-2 bg-border')}
							/>
						))}
					</div>

					<div className="flex items-center gap-3">
						{index > 0 && (
							<Button variant="outline" onClick={() => goTo(index - 1)}>
								{t('onboarding.back')}
							</Button>
						)}
						{index < lastIndex ? (
							<Button onClick={() => goTo(index + 1)}>
								{t('onboarding.next')} <IconArrowRight data-icon="inline-end" />
							</Button>
						) : (
							<Button onClick={done} disabled={blocked}>
								{t('onboarding.getStarted')} <IconArrowRight data-icon="inline-end" />
							</Button>
						)}
					</div>
				</div>
			</main>
		</div>
	)
}
