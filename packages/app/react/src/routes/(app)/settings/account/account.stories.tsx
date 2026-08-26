import type { Meta, StoryObj } from '@storybook/react'
import { useTranslation } from 'react-i18next'
import {
	getHomeDashboardQueryOptions,
	getIssuesOverviewQueryOptions,
	getMyAccountQueryOptions,
	getSettingsQueryOptions,
	listWorkspacesQueryOptions,
} from '@codm/client-typescript/typescript'
import type {
	GetHomeDashboardQueryResponse,
	GetIssuesOverviewQueryResponse,
	GetMyAccountQueryResponse,
	GetSettingsQueryResponse,
	ListWorkspacesQueryResponse,
} from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { AppScreenFrame, connected, mockQuery } from '@/storybook'
import { PageHeader } from '@/components/console/PageHeader'
import { CloudAccountSection } from './-components/CloudAccountSection'
import { PreferencesSection } from './-components/PreferencesSection'
import { ProfileSection } from './-components/ProfileSection'
import { SecuritySection } from './-components/SecuritySection'

// A5 (F3-waveA) — área Tarefas, Configurações & Conta: Minha Conta.
// Fontes: design/fidelity/targets/screens/minha-conta-wrapper.png +
// design/system/pen/screens/minha-conta-wrapper.json.

/**
 * `routes/(app)/settings/account/index.tsx`'s `RouteComponent` has no exported Section — it composes
 * these 4 subsections + `PageHeader` inline. This mirrors that composition EXACTLY (same order:
 * Perfil → Preferências → Segurança → CloudAccountSection, same shell classes) so the story renders the
 * route's real composition without a production-file change (story-local, same precedent as
 * `AppScreenFrame` itself being a story-only reproduction of the app's window chrome).
 */
function AccountScreen() {
	const { t } = useTranslation()
	return (
		<div className="mx-auto flex w-full flex-col gap-8 px-6 pb-16 pt-20">
			<PageHeader title={t('account.header.title')} />
			<ProfileSection />
			<PreferencesSection />
			<SecuritySection />
			<CloudAccountSection />
		</div>
	)
}

const dashboardOpts = getHomeDashboardQueryOptions()
const workspacesOpts = listWorkspacesQueryOptions()
const issuesOpts = getIssuesOverviewQueryOptions()
const settingsOpts = getSettingsQueryOptions()
const myAccountOpts = getMyAccountQueryOptions()

const now = Date.now()
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60_000).toISOString()

/**
 * `AppScreenFrame` always draws the REAL `Sidebar`, which owns its own reads — same dedup story as
 * every other screens-kind fidelity story in this app. Content REPRODUCED from
 * `minha-conta-wrapper.png`: sidebar shows "Projetos 3 · Tarefas 0 · Canais 1" and one "DEMO SHOP BOT"
 * conversation — identical rail content to `configuracoes-wrapper` (both frames of the same D3 group,
 * `jxl4Y`/`cixrK`).
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
// Same source as `configuracoes-wrapper` (D3 group `jxl4Y`/`cixrK`, both frames measure "$app-version"
// unresolved in the rail — armadilha 37, already normalized to a real value at the `dashboard.stories`/
// `thread.stories`/`settings.stories` precedent). No visible app-version row on THIS screen to cross-
// check against, so the same `'v1.4.2'` used in `settings.stories.tsx` is reused for consistency.
const SETTINGS: DeepPartial<GetSettingsQueryResponse> = { appVersion: 'v1.4.2' }

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/minha-conta-wrapper.png`: "Perfil" (avatar
 * initials "DM", Nome "Diego Martins", E-mail "admin@auroralabs.app", Empresa "Aurora Labs") →
 * "Preferências" (Idioma "Português (Brasil)", Fuso horário "America/Fortaleza", Moeda "Real (BRL)"
 * read-only/locked) → "Segurança" ("Alterar senha" row present ⇒ `security.hasPassword: true`,
 * "Excluir conta" row). Fixture-name divergence: target PNG shows the real operator's name/email/
 * company, replaced by synthetic fixtures (founder, 2026-08-25).
 */
const MY_ACCOUNT: DeepPartial<GetMyAccountQueryResponse> = {
	profile: {
		userId: 'user-diego',
		name: 'Diego Martins',
		email: 'admin@auroralabs.app',
		company: 'Aurora Labs',
		pictureUrl: null,
	},
	preferences: {
		language: 'pt-BR',
		currency: 'BRL',
		timezone: 'America/Fortaleza',
	},
	security: {
		hasPassword: true,
		lastPasswordChangeAt: null,
		twoFactorEnabled: false,
	},
}

const meta = {
	title: 'Settings/Account',
	component: AccountScreen,
	parameters: connected({
		route: { id: '/(app)/settings/account/' },
		msw: {
			handlers: [
				mockQuery(myAccountOpts, MY_ACCOUNT),
				mockQuery(dashboardOpts, SIDEBAR_DASHBOARD),
				mockQuery(workspacesOpts, SIDEBAR_WORKSPACES),
				mockQuery(issuesOpts, SIDEBAR_ISSUES),
				mockQuery(settingsOpts, SETTINGS),
			],
		},
	}),
} satisfies Meta<typeof AccountScreen>
export default meta

type Story = StoryObj<typeof meta>

/**
 * `minha-conta-wrapper` — Perfil / Preferências / Segurança, as pictured. `CloudAccountSection`
 * (logout) renders below the fold (D3 doesn't picture it — see its own docblock in
 * `-components/CloudAccountSection/index.tsx`: a safety capability kept regardless), same as it does
 * in the real app — the 900px `AppScreenFrame` viewport simply doesn't scroll to it, matching the
 * target's own crop.
 */
export const Default: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'minha-conta-wrapper', kind: 'screens', viewport: { width: 1440, height: 900 } },
	},
	render: () => (
		<AppScreenFrame>
			<AccountScreen />
		</AppScreenFrame>
	),
}
