import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { useTranslation } from 'react-i18next'
import { IconTrash } from '@tabler/icons-react'
import { getNeedsYouPanelQueryOptions, getSessionChatQueryOptions, listArtifactsQueryOptions } from '@codm/client-typescript/typescript'
import type { GetSessionChatQueryResponse } from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { Button } from '@codm/app-ui/button'
import { AppScreenFrame, connected, mockQuery } from '@/storybook'
import { SessionHeader } from './-components/SessionHeader'
import { SessionChatSection } from './-components/SessionChatSection'

const THREAD_ID = '019e4d24-6524-7041-9e1c-8108180cddae'

/**
 * Same three-message background as `thread-config.stories.tsx` (screens 02/03) — one shared
 * reproduction of the Chat tab's content across every dialog screen in this wave, reproduced from
 * `design/fidelity/targets/screens/screen-04-apagar-conversa.png` / `screen-02-configuracoes-da-
 * conversa.png` (the same rows, this target just dims them less).
 */
const SESSION: DeepPartial<GetSessionChatQueryResponse> = {
	thread: {
		threadId: THREAD_ID,
		displayName: 'DEMO SHOP BOT',
		channelId: 'channel-1',
		externalId: '5511900000005',
		hasAvatar: false,
		channelKind: 'WHATSAPP',
		workspacePath: '/Users/work/Desktop/Projetos/aurora-labs',
		providers: ['CLAUDE_CODE'],
		status: 'RUNNING',
		lastActivity: new Date().toISOString(),
	},
	paused: false,
	mentionGate: { enabled: true, tag: '@aurora' },
	composerMode: 'DIRECT',
	activeStops: [],
	transcript: [
		{
			entryId: '019e4d24-6524-7041-9e1c-8108180cdd10',
			kind: 'CONTACT',
			text: '@aurora o deploy de ontem subiu com o rate limit novo?',
			at: '2026-08-06T09:12:00.000Z',
			sender: { channelId: 'channel-1', externalId: '5511900000003', displayName: 'Thiago Barros', hasAvatar: false },
		},
		{
			entryId: '019e4d24-6524-7041-9e1c-8108180cdd11',
			kind: 'DIRECT',
			text: 'Subiu. O provedor de faturas passou a exigir janela de 60s entre lotes — abri a tarefa invoice-500 e parei aguardando você.',
			at: '2026-08-06T09:12:30.000Z',
		},
		{
			entryId: '019e4d24-6524-7041-9e1c-8108180cdd12',
			kind: 'CONTACT',
			text: '@aurora assume a invoice-500',
			at: '2026-08-06T09:13:00.000Z',
			sender: { channelId: 'channel-1', externalId: '5511900000004', displayName: 'Diego Martins', hasAvatar: false },
		},
	],
}

/**
 * The STATIC PANEL (UI-FIDELITY.md canon 11): `ConfirmDialog` (`@codm/app-ui/confirm-dialog.tsx`)
 * always renders through `DialogContent`, which always wraps its children in Base UI's
 * `Dialog.Portal` — no `container` override exists anywhere in this codebase — so the live component
 * (`useDialogStore().confirm({...})`, which is what `ThreadSettingsDialog`'s `DangerZone` actually
 * calls) would portal to `document.body`, outside `#storybook-root`, and `bun fidelity`'s
 * `kind: 'screens'` capture (`root.screenshot()`) would miss it entirely.
 *
 * Unlike `thread-config.stories.tsx`'s gap (ThreadSettingsDialog's sections are private, six of
 * them, and out of this task's scope), `ConfirmDialog` is small, has no business logic (no query, no
 * mutation — `onConfirm`/`onCancel` are the caller's), and lives in the shared primitive layer, not
 * behind the Conversa area's file boundary. Reproducing it here is the technique canon 11 prescribes:
 * SAME classes as `DialogOverlay` / `DialogContent` / `DialogHeader` / `DialogFooter`
 * (`@codm/app-ui/dialog.tsx`) and `ConfirmDialog`'s own badge+icon, copied verbatim (never
 * approximated — "o padrão vence o pixel"), with `h2`/`p` standing in for `DialogTitle`/
 * `DialogDescription` because those Base UI primitives require a `Dialog.Root` ancestor and would
 * throw outside one. `Button` is reused directly — it isn't portalized, so nothing is lost reusing
 * the real primitive. Content (title/description/labels) goes through the SAME i18n keys the real
 * `DangerZone.onDelete` confirm() call uses (`session.deleteThread.*`, `common.cancel`), not inlined
 * literals, so a copy change to the real flow updates this reproduction for free.
 *
 * `position: fixed` here is NOT clipped by `AppScreenFrame`'s `overflow-hidden` (fixed positions
 * against the viewport, not the nearest scroll ancestor) — but because this panel is a DOM
 * descendant of `#storybook-root` (never portaled), Playwright's `elementHandle.screenshot()` still
 * captures it correctly within that element's box, which is what makes this technique work at all.
 */
function DeleteConversationPanel({ threadName, className, ...props }: ComponentProps<'div'> & { threadName: string }) {
	const { t } = useTranslation()
	return (
		<div {...props}>
			{/* Copied from `DialogOverlay` — the `data-open`/animation modifiers are dropped (static
			    reproduction, always "open"), the rest of the class list is verbatim. */}
			<div className="bg-foreground/70 fixed inset-0 isolate z-50" />
			{/* Copied from `DialogContent`'s `DialogPrimitive.Popup` className — animation/data-state
			    modifiers dropped for the same reason. */}
			<div className="bg-background border border-border shadow-modal grid max-w-[calc(100%-2rem)] gap-4 rounded-asymmetric-xl overflow-hidden p-6 text-sm sm:max-w-md fixed top-1/2 left-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 outline-none">
				{/* Copied from `DialogHeader`. */}
				<div className="gap-2 flex flex-col">
					{/* Copied from `ConfirmDialog`'s destructive badge. */}
					<span className="flex size-11 items-center justify-center rounded-asymmetric-sm bg-attention-surface text-destructive">
						<IconTrash className="size-5" />
					</span>
					{/* `h2`/`p` in place of `DialogTitle`/`DialogDescription` (canon 11) — classes copied verbatim
					    from `dialog.tsx`. */}
					<h2 className="text-lg leading-snug font-semibold">{t('session.deleteThread.confirmTitle')}</h2>
					<p className="text-muted-foreground *:[a]:text-secondary-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3">
						{t('session.deleteThread.confirmDescription', { name: threadName })}
					</p>
				</div>
				{/* Copied from `DialogFooter`. */}
				<div className="bg-muted/40 -mx-6 -mb-6 rounded-b-2xl border-t border-border p-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					{/* No-op onClick, not `disabled`: this panel is a static screenshot fixture (canon 11), and
					    `disabled` would apply `disabled:opacity-50` — dimming the button against the target,
					    which shows it fully enabled. `onClick` also satisfies `local/button-needs-handler`
					    (a real Button intentionally left inert is still a defect the rule should catch). */}
					<Button variant="outline" onClick={() => {}}>
						{t('common.cancel')}
					</Button>
					<Button variant="destructive" onClick={() => {}}>
						{t('session.deleteThread.confirmAction')}
					</Button>
				</div>
			</div>
		</div>
	)
}

const meta = {
	title: 'Session/DeleteConversation (Fidelity)',
	component: DeleteConversationPanel,
	args: { threadName: 'DEMO SHOP BOT' },
	parameters: connected({
		route: { id: '/(app)/threads/$threadId/' },
		msw: {
			handlers: [
				mockQuery(getSessionChatQueryOptions(THREAD_ID), SESSION),
				mockQuery(getNeedsYouPanelQueryOptions(THREAD_ID), { stops: [] }),
				mockQuery(listArtifactsQueryOptions(THREAD_ID), { artifacts: [] }),
			],
		},
	}),
} satisfies Meta<typeof DeleteConversationPanel>
export default meta

type Story = StoryObj<typeof meta>

/**
 * Screen — 04 · Apagar conversa (F3-waveA A3), measured against
 * `design/fidelity/targets/screens/screen-04-apagar-conversa.png` via `bun fidelity`.
 *
 * The confirmation the real `DangerZone.onDelete` (`-components/ThreadSettingsDialog/index.tsx`)
 * raises via `useDialogStore().confirm({...})` over the Chat tab — reproduced statically per the
 * docblock on `DeleteConversationPanel` above. No portal-capture gap here (unlike the two
 * `thread-config.stories.tsx` stories): this story renders the actual DOM the screenshot needs.
 */
export const Full: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'screen-04-apagar-conversa', kind: 'screens', viewport: { width: 1440, height: 900 } },
	},
	render: args => (
		<AppScreenFrame>
			<div className="mx-auto flex h-full w-full flex-col gap-2 px-6">
				<SessionHeader threadId={THREAD_ID} />
				<SessionChatSection threadId={THREAD_ID} />
			</div>
			<DeleteConversationPanel threadName={args.threadName} />
		</AppScreenFrame>
	),
}
