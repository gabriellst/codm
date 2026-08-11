import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconChevronRight, IconPlus } from '@tabler/icons-react'
import { useGetHomeDashboard } from '@codm/client-typescript/typescript'
import type { ChannelKind, ChannelStatus } from '@codm/client-typescript/typescript'
import { PageHeader } from '@/components/console/PageHeader'
import { enumLabel } from '@/lib'
import { cn } from '@/lib/utils'
import { CHANNEL_KINDS, channelGlyph, channelStatusBadgeVariant } from '@/components/console/glyphs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { row, sectionLabelBare } from '@/components/ui/surfaces'
import { useDialogStore } from '@/stores/useDialogStore'
import { ConnectChannelDialog } from '../ConnectChannelDialog'

/**
 * Connected channels and their health (T05). WhatsApp is the only channel that can be connected
 * today: its row opens the connect flow (chevron, live status). Instagram DM and Telegram are
 * "coming soon" — inert rows with no chevron and no click. The backend exposes channel status
 * through the dashboard read; nothing about connectivity is invented.
 */
const CONNECTABLE: readonly ChannelKind[] = ['WHATSAPP']

export function ChannelsSection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const { data, isLoading } = useGetHomeDashboard()
	const show = useDialogStore(s => s.show)

	const statusByKind = new Map<ChannelKind, ChannelStatus>((data?.channels ?? []).map(c => [c.kind, c.status]))

	return (
		<div className={cn('mx-auto flex w-full flex-col gap-8 px-6 pb-16 pt-20', className)} {...props}>
			<PageHeader
				title={t('channels.title')}
				action={
					<Button onClick={() => show(<ConnectChannelDialog />)}>
						<IconPlus data-icon="inline-start" /> {t('channels.connectChannel')}
					</Button>
				}
			/>

			<div className="flex flex-col gap-2.5">
				<h2 className={sectionLabelBare}>{t('channels.yourChannels')}</h2>
				{isLoading ? (
					<div className="flex flex-col gap-3">
						<ChannelRowSkeleton />
						<ChannelRowSkeleton />
						<ChannelRowSkeleton />
					</div>
				) : (
					// Sem `divide-y`: cada linha traz a própria borda agora, e a hairline do pai somaria
					// uma segunda linha entre elas. Espaçamento no lugar da divisória, como na de tarefas.
					<div className="flex flex-col gap-2">
						{CHANNEL_KINDS.map(kind => {
							const connectable = CONNECTABLE.includes(kind)
							const status = statusByKind.get(kind) ?? 'DISCONNECTED'
							const Glyph = channelGlyph[kind]

							// D3 — the chip carries the status label on EVERY row (connectable or not); only
							// the connectable rows also repeat it as quiet text under the name. The tile fill
							// and the chip variant both flip on connectability: primary/secondary when the
							// channel can connect, muted/default when it's "coming soon".
							const body = (
								<>
									<span
										className={cn(
											'flex size-11 shrink-0 items-center justify-center rounded-asymmetric-xs',
											connectable ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
										)}
									>
										<Glyph className="size-5" />
									</span>
									<div className="flex min-w-0 flex-1 flex-col gap-1">
										<span className="text-[15px] font-bold text-foreground">{enumLabel('ChannelKind', kind)}</span>
										{connectable && <span className="text-[12.5px] text-muted-foreground">{enumLabel('ChannelStatus', status)}</span>}
									</div>
									<Badge variant={connectable ? channelStatusBadgeVariant[status] : 'default'}>
										{connectable ? enumLabel('ChannelStatus', status) : t('channels.comingSoon')}
									</Badge>
								</>
							)

							if (!connectable) {
								return (
									<div
										key={kind}
										className={cn('flex items-center gap-3.5 rounded-asymmetric-md bg-background p-3.5 opacity-50', row)}
										aria-disabled="true"
									>
										{body}
										<span className="size-[18px] shrink-0" />
									</div>
								)
							}

							// The handler is explicit now: the row calls `show()` itself instead of handing a
							// trigger element to a dialog that owned its own `open` (component bp-24).
							return (
								<Button
									variant={'ghost'}
									size="none"
									key={kind}
									type="button"
									// A linha de canal passa a ser uma CONTENT ROW com borda própria, igual à de
									// tarefa (`console/IssueRow.tsx`) — decisão do founder, 07/08/2026. Antes era
									// "divided list row" (só a hairline do `divide-y` do pai, sem borda), o que a
									// deixava visualmente mais fraca que a de tarefa apesar de ser a mesma coisa:
									// um item de conteúdo clicável. Agora compõe do preset `row`, então herda
									// borda em repouso e a borda verde no hover de uma fonte só. D3 — raio migrou de
									// `-lg` (20/7) pra `-md` (18/6), o step que o design mede nessa linha.
									className={cn('group flex w-full items-center gap-3.5 rounded-asymmetric-md bg-background p-3.5 text-left', row)}
									onClick={() => show(<ConnectChannelDialog />)}
								>
									{body}
									<IconChevronRight className="size-[18px] shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
								</Button>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
}

/** Loading placeholder shaped like a channel row (D3) — same radius/padding as the real rows so
 *  the list doesn't jump in shape once data lands. */
function ChannelRowSkeleton() {
	return (
		<div className="flex items-center gap-3.5 rounded-asymmetric-md border border-border bg-background p-3.5">
			<div className="size-11 shrink-0 rounded-asymmetric-xs bg-skeleton" />
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<div className="h-3.5 w-24 rounded-asymmetric-3xs bg-skeleton-strong" />
				<div className="h-2.5 w-16 rounded-asymmetric-3xs bg-skeleton" />
			</div>
			<div className="h-[23px] w-20 rounded-asymmetric-2xs bg-skeleton" />
		</div>
	)
}
