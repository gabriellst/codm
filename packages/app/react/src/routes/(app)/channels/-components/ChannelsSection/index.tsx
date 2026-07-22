import { useTranslation } from 'react-i18next'
import { IconChevronRight } from '@tabler/icons-react'
import { useGetHomeDashboard } from '@codedm/client-typescript/typescript'
import type { ChannelKind, ChannelStatus } from '@codedm/client-typescript/typescript'
import { PageHeader } from '@/components/console/PageHeader'
import { CHANNEL_KINDS, channelGlyph, channelLabel } from '@/components/console/glyphs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ConnectChannelDialog } from '../ConnectChannelDialog'

const statusLabel: Record<ChannelStatus, string> = {
	CONNECTED: 'Connected',
	PAIRING: 'Pairing…',
	DISCONNECTED: 'Not connected',
}

/**
 * Connected channels and their health (T05). The backend exposes channel status
 * through the dashboard read; there is no per-account read yet, so each of the three
 * channel kinds is listed with its live status and nothing invented.
 */
export function ChannelsSection() {
	const { t } = useTranslation()
	const { data, isLoading } = useGetHomeDashboard()

	const statusByKind = new Map<ChannelKind, ChannelStatus>((data?.channels ?? []).map(c => [c.kind, c.status]))

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-16 pt-20">
			<PageHeader title={t('channels.title')} action={<ConnectChannelDialog />} />

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
							const status = statusByKind.get(kind) ?? 'DISCONNECTED'
							const Glyph = channelGlyph[kind]
							const connected = status === 'CONNECTED'
							return (
								<div key={kind} className="flex items-center gap-4 p-4">
									<span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
										<Glyph className="size-5" />
									</span>
									<div className="flex min-w-0 flex-1 flex-col">
										<span className="font-semibold text-foreground">{channelLabel[kind]}</span>
										<span className="text-sm text-muted-foreground">{statusLabel[status]}</span>
									</div>
									<Badge variant={connected ? 'secondary' : 'outline'}>{String(connected ? 'Connected' : 'Not connected')}</Badge>
									<IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
								</div>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
}
