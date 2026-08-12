import { type ComponentProps, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowRight } from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { getOnboardingQueryKey, useCompleteOnboarding, useGetOnboarding } from '@codm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'
import { useOnboardingStore } from '../../-stores/useOnboardingStore'
import { canComplete, firstUnvanquishedStep, onboardingSteps, type StepId, STEP_TAXONOMY } from '../steps'
import { STEP_COMPONENTS } from '../step-components'

// D3 (screens NN8IL/FPKgO/tBcCA) — the three intro slides sit over a pair of soft blurred
// blobs ($secondary, radial); the permission/final/login screens the same group ships are flat
// white. Scoped to INFO_STEPS_WITH_BLOB rather than "every step" so FULL_DISK_ACCESS/FINAL don't
// inherit decoration the design never draws for them (R28 — decor blobs are sanctioned, but only
// where measured).
const INFO_STEPS_WITH_BLOB: readonly StepId[] = ['VALUE', 'HOW', 'CONTROL']

// D3 — the permission screen (FULL_DISK_ACCESS) is left-aligned block copy, not the centered
// carousel style the three intro slides and the final card use. One shared wrapper, one
// conditional on alignment — every other step keeps the centered treatment.
function stepAlignment(stepId: StepId): string {
	return stepId === 'FULL_DISK_ACCESS' ? 'items-start text-left' : 'items-center text-center'
}

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

	// D3 (screen NN8IL) — "Pular" only ever shows on the FIRST step (nothing to go back to), and
	// only advances PAST the read-only intro slides (VALUE/HOW/CONTROL, all INFORMATIVE) into the
	// first step that actually does something — never an exit from onboarding (that "Pular" died at
	// spec Decision 13, before this front existed; see OnboardingFlow's test docblock). Presentation
	// only: it calls the SAME `goTo` every other nav control uses.
	const firstActionableIndex = steps.findIndex(id => STEP_TAXONOMY[id].kind !== 'INFORMATIVE')
	const skipTarget = firstActionableIndex === -1 ? lastIndex : firstActionableIndex

	// Nenhum StepId real é REQUIRED hoje (STEP_TAXONOMY), então isto avalia sempre `true` na prática —
	// ver o comentário de `canComplete` em `../steps`.
	const completionAllowed = canComplete(
		steps.map(id => ({ id, kind: STEP_TAXONOMY[id].kind })),
		[],
	)

	return (
		// `min-h-full`, not `min-h-dvh`: sized against the box the root layout left under the AppChrome
		// title bar, never against the viewport (which no longer belongs entirely to the route). No
		// `<Logo/>` header — none of the 11 D3 screens for this group show one; the brand lockup only
		// lives in the OS title bar (`__root.tsx`) and the console rail, both outside this route's box.
		<div className={cn('relative flex min-h-full flex-col overflow-hidden bg-route-background text-foreground', className)} {...props}>
			{INFO_STEPS_WITH_BLOB.includes(stepId) && (
				<div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
					<div className="absolute -top-40 right-[-10%] size-[560px] rounded-full bg-secondary opacity-60 blur-[90px]" />
					<div className="absolute -bottom-52 left-[-15%] size-[680px] rounded-full bg-secondary opacity-50 blur-[100px]" />
				</div>
			)}

			<main className="relative flex flex-1 flex-col items-center justify-center px-6 pb-28">
				<div className={cn('flex w-full max-w-xl flex-col gap-8', stepAlignment(stepId))}>
					<div
						key={stepId}
						className={cn(
							'flex w-full flex-col gap-8',
							stepAlignment(stepId),
							'animate-in fade-in duration-300 ease-out',
							direction === 1 ? 'slide-in-from-right-10' : 'slide-in-from-left-10',
						)}
					>
						{STEP_COMPONENTS[stepId]}
					</div>

					{/* D3 — the progress dots are ALSO scoped to the three intro slides (neither d4bKAl nor
					    fa1hL draw them; the permission/final cards stand alone), same set as the blobs. */}
					{INFO_STEPS_WITH_BLOB.includes(stepId) && (
						<div className="flex items-center gap-2 self-center">
							{steps.map((id, i) => (
								<span
									key={id}
									className={cn('h-2 rounded-full transition-all duration-300', i === index ? 'w-6 bg-primary' : 'w-2 bg-input')}
								/>
							))}
						</div>
					)}
				</div>
			</main>

			{/* D3 — a footer bar pinned to the window edge, Voltar/Pular fixed left and the forward action
			    fixed right, not clustered under the dots like before. */}
			<footer className="relative flex items-center justify-between px-10 py-7">
				<div>
					{index > 0 ? (
						<Button variant="outline" onClick={() => goTo(index - 1)}>
							{t('onboarding.back')}
						</Button>
					) : (
						firstActionableIndex > 0 && (
							<Button variant="outline" onClick={() => goTo(skipTarget)}>
								{t('onboarding.skip')}
							</Button>
						)
					)}
				</div>
				{index < lastIndex ? (
					<Button onClick={() => goTo(index + 1)}>
						{t('onboarding.next')} <IconArrowRight data-icon="inline-end" />
					</Button>
				) : (
					<Button onClick={() => completeOnboarding.mutate()} disabled={!completionAllowed || completeOnboarding.isPending}>
						{t('onboarding.getStarted')} <IconArrowRight data-icon="inline-end" />
					</Button>
				)}
			</footer>
		</div>
	)
}
