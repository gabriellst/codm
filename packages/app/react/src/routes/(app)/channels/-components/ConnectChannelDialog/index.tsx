import { useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@codm/app-ui/dialog'
import { cn } from '@/lib/utils'
import { useDialogStore } from '@/stores/useDialogStore'
import { ConnectChannelForm } from '../ConnectChannelForm'

/** Connect-a-channel dialog shell (T06) — chrome only; the QR pairing flow lives in `ConnectChannelForm`.
 *  D3 — the title is plain text now, no inline WhatsApp glyph: the reference's modal title never
 *  pairs an icon with the "Parear WhatsApp" heading across any of its 4 pairing states. The
 *  explanatory description is also state-dependent: present in the 3 in-progress states, gone once
 *  connected — the shell tracks that via the form's `onConnectedChange` callback (STATE-LOCAL-FILTER
 *  equivalent: purely presentational, private to this dialog's render, never shared/deep-linked). */
export function ConnectChannelDialog({ className }: Pick<ComponentProps<typeof DialogContent>, 'className'>) {
	const { t } = useTranslation()
	const hide = useDialogStore(s => s.hide)
	const [connected, setConnected] = useState(false)

	return (
		<DialogContent className={cn(className)}>
			<DialogHeader>
				<DialogTitle>{t('channels.whatsappPairTitle')}</DialogTitle>
				{!connected && <DialogDescription>{t('channels.whatsappPairDescription')}</DialogDescription>}
			</DialogHeader>
			<ConnectChannelForm onDone={hide} onConnectedChange={setConnected} />
		</DialogContent>
	)
}
