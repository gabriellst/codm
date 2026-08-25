import { type ComponentProps, type ReactNode, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { IconX } from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'
import { attachThreadMutationRequestSchema, useAttachThread, useGetAttachThreadWizard } from '@codm/client-typescript/typescript'
import type { ChannelKind } from '@codm/client-typescript/typescript'
import { Button } from '@codm/app-ui/button'
import { Skeleton } from '@codm/app-ui/skeleton'
import { Spinner } from '@codm/app-ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@codm/app-ui/tabs'
import { Empty, EmptyDescription, EmptyTitle } from '@codm/app-ui/empty'
import { cn } from '@/lib/utils'
import { useAttachWizardStore } from '../../-stores/useAttachWizardStore'
import { ContactStep, type ContactStepData } from '../ContactStep'
import { WorkspaceStep, type WorkspaceStepData } from '../WorkspaceStep'
import { AgentsStep, type AgentsStepData } from '../AgentsStep'
import { ReviewStep } from '../ReviewStep'

// ─── Step sequence — a const-asserted tuple (FRM-P13). The attach flow is linear (no discriminant
// branch), so a single sequence keyed by index is enough. ────────────────────────────────────────
const STEPS = ['CONTACT', 'WORKSPACE', 'AGENTS', 'REVIEW'] as const
type AttachStepId = (typeof STEPS)[number]

const STEP_NAV: Record<AttachStepId, string> = {
	CONTACT: 'attach.navContact',
	WORKSPACE: 'attach.navWorkspace',
	AGENTS: 'attach.navAgents',
	REVIEW: 'attach.navReview',
}

/**
 * Guided attach flow (T15): contact → workspace → agents → review on a chrome-less fullscreen.
 *
 * D3 (founder review 12/08, desktop build) REVOKED "escolher é responder": a step's row click now only
 * RECORDS the selection into `useAttachWizardStore` — this component is the SOLE owner of a persistent
 * footer (Voltar/Continuar) that decides when the step actually changes, on every one of the four
 * steps, including the first (Voltar disabled there — nowhere to go back to) and the last (Continuar
 * becomes the "Vincular conversa" commit). This retires the FRM-P18 accumulated-`useForm()` trick this
 * component used to own: the store already re-renders this component on every field write, and
 * `ReviewStep` now reads plain props instead of a form instance — see that component's docblock.
 */
export function AttachThreadWizard({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { data, isLoading } = useGetAttachThreadWizard()
	const attach = useAttachThread()

	const {
		currentStepIndex,
		direction,
		contactRef,
		workspaceId,
		providers,
		setCurrentStepIndex,
		setDirection,
		setContactRef,
		setWorkspaceId,
		setProviders,
		reset,
	} = useAttachWizardStore()

	// Fresh wizard on every entry — the store persists across navigations, so it must be cleared.
	useEffect(() => reset(), [reset])

	const stepId = STEPS[currentStepIndex] ?? STEPS[0]
	const channelKindById = useMemo(() => new Map<string, ChannelKind>((data?.channels ?? []).map(c => [c.channelId, c.kind])), [data])

	const close = () => navigate({ to: '/dashboard' })
	const advance = () => {
		setDirection(1)
		setCurrentStepIndex(currentStepIndex + 1)
	}
	const handleBack = () => {
		setDirection(-1)
		setCurrentStepIndex(Math.max(0, currentStepIndex - 1))
	}
	// D3 (screen du3gx) — each review row carries its own "Editar", jumping straight back to the step
	// that produced it instead of clicking Voltar three times. Same store setters `handleBack` already
	// uses, just aimed at a specific index.
	const jumpTo = (target: AttachStepId) => {
		const targetIndex = STEPS.indexOf(target)
		setDirection(targetIndex < currentStepIndex ? -1 : 1)
		setCurrentStepIndex(targetIndex)
	}

	// Each step now only RECORDS its slice into the store (D3) — no more `advance()` in the same
	// gesture. The footer below is what moves the step index.
	const handleContactSubmit = (d: ContactStepData) => setContactRef(d.contactRef)
	const handleWorkspaceSubmit = (d: WorkspaceStepData) => setWorkspaceId(d.workspaceId)
	const handleAgentsSubmit = (d: AgentsStepData) => setProviders(d.providers)

	// Final submission gates through the full request schema — reused both to enable REVIEW's footer
	// commit button and to actually build the request.
	const canFinish = attachThreadMutationRequestSchema.safeParse({ contactRef, workspaceId, providers }).success
	const handleFinish = async () => {
		const result = attachThreadMutationRequestSchema.safeParse({ contactRef, workspaceId, providers })
		if (!result.success) return
		const res = await attach.mutateAsync({ data: result.data })
		navigate({ to: '/threads/$threadId', params: { threadId: res.threadId } })
	}

	// The footer's Continuar gate, per step — what a step's row click used to decide for itself
	// (calling `advance()` only when its own local form validated) now lives here, read off the store.
	const CAN_CONTINUE: Record<AttachStepId, boolean> = {
		CONTACT: Boolean(contactRef),
		WORKSPACE: Boolean(workspaceId),
		AGENTS: Boolean(providers?.length),
		REVIEW: canFinish,
	}
	const canContinue = CAN_CONTINUE[stepId]
	const isFirstStep = currentStepIndex === 0
	const isLastStep = currentStepIndex === STEPS.length - 1

	// Step dispatch by map — never a switch chain (CMP-P18). Each step gets the FRM-P17 props
	// contract; the review step additionally receives the accumulated selection + option lists.
	const STEP_COMPONENTS: Record<AttachStepId, ReactNode> = {
		// No `contacts` prop: the step owns that query, because it owns the search term that scopes it.
		CONTACT: <ContactStep channelKindById={channelKindById} defaultValues={{ contactRef }} onSubmit={handleContactSubmit} />,
		WORKSPACE: <WorkspaceStep workspaces={data?.workspaces ?? []} defaultValues={{ workspaceId }} onSubmit={handleWorkspaceSubmit} />,
		AGENTS: <AgentsStep providers={data?.providers ?? []} defaultValues={{ providers }} onSubmit={handleAgentsSubmit} />,
		REVIEW: (
			<ReviewStep
				contactRef={contactRef}
				workspaceId={workspaceId}
				providers={providers}
				channelKindById={channelKindById}
				workspaces={data?.workspaces ?? []}
				onEditContact={() => jumpTo('CONTACT')}
				onEditWorkspace={() => jumpTo('WORKSPACE')}
				onEditAgents={() => jumpTo('AGENTS')}
			/>
		),
	}

	const showFooter = !isLoading && !!data && !data.noChannelConnected

	return (
		// `min-h-full`, not `min-h-dvh`: the AppChrome title bar (mounted in `__root.tsx`) already took
		// its band out of the viewport, so the wizard fills the box the root left it and grows past it
		// into the root's scroller when a step is tall.
		<div className={cn('flex min-h-full flex-col bg-route-background text-foreground', className)} {...props}>
			{/* All FOUR specs' `Cabeçalho do assistente` padding is `[16, 24, 20, 24]` (CSS order
			    top/right/bottom/left — confirmed against `AppScreenFrame`'s own `padding: [0, 16] →
			    px-4` convention). This workspace's `--spacing` is `0.3rem` at a 14px root (NOT
			    Tailwind's 0.25rem default — see `card.tsx`'s comment), so 1 spacing unit ≈ 4.2px:
			    `pt-4`≈16.8px, `pb-5`≈21px, `px-6`≈25.2px — all within ~1px of the spec, no arbitrary
			    value needed. `md:px-10` (≈42px) measured via the region lane (F3 batch B3) as the
			    header padding that pushed the tab row ~18px right of the target. */}
			<header className="grid grid-cols-[auto_1fr_auto] items-center gap-4 pt-4 pb-5 px-6">
				{/* D3 (screens PENI6/EWECP/ZbVfW/du3gx) — an empty spacer sized like the close button,
				    not a `<Logo/>` (none of the design's four screens for this wizard show one): the two
				    equal-width `auto` columns are what actually centers the step tabs in the middle. */}
				<div aria-hidden className="size-8" />
				{/* O primitivo `Tabs` variante `line` foi feito para ESTE caso — o comentário dele diz
				    "wizard-step tabs" — e o stepper vinha reimplementando uma versão divergente: sublinhado
				    em `border-foreground` (preto) em vez de `--primary`, sem hover e sem anel de foco.
				    A variante entrega os três de graça e alinha à regra que a auditoria mediu: só a barra
				    recolore, o texto do ativo fica neutro. */}
				<Tabs
					value={STEPS[currentStepIndex]}
					onValueChange={value => {
						const next = STEPS.indexOf(value as AttachStepId)
						if (next > currentStepIndex) return
						setDirection(next < currentStepIndex ? -1 : 1)
						setCurrentStepIndex(next)
					}}
					className="items-center"
				>
					<TabsList variant="line" className="gap-6">
						{STEPS.map((id, i) => (
							<TabsTrigger key={id} value={id} disabled={i > currentStepIndex}>
								{t(STEP_NAV[id])}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				<Button variant="ghost" size="icon" aria-label={t('attach.close')} className="rounded-full" onClick={close}>
					<IconX />
				</Button>
			</header>

			{/* D3 (specs PENI6/EWECP/ZbVfW/du3gx) — `Conteúdo do passo` is `layout: vertical,
			    justifyContent: 'center', alignItems: 'center'` in ALL FOUR specs: the step's
			    title/subtitle/list vertically CENTER in the space between the tab header and the footer,
			    they don't sit pinned under the tabs. `justify-center` alone (no `flex-col`) only centered
			    the horizontal axis — the step content rendered top-aligned, ~150px above the design's
			    position, measured via the region lane (F3 batch B3). */}
			{/* All FOUR specs' `Conteúdo do passo` padding is `[12, 72]` (2-value shorthand:
			    vertical/horizontal — same convention as `AppScreenFrame`'s `padding: [0, 16] → px-4`).
			    `py-3`≈12.6px, `px-17`≈71.4px (17 spacing units × 4.2px — this workspace's `--spacing:
			    0.3rem` scale, not an arbitrary value; see the header comment above). The previous
			    `px-6 pb-10` (no top padding) skewed the `justify-center` result down by its own
			    asymmetry on top of the missing `flex-col` — fixed together above. */}
			<main className="flex flex-1 flex-col items-center justify-center px-17 py-3">
				{/* All FOUR specs' `Coluna` frame declares `width: 720` (fixed, not `fill_container`) —
				    `max-w-xl` (576px) rendered the step column ~216px narrower than the target (measured
				    via the region lane, F3 batch B3: card right edge landed ~504px in from the rail instead
				    of ~720px). Same fix, same value, same root cause as `OnboardingFlow`'s
				    `STEP_MAX_WIDTH.FULL_DISK_ACCESS` (`permissao-wrapper.json` "Coluna Central" width:720) —
				    not a fresh arbitrary value, a repeat of an already-established one. */}
				<div className="w-full max-w-[720px]">
					{isLoading || !data ? (
						<div className="flex flex-col gap-4">
							<Skeleton className="mx-auto h-10 w-64" />
							<Skeleton className="h-12 rounded-full" />
							<Skeleton className="h-16 rounded-2xl" />
						</div>
					) : data.noChannelConnected ? (
						<Empty className="pt-16">
							<EmptyTitle>{t('attach.needChannelTitle')}</EmptyTitle>
							<EmptyDescription>{t('attach.needChannelDescription')}</EmptyDescription>
							<Button className="mt-2" onClick={() => navigate({ to: '/channels' })}>
								{t('attach.goToChannels')}
							</Button>
						</Empty>
					) : (
						<div
							key={stepId}
							className={cn('animate-in fade-in duration-300 ease-out', direction === 1 ? 'slide-in-from-right-8' : 'slide-in-from-left-8')}
						>
							{STEP_COMPONENTS[stepId]}
						</div>
					)}
				</div>
			</main>

			{/* D3 — the persistent footer, present on every one of the four steps (screens
			    PENI6/EWECP/ZbVfW/du3gx). Voltar is `outline`, disabled on the first step (nothing to go
			    back to — the close button above covers "leave"); Continuar is `default`, disabled until
			    the current step has a valid selection, and becomes the commit action on REVIEW.
			    Padding `[24, 72, 28, 72]` (all four specs, CSS order) → `pt-6`≈25.2px/`pb-7`≈29.4px/
			    `px-17`≈71.4px on this workspace's `--spacing: 0.3rem` scale (see header comment above) —
			    the previous `px-10` (≈42px) sat Continuar ~30px closer to the window edge than the
			    target (region lane, F3 batch B3). */}
			{showFooter && (
				<footer className="flex items-center justify-between px-17 pt-6 pb-7">
					<Button type="button" variant="outline" size="lg" disabled={isFirstStep || attach.isPending} onClick={handleBack}>
						{t('attach.back')}
					</Button>
					<Button type="button" size="lg" disabled={!canContinue || attach.isPending} onClick={isLastStep ? handleFinish : advance}>
						{attach.isPending && <Spinner className="mr-2" />}
						{isLastStep ? (attach.isPending ? t('attach.attaching') : t('attach.finish')) : t('attach.continue')}
					</Button>
				</footer>
			)}
		</div>
	)
}
