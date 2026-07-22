import { Link, useNavigate } from '@tanstack/react-router'
import { auth, cn, handleApiError } from '@/lib'
import { useForm } from '@tanstack/react-form'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Checkbox } from '@/components/ui/checkbox'
import { AuthFooter } from '@/components/AuthFooter'
import { IconUser, IconMail, IconLock, IconRefresh } from '@tabler/icons-react'
import { z } from 'zod'

interface SignUpFormProps extends React.ComponentProps<'div'> {
	callback?: string
	email?: string
}

const signUpSchema = z
	.object({
		name: z.string().min(2, { message: 'INVALID_NAME' }),
		email: z.email({ message: 'INVALID_EMAIL' }),
		password: z.string().min(8, { message: 'PASSWORD_TOO_SHORT' }).max(64, { message: 'PASSWORD_TOO_LONG' }),
		confirmPassword: z.string().min(8).max(64),
		termsAndConditions: z.boolean().refine(v => v === true, { message: 'TERMS_REQUIRED' }),
	})
	.refine(d => d.password === d.confirmPassword, { message: 'PASSWORDS_DONT_MATCH', path: ['confirmPassword'] })

type SignUpFormInput = z.infer<typeof signUpSchema>

export function SignUpForm({ className, callback, email: prefilledEmail, ...props }: SignUpFormProps) {
	const { t } = useTranslation()
	const navigate = useNavigate()

	const defaultValues: SignUpFormInput = {
		name: '',
		email: prefilledEmail ?? '',
		password: '',
		confirmPassword: '',
		termsAndConditions: false,
	}

	const form = useForm({
		defaultValues,
		validators: { onChange: signUpSchema },
		onSubmit: async form => {
			const result = signUpSchema.safeParse(form.value)
			if (!result.success) return

			const safeCallback = callback?.startsWith('/') && !callback.startsWith('//') ? callback : '/dashboard'

			const { error } = await auth.signUp.email({
				name: result.data.name,
				email: result.data.email,
				password: result.data.password,
				callbackURL: safeCallback,
				fetchOptions: {
					body: {
						...result.data,
					},
				},
			})

			if (error) {
				handleApiError(error)
				return
			}

			toast.success(t('auth.signUp.registerSuccess'))
			await navigate({ to: safeCallback })
		},
	})

	return (
		<div className={cn('flex flex-col w-full', className)} {...props}>
			<div className="flex flex-col gap-2 mb-6 text-center">
				<h1 className="text-2xl font-semibold text-foreground">{t('auth.signUp.title')}</h1>
				<p className="text-sm text-muted-foreground">{t('auth.signUp.subtitle')}</p>
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
					<form.Field name="name">
						{field => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
							return (
								<Field>
									<FieldLabel htmlFor={field.name}>{t('auth.signUp.name')}</FieldLabel>
									<div className="relative">
										<IconUser className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
										<Input
											id={field.name}
											type="text"
											value={field.state.value ?? ''}
											onBlur={field.handleBlur}
											onChange={e => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
											autoComplete="name"
											className="pl-9"
										/>
									</div>
									{isInvalid && <FieldError errors={field.state.meta.errors} />}
								</Field>
							)
						}}
					</form.Field>

					<form.Field name="email">
						{field => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
							return (
								<Field>
									<FieldLabel htmlFor={field.name}>{t('auth.signUp.email')}</FieldLabel>
									<div className="relative">
										<IconMail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
										<Input
											type="email"
											id={field.name}
											value={field.state.value ?? ''}
											onBlur={field.handleBlur}
											onChange={e => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
											autoComplete="email"
											className="pl-9"
											readOnly={!!prefilledEmail}
										/>
									</div>
									{isInvalid && <FieldError errors={field.state.meta.errors} />}
								</Field>
							)
						}}
					</form.Field>

					<form.Field name="password">
						{field => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
							return (
								<Field>
									<FieldLabel htmlFor={field.name}>{t('auth.signUp.password')}</FieldLabel>
									<div className="relative">
										<IconLock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
										<Input
											type="password"
											id={field.name}
											value={field.state.value ?? ''}
											onBlur={field.handleBlur}
											onChange={e => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
											autoComplete="new-password"
											className="pl-9"
										/>
									</div>
									{isInvalid && <FieldError errors={field.state.meta.errors} />}
								</Field>
							)
						}}
					</form.Field>

					<form.Field name="confirmPassword">
						{field => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
							return (
								<Field>
									<FieldLabel htmlFor={field.name}>{t('auth.signUp.confirmPassword')}</FieldLabel>
									<div className="relative">
										<IconRefresh className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
										<Input
											type="password"
											id={field.name}
											value={field.state.value ?? ''}
											onBlur={field.handleBlur}
											onChange={e => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
											autoComplete="new-password"
											className="pl-9"
										/>
									</div>
									{isInvalid && <FieldError errors={field.state.meta.errors} />}
								</Field>
							)
						}}
					</form.Field>

					<form.Field name="termsAndConditions">
						{field => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
							return (
								<Field>
									<div className="flex items-start gap-2">
										<Checkbox
											id={field.name}
											checked={field.state.value}
											onCheckedChange={checked => field.handleChange(checked === true)}
											onBlur={field.handleBlur}
											aria-invalid={isInvalid}
										/>
										<FieldLabel
											htmlFor={field.name}
											className="text-xs text-muted-foreground/70 cursor-pointer leading-relaxed font-normal"
										>
											{t('auth.signUp.terms')}
										</FieldLabel>
									</div>
									{isInvalid && <FieldError errors={field.state.meta.errors} />}
								</Field>
							)
						}}
					</form.Field>

					<form.Subscribe selector={s => [s.canSubmit, s.isSubmitting] as const}>
						{([canSubmit, isSubmitting]) => (
							<Button type="submit" disabled={!canSubmit} className="w-full mt-2" size="lg">
								{isSubmitting && <Spinner className="mr-2" />}
								{t('auth.signUp.submit')}
							</Button>
						)}
					</form.Subscribe>
				</FieldGroup>
			</form>

			<div className="mt-6 text-center text-sm text-muted-foreground">
				{t('auth.signUp.hasAccount')}{' '}
				<Link to="/sign-in" className="text-primary hover:underline font-medium">
					{t('auth.signUp.signInLink')}
				</Link>
			</div>

			<AuthFooter />
		</div>
	)
}
