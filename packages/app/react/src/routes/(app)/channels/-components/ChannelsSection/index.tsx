import { useTranslation } from 'react-i18next'
import { IconChevronRight } from '@tabler/icons-react'
import { useGetHomeDashboard } from '@codedm/client-typescript/typescript'
import type { ChannelKind, ChannelStatus } from '@codedm/client-typescript/typescript'
import { PageHeader } from '@/components/console/PageHeader'
import { enumLabel } from '@/lib'
import { CHANNEL_KINDS, channelGlyph } from '@/components/console/glyphs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDialogStore } from '@/stores/useDialogStore'
import { ConnectChannelDialog } from '../ConnectChannelDialog'

/**
 * Connected channels and their health (T05). WhatsApp is the only channel that can be connected
 * today: its row opens the connect flow (chevron, live status). Instagram DM and Telegram are
 * "coming soon" — inert rows with no chevron and no click. The backend exposes channel status
 * through the dashboard read; nothing about connectivity is invented.
 */
const CONNECTABLE: readonly ChannelKind[] = ['WHATSAPP']

export function ChannelsSection() {
	const { t } = useTranslation()
	const { data, isLoading } = useGetHomeDashboard()
	const show = useDialogStore(s => s.show)

	const statusByKind = new Map<ChannelKind, ChannelStatus>((data?.channels ?? []).map(c => [c.kind, c.status]))

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-16 pt-20">
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
					<div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
						{CHANNEL_KINDS.map(kind => {
							const connectable = CONNECTABLE.includes(kind)
							const status = statusByKind.get(kind) ?? 'DISCONNECTED'
							const Glyph = channelGlyph[kind]

							const body = (
								<>
									<span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
										<Glyph className="size-5" />
									</span>
									<div className="flex min-w-0 flex-1 flex-col">
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
								<button
									key={kind}
									type="button"
									className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted"
									onClick={() => show(<ConnectChannelDialog />)}
								>
									{body}
									<IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
								</button>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
}
