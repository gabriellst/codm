// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-react-onboarding-composed-form
// task:        synthetic-react-onboarding-composed-form
// stamp:       agent-wave1-38ff876
// docTreeHash: 213519a54e23
// model:       sonnet
// graded:      2026-07-21T23:05:55.662Z
// source:      packages/app/react/src/routes/onboarding/-components/ConnectionModeStep/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import type { ComponentProps } from 'react'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { ToggleGroup } from '@/components/ui/toggle-group'
import { type DeepPartial, unionVariantValues } from '@/lib'
import { cn } from '@/lib/utils'
import { connectIntegrationMutationRequestSchema, ConnectionModeEnum, type ConnectionMode } from '@template/client-typescript/typescript'
import { IconArrowRight } from '@tabler/icons-react'
import { Spinner } from '@/components/ui/spinner'
import { useTranslation } from 'react-i18next'

// The connect union only carries CREDENTIALS/MANUAL members — OAUTH is a valid ConnectionMode
// elsewhere in the product but never a member of this union (unionVariantValues below proves it
// at the value level; this type alias keeps the compile-time domain equally narrow).
type WizardConnectionMode = Exclude<ConnectionMode, 'OAUTH'>

// FRM-P44: the choice's options come from the union's connectionMode discriminant — never a
// hand-typed array of mode strings.
const CONNECTION_MODE_VALUES = unionVariantValues(connectIntegrationMutationRequestSchema, 'connectionMode') as WizardConnectionMode[]

// A 2-key view of ConnectionModeEnum (never OAUTH — not a member of the connect union) so the
// ToggleGroup's enum-mode onValueChange narrows to exactly this step's schema output.
const WIZARD_CONNECTION_MODE_ENUM = {
	CREDENTIALS: ConnectionModeEnum.CREDENTIALS,
	MANUAL: ConnectionModeEnum.MANUAL,
} as const

export const ConnectionModeStepSchema = z.object({
	connectionMode: z.enum(CONNECTION_MODE_VALUES as [WizardConnectionMode, ...WizardConnectionMode[]]),
})

type ConnectionModeStepData = (typeof ConnectionModeStepSchema)['_zod']['output']

// Omit the native `onSubmit` — the FRM-P17 step contract's `onSubmit(data)` callback (not a
// form event handler) reuses the name; the component always wires the real DOM handler itself.
type ConnectionModeStepProps = Omit<ComponentProps<'form'>, 'onSubmit'> & {
	defaultValues?: DeepPartial<ConnectionModeStepData>
	onSubmit: (data: ConnectionModeStepData) => void
	onBack?: () => void
	isSubmitting?: boolean
}

export function ConnectionModeStep({ defaultValues, onSubmit, onBack, isSubmitting, className, ...props }: ConnectionModeStepProps) {
	const { t } = useTranslation()

	const form = useForm({
		defaultValues,
		validators: {
			onChange: ConnectionModeStepSchema,
		},
		onSubmit: async form => {
			const result = ConnectionModeStepSchema.safeParse(form.value)
			if (!result.success) return
			onSubmit(result.data)
		},
	})

	return (
		<form
			className={cn('flex flex-col gap-8 p-2', className)}
			{...props}
			onSubmit={e => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			<div className="text-center">
				<h1 className="text-3xl font-bold tracking-tight">{t('onboarding.welcome.title')}</h1>
				<p className="text-muted-foreground mt-2">{t('onboarding.welcome.subtitle')}</p>
			</div>

			<div className="text-center">
				<h2 className="text-xl font-semibold tracking-tight">{t('onboarding.connectionMode.title')}</h2>
				<p className="text-muted-foreground mt-1">{t('onboarding.connectionMode.subtitle')}</p>
			</div>

			<form.Field name="connectionMode">
				{field => (
					<FieldGroup className="items-center">
						<ToggleGroup
							enum={WIZARD_CONNECTION_MODE_ENUM}
							i18nPrefix="enums.ConnectionMode"
							value={field.state.value}
							onValueChange={field.handleChange}
						/>
					</FieldGroup>
				)}
			</form.Field>

			<form.Subscribe selector={state => ({ canSubmit: state.canSubmit, values: state.values })}>
				{({ canSubmit, values }) => {
					const isDisabled = isSubmitting || !canSubmit || !ConnectionModeStepSchema.safeParse(values).success
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

export type { ConnectionModeStepData }
