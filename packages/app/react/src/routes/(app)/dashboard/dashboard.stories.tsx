import type { Meta, StoryObj } from '@storybook/react'
import {
	getHomeDashboardQueryOptions,
	getIssuesOverviewQueryOptions,
	getOnboardingQueryOptions,
	getSettingsQueryOptions,
	listWorkspacesQueryOptions,
} from '@codm/client-typescript/typescript'
import type {
	GetHomeDashboardQueryResponse,
	GetIssuesOverviewQueryResponse,
	GetOnboardingQueryResponse,
	GetSettingsQueryResponse,
	ListWorkspacesQueryResponse,
} from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { AppScreenFrame, connected, loadingQuery, mockQuery } from '@/storybook'
import { HomeSection } from './-components/HomeSection'

const dashboardOpts = getHomeDashboardQueryOptions()
const onboardingOpts = getOnboardingQueryOptions()
const settingsOpts = getSettingsQueryOptions()
const workspacesOpts = listWorkspacesQueryOptions()
const issuesOpts = getIssuesOverviewQueryOptions()

const now = Date.now()
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString()
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60_000).toISOString()

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/screen-1-inicio-cheio.png` (foto-fixture
 * principle — numbers/names/messages copied from the design, never invented): "3 agentes trabalhando
 * agora", the callout "Acme · Time de produto precisa de você" (Aprovação necessária · Erro de
 * servidor), the 14 / 9 / 4 min 12 s stats, the two active sessions (Loja Litoral · Em execução,
 * Acme · Time de produto · Precisa de atenção), the 6 latest-activity rows, and the sidebar's single
 * "DEMO SHOP BOT" conversation. Fixture-name divergence: target PNG shows real person names/contact
 * details, replaced by synthetic fixtures (founder, 2026-08-25).
 */
const DASHBOARD_FULL: DeepPartial<GetHomeDashboardQueryResponse> = {
	agentsRunningNow: 3,
	needsYou: {
		threadId: 'thread-acme',
		threadDisplayName: 'Acme · Time de produto',
		stopKinds: ['APPROVAL_NEEDED', 'SERVER_ERROR'],
	},
	today: {
		issuesOpened: 14,
		issuesClosed: 9,
		// 4 min 12 s in the design; formatDurationSeconds only ever renders ONE unit (it would show
		// "4 min"). Real gap between the component and the design — named for F3, not fixed here (T4
		// proves the pipe, not the fidelity — the score is meant to be honest, not chased).
		medianResponseSeconds: 252,
	},
	// The sidebar's "Conversas" section reads THIS list (Sidebar owns its own `useGetHomeDashboard()`
	// call — same query, deduplicated by React Query) — the target shows one thread, "DEMO SHOP BOT".
	threads: [
		{
			threadId: 'thread-demo-bot',
			displayName: 'Demo Shop',
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
	activeSessions: [
		{
			threadId: 'thread-loja-litoral',
			displayName: 'Loja Litoral',
			channelId: 'channel-1',
			externalId: '5511900000001',
			hasAvatar: false,
			channelKind: 'WHATSAPP',
			workspacePath: '/workspaces/loja-litoral',
			providers: ['CLAUDE_CODE'],
			status: 'RUNNING',
			lastActivity: minutesAgo(2),
		},
		{
			threadId: 'thread-acme',
			displayName: 'Acme · Time de produto',
			channelId: 'channel-1',
			externalId: '5511900000002',
			hasAvatar: false,
			channelKind: 'WHATSAPP',
			workspacePath: '/workspaces/acme',
			providers: ['CLAUDE_CODE'],
			status: 'NEEDS_ATTENTION',
			lastActivity: minutesAgo(18),
		},
	],
	latestActivity: [
		{
			kind: 'CONTACT',
			subtitle: 'Valeuuu',
			threadId: 'thread-matheus',
			at: hoursAgo(10),
			sender: { channelId: 'channel-1', externalId: '5511900000003', displayName: 'Thiago Barros', hasAvatar: false },
		},
		{
			kind: 'CONTACT',
			subtitle: 'padrão',
			threadId: 'thread-diego',
			at: hoursAgo(10),
			sender: { channelId: 'channel-1', externalId: '5511900000004', displayName: 'Diego Martins', hasAvatar: false },
		},
		{
			kind: 'CONTACT',
			subtitle: 'mas a senha é a mesma de sempre, viu?',
			threadId: 'thread-diego',
			at: hoursAgo(10),
			sender: { channelId: 'channel-1', externalId: '5511900000004', displayName: 'Diego Martins', hasAvatar: false },
		},
		{
			kind: 'CONTACT',
			subtitle: 'eu enviei o email',
			threadId: 'thread-diego',
			at: hoursAgo(10),
			sender: { channelId: 'channel-1', externalId: '5511900000004', displayName: 'Diego Martins', hasAvatar: false },
		},
		{
			kind: 'CONTACT',
			subtitle: 'Com as credenciais',
			threadId: 'thread-diego',
			at: hoursAgo(10),
			sender: { channelId: 'channel-1', externalId: '5511900000004', displayName: 'Diego Martins', hasAvatar: false },
		},
		{
			kind: 'CONTACT',
			subtitle: 'beleza! Me confirma só qdo realizar e a nova senha q...',
			threadId: 'thread-demo-bot',
			at: hoursAgo(10),
			sender: { channelId: 'channel-1', externalId: '5511900000005', displayName: 'Demo Shop', hasAvatar: false },
		},
	],
	channels: [{ kind: 'WHATSAPP', status: 'CONNECTED' }],
}

// `HomeSection` forks on `threadDone` — `true` renders `HomeDashboard`, the branch the target shot.
const ONBOARDING_THREAD_DONE: GetOnboardingQueryResponse = {
	currentStep: 'FINAL',
	completedAt: hoursAgo(10),
	state: {},
	channelDone: true,
	workspaceDone: true,
	threadDone: true,
}

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/screen-2-inicio-vazio.png` +
 * `design/system/pen/screens/screen-2-inicio-vazio.json`: the confirmed-empty operating dashboard —
 * "Sem agentes trabalhando agora", the 0 / 0 stat tiles (median response tile shows "—" in the
 * design — see the docblock on `Empty` below for the gap this doesn't close), the "Nenhuma sessão
 * ativa" and "Nenhuma atividade ainda" empty states, one connected channel ("Canais 1" in the rail).
 */
const DASHBOARD_EMPTY: DeepPartial<GetHomeDashboardQueryResponse> = {
	agentsRunningNow: 0,
	today: {
		issuesOpened: 0,
		issuesClosed: 0,
		medianResponseSeconds: 0,
	},
	// The rail's own `useGetHomeDashboard()` read shows "Nenhuma conversa ainda" for this slug.
	threads: [],
	activeSessions: [],
	latestActivity: [],
	channels: [{ kind: 'WHATSAPP', status: 'CONNECTED' }],
}

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/screen-4-inicio-canal-offline.png` +
 * `design/system/pen/screens/screen-4-inicio-canal-offline.json`: the SAME operating data as
 * `screen-1-inicio-cheio` (3 agentes, needs-you callout, 14/9/4min12s, the two active sessions, the
 * six-row — target only shows 4, see `Offline` docblock — latest activity) plus a DISCONNECTED
 * channel, which is what flips `HomeDashboard`'s `offlineChannel` branch (content-column banner +
 * " · canal offline" status suffix).
 */
const DASHBOARD_OFFLINE: DeepPartial<GetHomeDashboardQueryResponse> = {
	agentsRunningNow: 3,
	needsYou: {
		threadId: 'thread-acme',
		threadDisplayName: 'Acme · Time de produto',
		stopKinds: ['APPROVAL_NEEDED', 'SERVER_ERROR'],
	},
	today: {
		issuesOpened: 14,
		issuesClosed: 9,
		medianResponseSeconds: 252,
	},
	threads: [
		{
			threadId: 'thread-demo-bot',
			displayName: 'Demo Shop',
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
	activeSessions: [
		{
			threadId: 'thread-loja-litoral',
			displayName: 'Loja Litoral',
			channelId: 'channel-1',
			externalId: '5511900000001',
			hasAvatar: false,
			channelKind: 'WHATSAPP',
			workspacePath: '/workspaces/loja-litoral',
			providers: ['CLAUDE_CODE'],
			status: 'RUNNING',
			lastActivity: minutesAgo(2),
		},
		{
			threadId: 'thread-acme',
			displayName: 'Acme · Time de produto',
			channelId: 'channel-1',
			externalId: '5511900000002',
			hasAvatar: false,
			channelKind: 'WHATSAPP',
			workspacePath: '/workspaces/acme',
			providers: ['CLAUDE_CODE'],
			status: 'NEEDS_ATTENTION',
			lastActivity: minutesAgo(18),
		},
	],
	latestActivity: [
		{
			kind: 'CONTACT',
			subtitle: 'Valeuuu',
			threadId: 'thread-matheus',
			at: hoursAgo(10),
			sender: { channelId: 'channel-1', externalId: '5511900000003', displayName: 'Thiago Barros', hasAvatar: false },
		},
		{
			kind: 'CONTACT',
			subtitle: 'padrão',
			threadId: 'thread-diego',
			at: hoursAgo(10),
			sender: { channelId: 'channel-1', externalId: '5511900000004', displayName: 'Diego Martins', hasAvatar: false },
		},
		{
			kind: 'CONTACT',
			subtitle: 'mas a senha é a mesma de sempre, viu?',
			threadId: 'thread-diego',
			at: hoursAgo(10),
			sender: { channelId: 'channel-1', externalId: '5511900000004', displayName: 'Diego Martins', hasAvatar: false },
		},
		{
			kind: 'CONTACT',
			subtitle: 'eu enviei o email',
			threadId: 'thread-diego',
			at: hoursAgo(10),
			sender: { channelId: 'channel-1', externalId: '5511900000004', displayName: 'Diego Martins', hasAvatar: false },
		},
	],
	channels: [{ kind: 'WHATSAPP', status: 'DISCONNECTED' }],
}

// Sidebar badges (Sidebar owns these reads too — same dedup story as `threads` above): "Projetos 3"
// from `useListWorkspaces`, "Tarefas 0" from `useGetIssuesOverview`, "Canais 1" from
// `dashboard.channels` (already covered by DASHBOARD_FULL).
const SETTINGS: DeepPartial<GetSettingsQueryResponse> = { appVersion: '0.1.0' }

const WORKSPACES: DeepPartial<ListWorkspacesQueryResponse> = {
	workspaces: [
		{ workspaceId: 'ws-1', path: '/workspaces/loja-litoral', badges: [], threadCount: 1, addedAt: hoursAgo(48) },
		{ workspaceId: 'ws-2', path: '/workspaces/acme', badges: [], threadCount: 1, addedAt: hoursAgo(72) },
		{ workspaceId: 'ws-3', path: '/workspaces/demo-shop', badges: [], threadCount: 1, addedAt: hoursAgo(96) },
	],
}

const ISSUES_OVERVIEW: DeepPartial<GetIssuesOverviewQueryResponse> = {
	statsLine: { awaitingInput: 0, working: 0, completed: 0, archived: 0 },
	groups: [],
}

const meta = {
	title: 'Dashboard/Home',
	component: HomeSection,
	parameters: connected({
		route: { id: '/(app)/dashboard/' },
		msw: {
			handlers: [
				mockQuery(dashboardOpts, DASHBOARD_FULL),
				mockQuery(onboardingOpts, ONBOARDING_THREAD_DONE),
				mockQuery(settingsOpts, SETTINGS),
				mockQuery(workspacesOpts, WORKSPACES),
				mockQuery(issuesOpts, ISSUES_OVERVIEW),
			],
		},
	}),
} satisfies Meta<typeof HomeSection>
export default meta

type Story = StoryObj<typeof meta>

/**
 * Fidelity pilot (F1/T4, harness fixed in F3 Wave 0) — the operating dashboard ("cheio": agents
 * running, needs-you callout, today's stats, active sessions, latest activity), measured against
 * `design/fidelity/targets/screens/screen-1-inicio-cheio.png` via `bun fidelity`.
 *
 * Renders the ROUTE'S REAL composition: `HomeSection` (the fork use `routes/(app)/dashboard/index.tsx`
 * mounts) inside `AppScreenFrame` (the title bar + real `Sidebar` the app draws around every route,
 * `routes/(app)/route.tsx` owns that composition, not this route). Before F3 Wave 0 this story mounted
 * `HomeDashboard` directly, bypassing both because `HomeSection`'s `useAnalytics()` call
 * (`useService`/`useContainer`) threw outside `<ServicesProvider>` and the harness never mounted one —
 * that gap is what `withConnected` closed (F3 Wave 0 item 3): every connected story now gets a
 * `Container` bound to `registry/test`'s in-memory fakes, so `HomeSection`'s real fork condition
 * (`useGetOnboarding().data.threadDone`) and its `setPersonProperties` side effect both run for real.
 */
export const Full: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'screen-1-inicio-cheio', kind: 'screens', viewport: { width: 1440, height: 900 } },
	},
	render: () => (
		<AppScreenFrame>
			<HomeSection />
		</AppScreenFrame>
	),
}

/**
 * Confirmed-empty operating dashboard (`screen-2-inicio-vazio`, F3 wave A) — thread already attached
 * (`threadDone: true`, same fork as `Full`), but zero traffic today: "Sem agentes trabalhando agora",
 * 0 tarefas abertas/fechadas, no active sessions, no recent activity.
 *
 * GAP (not fixed here — component/format code is out of scope): the design's median-response tile
 * shows "—" for the no-data case; `formatDurationSeconds` (`@/lib/format`) has no no-data branch and
 * always formats a number, so `medianResponseSeconds: 0` renders "0 s" here instead of "—". Closing
 * this needs either a nullable `medianResponseSeconds` on the wire DTO or a dash-when-zero branch in
 * the formatter/component — a design decision, not something this story can paper over.
 */
export const Empty: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'screen-2-inicio-vazio', kind: 'screens', viewport: { width: 1440, height: 900 } },
		...connected({
			route: { id: '/(app)/dashboard/' },
			msw: {
				handlers: [
					mockQuery(dashboardOpts, DASHBOARD_EMPTY),
					mockQuery(onboardingOpts, ONBOARDING_THREAD_DONE),
					mockQuery(settingsOpts, SETTINGS),
					mockQuery(workspacesOpts, WORKSPACES),
					mockQuery(issuesOpts, ISSUES_OVERVIEW),
				],
			},
		}),
	},
	render: () => (
		<AppScreenFrame>
			<HomeSection />
		</AppScreenFrame>
	),
}

/**
 * Loading state (`screen-3-inicio-carregando`, F3 wave A) — the dashboard read never resolves
 * (`loadingQuery`), driving `HomeDashboard`'s own `isLoading` branch (`DashboardSkeleton`: skeleton
 * title/subtitle/button, 3 skeleton stat tiles, 2 skeleton session rows, 5 skeleton activity rows —
 * matches the target's shape exactly). Onboarding/settings/workspaces/issues resolve normally, same
 * as `Full`, so the rail's nav counts ("Projetos 3", "Tarefas 0", "Canais 1") render for real.
 *
 * GAP (not fixed here — `Sidebar` in `@/components/Navbar` is harness chrome, out of this file's
 * scope): the target's rail shows the "DEMO SHOP BOT" thread already resolved while the content column
 * is still loading, but `Sidebar` reads THREADS off the very same `useGetHomeDashboard()` query
 * `HomeDashboard` uses — with that query never resolving, the rail's own `!dashboard` branch fires
 * too (`ThreadRowsSkeleton`, 3 skeleton rows) instead of showing the real thread row. The two regions
 * are coupled to one query; decoupling them (e.g. a separate threads-list read) is a backend/contract
 * change, not a mock.
 */
export const Loading: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'screen-3-inicio-carregando', kind: 'screens', viewport: { width: 1440, height: 900 } },
		...connected({
			route: { id: '/(app)/dashboard/' },
			msw: {
				handlers: [
					loadingQuery(dashboardOpts),
					mockQuery(onboardingOpts, ONBOARDING_THREAD_DONE),
					mockQuery(settingsOpts, SETTINGS),
					mockQuery(workspacesOpts, WORKSPACES),
					mockQuery(issuesOpts, ISSUES_OVERVIEW),
				],
			},
		}),
	},
	render: () => (
		<AppScreenFrame>
			<HomeSection />
		</AppScreenFrame>
	),
}

/**
 * Channel-offline operating dashboard (`screen-4-inicio-canal-offline`, F3 wave A) — same live data
 * as `screen-1-inicio-cheio` (agents running, needs-you callout, today's stats, active sessions,
 * latest activity) plus one `DISCONNECTED` channel, which flips `HomeDashboard`'s `offlineChannel`
 * branch: the content-column `ChannelOfflineBanner` and the " · canal offline" status-line suffix.
 *
 * GAP (not fixed here — out of this file's scope, and already documented on `ChannelOfflineBanner`'s
 * own docblock in `HomeDashboard/index.tsx`): the design's offline state is a FULL-BLEED banner above
 * BOTH the rail and the content column (`routes/(app)/route.tsx` chrome); `HomeDashboard` only owns
 * the content-column-scoped equivalent reproduced here, same tokens/copy/action. `AppScreenFrame`
 * (the harness) doesn't compose that outer banner either, so this story only ever shows the inner one.
 *
 * The target's "Atividade recente" list also shows only 4 rows (vs. 6 on `screen-1-inicio-cheio`) —
 * reproduced as-is (4 items), content copied verbatim from the design, nothing invented.
 */
export const ChannelOffline: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'screen-4-inicio-canal-offline', kind: 'screens', viewport: { width: 1440, height: 900 } },
		...connected({
			route: { id: '/(app)/dashboard/' },
			msw: {
				handlers: [
					mockQuery(dashboardOpts, DASHBOARD_OFFLINE),
					mockQuery(onboardingOpts, ONBOARDING_THREAD_DONE),
					mockQuery(settingsOpts, SETTINGS),
					mockQuery(workspacesOpts, WORKSPACES),
					mockQuery(issuesOpts, ISSUES_OVERVIEW),
				],
			},
		}),
	},
	render: () => (
		<AppScreenFrame>
			<HomeSection />
		</AppScreenFrame>
	),
}
