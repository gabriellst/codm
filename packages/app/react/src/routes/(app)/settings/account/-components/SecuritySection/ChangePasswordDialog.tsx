import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Field, FieldLabel, FieldError, FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useDialogStore } from '@/stores/useDialogStore'
import { cn } from '@/lib/utils'

const changePasswordSchema = z
	.object({
		currentPassword: z.string().min(1, { message: 'REQUIRED' }),
		newPassword: z.string().min(8, { message: 'PASSWORD_TOO_SHORT' }),
		confirmPassword: z.string().min(1, { message: 'REQUIRED' }),
	})
	.refine(data => data.newPassword === data.confirmPassword, {
		message: 'PASSWORDS_DO_NOT_MATCH',
		path: ['confirmPassword'],
	})

/**
 * ChangePasswordDialog — self-contained dialog with a 3-field password change form.
 * NOTE: No changePassword mutation hook exists in the SDK yet.
 * The form is parent-controlled via a stub onSubmit that shows a toast.
 * Link this dialog from the PR that adds the mutation to the SDK.
 */
export function ChangePasswordDialog({ className }: Pick<ComponentProps<typeof DialogContent>, 'className'>) {
	const { t } = useTranslation()
	const hide = useDialogStore(s => s.hide)

	const form = useForm({
		defaultValues: {
			currentPassword: '',
			newPassword: '',
			confirmPassword: '',
		},
		validators: { onChange: changePasswordSchema },
		onSubmit: async () => {
			// NOTE: stub — no changePassword SDK mutation available yet.
			toast.info(t('account.security.changePassword.stub'))
			hide()
		},
	})

	return (
		<DialogContent className={cn(className)}>
			<DialogHeader>
				<DialogTitle>{t('account.security.changePassword.dialogTitle')}</DialogTitle>
				<DialogDescription>{t('account.security.changePassword.dialogDescription')}</DialogDescription>
			</DialogHeader>

			<form
				noValidate
				onSubmit={e => {
					e.preventDefault()
					e.stopPropagation()
					form.handleSubmit()
				}}
			>
				<FieldGroup>
					<form.Field name="currentPassword">
						{field => (
							<Field>
								<FieldLabel htmlFor={field.name}>{t('account.security.changePassword.currentPassword')}</FieldLabel>
								<Input
									id={field.name}
									type="password"
									autoComplete="current-password"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={e => field.handleChange(e.target.value)}
								/>
								{field.state.meta.errors[0] && <FieldError>{String(field.state.meta.errors[0]?.message ?? '')}</FieldError>}
							</Field>
						)}
					</form.Field>

					<form.Field name="newPassword">
						{field => (
							<Field>
								<FieldLabel htmlFor={field.name}>{t('account.security.changePassword.newPassword')}</FieldLabel>
								<Input
									id={field.name}
									type="password"
									autoComplete="new-password"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={e => field.handleChange(e.target.value)}
								/>
								{field.state.meta.errors[0] && <FieldError>{String(field.state.meta.errors[0]?.message ?? '')}</FieldError>}
							</Field>
						)}
					</form.Field>

					<form.Field name="confirmPassword">
						{field => (
							<Field>
								<FieldLabel htmlFor={field.name}>{t('account.security.changePassword.confirmPassword')}</FieldLabel>
								<Input
									id={field.name}
									type="password"
									autoComplete="new-password"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={e => field.handleChange(e.target.value)}
								/>
								{field.state.meta.errors[0] && <FieldError>{String(field.state.meta.errors[0]?.message ?? '')}</FieldError>}
							</Field>
						)}
					</form.Field>
				</FieldGroup>

				<DialogFooter className="mt-4">
					<Button type="button" variant="outline" onClick={hide}>
						{t('account.security.changePassword.cancel')}
					</Button>
					<form.Subscribe selector={s => [s.canSubmit, s.isSubmitting] as const}>
						{([canSubmit, isSubmitting]) => (
							<Button type="submit" disabled={!canSubmit}>
								{isSubmitting ? <Spinner className="mr-2" /> : null}
								{t('account.security.changePassword.submit')}
							</Button>
						)}
					</form.Subscribe>
				</DialogFooter>
			</form>
		</DialogContent>
	)
}
