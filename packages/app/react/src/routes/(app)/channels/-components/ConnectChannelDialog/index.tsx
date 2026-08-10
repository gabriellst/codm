import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { channelGlyph } from '@/components/console/glyphs'
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useDialogStore } from '@/stores/useDialogStore'
import { ConnectChannelForm } from '../ConnectChannelForm'

/** Connect-a-channel dialog shell (T06) — chrome only; the QR pairing flow lives in `ConnectChannelForm`. */
export function ConnectChannelDialog({ className }: Pick<ComponentProps<typeof DialogContent>, 'className'>) {
	const { t } = useTranslation()
	const hide = useDialogStore(s => s.hide)
	const WhatsAppGlyph = channelGlyph.WHATSAPP

	return (
		<DialogContent className={cn(className)}>
			<DialogHeader>
				<DialogTitle>
					<span className="inline-flex items-center gap-2">
						<WhatsAppGlyph className="size-5" />
						{t('channels.whatsappPairTitle')}
					</span>
				</DialogTitle>
				<DialogDescription>{t('channels.whatsappPairDescription')}</DialogDescription>
			</DialogHeader>
			<ConnectChannelForm onDone={hide} />
		</DialogContent>
	)
}
