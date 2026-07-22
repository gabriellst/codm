import { type ComponentProps, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { IconArrowRight, IconChevronRight } from '@tabler/icons-react'
import { attachThreadMutationRequestSchema } from '@codedm/client-typescript/typescript'
import type { ChannelKind, GetAttachThreadWizardQueryResponse } from '@codedm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import type { DeepPartial } from '@/lib'
import { cn } from '@/lib/utils'
import { ThreadAvatar } from '@/components/console/ThreadAvatar'
import { channelLabel } from '@/components/console/glyphs'
import { StepHeading } from '../StepHeading'

type Contact = GetAttachThreadWizardQueryResponse['contacts'][number]

// The step's slice of the accumulated attach payload — derived from the SDK request schema, never
// hand-typed (FRM-P44). Selecting a contact fills the whole contactRef object at once.
export const ContactStepSchema = attachThreadMutationRequestSchema.pick({ contactRef: true })
export type ContactStepData = (typeof ContactStepSchema)['_zod']['output']

// Omit the native `onSubmit` — the FRM-P17 step contract's `onSubmit(data)` callback (not a form
// event handler) reuses the name; the component wires the real DOM handler itself.
type ContactStepProps = Omit<ComponentProps<'form'>, 'onSubmit'> & {
	contacts: Contact[]
	channelKindById: Map<string, ChannelKind>
	defaultValues?: DeepPartial<ContactStepData>
	onSubmit: (data: ContactStepData) => void
	isSubmitting?: boolean
}

export function ContactStep({ contacts, channelKindById, defaultValues, onSubmit, isSubmitting, className, ...props }: ContactStepProps) {
	const { t } = useTranslation()
	const [search, setSearch] = useState('')

	const form = useForm({
		defaultValues,
		validators: { onChange: ContactStepSchema },
		onSubmit: async form => {
			const result = ContactStepSchema.safeParse(form.value)
			if (!result.success) return
			onSubmit(result.data)
		},
	})

	const filtered = contacts.filter(c => c.displayName.toLowerCase().includes(search.trim().toLowerCase()))

	return (
		<form
			className={cn('flex flex-col gap-5', className)}
			{...props}
			onSubmit={e => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			<StepHeading title={t('attach.stepThreadTitle')} subtitle={t('attach.stepThreadSubtitle')} />
			<Input placeholder={t('attach.searchContacts')} value={search} onChange={e => setSearch(e.target.value)} />

			<form.Subscribe selector={state => state.values.contactRef}>
				{selected => (
					<div className="flex flex-col gap-1">
						{filtered.map(contact => {
							const channelKind = channelKindById.get(contact.channelId)
							const isSelected = selected?.externalId === contact.externalId && selected?.channelId === contact.channelId
							return (
								<button
									key={`${contact.channelId}-${contact.externalId}`}
									type="button"
									disabled={contact.alreadyAttached}
									onClick={() =>
										form.setFieldValue('contactRef', {
											channelId: contact.channelId,
											externalId: contact.externalId,
											displayName: contact.displayName,
											kind: contact.kind,
										})
									}
									className={cn(
										'flex items-center gap-3 rounded-2xl px-2 py-3 text-left transition-colors',
										contact.alreadyAttached ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted',
										isSelected && 'bg-muted',
									)}
								>
									<ThreadAvatar name={contact.displayName} channelKind={channelKind} />
									<div className="flex min-w-0 flex-1 flex-col">
										<span className="truncate font-semibold text-foreground">{contact.displayName}</span>
										<span className="text-sm text-muted-foreground">{channelKind ? channelLabel[channelKind] : ''}</span>
									</div>
									{contact.alreadyAttached ? (
										<Badge variant="outline">{t('attach.attached')}</Badge>
									) : (
										<IconChevronRight className="size-4 text-muted-foreground" />
									)}
								</button>
							)
						})}
					</div>
				)}
			</form.Subscribe>

			<form.Subscribe selector={state => ({ canSubmit: state.canSubmit, values: state.values })}>
				{({ canSubmit, values }) => {
					const isDisabled = isSubmitting || !canSubmit || !ContactStepSchema.safeParse(values).success
					return (
						<div className="flex justify-end">
							<Button type="submit" disabled={isDisabled}>
								{isSubmitting && <Spinner className="mr-2" />}
								{t('attach.continue')} <IconArrowRight data-icon="inline-end" />
							</Button>
						</div>
					)
				}}
			</form.Subscribe>
		</form>
	)
}
