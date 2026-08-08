import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconChevronRight } from '@tabler/icons-react'
import { useGetHomeDashboard } from '@codm/client-typescript/typescript'
import type { ChannelKind, ChannelStatus } from '@codm/client-typescript/typescript'
import { PageHeader } from '@/components/console/PageHeader'
import { enumLabel } from '@/lib'
import { cn } from '@/lib/utils'
import { CHANNEL_KINDS, channelGlyph } from '@/components/console/glyphs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { row } from '@/components/ui/surfaces'
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
		<div className={cn('mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 pb-16 pt-20', className)} {...props}>
			<PageHeader
				title={t('channels.title')}
				action={<Button onClick={() => show(<ConnectChannelDialog />)}>{t('channels.connectChannel')}</Button>}
			/>

			<div className="flex flex-col gap-2">
				<h2 className="label-eyebrow px-1">{t('channels.yourChannels')}</h2>
				{isLoading ? (
					<div className="flex flex-col gap-3">
						<Skeleton className="h-16 rounded-2xl" />
						<Skeleton className="h-16 rounded-2xl" />
						<Skeleton className="h-16 rounded-2xl" />
					</div>
				) : (
					// Sem `divide-y`: cada linha traz a própria borda agora, e a hairline do pai somaria
					// uma segunda linha entre elas. Espaçamento no lugar da divisória, como na de tarefas.
					<div className="flex flex-col gap-2">
						{CHANNEL_KINDS.map(kind => {
							const connectable = CONNECTABLE.includes(kind)
							const status = statusByKind.get(kind) ?? 'DISCONNECTED'
							const Glyph = channelGlyph[kind]

							const body = (
								<>
									<span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
										<Glyph className="size-5" />
									</span>
									<div className="flex min-w-0 flex-1 flex-col gap-1.5">
										<span className="font-semibold text-foreground">{enumLabel('ChannelKind', kind)}</span>
										<span className="text-sm text-muted-foreground">
											{connectable ? enumLabel('ChannelStatus', status) : t('channels.comingSoon')}
										</span>
									</div>
								</>
							)

							if (!connectable) {
								return (
									<div key={kind} className="flex items-center gap-4 p-4 opacity-55" aria-disabled="true">
										{body}
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
									// borda em repouso e a borda verde no hover de uma fonte só.
									className={cn('group flex w-full items-center gap-4 rounded-asymmetric-lg bg-background p-3.5 text-left', row)}
									onClick={() => show(<ConnectChannelDialog />)}
								>
									{body}
									<IconChevronRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
								</Button>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
}
