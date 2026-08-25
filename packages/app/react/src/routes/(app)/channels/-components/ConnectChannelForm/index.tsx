import { useEffect, useState, type ComponentProps, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { useQueryClient } from '@tanstack/react-query'
import { IconAlertTriangle, IconCheck, IconQrcode, IconRefresh } from '@tabler/icons-react'
import { getAttachThreadWizardQueryKey, getHomeDashboardQueryKey } from '@codm/client-typescript/typescript'
import { ChannelKindEnum, ChannelStatusEnum, useConnectChannel, useGetChannel, useGetOrCreateChannel } from '@codm/client-typescript/go'
import { extractErrorCode, getErrorTranslation } from '@/lib'
import { cn } from '@/lib/utils'
import { Button } from '@codm/app-ui/button'
import { Spinner } from '@codm/app-ui/spinner'

// The gateway's whatsmeow QR context lives ~3 min. Treat a code as stale past that and offer a fresh
// one (a re-connect re-issues a QR) instead of letting the operator scan a dead code.
const QR_TTL_MS = 3 * 60 * 1000
// Pairing is an interactive, seconds-long ceremony — poll the gateway briskly while mounted.
const POLL_INTERVAL_MS = 2000

interface ConnectChannelFormProps extends ComponentProps<'div'> {
	/** Called where the dialog shell used to call `hide()` on success — e.g. when pairing completes. */
	onDone?: () => void
	/** D3 — the dialog shell's description line disappears once paired; this is how the shell
	 *  (which owns that static header text) learns the form's connected state without re-deriving
	 *  it from its own query. */
	onConnectedChange?: (connected: boolean) => void
	/**
	 * Default `true` — `/channels`' `ConnectChannelDialog` needs it, `onDone` there IS `hide()`
	 * (this is the ONLY affordance that closes the modal once paired). `false` for the onboarding
	 * CHANNEL step (2026-08-25 founder live-test, item 1): that embed passes no `onDone` at all —
	 * there is no dialog to close, "Próximo" (the wizard's own footer) is what moves the operator
	 * forward — so the button rendered as a dead "Fechar" with nothing wired to it. Contextual
	 * presentation only: `/channels`' dialog usage is untouched (prop omitted → default `true`).
	 */
	showCloseButton?: boolean
}

/**
 * Connect-a-channel flow (T06). WhatsApp is the only connectable channel today; Instagram and
 * Telegram render as presentational "coming soon" rows on `ChannelsSection` and never reach this
 * form — they aren't `ChannelKind` members (see `COMING_SOON_CHANNELS` in
 * `@/components/console/glyphs.tsx`).
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
 * This is pure content mounted by a caller (dialog shell or wizard step), so there is no local
 * `open` to gate anything on: the component only exists while it is shown. That is why the two
 * queries below carry no `enabled: open` — they are enabled by default BECAUSE mounting is what used
 * to set `open` to true, and unmounting is what used to reset the pairing state. Nothing about the QR
 * machine changed; only who owns "open" did.
 */
export function ConnectChannelForm({ className, onDone, onConnectedChange, showCloseButton = true, ...props }: ConnectChannelFormProps) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()

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

	useEffect(() => {
		onConnectedChange?.(isConnected)
	}, [isConnected, onConnectedChange])

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
	// O wizard de anexar conversa lê de OUTRA key (`getAttachThreadWizardQueryKey`) e é ela que
	// carrega `noChannelConnected` — sem invalidar aqui, quem conecta o canal a partir do wizard
	// continua vendo "nenhum canal conectado" até um refetch acidental.
	useEffect(() => {
		if (!isConnected) return
		queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() })
		queryClient.invalidateQueries({ queryKey: getAttachThreadWizardQueryKey() })
	}, [isConnected, queryClient])

	let body: ReactNode
	if (isConnected) {
		// D3 (e6hOKJ) — no boxed container: a small ring+check mark (secondary halo behind a
		// primary-colored circle-check glyph approximates the design's ring/halo/check trio),
		// the title and description as plain centered text, then the primary "Fechar" action.
		body = (
			<>
				<div className="flex size-[76px] items-center justify-center rounded-full bg-secondary">
					<IconCheck className="size-9 text-primary" strokeWidth={3} />
				</div>
				<p className="text-center text-base font-extrabold text-foreground">{t('channels.pairConnectedTitle')}</p>
				<p className="text-center text-[13px] text-muted-foreground">{t('channels.pairConnectedHint')}</p>
				{showCloseButton && <Button onClick={onDone}>{t('common.close')}</Button>}
			</>
		)
	} else if (resolve.isError || connect.isError) {
		// No design screen covers the error path (none of the 8 assigned screens is an error
		// state) — left as-is rather than invented.
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
		// D3 (oilhX) — the placeholder box goes skeleton-toned (not `bg-muted`) with a faded QR
		// glyph, radius asymmetric-lg (matching the QR-active box below); the retry action is the
		// primary solid button, not `outline`.
		body = (
			<>
				<div className="flex size-[176px] items-center justify-center rounded-asymmetric-lg border border-border bg-skeleton">
					<IconQrcode className="size-16 text-skeleton-strong" />
				</div>
				<p className="text-center text-base font-extrabold text-foreground">{t('channels.pairExpiredTitle')}</p>
				<p className="text-center text-[13px] text-muted-foreground">{t('channels.pairExpiredHint')}</p>
				<Button onClick={startPairing}>{t('channels.pairRegenerate')}</Button>
			</>
		)
	} else if (qr) {
		body = (
			<>
				{/* White plate + dark modules regardless of theme so the code stays scannable in dark
				    mode — código vence sobre o placeholder cinza do design aqui (a referência é
				    estática; um QR de verdade precisa da placa branca pra manter contraste de scan
				    em qualquer tema). Raio/tamanho seguem a medição (176px, asymmetric-lg). */}
				<div className="flex size-[176px] items-center justify-center rounded-asymmetric-lg border border-border bg-white p-3">
					<QRCodeSVG value={qr} size={152} level="M" marginSize={0} bgColor="#ffffff" fgColor="#000000" className="size-full" />
				</div>
				<p className="text-center text-[13px] text-muted-foreground">{t('channels.whatsappPairScanHint')}</p>
				<p className="text-center text-[13px] font-semibold text-foreground">{t('channels.pairWaitingScan')}</p>
			</>
		)
	} else {
		// D3 (TfUe4) — no box at all: a small spinner inline with the bold status line, then a
		// quieter description underneath.
		body = (
			<>
				<div className="flex items-center gap-2.5">
					<Spinner className="size-5 text-primary" />
					<p className="text-[15px] font-bold text-foreground">{t('channels.pairStarting')}</p>
				</div>
				<p className="text-center text-[13px] text-muted-foreground">{t('channels.pairWaiting')}</p>
			</>
		)
	}

	return (
		<div className={cn('flex flex-col items-center gap-4 py-2', className)} {...props}>
			{body}
		</div>
	)
}
