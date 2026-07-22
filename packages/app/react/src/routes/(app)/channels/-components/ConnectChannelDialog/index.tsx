import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { IconQrcode } from '@tabler/icons-react'
import { channelGlyph } from '@/components/console/glyphs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

/**
 * Connect-a-channel flow (T06). WhatsApp is the only connectable channel today; Instagram DM and
 * Telegram are "coming soon" and never reach this dialog. Live pairing runs in the local WhatsApp
 * gateway process, not the console SDK — there is no connect mutation to call — so the dialog shows
 * an honest QR surface with a waiting state instead of a fabricated code. The `trigger` slot lets
 * both the page's "Connect channel" button and the WhatsApp row open the same flow.
 */
export function ConnectChannelDialog({ trigger }: { trigger?: ReactElement }) {
	const { t } = useTranslation()
	const WhatsAppGlyph = channelGlyph.WHATSAPP

	return (
		<Dialog>
			{/* Keep the fallback <Button> DIRECTLY in render= so button-needs-handler sees it as
			    a composition-wired trigger (a logical/variable wrapper would trip the rule). */}
			{trigger ? <DialogTrigger render={trigger} /> : <DialogTrigger render={<Button>{t('channels.connectChannel')}</Button>} />}
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						<span className="inline-flex items-center gap-2">
							<WhatsAppGlyph className="size-5" />
							{t('channels.whatsappPairTitle')}
						</span>
					</DialogTitle>
					<DialogDescription>{t('channels.whatsappPairDescription')}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col items-center gap-4 py-2">
					<div className="flex size-52 items-center justify-center rounded-2xl border border-dashed border-border bg-muted text-muted-foreground">
						<IconQrcode className="size-16" />
					</div>
					<p className="text-center text-sm text-muted-foreground">{t('channels.gatewayWaiting')}</p>
				</div>
			</DialogContent>
		</Dialog>
	)
}
