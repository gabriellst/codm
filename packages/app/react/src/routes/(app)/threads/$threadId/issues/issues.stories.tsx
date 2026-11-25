import type { Meta, StoryObj } from '@storybook/react'
import {
	getHomeDashboardQueryOptions,
	getIssuesOverviewQueryOptions,
	getNeedsYouPanelQueryOptions,
	getSessionChatQueryOptions,
	getSessionIssuesQueryOptions,
	getSettingsQueryOptions,
	listArtifactsQueryOptions,
	listWorkspacesQueryOptions,
} from '@codm/client-typescript/typescript'
import type {
	GetHomeDashboardQueryResponse,
	GetIssuesOverviewQueryResponse,
	GetNeedsYouPanelQueryResponse,
	GetSessionChatQueryResponse,
	GetSessionIssuesQueryResponse,
	GetSettingsQueryResponse,
	IssueLifeState,
	IssueStatus,
	ListArtifactsQueryResponse,
	ListWorkspacesQueryResponse,
} from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { AppScreenFrame, connected, mockQuery } from '@/storybook'
import { SessionHeader } from '../-components/SessionHeader'
import { SessionIssuesSection } from '../-components/SessionIssuesSection'

// P2 — área Conversa: Tarefas da conversa, em kanban (slug screen-tarefas-da-conversa).

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
const sessionIssuesOpts = getSessionIssuesQueryOptions(THREAD)

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
 * P2 (24/11, screen unfrozen by decision 2 of `.specs/2026-11-24-tarefa-e-painel-design.md`) — content
 * REPRODUCED from the PROPOSTA frame's "P2 · Tarefas da conversa em kanban" (`design/codm.pen`): the five open
 * columns with the pen's fictitious tasks, the decision D1 open on APP-12, two artifacts on APP-14, a retry
 * on APP-09, an escalation on APP-11 and a pause on APP-08. Done tasks sit behind "Concluídas · N".
 */
const issue = (n: number, key: string, title: string, status: IssueStatus, lifeState: IssueLifeState, extra: object = {}) => ({
	issueId: `019e4d24-6524-7041-9e1c-8108180cdd${String(40 + n)}`,
	key,
	title,
	status,
	lifeState,
	paused: false,
	archived: false,
	...extra,
})
const SESSION_ISSUES: DeepPartial<GetSessionIssuesQueryResponse> = {
	statsLine: { awaitingInput: 2, working: 8, completed: 1 },
	groups: [
		{
			status: 'NEEDS_INPUT',
			items: [
				issue(0, 'APP-12', 'Botão de cupom some no iPhone SE', 'NEEDS_INPUT', 'WAITING_PERSON'),
				issue(1, 'APP-10', 'Migrar cupons antigos', 'NEEDS_INPUT', 'WAITING_PERSON'),
			],
		},
		{
			status: 'WORKING',
			items: [
				issue(2, 'APP-16', 'Traduzir e-mails de carrinho abandonado', 'WORKING', 'QUEUED'),
				issue(3, 'APP-17', 'Ajustar banner da Black Friday', 'WORKING', 'QUEUED'),
				issue(4, 'APP-14', 'Página de frete grátis acima de R$ 199', 'WORKING', 'RUNNING'),
				issue(5, 'APP-13', 'Corrigir ordenação da busca', 'WORKING', 'RUNNING'),
				issue(6, 'APP-15', 'Relatório semanal de vendas', 'WORKING', 'WAITING_PROVIDER', {
					waitingForProviderUntil: '2026-11-24T17:00:00.000Z',
				}),
				issue(7, 'APP-09', 'Revisar textos do app', 'WORKING', 'WAITING_RETRY', { retryingAt: '2026-11-24T13:52:00.000Z' }),
				issue(8, 'APP-11', 'Integração Pix — sandbox fora do ar', 'WORKING', 'STALLED', { escalatedAt: minutesAgo(30) }),
				issue(9, 'APP-08', 'Export de pedidos em CSV', 'WORKING', 'PAUSED', { paused: true }),
			],
		},
		{ status: 'COMPLETED', items: [issue(10, 'APP-07', 'Favicon novo', 'COMPLETED', 'DONE')] },
	],
	archived: [],
}

const NEEDS_YOU: DeepPartial<GetNeedsYouPanelQueryResponse> = {
	stops: [
		{
			stopId: '019e4d24-6524-7041-9e1c-8108180cddc1',
			issueId: '019e4d24-6524-7041-9e1c-8108180cdd40',
			issueKey: 'APP-12',
			kind: 'DECISION_REQUESTED',
			title: 'Publicar o ajuste',
			detail: '',
			raisedAt: minutesAgo(8),
			availableResolutions: [],
			ask: {
				kind: 'DECISION_REQUESTED',
				code: 'D1',
				question: 'publico agora ou no fim do dia?',
				reply: { kind: 'OPTION', options: [{ id: 'now', label: 'Publicar agora' }] },
				releaseRequired: true,
			},
		},
	],
}

const ARTIFACTS: DeepPartial<ListArtifactsQueryResponse> = {
	artifacts: [
		{
			artifactId: 'a-1',
			issueId: '019e4d24-6524-7041-9e1c-8108180cdd44',
			kind: 'LINK',
			name: 'Prévia',
			ref: 'https://preview.local',
			meta: '',
			recordedAt: minutesAgo(5),
		},
		{
			artifactId: 'a-2',
			issueId: '019e4d24-6524-7041-9e1c-8108180cdd44',
			kind: 'FILE',
			name: 'frete.png',
			ref: '/tmp/frete.png',
			meta: '',
			recordedAt: minutesAgo(4),
		},
	],
}

const meta = {
	title: 'Conversa/Tarefas',
	component: SessionIssuesSection,
	args: { threadId: THREAD },
	parameters: connected({
		route: { id: '/(app)/threads/$threadId/issues/' },
		msw: {
			handlers: [
				// FIRST: `mockQuery` matches `*<url>`, so the sidebar's `*/issues` would also answer `/threads/:id/issues`.
				mockQuery(sessionIssuesOpts, SESSION_ISSUES),
				mockQuery(dashboardOpts, SIDEBAR_DASHBOARD),
				mockQuery(workspacesOpts, SIDEBAR_WORKSPACES),
				mockQuery(issuesOverviewOpts, SIDEBAR_ISSUES_OVERVIEW),
				mockQuery(settingsOpts, SIDEBAR_SETTINGS),
				mockQuery(sessionChatOpts, SESSION_CHAT),
				mockQuery(getNeedsYouPanelQueryOptions(THREAD), NEEDS_YOU),
				mockQuery(listArtifactsQueryOptions(THREAD), ARTIFACTS),
			],
		},
	}),
} satisfies Meta<typeof SessionIssuesSection>
export default meta

type Story = StoryObj<typeof meta>

/**
 * `screen-tarefas-da-conversa` — a aba "Tarefas" de UMA conversa, em kanban pelo estado vivo, com a nota de
 * auto-arquivamento. Renderiza a composição REAL da rota: `SessionHeader` (masthead + abas, mora no
 * `route.tsx` pai) + `SessionIssuesSection` (o `Outlet` daquele layout) dentro de `AppScreenFrame`.
 */
export const TarefasDaConversa: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'screen-tarefas-da-conversa', kind: 'screens', viewport: { width: 1440, height: 900 } },
	},
	render: () => (
		<AppScreenFrame>
			<div className="mx-auto flex w-full flex-col px-6 gap-2 h-full">
				<SessionHeader threadId={THREAD} />
				<SessionIssuesSection threadId={THREAD} />
			</div>
		</AppScreenFrame>
	),
}
