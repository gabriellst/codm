import type { Meta, StoryObj } from '@storybook/react'
import {
	detectProvidersQueryOptions,
	getHomeDashboardQueryOptions,
	getIssuesOverviewQueryOptions,
	getSettingsQueryOptions,
	listWorkspacesQueryOptions,
} from '@codm/client-typescript/typescript'
import type {
	DetectProvidersQueryResponse,
	GetHomeDashboardQueryResponse,
	GetIssuesOverviewQueryResponse,
	GetSettingsQueryResponse,
	ListWorkspacesQueryResponse,
} from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { AppScreenFrame, connected, mockQuery } from '@/storybook'
import { SettingsSection } from './-components/SettingsSection'

// A5 (F3-waveA) — área Tarefas, Configurações & Conta: Configurações.
// Fontes: design/fidelity/targets/screens/configuracoes-wrapper.png +
// design/system/pen/screens/configuracoes-wrapper.json.

const dashboardOpts = getHomeDashboardQueryOptions()
const workspacesOpts = listWorkspacesQueryOptions()
const issuesOpts = getIssuesOverviewQueryOptions()
const settingsOpts = getSettingsQueryOptions()
const providersOpts = detectProvidersQueryOptions()

const now = Date.now()
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60_000).toISOString()

/**
 * `AppScreenFrame` always draws the REAL `Sidebar`, which owns its own reads
 * (`useGetHomeDashboard`/`useListWorkspaces`/`useGetIssuesOverview`/`useGetSettings`) — same dedup
 * story as `dashboard.stories.tsx`/`thread.stories.tsx`/`issues.stories.tsx`. Content REPRODUCED from
 * `configuracoes-wrapper.png`: sidebar shows "Projetos 3 · Tarefas 0 · Canais 1" and one "DEMO SHOP BOT"
 * conversation.
 */
const SIDEBAR_DASHBOARD: DeepPartial<GetHomeDashboardQueryResponse> = {
	threads: [
		{
			threadId: 'thread-demo-bot',
			displayName: 'DEMO SHOP BOT',
			channelId: 'channel-1',
			externalId: '5511900000005',
			hasAvatar: false,
			channelKind: 'WHATSAPP',
			workspacePath: '/workspaces/demo-shop',
			providers: ['CLAUDE_CODE'],
			status: 'IDLE',
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
const SIDEBAR_ISSUES: DeepPartial<GetIssuesOverviewQueryResponse> = {
	statsLine: { awaitingInput: 0, working: 0, completed: 0, archived: 0 },
	groups: [],
	archived: [],
}
// GeneralSection's "Versão do app" row AND the sidebar's own version line read this same
// `useGetSettings()` query — the target's rail shows the literal unresolved Pencil binding
// "$app-version" (armadilha 37: falha de autoria do alvo, same class already handled in
// `dashboard.stories.tsx`/`thread.stories.tsx` with `'0.1.0'`); this screen's own "Geral" section shows
// the resolved value "v1.4.2", which is what both consumers get here.
const SETTINGS: DeepPartial<GetSettingsQueryResponse> = {
	appVersion: 'v1.4.2',
	general: {
		dataDir: '/Users/work/Library/Application Support/app.codm.desktop/data',
	},
}

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/configuracoes-wrapper.png` ("Provedores de
 * agentes"): Claude Code (detected, `/Users/work/.local/bin/claude · v2.1.227 (Claude Code)`), Codex
 * (coming soon, `/Users/work/.local/bin/codex · vcodex-cli 0.140.0`), OpenCode (coming soon,
 * `/opt/homebrew/bin/opencode · v1.18.5`) — `binaryPath`/`version` copied verbatim from the target;
 * `providerLabel`/`providerGlyph` (component-owned maps) supply the name + icon per `ProviderKind`.
 */
const PROVIDERS: DeepPartial<DetectProvidersQueryResponse> = {
	providers: [
		{
			name: 'CLAUDE_CODE',
			status: 'DETECTED',
			binaryPath: '/Users/work/.local/bin/claude',
			version: '2.1.227 (Claude Code)',
			comingSoon: false,
		},
		{ name: 'CODEX', status: 'DETECTED', binaryPath: '/Users/work/.local/bin/codex', version: 'codex-cli 0.149.1', comingSoon: false },
		{ name: 'OPENCODE', status: 'DETECTED', binaryPath: '/opt/homebrew/bin/opencode', version: '1.18.5', comingSoon: true },
	],
}

const meta = {
	title: 'Settings/General',
	component: SettingsSection,
	parameters: connected({
		route: { id: '/(app)/settings/' },
		msw: {
			handlers: [
				mockQuery(providersOpts, PROVIDERS),
				mockQuery(settingsOpts, SETTINGS),
				mockQuery(dashboardOpts, SIDEBAR_DASHBOARD),
				mockQuery(workspacesOpts, SIDEBAR_WORKSPACES),
				mockQuery(issuesOpts, SIDEBAR_ISSUES),
			],
		},
	}),
} satisfies Meta<typeof SettingsSection>
export default meta

type Story = StoryObj<typeof meta>

/**
 * `configuracoes-wrapper` — "Provedores de agentes" (3 rows, "Reescanear" action) → "Telemetria"
 * (toggle ON, `useTelemetryConsentStore` defaults `enabled: true`, matches the target's green switch
 * with no story-level store override needed) → "Geral" (Versão do app / Diretório de dados).
 */
export const Default: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'configuracoes-wrapper', kind: 'screens', viewport: { width: 1440, height: 900 } },
	},
	render: () => (
		<AppScreenFrame>
			<SettingsSection />
		</AppScreenFrame>
	),
}
