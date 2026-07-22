// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-react-onboarding-composed-form
// task:        synthetic-react-onboarding-composed-form
// stamp:       agent-wave1-38ff876
// docTreeHash: 213519a54e23
// model:       sonnet
// graded:      2026-07-21T23:05:55.662Z
// source:      packages/app/react/src/routes/onboarding/-components/TictoCredentialsStep/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import type { ComponentProps } from 'react'
import { useForm } from '@tanstack/react-form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel, FieldError, FieldGroup } from '@/components/ui/field'
import { type DeepPartial, pickUnionVariantField } from '@/lib'
import { cn } from '@/lib/utils'
import { connectIntegrationMutationRequestSchema } from '@template/client-typescript/typescript'
import { IconArrowRight, IconArrowLeft } from '@tabler/icons-react'
import { Spinner } from '@/components/ui/spinner'
import { useTranslation } from 'react-i18next'

// FRM-P44: the field sub-schema of the matched union member — Ticto's credentials shape
// differs from Shopify's, each validating against its own concrete union member.
export const TictoCredentialsStepSchema = pickUnionVariantField(
	connectIntegrationMutationRequestSchema,
	{ platform: 'TICTO', connectionMode: 'CREDENTIALS' },
	'credentials',
)

type TictoCredentialsStepData = (typeof TictoCredentialsStepSchema)['_zod']['output']

// Omit the native `onSubmit` — the FRM-P17 step contract's `onSubmit(data)` callback (not a
// form event handler) reuses the name; the component always wires the real DOM handler itself.
type TictoCredentialsStepProps = Omit<ComponentProps<'form'>, 'onSubmit'> & {
	defaultValues?: DeepPartial<TictoCredentialsStepData>
	onSubmit: (data: TictoCredentialsStepData) => void
	onBack?: () => void
	isSubmitting?: boolean
}

export function TictoCredentialsStep({ defaultValues, onSubmit, onBack, isSubmitting, className, ...props }: TictoCredentialsStepProps) {
	const { t } = useTranslation()

	const form = useForm({
		defaultValues,
		validators: {
			onChange: TictoCredentialsStepSchema,
		},
		onSubmit: async form => {
			const result = TictoCredentialsStepSchema.safeParse(form.value)
			if (!result.success) return
			onSubmit(result.data)
		},
	})

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
				<h2 className="text-2xl font-semibold tracking-tight">{t('onboarding.tictoCredentials.title')}</h2>
				<p className="text-muted-foreground mt-2">{t('onboarding.tictoCredentials.subtitle')}</p>
			</div>

			<FieldGroup>
				<form.Field name="storeAlias">
					{field => {
						const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
						return (
							<Field>
								<FieldLabel htmlFor={field.name}>{t('onboarding.tictoCredentials.storeAlias')}</FieldLabel>
								<Input
									id={field.name}
									value={field.state.value ?? ''}
									onBlur={field.handleBlur}
									onChange={e => field.handleChange(e.target.value)}
									placeholder={t('onboarding.tictoCredentials.storeAliasPlaceholder')}
									aria-invalid={isInvalid}
								/>
								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						)
					}}
				</form.Field>

				<form.Field name="token">
					{field => {
						const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
						return (
							<Field>
								<FieldLabel htmlFor={field.name}>{t('onboarding.tictoCredentials.token')}</FieldLabel>
								<Input
									id={field.name}
									value={field.state.value ?? ''}
									onBlur={field.handleBlur}
									onChange={e => field.handleChange(e.target.value)}
									placeholder={t('onboarding.tictoCredentials.tokenPlaceholder')}
									aria-invalid={isInvalid}
								/>
								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						)
					}}
				</form.Field>

				<form.Field name="secretKey">
					{field => {
						const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
						return (
							<Field>
								<FieldLabel htmlFor={field.name}>{t('onboarding.tictoCredentials.secretKey')}</FieldLabel>
								<Input
									id={field.name}
									type="password"
									value={field.state.value ?? ''}
									onBlur={field.handleBlur}
									onChange={e => field.handleChange(e.target.value)}
									placeholder={t('onboarding.tictoCredentials.secretKeyPlaceholder')}
									aria-invalid={isInvalid}
								/>
								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						)
					}}
				</form.Field>
			</FieldGroup>

			<form.Subscribe selector={state => ({ canSubmit: state.canSubmit, values: state.values })}>
				{({ canSubmit, values }) => {
					const isDisabled = isSubmitting || !canSubmit || !TictoCredentialsStepSchema.safeParse(values).success
					return (
						<div className="flex justify-between">
							<div>
								{onBack && (
									<Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
										<IconArrowLeft className="mr-1 size-4" />
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

export type { TictoCredentialsStepData }
