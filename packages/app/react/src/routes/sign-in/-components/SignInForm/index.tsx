import { auth, cn, handleApiError } from '@/lib'
import { useForm } from '@tanstack/react-form'
import { Link, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { AuthFooter } from '@/components/AuthFooter'
import { IconMail, IconLock } from '@tabler/icons-react'
import type { ComponentProps } from 'react'

const signInSchema = z.object({
	email: z.email({ message: 'INVALID_EMAIL' }),
	password: z.string().min(8, { message: 'PASSWORD_TOO_SHORT' }),
})

interface SignInFormProps extends ComponentProps<'div'> {
	callback?: string
	email?: string
}

export function SignInForm({ className, callback, email, ...props }: SignInFormProps) {
	const { t } = useTranslation()
	const navigate = useNavigate()

	const form = useForm({
		defaultValues: { email: email ?? '', password: '' },
		validators: { onChange: signInSchema },
		onSubmit: async form => {
			const result = signInSchema.safeParse(form.value)
			if (!result.success) return

			const { error } = await auth.signIn.email({
				email: result.data.email,
				password: result.data.password,
			})

			if (error) {
				handleApiError(error)
				return
			}

			toast.success(t('auth.signIn.loginSuccess'))

			const redirectTo = callback?.startsWith('/') && !callback.startsWith('//') ? callback : '/dashboard'
			await navigate({ to: redirectTo })
		},
	})

	return (
		<div className={cn('flex flex-col w-full', className)} {...props}>
			<div className="flex flex-col gap-2 mb-8 text-center">
				<h1 className="text-3xl font-semibold text-foreground">{t('auth.signIn.title')}</h1>
				<p className="text-sm text-muted-foreground">{t('auth.signIn.subtitle')}</p>
			</div>

			<form
				className="w-full"
				noValidate
				onSubmit={e => {
					e.preventDefault()
					e.stopPropagation()
					form.handleSubmit()
				}}
			>
				<FieldGroup>
					<form.Field name="email">
						{field => (
							<Field>
								<FieldLabel htmlFor={field.name}>{t('auth.signIn.email')}</FieldLabel>
								<div className="relative">
									<IconMail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
									<Input
										id={field.name}
										type="email"
										autoComplete="email"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={e => field.handleChange(e.target.value)}
										className="pl-9"
									/>
								</div>
								{field.state.meta.errors[0] && <FieldError>{String(field.state.meta.errors[0]?.message ?? '')}</FieldError>}
							</Field>
						)}
					</form.Field>

					<form.Field name="password">
						{field => (
							<Field>
								<FieldLabel htmlFor={field.name}>{t('auth.signIn.password')}</FieldLabel>
								<div className="relative">
									<IconLock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
									<Input
										id={field.name}
										type="password"
										autoComplete="current-password"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={e => field.handleChange(e.target.value)}
										className="pl-9"
									/>
								</div>
								{field.state.meta.errors[0] && <FieldError>{String(field.state.meta.errors[0]?.message ?? '')}</FieldError>}
							</Field>
						)}
					</form.Field>

					<form.Subscribe selector={s => [s.canSubmit, s.isSubmitting] as const}>
						{([canSubmit, isSubmitting]) => (
							<Button type="submit" disabled={!canSubmit} className="w-full mt-2">
								{isSubmitting ? <Spinner /> : t('auth.signIn.submit')}
							</Button>
						)}
					</form.Subscribe>
				</FieldGroup>
			</form>

			<div className="flex flex-col items-center gap-2 mt-6 text-sm text-muted-foreground">
				<Link to="/reset-password" className="hover:text-foreground">
					{t('auth.signIn.forgot')}
				</Link>
				<p>
					{t('auth.signIn.noAccount')}{' '}
					<Link to="/sign-up" className="text-primary font-medium hover:underline">
						{t('auth.signIn.signUpLink')}
					</Link>
				</p>
			</div>

			<AuthFooter className="mt-8" />
		</div>
	)
}
