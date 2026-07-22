import { cn, handleApiError, auth } from '@/lib'
import { useForm } from '@tanstack/react-form'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { AuthFooter } from '@/components/AuthFooter'
import { IconMail } from '@tabler/icons-react'
import { z } from 'zod'
import type { ComponentProps } from 'react'

const requestSchema = z.object({
	email: z.email({ message: 'INVALID_EMAIL' }),
})

export function RequestPasswordResetForm({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()

	const form = useForm({
		defaultValues: { email: '' },
		validators: { onChange: requestSchema },
		onSubmit: async form => {
			const result = requestSchema.safeParse(form.value)
			if (!result.success) return

			const { error } = await auth.requestPasswordReset({
				email: result.data.email,
				redirectTo: `${window.location.origin}/reset-password`,
			})

			if (error) {
				handleApiError(error)
				return
			}

			toast.success(t('auth.resetPassword.requestSuccess'), {
				description: t('auth.resetPassword.requestSuccessDescription'),
			})
		},
	})

	return (
		<div className={cn('flex flex-col w-full', className)} {...props}>
			<div className="flex flex-col gap-2 mb-8 text-center">
				<h1 className="text-3xl font-semibold text-foreground">{t('auth.resetPassword.requestTitle')}</h1>
				<p className="text-sm text-muted-foreground">{t('auth.resetPassword.requestSubtitle')}</p>
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
					<form.Field name="email">
						{field => (
							<Field>
								<FieldLabel htmlFor={field.name}>{t('auth.resetPassword.email')}</FieldLabel>
								<div className="relative">
									<IconMail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
									<Input
										id={field.name}
										type="email"
										value={field.state.value ?? ''}
										onBlur={field.handleBlur}
										onChange={e => field.handleChange(e.target.value)}
										autoComplete="email"
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
								{t('auth.resetPassword.requestSubmit')}
							</Button>
						)}
					</form.Subscribe>
				</FieldGroup>
			</form>

			<div className="mt-6 text-center text-sm text-muted-foreground">
				{t('auth.resetPassword.rememberPassword')}{' '}
				<Link to="/sign-in" className="text-primary hover:underline font-medium">
					{t('auth.signIn.submit')}
				</Link>
			</div>

			<AuthFooter />
		</div>
	)
}
