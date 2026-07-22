import { type ReactNode, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { IconX } from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'
import { attachThreadMutationRequestSchema, useAttachThread, useGetAttachThreadWizard } from '@codedm/client-typescript/typescript'
import type { ChannelKind } from '@codedm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
import type { DeepPartial } from '@/lib'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/console/Logo'
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

// ─── The accumulated-form typing trick (FRM-P18) ─────────────────────────────────────────────────
// An UNCALLED function wrapping useForm: its ReturnType IS the typed form instance. defaultValues is
// the request's DeepPartial so each step merges its slice incrementally.
function _inferAttachForm() {
	return useForm({
		defaultValues: {} as DeepPartial<(typeof attachThreadMutationRequestSchema)['_zod']['output']>,
	})
}
export type AttachForm = ReturnType<typeof _inferAttachForm>

/** Guided attach flow (T15): contact → workspace → agents → review on a chrome-less fullscreen. */
export function AttachThreadWizard() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { data, isLoading } = useGetAttachThreadWizard()
	const attach = useAttachThread()

	const { currentStepIndex, direction, setCurrentStepIndex, setDirection, reset } = useAttachWizardStore()
	const form = _inferAttachForm()

	// Fresh wizard on every entry — the store persists across navigations, the form does not.
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

	// Each step validates its own slice; the parent merges via setFieldValue (FRM-P15) and advances.
	const handleContactSubmit = (d: ContactStepData) => {
		form.setFieldValue('contactRef', d.contactRef)
		advance()
	}
	const handleWorkspaceSubmit = (d: WorkspaceStepData) => {
		form.setFieldValue('workspaceId', d.workspaceId)
		advance()
	}
	const handleAgentsSubmit = (d: AgentsStepData) => {
		form.setFieldValue('providers', d.providers)
		advance()
	}

	// Final submission gates through the full request schema, then navigates into the new thread.
	const handleFinish = async () => {
		const result = attachThreadMutationRequestSchema.safeParse(form.state.values)
		if (!result.success) return
		const res = await attach.mutateAsync({ data: result.data })
		navigate({ to: '/threads/$threadId', params: { threadId: res.threadId } })
	}

	// Step dispatch by map — never a switch chain (CMP-P18). Each step gets the FRM-P17 props
	// contract; the review step additionally receives the typed parent form + option lists.
	const values = form.state.values
	const STEP_COMPONENTS: Record<AttachStepId, ReactNode> = {
		CONTACT: (
			<ContactStep
				contacts={data?.contacts ?? []}
				channelKindById={channelKindById}
				defaultValues={{ contactRef: values.contactRef }}
				onSubmit={handleContactSubmit}
			/>
		),
		WORKSPACE: (
			<WorkspaceStep
				workspaces={data?.workspaces ?? []}
				defaultValues={{ workspaceId: values.workspaceId }}
				onSubmit={handleWorkspaceSubmit}
				onBack={handleBack}
			/>
		),
		AGENTS: (
			<AgentsStep
				providers={data?.providers ?? []}
				defaultValues={{ providers: values.providers }}
				onSubmit={handleAgentsSubmit}
				onBack={handleBack}
			/>
		),
		REVIEW: (
			<ReviewStep
				form={form}
				channelKindById={channelKindById}
				workspaces={data?.workspaces ?? []}
				onBack={handleBack}
				onFinish={handleFinish}
				isSubmitting={attach.isPending}
			/>
		),
	}

	return (
		<div className="flex min-h-dvh flex-col bg-route-background text-foreground">
			<header className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-6 py-5 md:px-10">
				<Logo className="text-base" />
				<nav className="flex items-center justify-center gap-6">
					{STEPS.map((id, i) => (
						<button
							key={id}
							type="button"
							disabled={i > currentStepIndex}
							onClick={() => {
								if (i <= currentStepIndex) {
									setDirection(i < currentStepIndex ? -1 : 1)
									setCurrentStepIndex(i)
								}
							}}
							className={cn(
								'border-b-2 pb-1 text-sm font-medium transition-colors',
								i === currentStepIndex ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground',
								i > currentStepIndex && 'cursor-not-allowed opacity-50',
							)}
						>
							{t(STEP_NAV[id])}
						</button>
					))}
				</nav>
				<Button variant="secondary" size="icon" aria-label={t('attach.close')} className="rounded-full" onClick={close}>
					<IconX />
				</Button>
			</header>

			<main className="flex flex-1 justify-center px-6 pb-24">
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
		</div>
	)
}
