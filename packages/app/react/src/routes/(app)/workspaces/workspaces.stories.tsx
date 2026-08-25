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
import { WorkspacesSection } from './-components/WorkspacesSection'

// A4 (F3-waveA) — área Projetos & Canais: Projetos (lista cheia).
// Fonte: design/fidelity/targets/screens/projetos-group.png +
// design/system/pen/screens/projetos-group.json.
//
// NOTA de nomenclatura: o `.pen` chama esta área "Projetos"; o código (rotas, i18n, componentes)
// chama o mesmo conceito "Espaços de trabalho" (`workspaces.*`). A nomenclatura do CÓDIGO é a
// verdade do código — esta story usa os textos REAIS que `WorkspacesSection` renderiza via `t()`
// (ex.: "Espaços de trabalho", não "Projetos"). O delta de copy fica para a triagem do
// orquestrador, não é corrigido aqui.

const now = Date.now()
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60_000).toISOString()

const dashboardOpts = getHomeDashboardQueryOptions()
const workspacesOpts = listWorkspacesQueryOptions()
const issuesOpts = getIssuesOverviewQueryOptions()
const settingsOpts = getSettingsQueryOptions()

// `AppScreenFrame` always draws the REAL `Sidebar` (`sidebar` defaults `true`), and `Sidebar` owns
// its own reads (`useGetHomeDashboard`/`useListWorkspaces`/`useGetIssuesOverview`/`useGetSettings`)
// — every connected story under this frame mocks the same four, or the rail renders its skeleton
// forever (same pattern as `dashboard.stories.tsx`/`thread.stories.tsx`). Content reproduced from
// the target: sidebar shows "Projetos 3 · Tarefas 0 · Canais 1" and one "DEMO SHOP BOT" conversation.
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
const ISSUES_OVERVIEW: DeepPartial<GetIssuesOverviewQueryResponse> = {
	statsLine: { awaitingInput: 0, working: 0, completed: 0, archived: 0 },
	groups: [],
}
const SETTINGS: DeepPartial<GetSettingsQueryResponse> = { appVersion: '0.1.0' }

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/projetos-group.png` +
 * `design/system/pen/screens/projetos-group.json` (foto-fixture principle — names/paths/badges/
 * counts copied, never invented — EXCEPT the example project names: fixture-name divergence —
 * target PNGs show real project/person names, replaced by synthetic fixtures (founder, 2026-08-25);
 * close the divergence by re-exporting the design targets): three project folders — "acme"
 * (Projeto Claude only, 0 conversa), "aurora-labs" (git + Projeto Claude, 1 conversa), "codedm" (git + Projeto Claude, 0
 * conversa). The target's "codedm" path is shown PRE-TRUNCATED by the design tool itself
 * ("/Users/work/…/pessoal/codedm", literal ellipsis baked into the exported node) — reproducing
 * that cut would be fabricating a value; the mock carries the REAL full path
 * ("/Users/work/Desktop/Projetos/pessoal/codedm") and lets the component's own `truncate` CSS
 * clip it, same as the design's own rendering pipeline did.
 */
const WORKSPACES: DeepPartial<ListWorkspacesQueryResponse> = {
	workspaces: [
		{
			workspaceId: 'ws-1',
			path: '/Users/work/Desktop/Projetos/acme',
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

const meta = {
	title: 'Workspaces/Workspaces',
	component: WorkspacesSection,
	parameters: connected({
		route: { id: '/(app)/workspaces/' },
		msw: {
			handlers: [
				mockQuery(dashboardOpts, DASHBOARD),
				mockQuery(workspacesOpts, WORKSPACES),
				mockQuery(issuesOpts, ISSUES_OVERVIEW),
				mockQuery(settingsOpts, SETTINGS),
			],
		},
	}),
} satisfies Meta<typeof WorkspacesSection>
export default meta

type Story = StoryObj<typeof meta>

/**
 * `projetos-group` — the loaded project-folder grid: three cards + the trailing dashed
 * "Adicionar pasta" tile, measured against `design/fidelity/targets/screens/projetos-group.png`
 * via `bun fidelity`. Renders the ROUTE'S REAL composition: `WorkspacesSection` (what
 * `routes/(app)/workspaces/index.tsx` mounts) inside `AppScreenFrame` (title bar + real `Sidebar`).
 */
export const List: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'projetos-group', kind: 'screens', viewport: { width: 1440, height: 900 } },
	},
	render: () => (
		<AppScreenFrame>
			<WorkspacesSection />
		</AppScreenFrame>
	),
}
