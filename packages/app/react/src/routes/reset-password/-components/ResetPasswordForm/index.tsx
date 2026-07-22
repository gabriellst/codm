import { cn, handleApiError, auth } from '@/lib'
import { useForm } from '@tanstack/react-form'
import { Link, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { AuthFooter } from '@/components/AuthFooter'
import { IconLock } from '@tabler/icons-react'
import { z } from 'zod'
import type { ComponentProps } from 'react'

const resetSchema = z
	.object({
		newPassword: z.string().min(8, { message: 'PASSWORD_TOO_SHORT' }).max(64),
		confirmNewPassword: z.string().min(8).max(64),
	})
	.refine(d => d.newPassword === d.confirmNewPassword, { message: 'PASSWORDS_DONT_MATCH', path: ['confirmNewPassword'] })

interface ResetPasswordFormProps extends ComponentProps<'div'> {
	token: string
}

export function ResetPasswordForm({ className, token, ...props }: ResetPasswordFormProps) {
	const { t } = useTranslation()
	const navigate = useNavigate()

	const form = useForm({
		defaultValues: { newPassword: '', confirmNewPassword: '' },
		validators: { onChange: resetSchema },
		onSubmit: async form => {
			const result = resetSchema.safeParse(form.value)
			if (!result.success) return

			const { error } = await auth.resetPassword({ token, newPassword: result.data.newPassword })

			if (error) {
				handleApiError(error)
				return
			}

			toast.success(t('auth.resetPassword.resetSuccess'), {
				description: t('auth.resetPassword.resetSuccessDescription'),
			})
			navigate({ to: '/sign-in' })
		},
	})

	return (
		<div className={cn('flex flex-col w-full', className)} {...props}>
			<div className="flex flex-col gap-2 mb-8 text-center">
				<h1 className="text-3xl font-semibold text-foreground">{t('auth.resetPassword.resetTitle')}</h1>
				<p className="text-sm text-muted-foreground">{t('auth.resetPassword.resetSubtitle')}</p>
			</div>

			<form
				className="w-full"
				noValidate
				onSubmit={e => {
					e.preventDefault()
					form.handleSubmit()
				}}
			>
				<FieldGroup>
					<form.Field name="newPassword">
						{field => (
							<Field>
								<FieldLabel htmlFor={field.name}>{t('auth.resetPassword.newPassword')}</FieldLabel>
								<div className="relative">
									<IconLock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
									<Input
										id={field.name}
										type="password"
										value={field.state.value ?? ''}
										onBlur={field.handleBlur}
										onChange={e => field.handleChange(e.target.value)}
										autoComplete="new-password"
										className="pl-9"
									/>
								</div>
								{field.state.meta.errors[0] && <FieldError>{String(field.state.meta.errors[0]?.message ?? '')}</FieldError>}
							</Field>
						)}
					</form.Field>

					<form.Field name="confirmNewPassword">
						{field => (
							<Field>
								<FieldLabel htmlFor={field.name}>{t('auth.resetPassword.confirmNewPassword')}</FieldLabel>
								<div className="relative">
									<IconLock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
									<Input
										id={field.name}
										type="password"
										value={field.state.value ?? ''}
										onBlur={field.handleBlur}
										onChange={e => field.handleChange(e.target.value)}
										autoComplete="new-password"
										className="pl-9"
									/>
								</div>
								{field.state.meta.errors[0] && <FieldError>{String(field.state.meta.errors[0]?.message ?? '')}</FieldError>}
							</Field>
						)}
					</form.Field>

					<form.Subscribe selector={s => [s.canSubmit, s.isSubmitting] as const}>
						{([canSubmit, isSubmitting]) => (
							<Button disabled={!canSubmit} type="submit" className="w-full mt-2" size="lg">
								{isSubmitting && <Spinner className="mr-2" />}
								{t('auth.resetPassword.resetSubmit')}
							</Button>
						)}
					</form.Subscribe>
				</FieldGroup>
			</form>

			<div className="mt-6 text-center text-sm text-muted-foreground">
				<Link to="/sign-in" className="text-primary hover:underline font-medium">
					{t('auth.resetPassword.backToSignIn')}
				</Link>
			</div>

			<AuthFooter />
		</div>
	)
}
