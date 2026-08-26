import type { Meta, StoryObj } from '@storybook/react'
import {
	getHomeDashboardQueryOptions,
	getIssuesOverviewQueryOptions,
	getSessionChatQueryOptions,
	getSettingsQueryOptions,
	listArtifactsQueryOptions,
	listWorkspacesQueryOptions,
} from '@codm/client-typescript/typescript'
import type {
	GetHomeDashboardQueryResponse,
	GetIssuesOverviewQueryResponse,
	GetSessionChatQueryResponse,
	GetSettingsQueryResponse,
	ListArtifactsQueryResponse,
	ListWorkspacesQueryResponse,
} from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { AppScreenFrame, connected, mockQuery } from '@/storybook'
import { SessionHeader } from '../-components/SessionHeader'
import { ArtifactsSection } from '../-components/ArtifactsSection'

// A2 (F3-waveA) — área Conversa: Artefatos.
// Fontes: design/fidelity/targets/screens/screen-artefatos.png +
// design/system/pen/screens/screen-artefatos.json.

const THREAD = '019e4d24-6524-7041-9e1c-8108180cdd10'
const CHANNEL = '019e4d24-6524-7041-9e1c-8108180cdd11'

const now = Date.now()
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString()
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60_000).toISOString()

const dashboardOpts = getHomeDashboardQueryOptions()
const workspacesOpts = listWorkspacesQueryOptions()
const issuesOverviewOpts = getIssuesOverviewQueryOptions()
const settingsOpts = getSettingsQueryOptions()
const sessionChatOpts = getSessionChatQueryOptions(THREAD)
const artifactsOpts = listArtifactsQueryOptions(THREAD)

// Same sidebar mocks as `thread.stories.tsx` (`AppScreenFrame` always draws the real `Sidebar`) —
// content reproduced from the target: "Projetos 3 · Tarefas 0 · Canais 1" + one "DEMO SHOP BOT" thread.
const SIDEBAR_DASHBOARD: DeepPartial<GetHomeDashboardQueryResponse> = {
	threads: [
		{
			threadId: THREAD,
			displayName: 'Demo Shop',
			channelId: CHANNEL,
			externalId: '5511900000005',
			hasAvatar: false,
			channelKind: 'WHATSAPP',
			workspacePath: '/Users/work/Desktop/Projetos/aurora-labs',
			providers: ['CLAUDE_CODE'],
			status: 'RUNNING',
			lastActivity: hoursAgo(10),
		},
	],
	channels: [{ kind: 'WHATSAPP', status: 'CONNECTED' }],
}
const SIDEBAR_WORKSPACES: DeepPartial<ListWorkspacesQueryResponse> = {
	workspaces: [
		{ workspaceId: 'ws-1', path: '/workspaces/loja-litoral', badges: [], threadCount: 1, addedAt: hoursAgo(48) },
		{ workspaceId: 'ws-2', path: '/workspaces/acme', badges: [], threadCount: 1, addedAt: hoursAgo(72) },
		{ workspaceId: 'ws-3', path: '/workspaces/demo-shop', badges: [], threadCount: 1, addedAt: hoursAgo(96) },
	],
}
const SIDEBAR_ISSUES_OVERVIEW: DeepPartial<GetIssuesOverviewQueryResponse> = {
	statsLine: { awaitingInput: 0, working: 0, completed: 0, archived: 0 },
	groups: [],
}
const SIDEBAR_SETTINGS: DeepPartial<GetSettingsQueryResponse> = { appVersion: '0.1.0' }

const SESSION_CHAT: DeepPartial<GetSessionChatQueryResponse> = {
	thread: {
		threadId: THREAD,
		displayName: 'DEMO SHOP BOT',
		channelId: CHANNEL,
		externalId: '5511900000005',
		hasAvatar: false,
		channelKind: 'WHATSAPP',
		workspacePath: '/Users/work/Desktop/Projetos/aurora-labs',
		providers: ['CLAUDE_CODE'],
		status: 'RUNNING',
		lastActivity: minutesAgo(2),
	},
	paused: false,
	mentionGate: { enabled: true, tag: '@aurora' },
	activeStops: [],
	transcript: [],
	composerMode: 'DIRECT',
}

/**
 * `ListArtifacts` content REPRODUZIDO verbatim do alvo: os 6 artefatos, ordenados como no alvo
 * (linha 1: Preview — fix/coupon-focus, checkout-mobile.png, invoice-payload.json; linha 2: Preview
 * — pix-gateway, repro-nav-ios.mp4, nota-de-voz.m4a) — `meta` carrega exatamente o texto de detalhe
 * do alvo ("1170 × 2532 · 428 KB", "3.2 KB · gerado por Codex", "00:18 · enviado por Diego
 * Martins", "00:42 · enviado por Thiago Barros").
 *
 * IMAGE/VIDEO/AUDIO passam por `ArtifactPreview` de verdade (`ArtifactsSection`'s `MEDIA_KINDS`) —
 * não há binário real por trás de `artifactContentUrl` neste harness, então o `<img>`/`<video>`/
 * `<audio>` degrada para o fallback de arquivo no `onError` (comportamento real do componente:
 * "código vence" sobre o ícone genérico que o `.pen` desenha para essas três kinds, por não poder
 * embutir mídia viva — ver o docblock de `ArtifactsSection`). Nenhum ajuste de componente feito para
 * forçar o ícone estático do alvo.
 */
const ARTIFACTS: DeepPartial<ListArtifactsQueryResponse> = {
	artifacts: [
		{
			artifactId: '019e4d24-6524-7041-9e1c-8108180cdd50',
			kind: 'LINK',
			name: 'Preview — fix/coupon-focus',
			ref: 'https://acme-storefront-git-fix-coupon.vercel.app',
			meta: 'acme-storefront-git-fix-coupon.vercel.app',
			recordedAt: minutesAgo(12),
		},
		{
			artifactId: '019e4d24-6524-7041-9e1c-8108180cdd51',
			kind: 'IMAGE',
			name: 'checkout-mobile.png',
			ref: '/tmp/checkout-mobile.png',
			meta: '1170 × 2532 · 428 KB',
			recordedAt: minutesAgo(40),
		},
		{
			artifactId: '019e4d24-6524-7041-9e1c-8108180cdd52',
			kind: 'FILE',
			name: 'invoice-payload.json',
			ref: '/tmp/invoice-payload.json',
			meta: '3.2 KB · gerado por Codex',
			recordedAt: hoursAgo(1),
		},
		{
			artifactId: '019e4d24-6524-7041-9e1c-8108180cdd53',
			kind: 'LINK',
			name: 'Preview — pix-gateway',
			ref: 'https://pix-gateway-git-feat-pix.vercel.app',
			meta: 'pix-gateway-git-feat-pix.vercel.app',
			recordedAt: hoursAgo(2),
		},
		{
			artifactId: '019e4d24-6524-7041-9e1c-8108180cdd54',
			kind: 'VIDEO',
			name: 'repro-nav-ios.mp4',
			ref: '/tmp/repro-nav-ios.mp4',
			meta: '00:18 · enviado por Diego Martins',
			recordedAt: hoursAgo(3),
		},
		{
			artifactId: '019e4d24-6524-7041-9e1c-8108180cdd55',
			kind: 'AUDIO',
			name: 'nota-de-voz.m4a',
			ref: '/tmp/nota-de-voz.m4a',
			meta: '00:42 · enviado por Thiago Barros',
			recordedAt: hoursAgo(3),
		},
	],
}

const meta = {
	title: 'Conversa/Artefatos',
	component: ArtifactsSection,
	args: { threadId: THREAD },
	parameters: connected({
		route: { id: '/(app)/threads/$threadId/artifacts/' },
		msw: {
			handlers: [
				mockQuery(dashboardOpts, SIDEBAR_DASHBOARD),
				mockQuery(workspacesOpts, SIDEBAR_WORKSPACES),
				mockQuery(issuesOverviewOpts, SIDEBAR_ISSUES_OVERVIEW),
				mockQuery(settingsOpts, SIDEBAR_SETTINGS),
				mockQuery(sessionChatOpts, SESSION_CHAT),
				mockQuery(artifactsOpts, ARTIFACTS),
			],
		},
	}),
} satisfies Meta<typeof ArtifactsSection>
export default meta

type Story = StoryObj<typeof meta>

/**
 * `screen-artefatos` — a aba "Artefatos" de UMA conversa, grid 3-up. Renderiza a composição REAL da
 * rota: `SessionHeader` (masthead + abas, mora no `route.tsx` pai) + `ArtifactsSection` (o `Outlet`
 * daquele layout) dentro de `AppScreenFrame`.
 */
export const Artefatos: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'screen-artefatos', kind: 'screens', viewport: { width: 1440, height: 900 } },
	},
	render: () => (
		<AppScreenFrame>
			<div className="mx-auto flex w-full flex-col px-6 gap-2 h-full">
				<SessionHeader threadId={THREAD} />
				<ArtifactsSection threadId={THREAD} />
			</div>
		</AppScreenFrame>
	),
}
