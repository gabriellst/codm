import type { Meta, StoryObj } from '@storybook/react'
import {
	getHomeDashboardQueryOptions,
	getIssuesOverviewQueryOptions,
	getNeedsYouPanelQueryOptions,
	getSessionChatQueryOptions,
	getSettingsQueryOptions,
	listArtifactsQueryOptions,
	listWorkspacesQueryOptions,
} from '@codm/client-typescript/typescript'
import type {
	GetHomeDashboardQueryResponse,
	GetIssuesOverviewQueryResponse,
	GetNeedsYouPanelQueryResponse,
	GetSessionChatQueryResponse,
	GetSettingsQueryResponse,
	ListArtifactsQueryResponse,
	ListWorkspacesQueryResponse,
} from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { AppScreenFrame, connected, mockQuery } from '@/storybook'
import { SessionHeader } from './-components/SessionHeader'
import { SessionChatSection } from './-components/SessionChatSection'

// A2 (F3-waveA) — área Conversa: Chat — resposta direta / Chat — pausada, sussurro.
// Fontes: design/fidelity/targets/screens/screen-chat-{resposta-direta,pausada-sussurro}.png +
// design/system/pen/screens/screen-chat-{resposta-direta,pausada-sussurro}.json.

const THREAD = '019e4d24-6524-7041-9e1c-8108180cdd10'
const CHANNEL = '019e4d24-6524-7041-9e1c-8108180cdd11'
const ISSUE_COUPON_FOCUS = '019e4d24-6524-7041-9e1c-8108180cdd12'

const now = Date.now()
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString()
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60_000).toISOString()

const dashboardOpts = getHomeDashboardQueryOptions()
const workspacesOpts = listWorkspacesQueryOptions()
const issuesOverviewOpts = getIssuesOverviewQueryOptions()
const settingsOpts = getSettingsQueryOptions()
const sessionChatOpts = getSessionChatQueryOptions(THREAD)
const needsYouOpts = getNeedsYouPanelQueryOptions(THREAD)
const artifactsOpts = listArtifactsQueryOptions(THREAD)

// `AppScreenFrame` always draws the REAL `Sidebar` (`sidebar` defaults `true`), and `Sidebar` owns
// its own reads (`useGetHomeDashboard`/`useListWorkspaces`/`useGetIssuesOverview`/`useGetSettings`,
// same dedup story as `dashboard.stories.tsx`) — every connected story under this frame mocks the
// same four, or the rail renders its skeleton forever. Content reproduced from the target: sidebar
// shows "Projetos 3 · Tarefas 0 · Canais 1" and one "DEMO SHOP BOT" conversation, on every screen of
// this area.
const SIDEBAR_DASHBOARD = (status: GetSessionChatQueryResponse['thread']['status']): DeepPartial<GetHomeDashboardQueryResponse> => ({
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
			status,
			lastActivity: hoursAgo(10),
		},
	],
	channels: [{ kind: 'WHATSAPP', status: 'CONNECTED' }],
})
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

// Transcript content REPRODUCED verbatim from the target/spec (foto-fixture principle — text/names/
// timestamps copied, never invented): Diego Martins' report at 12:04, the "classificada → tarefa
// coupon-focus · sessão de terminal aberta" action line, the agent's two SYSTEM replies (12:06,
// 12:12) with the `coupon-focus · Claude Code` issue chip on the first, the whisper at 12:07, Thiago
// Barros' "Valeuuu" at 12:12, and the closing "tarefa coupon-focus concluída" action line.
//
// GAP (não fabricado): o design mostra a chip do primeiro balão do agente como "coupon-focus ·
// Claude Code" (a KEY da issue). `TranscriptBubble` (index.tsx) só sabe desenhar `t('session.
// transcriptIssue')` ("tarefa") + o nome do provider — `GetSessionChat.transcript[].issueId` é um
// uuid, sem `issueKey` no DTO. O mock abaixo seta `issueId`/`provider` (o que o componente sabe
// renderizar); o texto "coupon-focus" do alvo fica de fora — dado que existe no wire (Issue.key,
// via GetSessionIssues) mas não neste DTO. Caminho de correção: expor `issueKey` em
// `GetSessionChat.transcript[]` (resposta 2 da doutrina "quando o alvo pede um dado que o contrato
// não tem").
//
// GAP (não fabricado): o design NÃO repete a legenda/chip acima de mensagens consecutivas do mesmo
// agente (a segunda bolha "Pronto. Enviei fix/coupon-focus…" não carrega label nenhum) nem acima do
// sussurro — grouping de mensagens consecutivas. `TranscriptBubble` sempre desenha uma legenda por
// entrada (issue-link condicional + `caption` incondicional) — não há suporte a "colapsar" a legenda
// quando o remetente se repete. A story reproduz o CONTEÚDO real (o componente vai desenhar uma
// legenda "Claude Code"/"Sussurro" que o alvo omite) — divergência estrutural, não de dado.
const TRANSCRIPT: DeepPartial<GetSessionChatQueryResponse>['transcript'] = [
	{
		entryId: '019e4d24-6524-7041-9e1c-8108180cdd20',
		kind: 'CONTACT',
		text: 'o campo de cupom quebrou no mobile, dá uma olhada?',
		at: minutesAgo(30),
		sender: { channelId: CHANNEL, externalId: '5511900000001', displayName: 'Diego Martins', hasAvatar: false },
	},
	{
		entryId: '019e4d24-6524-7041-9e1c-8108180cdd21',
		kind: 'ACTION',
		text: 'classificada → tarefa coupon-focus · sessão de terminal aberta',
		at: minutesAgo(29),
	},
	{
		entryId: '019e4d24-6524-7041-9e1c-8108180cdd22',
		kind: 'SYSTEM',
		provider: 'CLAUDE_CODE',
		issueId: ISSUE_COUPON_FOCUS,
		text: 'Achei — o input remonta a cada tecla e perde o foco. Corrigindo agora.',
		at: minutesAgo(24),
	},
	{
		entryId: '019e4d24-6524-7041-9e1c-8108180cdd23',
		kind: 'WHISPER',
		text: 'não mexe no histórico do git, só abre o PR',
		at: minutesAgo(23),
	},
	{
		entryId: '019e4d24-6524-7041-9e1c-8108180cdd24',
		kind: 'SYSTEM',
		provider: 'CLAUDE_CODE',
		text: 'Pronto. Enviei fix/coupon-focus — o preview já está no ar.',
		at: minutesAgo(18),
	},
	{
		entryId: '019e4d24-6524-7041-9e1c-8108180cdd25',
		kind: 'CONTACT',
		text: 'Valeuuu',
		at: minutesAgo(17),
		sender: { channelId: CHANNEL, externalId: '5511900000003', displayName: 'Thiago Barros', hasAvatar: false },
	},
	{
		entryId: '019e4d24-6524-7041-9e1c-8108180cdd26',
		kind: 'ACTION',
		text: 'tarefa coupon-focus concluída',
		at: minutesAgo(16),
	},
]

const meta = {
	title: 'Conversa/Chat',
	component: SessionChatSection,
	args: { threadId: THREAD },
	parameters: connected({ route: { id: '/(app)/threads/$threadId/' } }),
} satisfies Meta<typeof SessionChatSection>
export default meta

type Story = StoryObj<typeof meta>

/**
 * `screen-chat-resposta-direta` — agente RUNNING, composer em modo DIRETO (`composerMode: 'DIRECT'`),
 * sem stop ativo (`NeedsYouPanel` não renderiza nada — `stops: []`). Renderiza a composição REAL da
 * rota: `SessionHeader` (masthead + abas, mora no `route.tsx` pai) + `SessionChatSection` (o
 * `Outlet` daquele layout) dentro de `AppScreenFrame`.
 */
export const RespostaDireta: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'screen-chat-resposta-direta', kind: 'screens', viewport: { width: 1440, height: 900 } },
		msw: {
			handlers: [
				mockQuery(dashboardOpts, SIDEBAR_DASHBOARD('RUNNING')),
				mockQuery(workspacesOpts, SIDEBAR_WORKSPACES),
				mockQuery(issuesOverviewOpts, SIDEBAR_ISSUES_OVERVIEW),
				mockQuery(settingsOpts, SIDEBAR_SETTINGS),
				mockQuery(needsYouOpts, { stops: [] } satisfies DeepPartial<GetNeedsYouPanelQueryResponse>),
				mockQuery(artifactsOpts, { artifacts: [] } satisfies DeepPartial<ListArtifactsQueryResponse>),
				mockQuery(sessionChatOpts, {
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
						lastActivity: minutesAgo(16),
					},
					paused: false,
					mentionGate: { enabled: true, tag: '@aurora' },
					activeStops: [],
					transcript: TRANSCRIPT,
					composerMode: 'DIRECT',
				} satisfies DeepPartial<GetSessionChatQueryResponse>),
			],
		},
	},
	render: () => (
		<AppScreenFrame>
			<div className="mx-auto flex w-full flex-col px-6 gap-2 h-full">
				<SessionHeader threadId={THREAD} />
				<SessionChatSection threadId={THREAD} />
			</div>
		</AppScreenFrame>
	),
}

/**
 * `screen-chat-pausada-sussurro` — agente PAUSADO, composer em modo SUSSURRO (`composerMode:
 * 'STEER'`, derivado de `paused: true`). Um stop ativo alimenta `NeedsYouPanel`.
 *
 * GAP (não fabricado): o alvo desenha o "Stop Alert" como UMA linha condensada — título em negrito
 * ("O agente parou e está aguardando") + subtítulo com os kinds unidos ("Aprovação necessária · Erro
 * de servidor") + Negar/Aprovar inline — o MESMO padrão visual do `NeedsYouCallout` do dashboard
 * (`dashboard/-components/HomeDashboard/index.tsx`, `needsYou.stopKinds.map(...).join(' · ')`).
 * `NeedsYouPanel` (o componente que esta rota realmente monta) é uma superfície DIFERENTE: cabeçalho
 * "Precisa de você N" + `t('session.agentStopped')` à direita, então uma LISTA de `StopRow` (badge do
 * kind + title + detail + horário + botões) — um stop por linha, não uma linha condensada. O mock
 * abaixo reproduz os DOIS textos visíveis no alvo nos dois campos que `StopRow` sabe desenhar
 * (`title`/`detail`) e usa `availableResolutions: ['DENY','APPROVE']` para os mesmos rótulos
 * Negar/Aprovar — mas o layout renderizado (badge "Aprovação necessária" + linha própria) diverge
 * estruturalmente do banner condensado do alvo. Divergência de COMPONENTE, não de dado disponível;
 * decisão de unificar os dois padrões (callout vs. panel) é do orquestrador/founder.
 */
export const PausadaSussurro: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'screen-chat-pausada-sussurro', kind: 'screens', viewport: { width: 1440, height: 900 } },
		msw: {
			handlers: [
				mockQuery(dashboardOpts, SIDEBAR_DASHBOARD('PAUSED')),
				mockQuery(workspacesOpts, SIDEBAR_WORKSPACES),
				mockQuery(issuesOverviewOpts, SIDEBAR_ISSUES_OVERVIEW),
				mockQuery(settingsOpts, SIDEBAR_SETTINGS),
				mockQuery(artifactsOpts, { artifacts: [] } satisfies DeepPartial<ListArtifactsQueryResponse>),
				mockQuery(needsYouOpts, {
					stops: [
						{
							stopId: '019e4d24-6524-7041-9e1c-8108180cdd30',
							kind: 'APPROVAL_NEEDED',
							title: 'O agente parou e está aguardando',
							detail: 'Aprovação necessária · Erro de servidor',
							raisedAt: minutesAgo(4),
							availableResolutions: ['DENY', 'APPROVE'],
						},
					],
				} satisfies DeepPartial<GetNeedsYouPanelQueryResponse>),
				mockQuery(sessionChatOpts, {
					thread: {
						threadId: THREAD,
						displayName: 'DEMO SHOP BOT',
						channelId: CHANNEL,
						externalId: '5511900000005',
						hasAvatar: false,
						channelKind: 'WHATSAPP',
						workspacePath: '/Users/work/Desktop/Projetos/aurora-labs',
						providers: ['CLAUDE_CODE'],
						status: 'PAUSED',
						lastActivity: minutesAgo(16),
					},
					paused: true,
					mentionGate: { enabled: true, tag: '@aurora' },
					activeStops: [],
					transcript: TRANSCRIPT,
					composerMode: 'STEER',
				} satisfies DeepPartial<GetSessionChatQueryResponse>),
			],
		},
	},
	render: () => (
		<AppScreenFrame>
			<div className="mx-auto flex w-full flex-col px-6 gap-2 h-full">
				<SessionHeader threadId={THREAD} />
				<SessionChatSection threadId={THREAD} />
			</div>
		</AppScreenFrame>
	),
}
