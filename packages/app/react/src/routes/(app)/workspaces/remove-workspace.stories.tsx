import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { useTranslation } from 'react-i18next'
import { IconTrash } from '@tabler/icons-react'
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
} from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { Button } from '@codm/app-ui/button'
import { AppScreenFrame, connected, mockQuery } from '@/storybook'
import { WorkspacesSection } from './-components/WorkspacesSection'

// A4 (F3-waveA) — área Projetos & Canais: Projetos — vazio e remover (dialog "Remover este espaço
// de trabalho?" sobre o estado vazio). Fonte:
// design/fidelity/targets/screens/projetos-vazio-e-remover-group.png +
// design/system/pen/screens/projetos-vazio-e-remover-group.json.

const now = Date.now()
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60_000).toISOString()

const dashboardOpts = getHomeDashboardQueryOptions()
const workspacesOpts = listWorkspacesQueryOptions()
const issuesOpts = getIssuesOverviewQueryOptions()
const settingsOpts = getSettingsQueryOptions()

// Sidebar background: the target's rail still shows "Projetos 3 · Tarefas 0 · Canais 1" (the
// count badge reads the SAME `useListWorkspaces()` the content column uses — dedup, not a second
// source) even though the content column itself shows zero cards. Reproduced as three real
// workspaces for the badge/count, with the CONTENT column driven to its empty branch below.
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
 * The STATIC PANEL (UI-FIDELITY.md canon 11): the real confirm this screen reproduces is
 * `WorkspacesSection`'s `WorkspaceCard.onRemove` → `useDialogStore().confirm({...})`, which renders
 * through the shared `ConfirmDialog` → `DialogContent` → Base UI `Dialog.Portal`, escaping
 * `#storybook-root` the same way `AddWorkspaceDialog` does (no `container` override anywhere in
 * this codebase). Classes copied verbatim from `ConfirmDialog` (`@codm/app-ui/confirm-dialog.tsx`,
 * `variant="destructive"`) and `dialog.tsx`'s `DialogOverlay`/`DialogContent`/`DialogHeader`/
 * `DialogFooter` — `h2`/`p` stand in for `DialogTitle`/`DialogDescription` (Base UI primitives that
 * require a `Dialog.Root` ancestor). `Button` is reused directly (not portal-bound). Same recipe as
 * `delete-thread.stories.tsx`'s `DeleteConversationPanel`; `ConfirmDialog` sets
 * `showCloseButton={false}`, so unlike `AddWorkspacePanel` there is no close-X to reproduce.
 */
function RemoveWorkspacePanel({ workspaceName, className, ...props }: ComponentProps<'div'> & { workspaceName: string }) {
	const { t } = useTranslation()
	return (
		<div {...props}>
			<div className="bg-foreground/70 fixed inset-0 isolate z-50" />
			<div className="bg-background border border-border shadow-modal grid max-w-[calc(100%-2rem)] gap-4 rounded-asymmetric-xl overflow-hidden p-6 text-sm sm:max-w-md fixed top-1/2 left-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 outline-none">
				<div className="gap-2 flex flex-col">
					<span className="flex size-11 items-center justify-center rounded-asymmetric-sm bg-attention-surface text-destructive">
						<IconTrash className="size-5" />
					</span>
					<h2 className="text-lg leading-snug font-semibold">{t('workspaces.removeConfirmTitle')}</h2>
					<p className="text-muted-foreground *:[a]:text-secondary-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3">
						{t('workspaces.removeConfirmDescription', { name: workspaceName })}
					</p>
				</div>
				<div className="bg-muted/40 -mx-6 -mb-6 rounded-b-2xl border-t border-border p-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button variant="outline" onClick={() => {}}>
						{t('common.cancel')}
					</Button>
					<Button variant="destructive" onClick={() => {}}>
						{t('workspaces.removeConfirmAction')}
					</Button>
				</div>
			</div>
		</div>
	)
}

const meta = {
	title: 'Workspaces/RemoveWorkspace (Fidelity)',
	component: RemoveWorkspacePanel,
	args: { workspaceName: 'acme-storefront' },
	parameters: connected({
		route: { id: '/(app)/workspaces/' },
		msw: {
			handlers: [
				mockQuery(dashboardOpts, DASHBOARD),
				// Content column empty (`workspaces: []`); the sidebar badge count is driven by the SAME
				// query, so this deliberately diverges from `DASHBOARD`'s "Projetos 3" framing above — see
				// the GAP note on `Empty` below for why this can't be reconciled without fabricating state.
				mockQuery(workspacesOpts, { workspaces: [] }),
				mockQuery(issuesOpts, ISSUES_OVERVIEW),
				mockQuery(settingsOpts, SETTINGS),
			],
		},
	}),
} satisfies Meta<typeof RemoveWorkspacePanel>
export default meta

type Story = StoryObj<typeof meta>

/**
 * `projetos-vazio-e-remover-group` — the "Remover este espaço de trabalho?" confirm dialog over
 * the empty project-folder state, measured against
 * `design/fidelity/targets/screens/projetos-vazio-e-remover-group.png` via `bun fidelity`.
 *
 * GAP (não fabricado): the target's background (per the extracted spec JSON — `Card / Adicionar
 * pasta` + `Card / Vazio 1` + `Card / Vazio 2`) shows the dashed "Adicionar pasta" tile ALONGSIDE
 * two extra skeleton-styled ghost cards. `WorkspacesSection`'s real empty branch
 * (`workspaces.length === 0 && !isLoading`) renders exactly ONE `AddFolderTile` inside `Empty` —
 * there is no prop/query combination that produces "empty message + skeleton cards" simultaneously
 * (loading and empty are mutually exclusive branches in the component). Reproducing the two ghost
 * cards would mean fabricating a state the component cannot enter; this story renders the REAL
 * supported empty state instead (title/description text match the target verbatim) and documents
 * the extra cards as a design-only composite, unreachable in code — decision to add a hybrid
 * loading+empty visual state is the orchestrator's/founder's, not this story's to invent.
 *
 * The sidebar's rail badge ("Projetos" count) reads the same `useListWorkspaces()` query as the
 * content column — with `workspaces: []` mocked for the empty content, the rail badge shows 0
 * here, diverging from the target's rail (which still shows "Projetos 3", composited from a
 * different screen's data by the design tool). Not reconcilable without a second, decoupled read;
 * same class of gap as `dashboard.stories.tsx`'s `Loading` story docblock.
 */
export const Full: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'projetos-vazio-e-remover-group', kind: 'screens', viewport: { width: 1440, height: 900 } },
	},
	render: args => (
		<AppScreenFrame>
			<WorkspacesSection />
			<RemoveWorkspacePanel workspaceName={args.workspaceName} />
		</AppScreenFrame>
	),
}
