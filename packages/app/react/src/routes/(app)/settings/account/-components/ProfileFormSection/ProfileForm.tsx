import React from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { useUpdateProfile, updateProfileMutationRequestSchema, getMyAccountQueryKey } from '@template/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { cn } from '@/lib/utils'

import { Field, FieldLabel, FieldError, FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

import { AvatarUploader } from '../AvatarUploader'

// Body fields accepted by PATCH /v1/me/profile — validated against the SDK schema
// (same Zod the controller validates with).
type ProfileBody = z.infer<typeof updateProfileMutationRequestSchema>

// A15: compose ComponentProps so parents can place/style/test-target this form
type ProfileFormProps = React.ComponentProps<'form'> & {
	defaultValues: {
		name: string
		email: string
		company: string | null
		pictureUrl: string | null
	}
	fallbackInitials: string
}

/**
 * ProfileForm — TanStack Form + updateProfile mutation.
 * Submittable fields: name + pictureUrl (what the backend accepts).
 * Display-only fields: email, company (returned by getMyAccount but not updatable via this endpoint).
 */
export function ProfileForm({ defaultValues, fallbackInitials, className, ...props }: ProfileFormProps) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()

	// H1: onSuccess declared on the mutation, not at mutateAsync call sites.
	const updateProfileMutation = useUpdateProfile({
		mutation: {
			onSuccess: () => {
				toast.success(t('account.profile.saveSuccess'))
				queryClient.invalidateQueries({ queryKey: getMyAccountQueryKey() })
			},
		},
	})

	const formDefaults: DeepPartial<ProfileBody> = {
		name: defaultValues.name,
		pictureUrl: defaultValues.pictureUrl,
	}

	const form = useForm({
		defaultValues: formDefaults,
		validators: { onChange: updateProfileMutationRequestSchema },
		onSubmit: async ({ value }) => {
			const result = updateProfileMutationRequestSchema.safeParse(value)
			if (!result.success) return
			await updateProfileMutation.mutateAsync({ data: result.data })
		},
	})

	return (
		// A15: forward className + native form attrs; keep form's onSubmit last
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
				{/* Avatar uploader (pictureUrl field) */}
				<form.Field name="pictureUrl">
					{field => (
						<AvatarUploader
							value={field.state.value ?? null}
							fallbackInitials={fallbackInitials}
							onUpload={() => {
								// NOTE: upload mutation hook not available in SDK yet.
								// Stub: show a toast and skip the upload.
								toast.info(t('account.profile.avatar.uploadStub'))
							}}
							onRemove={() => field.handleChange(null)}
						/>
					)}
				</form.Field>

				<div className="grid gap-4 sm:grid-cols-2">
					{/* Name — submittable */}
					<form.Field name="name">
						{field => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
							return (
								<Field>
									<FieldLabel htmlFor={field.name}>{t('account.profile.name')}</FieldLabel>
									<Input
										id={field.name}
										type="text"
										autoComplete="name"
										value={field.state.value ?? ''}
										onBlur={field.handleBlur}
										onChange={e => field.handleChange(e.target.value)}
										aria-invalid={isInvalid}
									/>
									{isInvalid && <FieldError errors={field.state.meta.errors} />}
								</Field>
							)
						}}
					</form.Field>

					{/* Email — display only (not accepted by PATCH /v1/me/profile) */}
					<Field>
						<FieldLabel>{t('account.profile.email')}</FieldLabel>
						<Input type="email" autoComplete="email" value={defaultValues.email} disabled aria-readonly="true" className="opacity-60" />
					</Field>

					{/* Company — display only */}
					<Field>
						<FieldLabel>{t('account.profile.company')}</FieldLabel>
						<Input
							type="text"
							autoComplete="organization"
							value={defaultValues.company ?? ''}
							disabled
							aria-readonly="true"
							className="opacity-60"
						/>
					</Field>
				</div>

				{/* safeParse-driven submit button (FRM-P19/P20) */}
				<form.Subscribe selector={s => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting, values: s.values })}>
					{({ canSubmit, isSubmitting, values }) => {
						const isPending = isSubmitting || updateProfileMutation.isPending
						const isDisabled = !canSubmit || isPending || !updateProfileMutationRequestSchema.safeParse(values).success
						return (
							<div className="flex justify-end">
								<Button type="submit" disabled={isDisabled}>
									{isPending && <Spinner className="mr-2" />}
									{t('account.profile.save')}
								</Button>
							</div>
						)
					}}
				</form.Subscribe>
			</FieldGroup>
		</form>
	)
}
