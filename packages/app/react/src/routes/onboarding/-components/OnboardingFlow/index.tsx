import { type ComponentProps, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowRight } from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { getOnboardingQueryKey, useCompleteOnboarding, useGetOnboarding } from '@codm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/console/Logo'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'
import { useOnboardingStore } from '../../-stores/useOnboardingStore'
import { canComplete, firstUnvanquishedStep, onboardingSteps, STEP_TAXONOMY } from '../steps'
import { STEP_COMPONENTS } from '../step-components'

/**
 * O fluxo de entrada e de pendência — agora um wizard COMPOSTO pela função pura `onboardingSteps`
 * (spec Decision 4), não mais uma lista fixa de três slides com um quarto prefixado sob condição.
 * Uma `SystemPrecondition` pendente é só mais um `StepId` na lista — dispatchado por `STEP_COMPONENTS`
 * — e não um caso especial (spec Decisions 1/2).
 *
 * O `blocked`/"Pular" escondido de antes MORREU (spec Decision 13): a conclusão só é barrada por um
 * passo REQUIRED insatisfeito (`canComplete`), e nenhum `StepId` real carrega esse `kind` hoje — o
 * botão final fica sempre habilitado na prática, como CONSEQUÊNCIA da tabela `STEP_TAXONOMY`, não
 * como regra imposta aqui. Não existe mais link de saída nenhum: quem sai é o botão final, que
 * conclui o onboarding de verdade (`useCompleteOnboarding`) antes de navegar.
 *
 * A POSIÇÃO DE ABERTURA (spec Decision 12 / AC-10 — sempre no primeiro passo não vencido, nunca
 * "índice 0" depois de já ter concluído) é responsabilidade DESTE componente: ele lê `useGetOnboarding()`
 * e semeia o índice via `firstUnvanquishedStep` assim que a leitura chega, em vez do `reset()`
 * incondicional para 0 que havia antes.
 */
export function OnboardingFlow({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const { currentSlide, direction, setCurrentSlide, setDirection } = useOnboardingStore()
	const pendingStatuses = useSystemPreconditionsStore(state => state.pending)
	const { data: onboarding } = useGetOnboarding()
	// O erro não precisa de tratamento aqui — o `MutationCache` global (`router.tsx`) já vira toast
	// via `handleApiError`; o sucesso é o único efeito que este componente precisa amarrar.
	//
	// INVALIDAR ANTES DE NAVEGAR, e o `await` é a parte que importa. `/dashboard` monta dentro do
	// `OnboardingGate`, que decide pelo `completedAt` de `useGetOnboarding()`. Navegar com o cache
	// ainda velho faz o gate ler `completedAt: null` — o valor de ANTES desta mutation — e devolver
	// o operador ao `/onboarding` no mesmo instante. Foi o sintoma relatado em 09/08: "cliquei em
	// concluir duas vezes, a primeira não pegou". A segunda pegava porque o React Query já tinha
	// refeito o fetch nesse meio-tempo. Sem o `await`, invalidar não basta: a navegação corre junto
	// com o refetch e a corrida volta.
	const completeOnboarding = useCompleteOnboarding({
		mutation: {
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: getOnboardingQueryKey() })
				await navigate({ to: '/dashboard' })
			},
		},
	})

	const pending = (pendingStatuses ?? []).map(status => status.id)
	const steps = onboardingSteps(pending)

	// Semeia o índice UMA VEZ por entrada, assim que a leitura de onboarding chega — nunca de novo
	// depois (o `seededRef` é por instância de componente, então uma NOVA entrada em `/onboarding`
	// sempre semeia de novo, mas navegar pelos passos dentro da mesma visita não é sobrescrito).
	// `pending`/`steps` são recalculados AQUI DENTRO a partir de `pendingStatuses` (a dependência
	// reativa de verdade) — a versão de fora existe só para o render; usá-la faria o efeito depender
	// de um array novo a cada render (o `.map()` do corpo do componente) e reexecutar sempre.
	const seededRef = useRef(false)
	useEffect(() => {
		if (seededRef.current || !onboarding) return
		seededRef.current = true
		const seedPending = (pendingStatuses ?? []).map(status => status.id)
		const seedSteps = onboardingSteps(seedPending)
		const target = firstUnvanquishedStep(seedSteps, onboarding)
		const index = seedSteps.indexOf(target)
		setCurrentSlide(index === -1 ? 0 : index)
		setDirection(1)
	}, [onboarding, pendingStatuses, setCurrentSlide, setDirection])

	const lastIndex = steps.length - 1
	// Clamp, e não só fallback: quando a pendência é resolvida no meio do fluxo a lista ENCOLHE, e o
	// índice guardado no store pode passar do fim.
	const index = Math.min(currentSlide, lastIndex)
	const stepId = steps[index] ?? steps[0]

	const goTo = (target: number) => {
		setDirection(target < index ? -1 : 1)
		setCurrentSlide(Math.min(lastIndex, Math.max(0, target)))
	}

	// Nenhum StepId real é REQUIRED hoje (STEP_TAXONOMY), então isto avalia sempre `true` na prática —
	// ver o comentário de `canComplete` em `../steps`.
	const completionAllowed = canComplete(
		steps.map(id => ({ id, kind: STEP_TAXONOMY[id].kind })),
		[],
	)

	return (
		// `min-h-full`, not `min-h-dvh`: sized against the box the root layout left under the AppChrome
		// title bar, never against the viewport (which no longer belongs entirely to the route).
		<div className={cn('flex min-h-full flex-col bg-route-background text-foreground', className)} {...props}>
			<header className="px-6 py-6 md:px-10">
				<Logo />
			</header>

			<main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
				<div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
					<div
						key={stepId}
						className={cn(
							'flex w-full flex-col items-center gap-8 text-center',
							'animate-in fade-in duration-300 ease-out',
							direction === 1 ? 'slide-in-from-right-10' : 'slide-in-from-left-10',
						)}
					>
						{STEP_COMPONENTS[stepId]}
					</div>

					<div className="flex items-center gap-2">
						{steps.map((id, i) => (
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
							<Button onClick={() => completeOnboarding.mutate()} disabled={!completionAllowed || completeOnboarding.isPending}>
								{t('onboarding.getStarted')} <IconArrowRight data-icon="inline-end" />
							</Button>
						)}
					</div>
				</div>
			</main>
		</div>
	)
}
