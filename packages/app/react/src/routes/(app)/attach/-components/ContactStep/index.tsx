import { type ComponentProps, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { keepPreviousData, useQueryClient } from '@tanstack/react-query'
import { IconCheck, IconChevronRight, IconRefresh } from '@tabler/icons-react'
import {
	attachThreadMutationRequestSchema,
	getAttachThreadWizardQueryKey,
	useGetAttachThreadWizard,
} from '@codm/client-typescript/typescript'
import type { ChannelKind } from '@codm/client-typescript/typescript'
import { useDebouncedSearch, useServerEvents } from '@/hooks'
import { Button } from '@codm/app-ui/button'
import { Input } from '@codm/app-ui/input'
import { enumLabel } from '@/lib'
import { Badge } from '@codm/app-ui/badge'
import { Spinner } from '@codm/app-ui/spinner'
import type { DeepPartial } from '@/lib'
import { cn } from '@/lib/utils'
import { rowBorder, rowHover } from '@codm/app-ui/surfaces'
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

/**
 * Bound on how long a freshly-connected channel with zero contacts still reads as "syncing" rather
 * than the definitive empty state — see the `syncSettled` docblock below. Never a poll interval:
 * this budget only picks COPY (spinner + "sincronizando…" vs "nenhuma conversa encontrada"), the
 * data path stays entirely event-driven (`useServerEvents` below). Same shape as
 * `SupervisionGate`'s `INITIAL_PULL_BUDGET_MS` — a budget can only ever bring the honest state
 * FORWARD, never withhold it: it always resolves to the real empty state, it just doesn't jump
 * there while a bootstrap sync is still plausibly writing.
 *
 * ERA 4s até 2026-08-26, e o founder mediu curto demais: logo depois de parear, o "Nenhum contato
 * encontrado neste canal." aparecia antes de a varredura de bootstrap do gateway terminar de
 * escrever — uma afirmação confiante e falsa, na primeira tela que o operador vê. Um minuto é o
 * teto que ele pediu; passado ele, o vazio vem ACOMPANHADO do botão de reconsultar (abaixo), porque
 * um minuto sem evento também pode significar que o evento se perdeu, e aí a saída é reler, não
 * esperar mais.
 */
const SYNC_GRACE_BUDGET_MS = 60_000

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
	const channelConnected = (data?.channels.length ?? 0) > 0

	/**
	 * FOUNDER BUG (contacts-sync-after-pairing): right after pairing WhatsApp and landing here, the
	 * gateway's bootstrap contact-sync pass (mapper → outbox → RemoteSnapshotProjector, see
	 * `index.services.test.tsx`) can still be writing `gateway_remotes` when this step's FIRST read
	 * already resolved with zero rows. Before this fix, nothing ever asked again — only a full
	 * remount (F5) triggered a fresh read, so "nenhuma conversa encontrada" stuck even though the
	 * data had already landed server-side.
	 *
	 * `integration.channel.remotes_synced` is the wire event for exactly this fact — its own
	 * docblock (`channel-remotes-synced.ts`) says "lets consumers invalidate the sidebar/remote
	 * list". `remote_created`/`remote_updated` ride along because a contact can also land ONE row at
	 * a time outside a bootstrap batch (e.g. a brand-new inbound chat while this step is open).
	 * Canonical guard-then-invalidate, owner-wide (no extra `ownerId` guard needed — the SSE stream
	 * is already owner-scoped server-side, same shape as `HomeDashboard`'s
	 * `channel.connected`/`disconnected` subscription).
	 */
	const queryClient = useQueryClient()
	const [syncSettled, setSyncSettled] = useState(false)
	useServerEvents(
		['integration.channel.remotes_synced', 'integration.channel.remote_created', 'integration.channel.remote_updated'],
		() => {
			setSyncSettled(true)
			queryClient.invalidateQueries({ queryKey: getAttachThreadWizardQueryKey() })
		},
	)

	// The invalidation above closes the race for good, but it cannot close the WINDOW between this
	// step's first (empty) read and the sync event that resolves it — for a channel connected
	// moments ago that gap reads as a confident "no contacts", which the operator has no reason to
	// trust is temporary. This budget is the other half: it only ever brings `syncSettled` forward
	// (never withholds it), so a channel with genuinely zero contacts still lands on the real empty
	// state — just not instantly.
	useEffect(() => {
		if (syncSettled) return
		const budget = setTimeout(() => setSyncSettled(true), SYNC_GRACE_BUDGET_MS)
		return () => clearTimeout(budget)
	}, [syncSettled])

	// Gated to "a channel IS connected and the box is unfiltered" so it never shadows the two empty
	// states this step already had: no channel at all (`noContacts` — `index.test.tsx`'s
	// `channels: []` case, unaffected since `channelConnected` is false there) and a search with
	// zero matches (`noContactsFound`, which a still-syncing channel cannot explain away).
	const stillSyncing = channelConnected && !trimmed && contacts.length === 0 && !syncSettled

	/**
	 * O vazio DEFINITIVO de um canal conectado — o único estado desta tela que merece uma saída, e o
	 * que o founder pediu junto com o minuto de espera: gastar o orçamento inteiro sem uma linha
	 * pode significar que o canal realmente não tem conversas, mas também que o evento de sync se
	 * perdeu no caminho (SSE cai, o daemon reinicia). Reler é barato e é a única coisa que o console
	 * controla — o gateway não expõe porta para forçar varredura (conferido: não há rota de sync no
	 * openapi dele), então o botão INVALIDA a leitura e reabre a janela, em vez de prometer uma
	 * re-sincronização que não temos como pedir.
	 */
	const exhaustedEmpty = channelConnected && !trimmed && contacts.length === 0 && syncSettled
	const retrySync = () => {
		setSyncSettled(false)
		queryClient.invalidateQueries({ queryKey: getAttachThreadWizardQueryKey() })
	}

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
				<div className="flex flex-col items-start gap-2 px-2 py-6">
					<p className="flex items-center gap-2 text-sm text-muted-foreground">
						{(isFetching || stillSyncing) && <Spinner />}
						{isFetching
							? t('common.loading')
							: stillSyncing
								? t('attach.syncingContacts')
								: trimmed
									? t('attach.noContactsFound', { term: trimmed })
									: t('attach.noContacts')}
					</p>
					{/* Só no vazio DEFINITIVO (ver `exhaustedEmpty`): durante a sincronização o botão
					    convidaria a reler o que já vai chegar sozinho pelo evento, e numa busca sem
					    resultado ele não muda nada — quem manda ali é o termo digitado. */}
					{exhaustedEmpty && !isFetching && (
						<Button type="button" variant={'outline'} size={'sm'} onClick={retrySync}>
							<IconRefresh className="size-4 shrink-0" />
							{t('attach.retryContacts')}
						</Button>
					)}
				</div>
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
									{/* `size="lg"` (42px) — the spec's four `Avatar` nodes are all 44×44, closer to
									    this than `ThreadAvatar`'s unstated default (`size-8`≈34px, measured via the
									    region lane, F3 batch B3). */}
									<ThreadAvatar
										name={contact.displayName}
										src={contact.hasAvatar ? contactAvatarUrl(contact.channelId, contact.externalId) : undefined}
										channelKind={channelKind}
										size="lg"
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
