import React from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { useUpdateProfile, getMyAccountQueryKey, LanguageEnum } from '@template/client-typescript/typescript'
import type { CurrencyCode } from '@template/client-typescript/typescript'

import { cn } from '@/lib/utils'
import type { DeepPartial } from '@/lib'
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

// Preferences persist on the UserProfile aggregate via UpdateProfile (the auth context owns the
// whole user surface since the identity collapse; the former UpdateUserSettings/UserPreferences
// pair was removed as product-specific). This is a UI schema (A3): the form input shape narrows
// to the SDK body on submit.
const preferencesSchema = z.object({
	language: z.enum([LanguageEnum['pt-BR'], LanguageEnum['en-US']]),
	timezone: z.string().min(1, { message: 'REQUIRED' }),
})

type PreferencesValues = z.infer<typeof preferencesSchema>

// A15: compose ComponentProps so parents can place/style/test-target this form
type PreferencesFormProps = React.ComponentProps<'form'> & {
	defaultValues: DeepPartial<PreferencesValues>
	/** currency is read-only — shown but not editable. */
	currency: CurrencyCode
}

/**
 * PreferencesForm — language / timezone settings, persisted on the user profile.
 * currency is read-only. Uses the updateProfile mutation.
 */
export function PreferencesForm({ defaultValues, currency, className, ...props }: PreferencesFormProps) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()

	// H1: onSuccess declared on the hook; toast + invalidation co-located here.
	const updateProfileMutation = useUpdateProfile({
		mutation: {
			onSuccess: () => {
				toast.success(t('account.preferences.saveSuccess'))
				queryClient.invalidateQueries({ queryKey: getMyAccountQueryKey() })
			},
		},
	})

	const form = useForm({
		defaultValues,
		validators: { onChange: preferencesSchema },
		onSubmit: async ({ value }) => {
			const result = preferencesSchema.safeParse(value)
			if (!result.success) return

			await updateProfileMutation.mutateAsync({
				data: {
					timezone: result.data.timezone,
					language: result.data.language,
				},
			})
		},
	})

	return (
		// A15: forward className + native form attrs; keep form's own onSubmit last
		<form
			noValidate
			className={cn(className)}
			{...props}
			onSubmit={e => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			<FieldGroup>
				<div className="grid gap-4 sm:grid-cols-2">
					{/* Language — A13: enum mode on <Select>, no hand-rolled items block */}
					<form.Field name="language">
						{field => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
							return (
								<Field>
									<FieldLabel htmlFor={field.name}>{t('account.preferences.language')}</FieldLabel>
									<Select
										enum={LanguageEnum}
										i18nPrefix="enums.Language"
										value={field.state.value}
										onValueChange={field.handleChange}
										placeholder="account.preferences.languagePlaceholder"
										id={field.name}
										aria-invalid={isInvalid}
									/>
								</Field>
							)
						}}
					</form.Field>

					{/* Timezone */}
					<form.Field name="timezone">
						{field => (
							<Field>
								<FieldLabel htmlFor={field.name}>{t('account.preferences.timezone')}</FieldLabel>
								<Input
									id={field.name}
									type="text"
									placeholder="America/Sao_Paulo"
									value={field.state.value ?? ''}
									onBlur={field.handleBlur}
									onChange={e => field.handleChange(e.target.value)}
								/>
							</Field>
						)}
					</form.Field>

					{/* Currency — read-only */}
					<Field>
						<FieldLabel>{t('account.preferences.currency')}</FieldLabel>
						<Input type="text" value={currency} disabled aria-readonly="true" className="opacity-60" />
					</Field>
				</div>

				{/* safeParse-driven submit button */}
				<form.Subscribe selector={s => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting, values: s.values })}>
					{({ canSubmit, isSubmitting, values }) => {
						const isPending = isSubmitting || updateProfileMutation.isPending
						const isDisabled = !canSubmit || isPending || !preferencesSchema.safeParse(values).success
						return (
							<div className="flex justify-end">
								<Button type="submit" disabled={isDisabled}>
									{isPending && <Spinner className="mr-2" />}
									{t('account.preferences.save')}
								</Button>
							</div>
						)
					}}
				</form.Subscribe>
			</FieldGroup>
		</form>
	)
}
