import { type ComponentProps, type ReactNode, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { IconX } from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'
import { attachThreadMutationRequestSchema, useAttachThread, useGetAttachThreadWizard } from '@codm/client-typescript/typescript'
import type { ChannelKind } from '@codm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
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
	const isLastStep = stepId === 'REVIEW'

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
			<header className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-6 py-5 md:px-10">
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

			<main className="flex flex-1 justify-center px-6 pb-10">
				<div className="w-full max-w-xl pt-6">
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
			    the current step has a valid selection, and becomes the commit action on REVIEW. */}
			{showFooter && (
				<footer className="flex items-center justify-between px-10 py-7">
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
