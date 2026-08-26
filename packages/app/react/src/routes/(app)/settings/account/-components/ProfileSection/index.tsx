import type { ComponentProps } from 'react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import { getMyAccountQueryKey, useGetMyAccount } from '@codm/client-typescript/typescript'
import { initials } from '@/components/console/ThreadAvatar'
import { sectionLabelBare } from '@codm/app-ui/surfaces'
import { Field, FieldLabel } from '@codm/app-ui/field'
import { Input } from '@codm/app-ui/input'
import { Button } from '@codm/app-ui/button'
import { Skeleton } from '@codm/app-ui/skeleton'
import { cn } from '@/lib/utils'
import { AvatarUploader } from '../AvatarUploader'

// No `updateProfile`/`removeAvatar` mutation exists in the SDK yet — Save and "Remover foto" stay
// stubs (toast), the SAME sanctioned pattern `ChangePasswordDialog`/`SecuritySection.handleDeleteAccount`
// already use one folder over.
//
// `useUploadAvatar` ERA chamado aqui e deixou de ser, na integração de 2026-08-15. Duas razões, e a
// segunda sozinha já bastaria:
//
//   1. A rota mudou de lado. `/identity/account/avatar` é do contexto `auth`, que o ADR 0001
//      tornou CLOUD-ONLY — ela saiu da SDK local, e o import daqui deixou de compilar.
//   2. Ela nunca fez nada. O próprio servidor a documenta como "MOCK. Accept-and-echo", e a
//      assinatura gerada não carrega corpo de request (o kubb nunca recebeu schema multipart), então
//      o File escolhido jamais chegava nela.
//
// Ligá-la ao client de nuvem exigiria baseURL e Bearer — plumbing de verdade para uma chamada que
// não recebe o arquivo e cujo resultado é descartado. O comportamento visível é o mesmo com ou sem
// ela: o toast de disclaimer. Fica como lacuna de contrato, agora com o motivo escrito.
const profileSchema = z.object({
	name: z.string().min(1, { message: 'REQUIRED' }),
	email: z.string().min(1, { message: 'REQUIRED' }),
	company: z.string(),
})

/**
 * ProfileSection — D3 "Perfil" (jxl4Y, Minha Conta). Avatar + name/email/company, editable, with a
 * stubbed save (see note above). Owns its own `useGetMyAccount` read, independent of `SecuritySection`
 * and `CloudAccountSection` on the same route.
 */
export function ProfileSection({ className, ...props }: ComponentProps<'section'>) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isPending, isError } = useGetMyAccount()

	const form = useForm({
		defaultValues: { name: '', email: '', company: '' },
		validators: { onChange: profileSchema },
		onSubmit: async () => {
			// NOTE: stub — no update-profile SDK mutation available yet.
			toast.info(t('account.profile.stub'))
		},
	})

	// `data` arrives async; the form's `defaultValues` are seeded once the read resolves rather than
	// mirrored on every render (the fields stay editable/uncontrolled by the query afterwards).
	useEffect(() => {
		if (!data) return
		form.setFieldValue('name', data.profile.name)
		form.setFieldValue('email', data.profile.email)
		form.setFieldValue('company', data.profile.company ?? '')
	}, [data])

	async function handleUpload(_file: File) {
		// A releitura fica: quando a mutação real existir, é ela que precisa invalidar — e deixar a
		// invalidação escrita evita que a próxima pessoa a esqueça ao ligar o endpoint de verdade.
		await queryClient.invalidateQueries({ queryKey: getMyAccountQueryKey() })
		toast.info(t('account.profile.avatar.uploadStub'))
	}

	function handleRemove() {
		toast.info(t('account.profile.avatar.removeStub'))
	}

	if (isPending) {
		return (
			<section className={cn('flex flex-col gap-3', className)} {...props}>
				<h2 className={sectionLabelBare}>{t('account.profile.sectionTitle')}</h2>
				<Skeleton className="h-16 w-16 rounded-full" />
				<div className="flex gap-3.5">
					<Skeleton className="h-16 flex-1 rounded-asymmetric-sm" />
					<Skeleton className="h-16 flex-1 rounded-asymmetric-sm" />
					<Skeleton className="h-16 flex-1 rounded-asymmetric-sm" />
				</div>
			</section>
		)
	}

	if (isError || !data) {
		return (
			<section className={cn('flex flex-col gap-3', className)} {...props}>
				<h2 className={sectionLabelBare}>{t('account.profile.sectionTitle')}</h2>
				<p className="text-sm text-muted-foreground">{t('account.profile.loadError')}</p>
			</section>
		)
	}

	return (
		<section className={cn('flex flex-col gap-4', className)} {...props}>
			<h2 className={sectionLabelBare}>{t('account.profile.sectionTitle')}</h2>

			<AvatarUploader
				value={data.profile.pictureUrl}
				onUpload={handleUpload}
				onRemove={handleRemove}
				fallbackInitials={initials(data.profile.name)}
			/>

			<form
				noValidate
				onSubmit={e => {
					e.preventDefault()
					e.stopPropagation()
					form.handleSubmit()
				}}
				className="flex flex-col gap-4"
			>
				<div className="flex flex-col gap-3.5 sm:flex-row">
					<form.Field name="name">
						{field => (
							<Field className="flex-1">
								<FieldLabel htmlFor={field.name}>{t('account.profile.name')}</FieldLabel>
								<Input
									id={field.name}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={e => field.handleChange(e.target.value)}
								/>
							</Field>
						)}
					</form.Field>
					<form.Field name="email">
						{field => (
							<Field className="flex-1">
								<FieldLabel htmlFor={field.name}>{t('account.profile.email')}</FieldLabel>
								<Input
									id={field.name}
									type="email"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={e => field.handleChange(e.target.value)}
								/>
							</Field>
						)}
					</form.Field>
					<form.Field name="company">
						{field => (
							<Field className="flex-1">
								<FieldLabel htmlFor={field.name}>{t('account.profile.company')}</FieldLabel>
								<Input
									id={field.name}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={e => field.handleChange(e.target.value)}
								/>
							</Field>
						)}
					</form.Field>
				</div>

				<div className="flex justify-end">
					<form.Subscribe selector={s => s.canSubmit}>
						{canSubmit => (
							<Button type="submit" size="sm" disabled={!canSubmit}>
								{t('account.profile.save')}
							</Button>
						)}
					</form.Subscribe>
				</div>
			</form>
		</section>
	)
}
