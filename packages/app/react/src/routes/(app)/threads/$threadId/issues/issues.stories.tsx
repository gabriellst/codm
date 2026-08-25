import type { Meta, StoryObj } from '@storybook/react'
import {
	getHomeDashboardQueryOptions,
	getIssuesOverviewQueryOptions,
	getSessionChatQueryOptions,
	getSessionIssuesQueryOptions,
	getSettingsQueryOptions,
	listWorkspacesQueryOptions,
} from '@codm/client-typescript/typescript'
import type {
	GetHomeDashboardQueryResponse,
	GetIssuesOverviewQueryResponse,
	GetSessionChatQueryResponse,
	GetSessionIssuesQueryResponse,
	GetSettingsQueryResponse,
	ListWorkspacesQueryResponse,
} from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { AppScreenFrame, connected, mockQuery } from '@/storybook'
import { SessionHeader } from '../-components/SessionHeader'
import { SessionIssuesSection } from '../-components/SessionIssuesSection'

// A2 (F3-waveA) — área Conversa: Tarefas da conversa.
// Fontes: design/fidelity/targets/screens/screen-tarefas-da-conversa.png +
// design/system/pen/screens/screen-tarefas-da-conversa.json.

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
 * `GetSessionIssues` content REPRODUZIDO verbatim do alvo: "2 aguardando entrada · 2 em andamento ·
 * 1 concluída", os grupos "Precisa de entrada" (invoice-500, mobile-nav), "Em andamento"
 * (pix-payment, checkout-timeout) e "Concluída" (coupon-focus) — `coupon-focus` entra em
 * `groups` com `status: 'COMPLETED'` (não em `archived`), porque o título de seção que o alvo
 * mostra é exatamente `enumLabel('IssueStatus', 'COMPLETED')` = "Concluída"; `archived` renderiza
 * sob "Arquivadas" (`t('session.archived')`), um rótulo que o alvo não usa aqui.
 *
 * GAP (não fabricado, já documentado no componente): o alvo mostra "há 6 min"/"há 22 min"/… ao lado
 * de cada issue ativa. `IssueRowItem` (components/console/IssueRow.tsx) não tem esse campo — o
 * próprio docblock do componente já registra a ausência ("no backing field on either
 * GetIssuesOverview/GetSessionIssues … flagged as a pending backend gap rather than invented
 * client-side"). O mock abaixo não inclui nenhum "when" fabricado — reproduz só o que a wire e o
 * componente sabem carregar (key/title/status).
 */
const SESSION_ISSUES: DeepPartial<GetSessionIssuesQueryResponse> = {
	statsLine: { awaitingInput: 2, working: 2, completed: 1 },
	groups: [
		{
			status: 'NEEDS_INPUT',
			items: [
				{
					issueId: '019e4d24-6524-7041-9e1c-8108180cdd40',
					key: 'invoice-500',
					title: 'Erro 500 ao gerar a fatura do cliente Acme',
					status: 'NEEDS_INPUT',
					archived: false,
				},
				{
					issueId: '019e4d24-6524-7041-9e1c-8108180cdd41',
					key: 'mobile-nav',
					title: 'Menu não abre no iPhone — falta a versão do iOS',
					status: 'NEEDS_INPUT',
					archived: false,
				},
			],
		},
		{
			status: 'WORKING',
			items: [
				{
					issueId: '019e4d24-6524-7041-9e1c-8108180cdd42',
					key: 'pix-payment',
					title: 'Provedor Pix atrás de feature flag',
					status: 'WORKING',
					archived: false,
				},
				{
					issueId: '019e4d24-6524-7041-9e1c-8108180cdd43',
					key: 'checkout-timeout',
					title: 'Timeout no checkout acima de 8 itens',
					status: 'WORKING',
					archived: false,
				},
			],
		},
		{
			status: 'COMPLETED',
			items: [
				{
					issueId: '019e4d24-6524-7041-9e1c-8108180cdd44',
					key: 'coupon-focus',
					title: 'Campo de cupom perdia o foco no mobile',
					status: 'COMPLETED',
					archived: false,
				},
			],
		},
	],
	archived: [],
}

const meta = {
	title: 'Conversa/Tarefas',
	component: SessionIssuesSection,
	args: { threadId: THREAD },
	parameters: connected({
		route: { id: '/(app)/threads/$threadId/issues/' },
		msw: {
			handlers: [
				mockQuery(dashboardOpts, SIDEBAR_DASHBOARD),
				mockQuery(workspacesOpts, SIDEBAR_WORKSPACES),
				mockQuery(issuesOverviewOpts, SIDEBAR_ISSUES_OVERVIEW),
				mockQuery(settingsOpts, SIDEBAR_SETTINGS),
				mockQuery(sessionChatOpts, SESSION_CHAT),
				mockQuery(sessionIssuesOpts, SESSION_ISSUES),
			],
		},
	}),
} satisfies Meta<typeof SessionIssuesSection>
export default meta

type Story = StoryObj<typeof meta>

/**
 * `screen-tarefas-da-conversa` — a aba "Tarefas" de UMA conversa, agrupada por status com a nota de
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
