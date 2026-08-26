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
import { IssuesOverviewSection } from './-components/IssuesOverviewSection'

// A5 (F3-waveA) — área Tarefas, Configurações & Conta: Tarefas · Tarefas Arquivadas · Tarefas Vazio.
// Fontes: design/fidelity/targets/screens/tarefas-{wrapper,arquivadas-wrapper,vazio-wrapper}.png +
// design/system/pen/screens/tarefas-{wrapper,arquivadas-wrapper,vazio-wrapper}.json.

const dashboardOpts = getHomeDashboardQueryOptions()
const workspacesOpts = listWorkspacesQueryOptions()
const issuesOpts = getIssuesOverviewQueryOptions()
const settingsOpts = getSettingsQueryOptions()

const now = Date.now()
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60_000).toISOString()

/**
 * `AppScreenFrame` always draws the REAL `Sidebar` (`sidebar` defaults `true`), and `Sidebar` owns its
 * own reads (`useGetHomeDashboard`/`useListWorkspaces`/`useGetIssuesOverview`/`useGetSettings`, same
 * dedup story as `dashboard.stories.tsx`/`thread.stories.tsx`) — every connected story under this frame
 * mocks the same four, or the rail renders its skeleton forever. Content reproduced from all 3 targets
 * of this file: sidebar shows "Projetos 3 · Canais 1" and one "DEMO SHOP BOT" conversation on every
 * screen; "Tarefas" badge count varies per story (12 on `tarefas-wrapper`/`tarefas-arquivadas-wrapper`,
 * matching `statsLine.awaitingInput + working + completed` — `Sidebar` excludes `archived` from the
 * count).
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
// Sidebar's own version line + `GeneralSection`'s "Versão do app" row (Configurações/Minha Conta
// stories, same query) both read `settings.appVersion` — the target's rail shows the literal
// unresolved Pencil binding "$app-version" (armadilha 37: falha de autoria do alvo, mesma classe já
// tratada em `dashboard.stories.tsx`/`thread.stories.tsx` com `'0.1.0'`); this file's own Configurações
// target shows the resolved value "v1.4.2" in `GeneralSection`, so that's what's mocked here too.
const SIDEBAR_SETTINGS: DeepPartial<GetSettingsQueryResponse> = { appVersion: 'v1.4.2' }

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/tarefas-wrapper.png`: the stats line "3
 * aguardando entrada · 5 em andamento · 4 concluídas · 7 arquivadas", the three status groups
 * ("Precisa de entrada": invoice-500, mobile-nav · "Em andamento": pix-payment, checkout-timeout ·
 * "Concluída": coupon-focus) with their exact titles.
 *
 * GAP (not fixed here — `IssueRow`'s own docblock in `@/components/console/IssueRow` already names
 * this): the target shows a per-row relative timestamp ("há 6 min", "há 22 min", …) on every active
 * row; neither `GetIssuesOverview` nor `IssueRow`'s active-row shape carries/renders one (no
 * createdAt/updatedAt on the wire) — pending backend gap, not invented client-side.
 */
const ISSUES_FULL: DeepPartial<GetIssuesOverviewQueryResponse> = {
	statsLine: { awaitingInput: 3, working: 5, completed: 4, archived: 7 },
	groups: [
		{
			status: 'NEEDS_INPUT',
			items: [
				{
					issueId: 'issue-invoice-500',
					key: 'invoice-500',
					title: 'Erro 500 ao gerar a fatura do cliente Acme',
					status: 'NEEDS_INPUT',
					archived: false,
					threadId: 'thread-demo-bot',
					threadDisplayName: 'DEMO SHOP BOT',
				},
				{
					issueId: 'issue-mobile-nav',
					key: 'mobile-nav',
					title: 'Menu não abre no iPhone — falta a versão do iOS',
					status: 'NEEDS_INPUT',
					archived: false,
					threadId: 'thread-demo-bot',
					threadDisplayName: 'DEMO SHOP BOT',
				},
			],
		},
		{
			status: 'WORKING',
			items: [
				{
					issueId: 'issue-pix-payment',
					key: 'pix-payment',
					title: 'Provedor Pix atrás de feature flag',
					status: 'WORKING',
					archived: false,
					threadId: 'thread-demo-bot',
					threadDisplayName: 'DEMO SHOP BOT',
				},
				{
					issueId: 'issue-checkout-timeout',
					key: 'checkout-timeout',
					title: 'Timeout no checkout acima de 8 itens',
					status: 'WORKING',
					archived: false,
					threadId: 'thread-demo-bot',
					threadDisplayName: 'DEMO SHOP BOT',
				},
			],
		},
		{
			status: 'COMPLETED',
			items: [
				{
					issueId: 'issue-coupon-focus',
					key: 'coupon-focus',
					title: 'Campo de cupom perdia o foco no mobile',
					status: 'COMPLETED',
					archived: false,
					threadId: 'thread-demo-bot',
					threadDisplayName: 'DEMO SHOP BOT',
				},
			],
		},
	],
	archived: [],
}

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/tarefas-arquivadas-wrapper.png`: same
 * stats line as `tarefas-wrapper` (the header doesn't change with the toggle), "Ocultar arquivadas"
 * action (search `archived: true`), the "Arquivadas" section with its 3 rows — thread avatar + "DEMO
 * SHOP BOT" label, bold title, mono key, right-aligned completion summary (`meta`), chevron. Title/
 * key/meta strings are copied VERBATIM including the design's own truncation ("..."/"…") — fixture-
 * name divergence: target PNG shows a real bot/product name, replaced by synthetic fixtures (founder,
 * 2026-08-25) — this is wrapper/sample content, not a live record this file has the untruncated source for (see
 * UI-FIDELITY.md "mock do design pré-truncado": reproducing the visible cut is not fabrication when
 * there's no other source of truth for the full string).
 *
 * `groups: []` here (no "Precisa de entrada"/"Em andamento"/"Concluída" sections above "Arquivadas") is
 * a MOCK-SHAPE choice, not a code change: `IssuesOverviewSection` renders `orderedGroups` whenever
 * `data.groups` is non-empty, independent of the `archived` toggle, so a real backend response could in
 * principle return both — but the design's `tarefas-arquivadas-wrapper` frame only pictures the
 * "Arquivadas" section, and this is the closest honest reproduction of that frame within the
 * component's existing branching (no code touched).
 */
const ISSUES_ARCHIVED: DeepPartial<GetIssuesOverviewQueryResponse> = {
	statsLine: { awaitingInput: 3, working: 5, completed: 4, archived: 7 },
	groups: [],
	archived: [
		{
			issueId: 'issue-archived-1',
			key: 'criar-uma-notificac-a-o-do-demo-shop-para',
			title: 'Criar uma notificação do Demo Shop para a ...',
			status: 'COMPLETED',
			meta: 'Notificação de Contas de Equip…',
			archived: true,
			threadId: 'thread-demo-bot',
			threadDisplayName: 'DEMO SHOP BOT',
		},
		{
			issueId: 'issue-archived-2',
			key: 'esse-endpoint-de-subscriptions-quando-fo',
			title: 'Esse endpoint de subscriptions quando f...',
			status: 'COMPLETED',
			meta: 'PR #1287 aberto para dev no aurora…',
			archived: true,
			threadId: 'thread-demo-bot',
			threadDisplayName: 'DEMO SHOP BOT',
		},
		{
			issueId: 'issue-archived-3',
			key: 'criar-conta-ilimitada-unlimited-no-aurora',
			title: 'Criar conta ilimitada (UNLIMITED) no Aurora ...',
			status: 'COMPLETED',
			meta: '*AGENTE* Conta UNLIMITED criad…',
			archived: true,
			threadId: 'thread-demo-bot',
			threadDisplayName: 'DEMO SHOP BOT',
		},
	],
}

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/tarefas-vazio-wrapper.png`: title "Tarefas"
 * with NO stats subtitle line at all, then the `Empty` state ("Nenhuma tarefa ainda" /
 * "As tarefas aparecem aqui quando seus agentes começam a trabalhar em mensagens encaminhadas.") — and
 * the sidebar's "Tarefas" badge still reading **12**, identical to `tarefas-wrapper`/
 * `tarefas-arquivadas-wrapper` (confirmed by zooming the target, not assumed).
 *
 * `statsLine` is kept at the SAME non-zero values as `ISSUES_FULL` (not zeroed) — `Sidebar` and
 * `IssuesOverviewSection` read the exact same `useGetIssuesOverview()` cache entry (query dedup), so
 * one mock serves both; zeroing it to match a "confirmed empty" reading would flip the sidebar badge to
 * 0, contradicting the target's own "12". `groups: []` + `archived: []` is what actually drives the
 * `Empty` branch (`orderedGroups.length === 0 && data.archived.length === 0`) — independent of
 * `statsLine`.
 *
 * GAP (not fixed here — component code out of scope, and the shared-query constraint above rules out
 * the alternative): the target shows literally NOTHING between the "Tarefas" title and the empty card —
 * no stats text, no skeleton shimmer. `IssuesOverviewSection` has no branch that renders "nothing":
 * `subtitle` is either the real stats sentence (when `data.statsLine` resolves, ANY value) or a
 * `Skeleton` (`subtitle ?? <Skeleton />`, the fallback for `undefined`) — there is no third state for
 * "resolved data, deliberately blank line". This mock therefore renders "3 aguardando entrada · 5 em
 * andamento · 4 concluídas · 7 arquivadas" where the target shows blank — the visible divergence is
 * this line's mere presence (which also keeps the sidebar badge honest), not its content.
 *
 * GAP (not fixed here, same class): the target ALSO hides the "Mostrar arquivadas" button entirely
 * (confirmed by zooming the target's top-right — fully blank) for this state. `PageHeader`'s `action`
 * slot is unconditional in `IssuesOverviewSection` — no branch drops it when the list is empty — so this
 * story still renders the button where the target shows nothing.
 */
const ISSUES_EMPTY: DeepPartial<GetIssuesOverviewQueryResponse> = {
	statsLine: { awaitingInput: 3, working: 5, completed: 4, archived: 7 },
	groups: [],
	archived: [],
}

const meta = {
	title: 'Issues/Overview',
	component: IssuesOverviewSection,
	parameters: connected({
		route: { id: '/(app)/issues/', search: { archived: false } },
		msw: {
			handlers: [
				mockQuery(issuesOpts, ISSUES_FULL),
				mockQuery(dashboardOpts, SIDEBAR_DASHBOARD),
				mockQuery(workspacesOpts, SIDEBAR_WORKSPACES),
				mockQuery(settingsOpts, SIDEBAR_SETTINGS),
			],
		},
	}),
} satisfies Meta<typeof IssuesOverviewSection>
export default meta

type Story = StoryObj<typeof meta>

/**
 * `tarefas-wrapper` — every issue across every thread, grouped by status, archived reveal collapsed
 * ("Mostrar arquivadas" action, `archived: false`).
 */
export const Full: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'tarefas-wrapper', kind: 'screens', viewport: { width: 1440, height: 900 } },
	},
	render: () => (
		<AppScreenFrame>
			<IssuesOverviewSection />
		</AppScreenFrame>
	),
}

/** `tarefas-arquivadas-wrapper` — archived reveal expanded ("Ocultar arquivadas" action, `archived: true`). */
export const Archived: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'tarefas-arquivadas-wrapper', kind: 'screens', viewport: { width: 1440, height: 900 } },
		...connected({
			route: { id: '/(app)/issues/', search: { archived: true } },
			msw: {
				handlers: [
					mockQuery(issuesOpts, ISSUES_ARCHIVED),
					mockQuery(dashboardOpts, SIDEBAR_DASHBOARD),
					mockQuery(workspacesOpts, SIDEBAR_WORKSPACES),
					mockQuery(settingsOpts, SIDEBAR_SETTINGS),
				],
			},
		}),
	},
	render: () => (
		<AppScreenFrame>
			<IssuesOverviewSection />
		</AppScreenFrame>
	),
}

/** `tarefas-vazio-wrapper` — confirmed-empty task list (see `ISSUES_EMPTY`'s docblock for the gap this doesn't close). */
export const Empty: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'tarefas-vazio-wrapper', kind: 'screens', viewport: { width: 1440, height: 900 } },
		...connected({
			route: { id: '/(app)/issues/', search: { archived: false } },
			msw: {
				handlers: [
					mockQuery(issuesOpts, ISSUES_EMPTY),
					mockQuery(dashboardOpts, SIDEBAR_DASHBOARD),
					mockQuery(workspacesOpts, SIDEBAR_WORKSPACES),
					mockQuery(settingsOpts, SIDEBAR_SETTINGS),
				],
			},
		}),
	},
	render: () => (
		<AppScreenFrame>
			<IssuesOverviewSection />
		</AppScreenFrame>
	),
}
