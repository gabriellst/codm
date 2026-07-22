import { useState } from 'react'
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
			<DialogTrigger render={<Button>Connect channel</Button>} />
			<DialogContent>
				{view === 'picker' ? (
					<>
						<DialogHeader>
							<DialogTitle>Connect a channel</DialogTitle>
							<DialogDescription>Messages in connected channels can be routed to your agents.</DialogDescription>
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
									<span className="text-xs text-muted-foreground">Pair via QR code</span>
								</div>
								<IconChevronRight className="size-4 text-muted-foreground" />
							</button>
							<div className="flex items-center gap-3 rounded-2xl border border-border p-3 opacity-60">
								<span className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
									<EmailGlyph className="size-5" />
								</span>
								<div className="flex flex-1 flex-col">
									<span className="text-sm font-semibold text-foreground">Email (IMAP)</span>
									<span className="text-xs text-muted-foreground">Coming soon</span>
								</div>
							</div>
						</div>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>Pair Telegram</DialogTitle>
							<DialogDescription>Open Telegram on your phone, then scan this code to link the channel.</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col items-center gap-4 py-2">
							<div className="flex size-52 items-center justify-center rounded-2xl border border-dashed border-border bg-muted text-muted-foreground">
								<IconQrcode className="size-16" />
							</div>
							<p className="text-center text-sm text-muted-foreground">Waiting for the local gateway to generate a pairing code…</p>
						</div>
						<div className="flex justify-start">
							<Button variant="ghost" size="sm" onClick={() => setView('picker')}>
								<IconChevronLeft data-icon="inline-start" /> Back
							</Button>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	)
}
