import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconMessageCircle } from '@tabler/icons-react'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import {
	getPanelIdentityQueryKey,
	getPanelIssueQueryKey,
	requestPanelCodeMutationRequestSchema,
	useListPanelMembers,
	useRequestPanelCode,
	useVerifyPanelCode,
	verifyPanelCodeMutationRequestSchema,
	type ListPanelMembersQueryResponse,
} from '@codm/client-typescript/typescript-cloud'
import { Button } from '@codm/app-ui/button'
import { Input } from '@codm/app-ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@codm/app-ui/select'
import { SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@codm/app-ui/sheet'
import { Skeleton } from '@codm/app-ui/skeleton'
import { cn } from '@/lib/utils'
import { useDialogStore } from '@/stores/useDialogStore'
import { Initials } from './PanelHeader'
import { errorCodeOf, useErrorText } from './panelErrors'
import { usePanelToken } from './panelToken'

type Member = ListPanelMembersQueryResponse['members'][number]

const memberIdSchema = requestPanelCodeMutationRequestSchema.shape.memberId
const codeSchema = verifyPanelCodeMutationRequestSchema.shape.code

/**
 * "IDENTIFICAR-ME" (N4, fase 2 item 6a) — the sheet that tells this device who is holding it. Two steps:
 * pick your name (`/members`) and ask for a code on your WhatsApp (`/identify`), then type the 6 digits
 * (`/verify`). The step IS the server's answer — the code request succeeded or not — so there is no step state;
 * "Escolher outro nome" forgets that answer. Once verified, the identity and the open task are re-read.
 */
export function IdentifyDialog({ className, ...props }: ComponentProps<typeof SheetContent>) {
	const { t } = useTranslation()
	const token = usePanelToken()
	const { data, isError, error } = useListPanelMembers(token)
	const errorText = useErrorText()
	const requestCode = useRequestPanelCode()
	const picked = requestCode.isSuccess ? data?.members.find(member => member.memberId === requestCode.variables?.data?.memberId) : undefined

	return (
		<SheetContent
			side="bottom"
			data-testid="panel-identify"
			className={cn('mx-auto w-full max-w-lg gap-5 rounded-t-3xl p-6 pb-8', className)}
			{...props}
		>
			<SheetHeader className="gap-2 p-0">
				<SheetTitle className="text-2xl font-bold tracking-tight">{t('panel.identify.title')}</SheetTitle>
				<SheetDescription>{t('panel.identify.description')}</SheetDescription>
			</SheetHeader>
			{isError ? (
				<p role="alert" className="text-sm text-attention-foreground">
					{errorText(errorCodeOf(error))}
				</p>
			) : !data ? (
				<Skeleton className="h-24 rounded-asymmetric-sm" />
			) : data.members.length === 0 ? (
				<p className="text-sm text-muted-foreground">{t('panel.identify.noMembers')}</p>
			) : picked ? (
				<CodeStep member={picked} onOtherName={() => requestCode.reset()} />
			) : (
				<PickStep
					members={data.members}
					pending={requestCode.isPending}
					error={requestCode.isError ? errorText(errorCodeOf(requestCode.error)) : undefined}
					onPick={memberId => requestCode.mutate({ token, data: { memberId } })}
				/>
			)}
		</SheetContent>
	)
}

/** Step 1 — who you are in this group; the first name is preselected (as the old page did). */
function PickStep({
	members,
	pending,
	error,
	onPick,
	className,
	...props
}: Omit<ComponentProps<'form'>, 'onSubmit'> & {
	members: readonly Member[]
	pending: boolean
	error: string | undefined
	onPick: (memberId: string) => void
}) {
	const { t } = useTranslation()
	const form = useForm({
		defaultValues: { memberId: members[0]?.memberId ?? '' },
		onSubmit: ({ value }) => onPick(value.memberId),
	})
	return (
		<form
			noValidate
			className={cn('flex flex-col gap-4', className)}
			{...props}
			onSubmit={event => {
				event.preventDefault()
				event.stopPropagation()
				form.handleSubmit()
			}}
		>
			<form.Field name="memberId" validators={{ onChange: memberIdSchema }}>
				{field => {
					const current = members.find(member => member.memberId === field.state.value)
					return (
						<div className="flex flex-col gap-2">
							<label id="panel-identify-who" className="text-sm font-bold text-foreground">
								{t('panel.identify.who')}
							</label>
							<Select value={field.state.value} onValueChange={value => field.handleChange(String(value ?? ''))}>
								<SelectTrigger aria-labelledby="panel-identify-who" className="h-12 w-full">
									<SelectValue>
										{current && (
											<span className="flex items-center gap-2.5">
												<Initials name={current.name} className="size-7 text-[10px]" />
												{current.name}
											</span>
										)}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{members.map(member => (
										<SelectItem key={member.memberId} value={member.memberId}>
											{member.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)
				}}
			</form.Field>
			{error && (
				<p role="alert" className="text-sm text-attention-foreground">
					{error}
				</p>
			)}
			<Button type="submit" size="lg" className="w-full" disabled={pending}>
				{t('panel.identify.send')}
			</Button>
		</form>
	)
}

/** Step 2 — the 6 digits the codm sent to that person's WhatsApp. */
function CodeStep({
	member,
	onOtherName,
	className,
	...props
}: Omit<ComponentProps<'form'>, 'onSubmit'> & { member: Member; onOtherName: () => void }) {
	const { t } = useTranslation()
	const token = usePanelToken()
	const queryClient = useQueryClient()
	const hide = useDialogStore(state => state.hide)
	const errorText = useErrorText()
	// On the MUTATION (bp-30): who this device is changed, so what it may do on the open task changes too.
	const verify = useVerifyPanelCode({
		mutation: {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: getPanelIdentityQueryKey(token) })
				queryClient.invalidateQueries({ queryKey: [{ url: getPanelIssueQueryKey(token, undefined)[0].url }] })
				hide()
			},
		},
	})
	const form = useForm({
		defaultValues: { code: '' },
		onSubmit: ({ value }) => verify.mutate({ token, data: { memberId: member.memberId, code: value.code } }),
	})
	return (
		<form
			noValidate
			className={cn('flex flex-col gap-4', className)}
			{...props}
			onSubmit={event => {
				event.preventDefault()
				event.stopPropagation()
				form.handleSubmit()
			}}
		>
			<p className="flex items-start gap-2.5 rounded-asymmetric-sm bg-primary/12 px-4 py-3 text-sm font-semibold text-primary">
				<IconMessageCircle className="mt-0.5 size-4 shrink-0" />
				{t('panel.identify.sent', { name: member.name })}
			</p>
			<form.Field name="code" validators={{ onChange: codeSchema }}>
				{field => (
					<div className="flex flex-col gap-2">
						<Input
							id={field.name}
							value={field.state.value}
							onBlur={field.handleBlur}
							// Only digits, at most six — what a person pastes from WhatsApp often carries spaces.
							onChange={event => field.handleChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
							inputMode="numeric"
							autoComplete="one-time-code"
							autoFocus
							aria-label={t('panel.identify.code')}
							placeholder={t('panel.identify.code')}
							className="h-14 text-center font-mono text-2xl tracking-[0.5em]"
						/>
						<p className="text-xs text-muted-foreground">{t('panel.identify.codeHint')}</p>
					</div>
				)}
			</form.Field>
			{verify.isError && (
				<p role="alert" className="text-sm text-attention-foreground">
					{errorText(errorCodeOf(verify.error))}
				</p>
			)}
			<form.Subscribe selector={state => codeSchema.safeParse(state.values.code).success}>
				{valid => (
					<Button type="submit" size="lg" className="w-full" disabled={!valid || verify.isPending}>
						{t('panel.identify.confirm')}
					</Button>
				)}
			</form.Subscribe>
			<Button type="button" variant="ghost" className="w-full" onClick={onOtherName}>
				{t('panel.identify.otherName')}
			</Button>
		</form>
	)
}
