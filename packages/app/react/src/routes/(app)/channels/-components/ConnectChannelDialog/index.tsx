import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { useQueryClient } from '@tanstack/react-query'
import { IconAlertTriangle, IconCircleCheck, IconRefresh } from '@tabler/icons-react'
import { getHomeDashboardQueryKey } from '@codm/client-typescript/typescript'
import { ChannelKindEnum, ChannelStatusEnum, useConnectChannel, useGetChannel, useGetOrCreateChannel } from '@codm/client-typescript/go'
import { extractErrorCode, getErrorTranslation } from '@/lib'
import { channelGlyph } from '@/components/console/glyphs'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { useDialogStore } from '@/stores/useDialogStore'

// The gateway's whatsmeow QR context lives ~3 min. Treat a code as stale past that and offer a fresh
// one (a re-connect re-issues a QR) instead of letting the operator scan a dead code.
const QR_TTL_MS = 3 * 60 * 1000
// Pairing is an interactive, seconds-long ceremony — poll the gateway briskly while the dialog is open.
const POLL_INTERVAL_MS = 2000

/**
 * Connect-a-channel flow (T06). WhatsApp is the only connectable channel today; Instagram DM and
 * Telegram are "coming soon" and never reach this dialog.
 *
 * The real pairing wire — the GATEWAY SDK (`/go` subpath) through the api-ts external/ChannelProxy
 * (the browser never talks to the Go service; identity is stamped server-side):
 *   1. `useGetOrCreateChannel({ platform: WHATSAPP })` resolves the operator's channel row.
 *   2. `useConnectChannel({ id })` starts whatsmeow and hands back a live QR string SYNCHRONOUSLY
 *      (`{ id, state, qrCode }` — the connect call blocks on the first QR rotation).
 *   3. `useGetChannel(id)` polls ~every 2s until the gateway reports CONNECTED (its status
 *      projector flips the row when the device pairs), then the channels list is invalidated.
 * The QR rotates: past its ~3-min TTL we surface a "generate a new code" retry (a fresh connect).
 * If the gateway is unreachable the proxy raises GATEWAY_UNAVAILABLE, which we render as an honest,
 * retryable state rather than a fabricated code.
 *
 * ### "Aberto" agora é "MONTADO" (component bp-24)
 * This is pure content shown by `useDialogStore.show(<ConnectChannelDialog />)`, so there is no local
 * `open` to gate anything on: the component only exists while the dialog is open. That is why the two
 * queries below carry no `enabled: open` — they are enabled by default BECAUSE mounting is what used
 * to set `open` to true, and unmounting is what used to reset the pairing state. Nothing about the QR
 * machine changed; only who owns "open" did.
 */
export function ConnectChannelDialog() {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const hide = useDialogStore(s => s.hide)
	const WhatsAppGlyph = channelGlyph.WHATSAPP

	const [expired, setExpired] = useState(false)
	// Bumped by every retry ("generate new code" / error retry) so the connect effect re-fires even
	// though the resolved channel id is unchanged.
	const [attempt, setAttempt] = useState(0)

	const resolve = useGetOrCreateChannel({ platform: ChannelKindEnum.WHATSAPP })
	const channelId = resolve.data?.id ?? null

	const connect = useConnectChannel()
	const qr = connect.data?.qrCode ?? null
	const connectedOnConnect = connect.data?.state === ChannelStatusEnum.CONNECTED

	// Fire the connect as soon as the channel resolves (and again on every retry attempt). `isIdle`
	// guards the re-render loop: a fired mutation is pending/settled until the next reset().
	const { mutate: connectMutate, isIdle: connectIsIdle } = connect
	useEffect(() => {
		if (channelId && connectIsIdle) connectMutate({ id: channelId })
	}, [channelId, connectIsIdle, connectMutate, attempt])

	const pairing = useGetChannel(channelId ?? undefined, {
		query: {
			enabled: !!channelId && !!connect.data && !expired && !connectedOnConnect,
			refetchInterval: POLL_INTERVAL_MS,
		},
	})
	const isConnected = connectedOnConnect || pairing.data?.status === ChannelStatusEnum.CONNECTED

	const startPairing = () => {
		setExpired(false)
		connect.reset()
		if (resolve.isError) void resolve.refetch()
		setAttempt(n => n + 1)
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
				<Button onClick={hide}>{t('common.close')}</Button>
			</>
		)
	} else if (resolve.isError || connect.isError) {
		const code = extractErrorCode(resolve.error ?? connect.error)
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
	)
}
