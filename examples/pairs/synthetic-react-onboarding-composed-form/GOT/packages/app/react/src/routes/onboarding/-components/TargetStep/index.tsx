// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-react-onboarding-composed-form
// task:        synthetic-react-onboarding-composed-form
// stamp:       agent-wave1-38ff876
// docTreeHash: 213519a54e23
// model:       sonnet
// graded:      2026-07-21T23:05:55.662Z
// source:      packages/app/react/src/routes/onboarding/-components/TargetStep/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import type { ComponentProps } from 'react'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { type DeepPartial, unionVariantValues } from '@/lib'
import {
	connectIntegrationMutationRequestSchema,
	type ConnectIntegrationMutationRequest,
	type ConnectionMode,
} from '@template/client-typescript/typescript'
import { IconArrowRight } from '@tabler/icons-react'
import { Spinner } from '@/components/ui/spinner'
import { useTranslation } from 'react-i18next'

export type IntegrationType = ConnectIntegrationMutationRequest['type']
export type IntegrationPlatform = ConnectIntegrationMutationRequest['platform']

export interface TargetCatalogItem {
	type: IntegrationType
	platform: IntegrationPlatform
	connectionMode: ConnectionMode
}

// The four launch targets — one dispatch entry per (type, platform, connectionMode) tuple this
// wizard supports. Filtered per-mode below; never an if/switch on platform (CMP-P18). Also the
// canonical (non-DeepPartial) source for the full discriminant tuple: ConnectWizard/ReviewStep
// read TARGETS[platform] instead of the accumulated form's deeply-partial type/platform fields
// when they need a match for pickUnionVariant. `as const satisfies` (not a `Record<...>`
// annotation) keeps each entry's fields narrow literals — correlated per platform — instead of
// widening every field to the full 4-member union, which is what pickUnionVariant needs to match
// a single concrete member.
export const TARGETS = {
	SHOPIFY: { type: 'SALES_CHANNEL', platform: 'SHOPIFY', connectionMode: 'CREDENTIALS' },
	TICTO: { type: 'CHECKOUT', platform: 'TICTO', connectionMode: 'CREDENTIALS' },
	META: { type: 'MARKETING_PLATFORM', platform: 'META', connectionMode: 'MANUAL' },
	MERCADOPAGO: { type: 'PAYMENT_GATEWAY', platform: 'MERCADOPAGO', connectionMode: 'MANUAL' },
} as const satisfies Record<IntegrationPlatform, TargetCatalogItem>

const TYPE_VALUES = unionVariantValues(connectIntegrationMutationRequestSchema, 'type') as IntegrationType[]
const PLATFORM_VALUES = unionVariantValues(connectIntegrationMutationRequestSchema, 'platform') as IntegrationPlatform[]

export const TargetStepSchema = z.object({
	type: z.enum(TYPE_VALUES as [IntegrationType, ...IntegrationType[]]),
	platform: z.enum(PLATFORM_VALUES as [IntegrationPlatform, ...IntegrationPlatform[]]),
})

type TargetStepData = (typeof TargetStepSchema)['_zod']['output']

// Omit the native `onSubmit` — the FRM-P17 step contract's `onSubmit(data)` callback (not a
// form event handler) reuses the name; the component always wires the real DOM handler itself.
type TargetStepProps = Omit<ComponentProps<'form'>, 'onSubmit'> & {
	connectionMode: ConnectionMode
	defaultValues?: DeepPartial<TargetStepData>
	onSubmit: (data: TargetStepData) => void
	onBack?: () => void
	isSubmitting?: boolean
}

// Literal t() keys per platform — a dynamic `t(\`onboarding.target.${key}.name\`)` would bypass
// the typed-key check that forces matching entries into both locale files. `satisfies` (not a
// `Record<...>` annotation) keeps each value a narrow literal so indexing by `target.platform`
// resolves to the union of valid keys, not `string`.
export const TARGET_COPY = {
	SHOPIFY: { name: 'onboarding.target.shopify.name', description: 'onboarding.target.shopify.description' },
	TICTO: { name: 'onboarding.target.ticto.name', description: 'onboarding.target.ticto.description' },
	META: { name: 'onboarding.target.meta.name', description: 'onboarding.target.meta.description' },
	MERCADOPAGO: { name: 'onboarding.target.mercadopago.name', description: 'onboarding.target.mercadopago.description' },
} as const satisfies Record<IntegrationPlatform, { name: string; description: string }>

export function TargetStep({ connectionMode, defaultValues, onSubmit, onBack, isSubmitting, className, ...props }: TargetStepProps) {
	const { t } = useTranslation()

	const form = useForm({
		defaultValues,
		onSubmit: async form => {
			const result = TargetStepSchema.safeParse(form.value)
			if (!result.success) return
			onSubmit(result.data)
		},
	})

	const targets = Object.values(TARGETS).filter(target => target.connectionMode === connectionMode)

	return (
		<form
			className={cn('flex flex-col gap-6 p-2', className)}
			{...props}
			onSubmit={e => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			<div className="text-center">
				<h2 className="text-2xl font-semibold tracking-tight">{t('onboarding.target.title')}</h2>
				<p className="text-muted-foreground mt-2">{t('onboarding.target.subtitle')}</p>
			</div>

			<form.Subscribe selector={state => ({ type: state.values.type, platform: state.values.platform })}>
				{({ type, platform }) => (
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						{targets.map(target => {
							const isSelected = type === target.type && platform === target.platform
							return (
								<Card
									key={target.platform}
									role="button"
									tabIndex={0}
									onClick={() => {
										form.setFieldValue('type', target.type)
										form.setFieldValue('platform', target.platform)
									}}
									className={cn('cursor-pointer p-4 transition-colors', isSelected && 'ring-2 ring-primary')}
								>
									<p className="font-semibold">{t(TARGET_COPY[target.platform].name)}</p>
									<p className="text-muted-foreground mt-1 text-sm">{t(TARGET_COPY[target.platform].description)}</p>
								</Card>
							)
						})}
					</div>
				)}
			</form.Subscribe>

			<form.Subscribe selector={state => ({ canSubmit: state.canSubmit, values: state.values })}>
				{({ canSubmit, values }) => {
					const isDisabled = isSubmitting || !canSubmit || !TargetStepSchema.safeParse(values).success
					return (
						<div className="flex justify-between">
							<div>
								{onBack && (
									<Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
										{t('common.back')}
									</Button>
								)}
							</div>
							<div className="flex gap-2">
								<Button type="submit" disabled={isDisabled}>
									{isSubmitting && <Spinner className="mr-2" />}
									{t('common.next')}
									<IconArrowRight className="ml-1 size-4" />
								</Button>
							</div>
						</div>
					)
				}}
			</form.Subscribe>
		</form>
	)
}

export type { TargetStepData }
