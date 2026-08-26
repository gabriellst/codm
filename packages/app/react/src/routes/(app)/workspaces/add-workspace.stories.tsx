import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { useTranslation } from 'react-i18next'
import { IconFolderOpen, IconX } from '@tabler/icons-react'
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
import { Button } from '@codm/app-ui/button'
import { Field, FieldLabel } from '@codm/app-ui/field'
import { Input } from '@codm/app-ui/input'
import { AppScreenFrame, connected, mockQuery } from '@/storybook'
import { WorkspacesSection } from './-components/WorkspacesSection'

// A4 (F3-waveA) — área Projetos & Canais: Projetos — adicionar (dialog "Adicionar um espaço de
// trabalho" sobre a lista cheia). Fonte: design/fidelity/targets/screens/projetos-adicionar-group.png
// + design/system/pen/screens/projetos-adicionar-group.json.

const now = Date.now()
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60_000).toISOString()

const dashboardOpts = getHomeDashboardQueryOptions()
const workspacesOpts = listWorkspacesQueryOptions()
const issuesOpts = getIssuesOverviewQueryOptions()
const settingsOpts = getSettingsQueryOptions()

// Same background list as `workspaces.stories.tsx` (`List`) — the target composites the dialog
// over that exact loaded grid.
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

/**
 * The STATIC PANEL (UI-FIDELITY.md canon 11): `AddWorkspaceDialog` always renders through
 * `DialogContent`, which always wraps its children in Base UI's `Dialog.Portal` — no `container`
 * override exists anywhere in this codebase — so the live component (mounted via
 * `useDialogStore().show(<AddWorkspaceDialog />)`) would portal to `document.body`, outside
 * `#storybook-root`, and `bun fidelity`'s `kind: 'screens'` capture (`root.screenshot()`) would
 * miss it entirely.
 *
 * Technique (same as `delete-thread.stories.tsx`'s `DeleteConversationPanel`): the chrome
 * (overlay/popup/header/footer) is reproduced with the SAME classes as `DialogOverlay`/
 * `DialogContent`/`DialogHeader`/`DialogFooter` (`@codm/app-ui/dialog.tsx`), `h2`/`p` standing
 * in for `DialogTitle`/`DialogDescription` (Base UI primitives that require a `Dialog.Root`
 * ancestor and would throw outside one). Everything ELSE is NOT portal-bound —
 * `Field`/`FieldLabel`/`Input`/`Button` are reused directly (real components, real i18n keys), so
 * only the Dialog-context pieces are hand-copied. Includes the close-X button `DialogContent`
 * renders by default (`AddWorkspaceDialog` never overrides `showCloseButton`) — the target's own
 * modal mockups never draw one (checked in the extracted spec JSON: `Modal Header` has no close
 * node), a genuine design/code divergence, not fixed here (out of this file's scope — the
 * component isn't touched).
 */
function AddWorkspacePanel({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	return (
		<div {...props}>
			{/* Copied from `DialogOverlay` — animation/data-state modifiers dropped (static, always "open"). */}
			<div className="bg-foreground/70 fixed inset-0 isolate z-50" />
			{/* Copied from `DialogContent`'s `DialogPrimitive.Popup` className — animation/data-state
			    modifiers dropped for the same reason. */}
			<div className="bg-background border border-border shadow-modal grid max-w-[calc(100%-2rem)] gap-4 rounded-asymmetric-xl overflow-hidden p-6 text-sm duration-150 ease-out sm:max-w-md fixed top-1/2 left-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 outline-none">
				{/* Copied from `DialogContent`'s close button — real `Button`/`IconX`, not portal-bound. */}
				<Button variant="ghost" className="absolute top-4 right-4" size="icon" type="button" onClick={() => {}}>
					<IconX />
					<span className="sr-only">{t('common.close')}</span>
				</Button>
				{/* Copied from `DialogHeader`. */}
				<div className="gap-2 flex flex-col">
					{/* `h2`/`p` in place of `DialogTitle`/`DialogDescription` (canon 11) — classes copied
					    verbatim from `dialog.tsx`. */}
					<h2 className="text-lg leading-snug font-semibold">{t('workspaces.addTitle')}</h2>
					<p className="text-muted-foreground *:[a]:text-secondary-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3">
						{t('workspaces.addDescription')}
					</p>
				</div>
				{/* Real `Field`/`FieldLabel`/`Input`/`Button` — not Dialog-context bound, so reused as-is
				    (mirrors `AddWorkspaceForm`'s field row). Uncontrolled + inert: this panel is a static
				    screenshot fixture (canon 11), not the live form. */}
				<Field>
					<FieldLabel htmlFor="add-workspace-path">{t('workspaces.projectFolder')}</FieldLabel>
					<div className="flex gap-2">
						<Input id="add-workspace-path" className="font-mono" placeholder={t('workspaces.pathPlaceholder')} readOnly />
						<Button type="button" variant="ghost" onClick={() => {}}>
							<IconFolderOpen data-icon="inline-start" /> {t('workspaces.browse')}
						</Button>
					</div>
				</Field>
				{/* Copied from `DialogFooter`, including `AddWorkspaceForm`'s own `className="mt-4"`. */}
				<div className="bg-muted/40 -mx-6 -mb-6 rounded-b-2xl border-t border-border p-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-4">
					{/* No-op onClick, not `disabled`: `disabled` would apply `disabled:opacity-50`, dimming
					    the buttons against the target, which shows them fully enabled (`local/button-needs-
					    handler` still requires a handler on a real `Button`). */}
					<Button type="button" variant="outline" onClick={() => {}}>
						{t('common.cancel')}
					</Button>
					<Button type="button" onClick={() => {}}>
						{t('workspaces.addFolder')}
					</Button>
				</div>
			</div>
		</div>
	)
}

const meta = {
	title: 'Workspaces/AddWorkspace (Fidelity)',
	component: AddWorkspacePanel,
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
} satisfies Meta<typeof AddWorkspacePanel>
export default meta

type Story = StoryObj<typeof meta>

/**
 * `projetos-adicionar-group` — the "Adicionar um espaço de trabalho" dialog open over the loaded
 * project grid, measured against `design/fidelity/targets/screens/projetos-adicionar-group.png`
 * via `bun fidelity`. Background is the ROUTE'S REAL composition (`WorkspacesSection` inside
 * `AppScreenFrame`); the dialog itself is the static panel documented on `AddWorkspacePanel` above
 * (no portal-capture gap — this story renders the actual DOM the screenshot needs).
 */
export const Full: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'projetos-adicionar-group', kind: 'screens', viewport: { width: 1440, height: 900 } },
	},
	render: () => (
		<AppScreenFrame>
			<WorkspacesSection />
			<AddWorkspacePanel />
		</AppScreenFrame>
	),
}
