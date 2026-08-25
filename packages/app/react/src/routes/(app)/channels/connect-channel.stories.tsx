import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { IconCheck, IconQrcode, IconX } from '@tabler/icons-react'
import {
	getHomeDashboardQueryOptions,
	getIssuesOverviewQueryOptions,
	getSettingsQueryOptions,
	listWorkspacesQueryOptions,
} from '@codm/client-typescript/typescript'
import type {
	GetHomeDashboardQueryResponse,
	GetIssuesOverviewQueryResponse,
	GetSettingsQueryResponse,
	ListWorkspacesQueryResponse,
} from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { Button } from '@codm/app-ui/button'
import { Spinner } from '@codm/app-ui/spinner'
import { AppScreenFrame, connected, mockQuery } from '@/storybook'
import { ChannelsSection } from './-components/ChannelsSection'

// A4 (F3-waveA) — área Projetos & Canais: Canais — pareamento (4 estados de um mesmo fluxo/dialog:
// aguardando gateway, QR ativo, código expirado, conectado). Fontes:
// design/fidelity/targets/screens/canais-pareamento-{aguardando-gateway,qr-ativo,codigo-expirado,
// conectado}-group.png + design/system/pen/screens/canais-pareamento-{...}-group.json.

const now = Date.now()
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60_000).toISOString()

const dashboardOpts = getHomeDashboardQueryOptions()
const workspacesOpts = listWorkspacesQueryOptions()
const issuesOpts = getIssuesOverviewQueryOptions()
const settingsOpts = getSettingsQueryOptions()

// Same background as `channels.stories.tsx` (`List`) — every pairing target composites the dialog
// over the SAME loaded channel list (WhatsApp already "Conectado" underneath the in-progress
// pairing dialog — a design-mockup convenience for showing the flow overlay, decoupled from the
// literal state a real pairing attempt would find the row in; reproduced as-is, not invented).
const DASHBOARD: DeepPartial<GetHomeDashboardQueryResponse> = {
	threads: [
		{
			threadId: 'thread-demo-bot',
			displayName: 'Demo Shop',
			channelId: 'channel-1',
			externalId: '5511900000005',
			hasAvatar: false,
			channelKind: 'WHATSAPP',
			workspacePath: '/Users/work/Desktop/Projetos/aurora-labs',
			providers: ['CLAUDE_CODE'],
			status: 'IDLE',
			lastActivity: hoursAgo(10),
		},
	],
	channels: [{ kind: 'WHATSAPP', status: 'CONNECTED' }],
}
const WORKSPACES: DeepPartial<ListWorkspacesQueryResponse> = {
	workspaces: [
		{
			workspaceId: 'ws-1',
			path: '/Users/work/Desktop/Projetos/acme', // fixture-name divergence: target PNG shows real project/person names, replaced by synthetic fixtures (founder, 2026-08-25)
			badges: ['CLAUDE_PROJECT'],
			threadCount: 0,
			addedAt: hoursAgo(96),
		},
		{
			workspaceId: 'ws-2',
			path: '/Users/work/Desktop/Projetos/aurora-labs',
			badges: ['GIT', 'CLAUDE_PROJECT'],
			threadCount: 1,
			addedAt: hoursAgo(72),
		},
		{
			workspaceId: 'ws-3',
			path: '/Users/work/Desktop/Projetos/pessoal/codedm',
			badges: ['GIT', 'CLAUDE_PROJECT'],
			threadCount: 0,
			addedAt: hoursAgo(48),
		},
	],
}
const ISSUES_OVERVIEW: DeepPartial<GetIssuesOverviewQueryResponse> = {
	statsLine: { awaitingInput: 0, working: 0, completed: 0, archived: 0 },
	groups: [],
}
const SETTINGS: DeepPartial<GetSettingsQueryResponse> = { appVersion: '0.1.0' }

type Phase = 'starting' | 'qr' | 'expired' | 'connected'

/**
 * The STATIC PANEL (UI-FIDELITY.md canon 11): `ConnectChannelDialog` always renders through
 * `DialogContent`, which always wraps its children in Base UI's `Dialog.Portal` — no `container`
 * override exists anywhere in this codebase — so the live component (mounted via
 * `useDialogStore().show(<ConnectChannelDialog />)`) would portal to `document.body`, outside
 * `#storybook-root`, and `bun fidelity`'s `kind: 'screens'` capture (`root.screenshot()`) would
 * miss it entirely.
 *
 * Chrome (overlay/popup/header/close) is copied verbatim from `dialog.tsx`'s `DialogOverlay`/
 * `DialogContent`/`DialogHeader`, `h2`/`p` standing in for `DialogTitle`/`DialogDescription` (Base
 * UI primitives that require a `Dialog.Root` ancestor and would throw outside one) — same recipe as
 * `delete-thread.stories.tsx`'s `DeleteConversationPanel` and this area's own
 * `add-workspace.stories.tsx`'s `AddWorkspacePanel`. Includes the close-X `DialogContent` renders
 * by default (`ConnectChannelDialog` never overrides `showCloseButton`) — none of the four target
 * mockups draw one (checked in each extracted spec JSON: `Modal Header` has no close node), a
 * genuine design/code divergence, not fixed here.
 *
 * The BODY per `phase` reproduces `ConnectChannelForm`'s own branches (`-components/
 * ConnectChannelForm/index.tsx`) verbatim — same wrapper (`flex flex-col items-center gap-4 py-2`),
 * same classes, same i18n keys, `Spinner`/`Button`/`QRCodeSVG` reused directly (none of them are
 * Dialog-context bound). Reproduced statically rather than mounting the live form because THREE of
 * the four states are reachable only through internal client state the form derives itself
 * (`expired` fires off a `setTimeout(QR_TTL_MS)` — 3 minutes — no prop/mock can fast-forward it in
 * a story) or through the gateway's live QR string (no real pairing session exists in Storybook) —
 * canon 11's "painel estático" applies to the whole dialog, not just its chrome, once any one of
 * its states can't be driven through mocks. The `qr` phase's `QRCodeSVG` is fed a PLACEHOLDER
 * value (opaque to the UI either way — a real pairing code is meaningless without a live gateway
 * session) rather than a photo-fixture: `QRCodeSVG` deterministically COMPUTES its image from any
 * string, so there is no missing asset to recover from the target (contrast with a real photo,
 * which the foto-fixture technique in UI-FIDELITY.md exists for).
 */
function ConnectChannelPanel({ phase }: { phase: Phase }) {
	const { t } = useTranslation()
	const isConnected = phase === 'connected'

	let body: ReactNode
	if (phase === 'connected') {
		body = (
			<>
				<div className="flex size-[76px] items-center justify-center rounded-full bg-secondary">
					<IconCheck className="size-9 text-primary" strokeWidth={3} />
				</div>
				<p className="text-center text-base font-extrabold text-foreground">{t('channels.pairConnectedTitle')}</p>
				<p className="text-center text-[13px] text-muted-foreground">{t('channels.pairConnectedHint')}</p>
				<Button onClick={() => {}}>{t('common.close')}</Button>
			</>
		)
	} else if (phase === 'expired') {
		body = (
			<>
				<div className="flex size-[176px] items-center justify-center rounded-asymmetric-lg border border-border bg-skeleton">
					<IconQrcode className="size-16 text-skeleton-strong" />
				</div>
				<p className="text-center text-base font-extrabold text-foreground">{t('channels.pairExpiredTitle')}</p>
				<p className="text-center text-[13px] text-muted-foreground">{t('channels.pairExpiredHint')}</p>
				<Button onClick={() => {}}>{t('channels.pairRegenerate')}</Button>
			</>
		)
	} else if (phase === 'qr') {
		body = (
			<>
				<div className="flex size-[176px] items-center justify-center rounded-asymmetric-lg border border-border bg-white p-3">
					<QRCodeSVG
						value="codm-fidelity-placeholder-qr"
						size={152}
						level="M"
						marginSize={0}
						bgColor="#ffffff"
						fgColor="#000000"
						className="size-full"
					/>
				</div>
				<p className="text-center text-[13px] text-muted-foreground">{t('channels.whatsappPairScanHint')}</p>
				<p className="text-center text-[13px] font-semibold text-foreground">{t('channels.pairWaitingScan')}</p>
			</>
		)
	} else {
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
		<div>
			{/* Copied from `DialogOverlay` — animation/data-state modifiers dropped (static, always "open"). */}
			<div className="bg-foreground/70 fixed inset-0 isolate z-50" />
			{/* Copied from `DialogContent`'s `DialogPrimitive.Popup` className. */}
			<div className="bg-background border border-border shadow-modal grid max-w-[calc(100%-2rem)] gap-4 rounded-asymmetric-xl overflow-hidden p-6 text-sm duration-150 ease-out sm:max-w-md fixed top-1/2 left-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 outline-none">
				{/* Copied from `DialogContent`'s close button — real `Button`/`IconX`, not portal-bound. */}
				<Button variant="ghost" className="absolute top-4 right-4" size="icon" type="button" onClick={() => {}}>
					<IconX />
					<span className="sr-only">{t('common.close')}</span>
				</Button>
				{/* Copied from `DialogHeader`; description hidden once connected, mirroring
				    `ConnectChannelDialog`'s `{!connected && <DialogDescription>}`. */}
				<div className="gap-2 flex flex-col">
					<h2 className="text-lg leading-snug font-semibold">{t('channels.whatsappPairTitle')}</h2>
					{!isConnected && (
						<p className="text-muted-foreground *:[a]:text-secondary-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3">
							{t('channels.whatsappPairDescription')}
						</p>
					)}
				</div>
				{/* Copied from `ConnectChannelForm`'s own root wrapper (`flex flex-col items-center gap-4 py-2`). */}
				<div className="flex flex-col items-center gap-4 py-2">{body}</div>
			</div>
		</div>
	)
}

const meta = {
	title: 'Channels/ConnectChannel (Fidelity)',
	component: ConnectChannelPanel,
	parameters: connected({
		route: { id: '/(app)/channels/' },
		msw: {
			handlers: [
				mockQuery(dashboardOpts, DASHBOARD),
				mockQuery(workspacesOpts, WORKSPACES),
				mockQuery(issuesOpts, ISSUES_OVERVIEW),
				mockQuery(settingsOpts, SETTINGS),
			],
		},
	}),
} satisfies Meta<typeof ConnectChannelPanel>
export default meta

type Story = StoryObj<typeof meta>

/**
 * `canais-pareamento-aguardando-gateway-group` — the gateway hasn't produced a code yet
 * (`ConnectChannelForm`'s final `else` branch: spinner + "Iniciando o gateway do WhatsApp…"),
 * measured against
 * `design/fidelity/targets/screens/canais-pareamento-aguardando-gateway-group.png` via `bun fidelity`.
 */
export const AguardandoGateway: Story = {
	args: { phase: 'starting' },
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'canais-pareamento-aguardando-gateway-group', kind: 'screens', viewport: { width: 1440, height: 900 } },
	},
	render: args => (
		<AppScreenFrame>
			<ChannelsSection />
			<ConnectChannelPanel phase={args.phase} />
		</AppScreenFrame>
	),
}

/**
 * `canais-pareamento-qr-ativo-group` — a live QR code waiting to be scanned (`ConnectChannelForm`'s
 * `qr` branch), measured against
 * `design/fidelity/targets/screens/canais-pareamento-qr-ativo-group.png` via `bun fidelity`.
 */
export const QrAtivo: Story = {
	args: { phase: 'qr' },
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'canais-pareamento-qr-ativo-group', kind: 'screens', viewport: { width: 1440, height: 900 } },
	},
	render: args => (
		<AppScreenFrame>
			<ChannelsSection />
			<ConnectChannelPanel phase={args.phase} />
		</AppScreenFrame>
	),
}

/**
 * `canais-pareamento-codigo-expirado-group` — the QR TTL (3 min, `QR_TTL_MS`) elapsed unscanned
 * (`ConnectChannelForm`'s `expired` branch), measured against
 * `design/fidelity/targets/screens/canais-pareamento-codigo-expirado-group.png` via `bun fidelity`.
 */
export const CodigoExpirado: Story = {
	args: { phase: 'expired' },
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'canais-pareamento-codigo-expirado-group', kind: 'screens', viewport: { width: 1440, height: 900 } },
	},
	render: args => (
		<AppScreenFrame>
			<ChannelsSection />
			<ConnectChannelPanel phase={args.phase} />
		</AppScreenFrame>
	),
}

/**
 * `canais-pareamento-conectado-group` — pairing succeeded (`ConnectChannelForm`'s `isConnected`
 * branch), measured against `design/fidelity/targets/screens/canais-pareamento-conectado-group.png`
 * via `bun fidelity`.
 */
export const Conectado: Story = {
	args: { phase: 'connected' },
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'canais-pareamento-conectado-group', kind: 'screens', viewport: { width: 1440, height: 900 } },
	},
	render: args => (
		<AppScreenFrame>
			<ChannelsSection />
			<ConnectChannelPanel phase={args.phase} />
		</AppScreenFrame>
	),
}
