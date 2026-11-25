import { useEffect, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconLinkOff } from '@tabler/icons-react'
import { useGetPanelBoard } from '@codm/client-typescript/typescript-cloud'
import { Button } from '@codm/app-ui/button'
import { Dialog } from '@codm/app-ui/dialog'
import { Empty, EmptyDescription, EmptyTitle } from '@codm/app-ui/empty'
import { Skeleton } from '@codm/app-ui/skeleton'
import { cn } from '@/lib/utils'
import { useDialogStore } from '@/stores/useDialogStore'
import { BatchDialog } from './BatchDialog'
import { PanelBoard } from './PanelBoard'
import { PanelTask } from './PanelTask'
import { errorStatusOf } from './panelErrors'
import { clearHash, hashTarget, usePanelHash, type HashTarget } from './panelHash'
import { PanelTokenProvider, usePanelToken } from './panelToken'

/**
 * THE CLOUD PANEL (spec `.specs/2026-11-24-tarefa-e-painel-design.md` §5) — the page a group's link opens,
 * built from the same components as the desktop: the kanban by live state, the task as one conversation, the
 * same ask cards. The token addresses every read and action; the hash says what is open (`#APP-12`, `#L-31`).
 */
export function PanelApp({ token }: { token: string }) {
	return (
		<PanelTokenProvider token={token}>
			<PanelScreen />
		</PanelTokenProvider>
	)
}

function PanelScreen({ className, ...props }: ComponentProps<'div'>) {
	const token = usePanelToken()
	// RE-READ EVERY 15 s (spec 13/11, review L9): the panel has no event stream — the cloud learns what the daemon
	// did on its next sync — so the board is asked again on a fixed beat, the same mechanism the old page had.
	const { data: board, error } = useGetPanelBoard(token, { query: { refetchInterval: 15_000 } })
	const hash = usePanelHash()
	const target = hashTarget(hash, board)
	useDocumentTitle(board?.group.name)
	useBatchFromHash(target)

	// One answer for every way a link can be wrong (an unknown token, a rotated one): the board says 404.
	// (No token in the address at all reads the same way.)
	if (!token || errorStatusOf(error) === 404) return <InvalidLink />
	if (!board) return error ? <PanelUnavailable /> : <PanelLoading />

	return (
		<div className={cn('h-full overflow-y-auto bg-background text-foreground', className)} {...props}>
			{target.kind === 'task' ? <PanelTask key={target.issue.issueId} issueId={target.issue.issueId} /> : <PanelBoard />}
			<PanelDialogHost closesHash={target.kind === 'batch'} />
		</div>
	)
}

/**
 * The panel's OWN host of `useDialogStore` (the desktop mounts its host in the `(app)` layout, which the panel
 * never loads). Closing a batch by hand also drops its `#L-n` from the address — the hash is what opened it.
 */
function PanelDialogHost({ closesHash }: { closesHash: boolean }) {
	const { content, open, hide } = useDialogStore()
	return (
		<Dialog
			open={open}
			onOpenChange={isOpen => {
				if (isOpen) return
				hide()
				if (closesHash) clearHash()
			}}
		>
			{content}
		</Dialog>
	)
}

/** A `#L-n` the board lists opens that batch's dialog (once per code). */
function useBatchFromHash(target: HashTarget) {
	const show = useDialogStore(state => state.show)
	const code = target.kind === 'batch' ? target.batch.code : undefined
	useEffect(() => {
		if (code) show(<BatchDialog code={code} />)
	}, [code, show])
}

/** "<grupo> · tarefas" in the tab, as the old page did. */
function useDocumentTitle(group: string | undefined) {
	const { t } = useTranslation()
	useEffect(() => {
		if (group) document.title = t('panel.title', { group })
	}, [group, t])
}

function PanelLoading({ className, ...props }: ComponentProps<'div'>) {
	return (
		<div className={cn('flex h-full flex-col gap-4 p-4 md:p-6', className)} {...props}>
			<Skeleton className="h-10 w-64" />
			<div className="flex min-h-0 flex-1 gap-3">
				<Skeleton className="h-full flex-1 rounded-asymmetric-md" />
				<Skeleton className="hidden h-full flex-1 rounded-asymmetric-md md:block" />
				<Skeleton className="hidden h-full flex-1 rounded-asymmetric-md md:block" />
			</div>
		</div>
	)
}

/** An invalid link renders nothing of anybody's — the same empty page for every way a link can be wrong. */
function InvalidLink({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	return (
		<div data-testid="panel-invalid-link" className={cn('flex h-full items-center justify-center p-6', className)} {...props}>
			<Empty>
				<IconLinkOff className="size-8 text-muted-foreground" />
				<EmptyTitle>{t('panel.invalidLink.title')}</EmptyTitle>
				<EmptyDescription>{t('panel.invalidLink.description')}</EmptyDescription>
			</Empty>
		</div>
	)
}

/** The cloud did not answer (not a wrong link): say so, and let the person ask again. */
function PanelUnavailable({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	return (
		<div className={cn('flex h-full items-center justify-center p-6', className)} {...props}>
			<Empty>
				<EmptyTitle>{t('panel.unavailable.title')}</EmptyTitle>
				<EmptyDescription>{t('panel.unavailable.description')}</EmptyDescription>
				<Button variant="outline" size="sm" onClick={() => window.location.reload()}>
					{t('common.retry')}
				</Button>
			</Empty>
		</div>
	)
}
