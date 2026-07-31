import { type ComponentProps, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { keepPreviousData } from '@tanstack/react-query'
import { IconArrowRight, IconChevronRight } from '@tabler/icons-react'
import { attachThreadMutationRequestSchema, useGetAttachThreadWizard } from '@codm/client-typescript/typescript'
import type { ChannelKind } from '@codm/client-typescript/typescript'
import { useDebouncedSearch } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { enumLabel } from '@/lib'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import type { DeepPartial } from '@/lib'
import { cn } from '@/lib/utils'
import { ThreadAvatar } from '@/components/console/ThreadAvatar'
import { StepHeading } from '../StepHeading'

// The step's slice of the accumulated attach payload — derived from the SDK request schema, never
// hand-typed (FRM-P44). Selecting a contact fills the whole contactRef object at once.
export const ContactStepSchema = attachThreadMutationRequestSchema.pick({ contactRef: true })
export type ContactStepData = (typeof ContactStepSchema)['_zod']['output']

// Omit the native `onSubmit` — the FRM-P17 step contract's `onSubmit(data)` callback (not a form
// event handler) reuses the name; the component wires the real DOM handler itself.
type ContactStepProps = Omit<ComponentProps<'form'>, 'onSubmit'> & {
	channelKindById: Map<string, ChannelKind>
	defaultValues?: DeepPartial<ContactStepData>
	onSubmit: (data: ContactStepData) => void
	isSubmitting?: boolean
}

export function ContactStep({ channelKindById, defaultValues, onSubmit, isSubmitting, className, ...props }: ContactStepProps) {
	const { t } = useTranslation()
	/**
	 * THE SEARCH IS THE SERVER'S, and the step owns the query that carries it (CMP: a component owns
	 * its own data).
	 *
	 * It used to be `contacts.filter(...)` over an array handed down as a prop, which quietly capped the
	 * searchable universe at ONE PAGE — `CONTACTS_PAGE_SIZE = 30` rows ordered `lastMessageAt DESC`. A
	 * counterparty who had not written recently could not be found by typing their name, and no request
	 * was ever made. The endpoint has always taken `search` (`query.search` → `like(lower(remotes.name))`);
	 * the console simply never asked.
	 *
	 * The term still lives in local state and NOT in search params (route bp-03): it is one step of a
	 * wizard, not deep-linkable, and does not outlive the step. What changed is where it is ANSWERED.
	 *
	 * `keepPreviousData` is load-bearing, not polish: without it the query drops to `undefined` on every
	 * new term, the list unmounts mid-typing and the row you were reaching for jumps out from under the
	 * cursor. Debounced at 300ms by the shared hook, so a keystroke is not a request.
	 */
	const [term, setTerm] = useState('')
	const { inputValue, handleSearchChange } = useDebouncedSearch({ initialValue: '', onSearch: setTerm })

	const trimmed = term.trim()
	const { data, isFetching } = useGetAttachThreadWizard(
		// `undefined`, never `''`: page 1 is the whole directory, not a search for the empty string —
		// and it keeps the first load on the same query key the wizard itself already fetched.
		{ search: trimmed || undefined },
		{ query: { placeholderData: keepPreviousData } },
	)
	const contacts = data?.contacts ?? []

	const form = useForm({
		defaultValues,
		validators: { onChange: ContactStepSchema },
		onSubmit: async form => {
			const result = ContactStepSchema.safeParse(form.value)
			if (!result.success) return
			onSubmit(result.data)
		},
	})

	/**
	 * ESCOLHER É RESPONDER — o clique na linha entrega o passo, sem passar pelo botão Continuar.
	 *
	 * `contactRef` é uma escolha ÚNICA (um objeto, um só): clicar noutro contato SUBSTITUI o anterior,
	 * então não há estado intermediário entre "escolhi" e "terminei", e o Continuar cobrava um segundo
	 * clique que apenas repetia o primeiro. (O passo de agentes NÃO ganha isto — lá a seleção é uma
	 * lista e o primeiro clique não é a resposta inteira; veja o docblock do AgentsStep.)
	 *
	 * Entrega por `handleSubmit()` e não chamando `onSubmit` direto: o clique atravessa o MESMO portão
	 * de validação do botão (o `safeParse` acima), nunca um caminho paralelo mais permissivo. Contato
	 * já anexado não chega aqui — a linha é `disabled`, e o clique nela não dispara evento.
	 */
	const selectAndAdvance = (contactRef: ContactStepData['contactRef']) => {
		form.setFieldValue('contactRef', contactRef)
		void form.handleSubmit()
	}

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
			{/* Always mounted — a box that unmounts while the query refetches takes the caret with it. */}
			<Input placeholder={t('attach.searchContacts')} value={inputValue} onChange={e => handleSearchChange(e.target.value)} />

			{contacts.length === 0 && (
				<p className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
					{isFetching && <Spinner />}
					{isFetching ? t('common.loading') : trimmed ? t('attach.noContactsFound', { term: trimmed }) : t('attach.noContacts')}
				</p>
			)}

			<form.Subscribe selector={state => state.values.contactRef}>
				{selected => (
					<div className="flex flex-col gap-1">
						{contacts.map(contact => {
							const channelKind = channelKindById.get(contact.channelId)
							const isSelected = selected?.externalId === contact.externalId && selected?.channelId === contact.channelId
							return (
								<Button
									variant={'ghost'}
									size={'none'}
									key={`${contact.channelId}-${contact.externalId}`}
									type="button"
									disabled={contact.alreadyAttached}
									onClick={() =>
										selectAndAdvance({
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
									<div className="flex min-w-0 flex-1 flex-col gap-1.5">
										<span className="flex min-w-0 items-center gap-2">
											<span className="truncate font-semibold text-foreground">{contact.displayName}</span>
											{/* `shrink-0`: the name truncates, the kind never does — it is the thing being distinguished. */}
											<Badge variant="secondary" className="shrink-0">
												{enumLabel('ContactKind', contact.kind)}
											</Badge>
										</span>
										<span className="text-sm text-muted-foreground">{channelKind ? enumLabel('ChannelKind', channelKind) : ''}</span>
									</div>
									{contact.alreadyAttached ? (
										<Badge variant="outline">{t('attach.attached')}</Badge>
									) : (
										<IconChevronRight className="size-4 text-muted-foreground" />
									)}
								</Button>
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
