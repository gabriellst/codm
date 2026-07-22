import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconCheck, IconChevronRight, IconX } from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'
import { useGetAttachThreadWizard, useAttachThread } from '@codedm/client-typescript/typescript'
import type { ChannelKind, GetAttachThreadWizardQueryResponse, ProviderKind } from '@codedm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/console/Logo'
import { ThreadAvatar } from '@/components/console/ThreadAvatar'
import { channelLabel, providerGlyph, providerLabel } from '@/components/console/glyphs'

type Wizard = GetAttachThreadWizardQueryResponse
type Contact = Wizard['contacts'][number]

const STEP_LABELS = ['Contact', 'Workspace', 'Agents', 'Review']
const WORKSPACE_BADGE: Record<'GIT' | 'CLAUDE_PROJECT', string> = { GIT: 'git', CLAUDE_PROJECT: 'Claude project' }

/** Guided attach flow (T15): contact → workspace → agents → review, on a chrome-less fullscreen. */
export function AttachThreadWizard() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { data, isLoading } = useGetAttachThreadWizard()
	const attach = useAttachThread()

	const [step, setStep] = useState(0)
	const [search, setSearch] = useState('')
	const [contact, setContact] = useState<Contact | null>(null)
	const [workspaceId, setWorkspaceId] = useState<string | null>(null)
	const [providers, setProviders] = useState<ProviderKind[]>([])

	const channelKindById = useMemo(() => new Map<string, ChannelKind>((data?.channels ?? []).map(c => [c.channelId, c.kind])), [data])

	const close = () => navigate({ to: '/dashboard' })

	const filteredContacts = (data?.contacts ?? []).filter(c => c.displayName.toLowerCase().includes(search.trim().toLowerCase()))

	const canContinue = step === 0 ? !!contact : step === 1 ? !!workspaceId : step === 2 ? providers.length > 0 : true

	const submit = () => {
		if (!contact || !workspaceId || providers.length === 0) return
		attach.mutate(
			{
				data: {
					contactRef: {
						channelId: contact.channelId,
						externalId: contact.externalId,
						displayName: contact.displayName,
						kind: contact.kind,
					},
					workspaceId,
					providers,
				},
			},
			{ onSuccess: res => navigate({ to: '/threads/$threadId', params: { threadId: res.threadId } }) },
		)
	}

	return (
		<div className="flex min-h-dvh flex-col bg-route-background text-foreground">
			<header className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-6 py-5 md:px-10">
				<Logo className="text-base" />
				<nav className="flex items-center justify-center gap-6">
					{STEP_LABELS.map((label, i) => (
						<button
							key={label}
							type="button"
							disabled={i > step}
							onClick={() => i <= step && setStep(i)}
							className={cn(
								'border-b-2 pb-1 text-sm font-medium transition-colors',
								i === step ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground',
								i > step && 'cursor-not-allowed opacity-50',
							)}
						>
							{label}
						</button>
					))}
				</nav>
				<Button variant="secondary" size="icon" aria-label={t('attach.close')} className="rounded-full" onClick={close}>
					<IconX />
				</Button>
			</header>

			<main className="flex flex-1 justify-center px-6 pb-24">
				<div className="w-full max-w-xl pt-6">
					{isLoading || !data ? (
						<div className="flex flex-col gap-4">
							<Skeleton className="mx-auto h-10 w-64" />
							<Skeleton className="h-12 rounded-full" />
							<Skeleton className="h-16 rounded-2xl" />
						</div>
					) : data.noChannelConnected ? (
						<Empty className="pt-16">
							<EmptyTitle>{t('attach.needChannelTitle')}</EmptyTitle>
							<EmptyDescription>{t('attach.needChannelDescription')}</EmptyDescription>
							<Button className="mt-2" onClick={() => navigate({ to: '/channels' })}>
								{t('attach.goToChannels')}
							</Button>
						</Empty>
					) : (
						<>
							{step === 0 && (
								<ContactStep
									contacts={filteredContacts}
									channelKindById={channelKindById}
									search={search}
									onSearch={setSearch}
									selected={contact}
									onSelect={c => {
										setContact(c)
										setStep(1)
									}}
								/>
							)}
							{step === 1 && (
								<WorkspaceStep
									workspaces={data.workspaces}
									selected={workspaceId}
									onSelect={id => {
										setWorkspaceId(id)
										setStep(2)
									}}
								/>
							)}
							{step === 2 && (
								<AgentsStep
									providers={data.providers}
									selected={providers}
									onToggle={p => setProviders(prev => (prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]))}
								/>
							)}
							{step === 3 && contact && (
								<ReviewStep
									contact={contact}
									channelKind={channelKindById.get(contact.channelId)}
									workspacePath={data.workspaces.find(w => w.workspaceId === workspaceId)?.path ?? ''}
									providers={providers}
								/>
							)}
						</>
					)}
				</div>
			</main>

			{data && !data.noChannelConnected && (
				<footer className="fixed inset-x-0 bottom-0 flex justify-center border-t border-border bg-card px-6 py-4">
					<div className="flex w-full max-w-xl items-center justify-between">
						<Button variant="ghost" disabled={step === 0} onClick={() => setStep(s => Math.max(0, s - 1))}>
							{t('attach.back')}
						</Button>
						{step < 3 ? (
							<Button disabled={!canContinue} onClick={() => setStep(s => s + 1)}>
								{t('attach.continue')} <IconChevronRight data-icon="inline-end" />
							</Button>
						) : (
							<Button disabled={!canContinue || attach.isPending} onClick={submit}>
								{String(attach.isPending ? 'Attaching…' : 'Attach thread')}
							</Button>
						)}
					</div>
				</footer>
			)}
		</div>
	)
}

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
	return (
		<div className="flex flex-col items-center gap-2 pb-6 text-center">
			<h1 className="heading-display text-3xl text-foreground md:text-4xl">{title}</h1>
			<p className="text-muted-foreground">{subtitle}</p>
		</div>
	)
}

function ContactStep({
	contacts,
	channelKindById,
	search,
	onSearch,
	selected,
	onSelect,
}: {
	contacts: Contact[]
	channelKindById: Map<string, ChannelKind>
	search: string
	onSearch: (v: string) => void
	selected: Contact | null
	onSelect: (c: Contact) => void
}) {
	const { t } = useTranslation()
	return (
		<div className="flex flex-col gap-5">
			<StepHeading title={t('attach.stepThreadTitle')} subtitle={t('attach.stepThreadSubtitle')} />
			<Input placeholder={t('attach.searchContacts')} value={search} onChange={e => onSearch(e.target.value)} />
			<div className="flex flex-col gap-1">
				{contacts.map(contact => {
					const channelKind = channelKindById.get(contact.channelId)
					const isSelected = selected?.externalId === contact.externalId && selected?.channelId === contact.channelId
					return (
						<button
							key={`${contact.channelId}-${contact.externalId}`}
							type="button"
							disabled={contact.alreadyAttached}
							onClick={() => onSelect(contact)}
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
		</div>
	)
}

function WorkspaceStep({
	workspaces,
	selected,
	onSelect,
}: {
	workspaces: Wizard['workspaces']
	selected: string | null
	onSelect: (id: string) => void
}) {
	const { t } = useTranslation()
	return (
		<div className="flex flex-col gap-5">
			<StepHeading title={t('attach.stepWorkspaceTitle')} subtitle={t('attach.stepWorkspaceSubtitle')} />
			<div className="flex flex-col gap-1">
				{workspaces.map(workspace => (
					<button
						key={workspace.workspaceId}
						type="button"
						onClick={() => onSelect(workspace.workspaceId)}
						className={cn(
							'flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-muted',
							selected === workspace.workspaceId && 'bg-muted',
						)}
					>
						<div className="flex min-w-0 flex-1 flex-col gap-1.5">
							<span className="truncate font-mono text-sm font-semibold text-foreground">{workspace.path}</span>
							<div className="flex flex-wrap gap-1.5">
								{workspace.badges.map(badge => (
									<Badge key={badge} variant="outline">
										{WORKSPACE_BADGE[badge]}
									</Badge>
								))}
							</div>
						</div>
						<IconChevronRight className="size-4 text-muted-foreground" />
					</button>
				))}
			</div>
		</div>
	)
}

function AgentsStep({
	providers,
	selected,
	onToggle,
}: {
	providers: Wizard['providers']
	selected: ProviderKind[]
	onToggle: (p: ProviderKind) => void
}) {
	const { t } = useTranslation()
	return (
		<div className="flex flex-col gap-5">
			<StepHeading title={t('attach.stepAgentsTitle')} subtitle={t('attach.stepAgentsSubtitle')} />
			<div className="flex flex-col gap-2">
				{providers.map(provider => {
					const Glyph = providerGlyph[provider.provider]
					const available = provider.available
					const isSelected = selected.includes(provider.provider)
					return (
						<button
							key={provider.provider}
							type="button"
							disabled={!available}
							onClick={() => onToggle(provider.provider)}
							className={cn(
								'flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors',
								available ? 'hover:bg-muted' : 'cursor-not-allowed opacity-50',
								isSelected ? 'border-foreground bg-muted' : 'border-border',
							)}
						>
							<span className="flex size-10 items-center justify-center rounded-full bg-secondary text-foreground">
								<Glyph className="size-5" />
							</span>
							<div className="flex flex-1 flex-col">
								<span className="font-semibold text-foreground">{providerLabel[provider.provider]}</span>
								<span className="text-sm text-muted-foreground">{String(available ? 'Detected' : 'Not installed')}</span>
							</div>
							<span
								className={cn(
									'flex size-6 items-center justify-center rounded-full border',
									isSelected ? 'border-transparent bg-primary text-primary-foreground' : 'border-border',
								)}
							>
								{isSelected && <IconCheck className="size-3.5" />}
							</span>
						</button>
					)
				})}
			</div>
		</div>
	)
}

function ReviewStep({
	contact,
	channelKind,
	workspacePath,
	providers,
}: {
	contact: Contact
	channelKind?: ChannelKind
	workspacePath: string
	providers: ProviderKind[]
}) {
	const { t } = useTranslation()
	const rows = [
		{ label: t('attach.rowContact'), value: `${contact.displayName}${channelKind ? ` · ${channelLabel[channelKind]}` : ''}` },
		{ label: t('attach.rowWorkspace'), value: workspacePath, mono: true },
		{ label: t('attach.rowAgents'), value: providers.map(p => providerLabel[p]).join(', ') },
	]
	return (
		<div className="flex flex-col gap-5">
			<StepHeading title={t('attach.stepReviewTitle')} subtitle={t('attach.stepReviewSubtitle')} />
			<div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
				{rows.map(row => (
					<div key={row.label} className="flex items-center justify-between gap-4 p-4">
						<span className="text-sm font-medium text-muted-foreground">{row.label}</span>
						<span className={cn('truncate text-sm text-foreground', row.mono && 'font-mono')}>{row.value}</span>
					</div>
				))}
			</div>
		</div>
	)
}
