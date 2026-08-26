import type { Meta, StoryObj } from '@storybook/react'
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
import { AppScreenFrame, connected, mockQuery } from '@/storybook'
import { ChannelsSection } from './-components/ChannelsSection'

// A4 (F3-waveA) — área Projetos & Canais: Canais (lista com WhatsApp conectado).
// Fonte: design/fidelity/targets/screens/canais-group.png +
// design/system/pen/screens/canais-group.json.

const now = Date.now()
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60_000).toISOString()

const dashboardOpts = getHomeDashboardQueryOptions()
const workspacesOpts = listWorkspacesQueryOptions()
const issuesOpts = getIssuesOverviewQueryOptions()
const settingsOpts = getSettingsQueryOptions()

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/canais-group.png` +
 * `design/system/pen/screens/canais-group.json`: WhatsApp connected ("Conectado" chip + quiet
 * status text), sidebar shows "Projetos 3 · Tarefas 0 · Canais 1" and one "DEMO SHOP BOT"
 * conversation — same background data shape as `dashboard.stories.tsx`/`thread.stories.tsx`.
 */
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

const meta = {
	title: 'Channels/Channels',
	component: ChannelsSection,
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
} satisfies Meta<typeof ChannelsSection>
export default meta

type Story = StoryObj<typeof meta>

/**
 * `canais-group` — the channel list with WhatsApp connected, measured against
 * `design/fidelity/targets/screens/canais-group.png` via `bun fidelity`. Renders the ROUTE'S REAL
 * composition: `ChannelsSection` (what `routes/(app)/channels/index.tsx` mounts) inside
 * `AppScreenFrame`.
 *
 * The target originally showed FOUR rows — WhatsApp, Instagram Direct, Telegram, E-mail (IMAP) —
 * all "coming soon" except WhatsApp. Founder decision (2026-08-25): marketing is WhatsApp-only;
 * Instagram and Telegram stay as VISIBLE "coming soon" rows (no Discord, no Slack), E-mail (IMAP)
 * is dropped entirely. The wire contract's `ChannelKind` enum (`@codm/client-typescript/typescript`)
 * still only has `WHATSAPP` and `INTERNAL` — Instagram/Telegram are NOT enum members and never
 * reach the connect flow. They render purely presentationally from `COMING_SOON_CHANNELS`
 * (`@/components/console/glyphs.tsx`), which `ChannelsSection` appends after the real (enum-backed)
 * channel rows. This story renders the ROUTE'S REAL composition: one connectable WhatsApp row plus
 * the two inert Instagram/Telegram rows.
 */
export const List: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'canais-group', kind: 'screens', viewport: { width: 1440, height: 900 } },
	},
	render: () => (
		<AppScreenFrame>
			<ChannelsSection />
		</AppScreenFrame>
	),
}
