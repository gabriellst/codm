import { type ComponentProps, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { keepPreviousData } from '@tanstack/react-query'
import { IconCheck, IconChevronRight } from '@tabler/icons-react'
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
import { rowBorder, rowHover } from '@/components/ui/surfaces'
import { ThreadAvatar, contactAvatarUrl } from '@/components/console/ThreadAvatar'
import { StepHeading } from '../StepHeading'

// The step's slice of the accumulated attach payload — derived from the SDK request schema, never
// hand-typed (FRM-P44). Selecting a contact fills the whole contactRef object at once.
export const ContactStepSchema = attachThreadMutationRequestSchema.pick({ contactRef: true })
export type ContactStepData = (typeof ContactStepSchema)['_zod']['output']

// Omit the native `onSubmit` — the FRM-P17 step contract's `onSubmit(data)` callback (not a form
// event handler) reuses the name; the component wires the real DOM handler itself.
// No `onBack`: contact is the FIRST step by construction (`STEPS[0]`), so a back affordance here would
// model a state that cannot exist. Its absence is exactly what `StepHeading` reads as "no way back".
type ContactStepProps = Omit<ComponentProps<'form'>, 'onSubmit'> & {
	channelKindById: Map<string, ChannelKind>
	defaultValues?: DeepPartial<ContactStepData>
	onSubmit: (data: ContactStepData) => void
}

export function ContactStep({ channelKindById, defaultValues, onSubmit, className, ...props }: ContactStepProps) {
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
	 * O CLIQUE GRAVA A ESCOLHA — NÃO AVANÇA MAIS O PASSO (D3, founder review 12/08). A versão anterior
	 * deste docblock ("escolher é responder") tinha o clique chamando `advance()` no mesmo gesto; o
	 * founder testou essa versão no desktop e revogou: o rodapé do wizard (`AttachThreadWizard`) volta a
	 * existir, persistente, com Voltar/Continuar — e é ELE quem decide quando o passo muda. O que este
	 * clique ainda faz sozinho é gravar: `contactRef` é uma escolha ÚNICA (um objeto, um só), então
	 * clicar noutro contato SUBSTITUI o anterior sem estado intermediário — mas "substituir" não é mais
	 * "terminar". `onSubmit` só entrega a seleção ao pai, que grava em `useAttachWizardStore` e habilita
	 * o Continuar do footer.
	 *
	 * Entrega por `handleSubmit()` e não chamando `onSubmit` direto: o clique atravessa o portão de
	 * validação do form (o `safeParse` acima), nunca um caminho paralelo mais permissivo. Contato já
	 * anexado não chega aqui — a linha é `disabled`, e o clique nela não dispara evento.
	 */
	const selectContact = (contactRef: ContactStepData['contactRef']) => {
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
					// D3 (screen PENI6) — a FIXED-HEIGHT scroll box (328px), not a list that grows the page.
					// The founder asked for explicit scroll here: a long contact list must never push the
					// footer (Voltar/Continuar) further down the window.
					<div className="flex max-h-[328px] flex-col gap-2 overflow-y-auto">
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
										selectContact({
											channelId: contact.channelId,
											externalId: contact.externalId,
											displayName: contact.displayName,
											kind: contact.kind,
										})
									}
									// A LINHA DO ASSISTENTE É UMA CONTENT ROW, igual à de canal, workspace e tarefa —
									// compõe do preset `row` (`components/ui/surfaces`) com a escada
									// `rounded-asymmetric-*`, nunca um raio simétrico literal + `hover:bg-muted`, que
									// era o que a deixava fora do padrão do resto do console. D3 mede a linha em
									// 18/18/18/6 = `asymmetric-md` (não `-lg`, que era 20/20/20/7).
									//
									// `rowBorder` + `rowHover` em vez do composto `row` porque a linha JÁ ANEXADA não
									// pode reagir ao mouse: ela mantém a borda de repouso e não ganha o par
									// fundo+borda do hover, que prometeria um clique que o `disabled` recusa.
									className={cn(
										'group flex shrink-0 items-center gap-3 rounded-asymmetric-md bg-background p-3.5 text-left transition-colors',
										rowBorder,
										contact.alreadyAttached ? 'cursor-not-allowed opacity-50' : rowHover,
										// ESCOLHIDO = o pastel do hover, fixo, + a borda de marca — o mesmo par nos três
										// passos. Não o `--secondary` que os tokens chamam de selected-active: o avatar de
										// iniciais desta linha JÁ é `bg-secondary`, e um fundo igual o apagaria contra a
										// própria linha. Ver o docblock do `AgentsStep`, onde a escolha está por extenso.
										isSelected && 'border-primary bg-hover-accent',
									)}
								>
									<ThreadAvatar
										name={contact.displayName}
										src={contact.hasAvatar ? contactAvatarUrl(contact.channelId, contact.externalId) : undefined}
										channelKind={channelKind}
									/>
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
									) : isSelected ? (
										// D3 (screen PENI6) — a filled check badge marks the row that reopens
										// pre-selected (voltar a este passo depois de escolher em outro), replacing
										// the chevron for exactly that one row.
										<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
											<IconCheck className="size-3.5" />
										</span>
									) : (
										// GROUP CONVENTION (surfaces): o descendente ecoa o hover da linha via
										// `group-hover:`, nunca com um `hover:` próprio — a linha toda se move junta.
										<IconChevronRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
									)}
								</Button>
							)
						})}
					</div>
				)}
			</form.Subscribe>
		</form>
	)
}
