import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconChevronLeft, IconChevronRight, IconQrcode } from '@tabler/icons-react'
import { channelGlyph, channelLabel, emailGlyph } from '@/components/console/glyphs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

type View = 'picker' | 'pairing'

/**
 * Connect-a-channel picker (T06). Telegram pairs via QR; email is coming soon.
 * Live QR pairing is handled by the local gateway process, not the console SDK, so the
 * pairing view shows an honest waiting state rather than a fabricated code.
 */
export function ConnectChannelDialog() {
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)
	const [view, setView] = useState<View>('picker')

	const close = (next: boolean) => {
		setOpen(next)
		if (!next) setView('picker')
	}

	const TelegramGlyph = channelGlyph.TELEGRAM
	const EmailGlyph = emailGlyph

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogTrigger render={<Button>{t('channels.connectChannel')}</Button>} />
			<DialogContent>
				{view === 'picker' ? (
					<>
						<DialogHeader>
							<DialogTitle>{t('channels.connectTitle')}</DialogTitle>
							<DialogDescription>{t('channels.connectDescription')}</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col gap-2">
							<button
								type="button"
								onClick={() => setView('pairing')}
								className="flex items-center gap-3 rounded-2xl border border-border p-3 text-left transition-colors hover:bg-muted"
							>
								<span className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
									<TelegramGlyph className="size-5" />
								</span>
								<div className="flex flex-1 flex-col">
									<span className="text-sm font-semibold text-foreground">{channelLabel.TELEGRAM}</span>
									<span className="text-xs text-muted-foreground">{t('channels.pairViaQr')}</span>
								</div>
								<IconChevronRight className="size-4 text-muted-foreground" />
							</button>
							<div className="flex items-center gap-3 rounded-2xl border border-border p-3 opacity-60">
								<span className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
									<EmailGlyph className="size-5" />
								</span>
								<div className="flex flex-1 flex-col">
									<span className="text-sm font-semibold text-foreground">{t('channels.emailImap')}</span>
									<span className="text-xs text-muted-foreground">{t('channels.comingSoon')}</span>
								</div>
							</div>
						</div>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>{t('channels.pairTitle')}</DialogTitle>
							<DialogDescription>{t('channels.pairDescription')}</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col items-center gap-4 py-2">
							<div className="flex size-52 items-center justify-center rounded-2xl border border-dashed border-border bg-muted text-muted-foreground">
								<IconQrcode className="size-16" />
							</div>
							<p className="text-center text-sm text-muted-foreground">{t('channels.pairWaiting')}</p>
						</div>
						<div className="flex justify-start">
							<Button variant="ghost" size="sm" onClick={() => setView('picker')}>
								<IconChevronLeft data-icon="inline-start" /> {t('console.back')}
							</Button>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	)
}
