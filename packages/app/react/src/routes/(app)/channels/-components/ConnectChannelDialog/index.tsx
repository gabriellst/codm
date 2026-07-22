import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { useQueryClient } from '@tanstack/react-query'
import { IconAlertTriangle, IconCircleCheck, IconRefresh } from '@tabler/icons-react'
import { ChannelStatusEnum, getHomeDashboardQueryKey, useConnectChannel, useGetChannelPairingStatus } from '@codedm/client-typescript/typescript'
import { extractErrorCode, getErrorTranslation } from '@/lib'
import { channelGlyph } from '@/components/console/glyphs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'

// The gateway's whatsmeow QR context lives ~3 min. Treat a code as stale past that and offer a fresh
// one (a re-connect re-issues a QR) instead of letting the operator scan a dead code.
const QR_TTL_MS = 3 * 60 * 1000
// Pairing is an interactive, seconds-long ceremony — poll the gateway briskly while the dialog is open.
const POLL_INTERVAL_MS = 2000

/**
 * Connect-a-channel flow (T06). WhatsApp is the only connectable channel today; Instagram DM and
 * Telegram are "coming soon" and never reach this dialog.
 *
 * The real pairing wire: opening the dialog fires the `ConnectChannel` proxy, which server-side asks
 * the Go channel gateway to start a WhatsApp session and hands back a live QR string SYNCHRONOUSLY.
 * We render that string as a scannable QR, then poll `GetChannelPairingStatus` every ~2s until the
 * gateway reports CONNECTED — at which point the channels list is invalidated so the new link shows
 * up. The QR rotates: past its ~3-min TTL we surface a "generate a new code" retry (a fresh connect).
 * If the gateway is unreachable the proxy raises GATEWAY_UNAVAILABLE, which we render as an honest,
 * retryable state rather than a fabricated code. The `trigger` slot lets both the page's "Connect
 * channel" button and the WhatsApp row open the same flow.
 */
export function ConnectChannelDialog({ trigger }: { trigger?: ReactElement }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const WhatsAppGlyph = channelGlyph.WHATSAPP

	const [open, setOpen] = useState(false)
	const [expired, setExpired] = useState(false)

	const connect = useConnectChannel()
	const channelId = connect.data?.channelId ?? null
	const qr = connect.data?.qr ?? null
	const connectedOnConnect = connect.data?.status === ChannelStatusEnum.CONNECTED

	const pairing = useGetChannelPairingStatus(
		{ channelId: channelId ?? '' },
		{ query: { enabled: open && !!channelId && !expired && !connectedOnConnect, refetchInterval: POLL_INTERVAL_MS } },
	)
	const isConnected = connectedOnConnect || pairing.data?.status === ChannelStatusEnum.CONNECTED

	const startPairing = () => {
		setExpired(false)
		connect.reset()
		connect.mutate()
	}

	const handleOpenChange = (next: boolean) => {
		setOpen(next)
		if (next) {
			startPairing()
		} else {
			setExpired(false)
			connect.reset()
		}
	}

	// Reset the staleness timer whenever a fresh QR arrives; a paired channel needs no timer.
	useEffect(() => {
		if (!qr || isConnected) return
		const id = setTimeout(() => setExpired(true), QR_TTL_MS)
		return () => clearTimeout(id)
	}, [qr, isConnected])

	// Reflect the freshly linked channel in the channels list the moment pairing completes.
	useEffect(() => {
		if (isConnected) queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() })
	}, [isConnected, queryClient])

	let body: ReactNode
	if (isConnected) {
		body = (
			<>
				<div className="flex size-52 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-muted text-center">
					<IconCircleCheck className="size-16 text-primary" />
					<p className="font-semibold text-foreground">{t('channels.pairConnectedTitle')}</p>
				</div>
				<p className="text-center text-sm text-muted-foreground">{t('channels.pairConnectedHint')}</p>
				<DialogClose render={<Button>{t('common.close')}</Button>} />
			</>
		)
	} else if (connect.isError) {
		const code = extractErrorCode(connect.error)
		body = (
			<>
				<div className="flex size-52 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 p-4 text-center">
					<IconAlertTriangle className="size-12 text-destructive" />
					<p className="text-sm text-muted-foreground">{getErrorTranslation(code)}</p>
				</div>
				<Button variant="outline" onClick={startPairing}>
					<IconRefresh data-icon="inline-start" /> {t('common.retry')}
				</Button>
			</>
		)
	} else if (expired) {
		body = (
			<>
				<div className="flex size-52 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted p-4 text-center">
					<IconRefresh className="size-12 text-muted-foreground" />
					<p className="text-sm font-medium text-foreground">{t('channels.pairExpiredTitle')}</p>
				</div>
				<p className="text-center text-sm text-muted-foreground">{t('channels.pairExpiredHint')}</p>
				<Button variant="outline" onClick={startPairing}>
					<IconRefresh data-icon="inline-start" /> {t('channels.pairRegenerate')}
				</Button>
			</>
		)
	} else if (qr) {
		body = (
			<>
				{/* White plate + dark modules regardless of theme so the code stays scannable in dark mode. */}
				<div className="flex size-52 items-center justify-center rounded-2xl border border-border bg-white p-3">
					<QRCodeSVG value={qr} size={184} level="M" marginSize={0} bgColor="#ffffff" fgColor="#000000" className="size-full" />
				</div>
				<p className="text-center text-sm text-muted-foreground">{t('channels.whatsappPairScanHint')}</p>
				<p className="flex items-center gap-2 text-xs text-muted-foreground">
					<Spinner className="size-3" /> {t('channels.pairWaitingScan')}
				</p>
			</>
		)
	} else {
		body = (
			<>
				<div className="flex size-52 items-center justify-center rounded-2xl border border-dashed border-border bg-muted">
					<Spinner className="size-10 text-muted-foreground" />
				</div>
				<p className="text-center text-sm text-muted-foreground">{t('channels.pairStarting')}</p>
			</>
		)
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
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
				<div className="flex flex-col items-center gap-4 py-2">{body}</div>
			</DialogContent>
		</Dialog>
	)
}
