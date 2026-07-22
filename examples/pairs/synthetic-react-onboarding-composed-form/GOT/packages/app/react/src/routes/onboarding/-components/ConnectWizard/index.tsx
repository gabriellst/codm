// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-react-onboarding-composed-form
// task:        synthetic-react-onboarding-composed-form
// stamp:       agent-wave1-38ff876
// docTreeHash: 213519a54e23
// model:       sonnet
// graded:      2026-07-21T23:05:55.662Z
// source:      packages/app/react/src/routes/onboarding/-components/ConnectWizard/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
// SEEDED CANONICAL SPINE — complete the TODOs; do NOT rewrite or delete this file.
// The _infer typing, sequence Record, setFieldValue merging and pickUnionVariant gate
// are the measured-canonical machinery (form FRM-P13/15/18/43).
import { type ComponentProps, type ReactNode } from 'react'
import { useForm } from '@tanstack/react-form'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
	connectIntegrationMutationRequestSchema,
	ConnectionModeEnum,
	IntegrationPlatformEnum,
	useConnectIntegration,
	type ConnectionMode,
} from '@template/client-typescript/typescript'
import { pickUnionVariant } from '@/lib/union'
import type { DeepPartial } from '@/lib'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { useOnboardingStore } from '../../-stores/useOnboardingStore'
import { ConnectionModeStep, type ConnectionModeStepData } from '../ConnectionModeStep'
import { TargetStep, type TargetStepData, TARGETS } from '../TargetStep'
import { ShopifyCredentialsStep, type ShopifyCredentialsStepData } from '../ShopifyCredentialsStep'
import { TictoCredentialsStep, type TictoCredentialsStepData } from '../TictoCredentialsStep'
import { ReviewStep } from '../ReviewStep'

// ─── Step sequences — const-asserted tuples in an enum-keyed map (FRM-P13) ──────────────
// CONNECTION_MODE and TARGET are common to both flows; only CREDENTIALS mode adds the
// credentials-collection step before REVIEW.
const CREDENTIALS_STEPS = ['CONNECTION_MODE', 'TARGET', 'CREDENTIALS', 'REVIEW'] as const
const MANUAL_STEPS = ['CONNECTION_MODE', 'TARGET', 'REVIEW'] as const

export type ConnectStepId = (typeof CREDENTIALS_STEPS)[number] | (typeof MANUAL_STEPS)[number]

// The connect union only carries CREDENTIALS/MANUAL — OAUTH (a valid ConnectionMode elsewhere in
// the product) is never selectable here, so the sequence map excludes it.
const STEP_SEQUENCES: Record<Exclude<ConnectionMode, 'OAUTH'>, readonly ConnectStepId[]> = {
	[ConnectionModeEnum.CREDENTIALS]: CREDENTIALS_STEPS,
	[ConnectionModeEnum.MANUAL]: MANUAL_STEPS,
}

// ─── The accumulated-form typing trick (FRM-P18) ─────────────────────────────────────────
// An UNCALLED function wrapping useForm: its ReturnType IS the typed form instance —
// never hand-write an interface of field names. defaultValues uses the union's
// DeepPartial so steps can merge incrementally without the Partial<Union> fight.
function _inferConnectForm() {
	return useForm({
		defaultValues: {} as DeepPartial<(typeof connectIntegrationMutationRequestSchema)['_zod']['output']>,
	})
}
export type ConnectForm = ReturnType<typeof _inferConnectForm>

export function ConnectWizard({ className, ...props }: ComponentProps<'main'>) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { currentStepIndex, selectedMode, selectedPlatform, setCurrentStepIndex, setDirection, setSelectedMode, setSelectedPlatform } =
		useOnboardingStore()

	const form = _inferConnectForm()

	// Before a mode is chosen, only CONNECTION_MODE (index 0, common to both sequences) renders.
	const sequence = selectedMode ? STEP_SEQUENCES[selectedMode] : CREDENTIALS_STEPS
	const stepId = sequence[currentStepIndex] ?? sequence[0]

	const connectIntegration = useConnectIntegration({
		mutation: {
			onSuccess: () => {
				toast.success(t('onboarding.toast.connectSuccess'))
				navigate({ to: '/dashboard' })
			},
		},
	})

	// Step output merges into the parent via setFieldValue (FRM-P15) — each step validates
	// its own slice; the parent merges and advances.
	function handleConnectionModeSubmit(data: ConnectionModeStepData) {
		form.setFieldValue('connectionMode', data.connectionMode)
		setSelectedMode(data.connectionMode)
		setDirection(1)
		setCurrentStepIndex(currentStepIndex + 1)
	}

	function handleTargetSubmit(data: TargetStepData) {
		form.setFieldValue('type', data.type)
		form.setFieldValue('platform', data.platform)
		setSelectedPlatform(data.platform)
		setDirection(1)
		setCurrentStepIndex(currentStepIndex + 1)
	}

	function handleCredentialsSubmit(data: ShopifyCredentialsStepData | TictoCredentialsStepData) {
		form.setFieldValue('credentials', data)
		setDirection(1)
		setCurrentStepIndex(currentStepIndex + 1)
	}

	function handleBack() {
		setDirection(-1)
		setCurrentStepIndex(Math.max(0, currentStepIndex - 1))
	}

	// Final submission gates through the union (FRM-P43): parse the accumulated payload
	// against the variant picked by the FULL discriminant tuple; submit result.data only.
	async function handleFinish() {
		const payload = form.state.values
		// TARGETS[platform] is the canonical, non-DeepPartial source for the full discriminant
		// tuple — the accumulated form's type/platform fields are deeply partial (nested
		// `credentials` would also come along and mismatch pickUnionVariant's shallow
		// Partial<Member> match type), so the match is read from the catalog entry instead.
		const target = selectedPlatform ? TARGETS[selectedPlatform] : undefined
		if (!target) return
		const result = pickUnionVariant(connectIntegrationMutationRequestSchema, target).safeParse(payload)
		if (!result.success) return
		await connectIntegration.mutateAsync({ data: result.data })
	}

	// Step dispatch by map — never a switch chain (CMP-P18). Each entry receives the
	// FRM-P17 props contract; the review step additionally receives the typed parent form.
	// `values.platform === ...` narrows the accumulated union so `.credentials` resolves to
	// that member's shape only — `form.state.values.credentials` alone errors (the field
	// doesn't exist on the MANUAL-mode members).
	const values = form.state.values
	const CREDENTIALS_FORMS: Record<'SHOPIFY' | 'TICTO', ReactNode> = {
		SHOPIFY: (
			<ShopifyCredentialsStep
				defaultValues={values.platform === IntegrationPlatformEnum.SHOPIFY ? values.credentials : undefined}
				onSubmit={handleCredentialsSubmit}
				onBack={handleBack}
				isSubmitting={connectIntegration.isPending}
			/>
		),
		TICTO: (
			<TictoCredentialsStep
				defaultValues={values.platform === IntegrationPlatformEnum.TICTO ? values.credentials : undefined}
				onSubmit={handleCredentialsSubmit}
				onBack={handleBack}
				isSubmitting={connectIntegration.isPending}
			/>
		),
	}

	const STEP_COMPONENTS: Record<ConnectStepId, ReactNode> = {
		CONNECTION_MODE: <ConnectionModeStep defaultValues={{ connectionMode: selectedMode }} onSubmit={handleConnectionModeSubmit} />,
		TARGET: selectedMode ? (
			<TargetStep
				connectionMode={selectedMode}
				defaultValues={{ type: form.state.values.type, platform: form.state.values.platform }}
				onSubmit={handleTargetSubmit}
				onBack={handleBack}
			/>
		) : null,
		CREDENTIALS:
			selectedPlatform === IntegrationPlatformEnum.SHOPIFY || selectedPlatform === IntegrationPlatformEnum.TICTO
				? CREDENTIALS_FORMS[selectedPlatform]
				: null,
		REVIEW: <ReviewStep form={form} onBack={handleBack} onFinish={handleFinish} isSubmitting={connectIntegration.isPending} />,
	}

	return (
		<main className={cn('flex min-h-dvh flex-col items-center justify-center px-4 py-12', className)} {...props}>
			{STEP_COMPONENTS[stepId]}
		</main>
	)
}
